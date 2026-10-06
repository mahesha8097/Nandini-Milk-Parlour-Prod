const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');

// Get all expenses (Admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { category, startDate, endDate } = req.query;

    let query = `
      SELECT e.*, u.name as created_by_name
      FROM expenses e
      LEFT JOIN users u ON e.created_by_user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (category) {
      query += ` AND e.category = ?`;
      params.push(category);
    }

    if (startDate) {
      query += ` AND e.expense_date >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND e.expense_date <= ?`;
      params.push(endDate);
    }

    query += ` ORDER BY e.expense_date DESC, e.id DESC`;

    const expenses = await db.prepare(query).all(...params);
    res.json(expenses);
  } catch (err) {
    console.error('Fetch expenses error:', err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// Record new expense (Admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { category, amount, expense_date, payment_method, recipient_name, description, notes } = req.body;

    if (!category || !amount || !expense_date || !payment_method) {
      return res.status(400).json({ error: 'Category, amount, expense date, and payment method are required' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Valid positive amount is required' });
    }

    const stmt = db.prepare(`
      INSERT INTO expenses (
        category, amount, expense_date, payment_method, recipient_name,
        description, notes, created_at, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), ?)
    `);

    const result = await stmt.run(
      category,
      numAmount,
      expense_date,
      payment_method,
      recipient_name ? recipient_name.trim() : '',
      description ? description.trim() : '',
      notes ? notes.trim() : '',
      req.user.id
    );

    const created = await db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('Create expense error:', err);
    res.status(500).json({ error: 'Failed to record expense' });
  }
});

// Delete expense (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const expenseId = req.params.id;
    const existing = await db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId);
    if (!existing) {
      return res.status(404).json({ error: 'Expense record not found' });
    }

    await db.prepare('DELETE FROM expenses WHERE id = ?').run(expenseId);
    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

module.exports = router;
