const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin, verifyToken } = require('../middleware/auth');
const {
  getDeliveryBoyAssignedRouteIds,
  getDeliveryBoyAuthorizedZoneIds,
  isCustomerAuthorized
} = require('../services/routeAuthService');

const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const upload = multer({ dest: os.tmpdir() });
const { importCustomers } = require('../../scripts/import_customers_from_excel');

// Download Excel Customer Onboarding Template
router.get('/download-template', (req, res) => {
  const filePath = path.join(__dirname, '../../Nandini_Customers_Bulk_Import_Template.xlsx');
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'Nandini_Customers_Bulk_Import_Template.xlsx');
  } else {
    res.status(404).json({ error: 'Template file not found' });
  }
});

// Upload and Import Excel Customers
router.post('/upload-import-excel', verifyToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please choose an Excel file to upload (.xlsx)' });
    }
    const uploadedPath = req.file.path;
    const result = await importCustomers(uploadedPath);
    try { fs.unlinkSync(uploadedPath); } catch (e) {}

    res.json({
      success: true,
      message: `Successfully imported ${result.insertedCount} customers (${result.skippedCount} duplicates skipped).`,
      ...result
    });
  } catch (err) {
    console.error('Import error:', err);
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ error: err.message || 'Failed to import customers from Excel' });
  }
});

// Get all customers (with filters: search, category, billing_type, status, route, route_id, zone_id, delivery_boy_id)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { search, category, billing_type, status, delivery_boy_id, route, route_id, zone_id } = req.query;
    const agentId = req.agentId || 1;

    let query = `
      SELECT c.*, 
             z.name as zone_name, z.address as zone_address, z.route_order as zone_route_order, z.route_id,
             r.name as route_name, r.delivery_boy_id as route_delivery_boy_id,
             u.name as delivery_boy_name, u.phone as delivery_boy_phone
      FROM customers c
      LEFT JOIN zones z ON c.zone_id = z.id
      LEFT JOIN routes r ON z.route_id = r.id
      LEFT JOIN users u ON COALESCE(c.delivery_boy_id, r.delivery_boy_id) = u.id
      WHERE c.agent_id = ?
    `;
    const params = [agentId];

    // Delivery boy can only view customers on their assigned route(s) (Requirement 8 & 9)
    if (req.user.role === 'DELIVERY_BOY') {
      const assignedRouteIds = await getDeliveryBoyAssignedRouteIds(req.user.id, agentId);
      if (assignedRouteIds.length === 0) {
        // No active route assigned -> return empty list (Rule 8)
        return res.json([]);
      }
      const authorizedZoneIds = await getDeliveryBoyAuthorizedZoneIds(req.user.id, agentId);
      if (authorizedZoneIds.length > 0) {
        const placeholders = authorizedZoneIds.map(() => '?').join(', ');
        query += ` AND (c.zone_id IN (${placeholders}) OR c.delivery_boy_id = ?)`;
        params.push(...authorizedZoneIds, req.user.id);
      } else {
        query += ` AND c.delivery_boy_id = ?`;
        params.push(req.user.id);
      }
    } else if (delivery_boy_id) {
      query += ` AND (c.delivery_boy_id = ? OR r.delivery_boy_id = ?)`;
      params.push(delivery_boy_id, delivery_boy_id);
    }

    if (route_id) {
      query += ` AND z.route_id = ?`;
      params.push(route_id);
    }

    if (zone_id) {
      if (zone_id === 'unassigned' || zone_id === 'null') {
        query += ` AND (c.zone_id IS NULL OR c.zone_id = 0)`;
      } else {
        query += ` AND c.zone_id = ?`;
        params.push(zone_id);
      }
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
               p.selling_price, p.delivery_charge_type, p.fixed_delivery_charge, p.image_url
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
    const customerId = parseInt(req.params.id, 10);
    const agentId = req.agentId || 1;

    // Delivery boy authorization check (Requirement 9)
    if (req.user.role === 'DELIVERY_BOY') {
      const authorized = await isCustomerAuthorized(customerId, req.user, agentId);
      if (!authorized) {
        return res.status(403).json({ error: 'You are not authorized to view this customer.' });
      }
    }

    const customer = await db.prepare(`
      SELECT c.*, 
             z.name as zone_name, z.address as zone_address, z.route_order as zone_route_order, z.route_id,
             r.name as route_name, r.delivery_boy_id as route_delivery_boy_id,
             u.name as delivery_boy_name, u.phone as delivery_boy_phone
      FROM customers c
      LEFT JOIN zones z ON c.zone_id = z.id
      LEFT JOIN routes r ON z.route_id = r.id
      LEFT JOIN users u ON COALESCE(c.delivery_boy_id, r.delivery_boy_id) = u.id
      WHERE c.id = ? AND COALESCE(c.agent_id, 1) = ?
    `).get(customerId, agentId);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Subscriptions
    const subscriptions = await db.prepare(`
      SELECT s.*, p.name as product_name, p.category, p.variant_label, p.unit_volume_litres,
             p.selling_price, p.delivery_charge_type, p.fixed_delivery_charge, p.image_url
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
      serial_no,
      zone_id,
      flat_no
    } = req.body;

    if (!name || !phone || !address || !customer_category || !billing_type) {
      return res.status(400).json({ error: 'Name, phone, address, customer category, and billing type are required' });
    }

    const initAdvance = parseFloat(initial_advance || 0);
    const agentId = req.agentId || 1;

    let assignedSerial = serial_no !== undefined && serial_no !== '' && serial_no !== null ? parseInt(serial_no) || 0 : 0;
    if (!assignedSerial && delivery_boy_id) {
      try {
        const maxRow = await db.prepare('SELECT COALESCE(MAX(serial_no), 0) + 1 as next_seq FROM customers WHERE delivery_boy_id = ? AND agent_id = ?').get(delivery_boy_id, agentId);
        assignedSerial = maxRow ? maxRow.next_seq : 1;
      } catch (seqErr) {
        assignedSerial = 0;
      }
    }

    let newCustomerId = null;
    try {
      const stmt = db.prepare(`
        INSERT INTO customers (
          serial_no, name, phone, address, flat_no, zone_id, customer_category, billing_type, delivery_boy_id,
          route, status, notes, advance_balance, pending_balance, agent_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.0, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
      `);

      const parsedZoneId = zone_id ? parseInt(zone_id, 10) || null : null;
      const cleanFlatNo = flat_no ? flat_no.trim() : null;

      let assignedRouteName = route || '';
      let assignedDboyId = delivery_boy_id ? parseInt(delivery_boy_id, 10) || null : null;

      // Automatically determine route and delivery boy from the zone's route (Requirement 6)
      if (parsedZoneId) {
        const zInfo = await db.prepare(`
          SELECT z.*, r.name as route_name, r.delivery_boy_id as route_dboy_id
          FROM zones z
          LEFT JOIN routes r ON z.route_id = r.id
          WHERE z.id = ?
        `).get(parsedZoneId);
        if (zInfo) {
          if (zInfo.route_name) {
            assignedRouteName = zInfo.route_name;
          }
          if (!assignedDboyId && zInfo.route_dboy_id) {
            assignedDboyId = zInfo.route_dboy_id;
          }
        }
      }

      const result = await stmt.run(
        assignedSerial,
        name.trim(),
        phone.trim(),
        address.trim(),
        cleanFlatNo,
        parsedZoneId,
        customer_category,
        billing_type,
        assignedDboyId,
        assignedRouteName,
        status || 'ACTIVE',
        notes || '',
        initAdvance,
        agentId
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
      serial_no,
      zone_id,
      flat_no
    } = req.body;

    const targetAdvance = (advance_balance !== undefined && advance_balance !== null && advance_balance !== '')
      ? parseFloat(advance_balance)
      : (initial_advance !== undefined && initial_advance !== null && initial_advance !== ''
          ? parseFloat(initial_advance)
          : existing.advance_balance);

    const oldAdvance = parseFloat(existing.advance_balance || 0);
    const newAdvance = isNaN(targetAdvance) ? oldAdvance : targetAdvance;

    const newSerial = serial_no !== undefined
      ? (serial_no === '' || serial_no === null ? 0 : parseInt(serial_no) || 0)
      : (existing.serial_no || 0);

    const newZoneId = zone_id !== undefined
      ? (zone_id ? parseInt(zone_id, 10) || null : null)
      : (existing.zone_id || null);

    const newFlatNo = flat_no !== undefined
      ? (flat_no ? flat_no.trim() : null)
      : (existing.flat_no || null);

    let finalRoute = route !== undefined ? route : existing.route;
    let finalDboyId = delivery_boy_id !== undefined ? delivery_boy_id : existing.delivery_boy_id;

    // Automatically determine route and delivery boy if zone changed (Requirement 6)
    if (newZoneId && newZoneId !== existing.zone_id) {
      const zInfo = await db.prepare(`
        SELECT z.*, r.name as route_name, r.delivery_boy_id as route_dboy_id
        FROM zones z
        LEFT JOIN routes r ON z.route_id = r.id
        WHERE z.id = ?
      `).get(newZoneId);
      if (zInfo) {
        if (zInfo.route_name) {
          finalRoute = zInfo.route_name;
        }
        if (delivery_boy_id === undefined && zInfo.route_dboy_id) {
          finalDboyId = zInfo.route_dboy_id;
        }
      }
    }

    await db.prepare(`
      UPDATE customers
      SET name = ?, phone = ?, address = ?, flat_no = ?, zone_id = ?, customer_category = ?, billing_type = ?,
          delivery_boy_id = ?, route = ?, status = ?, notes = ?, advance_balance = ?, serial_no = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      (name || existing.name).trim(),
      (phone || existing.phone).trim(),
      (address || existing.address).trim(),
      newFlatNo,
      newZoneId,
      customer_category || existing.customer_category,
      billing_type || existing.billing_type,
      finalDboyId,
      finalRoute,
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
        SELECT s.*, p.name as product_name, p.category, p.variant_label, p.selling_price, p.image_url
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
    const { product_id, quantity, frequency, custom_days, start_date, end_date, is_active } = req.body;

    const existing = await db.prepare('SELECT * FROM subscriptions WHERE id = ? AND customer_id = ?').get(subId, customerId);
    if (!existing) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    await db.prepare(`
      UPDATE subscriptions
      SET product_id = ?, quantity = ?, frequency = ?, custom_days = ?, start_date = ?,
          end_date = ?, is_active = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      product_id ? parseInt(product_id) : existing.product_id,
      quantity !== undefined ? parseInt(quantity) : existing.quantity,
      frequency || existing.frequency,
      custom_days ? JSON.stringify(custom_days) : existing.custom_days,
      start_date || existing.start_date,
      end_date !== undefined ? end_date : existing.end_date,
      is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
      subId
    );

    const updated = await db.prepare(`
      SELECT s.*, p.name as product_name, p.category, p.variant_label, p.selling_price, p.image_url
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

// Generate or recalculate bill for specific customer
router.post('/:customerId/bills/generate', requireAdmin, async (req, res) => {
  try {
    const { customerId } = req.params;
    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const targetMonth = req.body.billing_month || req.body.month || new Date().toISOString().slice(0, 7);
    const { generateBillForCustomer } = require('../services/billingService');
    const bill = await generateBillForCustomer(customer, targetMonth, {
      billingBasis: req.body.billingBasis || 'AUTO',
      forceRegenerate: req.body.forceRegenerate !== undefined ? Boolean(req.body.forceRegenerate) : true
    });

    res.json({ message: 'Bill generated successfully', bill });
  } catch (err) {
    console.error('Customer bill generate error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate bill' });
  }
});

module.exports = router;
