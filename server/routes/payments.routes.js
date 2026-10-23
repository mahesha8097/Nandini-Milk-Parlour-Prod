const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin, verifyToken } = require('../middleware/auth');
const { 
  recordPaymentTransaction,
  updatePaymentTransaction,
  deletePaymentTransaction
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
      WHERE (p.agent_id = ? OR c.agent_id = ?)
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
      query += ` AND p.payment_type = ?`;
      params.push(paymentType);
    }

    query += ` ORDER BY p.payment_date DESC, p.id DESC`;

    const payments = await db.prepare(query).all(...params);
    res.json(payments);
  } catch (err) {
    console.error('Fetch payments error:', err);
    res.status(500).json({ error: 'Failed to fetch payments' });
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

    const paymentRecord = await recordPaymentTransaction({
      customerId: parseInt(customer_id),
      billId: bill_id ? parseInt(bill_id) : null,
      amount: parseFloat(amount),
      paymentDate: payment_date,
      paymentType: payment_type,
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

// Delete / Void an existing payment (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const result = await deletePaymentTransaction(req.params.id, req.agentId || 1);
    res.json(result);
  } catch (err) {
    console.error('Delete payment error:', err);
    res.status(400).json({ error: err.message || 'Failed to delete payment' });
  }
});

module.exports = router;

