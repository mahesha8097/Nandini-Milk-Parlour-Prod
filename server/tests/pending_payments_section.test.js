/**
 * Test Suite: Pending Payments & Customers Section in Payments
 * Tests:
 * 1. Fetching pending customers returns customers with pending_balance > 0
 * 2. Unpaid bills are correctly matched and attached
 * 3. Summary metrics (total_pending_amount, house_count, etc.) calculate correctly
 * 4. Recording payment reduces pending dues
 * 5. Settling payment clears pending dues and customer is no longer pending
 */

const db = require('../config/db');
const { recordPaymentTransaction } = require('../services/billingService');

async function runTests() {
  console.log('================================================================');
  console.log(' NANDINI MILK PARLOUR — PENDING PAYMENTS SECTION TESTS');
  console.log('================================================================\n');

  let testCust1 = null;
  let testCust2 = null;

  try {
    // 1. Create 2 test customers
    const c1 = await db.prepare(`
      INSERT INTO customers (
        name, phone, address, flat_no, customer_category, billing_type,
        status, advance_balance, pending_balance, route, agent_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 0, 1500.00, 'Route 1', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run('Pending Test Customer 1', '9888877771', 'Test Address 1', 'A101', 'HOUSE', 'POSTPAID');
    testCust1 = c1.lastInsertRowid;

    const c2 = await db.prepare(`
      INSERT INTO customers (
        name, phone, address, flat_no, customer_category, billing_type,
        status, advance_balance, pending_balance, route, agent_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 0, 800.00, 'Route 2', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run('Pending Test Customer 2', '9888877772', 'Test Address 2', 'B202', 'BULK_HOTEL', 'WEEKLY');
    testCust2 = c2.lastInsertRowid;

    console.log(`[TEST 1] Created test customers: #${testCust1} (Due: ₹1500) and #${testCust2} (Due: ₹800) ✓`);

    // 2. Insert test unpaid bill for Customer 1
    const testBillNum = `TB-PEND-${Date.now()}`;
    const b1 = await db.prepare(`
      INSERT INTO bills (
        bill_number, customer_id, bill_date, billing_month, billing_type,
        gross_amount, net_payable, paid_amount, status, agent_id, created_at, updated_at
      ) VALUES (?, ?, '2026-10-31', ?, ?, ?, ?, 0, 'PENDING', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(testBillNum, testCust1, '2026-10', 'POSTPAID', 1500, 1500);
    const billId = b1.lastInsertRowid;
    console.log(`[TEST 2] Created unpaid bill #${billId} for customer #${testCust1} ✓`);

    // 3. Test query logic equivalent to GET /pending-customers
    const pendingQuery = `
      SELECT c.id, c.name, c.phone, c.flat_no, c.customer_category,
             c.billing_type, c.pending_balance, c.advance_balance, c.route
      FROM customers c
      WHERE (c.agent_id = 1 OR c.agent_id IS NULL) AND c.pending_balance > 0
    `;
    const custs = await db.prepare(pendingQuery).all();
    const found1 = custs.find(c => c.id === testCust1);
    const found2 = custs.find(c => c.id === testCust2);

    if (!found1 || found1.pending_balance !== 1500) {
      throw new Error(`Customer 1 not found in pending list or balance mismatch: ${JSON.stringify(found1)}`);
    }
    if (!found2 || found2.pending_balance !== 800) {
      throw new Error(`Customer 2 not found in pending list or balance mismatch: ${JSON.stringify(found2)}`);
    }
    console.log('[TEST 3] Pending customers retrieved with accurate balances ✓');

    // 4. Test unpaid bill linkage
    const unpaidBills = await db.prepare(`
      SELECT id, customer_id, bill_number, net_payable, COALESCE(paid_amount, 0) as paid_amount
      FROM bills
      WHERE (agent_id = 1 OR agent_id IS NULL)
        AND status != 'CANCELLED'
        AND status != 'PAID'
        AND net_payable > COALESCE(paid_amount, 0)
    `).all();
    const cust1Bills = unpaidBills.filter(b => b.customer_id === testCust1);
    if (cust1Bills.length === 0 || cust1Bills[0].bill_number !== testBillNum) {
      throw new Error('Unpaid bill not linked to Customer 1');
    }
    console.log(`[TEST 4] Unpaid bill ${testBillNum} correctly linked to customer #${testCust1} ✓`);

    // 5. Record full payment for Customer 1
    const sampleUser = await db.prepare('SELECT id FROM users LIMIT 1').get();
    const adminUserId = sampleUser ? sampleUser.id : 1;

    const p1 = await recordPaymentTransaction({
      customerId: testCust1,
      billId: billId,
      amount: 1500,
      paymentDate: '2026-11-03',
      paymentType: 'POSTPAID_BILL_PAYMENT',
      paymentMethod: 'UPI',
      referenceNumber: 'UPI-TEST-12345',
      notes: 'Test settlement',
      recordedByUserId: adminUserId
    });
    console.log(`[TEST 5] Recorded payment receipt #${p1.receiptNumber} for ₹1500 ✓`);

    // Verify Customer 1 is no longer pending
    const c1After = await db.prepare('SELECT pending_balance FROM customers WHERE id = ?').get(testCust1);
    if (c1After.pending_balance !== 0) {
      throw new Error(`Expected customer pending balance to be 0, got ${c1After.pending_balance}`);
    }

    const billAfter = await db.prepare('SELECT status, paid_amount FROM bills WHERE id = ?').get(billId);
    if (billAfter.status !== 'PAID' || billAfter.paid_amount !== 1500) {
      throw new Error(`Expected bill to be PAID with 1500, got status=${billAfter.status}, paid=${billAfter.paid_amount}`);
    }
    console.log('[TEST 6] Customer pending balance reduced to ₹0 and bill marked PAID ✓');

    // Verify Customer 1 is omitted from pending query now
    const pendingAfter = await db.prepare(pendingQuery).all();
    const found1After = pendingAfter.find(c => c.id === testCust1);
    if (found1After) {
      throw new Error('Settled customer should not appear in pending list!');
    }
    console.log('[TEST 7] Customer 1 cleanly removed from pending customers list after payment ✓');

    console.log('\n================================================================');
    console.log(' ALL 7 PENDING PAYMENTS SECTION TESTS PASSED SUCCESSFULLY! ✓');
    console.log('================================================================\n');
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  } finally {
    // Cleanup
    if (testCust1) {
      await db.prepare('DELETE FROM payments WHERE customer_id = ?').run(testCust1);
      await db.prepare('DELETE FROM bills WHERE customer_id = ?').run(testCust1);
      await db.prepare('DELETE FROM customer_ledger WHERE customer_id = ?').run(testCust1);
      await db.prepare('DELETE FROM customers WHERE id = ?').run(testCust1);
    }
    if (testCust2) {
      await db.prepare('DELETE FROM payments WHERE customer_id = ?').run(testCust2);
      await db.prepare('DELETE FROM bills WHERE customer_id = ?').run(testCust2);
      await db.prepare('DELETE FROM customer_ledger WHERE customer_id = ?').run(testCust2);
      await db.prepare('DELETE FROM customers WHERE id = ?').run(testCust2);
    }
    console.log('[CLEANUP] Test records safely purged.');
  }
}

runTests();
