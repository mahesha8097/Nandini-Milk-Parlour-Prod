require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function reconcileAll() {
  const client = await pool.connect();
  try {
    console.log('=== STARTING UNIVERSAL CUSTOMER BALANCE RECONCILIATION ===');
    await client.query('BEGIN');

    const custs = (await client.query('SELECT * FROM customers ORDER BY id ASC')).rows;
    const pmts = (await client.query('SELECT * FROM payments WHERE (is_deleted = 0 OR is_deleted IS NULL) ORDER BY id ASC')).rows;
    const bills = (await client.query("SELECT * FROM bills WHERE status != 'CANCELLED' ORDER BY id ASC")).rows;
    const ledger = (await client.query("SELECT * FROM customer_ledger ORDER BY customer_id ASC, id ASC")).rows;

    const pmtsByCust = {};
    for (const p of pmts) {
      if (!pmtsByCust[p.customer_id]) pmtsByCust[p.customer_id] = [];
      pmtsByCust[p.customer_id].push(p);
    }

    const billsByCust = {};
    for (const b of bills) {
      if (!billsByCust[b.customer_id]) billsByCust[b.customer_id] = [];
      billsByCust[b.customer_id].push(b);
    }

    const ledgerByCust = {};
    for (const l of ledger) {
      if (!ledgerByCust[l.customer_id]) ledgerByCust[l.customer_id] = [];
      ledgerByCust[l.customer_id].push(l);
    }

    let updatedCount = 0;
    const changes = [];

    for (const c of custs) {
      const cPmts = pmtsByCust[c.id] || [];
      const cBills = billsByCust[c.id] || [];
      const cLedger = ledgerByCust[c.id] || [];

      let correctAdv = 0;
      let correctPend = 0;

      // 1. Calculate genuine unpaid bills sum
      let unpaidBillsSum = 0;
      for (const b of cBills) {
        const net = Number(b.net_payable || 0);
        const paid = Number(b.paid_amount || 0);
        if (net > paid) {
          unpaidBillsSum += (net - paid);
        }
      }
      unpaidBillsSum = parseFloat(unpaidBillsSum.toFixed(2));

      // 2. Determine balance by customer type
      if (c.billing_type === 'COUPON') {
        correctPend = unpaidBillsSum;
        correctAdv = 0;
      } else if (c.billing_type === 'POSTPAID' || c.billing_type === 'WEEKLY' || c.billing_type === 'DAILY') {
        correctPend = unpaidBillsSum;
        let advanceDeposit = 0;
        for (const p of cPmts) {
          if (p.payment_type === 'ADVANCE_PAYMENT' && !p.bill_id && !p.notes?.toLowerCase().includes('settling bill') && !p.notes?.toLowerCase().includes('coupon book')) {
            advanceDeposit += Number(p.amount);
          }
        }
        correctAdv = advanceDeposit;
      } else {
        // PREPAID
        correctPend = unpaidBillsSum;

        const validPmts = cPmts.filter(p => !p.notes?.toLowerCase().includes('coupon book'));
        const totalPaid = validPmts.reduce((sum, p) => sum + Number(p.amount), 0);

        let initAdv = 0;
        const initL = cLedger.find(l => l.reference_id === 'INIT');
        if (initL) {
          initAdv = Number(initL.credit || initL.advance_balance_after || 0);
        } else if (c.id >= 419 && c.id <= 650 && totalPaid === 0 && Number(c.advance_balance) === 500) {
          initAdv = 500;
        }

        if (totalPaid > 0) {
          const pastBills = cBills.filter(b => b.status === 'ADVANCE_PAID' && Number(b.advance_adjusted) > 0 && b.billing_month < '2026-11');
          const pastAdvConsumed = pastBills.reduce((sum, b) => sum + Number(b.advance_adjusted), 0);
          
          if (pastAdvConsumed > 0) {
            correctAdv = Math.max(0, parseFloat((totalPaid + initAdv - pastAdvConsumed).toFixed(2)));
          } else {
            const novPmts = validPmts.filter(p => p.payment_date >= '2026-11-01');
            if (novPmts.length > 0) {
              correctAdv = novPmts.reduce((sum, p) => sum + Number(p.amount), 0);
            } else {
              correctAdv = totalPaid + initAdv;
            }
          }
        } else {
          correctAdv = initAdv;
        }
      }

      correctAdv = parseFloat(correctAdv.toFixed(2));
      correctPend = parseFloat(correctPend.toFixed(2));

      const oldAdv = Number(c.advance_balance || 0);
      const oldPend = Number(c.pending_balance || 0);

      if (oldAdv !== correctAdv || oldPend !== correctPend) {
        await client.query(`
          UPDATE customers 
          SET advance_balance = $1, pending_balance = $2, updated_at = NOW()
          WHERE id = $3
        `, [correctAdv, correctPend, c.id]);

        updatedCount++;
        changes.push({
          id: c.id,
          name: c.name,
          type: c.billing_type,
          old_adv: oldAdv,
          new_adv: correctAdv,
          old_pend: oldPend,
          new_pend: correctPend
        });
      }
    }

    await client.query('COMMIT');
    console.log(`\nReconciliation successfully completed! Updated ${updatedCount} customers.`);
    console.table(changes);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during reconciliation:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

reconcileAll();

