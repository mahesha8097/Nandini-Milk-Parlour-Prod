const db = require('../config/db');
const { calculateDeliveryChargesForCustomerDay } = require('./deliveryChargeService');
const { generateBillForCustomer } = require('./billingService');
const { deductCouponsForDelivery, revertCouponsForDelivery } = require('./couponService');

/**
 * Checks whether a delivery can be safely corrected without compromising finalized/paid financial history.
 * @param {number|string} deliveryId 
 * @param {object} user - { id, role }
 * @returns {Promise<{ isSafe: boolean, reason?: string, bill?: object, delivery: object, customer: object }>}
 */
async function checkCorrectionFinancialSafety(deliveryId, user) {
  const delivery = await db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
  if (!delivery) {
    throw new Error('Delivery record not found');
  }

  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(delivery.customer_id);
  if (!customer) {
    throw new Error('Customer associated with delivery not found');
  }

  // Check authorization
  if (user.role === 'DELIVERY_BOY') {
    const isAssigned = (delivery.delivery_boy_id && delivery.delivery_boy_id === user.id) ||
                       (customer.delivery_boy_id && customer.delivery_boy_id === user.id);
    if (!isAssigned) {
      return {
        isSafe: false,
        error: 'You are not authorized to correct deliveries for this customer.',
        delivery,
        customer
      };
    }
  }

  // Financial safety check: check if an affected monthly bill exists
  const billingMonth = delivery.delivery_date.slice(0, 7);
  const existingBill = await db.prepare(`
    SELECT * FROM bills 
    WHERE customer_id = ? AND billing_month = ?
  `).get(customer.id, billingMonth);

  if (existingBill) {
    // Check if payments were recorded against this bill
    const paymentRecord = await db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as paid_sum 
      FROM payments WHERE bill_id = ?
    `).get(existingBill.id);

    const hasPaidAmount = (existingBill.paid_amount && existingBill.paid_amount > 0) ||
                          (paymentRecord && paymentRecord.paid_sum > 0);
    const isPaidStatus = ['PAID', 'PARTIALLY_PAID'].includes(existingBill.status);

    if (hasPaidAmount || isPaidStatus) {
      const paidValue = existingBill.paid_amount || paymentRecord.paid_sum;
      return {
        isSafe: false,
        isLocked: true,
        reason: `Monthly Bill #${existingBill.bill_number} for ${billingMonth} already has recorded payments (₹${paidValue.toFixed(2)}). Finalized bills with payments applied cannot be silently rewritten to preserve accounting history. Please contact Admin to review and adjust the bill.`,
        bill: existingBill,
        delivery,
        customer
      };
    }
  }

  return {
    isSafe: true,
    isLocked: false,
    bill: existingBill || null,
    delivery,
    customer
  };
}

/**
 * Corrects an already completed delivery with full audit trail and financial safeguards.
 * @param {object} params
 * @param {number|string} params.deliveryId
 * @param {number} params.correctedQuantity - Non-negative integer (0 to skip)
 * @param {string} [params.status] - 'DELIVERED' or 'SKIPPED'
 * @param {string} [params.reason] - Explanation for why the correction is being made
 * @param {object} params.user - User making the correction { id, role, name }
 */
async function correctDelivery({ deliveryId, correctedQuantity, status, reason, user }) {
  const safety = await checkCorrectionFinancialSafety(deliveryId, user);
  if (!safety.isSafe) {
    const error = new Error(safety.reason || safety.error || 'Correction not allowed due to financial safeguards.');
    error.statusCode = safety.isLocked ? 409 : 403;
    error.isLocked = safety.isLocked;
    throw error;
  }

  const { delivery, customer, bill } = safety;
  const parsedQty = parseInt(correctedQuantity, 10);
  if (isNaN(parsedQty) || parsedQty < 0) {
    throw new Error('Corrected quantity must be a valid non-negative number (0 to skip).');
  }

  const cleanReason = (reason || '').trim();
  const previousStatus = delivery.status;
  const previousQuantity = delivery.quantity;
  const previousAmount = delivery.total_amount || 0;

  // Determine new status
  const newStatus = (parsedQty === 0 || status === 'SKIPPED') ? 'SKIPPED' : 'DELIVERED';
  const effectiveQty = parsedQty;

  // 1. Fetch all deliveries for this customer on this delivery date
  const dayDeliveries = await db.prepare(`
    SELECT * FROM deliveries 
    WHERE customer_id = ? AND delivery_date = ?
  `).all(customer.id, delivery.delivery_date);

  // 2. Prepare items list for delivery charge recalculation across the customer's day
  const nonSkippedItems = [];
  for (const d of dayDeliveries) {
    const isTarget = d.id === delivery.id;
    const itemStatus = isTarget ? newStatus : d.status;
    const itemQty = isTarget ? effectiveQty : d.quantity;

    if (itemStatus !== 'SKIPPED' && itemQty > 0) {
      const prod = await db.prepare('SELECT * FROM products WHERE id = ?').get(d.product_id);
      nonSkippedItems.push({
        deliveryId: d.id,
        productId: d.product_id,
        productName: d.product_name_snapshot,
        category: d.category_snapshot,
        variantLabel: d.variant_snapshot,
        unitVolumeLitres: d.unit_volume_litres_snapshot,
        quantity: itemQty,
        sellingPrice: d.unit_price_snapshot,
        deliveryChargeType: prod ? prod.delivery_charge_type : 'MILK_RULE',
        fixedDeliveryCharge: prod ? prod.fixed_delivery_charge : 0
      });
    }
  }

  // 3. Recalculate daily delivery charges for all items for that customer on that day
  const calculatedCharges = calculateDeliveryChargesForCustomerDay(customer.customer_category, nonSkippedItems, customer.billing_type);

  let targetNewTotalAmount = 0;
  let targetNewDelCharge = 0;
  let targetNewProductAmount = 0;

  // 4. Update all deliveries for this customer on this date
  for (const d of dayDeliveries) {
    const isTarget = d.id === delivery.id;
    const itemStatus = isTarget ? newStatus : d.status;
    const itemQty = isTarget ? effectiveQty : d.quantity;

    if (itemStatus === 'SKIPPED' || itemQty === 0) {
      const skipNote = isTarget
        ? (cleanReason ? `Corrected to Skipped: ${cleanReason}` : 'Corrected to Skipped')
        : (d.notes || 'Skipped');

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
      `).run(itemQty, skipNote, d.id);

      if (isTarget) {
        targetNewTotalAmount = 0;
        targetNewDelCharge = 0;
        targetNewProductAmount = 0;
      }
    } else {
      const calc = calculatedCharges.find(c => c.deliveryId === d.id);
      const delCharge = calc ? (calc.deliveryCharge || 0) : 0;
      const productAmt = parseFloat((d.unit_price_snapshot * itemQty).toFixed(2));
      const totAmt = parseFloat((productAmt + delCharge).toFixed(2));

      let itemNote = d.notes || '';
      if (isTarget) {
        const corrTag = cleanReason ? `[Correction: ${cleanReason}]` : '[Corrected]';
        itemNote = itemNote ? `${itemNote} ${corrTag}` : corrTag;
        targetNewTotalAmount = totAmt;
        targetNewDelCharge = delCharge;
        targetNewProductAmount = productAmt;
      }

      await db.prepare(`
        UPDATE deliveries
        SET quantity = ?,
            total_product_amount = ?,
            delivery_charge_snapshot = ?,
            total_amount = ?,
            status = 'DELIVERED',
            notes = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(itemQty, productAmt, delCharge, totAmt, itemNote, d.id);
    }
  }

  // Coupon adjustment if status or quantity changed
  try {
    const { syncCouponsForDelivery } = require('./couponService');
    await syncCouponsForDelivery(delivery.id);
  } catch (cpnErr) {
    console.warn('Coupon adjustment in correction notice:', cpnErr.message);
  }

  // 5. Record in delivery_corrections table (Audit Trail)
  const correctionResult = await db.prepare(`
    INSERT INTO delivery_corrections (
      delivery_id, customer_id, product_id, delivery_date,
      previous_status, new_status, previous_quantity, corrected_quantity,
      previous_amount, corrected_amount, reason,
      corrected_by_user_id, corrected_by_role, created_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, datetime('now', 'localtime')
    )
  `).run(
    delivery.id,
    customer.id,
    delivery.product_id,
    delivery.delivery_date,
    previousStatus,
    newStatus,
    previousQuantity,
    effectiveQty,
    previousAmount,
    targetNewTotalAmount,
    cleanReason || 'Delivery correction recorded',
    user.id,
    user.role
  );

  const correctionId = correctionResult.lastInsertRowid;

  // 6. Record in system-wide audit_logs
  try {
    await db.prepare(`
      INSERT INTO audit_logs (
        user_id, action, entity, entity_id, details, created_at
      ) VALUES (?, 'DELIVERY_CORRECTION', 'DELIVERY', ?, ?, datetime('now', 'localtime'))
    `).run(
      user.id,
      delivery.id,
      JSON.stringify({
        correction_id: correctionId,
        customer_id: customer.id,
        customer_name: customer.name,
        delivery_date: delivery.delivery_date,
        product_name: delivery.product_name_snapshot,
        previous: { status: previousStatus, quantity: previousQuantity, amount: previousAmount },
        corrected: { status: newStatus, quantity: effectiveQty, amount: targetNewTotalAmount },
        reason: cleanReason,
        corrected_by: user.name || `User #${user.id}`
      })
    );
  } catch (auditErr) {
    console.warn('Audit log write notice:', auditErr.message);
  }

  // 7. Update affected bill safely if exists and no payments were recorded
  const billingMonth = delivery.delivery_date.slice(0, 7);
  let updatedBill = null;
  if (bill && !bill.paid_amount) {
    try {
      updatedBill = await generateBillForCustomer(customer, billingMonth, {
        billingBasis: 'AUTO',
        forceRegenerate: true
      });
    } catch (bErr) {
      console.warn('Bill auto-recalculation notice on correction:', bErr.message);
    }
  }

  // 8. Fetch and return fresh delivery record
  const updatedDelivery = await db.prepare(`
    SELECT d.*, 
           c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
           c.route as customer_route, c.customer_category, c.billing_type,
           c.serial_no as customer_serial_no, c.serial_no,
           u.name as delivery_boy_name,
           p.image_url as product_image_url
    FROM deliveries d
    JOIN customers c ON d.customer_id = c.id
    LEFT JOIN products p ON d.product_id = p.id
    LEFT JOIN users u ON d.delivery_boy_id = u.id
    WHERE d.id = ?
  `).get(delivery.id);

  return {
    delivery: updatedDelivery,
    correction: {
      id: correctionId,
      delivery_id: delivery.id,
      previous_status: previousStatus,
      new_status: newStatus,
      previous_quantity: previousQuantity,
      corrected_quantity: effectiveQty,
      previous_amount: previousAmount,
      corrected_amount: targetNewTotalAmount,
      reason: cleanReason,
      corrected_by_user_id: user.id,
      corrected_by_role: user.role
    },
    bill: updatedBill
  };
}

/**
 * Retrieves all correction history records for a delivery.
 * @param {number|string} deliveryId 
 * @returns {Promise<Array>}
 */
async function getDeliveryCorrectionHistory(deliveryId) {
  return await db.prepare(`
    SELECT dc.*, u.name as corrected_by_name
    FROM delivery_corrections dc
    LEFT JOIN users u ON dc.corrected_by_user_id = u.id
    WHERE dc.delivery_id = ?
    ORDER BY dc.id DESC
  `).all(deliveryId);
}

module.exports = {
  checkCorrectionFinancialSafety,
  correctDelivery,
  getDeliveryCorrectionHistory
};
