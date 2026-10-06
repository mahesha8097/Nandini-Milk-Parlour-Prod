const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin, verifyToken } = require('../middleware/auth');

// Get all customers (with filters: search, category, billing_type, status, route, delivery_boy_id)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { search, category, billing_type, status, delivery_boy_id, route } = req.query;

    let query = `
      SELECT c.*, u.name as delivery_boy_name, u.phone as delivery_boy_phone
      FROM customers c
      LEFT JOIN users u ON c.delivery_boy_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Delivery boy can only view assigned customers
    if (req.user.role === 'DELIVERY_BOY') {
      query += ` AND c.delivery_boy_id = ?`;
      params.push(req.user.id);
    } else if (delivery_boy_id) {
      query += ` AND c.delivery_boy_id = ?`;
      params.push(delivery_boy_id);
    }

    if (category) {
      query += ` AND c.customer_category = ?`;
      params.push(category);
    }

    if (billing_type) {
      query += ` AND c.billing_type = ?`;
      params.push(billing_type);
    }

    if (status) {
      query += ` AND c.status = ?`;
      params.push(status);
    }

    if (route) {
      query += ` AND c.route LIKE ?`;
      params.push(`%${route}%`);
    }

    if (search) {
      query += ` AND (c.name LIKE ? OR c.phone LIKE ? OR c.address LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY c.name ASC`;

    const customers = await db.prepare(query).all(...params);

    // Attach active subscriptions summary for quick list view (Supports both SQLite & Async Postgres)
    const enrichedCustomers = await Promise.all((customers || []).map(async (c) => {
      const subs = await db.prepare(`
        SELECT s.*, p.name as product_name, p.variant_label, p.category, p.selling_price
        FROM subscriptions s
        JOIN products p ON s.product_id = p.id
        WHERE s.customer_id = ? AND s.is_active = 1
      `).all(c.id);
      return {
        ...c,
        subscriptions: subs || []
      };
    }));

    res.json(enrichedCustomers);
  } catch (err) {
    console.error('Fetch customers error:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// Get single customer profile with comprehensive details
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const customerId = req.params.id;

    // Delivery boy access check
    if (req.user.role === 'DELIVERY_BOY') {
      const check = await db.prepare('SELECT id FROM customers WHERE id = ? AND delivery_boy_id = ?').get(customerId, req.user.id);
      if (!check) {
        return res.status(403).json({ error: 'Not authorized to view this customer' });
      }
    }

    const customer = await db.prepare(`
      SELECT c.*, u.name as delivery_boy_name, u.phone as delivery_boy_phone
      FROM customers c
      LEFT JOIN users u ON c.delivery_boy_id = u.id
      WHERE c.id = ?
    `).get(customerId);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Subscriptions
    const subscriptions = await db.prepare(`
      SELECT s.*, p.name as product_name, p.category, p.variant_label, p.unit_volume_litres,
             p.selling_price, p.delivery_charge_type, p.fixed_delivery_charge
      FROM subscriptions s
      JOIN products p ON s.product_id = p.id
      WHERE s.customer_id = ?
      ORDER BY s.is_active DESC, p.name ASC
    `).all(customerId);

    // Recent deliveries (last 60 records)
    const deliveries = await db.prepare(`
      SELECT d.*, u.name as delivery_boy_name
      FROM deliveries d
      LEFT JOIN users u ON d.delivery_boy_id = u.id
      WHERE d.customer_id = ?
      ORDER BY d.delivery_date DESC
      LIMIT 60
    `).all(customerId);

    // Monthly Bills
    const bills = await db.prepare(`
      SELECT * FROM bills
      WHERE customer_id = ?
      ORDER BY billing_month DESC
    `).all(customerId);

    // Payments
    const payments = await db.prepare(`
      SELECT p.*, u.name as recorded_by_name
      FROM payments p
      LEFT JOIN users u ON p.recorded_by_user_id = u.id
      WHERE p.customer_id = ?
      ORDER BY p.payment_date DESC
    `).all(customerId);

    // Ledger History (last 50 transactions)
    const ledger = await db.prepare(`
      SELECT * FROM customer_ledger
      WHERE customer_id = ?
      ORDER BY id DESC
      LIMIT 50
    `).all(customerId);

    res.json({
      customer,
      subscriptions: subscriptions || [],
      deliveries: deliveries || [],
      bills: bills || [],
      payments: payments || [],
      ledger: ledger || []
    });
  } catch (err) {
    console.error('Fetch customer profile error:', err);
    res.status(500).json({ error: 'Failed to fetch customer profile' });
  }
});

// Create Customer (Admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      name,
      phone,
      address,
      customer_category,
      billing_type,
      delivery_boy_id,
      route,
      status,
      notes,
      initial_advance
    } = req.body;

    if (!name || !phone || !address || !customer_category || !billing_type) {
      return res.status(400).json({ error: 'Name, phone, address, customer category, and billing type are required' });
    }

    const initAdvance = parseFloat(initial_advance || 0);

    const stmt = db.prepare(`
      INSERT INTO customers (
        name, phone, address, customer_category, billing_type, delivery_boy_id,
        route, status, notes, advance_balance, pending_balance, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `);

    const result = await stmt.run(
      name.trim(),
      phone.trim(),
      address.trim(),
      customer_category,
      billing_type,
      delivery_boy_id || null,
      route || '',
      status || 'ACTIVE',
      notes || '',
      initAdvance
    );

    const newCustomerId = result.lastInsertRowid;

    // If initial advance deposit was provided, record in ledger
    if (initAdvance > 0) {
      await db.prepare(`
        INSERT INTO customer_ledger (
          customer_id, transaction_date, transaction_type, reference_id, debit, credit,
          advance_balance_after, pending_balance_after, description, created_at
        ) VALUES (?, date('now', 'localtime'), 'ADVANCE_DEPOSITED', 'INIT', 0, ?, ?, 0, 'Opening Advance Balance', datetime('now', 'localtime'))
      `).run(newCustomerId, initAdvance, initAdvance);
    }

    const created = await db.prepare('SELECT * FROM customers WHERE id = ?').get(newCustomerId);

    // Audit log
    await db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
      VALUES (?, 'CREATE_CUSTOMER', 'customers', ?, ?, datetime('now', 'localtime'))
    `).run(req.user.id, newCustomerId, `Created customer: ${created.name} (${created.customer_category}, ${created.billing_type})`);

    res.status(201).json(created);
  } catch (err) {
    console.error('Create customer error:', err);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Update Customer Details (Admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const customerId = req.params.id;
    const existing = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const {
      name,
      phone,
      address,
      customer_category,
      billing_type,
      delivery_boy_id,
      route,
      status,
      notes
    } = req.body;

    await db.prepare(`
      UPDATE customers
      SET name = ?, phone = ?, address = ?, customer_category = ?, billing_type = ?,
          delivery_boy_id = ?, route = ?, status = ?, notes = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      (name || existing.name).trim(),
      (phone || existing.phone).trim(),
      (address || existing.address).trim(),
      customer_category || existing.customer_category,
      billing_type || existing.billing_type,
      delivery_boy_id !== undefined ? delivery_boy_id : existing.delivery_boy_id,
      route !== undefined ? route : existing.route,
      status || existing.status,
      notes !== undefined ? notes : existing.notes,
      customerId
    );

    const updated = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);

    // Audit log
    await db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
      VALUES (?, 'UPDATE_CUSTOMER', 'customers', ?, ?, datetime('now', 'localtime'))
    `).run(req.user.id, customerId, `Updated customer: ${updated.name}`);

    res.json(updated);
  } catch (err) {
    console.error('Update customer error:', err);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// ----------------- SUBSCRIPTION MANAGEMENT -----------------

// Add subscription for customer (Admin only)
router.post('/:id/subscriptions', requireAdmin, async (req, res) => {
  try {
    const customerId = req.params.id;
    const { product_id, quantity, frequency, custom_days, start_date, end_date } = req.body;

    if (!product_id || !quantity || !start_date) {
      return res.status(400).json({ error: 'Product, quantity, and start date are required' });
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Valid positive quantity is required' });
    }

    const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const stmt = db.prepare(`
      INSERT INTO subscriptions (
        customer_id, product_id, quantity, frequency, custom_days,
        start_date, end_date, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `);

    const result = await stmt.run(
      customerId,
      product_id,
      qty,
      frequency || 'DAILY',
      custom_days ? JSON.stringify(custom_days) : null,
      start_date,
      end_date || null
    );

    const newSub = await db.prepare(`
      SELECT s.*, p.name as product_name, p.category, p.variant_label, p.selling_price
      FROM subscriptions s
      JOIN products p ON s.product_id = p.id
      WHERE s.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(newSub);
  } catch (err) {
    console.error('Add subscription error:', err);
    res.status(500).json({ error: 'Failed to add subscription' });
  }
});

// Update or Deactivate Subscription (Admin only) - Historical delivery records remain intact!
router.put('/:customerId/subscriptions/:subId', requireAdmin, async (req, res) => {
  try {
    const { customerId, subId } = req.params;
    const { quantity, frequency, custom_days, start_date, end_date, is_active } = req.body;

    const existing = await db.prepare('SELECT * FROM subscriptions WHERE id = ? AND customer_id = ?').get(subId, customerId);
    if (!existing) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    await db.prepare(`
      UPDATE subscriptions
      SET quantity = ?, frequency = ?, custom_days = ?, start_date = ?,
          end_date = ?, is_active = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      quantity !== undefined ? parseInt(quantity) : existing.quantity,
      frequency || existing.frequency,
      custom_days ? JSON.stringify(custom_days) : existing.custom_days,
      start_date || existing.start_date,
      end_date !== undefined ? end_date : existing.end_date,
      is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
      subId
    );

    const updated = await db.prepare(`
      SELECT s.*, p.name as product_name, p.category, p.variant_label, p.selling_price
      FROM subscriptions s
      JOIN products p ON s.product_id = p.id
      WHERE s.id = ?
    `).get(subId);

    res.json(updated);
  } catch (err) {
    console.error('Update subscription error:', err);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// Delete Subscription
router.delete('/:customerId/subscriptions/:subId', requireAdmin, async (req, res) => {
  try {
    const { customerId, subId } = req.params;
    await db.prepare('DELETE FROM subscriptions WHERE id = ? AND customer_id = ?').run(subId, customerId);
    res.json({ message: 'Subscription removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete subscription' });
  }
});

module.exports = router;
