const db = require('../config/db');
const { calculateDeliveryChargesForCustomerDay } = require('./deliveryChargeService');

/**
 * Returns number of days in a given YYYY-MM month
 */
function getDaysInMonth(yearMonthStr) {
  const [year, month] = yearMonthStr.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

/**
 * Helper to generate sequential unique bill numbers: NB-YYYYMM-XXXX
 */
/**
 * Helper to generate sequential unique bill numbers: NB-YYYYMM-XXXX
 */
async function generateBillNumber(billingMonth) {
  const cleanMonth = billingMonth.replace('-', '');
  const countRow = await db.prepare(`SELECT COUNT(*) as count FROM bills WHERE billing_month = ?`).get(billingMonth);
  const seq = ((countRow?.count || 0) + 1).toString().padStart(4, '0');
  return `NB-${cleanMonth}-${seq}`;
}

/**
 * Generates an Advance / Expected bill for a Prepaid Customer for a specified month (YYYY-MM).
 * Based on customer's active subscriptions in that month, strictly respecting start_date and end_date.
 */
async function generateAdvanceBillForPrepaidCustomer(customer, billingMonth, forceRegenerate = false) {
  // Check if bill already exists
  const existing = await db.prepare(`
    SELECT * FROM bills WHERE customer_id = ? AND billing_month = ? AND billing_type = 'PREPAID'
  `).get(customer.id, billingMonth);

  if (existing && !forceRegenerate) {
    return existing;
  }

  const daysInMonth = getDaysInMonth(billingMonth);
  const monthStart = `${billingMonth}-01`;
  const monthEnd = `${billingMonth}-${daysInMonth.toString().padStart(2, '0')}`;

  // Get active subscriptions that overlap with this billing month
  const subs = await db.prepare(`
    SELECT s.*, p.name as product_name, p.category, p.variant_label, p.unit_volume_litres,
           p.selling_price, p.delivery_charge_type, p.fixed_delivery_charge
    FROM subscriptions s
    JOIN products p ON s.product_id = p.id
    WHERE s.customer_id = ? AND s.is_active = 1
      AND s.start_date <= ?
      AND (s.end_date IS NULL OR s.end_date = '' OR s.end_date >= ?)
  `).all(customer.id, monthEnd, monthStart);

  if (!subs || subs.length === 0) {
    return null; // No active subscription in this month
  }

  // Track breakdowns per subscription
  const subBreakdown = {};
  for (const s of subs) {
    subBreakdown[s.id] = {
      subscriptionId: s.id,
      productId: s.product_id,
      productName: s.product_name,
      category: s.category,
      variantLabel: s.variant_label,
      quantityPerDay: s.quantity,
      unitPrice: s.selling_price,
      startDate: s.start_date,
      endDate: s.end_date || null,
      activeDaysCount: 0,
      totalQuantity: 0,
      productSubtotal: 0,
      deliveryChargesTotal: 0
    };
  }

  let totalProductSubtotal = 0;
  let totalDeliveryCharges = 0;

  // Day-by-day calculation across the billing month
  for (let d = 1; d <= daysInMonth; d++) {
    const dayDate = `${billingMonth}-${d.toString().padStart(2, '0')}`;
    const daySubs = subs.filter(s => s.start_date <= dayDate && (!s.end_date || s.end_date === '' || s.end_date >= dayDate));
    if (daySubs.length === 0) continue;

    const dailyItems = daySubs.map(s => ({
      subscriptionId: s.id,
      productId: s.product_id,
      productName: s.product_name,
      category: s.category,
      variantLabel: s.variant_label,
      unitVolumeLitres: s.unit_volume_litres,
      quantity: s.quantity,
      sellingPrice: s.selling_price,
      deliveryChargeType: s.delivery_charge_type,
      fixedDeliveryCharge: s.fixed_delivery_charge
    }));

    const calculatedDaily = calculateDeliveryChargesForCustomerDay(customer.customer_category, dailyItems);

    for (const item of calculatedDaily) {
      const itemProductAmt = item.sellingPrice * item.quantity;
      const itemDelCharge = item.deliveryCharge || 0;
      totalProductSubtotal += itemProductAmt;
      totalDeliveryCharges += itemDelCharge;

      const b = subBreakdown[item.subscriptionId];
      if (b) {
        b.activeDaysCount += 1;
        b.totalQuantity += item.quantity;
        b.productSubtotal += itemProductAmt;
        b.deliveryChargesTotal += itemDelCharge;
      }
    }
  }

  // Filter to subscriptions that actually had active days in this month
  const activeBreakdowns = Object.values(subBreakdown)
    .filter(b => b.activeDaysCount > 0)
    .map(b => ({
      product_id: b.productId,
      product_name: b.productName,
      category: b.category,
      variant_label: b.variantLabel,
      quantity_per_day: b.quantityPerDay,
      unit_price: b.unitPrice,
      days_active_in_month: b.activeDaysCount,
      days_in_month: daysInMonth,
      effective_start: b.startDate,
      effective_end: b.endDate || 'Ongoing',
      total_quantity: b.totalQuantity,
      product_subtotal: parseFloat(b.productSubtotal.toFixed(2)),
      delivery_charges_total: parseFloat(b.deliveryChargesTotal.toFixed(2)),
      total_line_amount: parseFloat((b.productSubtotal + b.deliveryChargesTotal).toFixed(2))
    }));

  if (activeBreakdowns.length === 0) {
    return null;
  }

  totalProductSubtotal = parseFloat(totalProductSubtotal.toFixed(2));
  totalDeliveryCharges = parseFloat(totalDeliveryCharges.toFixed(2));
  const grossAmount = parseFloat((totalProductSubtotal + totalDeliveryCharges).toFixed(2));

  // Determine advance adjustment with fresh customer balances
  const freshCustomer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer.id);
  let currentAdvance = freshCustomer ? freshCustomer.advance_balance : (customer.advance_balance || 0);
  let currentPending = freshCustomer ? freshCustomer.pending_balance : (customer.pending_balance || 0);

  // If regenerating existing bill, restore previous balances before reapplying
  if (existing && forceRegenerate) {
    currentAdvance = parseFloat((currentAdvance + (existing.advance_adjusted || 0)).toFixed(2));
    currentPending = Math.max(0, parseFloat((currentPending - (existing.net_payable || 0)).toFixed(2)));
  }

  let advanceToAdjust = 0;
  if (currentAdvance >= grossAmount) {
    advanceToAdjust = grossAmount;
  } else {
    advanceToAdjust = currentAdvance;
  }

  const netPayable = parseFloat((grossAmount - advanceToAdjust).toFixed(2));
  const paidAmount = advanceToAdjust;
  
  let billStatus = 'GENERATED';
  if (netPayable === 0) {
    billStatus = 'ADVANCE_PAID';
  } else if (paidAmount > 0) {
    billStatus = 'PARTIALLY_PAID';
  } else {
    billStatus = 'PENDING';
  }

  const billNumber = existing ? existing.bill_number : await generateBillNumber(billingMonth);
  const billDate = `${billingMonth}-01`;
  const dueDate = `${billingMonth}-05`;

  let billId = existing ? existing.id : null;

  if (existing && forceRegenerate) {
    await db.prepare(`
      UPDATE bills
      SET total_deliveries_count = ?, product_subtotal = ?, delivery_charges_total = ?,
          gross_amount = ?, previous_due = ?, advance_adjusted = ?, net_payable = ?,
          paid_amount = ?, status = ?, items_json = ?, notes = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      daysInMonth, totalProductSubtotal, totalDeliveryCharges, grossAmount,
      currentPending, advanceToAdjust, netPayable, paidAmount, billStatus,
      JSON.stringify(activeBreakdowns), 'Updated Monthly Advance Bill (Effective Dates Applied)',
      existing.id
    );
    billId = existing.id;
  } else {
    const insertStmt = db.prepare(`
      INSERT INTO bills (
        bill_number, customer_id, billing_month, billing_type, bill_date, due_date,
        total_deliveries_count, product_subtotal, delivery_charges_total, gross_amount,
        previous_due, advance_adjusted, net_payable, paid_amount, status, lifecycle_stage,
        items_json, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'PREPAID', ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, 'FINALIZED',
        ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `);

    const info = await insertStmt.run(
      billNumber, customer.id, billingMonth, billDate, dueDate,
      daysInMonth, totalProductSubtotal, totalDeliveryCharges, grossAmount,
      currentPending, advanceToAdjust, netPayable, paidAmount, billStatus,
      JSON.stringify(activeBreakdowns), 'Automatic Monthly Advance Bill (Effective Dates Applied)'
    );
    billId = info.lastInsertRowid;
  }

  // Update Customer Advance & Pending Balances
  const newAdvance = parseFloat((currentAdvance - advanceToAdjust).toFixed(2));
  const newPending = parseFloat((currentPending + netPayable).toFixed(2));

  await db.prepare(`
    UPDATE customers
    SET advance_balance = ?, pending_balance = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(newAdvance, newPending, customer.id);

  // Record in Customer Ledger
  await db.prepare(`
    INSERT INTO customer_ledger (
      customer_id, transaction_date, transaction_type, reference_id, debit, credit,
      advance_balance_after, pending_balance_after, description, created_at
    ) VALUES (?, ?, 'BILL_GENERATED', ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
  `).run(
    customer.id,
    billDate,
    `BILL-${billId}`,
    grossAmount,
    advanceToAdjust,
    newAdvance,
    newPending,
    `${existing && forceRegenerate ? 'Recalculated' : 'Monthly'} Advance Bill for ${billingMonth} (Gross: ₹${grossAmount}, Advance Used: ₹${advanceToAdjust}, Payable: ₹${netPayable})`
  );

  return await db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
}

/**
 * Generates Monthly Bill based on actual deliveries recorded for that month.
 * Automatically subtracts/minuses the delivered milk amount from the customer's paid advance balance!
 */
async function generateDeliveredMilkBill(customer, billingMonth, forceRegenerate = false) {
  // Check if bill already exists
  const existing = await db.prepare(`
    SELECT * FROM bills WHERE customer_id = ? AND billing_month = ?
  `).get(customer.id, billingMonth);

  if (existing && !forceRegenerate) {
    return existing;
  }

  // Fetch actual delivered records for this customer in billingMonth
  const deliveries = await db.prepare(`
    SELECT * FROM deliveries
    WHERE customer_id = ? AND delivery_date LIKE ? AND status = 'DELIVERED'
    ORDER BY delivery_date ASC
  `).all(customer.id, `${billingMonth}%`);

  if (!deliveries || deliveries.length === 0) {
    return null; // No deliveries to bill
  }

  let totalProductSubtotal = 0;
  let totalDeliveryCharges = 0;

  // Group delivered items by product variant for clean presentation on invoice
  const productGroupMap = new Map();

  for (const del of deliveries) {
    totalProductSubtotal += del.total_product_amount;
    totalDeliveryCharges += del.delivery_charge_snapshot;

    const key = `${del.product_id}_${del.variant_snapshot || ''}`;
    if (!productGroupMap.has(key)) {
      productGroupMap.set(key, {
        product_id: del.product_id,
        product_name: del.product_name_snapshot,
        category: del.category_snapshot,
        variant_label: del.variant_snapshot,
        quantity: 0,
        total_quantity: 0,
        unit_price: del.unit_price_snapshot,
        product_subtotal: 0,
        delivery_charges_total: 0,
        total_line_amount: 0,
        delivered_days_count: 0
      });
    }
    const g = productGroupMap.get(key);
    g.quantity += del.quantity;
    g.total_quantity += del.quantity;
    g.product_subtotal += del.total_product_amount;
    g.delivery_charges_total += del.delivery_charge_snapshot;
    g.total_line_amount += del.total_amount;
    g.delivered_days_count += 1;
  }

  const groupedItems = Array.from(productGroupMap.values()).map(g => ({
    ...g,
    product_subtotal: parseFloat(g.product_subtotal.toFixed(2)),
    delivery_charges_total: parseFloat(g.delivery_charges_total.toFixed(2)),
    total_line_amount: parseFloat(g.total_line_amount.toFixed(2))
  }));

  totalProductSubtotal = parseFloat(totalProductSubtotal.toFixed(2));
  totalDeliveryCharges = parseFloat(totalDeliveryCharges.toFixed(2));
  const grossAmount = parseFloat((totalProductSubtotal + totalDeliveryCharges).toFixed(2));

  // Determine advance adjustment with fresh balances
  const freshCustomer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer.id);
  let currentAdvance = freshCustomer ? freshCustomer.advance_balance : (customer.advance_balance || 0);
  let currentPending = freshCustomer ? freshCustomer.pending_balance : (customer.pending_balance || 0);

  // If regenerating existing bill, restore previous balances before reapplying
  if (existing && forceRegenerate) {
    currentAdvance = parseFloat((currentAdvance + (existing.advance_adjusted || 0)).toFixed(2));
    currentPending = Math.max(0, parseFloat((currentPending - (existing.net_payable || 0)).toFixed(2)));
  }

  let advanceToAdjust = 0;
  if (currentAdvance >= grossAmount) {
    advanceToAdjust = grossAmount;
  } else {
    advanceToAdjust = currentAdvance;
  }

  const netPayable = parseFloat((grossAmount - advanceToAdjust).toFixed(2));
  const paidAmount = advanceToAdjust;

  let billStatus = 'GENERATED';
  if (netPayable === 0) {
    billStatus = advanceToAdjust > 0 ? 'ADVANCE_PAID' : 'PAID';
  } else if (paidAmount > 0) {
    billStatus = 'PARTIALLY_PAID';
  } else {
    billStatus = 'PENDING';
  }

  const billNumber = existing ? existing.bill_number : await generateBillNumber(billingMonth);
  const daysInMonth = getDaysInMonth(billingMonth);
  const billDate = `${billingMonth}-${daysInMonth.toString().padStart(2, '0')}`;
  const dueDate = `${billingMonth}-${daysInMonth.toString().padStart(2, '0')}`;

  let billId = existing ? existing.id : null;
  const billingType = customer.billing_type || 'POSTPAID';

  if (existing && forceRegenerate) {
    await db.prepare(`
      UPDATE bills
      SET total_deliveries_count = ?, product_subtotal = ?, delivery_charges_total = ?,
          gross_amount = ?, previous_due = ?, advance_adjusted = ?, net_payable = ?,
          paid_amount = ?, status = ?, items_json = ?, notes = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      deliveries.length, totalProductSubtotal, totalDeliveryCharges, grossAmount,
      currentPending, advanceToAdjust, netPayable, paidAmount, billStatus,
      JSON.stringify(groupedItems), `Delivered Milk Bill for ${deliveries.length} items (Deducted from Advance: ₹${advanceToAdjust})`,
      existing.id
    );
    billId = existing.id;
  } else {
    const info = await db.prepare(`
      INSERT INTO bills (
        bill_number, customer_id, billing_month, billing_type, bill_date, due_date,
        total_deliveries_count, product_subtotal, delivery_charges_total, gross_amount,
        previous_due, advance_adjusted, net_payable, paid_amount, status, lifecycle_stage,
        items_json, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, 'FINALIZED',
        ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(
      billNumber, customer.id, billingMonth, billingType, billDate, dueDate,
      deliveries.length, totalProductSubtotal, totalDeliveryCharges, grossAmount,
      currentPending, advanceToAdjust, netPayable, paidAmount, billStatus,
      JSON.stringify(groupedItems), `Delivered Milk Bill for ${deliveries.length} items (Deducted from Advance: ₹${advanceToAdjust})`
    );
    billId = info.lastInsertRowid;
  }

  // Update customer balances: Advance is MINUSED by delivered amount!
  const newAdvance = parseFloat((currentAdvance - advanceToAdjust).toFixed(2));
  const newPending = parseFloat((currentPending + netPayable).toFixed(2));

  await db.prepare(`
    UPDATE customers
    SET advance_balance = ?, pending_balance = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(newAdvance, newPending, customer.id);

  // Record in Customer Ledger
  await db.prepare(`
    INSERT INTO customer_ledger (
      customer_id, transaction_date, transaction_type, reference_id, debit, credit,
      advance_balance_after, pending_balance_after, description, created_at
    ) VALUES (?, ?, 'BILL_GENERATED', ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
  `).run(
    customer.id,
    billDate,
    `BILL-${billId}`,
    grossAmount,
    advanceToAdjust,
    newAdvance,
    newPending,
    `Delivered Milk Bill for ${billingMonth} (${deliveries.length} deliveries, Gross: ₹${grossAmount}, Advance Deducted: ₹${advanceToAdjust}, Remaining Advance: ₹${newAdvance}, Payable: ₹${netPayable})`
  );

  return await db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
}

// Alias for backwards compatibility
async function generatePostpaidBill(customer, billingMonth, forceRegenerate = false) {
  return await generateDeliveredMilkBill(customer, billingMonth, forceRegenerate);
}

/**
 * Intelligent single customer bill generator:
 * - If billingBasis === 'DELIVERIES' (or AUTO and customer has delivered milk records), bills the delivered milk and minuses from advance!
 * - If billingBasis === 'SUBSCRIPTION', bills the expected monthly subscription.
 */
async function generateBillForCustomer(customer, billingMonth, { billingBasis = 'AUTO', forceRegenerate = false } = {}) {
  const delCountRow = await db.prepare(`
    SELECT COUNT(*) as count FROM deliveries
    WHERE customer_id = ? AND delivery_date LIKE ? AND status = 'DELIVERED'
  `).get(customer.id, `${billingMonth}%`);

  const hasDeliveries = delCountRow && delCountRow.count > 0;

  if (billingBasis === 'DELIVERIES' || (billingBasis === 'AUTO' && hasDeliveries)) {
    const delBill = await generateDeliveredMilkBill(customer, billingMonth, forceRegenerate);
    if (delBill) return delBill;
  }

  // Bulk / Hotel customers strictly use delivered milk billing
  if (customer.customer_category === 'BULK_HOTEL') {
    return await generateDeliveredMilkBill(customer, billingMonth, forceRegenerate);
  }

  // Fall back to advance monthly subscription bill
  if (customer.billing_type === 'PREPAID' || billingBasis === 'SUBSCRIPTION') {
    return await generateAdvanceBillForPrepaidCustomer(customer, billingMonth, forceRegenerate);
  }

  return await generateDeliveredMilkBill(customer, billingMonth, forceRegenerate);
}

/**
 * Automatically runs monthly bill generation for all active customers for a given month.
 * Safe to call repeatedly (idempotent, or forces regeneration if forceRegenerate=true).
 */
async function runMonthlyBillGeneration(targetMonth, options = {}) {
  const forceRegenerate = typeof options === 'boolean' ? options : Boolean(options.forceRegenerate);
  const billingBasis = typeof options === 'object' && options.billingBasis ? options.billingBasis : 'AUTO';
  const currentMonthStr = targetMonth || new Date().toISOString().slice(0, 7); // YYYY-MM
  
  const customers = await db.prepare(`SELECT * FROM customers WHERE status = 'ACTIVE'`).all();
  const results = {
    billingMonth: currentMonthStr,
    prepaidBillsGenerated: 0,
    postpaidBillsGenerated: 0,
    deliveredBillsGenerated: 0,
    skipped: 0
  };

  for (const cust of customers) {
    const bill = await generateBillForCustomer(cust, currentMonthStr, { billingBasis, forceRegenerate });
    if (bill) {
      if (bill.total_deliveries_count > 0 && bill.notes?.includes('Delivered Milk')) {
        results.deliveredBillsGenerated++;
      }
      if (bill.billing_type === 'PREPAID') results.prepaidBillsGenerated++;
      else results.postpaidBillsGenerated++;
    } else {
      results.skipped++;
    }
  }

  return results;
}

/**
 * Recalculates an existing single bill by ID according to the latest subscriptions/deliveries.
 */
async function recalculateSingleBill(billId, billingBasis = 'AUTO') {
  const bill = await db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
  if (!bill) {
    throw new Error('Bill not found');
  }

  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(bill.customer_id);
  if (!customer) {
    throw new Error('Customer not found');
  }

  return await generateBillForCustomer(customer, bill.billing_month, { billingBasis, forceRegenerate: true });
}

/**
 * Records a payment against customer and optionally a bill.
 * Automatically handles ledger, advance carry-forward, and pending amount settlement.
 */
async function recordPaymentTransaction({
  customerId,
  billId = null,
  amount,
  paymentDate,
  paymentType,
  paymentMethod,
  referenceNumber = '',
  notes = '',
  recordedByUserId = null
}) {
  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) {
    throw new Error('Customer not found');
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Invalid payment amount');
  }

  // Generate sequential Receipt Number
  const countRow = await db.prepare('SELECT COUNT(*) as count FROM payments').get();
  const receiptNumber = `RCT-${new Date().getFullYear()}-${((countRow?.count || 0) + 1).toString().padStart(5, '0')}`;

  const insertPayment = db.prepare(`
    INSERT INTO payments (
      receipt_number, customer_id, bill_id, payment_type, amount, payment_date,
      payment_method, reference_number, notes, created_at, recorded_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), ?)
  `);

  const pResult = await insertPayment.run(
    receiptNumber, customerId, billId, paymentType, numAmount, paymentDate,
    paymentMethod, referenceNumber, notes, recordedByUserId
  );
  const paymentId = pResult.lastInsertRowid;

  let remainingPayment = numAmount;
  let currentPending = customer.pending_balance || 0;
  let currentAdvance = customer.advance_balance || 0;

  // If a specific bill was selected, settle it first
  if (billId) {
    const bill = await db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
    if (bill) {
      const billUnpaid = Math.max(0, bill.net_payable - bill.paid_amount);
      const settleAmount = Math.min(billUnpaid, remainingPayment);
      const newBillPaid = parseFloat((bill.paid_amount + settleAmount).toFixed(2));
      const newBillStatus = newBillPaid >= bill.net_payable ? 'PAID' : 'PARTIALLY_PAID';

      await db.prepare(`
        UPDATE bills
        SET paid_amount = ?, status = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(newBillPaid, newBillStatus, billId);

      remainingPayment -= settleAmount;
      currentPending = Math.max(0, parseFloat((currentPending - settleAmount).toFixed(2)));
    }
  } else if (currentPending > 0) {
    // Settle general pending balance first
    const settlePending = Math.min(currentPending, remainingPayment);
    currentPending = parseFloat((currentPending - settlePending).toFixed(2));
    remainingPayment -= settlePending;

    // Also update any pending bills for this customer in chronological order
    let billsToSettle = await db.prepare(`
      SELECT * FROM bills 
      WHERE customer_id = ? AND status IN ('PENDING', 'PARTIALLY_PAID', 'GENERATED')
      ORDER BY bill_date ASC
    `).all(customerId);

    let pRem = settlePending;
    for (const b of billsToSettle) {
      if (pRem <= 0) break;
      const bUnpaid = Math.max(0, b.net_payable - b.paid_amount);
      const applyToB = Math.min(bUnpaid, pRem);
      const bNewPaid = parseFloat((b.paid_amount + applyToB).toFixed(2));
      const bNewStatus = bNewPaid >= b.net_payable ? 'PAID' : 'PARTIALLY_PAID';

      await db.prepare(`
        UPDATE bills SET paid_amount = ?, status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?
      `).run(bNewPaid, bNewStatus, b.id);
      pRem -= applyToB;
    }
  }

  // Any remaining payment goes directly to advance_balance!
  if (remainingPayment > 0) {
    currentAdvance = parseFloat((currentAdvance + remainingPayment).toFixed(2));
  }

  // Update customer balances
  await db.prepare(`
    UPDATE customers
    SET advance_balance = ?, pending_balance = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(currentAdvance, currentPending, customerId);

  // Ledger Entry
  await db.prepare(`
    INSERT INTO customer_ledger (
      customer_id, transaction_date, transaction_type, reference_id, debit, credit,
      advance_balance_after, pending_balance_after, description, created_at
    ) VALUES (?, ?, 'PAYMENT_RECEIVED', ?, 0, ?, ?, ?, ?, datetime('now', 'localtime'))
  `).run(
    customerId,
    paymentDate,
    `PAY-${paymentId}`,
    numAmount,
    currentAdvance,
    currentPending,
    `Payment received via ${paymentMethod} (Receipt: ${receiptNumber}, Ref: ${referenceNumber || 'N/A'})`
  );

  return await db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
}

/**
 * Calculates advance monthly billing projections for customers who pay in advance.
 * Does not write to DB - used for interactive calculation and preview before generating bills.
 * Keeps calculation rules 100% identical.
 */
async function calculateAdvanceProjectionForMonth(billingMonth) {
  const daysInMonth = getDaysInMonth(billingMonth);
  const monthStart = `${billingMonth}-01`;
  const monthEnd = `${billingMonth}-${daysInMonth.toString().padStart(2, '0')}`;

  const customers = await db.prepare(`
    SELECT * FROM customers 
    WHERE status = 'ACTIVE'
    ORDER BY name ASC
  `).all();

  const projections = [];
  let totalProjectedGross = 0;
  let totalAvailableAdvance = 0;
  let totalProjectedPayable = 0;

  for (const customer of customers) {
    const subs = await db.prepare(`
      SELECT s.*, p.name as product_name, p.category, p.variant_label, p.unit_volume_litres,
             p.selling_price, p.delivery_charge_type, p.fixed_delivery_charge
      FROM subscriptions s
      JOIN products p ON s.product_id = p.id
      WHERE s.customer_id = ? AND s.is_active = 1
        AND s.start_date <= ?
        AND (s.end_date IS NULL OR s.end_date = '' OR s.end_date >= ?)
    `).all(customer.id, monthEnd, monthStart);

    if (!subs || subs.length === 0) continue;

    const subBreakdown = {};
    for (const s of subs) {
      subBreakdown[s.id] = {
        subscriptionId: s.id,
        productId: s.product_id,
        productName: s.product_name,
        category: s.category,
        variantLabel: s.variant_label,
        quantityPerDay: s.quantity,
        unitPrice: s.selling_price,
        startDate: s.start_date,
        endDate: s.end_date || null,
        activeDaysCount: 0,
        totalQuantity: 0,
        productSubtotal: 0,
        deliveryChargesTotal: 0
      };
    }

    let totalProductSubtotal = 0;
    let totalDeliveryCharges = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dayDate = `${billingMonth}-${d.toString().padStart(2, '0')}`;
      const daySubs = subs.filter(s => s.start_date <= dayDate && (!s.end_date || s.end_date === '' || s.end_date >= dayDate));
      if (daySubs.length === 0) continue;

      const dailyItems = daySubs.map(s => ({
        subscriptionId: s.id,
        productId: s.product_id,
        productName: s.product_name,
        category: s.category,
        variantLabel: s.variant_label,
        unitVolumeLitres: s.unit_volume_litres,
        quantity: s.quantity,
        sellingPrice: s.selling_price,
        deliveryChargeType: s.delivery_charge_type,
        fixedDeliveryCharge: s.fixed_delivery_charge
      }));

      const calculatedDaily = calculateDeliveryChargesForCustomerDay(customer.customer_category, dailyItems);

      for (const item of calculatedDaily) {
        const itemProductAmt = item.sellingPrice * item.quantity;
        const itemDelCharge = item.deliveryCharge || 0;
        totalProductSubtotal += itemProductAmt;
        totalDeliveryCharges += itemDelCharge;

        const b = subBreakdown[item.subscriptionId];
        if (b) {
          b.activeDaysCount += 1;
          b.totalQuantity += item.quantity;
          b.productSubtotal += itemProductAmt;
          b.deliveryChargesTotal += itemDelCharge;
        }
      }
    }

    const activeBreakdowns = Object.values(subBreakdown).filter(b => b.activeDaysCount > 0);
    if (activeBreakdowns.length === 0) continue;

    totalProductSubtotal = parseFloat(totalProductSubtotal.toFixed(2));
    totalDeliveryCharges = parseFloat(totalDeliveryCharges.toFixed(2));
    const grossAmount = parseFloat((totalProductSubtotal + totalDeliveryCharges).toFixed(2));
    const currentAdvance = customer.advance_balance || 0;
    const advanceToAdjust = Math.min(currentAdvance, grossAmount);
    const netPayable = parseFloat((grossAmount - advanceToAdjust).toFixed(2));
    const remainingAdvanceAfter = parseFloat((currentAdvance - advanceToAdjust).toFixed(2));

    // Check existing bill
    const existingBill = await db.prepare(`
      SELECT * FROM bills WHERE customer_id = ? AND billing_month = ?
    `).get(customer.id, billingMonth);

    totalProjectedGross += grossAmount;
    totalAvailableAdvance += currentAdvance;
    totalProjectedPayable += netPayable;

    projections.push({
      customer,
      items: activeBreakdowns,
      daysInMonth,
      productSubtotal: totalProductSubtotal,
      deliveryChargesTotal: totalDeliveryCharges,
      grossAmount,
      currentAdvance,
      advanceToAdjust,
      remainingAdvanceAfter,
      netPayable,
      hasExistingBill: Boolean(existingBill),
      existingBill
    });
  }

  return {
    billingMonth,
    daysInMonth,
    summary: {
      totalCustomers: projections.length,
      totalProjectedGross: parseFloat(totalProjectedGross.toFixed(2)),
      totalAvailableAdvance: parseFloat(totalAvailableAdvance.toFixed(2)),
      totalProjectedPayable: parseFloat(totalProjectedPayable.toFixed(2))
    },
    projections
  };
}

module.exports = {
  getDaysInMonth,
  generateBillNumber,
  generateAdvanceBillForPrepaidCustomer,
  generatePostpaidBill,
  generateDeliveredMilkBill,
  generateBillForCustomer,
  calculateAdvanceProjectionForMonth,
  runMonthlyBillGeneration,
  recalculateSingleBill,
  recordPaymentTransaction
};
