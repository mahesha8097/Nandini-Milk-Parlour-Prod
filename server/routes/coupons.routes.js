const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin, verifyToken } = require('../middleware/auth');
const {
  issueCouponBook,
  updateCouponBook,
  adjustCouponBalance,
  getCustomerCouponDetails,
  getCouponMonthEndSummary,
  reconcileAllCustomerCoupons
} = require('../services/couponService');

// Get all coupon books with customer and product details (Admin only)
router.get('/books', requireAdmin, async (req, res) => {
  try {
    const agentId = req.agentId || 1;
    await reconcileAllCustomerCoupons(agentId);
    const { status, customer_id, product_id, search } = req.query;

    let query = `
      SELECT cb.*, c.name as customer_name, c.phone as customer_phone,
             c.address as customer_address, c.flat_no, c.coupon_balance,
             z.name as zone_name,
             p.name as product_name, p.variant_label as product_variant, p.selling_price as product_price
      FROM coupon_books cb
      JOIN customers c ON cb.customer_id = c.id
      LEFT JOIN products p ON cb.product_id = p.id
      LEFT JOIN zones z ON c.zone_id = z.id
      WHERE (cb.agent_id = ? OR c.agent_id = ?)
    `;
    const params = [agentId, agentId];

    if (status) {
      query += ` AND cb.status = ?`;
      params.push(status);
    }
    if (customer_id) {
      query += ` AND cb.customer_id = ?`;
      params.push(customer_id);
    }
    if (product_id) {
      if (product_id === 'UNIVERSAL' || product_id === 'null') {
        query += ` AND cb.product_id IS NULL`;
      } else {
        query += ` AND cb.product_id = ?`;
        params.push(parseInt(product_id, 10));
      }
    }
    if (search) {
      query += ` AND (c.name LIKE ? OR c.phone LIKE ? OR cb.book_number LIKE ? OR p.name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY cb.issue_date DESC, cb.id DESC`;

    const books = await db.prepare(query).all(...params);
    res.json(books);
  } catch (err) {
    console.error('Fetch coupon books error:', err);
    res.status(500).json({ error: 'Failed to fetch coupon books' });
  }
});

// Get Month-End or Anytime Coupon Summary Report (Admin only)
router.get('/summary', requireAdmin, async (req, res) => {
  try {
    const { month } = req.query;
    const summary = await getCouponMonthEndSummary(req.agentId || 1, month);
    res.json(summary);
  } catch (err) {
    console.error('Coupon summary error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch coupon summary' });
  }
});

// Get single customer coupon details and history (Admin or Delivery Boy)
router.get('/customers/:id', verifyToken, async (req, res) => {
  try {
    const customerId = req.params.id;
    const details = await getCustomerCouponDetails(customerId);
    if (!details) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(details);
  } catch (err) {
    console.error('Customer coupon details error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch customer coupon details' });
  }
});

// Issue / Add a new coupon book to a customer (Admin only)
router.post('/issue', requireAdmin, async (req, res) => {
  try {
    const { customer_id, product_id, book_number, total_coupons, price_paid, payment_method, issue_date, notes } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }
    if (!total_coupons || parseInt(total_coupons, 10) <= 0) {
      return res.status(400).json({ error: 'Total coupons count is required and must be greater than 0' });
    }

    const result = await issueCouponBook({
      customerId: customer_id,
      productId: product_id || null,
      bookNumber: book_number,
      totalCoupons: parseInt(total_coupons, 10),
      pricePaid: parseFloat(price_paid || 0),
      paymentMethod: payment_method || 'CASH',
      issueDate: issue_date,
      notes,
      agentId: req.agentId || 1,
      recordedByUserId: req.user?.id || null
    });

    res.status(201).json({
      message: `Coupon Book #${result.book.book_number} issued successfully!`,
      ...result
    });
  } catch (err) {
    console.error('Issue coupon book error:', err);
    res.status(400).json({ error: err.message || 'Failed to issue coupon book' });
  }
});

// Manual coupon adjustment (Admin only)
router.post('/adjust', requireAdmin, async (req, res) => {
  try {
    const { customer_id, change_amount, reason } = req.body;
    if (!customer_id || change_amount === undefined || change_amount === null) {
      return res.status(400).json({ error: 'Customer ID and change amount are required' });
    }

    const result = await adjustCouponBalance({
      customerId: customer_id,
      changeAmount: parseInt(change_amount, 10),
      reason: reason || 'Admin manual balance adjustment',
      agentId: req.agentId || 1
    });

    res.json({
      message: 'Coupon balance adjusted successfully',
      ...result
    });
  } catch (err) {
    console.error('Coupon adjust error:', err);
    res.status(400).json({ error: err.message || 'Failed to adjust coupons' });
  }
});

// Edit / Modify coupon book (Admin only)
router.put('/books/:id', requireAdmin, async (req, res) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const {
      book_number,
      product_id,
      total_coupons,
      used_coupons,
      remaining_coupons,
      price_paid,
      payment_method,
      issue_date,
      status,
      notes
    } = req.body;

    const result = await updateCouponBook({
      bookId,
      bookNumber: book_number,
      productId: product_id,
      totalCoupons: total_coupons,
      usedCoupons: used_coupons,
      remainingCoupons: remaining_coupons,
      pricePaid: price_paid,
      paymentMethod: payment_method,
      issueDate: issue_date,
      status,
      notes,
      agentId: req.agentId || 1
    });

    res.json({ message: 'Coupon book updated successfully', ...result });
  } catch (err) {
    console.error('Update coupon book error:', err);
    res.status(400).json({ error: err.message || 'Failed to update coupon book' });
  }
});

// Delete / Void coupon book (Admin only)
router.delete('/books/:id', requireAdmin, async (req, res) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const book = await db.prepare('SELECT * FROM coupon_books WHERE id = ?').get(bookId);
    if (!book) {
      return res.status(404).json({ error: 'Coupon book not found' });
    }

    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(book.customer_id);

    // Delete the book
    await db.prepare('DELETE FROM coupon_books WHERE id = ?').run(bookId);

    // Recalculate customer aggregate active balance
    if (customer) {
      const sumRow = await db.prepare(`
        SELECT COALESCE(SUM(remaining_coupons), 0) as total_remaining
        FROM coupon_books
        WHERE customer_id = ? AND status = 'ACTIVE'
      `).get(customer.id);
      const newBal = parseInt(sumRow?.total_remaining, 10) || 0;

      await db.prepare(`
        UPDATE customers SET coupon_balance = ?, updated_at = datetime('now', 'localtime') WHERE id = ?
      `).run(newBal, customer.id);

      // Record transaction
      await db.prepare(`
        INSERT INTO coupon_transactions (
          customer_id, coupon_book_id, delivery_id, change_amount, balance_after,
          transaction_type, transaction_date, notes, agent_id, created_at
        ) VALUES (
          ?, NULL, NULL, ?, ?,
          'MANUAL_ADJUSTMENT', date('now', 'localtime'), ?, ?, datetime('now', 'localtime')
        )
      `).run(
        customer.id,
        -book.remaining_coupons,
        newBal,
        `Voided Coupon Book #${book.book_number}`,
        customer.agent_id || 1
      );
    }

    res.json({ success: true, message: `Coupon Book #${book.book_number} deleted successfully` });
  } catch (err) {
    console.error('Delete coupon book error:', err);
    res.status(400).json({ error: err.message || 'Failed to delete coupon book' });
  }
});

module.exports = router;
