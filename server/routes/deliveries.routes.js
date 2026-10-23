const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin, verifyToken } = require('../middleware/auth');
const { calculateDeliveryChargesForCustomerDay } = require('../services/deliveryChargeService');
const { getLocalDateString } = require('../utils/dateUtils');
const {
  checkCorrectionFinancialSafety,
  correctDelivery,
  getDeliveryCorrectionHistory
} = require('../services/deliveryCorrectionService');
const {
  isCustomerAuthorized,
  isDeliveryAuthorized,
  getDeliveryBoyAuthorizedZoneIds,
  getDeliveryBoyAssignedRouteIds
} = require('../services/routeAuthService');
const {
  deductCouponsForDelivery,
  revertCouponsForDelivery
} = require('../services/couponService');

/**
 * Ensures pending delivery items exist for a given date based on active customer subscriptions.
 * Bulk / Hotel customers are strictly excluded from automatic subscriptions (they are manual daily).
 */
/**
 * Ensures pending delivery items exist for a given date based on active customer subscriptions.
 * Bulk / Hotel customers are strictly excluded from automatic subscriptions (they are manual daily).
 */
async function syncDeliveriesForDate(dateStr, deliveryBoyId = null, agentId = null) {
  let authorizedZoneIds = [];
  if (deliveryBoyId) {
    try {
      authorizedZoneIds = await getDeliveryBoyAuthorizedZoneIds(deliveryBoyId, agentId || 1);
    } catch (e) {
      console.warn('Sync route zone lookup warning:', e.message);
    }
  }

  // FAST-PATH: Check if any active subscription on this date is missing from deliveries table.
  // If all deliveries are already generated and up-to-date, return immediately in 1 quick query.
  let missingSql = `
    SELECT s.id 
    FROM subscriptions s
    JOIN customers c ON s.customer_id = c.id
    WHERE s.is_active = 1
      AND s.start_date <= ?
      AND (s.end_date IS NULL OR s.end_date >= ?)
      AND c.status = 'ACTIVE'
      AND c.customer_category != 'BULK_HOTEL'
  `;
  const missingParams = [dateStr, dateStr];

  if (agentId) {
    missingSql += ` AND (c.agent_id = ? OR c.agent_id IS NULL)`;
    missingParams.push(agentId);
  }
  if (deliveryBoyId) {
    if (authorizedZoneIds.length > 0) {
      const zPlaceholders = authorizedZoneIds.map(() => '?').join(', ');
      missingSql += ` AND (c.delivery_boy_id = ? OR c.zone_id IN (${zPlaceholders}))`;
      missingParams.push(deliveryBoyId, ...authorizedZoneIds);
    } else {
      missingSql += ` AND c.delivery_boy_id = ?`;
      missingParams.push(deliveryBoyId);
    }
  }

  missingSql += `
      AND NOT EXISTS (
        SELECT 1 FROM deliveries d
        WHERE d.customer_id = s.customer_id
          AND d.delivery_date = ?
          AND (d.product_id = s.product_id OR EXISTS (
            SELECT 1 FROM daily_delivery_requirements r
            WHERE r.customer_id = s.customer_id AND r.product_id = s.product_id
              AND r.delivery_date = ? AND r.status = 'ACTIVE' AND r.target_product_id = d.product_id
          ))
      )
    LIMIT 1
  `;
  missingParams.push(dateStr, dateStr);

  const missingCheck = await db.prepare(missingSql).get(...missingParams);

  if (!missingCheck) {
    return;
  }

  // Find all active HOUSE customers (Bulk/Hotel customers do NOT use automatic subscriptions)
  let custQuery = `SELECT * FROM customers WHERE status = 'ACTIVE' AND customer_category != 'BULK_HOTEL'`;
  const params = [];
  if (agentId) {
    custQuery += ` AND (agent_id = ? OR agent_id IS NULL)`;
    params.push(agentId);
  }
  if (deliveryBoyId) {
    if (authorizedZoneIds.length > 0) {
      const zPlaceholders = authorizedZoneIds.map(() => '?').join(', ');
      custQuery += ` AND (delivery_boy_id = ? OR zone_id IN (${zPlaceholders}))`;
      params.push(deliveryBoyId, ...authorizedZoneIds);
    } else {
      custQuery += ` AND delivery_boy_id = ?`;
      params.push(deliveryBoyId);
    }
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
      status, notes, agent_id, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `);

  const getRequirement = db.prepare(`
    SELECT * FROM daily_delivery_requirements
    WHERE customer_id = ? AND (product_id = ? OR target_product_id = ?) AND delivery_date = ? AND status = 'ACTIVE'
  `);

  for (const cust of customers) {
    const subs = await getActiveSubs.all(cust.id, dateStr, dateStr);
    if (!subs || subs.length === 0) continue;

    // Group subscription items with daily requirements applied
    const items = await Promise.all(subs.map(async s => {
      const reqRow = await getRequirement.get(cust.id, s.product_id, s.product_id, dateStr);
      let effQty = s.quantity;
      let isSkipped = false;
      let reqReason = '';
      let isCustomTarget = false;
      let targetProd = null;

      if (reqRow) {
        if (reqRow.target_product_id && reqRow.target_product_id !== s.product_id) {
          const tp = await db.prepare('SELECT * FROM products WHERE id = ?').get(reqRow.target_product_id);
          if (tp) {
            targetProd = tp;
            isCustomTarget = true;
          }
        }
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

      const activeProduct = isCustomTarget ? targetProd : s;
      const resolvedProductId = isCustomTarget ? targetProd.id : s.product_id;
      const resolvedProductName = isCustomTarget ? targetProd.name : s.product_name;

      return {
        subscriptionId: s.id,
        productId: resolvedProductId,
        productName: resolvedProductName,
        category: activeProduct.category,
        variantLabel: activeProduct.variant_label,
        unitVolumeLitres: activeProduct.unit_volume_litres,
        quantity: effQty,
        normalQuantity: s.quantity,
        sellingPrice: activeProduct.selling_price,
        deliveryChargeType: activeProduct.delivery_charge_type,
        fixedDeliveryCharge: activeProduct.fixed_delivery_charge,
        isSkipped,
        reqReason,
        baseSubscriptionProductId: s.product_id
      };
    }));

    const calculated = calculateDeliveryChargesForCustomerDay(
      cust.customer_category,
      items.filter(it => it.quantity > 0)
    );

    for (const item of items) {
      if (item.baseSubscriptionProductId && item.productId !== item.baseSubscriptionProductId) {
        // If an old delivery with baseSubscriptionProductId was generated, remove it so target product takes its place
        const oldBaseDel = await checkExisting.get(cust.id, item.baseSubscriptionProductId, dateStr);
        if (oldBaseDel) {
          await db.prepare('DELETE FROM deliveries WHERE id = ?').run(oldBaseDel.id);
        }
      }

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
            item.reqReason || 'Customer Requirement: Skip Delivery',
            cust.agent_id || agentId || 1
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
            item.reqReason || '',
            cust.agent_id || agentId || 1
          );
        }
      }
    }
  }
}

// Get deliveries for a date with full filters (Includes active Bulk Customers starting with 0 products)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { date, status, delivery_boy_id, customer_id, route, route_id } = req.query;
    const targetDate = date || getLocalDateString();
    const agentId = req.agentId || 1;

    let authorizedZoneIds = [];
    if (req.user.role === 'DELIVERY_BOY') {
      const assignedRouteIds = await getDeliveryBoyAssignedRouteIds(req.user.id, agentId);
      // If delivery boy has no routes assigned, return empty list []
      if (assignedRouteIds.length === 0) {
        return res.json([]);
      }
      authorizedZoneIds = await getDeliveryBoyAuthorizedZoneIds(req.user.id, agentId);
    }

    // Sync deliveries from active subscriptions for HOUSE customers
    const reqDboyId = req.user.role === 'DELIVERY_BOY' ? req.user.id : delivery_boy_id;
    await syncDeliveriesForDate(targetDate, reqDboyId, agentId);

    let query = `
      SELECT d.*, 
             c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             c.route as customer_route, c.customer_category, c.billing_type,
             c.serial_no as customer_serial_no, c.serial_no,
             c.zone_id, c.flat_no,
             z.name as zone_name, z.address as zone_address, z.route_order as zone_route_order, z.image_url as zone_image_url,
             z.route_id,
             u.name as delivery_boy_name,
             p.image_url as product_image_url,
             s.quantity as subscription_quantity,
             s.product_id as subscription_product_id,
             r.id as requirement_id,
             COALESCE(r.requirement_type, 'NORMAL') as requirement_type,
             r.product_id as req_base_product_id,
             r.target_product_id,
             r.normal_quantity as req_normal_quantity,
             r.required_quantity as req_required_quantity,
             r.additional_quantity as req_additional_quantity,
             r.reason as requirement_reason
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      LEFT JOIN zones z ON c.zone_id = z.id
      LEFT JOIN products p ON d.product_id = p.id
      LEFT JOIN users u ON d.delivery_boy_id = u.id
      LEFT JOIN daily_delivery_requirements r 
        ON r.customer_id = d.customer_id 
        AND (r.target_product_id = d.product_id OR r.product_id = d.product_id)
        AND r.delivery_date = d.delivery_date 
        AND r.status = 'ACTIVE'
      LEFT JOIN subscriptions s
        ON s.customer_id = d.customer_id
        AND (s.product_id = d.product_id OR (r.product_id IS NOT NULL AND s.product_id = r.product_id))
        AND s.is_active = 1
        AND s.start_date <= d.delivery_date
        AND (s.end_date IS NULL OR s.end_date >= d.delivery_date)
      WHERE d.delivery_date = ? AND (d.agent_id = ? OR c.agent_id = ?)
    `;
    const params = [targetDate, agentId, agentId];

    if (req.user.role === 'DELIVERY_BOY') {
      if (authorizedZoneIds.length > 0) {
        const zonePlaceholders = authorizedZoneIds.map(() => '?').join(', ');
        query += ` AND (d.delivery_boy_id = ? OR c.zone_id IN (${zonePlaceholders}))`;
        params.push(req.user.id, ...authorizedZoneIds);
      } else {
        query += ` AND d.delivery_boy_id = ?`;
        params.push(req.user.id);
      }
    } else if (delivery_boy_id) {
      query += ` AND d.delivery_boy_id = ?`;
      params.push(delivery_boy_id);
    }

    if (route_id) {
      query += ` AND z.route_id = ?`;
      params.push(route_id);
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

    query += ` ORDER BY CASE WHEN c.serial_no IS NULL OR c.serial_no = 0 THEN 1 ELSE 0 END, c.serial_no ASC, c.route ASC, c.name ASC, d.id ASC`;

    const deliveries = await db.prepare(query).all(...params);

    // Also include active BULK_HOTEL customers who have 0 deliveries for targetDate yet
    // so the Delivery Boy / Admin can always see their Bulk Order Card ready for manual entry
    let bulkCustQuery = `
      SELECT c.id as customer_id, c.name as customer_name, c.phone as customer_phone,
              c.address as customer_address, c.route as customer_route,
              c.serial_no as customer_serial_no, c.serial_no,
              c.zone_id, c.flat_no,
              z.name as zone_name, z.address as zone_address, z.route_order as zone_route_order,
              z.route_id,
              c.customer_category, c.billing_type, c.delivery_boy_id,
              u.name as delivery_boy_name
      FROM customers c
      LEFT JOIN zones z ON c.zone_id = z.id
      LEFT JOIN users u ON c.delivery_boy_id = u.id
      WHERE c.status = 'ACTIVE' AND c.customer_category = 'BULK_HOTEL' AND c.agent_id = ?
    `;
    const bulkParams = [agentId];

    if (req.user.role === 'DELIVERY_BOY') {
      if (authorizedZoneIds.length > 0) {
        const zonePlaceholders = authorizedZoneIds.map(() => '?').join(', ');
        bulkCustQuery += ` AND (c.delivery_boy_id = ? OR c.zone_id IN (${zonePlaceholders}))`;
        bulkParams.push(req.user.id, ...authorizedZoneIds);
      } else {
        bulkCustQuery += ` AND c.delivery_boy_id = ?`;
        bulkParams.push(req.user.id);
      }
    } else if (delivery_boy_id) {
      bulkCustQuery += ` AND c.delivery_boy_id = ?`;
      bulkParams.push(delivery_boy_id);
    }

    if (route_id) {
      bulkCustQuery += ` AND z.route_id = ?`;
      bulkParams.push(route_id);
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
          customer_serial_no: bCust.serial_no || bCust.customer_serial_no || 0,
          customer_category: 'BULK_HOTEL',
          billing_type: bCust.billing_type,
          delivery_boy_name: bCust.delivery_boy_name,
          requirement_type: 'NORMAL',
          zone_id: bCust.zone_id || null,
          zone_name: bCust.zone_name || 'Bulk & Hotel Orders',
          zone_address: bCust.zone_address || '',
          flat_no: bCust.flat_no || ''
        });
      }
    }

    // Sort deliveries according to delivery sequence (serial_no)
    deliveries.sort((a, b) => {
      const aSerial = a.customer_serial_no || a.serial_no || 0;
      const bSerial = b.customer_serial_no || b.serial_no || 0;
      if (aSerial > 0 && bSerial > 0 && aSerial !== bSerial) {
        return aSerial - bSerial;
      }
      if (aSerial > 0 && bSerial === 0) return -1;
      if (aSerial === 0 && bSerial > 0) return 1;
      const aRoute = a.customer_route || '';
      const bRoute = b.customer_route || '';
      if (aRoute !== bRoute) return aRoute.localeCompare(bRoute);
      return (a.customer_name || '').localeCompare(b.customer_name || '');
    });

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
    if (req.user.role === 'DELIVERY_BOY') {
      const authorized = await isCustomerAuthorized(customer_id, req.user, req.agentId || 1);
      if (!authorized) {
        return res.status(403).json({ error: 'Not authorized for this customer.' });
      }
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
        status, notes, agent_id, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, 0, ?,
        'PENDING', ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
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
        notes ? `Bulk: ${notes}` : 'Bulk Daily Order',
        customer.agent_id || req.agentId || 1
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

    if (req.user.role === 'DELIVERY_BOY') {
      const authorized = await isCustomerAuthorized(customer_id, req.user, req.agentId || 1);
      if (!authorized) {
        return res.status(403).json({ error: 'Not authorized for this customer.' });
      }
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

    // Deduct coupons if customer uses coupons
    for (const d of existing) {
      if (d.status !== 'DELIVERED') {
        try {
          await deductCouponsForDelivery({ ...d, status: 'DELIVERED' });
        } catch (cpnErr) {
          console.warn('Coupon deduction on bulk deliver notice:', cpnErr.message);
        }
      }
    }

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

// Helper: Recalculates delivery charges and amounts for a single customer on a given day
async function recalculateCustomerDayDeliveries(customerId, deliveryDate) {
  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) return;

  const dayDeliveries = await db.prepare(`
    SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = ?
  `).all(customerId, deliveryDate);

  const nonSkippedItems = [];
  for (const d of dayDeliveries) {
    if (d.status !== 'SKIPPED' && d.quantity > 0) {
      const prod = await db.prepare('SELECT * FROM products WHERE id = ?').get(d.product_id);
      nonSkippedItems.push({
        deliveryId: d.id,
        productId: d.product_id,
        productName: d.product_name_snapshot,
        category: d.category_snapshot,
        variantLabel: d.variant_snapshot,
        unitVolumeLitres: d.unit_volume_litres_snapshot,
        quantity: d.quantity,
        sellingPrice: d.unit_price_snapshot,
        deliveryChargeType: prod ? prod.delivery_charge_type : 'MILK_RULE',
        fixedDeliveryCharge: prod ? prod.fixed_delivery_charge : 0
      });
    }
  }

  const calculated = calculateDeliveryChargesForCustomerDay(customer.customer_category, nonSkippedItems);

  for (const d of dayDeliveries) {
    if (d.status === 'SKIPPED' || d.quantity === 0) {
      await db.prepare(`
        UPDATE deliveries
        SET total_product_amount = 0,
            delivery_charge_snapshot = 0,
            total_amount = 0,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(d.id);
    } else {
      const calc = calculated.find(c => c.deliveryId === d.id);
      const delCharge = calc ? (calc.deliveryCharge || 0) : 0;
      const productAmt = parseFloat((d.unit_price_snapshot * d.quantity).toFixed(2));
      const totAmt = parseFloat((productAmt + delCharge).toFixed(2));

      await db.prepare(`
        UPDATE deliveries
        SET total_product_amount = ?,
            delivery_charge_snapshot = ?,
            total_amount = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(productAmt, delCharge, totAmt, d.id);
    }
  }

  // Refresh monthly bill if exists and unpaid
  const billingMonth = deliveryDate.slice(0, 7);
  const existingBill = await db.prepare(`
    SELECT id, paid_amount FROM bills WHERE customer_id = ? AND billing_month = ?
  `).get(customerId, billingMonth);

  if (existingBill && !existingBill.paid_amount) {
    try {
      const { generateBillForCustomer } = require('../services/billingService');
      await generateBillForCustomer(customer, billingMonth, { billingBasis: 'AUTO', forceRegenerate: true });
    } catch (e) {
      console.warn('Auto bill refresh on day recalculation notice:', e.message);
    }
  }
}

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

    // If Delivery Boy, ensure they are authorized for this delivery via route hierarchy
    if (req.user.role === 'DELIVERY_BOY') {
      const authorized = await isDeliveryAuthorized(deliveryId, req.user, req.agentId || 1);
      if (!authorized) {
        return res.status(403).json({ error: 'Not authorized to update this delivery' });
      }
    }

    // If delivery is currently DELIVERED and has a paid bill, protect financial history
    if (delivery.status === 'DELIVERED' && status !== 'DELIVERED') {
      const safety = await checkCorrectionFinancialSafety(deliveryId, req.user);
      if (!safety.isSafe && safety.isLocked) {
        return res.status(409).json({ error: safety.reason });
      }
    }

    await db.prepare(`
      UPDATE deliveries
      SET status = ?, notes = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(status, notes !== undefined ? notes : delivery.notes, deliveryId);

    // Handle coupon deduction or restoration
    if (status === 'DELIVERED' && delivery.status !== 'DELIVERED') {
      try {
        await deductCouponsForDelivery({ ...delivery, status: 'DELIVERED' });
      } catch (cpnErr) {
        console.warn('Coupon deduction warning:', cpnErr.message);
      }
    } else if (delivery.status === 'DELIVERED' && status !== 'DELIVERED') {
      try {
        await revertCouponsForDelivery(deliveryId);
      } catch (cpnErr) {
        console.warn('Coupon revert warning:', cpnErr.message);
      }
    }

    // Recalculate amounts and charges for this customer on this date
    await recalculateCustomerDayDeliveries(delivery.customer_id, delivery.delivery_date);

    const updated = await db.prepare(`
      SELECT d.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             c.route as customer_route, c.customer_category, c.billing_type,
             c.serial_no as customer_serial_no, c.serial_no,
             p.image_url as product_image_url,
             u.name as delivery_boy_name
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      LEFT JOIN products p ON d.product_id = p.id
      LEFT JOIN users u ON d.delivery_boy_id = u.id
      WHERE d.id = ?
    `).get(deliveryId);

    res.json(updated);
  } catch (err) {
    console.error('Update delivery status error:', err);
    res.status(500).json({ error: err.message || 'Failed to update delivery status' });
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

    const customerDaysToRecalc = new Map();

    for (const id of deliveryIds) {
      const d = await db.prepare('SELECT id, customer_id, delivery_date, delivery_boy_id, status FROM deliveries WHERE id = ?').get(id);
      if (!d) continue;

      // If delivery boy, verify assignment via route hierarchy
      if (req.user.role === 'DELIVERY_BOY') {
        const authorized = await isDeliveryAuthorized(id, req.user, req.agentId || 1);
        if (!authorized) {
          continue;
        }
      }

      await updateStmt.run(status, notes || null, id);

      // Handle coupon deduction or restoration in bulk
      if (status === 'DELIVERED' && d.status !== 'DELIVERED') {
        try {
          await deductCouponsForDelivery({ ...d, status: 'DELIVERED' });
        } catch (cpnErr) {
          console.warn('Coupon deduction in bulk-status warning:', cpnErr.message);
        }
      } else if (d.status === 'DELIVERED' && status !== 'DELIVERED') {
        try {
          await revertCouponsForDelivery(id);
        } catch (cpnErr) {
          console.warn('Coupon revert in bulk-status warning:', cpnErr.message);
        }
      }

      const key = `${d.customer_id}_${d.delivery_date}`;
      customerDaysToRecalc.set(key, { customerId: d.customer_id, deliveryDate: d.delivery_date });
    }

    // Recalculate all affected customer days
    for (const { customerId, deliveryDate } of customerDaysToRecalc.values()) {
      await recalculateCustomerDayDeliveries(customerId, deliveryDate);
    }

    res.json({ message: `Updated ${deliveryIds.length} deliveries to ${status}` });
  } catch (err) {
    console.error('Bulk update delivery error:', err);
    res.status(500).json({ error: 'Failed to update deliveries in bulk' });
  }
});

// Check financial safety before correcting a delivery
router.get('/:id/safety', verifyToken, async (req, res) => {
  try {
    if (req.user.role === 'DELIVERY_BOY') {
      const authorized = await isDeliveryAuthorized(req.params.id, req.user, req.agentId || 1);
      if (!authorized) {
        return res.status(403).json({ error: 'Not authorized for this delivery' });
      }
    }
    const result = await checkCorrectionFinancialSafety(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    console.error('Safety check error:', err);
    res.status(500).json({ error: err.message || 'Failed to verify financial safety' });
  }
});

// Correct an already completed delivery
router.post('/:id/correct', verifyToken, async (req, res) => {
  try {
    if (req.user.role === 'DELIVERY_BOY') {
      const authorized = await isDeliveryAuthorized(req.params.id, req.user, req.agentId || 1);
      if (!authorized) {
        return res.status(403).json({ error: 'Not authorized to correct this delivery' });
      }
    }
    const { corrected_quantity, status, reason } = req.body;
    const result = await correctDelivery({
      deliveryId: req.params.id,
      correctedQuantity: corrected_quantity,
      status,
      reason,
      user: req.user
    });
    res.json({
      message: 'Delivery correction saved and verified successfully.',
      ...result
    });
  } catch (err) {
    console.error('Delivery correction error:', err);
    const code = err.statusCode || 500;
    res.status(code).json({
      error: err.message || 'Failed to save delivery correction',
      isLocked: Boolean(err.isLocked)
    });
  }
});

// Get correction history for a delivery
router.get('/:id/corrections', verifyToken, async (req, res) => {
  try {
    if (req.user.role === 'DELIVERY_BOY') {
      const authorized = await isDeliveryAuthorized(req.params.id, req.user, req.agentId || 1);
      if (!authorized) {
        return res.status(403).json({ error: 'Not authorized for this delivery' });
      }
    }
    const history = await getDeliveryCorrectionHistory(req.params.id);
    res.json(history);
  } catch (err) {
    console.error('Correction history error:', err);
    res.status(500).json({ error: err.message || 'Failed to load correction history' });
  }
});

// Temporary Delivery Change / Edit Quantity for House Customer (Does NOT modify permanent subscription)
router.post('/temporary-change', verifyToken, async (req, res) => {
  try {
    const { delivery_id, customer_id, product_id, target_product_id, delivery_date, quantity, reason } = req.body;

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
    if (req.user.role === 'DELIVERY_BOY') {
      const authorized = await isCustomerAuthorized(customer_id, req.user, req.agentId || 1);
      if (!authorized) {
        return res.status(403).json({ error: 'Not authorized for this customer.' });
      }
    }

    const baseProduct = await db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
    if (!baseProduct) {
      return res.status(404).json({ error: 'Base product not found.' });
    }

    const effTargetProdId = target_product_id ? parseInt(target_product_id, 10) : baseProduct.id;
    const targetProduct = effTargetProdId === baseProduct.id 
      ? baseProduct 
      : await db.prepare('SELECT * FROM products WHERE id = ?').get(effTargetProdId);

    if (!targetProduct) {
      return res.status(404).json({ error: 'Target product not found.' });
    }

    // Find permanent subscription for baseProduct if exists
    const sub = await db.prepare(`
      SELECT * FROM subscriptions 
      WHERE customer_id = ? AND product_id = ? AND is_active = 1
        AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)
    `).get(customer.id, baseProduct.id, targetDate, targetDate);

    const normalQuantity = sub ? sub.quantity : qty;
    const reasonText = (reason || '').trim();

    // 1. Update / Upsert / Delete in daily_delivery_requirements
    const existingReq = await db.prepare(`
      SELECT id FROM daily_delivery_requirements 
      WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
    `).get(customer.id, baseProduct.id, targetDate);

    if (qty === 0) {
      // Temporary Skip
      const skipReason = reasonText ? `Temporary Skip: ${reasonText}` : 'Customer requested skip today';
      if (existingReq) {
        await db.prepare(`
          UPDATE daily_delivery_requirements
          SET target_product_id = ?,
              requirement_type = 'SKIP_DELIVERY',
              normal_quantity = ?,
              required_quantity = 0,
              additional_quantity = 0,
              effective_quantity = 0,
              reason = ?,
              status = 'ACTIVE',
              created_by = ?,
              updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(effTargetProdId, normalQuantity, skipReason, req.user.id, existingReq.id);
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
          customer.id, baseProduct.id, effTargetProdId, sub ? sub.id : null, targetDate,
          normalQuantity, skipReason, req.user.id
        );
      }
    } else if (effTargetProdId === baseProduct.id && sub && qty === sub.quantity && !reasonText) {
      // Reverted to normal subscription (same product, same normal qty, no special note)
      await db.prepare(`
        DELETE FROM daily_delivery_requirements 
        WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
      `).run(customer.id, baseProduct.id, targetDate);
    } else {
      // Temporary Quantity Change or Product Swap
      let changeReason = reasonText;
      if (!changeReason) {
        if (effTargetProdId !== baseProduct.id) {
          changeReason = `Swapped to ${targetProduct.name} (${targetProduct.variant_label}) for today`;
        } else {
          changeReason = 'Customer requested quantity change';
        }
      }

      if (existingReq) {
        await db.prepare(`
          UPDATE daily_delivery_requirements
          SET target_product_id = ?,
              requirement_type = 'CHANGE_QUANTITY',
              normal_quantity = ?,
              required_quantity = ?,
              additional_quantity = 0,
              effective_quantity = ?,
              reason = ?,
              status = 'ACTIVE',
              created_by = ?,
              updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(effTargetProdId, normalQuantity, qty, qty, changeReason, req.user.id, existingReq.id);
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
          customer.id, baseProduct.id, effTargetProdId, sub ? sub.id : null, targetDate,
          normalQuantity, qty, qty, changeReason, req.user.id
        );
      }
    }

    // 2. Manage Delivery Row(s) in deliveries table
    let targetDel = null;
    if (delivery_id) {
      targetDel = await db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delivery_id);
    }
    if (!targetDel) {
      targetDel = await db.prepare(`
        SELECT * FROM deliveries 
        WHERE customer_id = ? AND (product_id = ? OR product_id = ?) AND delivery_date = ?
      `).get(customer.id, baseProduct.id, effTargetProdId, targetDate);
    }

    if (targetDel && effTargetProdId !== targetDel.product_id) {
      // Swapping delivery to new product
      const existingForNewProd = await db.prepare(`
        SELECT * FROM deliveries 
        WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
      `).get(customer.id, effTargetProdId, targetDate);

      if (existingForNewProd) {
        await db.prepare(`
          UPDATE deliveries
          SET quantity = ?,
              unit_price_snapshot = ?,
              status = ?,
              notes = ?,
              updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(
          qty === 0 ? normalQuantity : qty,
          targetProduct.selling_price,
          qty === 0 ? 'SKIPPED' : 'PENDING',
          reasonText || `Product swapped to ${targetProduct.name}`,
          existingForNewProd.id
        );
        await db.prepare('DELETE FROM deliveries WHERE id = ?').run(targetDel.id);
        targetDel = existingForNewProd;
      } else {
        await db.prepare(`
          UPDATE deliveries
          SET product_id = ?,
              product_name_snapshot = ?,
              category_snapshot = ?,
              variant_snapshot = ?,
              unit_volume_litres_snapshot = ?,
              quantity = ?,
              unit_price_snapshot = ?,
              status = ?,
              notes = ?,
              updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(
          targetProduct.id,
          targetProduct.name,
          targetProduct.category,
          targetProduct.variant_label,
          targetProduct.unit_volume_litres || 0,
          qty === 0 ? normalQuantity : qty,
          targetProduct.selling_price,
          qty === 0 ? 'SKIPPED' : 'PENDING',
          reasonText || `Product swapped to ${targetProduct.name}`,
          targetDel.id
        );
      }
    } else if (targetDel) {
      // Same product, update quantity and status
      await db.prepare(`
        UPDATE deliveries
        SET quantity = ?,
            unit_price_snapshot = ?,
            status = ?,
            notes = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        qty === 0 ? normalQuantity : qty,
        targetProduct.selling_price,
        qty === 0 ? 'SKIPPED' : (targetDel.status === 'SKIPPED' ? 'PENDING' : targetDel.status),
        reasonText || (qty === 0 ? 'Temporary Skip: Customer requested skip today' : (qty !== normalQuantity ? 'Temporary quantity change' : '')),
        targetDel.id
      );
    } else {
      // Insert new delivery row if not present
      await db.prepare(`
        INSERT INTO deliveries (
          customer_id, delivery_boy_id, delivery_date, product_id,
          product_name_snapshot, category_snapshot, variant_snapshot,
          unit_volume_litres_snapshot, quantity, unit_price_snapshot,
          total_product_amount, delivery_charge_snapshot, total_amount,
          status, notes, agent_id, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          0, 0, 0,
          ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
        )
      `).run(
        customer.id, customer.delivery_boy_id || null, targetDate, targetProduct.id,
        targetProduct.name, targetProduct.category, targetProduct.variant_label,
        targetProduct.unit_volume_litres || 0, qty === 0 ? normalQuantity : qty, targetProduct.selling_price,
        qty === 0 ? 'SKIPPED' : 'PENDING',
        reasonText || (qty === 0 ? 'Temporary Skip: Customer requested skip today' : ''),
        customer.agent_id || req.agentId || 1
      );
    }

    // 3. Recalculate delivery charges & totals for all deliveries of this customer on targetDate
    const dayDeliveries = await db.prepare(`
      SELECT d.*, p.category, p.unit_volume_litres, p.delivery_charge_type, p.fixed_delivery_charge
      FROM deliveries d
      JOIN products p ON d.product_id = p.id
      WHERE d.customer_id = ? AND d.delivery_date = ?
    `).all(customer.id, targetDate);

    const activeForCharges = dayDeliveries
      .filter((d) => d.status !== 'SKIPPED' && d.quantity > 0)
      .map((d) => ({
        deliveryId: d.id,
        productId: d.product_id,
        productName: d.product_name_snapshot,
        category: d.category,
        variantLabel: d.variant_snapshot,
        unitVolumeLitres: d.unit_volume_litres || 0,
        quantity: d.quantity,
        sellingPrice: d.unit_price_snapshot,
        deliveryChargeType: d.delivery_charge_type,
        fixedDeliveryCharge: d.fixed_delivery_charge
      }));

    const calculatedCharges = calculateDeliveryChargesForCustomerDay(
      customer.customer_category,
      activeForCharges
    );

    for (const d of dayDeliveries) {
      if (d.status === 'SKIPPED' || d.quantity === 0) {
        await db.prepare(`
          UPDATE deliveries
          SET total_product_amount = 0,
              delivery_charge_snapshot = 0,
              total_amount = 0,
              status = 'SKIPPED',
              updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(d.id);
      } else {
        const cItem = calculatedCharges.find((c) => c.deliveryId === d.id || c.productId === d.product_id);
        const delCharge = cItem ? (cItem.deliveryCharge || 0) : 0;
        const totalProd = parseFloat((d.unit_price_snapshot * d.quantity).toFixed(2));
        const totalAmt = parseFloat((totalProd + delCharge).toFixed(2));
        await db.prepare(`
          UPDATE deliveries
          SET total_product_amount = ?,
              delivery_charge_snapshot = ?,
              total_amount = ?,
              updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(totalProd, delCharge, totalAmt, d.id);
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
             s.product_id as subscription_product_id,
             r.id as requirement_id,
             COALESCE(r.requirement_type, 'NORMAL') as requirement_type,
             r.normal_quantity as req_normal_quantity,
             r.required_quantity as req_required_quantity,
             r.reason as requirement_reason
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      LEFT JOIN users u ON d.delivery_boy_id = u.id
      LEFT JOIN daily_delivery_requirements r 
        ON r.customer_id = d.customer_id 
        AND (r.target_product_id = d.product_id OR r.product_id = d.product_id)
        AND r.delivery_date = d.delivery_date 
        AND r.status = 'ACTIVE'
      LEFT JOIN subscriptions s 
        ON s.customer_id = d.customer_id 
        AND (s.product_id = d.product_id OR (r.product_id IS NOT NULL AND s.product_id = r.product_id))
        AND s.is_active = 1
      WHERE d.customer_id = ? AND d.product_id = ? AND d.delivery_date = ?
    `).get(customer.id, effTargetProdId, targetDate);

    const toastMsg = qty === 0 
      ? 'Delivery marked as skipped for today' 
      : (effTargetProdId !== baseProduct.id 
          ? `Product changed to ${targetProduct.name} (${qty} packet(s)) for today`
          : `Today's quantity updated to ${qty} packet(s)`);

    res.json({
      message: toastMsg,
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

    // If Delivery Boy, ensure customer is authorized for them via route hierarchy
    if (req.user.role === 'DELIVERY_BOY') {
      const authorized = await isCustomerAuthorized(customer_id, req.user, req.agentId || 1);
      if (!authorized) {
        return res.status(403).json({ error: 'Not authorized for this customer' });
      }
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
          status, notes, agent_id, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
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
        notes ? `Extra product: ${notes}` : 'Extra product requested on delivery',
        customer.agent_id || req.agentId || 1
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

    if (req.user.role === 'DELIVERY_BOY') {
      const authorized = await isCustomerAuthorized(customer_id, req.user, req.agentId || 1);
      if (!authorized) {
        return res.status(403).json({ error: 'Not authorized for this customer' });
      }
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
          status, notes, agent_id, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          'DELIVERED', ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
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
        notes || 'Ad-hoc delivery',
        customer.agent_id || req.agentId || 1
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
