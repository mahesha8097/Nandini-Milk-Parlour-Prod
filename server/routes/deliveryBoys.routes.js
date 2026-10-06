const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { requireAdmin, verifyToken } = require('../middleware/auth');
const { getLocalDateString } = require('../utils/dateUtils');

// Get all Delivery Boys (Admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const deliveryBoys = await db.prepare(`
      SELECT u.id, u.name, u.username, u.role, u.phone, u.email, u.is_active,
             u.assigned_route, u.created_at,
             (SELECT COUNT(*) FROM customers c WHERE c.delivery_boy_id = u.id) as assigned_customers_count,
             (SELECT COUNT(*) FROM deliveries d WHERE d.delivery_boy_id = u.id AND d.status = 'DELIVERED') as total_deliveries_count
      FROM users u
      WHERE u.role = 'DELIVERY_BOY'
      ORDER BY u.name ASC
    `).all();

    res.json(deliveryBoys);
  } catch (err) {
    console.error('Fetch delivery boys error:', err);
    res.status(500).json({ error: 'Failed to fetch delivery boys' });
  }
});

// Get single Delivery Boy details & performance stats (Admin only)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const dboy = await db.prepare(`
      SELECT id, name, username, role, phone, email, is_active, assigned_route, created_at
      FROM users
      WHERE id = ? AND role = 'DELIVERY_BOY'
    `).get(req.params.id);

    if (!dboy) {
      return res.status(404).json({ error: 'Delivery boy not found' });
    }

    const assignedCustomers = await db.prepare(`
      SELECT id, name, phone, address, customer_category, billing_type, route, status
      FROM customers
      WHERE delivery_boy_id = ?
      ORDER BY route ASC, name ASC
    `).all(dboy.id);

    const todayStr = getLocalDateString();
    const todayStats = await db.prepare(`
      SELECT 
        COUNT(*) as total_today,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as delivered_today,
        SUM(CASE WHEN status = 'SKIPPED' THEN 1 ELSE 0 END) as skipped_today,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_today
      FROM deliveries
      WHERE delivery_boy_id = ? AND delivery_date = ?
    `).get(dboy.id, todayStr);

    res.json({
      deliveryBoy: dboy,
      assignedCustomers,
      todayStats
    });
  } catch (err) {
    console.error('Fetch delivery boy error:', err);
    res.status(500).json({ error: 'Failed to fetch delivery boy details' });
  }
});

// Create Delivery Boy (Admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, username, password, phone, email, assigned_route } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ error: 'Name, username, and initial password are required' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const existing = await db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (existing) {
      return res.status(400).json({ error: 'Username already in use' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const stmt = db.prepare(`
      INSERT INTO users (
        name, username, password_hash, role, phone, email, assigned_route,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, 'DELIVERY_BOY', ?, ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `);

    const result = await stmt.run(
      name.trim(),
      cleanUsername,
      passwordHash,
      phone ? phone.trim() : '',
      email ? email.trim() : '',
      assigned_route ? assigned_route.trim() : ''
    );

    const created = await db.prepare('SELECT id, name, username, role, phone, email, assigned_route, is_active, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

    // Audit log
    await db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
      VALUES (?, 'CREATE_DELIVERY_BOY', 'users', ?, ?, datetime('now', 'localtime'))
    `).run(req.user.id, created.id, `Created delivery boy account: ${created.name} (${created.username})`);

    res.status(201).json(created);
  } catch (err) {
    console.error('Create delivery boy error:', err);
    res.status(500).json({ error: 'Failed to create delivery boy account' });
  }
});

// Update Delivery Boy (Admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const dboyId = req.params.id;
    const existing = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'DELIVERY_BOY'").get(dboyId);
    if (!existing) {
      return res.status(404).json({ error: 'Delivery boy not found' });
    }

    const { name, phone, email, assigned_route, is_active, newPassword } = req.body;

    let passwordHash = existing.password_hash;
    if (newPassword && newPassword.trim().length >= 4) {
      const salt = await bcrypt.genSalt(10);
      passwordHash = await bcrypt.hash(newPassword.trim(), salt);
    }

    await db.prepare(`
      UPDATE users
      SET name = ?, phone = ?, email = ?, assigned_route = ?, password_hash = ?,
          is_active = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      (name || existing.name).trim(),
      phone !== undefined ? phone.trim() : existing.phone,
      email !== undefined ? email.trim() : existing.email,
      assigned_route !== undefined ? assigned_route.trim() : existing.assigned_route,
      passwordHash,
      is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
      dboyId
    );

    const updated = await db.prepare('SELECT id, name, username, role, phone, email, assigned_route, is_active, created_at FROM users WHERE id = ?').get(dboyId);

    // Audit log
    await db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
      VALUES (?, 'UPDATE_DELIVERY_BOY', 'users', ?, ?, datetime('now', 'localtime'))
    `).run(req.user.id, dboyId, `Updated delivery boy: ${updated.name}`);

    res.json(updated);
  } catch (err) {
    console.error('Update delivery boy error:', err);
    res.status(500).json({ error: 'Failed to update delivery boy' });
  }
});

// Assign route & customers in bulk to delivery boy (Admin only)
router.post('/:id/assign-customers', requireAdmin, async (req, res) => {
  try {
    const dboyId = req.params.id;
    const { customerIds } = req.body;

    if (!Array.isArray(customerIds)) {
      return res.status(400).json({ error: 'customerIds array required' });
    }

    for (const cid of customerIds) {
      await db.prepare(`UPDATE customers SET delivery_boy_id = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`).run(dboyId, cid);
    }

    res.json({ message: `Successfully assigned ${customerIds.length} customers to delivery boy.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign customers' });
  }
});

module.exports = router;
