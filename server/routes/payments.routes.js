const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin, verifyToken } = require('../middleware/auth');
const { 
  recordPaymentTransaction,
  updatePaymentTransaction,
  deletePaymentTransaction,
  restorePaymentTransaction,
  permanentlyDeletePayment
} = require('../services/billingService');

// Get all payments (Admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { customer_id, startDate, endDate, paymentMethod, paymentType } = req.query;

    let query = `
      SELECT p.*, c.name as customer_name, c.phone as customer_phone,
             c.customer_category, u.name as recorded_by_name
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      LEFT JOIN users u ON p.recorded_by_user_id = u.id
      WHERE (p.agent_id = ? OR c.agent_id = ?) AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
    `;
    const agentId = req.agentId || 1;
    const params = [agentId, agentId];

    if (customer_id) {
      query += ` AND p.customer_id = ?`;
      params.push(customer_id);
    }

    if (startDate) {
      query += ` AND p.payment_date >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND p.payment_date <= ?`;
      params.push(endDate);
    }

    if (paymentMethod) {
      query += ` AND p.payment_method = ?`;
      params.push(paymentMethod);
    }

    if (paymentType) {
      if (paymentType === 'DAILY_PAYMENT' || paymentType === 'DIRECT_PAYMENT') {
        query += ` AND p.payment_type IN ('DAILY_PAYMENT', 'DIRECT_PAYMENT')`;
      } else {
        query += ` AND p.payment_type = ?`;
        params.push(paymentType);
      }
    }

    query += ` ORDER BY p.payment_date DESC, p.id DESC`;

    const payments = await db.prepare(query).all(...params);
    res.json(payments);
  } catch (err) {
    console.error('Fetch payments error:', err);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Get all customers with pending dues and their active unpaid bills (Admin only)
router.get('/pending-customers', requireAdmin, async (req, res) => {
  try {
    const agentId = req.agentId || 1;
    const { route, category, billing_type, search } = req.query;

    let query = `
      SELECT c.id, c.name, c.phone, c.flat_no, c.address, c.customer_category,
             c.billing_type, c.pending_balance, c.advance_balance, c.route,
             z.name as zone_name,
             u.name as delivery_boy_name
      FROM customers c
      LEFT JOIN zones z ON c.zone_id = z.id
      LEFT JOIN users u ON c.delivery_boy_id = u.id
      WHERE (c.agent_id = ? OR c.agent_id IS NULL)
        AND c.pending_balance > 0
    `;
    const params = [agentId];

    if (route) {
      query += ` AND c.route = ?`;
      params.push(route);
    }
    if (category) {
      query += ` AND c.customer_category = ?`;
      params.push(category);
    }
    if (billing_type) {
      query += ` AND c.billing_type = ?`;
      params.push(billing_type);
    }
    if (search) {
      query += ` AND (LOWER(c.name) LIKE ? OR c.phone LIKE ? OR LOWER(c.flat_no) LIKE ?)`;
      const term = `%${search.toLowerCase()}%`;
      params.push(term, term, term);
    }

    query += ` ORDER BY c.pending_balance DESC, c.name ASC`;

    const customers = await db.prepare(query).all(...params);

    // Fetch active unpaid bills for these customers to provide rich context
    const unpaidBills = await db.prepare(`
      SELECT id, customer_id, bill_number, billing_month, billing_type,
             start_date, end_date, gross_amount, net_payable,
             COALESCE(paid_amount, 0) as paid_amount, status
      FROM bills
      WHERE (agent_id = ? OR agent_id IS NULL)
        AND status != 'CANCELLED'
        AND status != 'PAID'
        AND net_payable > COALESCE(paid_amount, 0)
      ORDER BY id DESC
    `).all(agentId);

    const billsByCustomer = {};
    for (const b of unpaidBills) {
      if (!billsByCustomer[b.customer_id]) {
        billsByCustomer[b.customer_id] = [];
      }
      billsByCustomer[b.customer_id].push({
        id: b.id,
        bill_number: b.bill_number,
        billing_month: b.billing_month,
        period: b.billing_month || (b.start_date && b.end_date ? `${b.start_date} to ${b.end_date}` : ''),
        billing_type: b.billing_type,
        gross_amount: Number(b.gross_amount || 0),
        net_payable: Number(b.net_payable || 0),
        paid_amount: Number(b.paid_amount || 0),
        remaining_due: Math.max(0, parseFloat((Number(b.net_payable || 0) - Number(b.paid_amount || 0)).toFixed(2))),
        status: b.status
      });
    }

    const result = customers.map(c => ({
      ...c,
      pending_balance: Number(c.pending_balance || 0),
      advance_balance: Number(c.advance_balance || 0),
      unpaid_bills: billsByCustomer[c.id] || [],
      unpaid_bills_count: (billsByCustomer[c.id] || []).length
    }));

    // Summary metrics
    const totalPendingAmount = result.reduce((sum, c) => sum + c.pending_balance, 0);
    const totalCount = result.length;

    const routesSet = new Set();
    result.forEach(c => {
      if (c.route && c.route.trim()) routesSet.add(c.route.trim());
    });

    res.json({
      customers: result,
      summary: {
        total_pending_amount: parseFloat(totalPendingAmount.toFixed(2)),
        total_customers_count: totalCount,
        house_count: result.filter(c => c.customer_category === 'HOUSE').length,
        house_pending_amount: parseFloat(result.filter(c => c.customer_category === 'HOUSE').reduce((s, c) => s + c.pending_balance, 0).toFixed(2)),
        bulk_count: result.filter(c => c.customer_category !== 'HOUSE').length,
        bulk_pending_amount: parseFloat(result.filter(c => c.customer_category !== 'HOUSE').reduce((s, c) => s + c.pending_balance, 0).toFixed(2)),
        weekly_count: result.filter(c => c.billing_type === 'WEEKLY').length,
        weekly_pending_amount: parseFloat(result.filter(c => c.billing_type === 'WEEKLY').reduce((s, c) => s + c.pending_balance, 0).toFixed(2)),
        prepaid_count: result.filter(c => c.billing_type === 'PREPAID').length,
        prepaid_pending_amount: parseFloat(result.filter(c => c.billing_type === 'PREPAID').reduce((s, c) => s + c.pending_balance, 0).toFixed(2)),
        postpaid_count: result.filter(c => c.billing_type === 'POSTPAID').length,
        postpaid_pending_amount: parseFloat(result.filter(c => c.billing_type === 'POSTPAID').reduce((s, c) => s + c.pending_balance, 0).toFixed(2)),
        routes: Array.from(routesSet).sort()
      }
    });
  } catch (err) {
    console.error('Fetch pending customers error:', err);
    res.status(500).json({ error: 'Failed to fetch pending customers' });
  }
});

// Record new payment (Admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      customer_id,
      bill_id,
      payment_type,
      amount,
      payment_date,
      payment_method,
      reference_number,
      notes
    } = req.body;

    if (!customer_id || !amount || !payment_date || !payment_type || !payment_method) {
      return res.status(400).json({
        error: 'Customer, amount, payment date, payment type, and payment method are required'
      });
    }

    let effPaymentType = payment_type;
    if (effPaymentType === 'DAILY_PAYMENT') {
      effPaymentType = 'DIRECT_PAYMENT';
    }

    const paymentRecord = await recordPaymentTransaction({
      customerId: parseInt(customer_id),
      billId: bill_id ? parseInt(bill_id) : null,
      amount: parseFloat(amount),
      paymentDate: payment_date,
      paymentType: effPaymentType,
      paymentMethod: payment_method,
      referenceNumber: reference_number || '',
      notes: notes || '',
      recordedByUserId: req.user.id
    });

    res.status(201).json(paymentRecord);
  } catch (err) {
    console.error('Record payment error:', err);
    res.status(400).json({ error: err.message || 'Failed to record payment' });
  }
});

// Update / Correct an existing payment (Admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { amount, payment_date, payment_method, reference_number, notes } = req.body;
    if (!amount || !payment_date) {
      return res.status(400).json({ error: 'Payment amount and date are required' });
    }

    const updated = await updatePaymentTransaction(req.params.id, {
      amount: parseFloat(amount),
      paymentDate: payment_date,
      paymentMethod: payment_method,
      referenceNumber: reference_number,
      notes: notes,
      agentId: req.agentId || 1
    });

    res.json({
      message: 'Payment updated successfully',
      payment: updated
    });
  } catch (err) {
    console.error('Update payment error:', err);
    res.status(400).json({ error: err.message || 'Failed to update payment' });
  }
});

// Delete / Void an existing payment (Admin only) — soft delete with undo support
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await deletePaymentTransaction(req.params.id, req.agentId || 1);
    res.json(result);
  } catch (err) {
    console.error('Delete payment error:', err);
    res.status(400).json({ error: err.message || 'Failed to delete payment' });
  }
});

// Restore a soft-deleted payment (Admin only)
router.post('/:id/restore', requireAdmin, async (req, res) => {
  try {
    const result = await restorePaymentTransaction(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('Restore payment error:', err);
    res.status(400).json({ error: err.message || 'Failed to restore payment' });
  }
});

// Permanently hard-delete a soft-deleted payment after undo window expires (Admin only)
router.delete('/:id/permanent', requireAdmin, async (req, res) => {
  try {
    const result = await permanentlyDeletePayment(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('Permanent delete error:', err);
    res.status(400).json({ error: err.message || 'Failed to permanently delete payment' });
  }
});

module.exports = router;

