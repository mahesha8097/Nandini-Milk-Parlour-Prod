const db = require('../config/db');
const { calculateDeliveryChargesForCustomerDay } = require('./deliveryChargeService');
const { getLocalDateString } = require('../utils/dateUtils');

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
  const prefix = `NB-${cleanMonth}-`;
  const maxRow = await db.prepare(`SELECT bill_number FROM bills WHERE bill_number LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}%`);
  let nextSeq = 1;
  if (maxRow && maxRow.bill_number) {
    const parts = maxRow.bill_number.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }
  let billNum = `${prefix}${nextSeq.toString().padStart(4, '0')}`;
  let exists = await db.prepare('SELECT id FROM bills WHERE bill_number = ?').get(billNum);
  while (exists) {
    nextSeq++;
    billNum = `${prefix}${nextSeq.toString().padStart(4, '0')}`;
    exists = await db.prepare('SELECT id FROM bills WHERE bill_number = ?').get(billNum);
  }
  return billNum;
}

/**
 * Idempotently records or updates a bill in customer_ledger.
 * Prevents duplicate ledger entries when a bill is recalculated or regenerated.
 */
async function upsertBillLedgerEntry({
  customerId,
  billId,
  transactionDate,
  grossAmount,
  advanceToAdjust,
  advanceBalanceAfter,
  pendingBalanceAfter,
  description
}) {
  const ledgerRef = `BILL-${billId}`;
  const existingRows = await db.prepare(`
    SELECT id FROM customer_ledger 
    WHERE customer_id = ? AND reference_id = ? AND transaction_type = 'BILL_GENERATED'
    ORDER BY id ASC
  `).all(customerId, ledgerRef);

  if (existingRows && existingRows.length > 0) {
    const keepId = existingRows[0].id;
    await db.prepare(`
      UPDATE customer_ledger
      SET transaction_date = ?, debit = ?, credit = ?,
          advance_balance_after = ?, pending_balance_after = ?,
          description = ?, created_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      transactionDate,
      grossAmount,
      advanceToAdjust,
      advanceBalanceAfter,
      pendingBalanceAfter,
      description,
      keepId
    );

    // Clean up any extra duplicate rows for this bill
    if (existingRows.length > 1) {
      for (let i = 1; i < existingRows.length; i++) {
        await db.prepare('DELETE FROM customer_ledger WHERE id = ?').run(existingRows[i].id);
      }
    }
  } else {
    await db.prepare(`
      INSERT INTO customer_ledger (
        customer_id, transaction_date, transaction_type, reference_id, debit, credit,
        advance_balance_after, pending_balance_after, description, created_at
      ) VALUES (?, ?, 'BILL_GENERATED', ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `).run(
      customerId,
      transactionDate,
      ledgerRef,
      grossAmount,
      advanceToAdjust,
      advanceBalanceAfter,
      pendingBalanceAfter,
      description
    );
  }
}

/**
 * Automatically reconciles all past concluded months for a customer.
 * - Reconciles any past advance bills to the actual delivered milk of that past month.
 * - Calculates total historical payments vs total delivered cost across all concluded months.
 * - If payments > delivered cost: credits the exact surplus to customer.advance_balance (carried forward & minused in the next bill)!
 * - If payments < delivered cost: sets remaining unpaid past dues.
 * - Sets previous bills' net_payable and status cleanly.
 * This applies universally to all customer billing formats (PREPAID, POSTPAID, WEEKLY, DAILY).
 */
async function reconcileCustomerPastMonths(customerId, targetMonth) {
  if (!customerId || !targetMonth) return { surplusAdvance: 0, remainingUnpaidPastDues: 0 };

  const monthCutoff = targetMonth.length === 7 ? targetMonth : targetMonth.slice(0, 7);
  const dateCutoff = `${monthCutoff}-01`;

  // 1. Find all past bills for periods strictly concluded before targetMonth
  const allBills = await db.prepare(`
    SELECT * FROM bills
    WHERE customer_id = ? AND status != 'CANCELLED'
    ORDER BY bill_date ASC, id ASC
  `).all(customerId);

  const pastBills = allBills.filter(b => {
    if (b.end_date && b.end_date < dateCutoff) return true;
    if (b.bill_date && b.bill_date < dateCutoff) return true;
    if (b.billing_month && b.billing_month.length === 7 && b.billing_month < monthCutoff) return true;
    return false;
  });

  if (pastBills.length === 0) {
    return { surplusAdvance: 0, remainingUnpaidPastDues: 0 };
  }

  for (const b of pastBills) {
    // If the bill was an advance bill or had scheduled days
    if (b.billing_type === 'PREPAID' || b.notes?.includes('Advance Bill')) {
      // Check actual deliveries recorded for this past month
      const billMonth = (b.billing_month && b.billing_month.length === 7) ? b.billing_month : (b.bill_date ? b.bill_date.slice(0, 7) : monthCutoff);
      const pastDels = await db.prepare(`
        SELECT * FROM deliveries
        WHERE customer_id = ? AND delivery_date LIKE ?
        ORDER BY delivery_date ASC
      `).all(customerId, `${billMonth}%`);

      if (pastDels && pastDels.length > 0) {
        const deliveredOnly = pastDels.filter(d => d.status === 'DELIVERED' && Number(d.quantity) > 0);
        let actualGross = 0;
        let actualProdTotal = 0;
        let actualDelCharge = 0;
        for (const d of deliveredOnly) {
          actualProdTotal += Number(d.total_product_amount || 0);
          actualDelCharge += Number(d.delivery_charge_snapshot || 0);
          actualGross += Number(d.total_amount || ((d.total_product_amount || 0) + (d.delivery_charge_snapshot || 0)));
        }
        actualGross = parseFloat(actualGross.toFixed(2));
        actualProdTotal = parseFloat(actualProdTotal.toFixed(2));
        actualDelCharge = parseFloat(actualDelCharge.toFixed(2));

        // If actual deliveries are less than original gross, or customer skipped days
        if (actualGross < Number(b.gross_amount) || b.notes?.includes('Monthly Advance Bill')) {
          const pastPayments = await db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM payments
            WHERE customer_id = ? AND is_deleted = 0
              AND (bill_id = ? OR payment_date <= ?)
          `).get(customerId, b.id, `${billMonth}-31`);

          const availablePaid = Number(pastPayments?.total || 0) + Number(b.advance_adjusted || 0);
          const newAdvAdj = Math.min(actualGross, availablePaid);
          const newNet = Math.max(0, parseFloat((actualGross - newAdvAdj).toFixed(2)));
          const newStatus = newNet === 0 ? 'PAID' : 'PARTIALLY_PAID';

          await db.prepare(`
            UPDATE bills
            SET gross_amount = ?, product_subtotal = ?, delivery_charges_total = ?,
                total_deliveries_count = ?, advance_adjusted = ?, net_payable = ?,
                paid_amount = 0, status = ?,
                notes = ?, updated_at = datetime('now', 'localtime')
            WHERE id = ?
          `).run(
            actualGross, actualProdTotal, actualDelCharge,
            deliveredOnly.length, newAdvAdj, newNet,
            newStatus, `Reconciled Delivered Milk Bill for ${billMonth} (${deliveredOnly.length} deliveries taken)`,
            b.id
          );
          b.gross_amount = actualGross;
          b.net_payable = newNet;
          b.paid_amount = 0;
        }
      }
    }
  }

  // 2. Compute historical payments strictly for these concluded past periods vs total gross billed
  const allPayments = await db.prepare(`
    SELECT id, bill_id, amount, payment_date
    FROM payments
    WHERE customer_id = ? AND is_deleted = 0
  `).all(customerId);

  const pastBillIds = new Set(pastBills.map(b => b.id));
  const pastPayments = allPayments.filter(p => {
    if (p.payment_date && p.payment_date < dateCutoff) return true;
    if (p.bill_id && pastBillIds.has(p.bill_id)) return true;
    return false;
  });

  const totalPaymentsAmount = pastPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalPastGrossBilled = pastBills.reduce((sum, b) => sum + Number(b.gross_amount || 0), 0);

  const netBalance = parseFloat((totalPaymentsAmount - totalPastGrossBilled).toFixed(2));

  let surplusAdvance = 0;
  let remainingUnpaidPastDues = 0;

  if (netBalance > 0) {
    // Customer overpaid across past months -> Available surplus advance for upcoming bills!
    surplusAdvance = netBalance;
    remainingUnpaidPastDues = 0;
  } else if (netBalance < 0) {
    // Customer underpaid across past months -> Unpaid past dues to carry forward!
    surplusAdvance = 0;
    remainingUnpaidPastDues = Math.abs(netBalance);
  }

  // Update customer's advance_balance and pending_balance
  await db.prepare(`
    UPDATE customers
    SET advance_balance = ?, pending_balance = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(surplusAdvance, remainingUnpaidPastDues, customerId);

  return {
    surplusAdvance,
    remainingUnpaidPastDues
  };
}

/**
 * Calculates the exact remaining unpaid dues from prior bills for a customer.
 * - If prior bills are fully paid (paid_amount >= net_payable), remaining dues = 0.
 * - If no pending dues exist, returns 0 so new bills calculate freshly without carryover!
 * - If pending dues exist, returns the exact remaining unpaid balance to carry forward.
 */
async function calculateCustomerPendingDues(customerId, { excludeBillId = null, upToBillDate = null } = {}) {
  const targetMonth = upToBillDate ? upToBillDate.slice(0, 7) : new Date().toISOString().slice(0, 7);
  const { surplusAdvance, remainingUnpaidPastDues } = await reconcileCustomerPastMonths(customerId, targetMonth);

  let query = `
    SELECT id, bill_number, billing_month, bill_date, start_date, end_date, gross_amount,
           advance_adjusted, net_payable, paid_amount, status
    FROM bills
    WHERE customer_id = ? AND status != 'CANCELLED'
  `;
  const params = [customerId];

  if (excludeBillId) {
    query += ` AND id != ?`;
    params.push(excludeBillId);
  }

  if (upToBillDate) {
    if (excludeBillId) {
      query += ` AND (bill_date < ? OR (bill_date = ? AND id < ?))`;
      params.push(upToBillDate, upToBillDate, Number(excludeBillId));
    } else {
      query += ` AND bill_date < ?`;
      params.push(upToBillDate);
    }
  }

  query += ` ORDER BY bill_date ASC, id ASC`;

  const priorBills = await db.prepare(query).all(...params);

  let totalUnpaid = 0;
  const unpaidBillsList = [];

  for (const b of priorBills) {
    const net = Number(b.net_payable || 0);
    const paid = Number(b.paid_amount || 0);
    const unpaid = Math.max(0, parseFloat((net - paid).toFixed(2)));
    if (unpaid > 0) {
      totalUnpaid += unpaid;
      unpaidBillsList.push({
        ...b,
        unpaid_amount: unpaid
      });
    }
  }

  if (remainingUnpaidPastDues > totalUnpaid) {
    totalUnpaid = remainingUnpaidPastDues;
  }

  totalUnpaid = parseFloat(totalUnpaid.toFixed(2));
  return {
    totalUnpaid,
    surplusAdvance,
    unpaidBillsList,
    allPriorBills: priorBills
  };
}

function parseCustomDays(customDays) {
  if (!customDays) return null;
  if (Array.isArray(customDays)) {
    return customDays.map(Number).filter(n => !isNaN(n));
  }
  if (typeof customDays === 'string') {
    try {
      const parsed = JSON.parse(customDays);
      if (Array.isArray(parsed)) return parsed.map(Number).filter(n => !isNaN(n));
    } catch (e) {}

    const parts = customDays.split(',').map(s => s.trim().toUpperCase());
    const dayMap = {
      'SUN': 0, 'SUNDAY': 0, '0': 0,
      'MON': 1, 'MONDAY': 1, '1': 1,
      'TUE': 2, 'TUESDAY': 2, '2': 2,
      'WED': 3, 'WEDNESDAY': 3, '3': 3,
      'THU': 4, 'THURSDAY': 4, '4': 4,
      'FRI': 5, 'FRIDAY': 5, '5': 5,
      'SAT': 6, 'SATURDAY': 6, '6': 6
    };
    const indices = [];
    parts.forEach(p => {
      if (dayMap[p] !== undefined) indices.push(dayMap[p]);
    });
    return indices.length > 0 ? indices : null;
  }
  return null;
}

function formatCustomDaysSummary(customDays, frequency = 'DAILY') {
  if (frequency === 'DAILY' && !customDays) return 'Daily';
  if (frequency === 'ALTERNATE_DAYS') return 'Alternate Days';
  const parsed = parseCustomDays(customDays);
  if (!parsed || parsed.length === 0) return frequency || 'Daily';
  const nameMap = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };
  return parsed.map(idx => nameMap[idx] || idx).join(', ');
}

/**
 * Generates an Advance / Expected bill for a Prepaid Customer for a specified month (YYYY-MM).
 * Based on customer's active subscriptions in that month, strictly respecting start_date, end_date, frequency, and custom_days.
 */
async function generateAdvanceBillForPrepaidCustomer(customer, billingMonth, forceRegenerate = false) {
  if (customer.billing_type === 'COUPON') {
    return null; // Coupon customers pay via coupon books
  }

  // Check if bill already exists
  const existing = await db.prepare(`
    SELECT * FROM bills WHERE customer_id = ? AND billing_month = ? AND billing_type = 'PREPAID'
  `).get(customer.id, billingMonth);

  if (existing && !forceRegenerate) {
    return existing;
  }

  const daysInMonth = getDaysInMonth(billingMonth);
  const [bYear, bMonth] = billingMonth.split('-').map(Number);
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
    const customDows = (s.frequency === 'CUSTOM' || s.custom_days) ? parseCustomDays(s.custom_days) : null;
    const customSummary = formatCustomDaysSummary(s.custom_days, s.frequency);

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
      frequency: s.frequency || 'DAILY',
      customDows,
      customDaysSummary: customSummary,
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
    const dow = new Date(bYear, bMonth - 1, d).getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

    // Filter subscriptions active on this specific calendar day
    const daySubs = subs.filter(s => {
      // 1. Date range check
      if (s.start_date > dayDate) return false;
      if (s.end_date && s.end_date.trim() !== '' && s.end_date < dayDate) return false;

      // 2. Frequency & custom days check
      const b = subBreakdown[s.id];
      if (b && b.customDows && b.customDows.length > 0) {
        return b.customDows.includes(dow);
      }
      if (s.frequency === 'ALTERNATE_DAYS') {
        const startDayNum = parseInt(s.start_date.split('-')[2], 10) || 1;
        return (d - startDayNum) % 2 === 0;
      }
      return true; // DAILY
    });

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
      frequency: b.frequency,
      custom_days: b.customDaysSummary,
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

  // Reconcile past months and retrieve fresh surplus advance or previous dues
  const billDate = `${billingMonth}-01`;
  const duesInfo = await calculateCustomerPendingDues(customer.id, {
    excludeBillId: existing ? existing.id : null,
    upToBillDate: billDate
  });
  const previousDue = duesInfo.totalUnpaid;
  let currentAdvance = Number(duesInfo.surplusAdvance || 0);

  const freshCustomer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer.id);
  if (freshCustomer && Number(freshCustomer.advance_balance || 0) > currentAdvance) {
    currentAdvance = Number(freshCustomer.advance_balance);
  }

  // If regenerating existing bill, restore previous balances before reapplying
  if (existing && forceRegenerate) {
    const prevAdvanceAdjusted = Number(existing.advance_adjusted || 0);
    let prevCashPaid = Number(existing.paid_amount || 0);
    if (existing.status === 'ADVANCE_PAID' || Number(existing.net_payable || 0) === 0) {
      prevCashPaid = 0;
    }

    // Restore advance balance: add back advance adjusted plus any cash payments made towards this bill
    currentAdvance = parseFloat((currentAdvance + prevAdvanceAdjusted + prevCashPaid).toFixed(2));
  }

  let advanceToAdjust = 0;
  if (currentAdvance >= grossAmount) {
    advanceToAdjust = grossAmount;
  } else {
    advanceToAdjust = currentAdvance;
  }

  const netPayable = parseFloat((grossAmount - advanceToAdjust).toFixed(2));
  const paidAmount = 0;
  
  let billStatus = 'GENERATED';
  if (netPayable === 0) {
    billStatus = advanceToAdjust > 0 ? 'ADVANCE_PAID' : 'PAID';
  } else if (advanceToAdjust > 0) {
    billStatus = 'PARTIALLY_PAID';
  } else {
    billStatus = 'PENDING';
  }

  const billNumber = existing ? existing.bill_number : await generateBillNumber(billingMonth);
  const dueDate = `${billingMonth}-05`;

  let billId = existing ? existing.id : null;

  const scheduledDaysCount = activeBreakdowns.reduce((max, b) => Math.max(max, b.days_active_in_month), 0);
  const notesText = `Monthly Advance Bill (${billingMonth}, ${scheduledDaysCount} scheduled days${activeBreakdowns[0]?.custom_days ? `: ${activeBreakdowns[0].custom_days}` : ''})`;

  if (existing && forceRegenerate) {
    await db.prepare(`
      UPDATE bills
      SET total_deliveries_count = ?, product_subtotal = ?, delivery_charges_total = ?,
          gross_amount = ?, previous_due = ?, advance_adjusted = ?, net_payable = ?,
          paid_amount = ?, status = ?, items_json = ?, notes = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      daysInMonth, totalProductSubtotal, totalDeliveryCharges, grossAmount,
      previousDue, advanceToAdjust, netPayable, paidAmount, billStatus,
      JSON.stringify(activeBreakdowns), notesText,
      existing.id
    );
    billId = existing.id;
  } else {
    const insertStmt = db.prepare(`
      INSERT INTO bills (
        bill_number, customer_id, billing_month, billing_type, bill_date, due_date,
        total_deliveries_count, product_subtotal, delivery_charges_total, gross_amount,
        previous_due, advance_adjusted, net_payable, paid_amount, status, lifecycle_stage,
        items_json, notes, agent_id, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'PREPAID', ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, 'FINALIZED',
        ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `);

    const info = await insertStmt.run(
      billNumber, customer.id, billingMonth, billDate, dueDate,
      daysInMonth, totalProductSubtotal, totalDeliveryCharges, grossAmount,
      previousDue, advanceToAdjust, netPayable, paidAmount, billStatus,
      JSON.stringify(activeBreakdowns), notesText,
      customer.agent_id || 1
    );
    billId = info.lastInsertRowid;
  }

  // Update Customer Advance & Pending Balances
  const newAdvance = parseFloat((currentAdvance - advanceToAdjust).toFixed(2));
  const newPending = parseFloat((previousDue + netPayable).toFixed(2));

  await db.prepare(`
    UPDATE customers
    SET advance_balance = ?, pending_balance = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(newAdvance, newPending, customer.id);

  // Record or update in Customer Ledger (idempotent - no duplicate entries)
  await upsertBillLedgerEntry({
    customerId: customer.id,
    billId,
    transactionDate: billDate,
    grossAmount,
    advanceToAdjust,
    advanceBalanceAfter: newAdvance,
    pendingBalanceAfter: newPending,
    description: `${existing && forceRegenerate ? 'Recalculated' : 'Monthly'} Advance Bill for ${billingMonth} (Gross: ₹${grossAmount}, Advance Used: ₹${advanceToAdjust}, Payable: ₹${netPayable})`
  });

  return await db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
}

/**
 * Generates Monthly Bill based on actual deliveries recorded for that month.
 * Automatically subtracts/minuses the delivered milk amount from the customer's paid advance balance!
 */
async function generateDeliveredMilkBill(customer, billingMonth, forceRegenerate = false) {
  if (customer.billing_type === 'COUPON') {
    return null; // Coupon customers pay via coupon books
  }

  // Check if bill already exists
  const existing = await db.prepare(`
    SELECT * FROM bills WHERE customer_id = ? AND billing_month = ?
  `).get(customer.id, billingMonth);

  if (existing && !forceRegenerate) {
    return existing;
  }

  // Fetch actual delivered records for this customer in billingMonth,
  // excluding any dates that are already billed in other active bills
  const existingBillId = existing ? existing.id : null;
  const excludeExistingClause = existingBillId ? 'AND b.id != ?' : '';
  const deliveryParams = [customer.id, `${billingMonth}%`];
  if (existingBillId) {
    deliveryParams.push(existingBillId);
  }

  const deliveries = await db.prepare(`
    SELECT d.* FROM deliveries d
    WHERE d.customer_id = ? 
      AND d.delivery_date LIKE ? 
      AND d.status = 'DELIVERED'
      AND NOT EXISTS (
        SELECT 1 FROM bills b
        WHERE b.customer_id = d.customer_id
          AND b.status != 'CANCELLED'
          ${excludeExistingClause}
          AND b.start_date IS NOT NULL 
          AND b.end_date IS NOT NULL
          AND d.delivery_date >= b.start_date 
          AND d.delivery_date <= b.end_date
      )
    ORDER BY d.delivery_date ASC
  `).all(...deliveryParams);

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

  const daysInMonth = getDaysInMonth(billingMonth);
  const todayStr = getLocalDateString();
  const isCurrentMonth = todayStr.startsWith(billingMonth);
  const billDate = isCurrentMonth ? todayStr : `${billingMonth}-${daysInMonth.toString().padStart(2, '0')}`;
  const dueDate = billDate;

  // Reconcile prior months and determine advance & previous dues
  const duesInfo = await calculateCustomerPendingDues(customer.id, {
    excludeBillId: existing ? existing.id : null,
    upToBillDate: `${billingMonth}-01`
  });
  const previousDue = duesInfo.totalUnpaid;
  let currentAdvance = Number(duesInfo.surplusAdvance || 0);

  const freshCustomer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer.id);
  if (freshCustomer && Number(freshCustomer.advance_balance || 0) > currentAdvance) {
    currentAdvance = Number(freshCustomer.advance_balance);
  }

  // If regenerating existing bill, restore previous balances before reapplying
  if (existing && forceRegenerate) {
    const prevAdvanceAdjusted = Number(existing.advance_adjusted || 0);
    let prevCashPaid = Number(existing.paid_amount || 0);
    if (existing.status === 'ADVANCE_PAID' || Number(existing.net_payable || 0) === 0) {
      prevCashPaid = 0;
    }

    // Restore advance balance: add back advance adjusted plus any cash payments made towards this bill
    currentAdvance = parseFloat((currentAdvance + prevAdvanceAdjusted + prevCashPaid).toFixed(2));
  }

  let advanceToAdjust = 0;
  if (currentAdvance >= grossAmount) {
    advanceToAdjust = grossAmount;
  } else {
    advanceToAdjust = currentAdvance;
  }

  const netPayable = parseFloat((grossAmount - advanceToAdjust).toFixed(2));
  const paidAmount = 0;

  let billStatus = 'GENERATED';
  if (netPayable === 0) {
    billStatus = advanceToAdjust > 0 ? 'ADVANCE_PAID' : 'PAID';
  } else if (advanceToAdjust > 0) {
    billStatus = 'PARTIALLY_PAID';
  } else {
    billStatus = 'PENDING';
  }

  const billNumber = existing ? existing.bill_number : await generateBillNumber(billingMonth);

  const delStartDate = deliveries.length > 0 ? deliveries[0].delivery_date : `${billingMonth}-01`;
  const delEndDate = deliveries.length > 0 ? deliveries[deliveries.length - 1].delivery_date : billDate;

  let billId = existing ? existing.id : null;
  const billingType = customer.billing_type || 'POSTPAID';

  if (existing && forceRegenerate) {
    await db.prepare(`
      UPDATE bills
      SET total_deliveries_count = ?, product_subtotal = ?, delivery_charges_total = ?,
          gross_amount = ?, previous_due = ?, advance_adjusted = ?, net_payable = ?,
          paid_amount = ?, status = ?, items_json = ?, notes = ?,
          bill_date = ?, due_date = ?, start_date = ?, end_date = ?,
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      deliveries.length, totalProductSubtotal, totalDeliveryCharges, grossAmount,
      previousDue, advanceToAdjust, netPayable, paidAmount, billStatus,
      JSON.stringify(groupedItems), `Delivered Milk Bill (${delStartDate} to ${delEndDate}, ${deliveries.length} items, Deducted from Advance: ₹${advanceToAdjust})`,
      billDate, dueDate, delStartDate, delEndDate,
      existing.id
    );
    billId = existing.id;
  } else {
    const info = await db.prepare(`
      INSERT INTO bills (
        bill_number, customer_id, billing_month, billing_type, bill_date, due_date,
        start_date, end_date,
        total_deliveries_count, product_subtotal, delivery_charges_total, gross_amount,
        previous_due, advance_adjusted, net_payable, paid_amount, status, lifecycle_stage,
        items_json, notes, agent_id, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, 'FINALIZED',
        ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(
      billNumber, customer.id, billingMonth, billingType, billDate, dueDate,
      delStartDate, delEndDate,
      deliveries.length, totalProductSubtotal, totalDeliveryCharges, grossAmount,
      previousDue, advanceToAdjust, netPayable, paidAmount, billStatus,
      JSON.stringify(groupedItems), `Delivered Milk Bill (${delStartDate} to ${delEndDate}, ${deliveries.length} items, Deducted from Advance: ₹${advanceToAdjust})`,
      customer.agent_id || 1
    );
    billId = info.lastInsertRowid;
  }

  // Update customer balances: Advance is MINUSED by delivered amount!
  const newAdvance = parseFloat((currentAdvance - advanceToAdjust).toFixed(2));
  const newPending = parseFloat((previousDue + netPayable).toFixed(2));

  await db.prepare(`
    UPDATE customers
    SET advance_balance = ?, pending_balance = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?

  `).run(newAdvance, newPending, customer.id);

  // Record or update in Customer Ledger (idempotent - no duplicate entries)
  await upsertBillLedgerEntry({
    customerId: customer.id,
    billId,
    transactionDate: billDate,
    grossAmount,
    advanceToAdjust,
    advanceBalanceAfter: newAdvance,
    pendingBalanceAfter: newPending,
    description: `Delivered Milk Bill for ${billingMonth} (${deliveries.length} deliveries, Gross: ₹${grossAmount}, Advance Deducted: ₹${advanceToAdjust}, Remaining Advance: ₹${newAdvance}, Payable: ₹${netPayable})`
  });

  return await db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
}

// Alias for backwards compatibility
async function generatePostpaidBill(customer, billingMonth, forceRegenerate = false) {
  return await generateDeliveredMilkBill(customer, billingMonth, forceRegenerate);
}

/**
 * Helper to generate sequential weekly bill numbers: WB-YYYYMMDD-XXXX
 */
async function generateWeeklyBillNumber(startDateStr) {
  const cleanDate = (startDateStr || '').replace(/-/g, '');
  const prefix = `WB-${cleanDate}-`;
  const maxRow = await db.prepare(`SELECT bill_number FROM bills WHERE bill_number LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}%`);
  let nextSeq = 1;
  if (maxRow && maxRow.bill_number) {
    const parts = maxRow.bill_number.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }
  let billNum = `${prefix}${nextSeq.toString().padStart(4, '0')}`;
  let exists = await db.prepare('SELECT id FROM bills WHERE bill_number = ?').get(billNum);
  while (exists) {
    nextSeq++;
    billNum = `${prefix}${nextSeq.toString().padStart(4, '0')}`;
    exists = await db.prepare('SELECT id FROM bills WHERE bill_number = ?').get(billNum);
  }
  return billNum;
}

/**
 * Generates Weekly Bill based on actual deliveries recorded for that customer between startDate and endDate.
 */
async function generateWeeklyBillForCustomer(customer, startDate, endDate, forceRegenerate = false) {
  if (customer.billing_type === 'COUPON') {
    return null; // Coupon customers pay via coupon books
  }

  const billingMonthStr = `${startDate} to ${endDate}`;

  // Check if weekly bill already exists for this exact period
  const existing = await db.prepare(`
    SELECT * FROM bills 
    WHERE customer_id = ? AND billing_type = 'WEEKLY' 
      AND ((start_date = ? AND end_date = ?) OR billing_month = ?)
  `).get(customer.id, startDate, endDate, billingMonthStr);

  if (existing && !forceRegenerate) {
    return existing;
  }

  // Fetch actual delivered records between startDate and endDate,
  // excluding any dates that are already billed in other active bills
  const existingBillId = existing ? existing.id : null;
  const excludeExistingClause = existingBillId ? 'AND b.id != ?' : '';
  const deliveryParams = [customer.id, startDate, endDate];
  if (existingBillId) {
    deliveryParams.push(existingBillId);
  }

  const deliveries = await db.prepare(`
    SELECT d.* FROM deliveries d
    WHERE d.customer_id = ? 
      AND d.delivery_date >= ? AND d.delivery_date <= ? 
      AND d.status = 'DELIVERED'
      AND NOT EXISTS (
        SELECT 1 FROM bills b
        WHERE b.customer_id = d.customer_id
          AND b.status != 'CANCELLED'
          ${excludeExistingClause}
          AND b.start_date IS NOT NULL 
          AND b.end_date IS NOT NULL
          AND d.delivery_date >= b.start_date 
          AND d.delivery_date <= b.end_date
      )
    ORDER BY d.delivery_date ASC
  `).all(...deliveryParams);

  if (!deliveries || deliveries.length === 0) {
    return null; // No deliveries to bill
  }

  let totalProductSubtotal = 0;
  let totalDeliveryCharges = 0;

  // Group delivered items by product variant for clean invoice presentation
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

  // Reconcile prior months and determine advance & previous dues
  const duesInfo = await calculateCustomerPendingDues(customer.id, {
    excludeBillId: existing ? existing.id : null,
    upToBillDate: startDate
  });
  const previousDue = duesInfo.totalUnpaid;
  let currentAdvance = Number(duesInfo.surplusAdvance || 0);

  const freshCustomer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer.id);
  if (freshCustomer && Number(freshCustomer.advance_balance || 0) > currentAdvance) {
    currentAdvance = Number(freshCustomer.advance_balance);
  }

  // If regenerating existing bill, restore previous balances before reapplying
  if (existing && forceRegenerate) {
    const prevAdvanceAdjusted = Number(existing.advance_adjusted || 0);
    let prevCashPaid = Number(existing.paid_amount || 0);
    if (existing.status === 'ADVANCE_PAID' || Number(existing.net_payable || 0) === 0) {
      prevCashPaid = 0;
    }

    // Restore advance balance: add back advance adjusted plus any cash payments made towards this bill
    currentAdvance = parseFloat((currentAdvance + prevAdvanceAdjusted + prevCashPaid).toFixed(2));
  }

  let advanceToAdjust = 0;
  if (currentAdvance >= grossAmount) {
    advanceToAdjust = grossAmount;
  } else {
    advanceToAdjust = currentAdvance;
  }

  const netPayable = parseFloat((grossAmount - advanceToAdjust).toFixed(2));
  const paidAmount = 0;

  let billStatus = 'GENERATED';
  if (netPayable === 0) {
    billStatus = advanceToAdjust > 0 ? 'ADVANCE_PAID' : 'PAID';
  } else if (advanceToAdjust > 0) {
    billStatus = 'PARTIALLY_PAID';
  } else {
    billStatus = 'PENDING';
  }

  const billNumber = existing ? existing.bill_number : await generateWeeklyBillNumber(startDate);
  const billDate = endDate;
  const dueDate = endDate;

  let billId = existing ? existing.id : null;

  if (existing && forceRegenerate) {
    await db.prepare(`
      UPDATE bills
      SET total_deliveries_count = ?, product_subtotal = ?, delivery_charges_total = ?,
          gross_amount = ?, previous_due = ?, advance_adjusted = ?, net_payable = ?,
          paid_amount = ?, status = ?, items_json = ?, notes = ?, start_date = ?, end_date = ?,
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      deliveries.length, totalProductSubtotal, totalDeliveryCharges, grossAmount,
      previousDue, advanceToAdjust, netPayable, paidAmount, billStatus,
      JSON.stringify(groupedItems), `Weekly Delivered Milk Bill (${startDate} to ${endDate})`,
      startDate, endDate,
      existing.id
    );
    billId = existing.id;
  } else {
    const info = await db.prepare(`
      INSERT INTO bills (
        bill_number, customer_id, billing_month, billing_type, bill_date, due_date,
        start_date, end_date,
        total_deliveries_count, product_subtotal, delivery_charges_total, gross_amount,
        previous_due, advance_adjusted, net_payable, paid_amount, status, lifecycle_stage,
        items_json, notes, agent_id, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'WEEKLY', ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, 'FINALIZED',
        ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(
      billNumber, customer.id, billingMonthStr, billDate, dueDate,
      startDate, endDate,
      deliveries.length, totalProductSubtotal, totalDeliveryCharges, grossAmount,
      previousDue, advanceToAdjust, netPayable, paidAmount, billStatus,
      JSON.stringify(groupedItems), `Weekly Delivered Milk Bill (${startDate} to ${endDate})`,
      customer.agent_id || 1
    );
    billId = info.lastInsertRowid;
  }

  // Update customer balances: Advance is minused and pending updated
  const newAdvance = parseFloat((currentAdvance - advanceToAdjust).toFixed(2));
  const newPending = parseFloat((previousDue + netPayable).toFixed(2));

  await db.prepare(`
    UPDATE customers
    SET advance_balance = ?, pending_balance = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?

  `).run(newAdvance, newPending, customer.id);

  // Record in Customer Ledger
  await upsertBillLedgerEntry({
    customerId: customer.id,
    billId,
    transactionDate: billDate,
    grossAmount,
    advanceToAdjust,
    advanceBalanceAfter: newAdvance,
    pendingBalanceAfter: newPending,
    description: `Weekly Delivered Milk Bill (${startDate} to ${endDate}, ${deliveries.length} deliveries, Gross: ₹${grossAmount}, Advance Deducted: ₹${advanceToAdjust}, Payable: ₹${netPayable})`
  });

  return await db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
}

/**
 * Generate weekly bills for all weekly customers or customers with deliveries in period
 */
async function generateWeeklyBillsForPeriod(startDate, endDate, options = {}) {
  const forceRegenerate = Boolean(options.forceRegenerate);
  const agentId = options.agentId || null;
  const targetCustomerId = options.customerId || null;

  let custQuery = `SELECT * FROM customers WHERE status = 'ACTIVE'`;
  const custParams = [];

  if (targetCustomerId) {
    custQuery += ` AND id = ?`;
    custParams.push(targetCustomerId);
  } else {
    // Generate for all customers whose billing_type is 'WEEKLY'
    custQuery += ` AND billing_type = 'WEEKLY'`;
  }

  if (agentId) {
    custQuery += ` AND agent_id = ?`;
    custParams.push(agentId);
  }

  const customers = await db.prepare(custQuery).all(...custParams);
  const results = {
    period: `${startDate} to ${endDate}`,
    startDate,
    endDate,
    weeklyBillsGenerated: 0,
    skipped: 0,
    totalGrossAmount: 0
  };

  for (const cust of customers) {
    const bill = await generateWeeklyBillForCustomer(cust, startDate, endDate, forceRegenerate);
    if (bill) {
      results.weeklyBillsGenerated++;
      results.totalGrossAmount += (bill.gross_amount || 0);
    } else {
      results.skipped++;
    }
  }

  results.totalGrossAmount = parseFloat(results.totalGrossAmount.toFixed(2));
  return results;
}

/**
 * Intelligent single customer bill generator:
 * - PREPAID Customers: Bill is strictly generated according to SCHEDULED DAYS (Advance Monthly Subscription Bill).
 * - POSTPAID Customers: Bill is strictly generated according to ACTUAL MILK DELIVERED in that month.
 * - BULK / Hotel: Always generated according to actual milk delivered.
 * - COUPON Customers: Never receive monthly bills (they pay via coupon books).
 */
async function generateBillForCustomer(customer, billingMonth, { billingBasis = 'AUTO', forceRegenerate = false } = {}) {
  // Coupon customers pay strictly through coupon book purchases.
  // Legacy / existing coupon customers have already paid offline, and payment calculation
  // starts strictly when their next coupon book is purchased in the system.
  // They must NEVER receive monthly or delivered milk bills.
  if (customer.billing_type === 'COUPON') {
    return null;
  }

  // 1. Bulk / Hotel customers strictly use delivered milk billing
  if (customer.customer_category === 'BULK_HOTEL') {
    return await generateDeliveredMilkBill(customer, billingMonth, forceRegenerate);
  }

  // Check if actual deliveries exist for this customer in billingMonth
  const delCountRow = await db.prepare(`
    SELECT COUNT(*) as count FROM deliveries
    WHERE customer_id = ? AND delivery_date LIKE ? AND status = 'DELIVERED'
  `).get(customer.id, `${billingMonth}%`);
  const hasDeliveries = delCountRow && Number(delCountRow.count) > 0;

  // 2. Explicit billingBasis choices:
  if (billingBasis === 'DELIVERIES') {
    if (!hasDeliveries) {
      return null;
    }
    return await generateDeliveredMilkBill(customer, billingMonth, forceRegenerate);
  }

  if (billingBasis === 'SUBSCRIPTION') {
    return await generateAdvanceBillForPrepaidCustomer(customer, billingMonth, forceRegenerate);
  }

  // 3. POSTPAID Customers:
  if (customer.billing_type === 'POSTPAID') {
    return await generateDeliveredMilkBill(customer, billingMonth, forceRegenerate);
  }

  // 4. PREPAID Customers:
  if (customer.billing_type === 'PREPAID') {
    // If the customer already has recorded deliveries marked DELIVERED in this month,
    // only generate delivered milk bill if the month has ENDED (billingMonth < currentMonthStr)
    // or if explicitly requested via billingBasis === 'DELIVERIES'.
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    if (billingBasis === 'DELIVERIES' || (billingBasis === 'AUTO' && hasDeliveries && billingMonth < currentMonthStr)) {
      return await generateDeliveredMilkBill(customer, billingMonth, forceRegenerate);
    }
    // For ongoing or future months, PREPAID customers ALWAYS receive their Full Month Advance Bill:
    return await generateAdvanceBillForPrepaidCustomer(customer, billingMonth, forceRegenerate);
  }

  // 5. DAILY customers:
  if (customer.billing_type === 'DAILY') {
    if (hasDeliveries) {
      return await generateDeliveredMilkBill(customer, billingMonth, forceRegenerate);
    }
    return null;
  }

  // 6. Fallback for unclassified customers:
  if (hasDeliveries) {
    return await generateDeliveredMilkBill(customer, billingMonth, forceRegenerate);
  }
  return await generateAdvanceBillForPrepaidCustomer(customer, billingMonth, forceRegenerate);
}

/**
 * Automatically runs monthly bill generation for all active customers for a given month.
 * Safe to call repeatedly (idempotent, or forces regeneration if forceRegenerate=true).
 */
async function runMonthlyBillGeneration(targetMonth, options = {}) {
  const forceRegenerate = typeof options === 'boolean' ? options : Boolean(options.forceRegenerate);
  const billingBasis = typeof options === 'object' && options.billingBasis ? options.billingBasis : 'AUTO';
  const agentId = typeof options === 'object' && options.agentId ? options.agentId : null;
  const currentMonthStr = targetMonth || new Date().toISOString().slice(0, 7); // YYYY-MM
  
  let custQuery = `SELECT * FROM customers WHERE status = 'ACTIVE' AND (billing_type IS NULL OR billing_type != 'COUPON')`;
  const custParams = [];
  if (agentId) {
    custQuery += ` AND agent_id = ?`;
    custParams.push(agentId);
  }
  const customers = await db.prepare(custQuery).all(...custParams);
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

  if (bill.billing_type === 'WEEKLY' && bill.start_date && bill.end_date) {
    return await generateWeeklyBillForCustomer(customer, bill.start_date, bill.end_date, true);
  }

  let effBasis = billingBasis;
  if (effBasis === 'AUTO') {
    if (bill.notes?.includes('Delivered Milk') || (bill.total_deliveries_count > 0 && bill.total_deliveries_count < 28)) {
      effBasis = 'DELIVERIES';
    }
  }

  return await generateBillForCustomer(customer, bill.billing_month, { billingBasis: effBasis, forceRegenerate: true });
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

  // Generate sequential unique Receipt Number
  const currentYear = new Date().getFullYear();
  const prefix = `RCT-${currentYear}-`;
  const maxRow = await db.prepare(`SELECT receipt_number FROM payments WHERE receipt_number LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}%`);
  let nextSeq = 1;
  if (maxRow && maxRow.receipt_number) {
    const parts = maxRow.receipt_number.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextSeq = lastNum + 1;
    }
  }
  let receiptNumber = `${prefix}${nextSeq.toString().padStart(5, '0')}`;
  let exists = await db.prepare('SELECT id FROM payments WHERE receipt_number = ?').get(receiptNumber);
  while (exists) {
    nextSeq++;
    receiptNumber = `${prefix}${nextSeq.toString().padStart(5, '0')}`;
    exists = await db.prepare('SELECT id FROM payments WHERE receipt_number = ?').get(receiptNumber);
  }

  const insertPayment = db.prepare(`
    INSERT INTO payments (
      receipt_number, customer_id, bill_id, payment_type, amount, payment_date,
      payment_method, reference_number, notes, agent_id, created_at, recorded_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), ?)
  `);

  const pResult = await insertPayment.run(
    receiptNumber, customerId, billId, paymentType, numAmount, paymentDate,
    paymentMethod, referenceNumber, notes, customer.agent_id || 1, recordedByUserId
  );
  const paymentId = pResult.lastInsertRowid;

  let remainingPayment = numAmount;
  let currentAdvance = customer.advance_balance || 0;

  // 1. If a specific bill was selected, settle it first
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

      remainingPayment = parseFloat((remainingPayment - settleAmount).toFixed(2));
    }
  }

  // 2. Settle remaining unpaid bills in chronological order (oldest first)
  // This reduces prior bills ("make previous bill less")
  if (remainingPayment > 0) {
    const pendingBills = await db.prepare(`
      SELECT * FROM bills 
      WHERE customer_id = ? AND status != 'CANCELLED' AND (net_payable - paid_amount) > 0
      ORDER BY bill_date ASC, id ASC
    `).all(customerId);

    for (const b of pendingBills) {
      if (remainingPayment <= 0) break;
      if (billId && b.id === parseInt(billId)) continue; // already settled above

      const bUnpaid = Math.max(0, b.net_payable - b.paid_amount);
      const applyToB = Math.min(bUnpaid, remainingPayment);
      const bNewPaid = parseFloat((b.paid_amount + applyToB).toFixed(2));
      const bNewStatus = bNewPaid >= b.net_payable ? 'PAID' : 'PARTIALLY_PAID';

      await db.prepare(`
        UPDATE bills
        SET paid_amount = ?, status = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(bNewPaid, bNewStatus, b.id);

      remainingPayment = parseFloat((remainingPayment - applyToB).toFixed(2));
    }
  }

  // 3. Any excess payment after all unpaid bills are cleared is credited directly to advance_balance!
  if (remainingPayment > 0) {
    currentAdvance = parseFloat((currentAdvance + remainingPayment).toFixed(2));
  }

  // 4. Synchronize subsequent bills' previous_due to reflect reduced or cleared dues:
  const allCustomerBills = await db.prepare(`
    SELECT id, bill_date, net_payable, paid_amount
    FROM bills
    WHERE customer_id = ? AND status != 'CANCELLED'
    ORDER BY bill_date ASC, id ASC
  `).all(customerId);

  for (let i = 0; i < allCustomerBills.length; i++) {
    const currentB = allCustomerBills[i];
    let earlierUnpaidSum = 0;
    for (let j = 0; j < i; j++) {
      const priorB = allCustomerBills[j];
      const unpaid = Math.max(0, priorB.net_payable - priorB.paid_amount);
      earlierUnpaidSum += unpaid;
    }
    earlierUnpaidSum = parseFloat(earlierUnpaidSum.toFixed(2));

    await db.prepare(`
      UPDATE bills SET previous_due = ? WHERE id = ?
    `).run(earlierUnpaidSum, currentB.id);
  }

  // 5. Total customer pending balance is the exact sum of remaining unpaid amounts across all active bills
  let totalPendingNow = 0;
  for (const b of allCustomerBills) {
    totalPendingNow += Math.max(0, b.net_payable - b.paid_amount);
  }
  totalPendingNow = parseFloat(totalPendingNow.toFixed(2));

  // Update customer balances
  await db.prepare(`
    UPDATE customers
    SET advance_balance = ?, pending_balance = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(currentAdvance, totalPendingNow, customerId);

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
    totalPendingNow,
    `Payment received via ${paymentMethod} (Receipt: ${receiptNumber}, Ref: ${referenceNumber || 'N/A'})`
  );

  return await db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
}

/**
 * Calculates advance monthly billing projections for customers who pay in advance.
 * Does not write to DB - used for interactive calculation and preview before generating bills.
 * Keeps calculation rules 100% identical.
 */
async function calculateAdvanceProjectionForMonth(billingMonth, agentId = null) {
  const daysInMonth = getDaysInMonth(billingMonth);
  const monthStart = `${billingMonth}-01`;
  const monthEnd = `${billingMonth}-${daysInMonth.toString().padStart(2, '0')}`;

  let custQuery = `SELECT * FROM customers WHERE status = 'ACTIVE'`;
  const custParams = [];
  if (agentId) {
    custQuery += ` AND agent_id = ?`;
    custParams.push(agentId);
  }
  custQuery += ` ORDER BY name ASC`;

  const customers = await db.prepare(custQuery).all(...custParams);

  const projections = [];
  let totalProjectedGross = 0;
  let totalAvailableAdvance = 0;
  let totalProjectedPayable = 0;

  for (const customer of customers) {
    if (customer.billing_type === 'COUPON') continue;

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

/**
 * Updates an existing payment transaction with corrected amounts/fields and adjusts customer balances.
 */
async function updatePaymentTransaction(paymentId, {
  amount,
  paymentDate,
  paymentMethod,
  referenceNumber = '',
  notes = '',
  agentId = null
}) {
  const payment = await db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!payment) {
    throw new Error('Payment not found');
  }

  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(payment.customer_id);
  if (!customer) {
    throw new Error('Customer associated with payment not found');
  }

  const oldAmount = parseFloat(payment.amount) || 0;
  const newAmount = parseFloat(amount);
  if (isNaN(newAmount) || newAmount <= 0) {
    throw new Error('Invalid payment amount');
  }

  const diff = parseFloat((newAmount - oldAmount).toFixed(2));
  let currentAdvance = customer.advance_balance || 0;
  let currentPending = customer.pending_balance || 0;

  if (diff !== 0) {
    if (payment.payment_type === 'ADVANCE_PAYMENT') {
      currentAdvance = Math.max(0, parseFloat((currentAdvance + diff).toFixed(2)));
    } else {
      currentPending = Math.max(0, parseFloat((currentPending - diff).toFixed(2)));
    }

    await db.prepare(`
      UPDATE customers 
      SET advance_balance = ?, pending_balance = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(currentAdvance, currentPending, customer.id);
  }

  // Update payment record
  await db.prepare(`
    UPDATE payments 
    SET amount = ?, payment_date = ?, payment_method = ?, reference_number = ?, notes = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    newAmount,
    paymentDate || payment.payment_date,
    paymentMethod || payment.payment_method,
    referenceNumber !== undefined ? referenceNumber : payment.reference_number,
    notes !== undefined ? notes : payment.notes,
    paymentId
  );

  // Update or insert corresponding ledger entry
  const ledgerRef = `PAY-${paymentId}`;
  const ledgerRow = await db.prepare(`
    SELECT id FROM customer_ledger 
    WHERE customer_id = ? AND reference_id = ?
    LIMIT 1
  `).get(customer.id, ledgerRef);

  if (ledgerRow) {
    await db.prepare(`
      UPDATE customer_ledger 
      SET transaction_date = ?, credit = ?, advance_balance_after = ?, pending_balance_after = ?,
          description = ?, created_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      paymentDate || payment.payment_date,
      newAmount,
      currentAdvance,
      currentPending,
      `Payment corrected via ${paymentMethod || payment.payment_method} (Receipt: ${payment.receipt_number}, Ref: ${referenceNumber || 'N/A'})`,
      ledgerRow.id
    );
  }

  return await db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
}

/**
 * Soft-deletes / voids an existing payment transaction and reverts customer balance.
 * The payment record is marked as deleted but NOT physically removed so it can be restored.
 */
async function deletePaymentTransaction(paymentId, agentId = null) {
  const payment = await db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
  if (!payment) {
    throw new Error('Payment not found');
  }

  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(payment.customer_id);
  if (customer) {
    const pAmt = parseFloat(payment.amount) || 0;
    let currentAdvance = customer.advance_balance || 0;
    let currentPending = customer.pending_balance || 0;

    if (payment.payment_type === 'ADVANCE_PAYMENT') {
      currentAdvance = Math.max(0, parseFloat((currentAdvance - pAmt).toFixed(2)));
    } else {
      currentPending = parseFloat((currentPending + pAmt).toFixed(2));
    }

    await db.prepare(`
      UPDATE customers 
      SET advance_balance = ?, pending_balance = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(currentAdvance, currentPending, customer.id);

    // If payment linked to a bill, revert its paid_amount and status
    if (payment.bill_id) {
      const bill = await db.prepare('SELECT * FROM bills WHERE id = ?').get(payment.bill_id);
      if (bill) {
        const newPaid = Math.max(0, parseFloat((bill.paid_amount - pAmt).toFixed(2)));
        let newStatus = 'GENERATED';
        if (newPaid > 0 && newPaid < bill.net_payable) {
          newStatus = 'PARTIALLY_PAID';
        } else if (newPaid >= bill.net_payable) {
          newStatus = 'PAID';
        }
        await db.prepare(`
          UPDATE bills
          SET paid_amount = ?, status = ?, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(newPaid, newStatus, bill.id);
      }
    }

    // Soft-delete the ledger entry (mark instead of delete so it can be restored)
    const ledgerRef = `PAY-${paymentId}`;
    await db.prepare(`
      DELETE FROM customer_ledger 
      WHERE customer_id = ? AND reference_id = ?
    `).run(customer.id, ledgerRef);
  }

  // Soft-delete: mark payment as deleted but keep the record for potential undo
  await db.prepare(`
    UPDATE payments SET is_deleted = 1, deleted_at = datetime('now', 'localtime') WHERE id = ?
  `).run(paymentId);

  return { success: true, message: `Payment ${payment.receipt_number} voided successfully`, paymentId };
}

/**
 * Restores a previously soft-deleted payment and re-applies customer balance changes.
 */
async function restorePaymentTransaction(paymentId) {
  const payment = await db.prepare('SELECT * FROM payments WHERE id = ? AND is_deleted = 1').get(paymentId);
  if (!payment) {
    throw new Error('Payment not found or not deleted');
  }

  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(payment.customer_id);
  if (customer) {
    const pAmt = parseFloat(payment.amount) || 0;
    let currentAdvance = customer.advance_balance || 0;
    let currentPending = customer.pending_balance || 0;

    // Re-apply the payment effect
    if (payment.payment_type === 'ADVANCE_PAYMENT') {
      currentAdvance = parseFloat((currentAdvance + pAmt).toFixed(2));
    } else {
      currentPending = Math.max(0, parseFloat((currentPending - pAmt).toFixed(2)));
    }

    await db.prepare(`
      UPDATE customers 
      SET advance_balance = ?, pending_balance = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(currentAdvance, currentPending, customer.id);

    // Restore the linked bill's paid_amount and status
    if (payment.bill_id) {
      const bill = await db.prepare('SELECT * FROM bills WHERE id = ?').get(payment.bill_id);
      if (bill) {
        const newPaid = parseFloat((bill.paid_amount + pAmt).toFixed(2));
        const newStatus = newPaid >= bill.net_payable ? 'PAID' : 'PARTIALLY_PAID';
        await db.prepare(`
          UPDATE bills
          SET paid_amount = ?, status = ?, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(newPaid, newStatus, bill.id);
      }
    }

    // Re-insert ledger entry
    await db.prepare(`
      INSERT INTO customer_ledger (
        customer_id, transaction_date, transaction_type, reference_id,
        debit, credit, advance_balance_after, pending_balance_after, description, created_at
      ) VALUES (?, ?, 'PAYMENT_RECEIVED', ?, 0, ?, ?, ?, ?, datetime('now', 'localtime'))
    `).run(
      customer.id,
      payment.payment_date,
      `PAY-${paymentId}`,
      pAmt,
      currentAdvance,
      currentPending,
      `Payment restored: ${payment.receipt_number} via ${payment.payment_method}`
    );
  }

  // Restore payment record
  await db.prepare(`
    UPDATE payments SET is_deleted = 0, deleted_at = NULL WHERE id = ?
  `).run(paymentId);

  return { success: true, message: `Payment ${payment.receipt_number} restored successfully` };
}

/**
 * Permanently hard-deletes a soft-deleted payment record (called after undo window expires).
 */
async function permanentlyDeletePayment(paymentId) {
  await db.prepare('DELETE FROM payments WHERE id = ? AND is_deleted = 1').run(paymentId);
  return { success: true };
}

module.exports = {
  getDaysInMonth,
  generateBillNumber,
  generateWeeklyBillNumber,
  generateAdvanceBillForPrepaidCustomer,
  generatePostpaidBill,
  generateDeliveredMilkBill,
  generateWeeklyBillForCustomer,
  generateWeeklyBillsForPeriod,
  generateBillForCustomer,
  calculateAdvanceProjectionForMonth,
  runMonthlyBillGeneration,
  recalculateSingleBill,
  calculateCustomerPendingDues,
  reconcileCustomerPastMonths,
  recordPaymentTransaction,
  updatePaymentTransaction,
  deletePaymentTransaction,
  restorePaymentTransaction,
  permanentlyDeletePayment
};

