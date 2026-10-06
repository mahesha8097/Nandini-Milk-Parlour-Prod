const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const {
  generateAdvanceBillForPrepaidCustomer,
  generatePostpaidBill,
  runMonthlyBillGeneration
} = require('../services/billingService');

// Get bills (Admin only - filtered by month, customer_id, status, billing_type)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { month, customer_id, status, billing_type } = req.query;

    let query = `
      SELECT b.*, c.name as customer_name, c.phone as customer_phone,
             c.address as customer_address, c.customer_category, c.route,
             c.advance_balance as customer_advance_balance, c.pending_balance as customer_pending_balance
      FROM bills b
      JOIN customers c ON b.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (month) {
      query += ` AND b.billing_month = ?`;
      params.push(month);
    }

    if (customer_id) {
      query += ` AND b.customer_id = ?`;
      params.push(customer_id);
    }

    if (status) {
      query += ` AND b.status = ?`;
      params.push(status);
    }

    if (billing_type) {
      query += ` AND b.billing_type = ?`;
      params.push(billing_type);
    }

    query += ` ORDER BY b.billing_month DESC, b.id DESC`;

    const bills = await db.prepare(query).all(...params);
    res.json(bills);
  } catch (err) {
    console.error('Fetch bills error:', err);
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
});

// Advance Monthly Bill Calculation Preview (Admin only - pre-calculates without saving)
router.get('/advance-preview', requireAdmin, async (req, res) => {
  try {
    const { month } = req.query;
    const targetMonth = month || new Date().toISOString().slice(0, 7);
    const { calculateAdvanceProjectionForMonth } = require('../services/billingService');
    const result = await calculateAdvanceProjectionForMonth(targetMonth);
    res.json(result);
  } catch (err) {
    console.error('Advance preview error:', err);
    res.status(500).json({ error: err.message || 'Failed to calculate advance preview' });
  }
});

// Generate advance monthly bills for all prepaid/advance customers (Admin only)
router.post('/generate-advance-monthly', requireAdmin, async (req, res) => {
  try {
    const { month, forceRegenerate } = req.body;
    const targetMonth = month || new Date().toISOString().slice(0, 7);
    const { runMonthlyBillGeneration } = require('../services/billingService');
    const result = await runMonthlyBillGeneration(targetMonth, {
      forceRegenerate: Boolean(forceRegenerate),
      billingBasis: 'SUBSCRIPTION'
    });
    res.json({
      message: `Advance monthly bills generated for ${targetMonth}`,
      summary: result
    });
  } catch (err) {
    console.error('Generate advance monthly bills error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate advance monthly bills' });
  }
});

// Get single bill with invoice details and business profile (Admin only)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const bill = await db.prepare(`
      SELECT b.*, c.name as customer_name, c.phone as customer_phone,
             c.address as customer_address, c.customer_category, c.route,
             c.advance_balance as customer_advance_balance, c.pending_balance as customer_pending_balance
      FROM bills b
      JOIN customers c ON b.customer_id = c.id
      WHERE b.id = ?
    `).get(req.params.id);

    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const businessProfile = await db.prepare('SELECT * FROM business_profile WHERE id = 1').get();
    let parsedItems = [];
    try {
      parsedItems = JSON.parse(bill.items_json || '[]');
    } catch (e) {
      parsedItems = [];
    }

    res.json({
      bill,
      items: parsedItems,
      businessProfile
    });
  } catch (err) {
    console.error('Fetch bill error:', err);
    res.status(500).json({ error: 'Failed to fetch bill' });
  }
});

// Trigger automated monthly bill generation (Admin only)
router.post('/generate-monthly', requireAdmin, async (req, res) => {
  try {
    const { month, forceRegenerate, billingBasis } = req.body; // e.g. "2026-10", billingBasis: 'DELIVERIES' | 'SUBSCRIPTION' | 'AUTO'
    const targetMonth = month || new Date().toISOString().slice(0, 7);

    const { runMonthlyBillGeneration } = require('../services/billingService');
    const result = await runMonthlyBillGeneration(targetMonth, {
      forceRegenerate: Boolean(forceRegenerate),
      billingBasis: billingBasis || 'AUTO'
    });
    res.json({
      message: `Monthly bill generation completed for ${targetMonth}`,
      summary: result
    });
  } catch (err) {
    console.error('Generate monthly bills error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate monthly bills' });
  }
});

// Generate bill for a single customer (Admin only)
router.post('/generate-single', requireAdmin, async (req, res) => {
  try {
    const { customer_id, month, forceRegenerate, billingBasis } = req.body;
    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const targetMonth = month || new Date().toISOString().slice(0, 7);
    const { generateBillForCustomer } = require('../services/billingService');

    const bill = await generateBillForCustomer(customer, targetMonth, {
      billingBasis: billingBasis || 'AUTO',
      forceRegenerate: Boolean(forceRegenerate)
    });

    if (!bill) {
      return res.status(400).json({ error: 'No active subscriptions or delivered records found to generate bill' });
    }

    res.json(bill);
  } catch (err) {
    console.error('Single bill generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate bill' });
  }
});

// Recalculate / Regenerate an existing bill with latest subscriptions/deliveries (Admin only)
router.post('/:id/regenerate', requireAdmin, async (req, res) => {
  try {
    const billId = req.params.id;
    const { billingBasis } = req.body;
    const { recalculateSingleBill } = require('../services/billingService');
    const updatedBill = await recalculateSingleBill(billId, billingBasis || 'AUTO');
    res.json({
      message: 'Bill successfully recalculated and updated against customer advance balance',
      bill: updatedBill
    });
  } catch (err) {
    console.error('Regenerate bill error:', err);
    res.status(500).json({ error: err.message || 'Failed to regenerate bill' });
  }
});

// Cancel a bill (Admin only)
router.post('/:id/cancel', requireAdmin, async (req, res) => {
  try {
    const billId = req.params.id;
    const { reason } = req.body;

    const bill = await db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    if (bill.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Bill is already cancelled' });
    }

    // Revert customer pending balance if applicable
    if (bill.net_payable > 0) {
      const unpaid = Math.max(0, bill.net_payable - bill.paid_amount);
      await db.prepare(`
        UPDATE customers
        SET pending_balance = MAX(0, pending_balance - ?), updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(unpaid, bill.customer_id);
    }

    await db.prepare(`
      UPDATE bills
      SET status = 'CANCELLED', notes = notes || ' [Cancelled: ' || ? || ']', updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(reason || 'Cancelled by Admin', billId);

    // Ledger log
    await db.prepare(`
      INSERT INTO customer_ledger (
        customer_id, transaction_date, transaction_type, reference_id, debit, credit,
        advance_balance_after, pending_balance_after, description, created_at
      )
      SELECT id, date('now', 'localtime'), 'ADJUSTMENT', ?, 0, 0, advance_balance, pending_balance, ?, datetime('now', 'localtime')
      FROM customers WHERE id = ?
    `).run(`CANCEL-${billId}`, `Cancelled Bill #${bill.bill_number}`, bill.customer_id);

    res.json({ message: 'Bill cancelled successfully' });
  } catch (err) {
    console.error('Cancel bill error:', err);
    res.status(500).json({ error: 'Failed to cancel bill' });
  }
});

module.exports = router;
