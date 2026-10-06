const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin, verifyToken } = require('../middleware/auth');
const { calculateDeliveryChargesForCustomerDay } = require('../services/deliveryChargeService');
const { getLocalDateString } = require('../utils/dateUtils');

/**
 * Recalculate and update pending delivery record for a customer on a given date
 * based on current daily requirement (including product change) or normal subscription.
 */
async function updatePendingDeliveryForRequirement(customerId, productId, deliveryDate, requirement) {
  const delivery = await db.prepare(`
    SELECT * FROM deliveries 
    WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
  `).get(customerId, productId, deliveryDate);

  if (!delivery || delivery.status === 'DELIVERED') {
    // If delivery doesn't exist yet or already marked DELIVERED, preserve historical delivery
    return;
  }

  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  const baseProduct = await db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!customer || !baseProduct) return;

  const targetProductId = requirement?.target_product_id || productId;
  const effectiveProduct = (await db.prepare('SELECT * FROM products WHERE id = ?').get(targetProductId)) || baseProduct;

  // Find all active subscriptions for this customer on deliveryDate to correctly calculate tiered delivery charges
  const getActiveSubs = db.prepare(`
    SELECT s.*, p.name as product_name, p.category, p.variant_label, p.unit_volume_litres,
           p.selling_price, p.delivery_charge_type, p.fixed_delivery_charge
    FROM subscriptions s
    JOIN products p ON s.product_id = p.id
    WHERE s.customer_id = ? AND s.is_active = 1
      AND s.start_date <= ?
      AND (s.end_date IS NULL OR s.end_date >= ?)
  `);
  const subs = await getActiveSubs.all(customerId, deliveryDate, deliveryDate);

  // Determine effective quantity and product for each subscription item on that day
  const dailyItems = await Promise.all(subs.map(async s => {
    let effectiveQty = s.quantity;
    let reqRow = null;

    if (s.product_id === productId) {
      reqRow = requirement;
    } else {
      reqRow = await db.prepare(`
        SELECT * FROM daily_delivery_requirements 
        WHERE customer_id = ? AND product_id = ? AND delivery_date = ? AND status = 'ACTIVE'
      `).get(customerId, s.product_id, deliveryDate);
    }

    if (reqRow && reqRow.requirement_type === 'SKIP_DELIVERY') {
      effectiveQty = 0;
    } else if (reqRow && reqRow.requirement_type === 'CHANGE_QUANTITY') {
      effectiveQty = reqRow.required_quantity || s.quantity;
    } else if (reqRow && reqRow.requirement_type === 'ADD_EXTRA_QUANTITY') {
      effectiveQty = s.quantity + (reqRow.additional_quantity || 0);
    }

    const itemProdId = (reqRow && reqRow.target_product_id) ? reqRow.target_product_id : s.product_id;
    const itemProd = (itemProdId === s.product_id) ? s : ((await db.prepare('SELECT * FROM products WHERE id = ?').get(itemProdId)) || s);

    return {
      subscriptionId: s.id,
      productId: itemProdId,
      productName: itemProd.name || s.product_name,
      category: itemProd.category || s.category,
      variantLabel: itemProd.variant_label || s.variant_label,
      unitVolumeLitres: itemProd.unit_volume_litres || s.unit_volume_litres,
      quantity: effectiveQty,
      sellingPrice: itemProd.selling_price || s.selling_price,
      deliveryChargeType: itemProd.delivery_charge_type || s.delivery_charge_type,
      fixedDeliveryCharge: itemProd.fixed_delivery_charge || s.fixed_delivery_charge,
      isSkipped: reqRow && reqRow.requirement_type === 'SKIP_DELIVERY',
      reason: reqRow ? reqRow.reason : ''
    };
  }));

  const calculated = calculateDeliveryChargesForCustomerDay(
    customer.customer_category,
    dailyItems.filter(it => it.quantity > 0)
  );

  const targetCalculated = calculated.find(c => c.productId === targetProductId);

  if (requirement && requirement.requirement_type === 'SKIP_DELIVERY') {
    await db.prepare(`
      UPDATE deliveries
      SET status = 'SKIPPED',
          quantity = ?,
          total_product_amount = 0,
          delivery_charge_snapshot = 0,
          total_amount = 0,
          notes = ?,
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      requirement.normal_quantity || delivery.quantity,
      requirement.reason ? `Customer Requirement: ${requirement.reason}` : 'Customer Requirement: Skip Delivery',
      delivery.id
    );
  } else if (targetCalculated) {
    const totalProd = parseFloat((targetCalculated.sellingPrice * targetCalculated.quantity).toFixed(2));
    const delCharge = targetCalculated.deliveryCharge || 0;
    const totalAmt = parseFloat((totalProd + delCharge).toFixed(2));
    
    let noteText = requirement && requirement.reason ? `Requirement: ${requirement.reason}` : '';
    if (targetProductId !== productId) {
      noteText = `Product changed from ${baseProduct.name} to ${effectiveProduct.name}. ${noteText}`.trim();
    }

    await db.prepare(`
      UPDATE deliveries
      SET product_id = ?,
          product_name_snapshot = ?,
          category_snapshot = ?,
          variant_snapshot = ?,
          unit_volume_litres_snapshot = ?,
          quantity = ?,
          unit_price_snapshot = ?,
          total_product_amount = ?,
          delivery_charge_snapshot = ?,
          total_amount = ?,
          status = 'PENDING',
          notes = ?,
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      targetProductId,
      effectiveProduct.name,
      effectiveProduct.category,
      effectiveProduct.variant_label,
      effectiveProduct.unit_volume_litres || 0,
      targetCalculated.quantity,
      targetCalculated.sellingPrice,
      totalProd,
      delCharge,
      totalAmt,
      noteText,
      delivery.id
    );
  } else {
    // Normal restoration if requirement was removed
    const normalSub = subs.find(s => s.product_id === productId);
    const normalQty = normalSub ? normalSub.quantity : delivery.quantity;
    const prodPrice = baseProduct.selling_price;
    const totalProd = parseFloat((prodPrice * normalQty).toFixed(2));

    await db.prepare(`
      UPDATE deliveries
      SET product_id = ?,
          product_name_snapshot = ?,
          category_snapshot = ?,
          variant_snapshot = ?,
          unit_volume_litres_snapshot = ?,
          quantity = ?,
          unit_price_snapshot = ?,
          total_product_amount = ?,
          total_amount = ?,
          status = 'PENDING',
          notes = '',
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      baseProduct.id,
      baseProduct.name,
      baseProduct.category,
      baseProduct.variant_label,
      baseProduct.unit_volume_litres || 0,
      normalQty,
      prodPrice,
      totalProd,
      totalProd,
      delivery.id
    );
  }
}

/**
 * GET /api/daily-requirements
 * Returns all customer delivery requirements for a specified date (both subscription and bulk orders)
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const { date, delivery_boy_id, route, search, requirement_type } = req.query;
    const targetDate = date || getLocalDateString();

    // If Delivery Boy, restrict to their assigned customers only
    const isDeliveryBoy = req.user.role === 'DELIVERY_BOY';
    const effectiveDeliveryBoyId = isDeliveryBoy ? req.user.id : delivery_boy_id;

    // Fetch both subscription-based requirements and standalone bulk order requirements
    let query = `
      SELECT 
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        c.address as customer_address,
        c.route as customer_route,
        c.customer_category,
        c.billing_type,
        c.delivery_boy_id,
        u.name as delivery_boy_name,
        s.id as subscription_id,
        s.quantity as normal_quantity,
        s.start_date as subscription_start_date,
        s.end_date as subscription_end_date,
        p.id as product_id,
        p.name as product_name,
        p.category as product_category,
        p.variant_label,
        p.unit_volume_litres,
        p.selling_price,
        r.id as requirement_id,
        COALESCE(r.requirement_type, 'NORMAL') as requirement_type,
        r.target_product_id,
        tp.name as target_product_name,
        tp.variant_label as target_variant_label,
        tp.selling_price as target_selling_price,
        r.required_quantity,
        r.additional_quantity,
        COALESCE(r.effective_quantity, s.quantity) as effective_quantity,
        r.reason,
        COALESCE(r.status, 'ACTIVE') as requirement_status,
        r.updated_at as requirement_updated_at,
        del.status as delivery_status,
        del.id as delivery_id
      FROM customers c
      JOIN subscriptions s ON c.id = s.customer_id AND s.is_active = 1
      JOIN products p ON s.product_id = p.id
      LEFT JOIN users u ON c.delivery_boy_id = u.id
      LEFT JOIN daily_delivery_requirements r 
        ON r.customer_id = c.id 
        AND r.product_id = p.id 
        AND r.delivery_date = ?
      LEFT JOIN products tp ON r.target_product_id = tp.id
      LEFT JOIN deliveries del
        ON del.customer_id = c.id
        AND del.product_id = p.id
        AND del.delivery_date = ?
      WHERE c.status = 'ACTIVE'
        AND s.start_date <= ?
        AND (s.end_date IS NULL OR s.end_date = '' OR s.end_date >= ?)

      UNION ALL

      -- Standalone Bulk Orders / Requirements without recurring subscriptions
      SELECT 
        c.id as customer_id,
        c.name as customer_name,
        c.phone as customer_phone,
        c.address as customer_address,
        c.route as customer_route,
        c.customer_category,
        c.billing_type,
        c.delivery_boy_id,
        u.name as delivery_boy_name,
        NULL as subscription_id,
        0 as normal_quantity,
        NULL as subscription_start_date,
        NULL as subscription_end_date,
        p.id as product_id,
        p.name as product_name,
        p.category as product_category,
        p.variant_label,
        p.unit_volume_litres,
        p.selling_price,
        r.id as requirement_id,
        COALESCE(r.requirement_type, 'CHANGE_QUANTITY') as requirement_type,
        r.target_product_id,
        tp.name as target_product_name,
        tp.variant_label as target_variant_label,
        tp.selling_price as target_selling_price,
        r.required_quantity,
        r.additional_quantity,
        r.effective_quantity,
        r.reason,
        COALESCE(r.status, 'ACTIVE') as requirement_status,
        r.updated_at as requirement_updated_at,
        del.status as delivery_status,
        del.id as delivery_id
      FROM daily_delivery_requirements r
      JOIN customers c ON r.customer_id = c.id
      JOIN products p ON r.product_id = p.id
      LEFT JOIN users u ON c.delivery_boy_id = u.id
      LEFT JOIN products tp ON r.target_product_id = tp.id
      LEFT JOIN deliveries del
        ON del.customer_id = c.id
        AND del.product_id = p.id
        AND del.delivery_date = ?
      WHERE r.delivery_date = ?
        AND r.subscription_id IS NULL
        AND r.status = 'ACTIVE'
    `;

    const params = [targetDate, targetDate, targetDate, targetDate, targetDate, targetDate];

    // Wrap in outer query to filter and sort unified results cleanly
    let outerQuery = `SELECT * FROM (${query}) q WHERE 1=1`;
    const outerParams = [...params];

    if (effectiveDeliveryBoyId) {
      outerQuery += ` AND q.delivery_boy_id = ?`;
      outerParams.push(effectiveDeliveryBoyId);
    }

    if (route) {
      outerQuery += ` AND q.customer_route LIKE ?`;
      outerParams.push(`%${route}%`);
    }

    if (requirement_type && requirement_type !== 'ALL') {
      if (requirement_type === 'SPECIAL') {
        outerQuery += ` AND q.requirement_type IN ('SKIP_DELIVERY', 'CHANGE_QUANTITY', 'ADD_EXTRA_QUANTITY')`;
      } else if (requirement_type === 'NORMAL') {
        outerQuery += ` AND (q.requirement_type IS NULL OR q.requirement_type = 'NORMAL')`;
      } else {
        outerQuery += ` AND q.requirement_type = ?`;
        outerParams.push(requirement_type);
      }
    }

    if (search) {
      outerQuery += ` AND (q.customer_name LIKE ? OR q.customer_phone LIKE ? OR q.customer_address LIKE ? OR q.product_name LIKE ?)`;
      const sTerm = `%${search}%`;
      outerParams.push(sTerm, sTerm, sTerm, sTerm);
    }

    outerQuery += ` ORDER BY q.customer_route ASC, q.customer_name ASC, q.product_name ASC`;

    const items = await db.prepare(outerQuery).all(...outerParams);
    res.json(items);
  } catch (err) {
    console.error('Fetch daily requirements error:', err);
    res.status(500).json({ error: 'Failed to fetch daily delivery requirements' });
  }
});

/**
 * GET /api/daily-requirements/summary
 * Returns summary stats for the selected date including bulk requirements
 */
router.get('/summary', verifyToken, async (req, res) => {
  try {
    const { date, delivery_boy_id } = req.query;
    const targetDate = date || getLocalDateString();
    const isDeliveryBoy = req.user.role === 'DELIVERY_BOY';
    const effectiveDeliveryBoyId = isDeliveryBoy ? req.user.id : delivery_boy_id;

    let custCountQuery = `
      SELECT COUNT(DISTINCT customer_id) as total_customers, COUNT(*) as total_deliveries
      FROM (
        SELECT c.id as customer_id
        FROM customers c
        JOIN subscriptions s ON c.id = s.customer_id AND s.is_active = 1
        WHERE c.status = 'ACTIVE'
          AND s.start_date <= ?
          AND (s.end_date IS NULL OR s.end_date = '' OR s.end_date >= ?)
          ${effectiveDeliveryBoyId ? 'AND c.delivery_boy_id = ?' : ''}
        UNION ALL
        SELECT r.customer_id
        FROM daily_delivery_requirements r
        JOIN customers c ON r.customer_id = c.id
        WHERE r.delivery_date = ? AND r.subscription_id IS NULL AND r.status = 'ACTIVE'
          ${effectiveDeliveryBoyId ? 'AND c.delivery_boy_id = ?' : ''}
      )
    `;
    const custParams = [targetDate, targetDate];
    if (effectiveDeliveryBoyId) custParams.push(effectiveDeliveryBoyId);
    custParams.push(targetDate);
    if (effectiveDeliveryBoyId) custParams.push(effectiveDeliveryBoyId);

    const custTotals = await db.prepare(custCountQuery).get(...custParams);

    let reqCountQuery = `
      SELECT 
        COUNT(CASE WHEN r.requirement_type IN ('SKIP_DELIVERY', 'CHANGE_QUANTITY', 'ADD_EXTRA_QUANTITY') THEN 1 END) as special_requirements,
        COUNT(CASE WHEN r.requirement_type = 'SKIP_DELIVERY' THEN 1 END) as skip_deliveries,
        COUNT(CASE WHEN r.requirement_type = 'CHANGE_QUANTITY' THEN 1 END) as quantity_changes,
        COUNT(CASE WHEN r.requirement_type = 'ADD_EXTRA_QUANTITY' THEN 1 END) as extra_quantities
      FROM daily_delivery_requirements r
      JOIN customers c ON r.customer_id = c.id
      WHERE r.delivery_date = ? AND r.status = 'ACTIVE'
    `;
    const reqParams = [targetDate];
    if (effectiveDeliveryBoyId) {
      reqCountQuery += ` AND c.delivery_boy_id = ?`;
      reqParams.push(effectiveDeliveryBoyId);
    }
    const reqTotals = await db.prepare(reqCountQuery).get(...reqParams);

    res.json({
      date: targetDate,
      totalCustomers: custTotals?.total_customers || 0,
      totalDeliveries: custTotals?.total_deliveries || 0,
      specialRequirements: reqTotals?.special_requirements || 0,
      skipDeliveries: reqTotals?.skip_deliveries || 0,
      quantityChanges: reqTotals?.quantity_changes || 0,
      extraQuantity: reqTotals?.extra_quantities || 0
    });
  } catch (err) {
    console.error('Fetch daily summary error:', err);
    res.status(500).json({ error: 'Failed to fetch requirements summary' });
  }
});

/**
 * POST /api/daily-requirements/bulk-order
 * Allows Admin to directly add bulk order requirements by choosing products and quantities.
 * Immediately registers in daily requirements and creates pending delivery records visible to delivery boy.
 */
router.post('/bulk-order', requireAdmin, async (req, res) => {
  try {
    const { customer_id, delivery_date, delivery_boy_id, items, notes } = req.body;

    if (!customer_id || !delivery_date || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Customer, date, and at least one product item are required.' });
    }

    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const targetDate = delivery_date;
    const finalDboyId = delivery_boy_id || customer.delivery_boy_id || null;

    // If customer has no delivery boy assigned and one was selected, update customer
    if (finalDboyId && !customer.delivery_boy_id) {
      await db.prepare('UPDATE customers SET delivery_boy_id = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(finalDboyId, customer.id);
    }

    for (const item of items) {
      const prodId = parseInt(item.product_id, 10);
      const qty = parseInt(item.quantity, 10);
      if (!prodId || isNaN(qty) || qty <= 0) continue;

      const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
      if (!product) continue;

      const reasonText = notes ? `Bulk Order: ${notes}` : 'Bulk Order Requirement';

      // 1. Upsert into daily_delivery_requirements
      const existingReq = await db.prepare(`
        SELECT * FROM daily_delivery_requirements 
        WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
      `).get(customer.id, prodId, targetDate);

      if (existingReq) {
        await db.prepare(`
          UPDATE daily_delivery_requirements
          SET required_quantity = ?,
              effective_quantity = ?,
              requirement_type = 'CHANGE_QUANTITY',
              reason = ?,
              status = 'ACTIVE',
              created_by = ?,
              updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(qty, qty, reasonText, req.user.id, existingReq.id);
      } else {
        await db.prepare(`
          INSERT INTO daily_delivery_requirements (
            customer_id, product_id, target_product_id, subscription_id, delivery_date,
            requirement_type, normal_quantity, required_quantity,
            additional_quantity, effective_quantity, reason, status,
            created_by, created_at, updated_at
          ) VALUES (
            ?, ?, ?, NULL, ?,
            'CHANGE_QUANTITY', 0, ?,
            0, ?, ?, 'ACTIVE',
            ?, datetime('now', 'localtime'), datetime('now', 'localtime')
          )
        `).run(customer.id, prodId, prodId, targetDate, qty, qty, reasonText, req.user.id);
      }

      // 2. Upsert into deliveries table so it is immediately visible to the Delivery Boy
      const totalProd = parseFloat((product.selling_price * qty).toFixed(2));
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
      const charge = calc[0] ? (calc[0].deliveryCharge || 0) : 0;
      const totalAmt = parseFloat((totalProd + charge).toFixed(2));

      const existingDel = await db.prepare(`
        SELECT * FROM deliveries 
        WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
      `).get(customer.id, prodId, targetDate);

      if (existingDel) {
        await db.prepare(`
          UPDATE deliveries
          SET delivery_boy_id = ?,
              quantity = ?,
              unit_price_snapshot = ?,
              total_product_amount = ?,
              delivery_charge_snapshot = ?,
              total_amount = ?,
              status = 'PENDING',
              notes = ?,
              updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(finalDboyId, qty, product.selling_price, totalProd, charge, totalAmt, reasonText, existingDel.id);
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
          customer.id,
          finalDboyId,
          targetDate,
          product.id,
          product.name,
          product.category,
          product.variant_label,
          product.unit_volume_litres || 0,
          qty,
          product.selling_price,
          totalProd,
          charge,
          totalAmt,
          reasonText
        );
      }
    }

    res.status(201).json({
      message: `Bulk order requirement registered and sent to delivery boy queue for ${targetDate}`,
      customer_name: customer.name
    });
  } catch (err) {
    console.error('Create bulk order requirement error:', err);
    res.status(500).json({ error: err.message || 'Failed to create bulk order requirement.' });
  }
});

/**
 * POST /api/daily-requirements
 * Save or Upsert a daily requirement (Admin only)
 */
router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      customer_id,
      product_id,
      target_product_id,
      subscription_id,
      delivery_date,
      requirement_type,
      normal_quantity = 1,
      required_quantity,
      additional_quantity = 0,
      reason = ''
    } = req.body;

    if (!customer_id || !product_id || !delivery_date || !requirement_type) {
      return res.status(400).json({ error: 'Customer, product, date, and requirement type are required.' });
    }

    if (!['NORMAL', 'SKIP_DELIVERY', 'CHANGE_QUANTITY', 'ADD_EXTRA_QUANTITY'].includes(requirement_type)) {
      return res.status(400).json({ error: 'Invalid requirement type.' });
    }

    const normQty = parseInt(normal_quantity, 10) || 1;
    let reqQty = required_quantity !== undefined && required_quantity !== null && required_quantity !== '' ? parseInt(required_quantity, 10) : null;
    let addQty = parseInt(additional_quantity, 10) || 0;
    let effQty = normQty;
    const effTargetProdId = target_product_id ? parseInt(target_product_id, 10) : product_id;

    if (requirement_type === 'SKIP_DELIVERY') {
      effQty = 0;
      reqQty = 0;
      addQty = 0;
    } else if (requirement_type === 'CHANGE_QUANTITY') {
      if (!reqQty || reqQty <= 0) {
        return res.status(400).json({ error: 'Please enter a valid required quantity greater than 0.' });
      }
      effQty = reqQty;
      addQty = 0;
    } else if (requirement_type === 'ADD_EXTRA_QUANTITY') {
      if (!addQty || addQty <= 0) {
        return res.status(400).json({ error: 'Please enter additional quantity greater than 0.' });
      }
      effQty = normQty + addQty;
      reqQty = effQty;
    }

    // If NORMAL, remove any custom requirement row
    if (requirement_type === 'NORMAL') {
      await db.prepare(`
        DELETE FROM daily_delivery_requirements
        WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
      `).run(customer_id, product_id, delivery_date);

      // Update pending delivery to normal
      await updatePendingDeliveryForRequirement(customer_id, product_id, delivery_date, null);

      return res.json({
        message: 'Requirement cleared to Normal subscription.',
        requirement: null
      });
    }

    // Upsert into daily_delivery_requirements table
    const existing = await db.prepare(`
      SELECT * FROM daily_delivery_requirements
      WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
    `).get(customer_id, product_id, delivery_date);

    let requirementId = null;

    if (existing) {
      await db.prepare(`
        UPDATE daily_delivery_requirements
        SET subscription_id = ?,
            target_product_id = ?,
            requirement_type = ?,
            normal_quantity = ?,
            required_quantity = ?,
            additional_quantity = ?,
            effective_quantity = ?,
            reason = ?,
            status = 'ACTIVE',
            created_by = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        subscription_id || existing.subscription_id,
        effTargetProdId,
        requirement_type,
        normQty,
        reqQty,
        addQty,
        effQty,
        reason,
        req.user.id,
        existing.id
      );
      requirementId = existing.id;
    } else {
      const insertStmt = db.prepare(`
        INSERT INTO daily_delivery_requirements (
          customer_id, product_id, target_product_id, subscription_id, delivery_date,
          requirement_type, normal_quantity, required_quantity,
          additional_quantity, effective_quantity, reason, status,
          created_by, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, 'ACTIVE',
          ?, datetime('now', 'localtime'), datetime('now', 'localtime')
        )
      `);

      const info = await insertStmt.run(
        customer_id,
        product_id,
        effTargetProdId,
        subscription_id || null,
        delivery_date,
        requirement_type,
        normQty,
        reqQty,
        addQty,
        effQty,
        reason,
        req.user.id
      );
      requirementId = info.lastInsertRowid;
    }

    const savedRequirement = await db.prepare('SELECT * FROM daily_delivery_requirements WHERE id = ?').get(requirementId);

    // Automatically sync pending delivery record
    await updatePendingDeliveryForRequirement(customer_id, product_id, delivery_date, savedRequirement);

    res.json({
      message: 'Daily requirement saved successfully!',
      requirement: savedRequirement
    });
  } catch (err) {
    console.error('Save daily requirement error:', err);
    res.status(500).json({ error: err.message || 'Failed to save daily requirement.' });
  }
});

/**
 * DELETE /api/daily-requirements/:id
 * Clear / Delete a requirement (Admin only)
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const requirementId = req.params.id;
    const reqRow = await db.prepare('SELECT * FROM daily_delivery_requirements WHERE id = ?').get(requirementId);

    if (!reqRow) {
      return res.status(404).json({ error: 'Requirement not found.' });
    }

    await db.prepare('DELETE FROM daily_delivery_requirements WHERE id = ?').run(requirementId);

    // Restore pending delivery record
    await updatePendingDeliveryForRequirement(reqRow.customer_id, reqRow.product_id, reqRow.delivery_date, null);

    res.json({
      message: 'Requirement removed successfully and returned to normal subscription.',
      id: requirementId
    });
  } catch (err) {
    console.error('Delete daily requirement error:', err);
    res.status(500).json({ error: 'Failed to delete daily requirement.' });
  }
});

module.exports = router;
