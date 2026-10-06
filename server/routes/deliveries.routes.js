const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin, verifyToken } = require('../middleware/auth');
const { calculateDeliveryChargesForCustomerDay } = require('../services/deliveryChargeService');
const { getLocalDateString } = require('../utils/dateUtils');

/**
 * Ensures pending delivery items exist for a given date based on active customer subscriptions.
 * Bulk / Hotel customers are strictly excluded from automatic subscriptions (they are manual daily).
 */
/**
 * Ensures pending delivery items exist for a given date based on active customer subscriptions.
 * Bulk / Hotel customers are strictly excluded from automatic subscriptions (they are manual daily).
 */
async function syncDeliveriesForDate(dateStr, deliveryBoyId = null) {
  // Find all active HOUSE customers (Bulk/Hotel customers do NOT use automatic subscriptions)
  let custQuery = `SELECT * FROM customers WHERE status = 'ACTIVE' AND customer_category != 'BULK_HOTEL'`;
  const params = [];
  if (deliveryBoyId) {
    custQuery += ` AND delivery_boy_id = ?`;
    params.push(deliveryBoyId);
  }
  const customers = await db.prepare(custQuery).all(...params);

  const getActiveSubs = db.prepare(`
    SELECT s.*, p.name as product_name, p.category, p.variant_label, p.unit_volume_litres,
           p.selling_price, p.delivery_charge_type, p.fixed_delivery_charge
    FROM subscriptions s
    JOIN products p ON s.product_id = p.id
    WHERE s.customer_id = ? AND s.is_active = 1
      AND s.start_date <= ?
      AND (s.end_date IS NULL OR s.end_date >= ?)
  `);

  const checkExisting = db.prepare(`
    SELECT id FROM deliveries WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
  `);

  const insertPending = db.prepare(`
    INSERT INTO deliveries (
      customer_id, delivery_boy_id, delivery_date, product_id,
      product_name_snapshot, category_snapshot, variant_snapshot,
      unit_volume_litres_snapshot, quantity, unit_price_snapshot,
      total_product_amount, delivery_charge_snapshot, total_amount,
      status, notes, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `);

  const getRequirement = db.prepare(`
    SELECT * FROM daily_delivery_requirements
    WHERE customer_id = ? AND product_id = ? AND delivery_date = ? AND status = 'ACTIVE'
  `);

  for (const cust of customers) {
    const subs = await getActiveSubs.all(cust.id, dateStr, dateStr);
    if (!subs || subs.length === 0) continue;

    // Group subscription items with daily requirements applied
    const items = await Promise.all(subs.map(async s => {
      const reqRow = await getRequirement.get(cust.id, s.product_id, dateStr);
      let effQty = s.quantity;
      let isSkipped = false;
      let reqReason = '';

      if (reqRow) {
        if (reqRow.requirement_type === 'SKIP_DELIVERY') {
          effQty = 0;
          isSkipped = true;
          reqReason = reqRow.reason ? `Customer Requirement: ${reqRow.reason}` : 'Customer Requirement: Skip Delivery';
        } else if (reqRow.requirement_type === 'CHANGE_QUANTITY') {
          effQty = reqRow.required_quantity || s.quantity;
          reqReason = reqRow.reason ? `Requirement: ${reqRow.reason}` : '';
        } else if (reqRow.requirement_type === 'ADD_EXTRA_QUANTITY') {
          effQty = s.quantity + (reqRow.additional_quantity || 0);
          reqReason = reqRow.reason ? `Requirement: ${reqRow.reason}` : '';
        }
      }

      return {
        subscriptionId: s.id,
        productId: s.product_id,
        productName: s.product_name,
        category: s.category,
        variantLabel: s.variant_label,
        unitVolumeLitres: s.unit_volume_litres,
        quantity: effQty,
        normalQuantity: s.quantity,
        sellingPrice: s.selling_price,
        deliveryChargeType: s.delivery_charge_type,
        fixedDeliveryCharge: s.fixed_delivery_charge,
        isSkipped,
        reqReason
      };
    }));

    const calculated = calculateDeliveryChargesForCustomerDay(
      cust.customer_category,
      items.filter(it => it.quantity > 0)
    );

    for (const item of items) {
      const exist = await checkExisting.get(cust.id, item.productId, dateStr);
      if (!exist) {
        if (item.isSkipped) {
          await insertPending.run(
            cust.id,
            cust.delivery_boy_id || null,
            dateStr,
            item.productId,
            item.productName,
            item.category,
            item.variantLabel,
            item.unitVolumeLitres,
            item.normalQuantity,
            item.sellingPrice,
            0, // ₹0 product amount
            0, // ₹0 delivery charge
            0, // ₹0 total amount
            'SKIPPED',
            item.reqReason || 'Customer Requirement: Skip Delivery'
          );
        } else {
          const calcItem = calculated.find(c => c.productId === item.productId);
          const qty = item.quantity;
          const totalProductAmount = parseFloat((item.sellingPrice * qty).toFixed(2));
          const deliveryCharge = calcItem ? (calcItem.deliveryCharge || 0) : 0;
          const totalAmount = parseFloat((totalProductAmount + deliveryCharge).toFixed(2));

          await insertPending.run(
            cust.id,
            cust.delivery_boy_id || null,
            dateStr,
            item.productId,
            item.productName,
            item.category,
            item.variantLabel,
            item.unitVolumeLitres,
            qty,
            item.sellingPrice,
            totalProductAmount,
            deliveryCharge,
            totalAmount,
            'PENDING',
            item.reqReason || ''
          );
        }
      }
    }
  }
}

// Get deliveries for a date with full filters (Includes active Bulk Customers starting with 0 products)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { date, status, delivery_boy_id, customer_id, route } = req.query;
    const targetDate = date || getLocalDateString();

    // Sync deliveries from active subscriptions for HOUSE customers
    const reqDboyId = req.user.role === 'DELIVERY_BOY' ? req.user.id : delivery_boy_id;
    await syncDeliveriesForDate(targetDate, reqDboyId);

    let query = `
      SELECT d.*, 
             c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             c.route as customer_route, c.customer_category, c.billing_type,
             u.name as delivery_boy_name,
             s.quantity as subscription_quantity,
             r.id as requirement_id,
             COALESCE(r.requirement_type, 'NORMAL') as requirement_type,
             r.normal_quantity as req_normal_quantity,
             r.required_quantity as req_required_quantity,
             r.additional_quantity as req_additional_quantity,
             r.reason as requirement_reason
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      LEFT JOIN users u ON d.delivery_boy_id = u.id
      LEFT JOIN subscriptions s
        ON s.customer_id = d.customer_id
        AND s.product_id = d.product_id
        AND s.is_active = 1
        AND s.start_date <= d.delivery_date
        AND (s.end_date IS NULL OR s.end_date >= d.delivery_date)
      LEFT JOIN daily_delivery_requirements r 
        ON r.customer_id = d.customer_id 
        AND r.product_id = d.product_id 
        AND r.delivery_date = d.delivery_date 
        AND r.status = 'ACTIVE'
      WHERE d.delivery_date = ?
    `;
    const params = [targetDate];

    if (req.user.role === 'DELIVERY_BOY') {
      query += ` AND d.delivery_boy_id = ?`;
      params.push(req.user.id);
    } else if (delivery_boy_id) {
      query += ` AND d.delivery_boy_id = ?`;
      params.push(delivery_boy_id);
    }

    if (customer_id) {
      query += ` AND d.customer_id = ?`;
      params.push(customer_id);
    }

    if (status) {
      query += ` AND d.status = ?`;
      params.push(status);
    }

    if (route) {
      query += ` AND c.route LIKE ?`;
      params.push(`%${route}%`);
    }

    query += ` ORDER BY c.route ASC, c.name ASC, d.id ASC`;

    const deliveries = await db.prepare(query).all(...params);

    // Also include active BULK_HOTEL customers who have 0 deliveries for targetDate yet
    // so the Delivery Boy / Admin can always see their Bulk Order Card ready for manual entry
    let bulkCustQuery = `
      SELECT c.id as customer_id, c.name as customer_name, c.phone as customer_phone,
              c.address as customer_address, c.route as customer_route,
              c.customer_category, c.billing_type, c.delivery_boy_id,
              u.name as delivery_boy_name
      FROM customers c
      LEFT JOIN users u ON c.delivery_boy_id = u.id
      WHERE c.status = 'ACTIVE' AND c.customer_category = 'BULK_HOTEL'
    `;
    const bulkParams = [];

    if (req.user.role === 'DELIVERY_BOY') {
      bulkCustQuery += ` AND c.delivery_boy_id = ?`;
      bulkParams.push(req.user.id);
    } else if (delivery_boy_id) {
      bulkCustQuery += ` AND c.delivery_boy_id = ?`;
      bulkParams.push(delivery_boy_id);
    }

    if (customer_id) {
      bulkCustQuery += ` AND c.id = ?`;
      bulkParams.push(customer_id);
    }

    if (route) {
      bulkCustQuery += ` AND c.route LIKE ?`;
      bulkParams.push(`%${route}%`);
    }

    const allBulkCusts = await db.prepare(bulkCustQuery).all(...bulkParams);
    const existingDeliveryCustIds = new Set(deliveries.map(d => d.customer_id));

    // For bulk customers with no delivery rows today, append empty placeholder
    for (const bCust of allBulkCusts) {
      if (!existingDeliveryCustIds.has(bCust.customer_id)) {
        deliveries.push({
          id: `bulk_empty_${bCust.customer_id}`,
          customer_id: bCust.customer_id,
          delivery_boy_id: bCust.delivery_boy_id,
          delivery_date: targetDate,
          product_id: null,
          product_name_snapshot: null,
          category_snapshot: null,
          variant_snapshot: null,
          unit_volume_litres_snapshot: 0,
          quantity: 0,
          unit_price_snapshot: 0,
          total_product_amount: 0,
          delivery_charge_snapshot: 0,
          total_amount: 0,
          status: 'PENDING',
          notes: null,
          customer_name: bCust.customer_name,
          customer_phone: bCust.customer_phone,
          customer_address: bCust.customer_address,
          customer_route: bCust.customer_route,
          customer_category: 'BULK_HOTEL',
          billing_type: bCust.billing_type,
          delivery_boy_name: bCust.delivery_boy_name,
          requirement_type: 'NORMAL'
        });
      }
    }

    res.json(deliveries);
  } catch (err) {
    console.error('Fetch deliveries error:', err);
    res.status(500).json({ error: 'Failed to fetch deliveries' });
  }
});

// Bulk Customer Manual Products Management (Add, Edit Quantity, Remove)
router.post('/bulk-manage', verifyToken, async (req, res) => {
  try {
    const { customer_id, delivery_date, items, notes } = req.body;

    if (!customer_id || !delivery_date || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Customer, date, and items array are required.' });
    }

    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    // Authorization check for Delivery Boy
    if (req.user.role === 'DELIVERY_BOY' && customer.delivery_boy_id && customer.delivery_boy_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized for this customer.' });
    }

    const deliveryBoyId = req.user.role === 'DELIVERY_BOY' ? req.user.id : (customer.delivery_boy_id || null);
    const targetDate = delivery_date;

    // 1. Delete previous delivery rows for this customer on this date that are not finalized
    await db.prepare('DELETE FROM deliveries WHERE customer_id = ? AND delivery_date = ?').run(customer.id, targetDate);

    // 2. Insert new items
    const insertStmt = db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_boy_id, delivery_date, product_id,
        product_name_snapshot, category_snapshot, variant_snapshot,
        unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount,
        status, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, 0, ?,
        'PENDING', ?, datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `);

    for (const item of items) {
      const prodId = parseInt(item.product_id, 10);
      const qty = parseInt(item.quantity, 10);
      if (!prodId || isNaN(qty) || qty <= 0) continue;

      const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
      if (!product) continue;

      const totalProductAmount = parseFloat((product.selling_price * qty).toFixed(2));
      await insertStmt.run(
        customer.id,
        deliveryBoyId,
        targetDate,
        product.id,
        product.name,
        product.category,
        product.variant_label,
        product.unit_volume_litres || 0,
        qty,
        product.selling_price,
        totalProductAmount,
        totalProductAmount,
        notes ? `Bulk: ${notes}` : 'Bulk Daily Order'
      );
    }

    const updatedDeliveries = await db.prepare(`
      SELECT d.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             c.route as customer_route, c.customer_category, c.billing_type, u.name as delivery_boy_name
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      LEFT JOIN users u ON d.delivery_boy_id = u.id
      WHERE d.customer_id = ? AND d.delivery_date = ?
    `).all(customer.id, targetDate);

    res.json({
      message: 'Bulk order products saved successfully.',
      deliveries: updatedDeliveries
    });
  } catch (err) {
    console.error('Bulk manage products error:', err);
    res.status(500).json({ error: err.message || 'Failed to save bulk products.' });
  }
});

// Bulk Customer Delivery Confirmation (Marks all products for this customer on this date as DELIVERED)
router.post('/bulk-deliver', verifyToken, async (req, res) => {
  try {
    const { customer_id, delivery_date } = req.body;

    if (!customer_id || !delivery_date) {
      return res.status(400).json({ error: 'Customer ID and delivery date are required.' });
    }

    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    if (req.user.role === 'DELIVERY_BOY' && customer.delivery_boy_id && customer.delivery_boy_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized for this customer.' });
    }

    const targetDate = delivery_date;
    const existing = await db.prepare('SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = ?').all(customer.id, targetDate);

    if (existing.length === 0) {
      return res.status(400).json({ error: 'No products added yet. Please add products before marking delivered.' });
    }

    await db.prepare(`
      UPDATE deliveries
      SET status = 'DELIVERED', updated_at = datetime('now', 'localtime')
      WHERE customer_id = ? AND delivery_date = ?
    `).run(customer.id, targetDate);

    // Refresh monthly bill if exists
    const billingMonth = targetDate.slice(0, 7);
    const existingBill = await db.prepare('SELECT id FROM bills WHERE customer_id = ? AND billing_month = ?').get(customer.id, billingMonth);
    if (existingBill) {
      try {
        const { generateBillForCustomer } = require('../services/billingService');
        await generateBillForCustomer(customer, billingMonth, { billingBasis: 'AUTO', forceRegenerate: true });
      } catch (e) {
        console.warn('Auto bill refresh on bulk deliver notice:', e.message);
      }
    }

    res.json({
      message: `Bulk delivery for ${customer.name} marked as DELIVERED.`
    });
  } catch (err) {
    console.error('Bulk deliver error:', err);
    res.status(500).json({ error: err.message || 'Failed to mark bulk delivery as delivered.' });
  }
});

// Mark / Update delivery status (DELIVERED, SKIPPED, PENDING)
router.put('/:id/status', verifyToken, async (req, res) => {
  try {
    const deliveryId = req.params.id;
    const { status, notes } = req.body;

    if (!['DELIVERED', 'SKIPPED', 'PENDING', 'MISSED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const delivery = await db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery record not found' });
    }

    // If Delivery Boy, ensure they are assigned to this delivery
    if (req.user.role === 'DELIVERY_BOY' && delivery.delivery_boy_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to update this delivery' });
    }

    await db.prepare(`
      UPDATE deliveries
      SET status = ?, notes = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(status, notes !== undefined ? notes : delivery.notes, deliveryId);

    const updated = await db.prepare(`
      SELECT d.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             c.route as customer_route, c.customer_category, c.billing_type,
             u.name as delivery_boy_name
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      LEFT JOIN users u ON d.delivery_boy_id = u.id
      WHERE d.id = ?
    `).get(deliveryId);

    res.json(updated);
  } catch (err) {
    console.error('Update delivery status error:', err);
    res.status(500).json({ error: 'Failed to update delivery status' });
  }
});

// Bulk mark deliveries (e.g. "Mark all as delivered")
router.post('/bulk-status', verifyToken, async (req, res) => {
  try {
    const { deliveryIds, status, notes } = req.body;
    if (!Array.isArray(deliveryIds) || deliveryIds.length === 0) {
      return res.status(400).json({ error: 'deliveryIds array is required' });
    }

    if (!['DELIVERED', 'SKIPPED', 'PENDING', 'MISSED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateStmt = db.prepare(`
      UPDATE deliveries
      SET status = ?, notes = COALESCE(?, notes), updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `);

    for (const id of deliveryIds) {
      // If delivery boy, verify assignment
      if (req.user.role === 'DELIVERY_BOY') {
        const d = await db.prepare('SELECT delivery_boy_id FROM deliveries WHERE id = ?').get(id);
        if (d && d.delivery_boy_id === req.user.id) {
          await updateStmt.run(status, notes || null, id);
        }
      } else {
        await updateStmt.run(status, notes || null, id);
      }
    }

    res.json({ message: `Updated ${deliveryIds.length} deliveries to ${status}` });
  } catch (err) {
    console.error('Bulk update delivery error:', err);
    res.status(500).json({ error: 'Failed to update deliveries in bulk' });
  }
});

// Temporary Delivery Change / Edit Quantity for House Customer (Does NOT modify permanent subscription)
router.post('/temporary-change', verifyToken, async (req, res) => {
  try {
    const { customer_id, product_id, delivery_date, quantity, reason } = req.body;

    if (!customer_id || !product_id) {
      return res.status(400).json({ error: 'Customer ID and Product ID are required.' });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({ error: 'Quantity must be 0 (to skip) or a positive number.' });
    }

    const targetDate = delivery_date || getLocalDateString();
    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    // Authorization check for Delivery Boy
    if (req.user.role === 'DELIVERY_BOY' && customer.delivery_boy_id && customer.delivery_boy_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized for this customer.' });
    }

    const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    // Find permanent subscription quantity if exists
    const sub = await db.prepare(`
      SELECT * FROM subscriptions 
      WHERE customer_id = ? AND product_id = ? AND is_active = 1
        AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)
    `).get(customer.id, product.id, targetDate, targetDate);

    const normalQuantity = sub ? sub.quantity : qty;
    const reasonText = (reason || '').trim();

    // 1. Update / Upsert / Delete in daily_delivery_requirements
    if (qty === 0) {
      // Temporary Skip
      const skipReason = reasonText ? `Temporary Skip: ${reasonText}` : 'Customer requested skip today';
      const existingReq = await db.prepare(`
        SELECT id FROM daily_delivery_requirements 
        WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
      `).get(customer.id, product.id, targetDate);

      if (existingReq) {
        await db.prepare(`
          UPDATE daily_delivery_requirements
          SET requirement_type = 'SKIP_DELIVERY',
              normal_quantity = ?,
              required_quantity = 0,
              additional_quantity = 0,
              effective_quantity = 0,
              reason = ?,
              status = 'ACTIVE',
              created_by = ?,
              updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(normalQuantity, skipReason, req.user.id, existingReq.id);
      } else {
        await db.prepare(`
          INSERT INTO daily_delivery_requirements (
            customer_id, product_id, target_product_id, subscription_id, delivery_date,
            requirement_type, normal_quantity, required_quantity,
            additional_quantity, effective_quantity, reason, status,
            created_by, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            'SKIP_DELIVERY', ?, 0,
            0, 0, ?, 'ACTIVE',
            ?, datetime('now', 'localtime'), datetime('now', 'localtime')
          )
        `).run(
          customer.id, product.id, product.id, sub ? sub.id : null, targetDate,
          normalQuantity, skipReason, req.user.id
        );
      }
    } else if (sub && qty === sub.quantity && !reasonText) {
      // Reset to normal subscription if matches normal qty and no reason
      await db.prepare(`
        DELETE FROM daily_delivery_requirements 
        WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
      `).run(customer.id, product.id, targetDate);
    } else {
      // Temporary Quantity Change
      const changeReason = reasonText ? `Temporary Change: ${reasonText}` : 'Customer requested quantity change';
      const existingReq = await db.prepare(`
        SELECT id FROM daily_delivery_requirements 
        WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
      `).get(customer.id, product.id, targetDate);

      if (existingReq) {
        await db.prepare(`
          UPDATE daily_delivery_requirements
          SET requirement_type = 'CHANGE_QUANTITY',
              normal_quantity = ?,
              required_quantity = ?,
              additional_quantity = 0,
              effective_quantity = ?,
              reason = ?,
              status = 'ACTIVE',
              created_by = ?,
              updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(normalQuantity, qty, qty, changeReason, req.user.id, existingReq.id);
      } else {
        await db.prepare(`
          INSERT INTO daily_delivery_requirements (
            customer_id, product_id, target_product_id, subscription_id, delivery_date,
            requirement_type, normal_quantity, required_quantity,
            additional_quantity, effective_quantity, reason, status,
            created_by, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            'CHANGE_QUANTITY', ?, ?,
            0, ?, ?, 'ACTIVE',
            ?, datetime('now', 'localtime'), datetime('now', 'localtime')
          )
        `).run(
          customer.id, product.id, product.id, sub ? sub.id : null, targetDate,
          normalQuantity, qty, qty, changeReason, req.user.id
        );
      }
    }

    // 2. Fetch all active subscription & ad-hoc delivery items for this customer on targetDate to calculate delivery charges correctly
    const getActiveSubs = db.prepare(`
      SELECT s.*, p.name as product_name, p.category, p.variant_label, p.unit_volume_litres,
              p.selling_price, p.delivery_charge_type, p.fixed_delivery_charge
      FROM subscriptions s
      JOIN products p ON s.product_id = p.id
      WHERE s.customer_id = ? AND s.is_active = 1
        AND s.start_date <= ?
        AND (s.end_date IS NULL OR s.end_date >= ?)
    `);
    const subs = await getActiveSubs.all(customer.id, targetDate, targetDate);

    // Collect daily items for calculating delivery charge
    const dailyItems = [];
    const handledProductIds = new Set();

    for (const s of subs) {
      handledProductIds.add(s.product_id);
      let effQty = s.quantity;
      let isSkip = false;
      let itemReason = '';

      if (s.product_id === product.id) {
        if (qty === 0) {
          effQty = 0;
          isSkip = true;
          itemReason = reasonText ? `Temporary Skip: ${reasonText}` : 'Customer requested skip today';
        } else {
          effQty = qty;
          itemReason = reasonText ? `Temporary Change: ${reasonText}` : (qty !== s.quantity ? 'Temporary quantity change' : '');
        }
      } else {
        const reqRow = await db.prepare(`
          SELECT * FROM daily_delivery_requirements 
          WHERE customer_id = ? AND product_id = ? AND delivery_date = ? AND status = 'ACTIVE'
        `).get(customer.id, s.product_id, targetDate);
        if (reqRow) {
          if (reqRow.requirement_type === 'SKIP_DELIVERY') {
            effQty = 0;
            isSkip = true;
            itemReason = reqRow.reason || 'Skip Delivery';
          } else if (reqRow.requirement_type === 'CHANGE_QUANTITY') {
            effQty = reqRow.required_quantity || s.quantity;
            itemReason = reqRow.reason || '';
          } else if (reqRow.requirement_type === 'ADD_EXTRA_QUANTITY') {
            effQty = s.quantity + (reqRow.additional_quantity || 0);
            itemReason = reqRow.reason || '';
          }
        }
      }

      dailyItems.push({
        productId: s.product_id,
        productName: s.product_name,
        category: s.category,
        variantLabel: s.variant_label,
        unitVolumeLitres: s.unit_volume_litres,
        quantity: effQty,
        normalQuantity: s.quantity,
        sellingPrice: s.selling_price,
        deliveryChargeType: s.delivery_charge_type,
        fixedDeliveryCharge: s.fixed_delivery_charge,
        isSkipped: isSkip,
        note: itemReason
      });
    }

    // If targeted product was not part of subscriptions (e.g. adhoc), add it too
    if (!handledProductIds.has(product.id)) {
      dailyItems.push({
        productId: product.id,
        productName: product.name,
        category: product.category,
        variantLabel: product.variant_label,
        unitVolumeLitres: product.unit_volume_litres,
        quantity: qty,
        normalQuantity: normalQuantity,
        sellingPrice: product.selling_price,
        deliveryChargeType: product.delivery_charge_type,
        fixedDeliveryCharge: product.fixed_delivery_charge,
        isSkipped: qty === 0,
        note: reasonText
      });
    }

    // Calculate delivery charges for non-skipped items
    const calculatedCharges = calculateDeliveryChargesForCustomerDay(
      customer.customer_category,
      dailyItems.filter(it => it.quantity > 0)
    );

    // 3. Upsert / update deliveries table records
    for (const item of dailyItems) {
      const existingDel = await db.prepare(`
        SELECT * FROM deliveries 
        WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
      `).get(customer.id, item.productId, targetDate);

      if (item.isSkipped || item.quantity === 0) {
        if (existingDel) {
          await db.prepare(`
            UPDATE deliveries
            SET quantity = ?,
                total_product_amount = 0,
                delivery_charge_snapshot = 0,
                total_amount = 0,
                status = 'SKIPPED',
                notes = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
          `).run(
            item.normalQuantity || 1,
            item.note || 'Temporary Skip: Customer requested skip today',
            existingDel.id
          );
        } else {
          await db.prepare(`
            INSERT INTO deliveries (
              customer_id, delivery_boy_id, delivery_date, product_id,
              product_name_snapshot, category_snapshot, variant_snapshot,
              unit_volume_litres_snapshot, quantity, unit_price_snapshot,
              total_product_amount, delivery_charge_snapshot, total_amount,
              status, notes, created_at, updated_at
            ) VALUES (
              ?, ?, ?, ?,
              ?, ?, ?,
              ?, ?, ?,
              0, 0, 0,
              'SKIPPED', ?, datetime('now', 'localtime'), datetime('now', 'localtime')
            )
          `).run(
            customer.id, customer.delivery_boy_id || null, targetDate, item.productId,
            item.productName, item.category, item.variantLabel,
            item.unitVolumeLitres, item.normalQuantity || 1, item.sellingPrice,
            item.note || 'Temporary Skip: Customer requested skip today'
          );
        }
      } else {
        const calcItem = calculatedCharges.find(c => c.productId === item.productId);
        const totalProductAmount = parseFloat((item.sellingPrice * item.quantity).toFixed(2));
        const delCharge = calcItem ? (calcItem.deliveryCharge || 0) : 0;
        const totalAmount = parseFloat((totalProductAmount + delCharge).toFixed(2));
        const currentStatus = existingDel ? (existingDel.status === 'SKIPPED' ? 'PENDING' : existingDel.status) : 'PENDING';

        if (existingDel) {
          await db.prepare(`
            UPDATE deliveries
            SET quantity = ?,
                unit_price_snapshot = ?,
                total_product_amount = ?,
                delivery_charge_snapshot = ?,
                total_amount = ?,
                status = ?,
                notes = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
          `).run(
            item.quantity,
            item.sellingPrice,
            totalProductAmount,
            delCharge,
            totalAmount,
            currentStatus,
            item.note || '',
            existingDel.id
          );
        } else {
          await db.prepare(`
            INSERT INTO deliveries (
              customer_id, delivery_boy_id, delivery_date, product_id,
              product_name_snapshot, category_snapshot, variant_snapshot,
              unit_volume_litres_snapshot, quantity, unit_price_snapshot,
              total_product_amount, delivery_charge_snapshot, total_amount,
              status, notes, created_at, updated_at
            ) VALUES (
              ?, ?, ?, ?,
              ?, ?, ?,
              ?, ?, ?,
              ?, ?, ?,
              'PENDING', ?, datetime('now', 'localtime'), datetime('now', 'localtime')
            )
          `).run(
            customer.id, customer.delivery_boy_id || null, targetDate, item.productId,
            item.productName, item.category, item.variantLabel,
            item.unitVolumeLitres, item.quantity, item.sellingPrice,
            totalProductAmount, delCharge, totalAmount,
            item.note || ''
          );
        }
      }
    }

    // 4. Refresh monthly bill if exists for this customer/month
    const billingMonth = targetDate.slice(0, 7);
    const existingBill = await db.prepare('SELECT id FROM bills WHERE customer_id = ? AND billing_month = ?').get(customer.id, billingMonth);
    if (existingBill) {
      try {
        const { generateBillForCustomer } = require('../services/billingService');
        await generateBillForCustomer(customer, billingMonth, { billingBasis: 'AUTO', forceRegenerate: true });
      } catch (e) {
        console.warn('Auto bill refresh on temporary change notice:', e.message);
      }
    }

    // Fetch and return the updated delivery row
    const updatedDelivery = await db.prepare(`
      SELECT d.*, 
             c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             c.route as customer_route, c.customer_category, c.billing_type,
             u.name as delivery_boy_name,
             s.quantity as subscription_quantity,
             r.id as requirement_id,
             COALESCE(r.requirement_type, 'NORMAL') as requirement_type,
             r.normal_quantity as req_normal_quantity,
             r.required_quantity as req_required_quantity,
             r.reason as requirement_reason
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      LEFT JOIN users u ON d.delivery_boy_id = u.id
      LEFT JOIN subscriptions s ON s.customer_id = d.customer_id AND s.product_id = d.product_id AND s.is_active = 1
      LEFT JOIN daily_delivery_requirements r 
        ON r.customer_id = d.customer_id 
        AND r.product_id = d.product_id 
        AND r.delivery_date = d.delivery_date 
        AND r.status = 'ACTIVE'
      WHERE d.customer_id = ? AND d.product_id = ? AND d.delivery_date = ?
    `).get(customer.id, product.id, targetDate);

    res.json({
      message: qty === 0 ? 'Delivery marked as skipped for today' : `Today's quantity updated to ${qty} packet(s)`,
      delivery: updatedDelivery
    });
  } catch (err) {
    console.error('Temporary change delivery error:', err);
    res.status(500).json({ error: err.message || 'Failed to update today\'s delivery quantity' });
  }
});

// Add Extra Product / On-spot customer request (Accessible to both Delivery Boys & Admins)
router.post('/extra', verifyToken, async (req, res) => {
  try {
    const { customer_id, product_id, quantity, delivery_date, status = 'DELIVERED', notes } = req.body;

    if (!customer_id || !product_id) {
      return res.status(400).json({ error: 'Customer and product are required' });
    }

    const qty = parseInt(quantity || 1, 10);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Quantity must be at least 1' });
    }

    const targetDate = delivery_date || getLocalDateString();
    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // If Delivery Boy, ensure customer is assigned to them (if assigned)
    if (req.user.role === 'DELIVERY_BOY' && customer.delivery_boy_id && customer.delivery_boy_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized for this customer' });
    }

    const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const deliveryBoyId = req.user.role === 'DELIVERY_BOY' ? req.user.id : (customer.delivery_boy_id || null);

    let deliveryId = null;

    const existing = await db.prepare(`
      SELECT * FROM deliveries 
      WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
    `).get(customer_id, product_id, targetDate);

    if (existing) {
      // Increment quantity on existing delivery
      const newQty = (existing.status === 'SKIPPED' && existing.quantity === 0) ? qty : (existing.quantity + qty);
      const totalProductAmount = parseFloat((product.selling_price * newQty).toFixed(2));

      const calc = calculateDeliveryChargesForCustomerDay(customer.customer_category, [{
        productId: product.id,
        productName: product.name,
        category: product.category,
        variantLabel: product.variant_label,
        unitVolumeLitres: product.unit_volume_litres,
        quantity: newQty,
        sellingPrice: product.selling_price,
        deliveryChargeType: product.delivery_charge_type,
        fixedDeliveryCharge: product.fixed_delivery_charge
      }]);

      const deliveryCharge = calc[0] ? (calc[0].deliveryCharge || 0) : 0;
      const totalAmount = parseFloat((totalProductAmount + deliveryCharge).toFixed(2));
      const extraNote = notes ? ` [Extra: ${notes}]` : ` [+${qty} extra added on delivery]`;
      const updatedNotes = existing.notes ? `${existing.notes} ${extraNote}` : extraNote.trim();

      await db.prepare(`
        UPDATE deliveries
        SET quantity = ?,
            unit_price_snapshot = ?,
            total_product_amount = ?,
            delivery_charge_snapshot = ?,
            total_amount = ?,
            status = ?,
            notes = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        newQty,
        product.selling_price,
        totalProductAmount,
        deliveryCharge,
        totalAmount,
        status || 'DELIVERED',
        updatedNotes,
        existing.id
      );
      deliveryId = existing.id;
    } else {
      // Insert new delivery record
      const totalProductAmount = parseFloat((product.selling_price * qty).toFixed(2));
      const calc = calculateDeliveryChargesForCustomerDay(customer.customer_category, [{
        productId: product.id,
        productName: product.name,
        category: product.category,
        variantLabel: product.variant_label,
        unitVolumeLitres: product.unit_volume_litres,
        quantity: qty,
        sellingPrice: product.selling_price,
        deliveryChargeType: product.delivery_charge_type,
        fixedDeliveryCharge: product.fixed_delivery_charge
      }]);

      const deliveryCharge = calc[0] ? (calc[0].deliveryCharge || 0) : 0;
      const totalAmount = parseFloat((totalProductAmount + deliveryCharge).toFixed(2));

      const result = await db.prepare(`
        INSERT INTO deliveries (
          customer_id, delivery_boy_id, delivery_date, product_id,
          product_name_snapshot, category_snapshot, variant_snapshot,
          unit_volume_litres_snapshot, quantity, unit_price_snapshot,
          total_product_amount, delivery_charge_snapshot, total_amount,
          status, notes, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
        )
      `).run(
        customer.id,
        deliveryBoyId,
        targetDate,
        product.id,
        product.name,
        product.category,
        product.variant_label,
        product.unit_volume_litres,
        qty,
        product.selling_price,
        totalProductAmount,
        deliveryCharge,
        totalAmount,
        status || 'DELIVERED',
        notes ? `Extra product: ${notes}` : 'Extra product requested on delivery'
      );
      deliveryId = result.lastInsertRowid;
    }

    // If a monthly bill exists for this customer in this month, automatically refresh it
    const billingMonth = targetDate.slice(0, 7);
    const existingBill = await db.prepare(`
      SELECT id FROM bills WHERE customer_id = ? AND billing_month = ?
    `).get(customer.id, billingMonth);

    if (existingBill) {
      try {
        const { generateBillForCustomer } = require('../services/billingService');
        await generateBillForCustomer(customer, billingMonth, { billingBasis: 'AUTO', forceRegenerate: true });
      } catch (e) {
        console.warn('Auto bill refresh on extra product notice:', e.message);
      }
    }

    const fullRecord = await db.prepare(`
      SELECT d.*, 
             c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             c.route as customer_route, c.customer_category, c.billing_type,
             u.name as delivery_boy_name
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      LEFT JOIN users u ON d.delivery_boy_id = u.id
      WHERE d.id = ?
    `).get(deliveryId);

    res.status(201).json({
      message: 'Extra product recorded and added to billing successfully',
      delivery: fullRecord
    });
  } catch (err) {
    console.error('Add extra product error:', err);
    res.status(500).json({ error: err.message || 'Failed to add extra product' });
  }
});

// Add Ad-hoc / One-time delivery (Admin & Delivery Boy compatible)
router.post('/adhoc', verifyToken, async (req, res) => {
  try {
    const { customer_id, product_id, delivery_date, quantity, notes } = req.body;

    if (!customer_id || !product_id || !quantity) {
      return res.status(400).json({ error: 'Customer, product, and quantity are required' });
    }

    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
    const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);

    if (!customer || !product) {
      return res.status(404).json({ error: 'Customer or product not found' });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0' });
    }

    const targetDate = delivery_date || getLocalDateString();
    const deliveryBoyId = req.user.role === 'DELIVERY_BOY' ? req.user.id : (customer.delivery_boy_id || null);

    const existing = await db.prepare('SELECT * FROM deliveries WHERE customer_id = ? AND product_id = ? AND delivery_date = ?').get(customer_id, product_id, targetDate);

    let deliveryId;
    if (existing) {
      const newQty = existing.quantity + qty;
      const totalProduct = parseFloat((product.selling_price * newQty).toFixed(2));
      const itemCalc = calculateDeliveryChargesForCustomerDay(customer.customer_category, [{
        productId: product.id,
        productName: product.name,
        category: product.category,
        variantLabel: product.variant_label,
        unitVolumeLitres: product.unit_volume_litres,
        quantity: newQty,
        sellingPrice: product.selling_price,
        deliveryChargeType: product.delivery_charge_type,
        fixedDeliveryCharge: product.fixed_delivery_charge
      }]);
      const charge = itemCalc[0] ? (itemCalc[0].deliveryCharge || 0) : 0;
      const totalAmount = parseFloat((totalProduct + charge).toFixed(2));

      await db.prepare(`
        UPDATE deliveries
        SET quantity = ?, unit_price_snapshot = ?, total_product_amount = ?,
            delivery_charge_snapshot = ?, total_amount = ?, status = 'DELIVERED',
            notes = COALESCE(notes || ' ', '') || ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(newQty, product.selling_price, totalProduct, charge, totalAmount, ` [Adhoc +${qty}]`, existing.id);
      deliveryId = existing.id;
    } else {
      const totalProduct = parseFloat((product.selling_price * qty).toFixed(2));
      const itemCalc = calculateDeliveryChargesForCustomerDay(customer.customer_category, [{
        productId: product.id,
        productName: product.name,
        category: product.category,
        variantLabel: product.variant_label,
        unitVolumeLitres: product.unit_volume_litres,
        quantity: qty,
        sellingPrice: product.selling_price,
        deliveryChargeType: product.delivery_charge_type,
        fixedDeliveryCharge: product.fixed_delivery_charge
      }]);
      const charge = itemCalc[0] ? (itemCalc[0].deliveryCharge || 0) : 0;
      const totalAmount = parseFloat((totalProduct + charge).toFixed(2));

      const result = await db.prepare(`
        INSERT INTO deliveries (
          customer_id, delivery_boy_id, delivery_date, product_id,
          product_name_snapshot, category_snapshot, variant_snapshot,
          unit_volume_litres_snapshot, quantity, unit_price_snapshot,
          total_product_amount, delivery_charge_snapshot, total_amount,
          status, notes, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          'DELIVERED', ?, datetime('now', 'localtime'), datetime('now', 'localtime')
        )
      `).run(
        customer.id,
        deliveryBoyId,
        targetDate,
        product.id,
        product.name,
        product.category,
        product.variant_label,
        product.unit_volume_litres,
        qty,
        product.selling_price,
        totalProduct,
        charge,
        totalAmount,
        notes || 'Ad-hoc delivery'
      );
      deliveryId = result.lastInsertRowid;
    }

    const created = await db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
    res.status(201).json(created);
  } catch (err) {
    console.error('Adhoc delivery error:', err);
    res.status(500).json({ error: 'Failed to record delivery' });
  }
});

module.exports = router;
