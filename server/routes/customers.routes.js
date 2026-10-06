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

    query += ` ORDER BY CASE WHEN c.serial_no IS NULL OR c.serial_no = 0 THEN 1 ELSE 0 END, c.serial_no ASC, c.name ASC`;

    const customers = await db.prepare(query).all(...params);

    // Attach active subscriptions summary for quick list view (Supports both SQLite & Async Postgres)
    const enrichedCustomers = await Promise.all((customers || []).map(async (c) => {
      const subs = await db.prepare(`
        SELECT s.*, p.name as product_name, p.variant_label, p.category, p.unit_volume_litres,
               p.selling_price, p.delivery_charge_type, p.fixed_delivery_charge
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
      initial_advance,
      serial_no
    } = req.body;

    if (!name || !phone || !address || !customer_category || !billing_type) {
      return res.status(400).json({ error: 'Name, phone, address, customer category, and billing type are required' });
    }

    const initAdvance = parseFloat(initial_advance || 0);

    let assignedSerial = serial_no !== undefined && serial_no !== '' && serial_no !== null ? parseInt(serial_no) || 0 : 0;
    if (!assignedSerial && delivery_boy_id) {
      try {
        const maxRow = await db.prepare('SELECT COALESCE(MAX(serial_no), 0) + 1 as next_seq FROM customers WHERE delivery_boy_id = ?').get(delivery_boy_id);
        assignedSerial = maxRow ? maxRow.next_seq : 1;
      } catch (seqErr) {
        assignedSerial = 0;
      }
    }

    let newCustomerId = null;
    try {
      const stmt = db.prepare(`
        INSERT INTO customers (
          serial_no, name, phone, address, customer_category, billing_type, delivery_boy_id,
          route, status, notes, advance_balance, pending_balance, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, datetime('now', 'localtime'), datetime('now', 'localtime'))
      `);

      const result = await stmt.run(
        assignedSerial,
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

      newCustomerId = result.lastInsertRowid;

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

      // Audit log (non-fatal if audit log insert encounters an issue)
      try {
        await db.prepare(`
          INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
          VALUES (?, 'CREATE_CUSTOMER', 'customers', ?, ?, datetime('now', 'localtime'))
        `).run(req.user?.id || null, newCustomerId, `Created customer: ${created?.name || name} (${customer_category}, ${billing_type})`);
      } catch (auditErr) {
        console.warn('Audit log notice (non-fatal):', auditErr.message);
      }

      res.status(201).json(created);
    } catch (innerErr) {
      // If customer record was created but subsequent operations failed, clean up orphaned customer record
      if (newCustomerId) {
        try {
          await db.prepare('DELETE FROM customer_ledger WHERE customer_id = ?').run(newCustomerId);
          await db.prepare('DELETE FROM customers WHERE id = ?').run(newCustomerId);
        } catch (cleanupErr) {
          console.error('Failed to cleanup orphaned customer record:', cleanupErr);
        }
      }
      throw innerErr;
    }
  } catch (err) {
    console.error('Create customer error:', err);
    res.status(500).json({ error: err.message || 'Failed to create customer' });
  }
});

// Bulk update serial numbers / delivery sequence order (Admin only)
router.put('/reorder', requireAdmin, async (req, res) => {
  try {
    const { orders } = req.body; // Array of { id, serial_no }
    if (!Array.isArray(orders)) {
      return res.status(400).json({ error: 'orders array is required' });
    }

    for (const item of orders) {
      if (item.id) {
        const sNo = item.serial_no !== undefined && item.serial_no !== '' ? parseInt(item.serial_no) || 0 : 0;
        await db.prepare('UPDATE customers SET serial_no = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(sNo, item.id);
      }
    }

    res.json({ message: 'Delivery sequence order updated successfully' });
  } catch (err) {
    console.error('Customer reorder error:', err);
    res.status(500).json({ error: err.message || 'Failed to update order' });
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
      notes,
      advance_balance,
      initial_advance,
      serial_no
    } = req.body;

    const targetAdvance = advance_balance !== undefined
      ? parseFloat(advance_balance)
      : (initial_advance !== undefined ? parseFloat(initial_advance) : existing.advance_balance);

    const oldAdvance = parseFloat(existing.advance_balance || 0);
    const newAdvance = isNaN(targetAdvance) ? oldAdvance : targetAdvance;

    const newSerial = serial_no !== undefined
      ? (serial_no === '' || serial_no === null ? 0 : parseInt(serial_no) || 0)
      : (existing.serial_no || 0);

    await db.prepare(`
      UPDATE customers
      SET name = ?, phone = ?, address = ?, customer_category = ?, billing_type = ?,
          delivery_boy_id = ?, route = ?, status = ?, notes = ?, advance_balance = ?, serial_no = ?, updated_at = datetime('now', 'localtime')
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
      newAdvance,
      newSerial,
      customerId
    );

    // If advance balance changed, record adjustment in customer_ledger
    const advanceDiff = parseFloat((newAdvance - oldAdvance).toFixed(2));
    if (advanceDiff !== 0) {
      try {
        await db.prepare(`
          INSERT INTO customer_ledger (
            customer_id, transaction_date, transaction_type, reference_id, debit, credit,
            advance_balance_after, pending_balance_after, description, created_at
          ) VALUES (?, date('now', 'localtime'), 'ADJUSTMENT', 'MANUAL_EDIT', ?, ?, ?, ?, 'Admin adjusted advance balance', datetime('now', 'localtime'))
        `).run(
          customerId,
          advanceDiff < 0 ? Math.abs(advanceDiff) : 0,
          advanceDiff > 0 ? advanceDiff : 0,
          newAdvance,
          parseFloat(existing.pending_balance || 0)
        );
      } catch (ledgerErr) {
        console.warn('Customer ledger adjustment notice:', ledgerErr.message);
      }
    }

    const updated = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);

    // Audit log
    try {
      await db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
        VALUES (?, 'UPDATE_CUSTOMER', 'customers', ?, ?, datetime('now', 'localtime'))
      `).run(req.user?.id || null, customerId, `Updated customer: ${updated.name} (advance: ₹${newAdvance})`);
    } catch (auditErr) {
      console.warn('Audit log notice:', auditErr.message);
    }

    res.json(updated);
  } catch (err) {
    console.error('Update customer error:', err);
    res.status(500).json({ error: err.message || 'Failed to update customer' });
  }
});

// Delete Customer (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const customerId = req.params.id;
    const existing = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!existing) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Clean up dependent child records safely
    await db.prepare('DELETE FROM daily_delivery_requirements WHERE customer_id = ?').run(customerId);
    await db.prepare('DELETE FROM customer_ledger WHERE customer_id = ?').run(customerId);
    await db.prepare('DELETE FROM payments WHERE customer_id = ?').run(customerId);
    await db.prepare('DELETE FROM bills WHERE customer_id = ?').run(customerId);
    await db.prepare('DELETE FROM deliveries WHERE customer_id = ?').run(customerId);
    await db.prepare('DELETE FROM subscriptions WHERE customer_id = ?').run(customerId);
    await db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);

    // Audit log
    try {
      await db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
        VALUES (?, 'DELETE_CUSTOMER', 'customers', ?, ?, datetime('now', 'localtime'))
      `).run(req.user?.id || null, customerId, `Deleted customer: ${existing.name}`);
    } catch (auditErr) {
      console.warn('Audit log notice (non-fatal):', auditErr.message);
    }

    res.json({ message: 'Customer deleted successfully', id: customerId });
  } catch (err) {
    console.error('Delete customer error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete customer' });
  }
});

// ----------------- SUBSCRIPTION MANAGEMENT -----------------

// Add subscription for customer (Admin only) - supports single product or multiple products (e.g. Shubham + Toned)
router.post('/:id/subscriptions', requireAdmin, async (req, res) => {
  try {
    const customerId = req.params.id;
    const { items, product_id, quantity, frequency, custom_days, start_date, end_date } = req.body;

    const subList = Array.isArray(items) && items.length > 0
      ? items
      : [{ product_id, quantity, frequency, custom_days, start_date, end_date }];

    if (subList.length === 0 || !subList[0].product_id) {
      return res.status(400).json({ error: 'At least one product subscription is required' });
    }

    const createdSubs = [];

    for (const item of subList) {
      const pid = item.product_id;
      const qty = parseInt(item.quantity);
      const sDate = item.start_date || start_date;
      const eDate = item.end_date !== undefined ? item.end_date : (end_date || null);
      const freq = item.frequency || frequency || 'DAILY';
      const cDays = item.custom_days || custom_days || null;

      if (!pid || isNaN(qty) || qty <= 0 || !sDate) {
        continue;
      }

      const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
      if (!product) continue;

      const stmt = db.prepare(`
        INSERT INTO subscriptions (
          customer_id, product_id, quantity, frequency, custom_days,
          start_date, end_date, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
      `);

      const result = await stmt.run(
        customerId,
        pid,
        qty,
        freq,
        cDays ? JSON.stringify(cDays) : null,
        sDate,
        eDate
      );

      const newSub = await db.prepare(`
        SELECT s.*, p.name as product_name, p.category, p.variant_label, p.selling_price
        FROM subscriptions s
        JOIN products p ON s.product_id = p.id
        WHERE s.id = ?
      `).get(result.lastInsertRowid);

      createdSubs.push(newSub);
    }

    if (createdSubs.length === 0) {
      return res.status(400).json({ error: 'Valid product, positive quantity, and start date are required' });
    }

    // Return array if items array was supplied, else single object
    res.status(201).json(Array.isArray(items) ? createdSubs : createdSubs[0]);
  } catch (err) {
    console.error('Add subscription error:', err);
    res.status(500).json({ error: err.message || 'Failed to add subscription' });
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
