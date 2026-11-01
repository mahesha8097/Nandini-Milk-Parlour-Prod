const ExcelJS = require('exceljs');
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
 * Parse custom days array or string representation
 */
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

/**
 * Compiles complete monthly billing, subscription projection, delivery, and payment data
 * for every active customer for a specific target month (YYYY-MM).
 */
async function compileMonthlyBillingData(targetMonth, agentId = 1) {
  const daysInMonth = getDaysInMonth(targetMonth);
  const monthStart = `${targetMonth}-01`;
  const monthEnd = `${targetMonth}-${daysInMonth.toString().padStart(2, '0')}`;

  // 1. Fetch Business Profile
  let profile = {};
  try {
    profile = await db.prepare('SELECT * FROM business_profile WHERE agent_id = ? ORDER BY id DESC LIMIT 1').get(agentId) || {};
  } catch (e) {}

  // 2. Fetch All Customers
  const customers = await db.prepare(`
    SELECT c.*, r.name as route_name, z.name as zone_name
    FROM customers c
    LEFT JOIN routes r ON c.route = r.name
    LEFT JOIN zones z ON c.zone_id = z.id
    WHERE c.agent_id = ?
    ORDER BY 
      CASE WHEN c.billing_type = 'PREPAID' THEN 1 WHEN c.billing_type = 'POSTPAID' THEN 2 WHEN c.billing_type = 'WEEKLY' THEN 3 WHEN c.billing_type = 'DAILY' THEN 4 ELSE 5 END,
      c.route ASC,
      CASE WHEN c.serial_no IS NULL OR c.serial_no = 0 THEN 9999 ELSE c.serial_no END ASC,
      c.name ASC
  `).all(agentId);

  // 3. Fetch All Active Subscriptions for this month
  const subscriptions = await db.prepare(`
    SELECT s.*, p.name as product_name, p.category, p.variant_label, p.unit_volume_litres,
           p.selling_price, p.delivery_charge_type, p.fixed_delivery_charge
    FROM subscriptions s
    JOIN products p ON s.product_id = p.id
    JOIN customers c ON s.customer_id = c.id
    WHERE c.agent_id = ? AND s.is_active = 1
      AND s.start_date <= ?
      AND (s.end_date IS NULL OR s.end_date = '' OR s.end_date >= ?)
  `).all(agentId, monthEnd, monthStart);

  // Map subscriptions by customer_id
  const subsByCust = {};
  subscriptions.forEach(sub => {
    if (!subsByCust[sub.customer_id]) subsByCust[sub.customer_id] = [];
    subsByCust[sub.customer_id].push(sub);
  });

  // 4. Fetch All Payments in this month
  const payments = await db.prepare(`
    SELECT p.*, c.name as customer_name, c.flat_no, c.route, c.billing_type as cust_billing_type
    FROM payments p
    JOIN customers c ON p.customer_id = c.id
    WHERE p.agent_id = ? 
      AND p.payment_date >= ? AND p.payment_date <= ?
      AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
    ORDER BY p.payment_date ASC, p.id ASC
  `).all(agentId, monthStart, monthEnd);

  // Map payments by customer_id
  const paymentsByCust = {};
  payments.forEach(p => {
    if (!paymentsByCust[p.customer_id]) paymentsByCust[p.customer_id] = [];
    paymentsByCust[p.customer_id].push(p);
  });

  // 5. Fetch Bills for this month
  const bills = await db.prepare(`
    SELECT * FROM bills
    WHERE agent_id = ? AND billing_month = ? AND status != 'CANCELLED'
  `).all(agentId, targetMonth);

  const billsByCust = {};
  bills.forEach(b => {
    billsByCust[b.customer_id] = b;
  });

  // 6. Fetch Completed Deliveries for this month
  const deliveriesSummary = await db.prepare(`
    SELECT customer_id,
           COUNT(*) as total_deliveries,
           SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_deliveries,
           SUM(CASE WHEN status = 'DELIVERED' THEN total_product_amount ELSE 0 END) as product_amount,
           SUM(CASE WHEN status = 'DELIVERED' THEN delivery_charge_snapshot ELSE 0 END) as delivery_charges,
           SUM(CASE WHEN status = 'DELIVERED' THEN total_amount ELSE 0 END) as total_delivered_amount
    FROM deliveries
    WHERE agent_id = ? AND delivery_date >= ? AND delivery_date <= ?
    GROUP BY customer_id
  `).all(agentId, monthStart, monthEnd);

  const deliveriesByCust = {};
  deliveriesSummary.forEach(d => {
    deliveriesByCust[d.customer_id] = d;
  });

  // 7. Compile Detailed Customer Rows
  const customerRows = [];
  let summary = {
    totalCustomers: customers.length,
    prepaidCustomers: 0,
    postpaidCustomers: 0,
    weeklyCustomers: 0,
    dailyCustomers: 0,
    couponCustomers: 0,
    totalSubscribedLitersPerDay: 0,
    totalProjectedMonthlyBill: 0,
    totalDeliveredValue: 0,
    totalAdvancePaymentsCollected: 0,
    totalDirectPaymentsCollected: 0,
    totalAllPaymentsCollected: 0,
    totalPendingBalance: 0,
    totalAdvanceBalanceHeld: 0
  };

  const routeBreakdown = {};

  const [yearNum, monthNum] = targetMonth.split('-').map(Number);

  for (let idx = 0; idx < customers.length; idx++) {
    const cust = customers[idx];
    const custSubs = subsByCust[cust.id] || [];
    const custPayments = paymentsByCust[cust.id] || [];
    const custBill = billsByCust[cust.id] || null;
    const custDeliv = deliveriesByCust[cust.id] || {
      total_deliveries: 0,
      completed_deliveries: 0,
      product_amount: 0,
      delivery_charges: 0,
      total_delivered_amount: 0
    };

    // Calculate customer billing type counts
    const bType = cust.billing_type || 'PREPAID';
    if (bType === 'PREPAID') summary.prepaidCustomers++;
    else if (bType === 'POSTPAID') summary.postpaidCustomers++;
    else if (bType === 'WEEKLY') summary.weeklyCustomers++;
    else if (bType === 'DAILY') summary.dailyCustomers++;
    else if (bType === 'COUPON') summary.couponCustomers++;

    // Calculate Subscriptions Projection for the month
    let subDescription = [];
    let dailyLiters = 0;
    let projectedProductSubtotal = 0;
    let projectedDeliveryCharges = 0;
    let totalScheduledPackets = 0;
    let totalActiveDays = 0;

    if (custSubs.length > 0) {
      custSubs.forEach(s => {
        const volLitres = (s.unit_volume_litres || 0.5) * s.quantity;
        dailyLiters += volLitres;
        subDescription.push(`${s.product_name} (${s.variant_label || '500ml'}) x ${s.quantity}/day`);
      });

      // Day-by-day subscription projection
      for (let d = 1; d <= daysInMonth; d++) {
        const dayDate = `${targetMonth}-${d.toString().padStart(2, '0')}`;
        const dayOfWeek = new Date(yearNum, monthNum - 1, d).getDay();

        const activeDaySubs = custSubs.filter(s => {
          if (s.start_date > dayDate) return false;
          if (s.end_date && s.end_date !== '' && s.end_date < dayDate) return false;
          if (s.frequency === 'CUSTOM' || s.custom_days) {
            const customDows = parseCustomDays(s.custom_days);
            if (customDows && !customDows.includes(dayOfWeek)) return false;
          } else if (s.frequency === 'ALTERNATE_DAYS') {
            const sDay = parseInt(s.start_date.split('-')[2], 10) || 1;
            if ((d - sDay) % 2 !== 0) return false;
          }
          return true;
        });

        if (activeDaySubs.length === 0) continue;
        totalActiveDays++;

        const dailyItems = activeDaySubs.map(s => ({
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

        const calculatedDaily = calculateDeliveryChargesForCustomerDay(cust.customer_category, dailyItems, cust.billing_type);

        calculatedDaily.forEach(item => {
          projectedProductSubtotal += (item.sellingPrice * item.quantity);
          projectedDeliveryCharges += (item.deliveryCharge || 0);
          totalScheduledPackets += item.quantity;
        });
      }
    }

    projectedProductSubtotal = parseFloat(projectedProductSubtotal.toFixed(2));
    projectedDeliveryCharges = parseFloat(projectedDeliveryCharges.toFixed(2));
    const projectedMonthlyBill = parseFloat((projectedProductSubtotal + projectedDeliveryCharges).toFixed(2));

    // Calculate Payments in this Month
    let advancePaidInMonth = 0;
    let directPaidInMonth = 0;
    const paymentReceiptNumbers = [];

    custPayments.forEach(p => {
      const amt = parseFloat(p.amount) || 0;
      if (p.payment_type === 'ADVANCE_PAYMENT') {
        advancePaidInMonth += amt;
      } else {
        directPaidInMonth += amt;
      }
      if (p.receipt_number) {
        paymentReceiptNumbers.push(p.receipt_number);
      }
    });

    advancePaidInMonth = parseFloat(advancePaidInMonth.toFixed(2));
    directPaidInMonth = parseFloat(directPaidInMonth.toFixed(2));
    const totalPaidInMonth = parseFloat((advancePaidInMonth + directPaidInMonth).toFixed(2));

    const pendingBalance = parseFloat((cust.pending_balance || 0).toFixed(2));
    const advanceBalance = parseFloat((cust.advance_balance || 0).toFixed(2));
    const deliveredTotal = parseFloat((custDeliv.total_delivered_amount || 0).toFixed(2));

    // Determine Status
    let paymentStatus = 'NO_SUBSCRIPTION';
    if (custSubs.length > 0 || deliveredTotal > 0 || custBill) {
      if (pendingBalance <= 0) {
        if (bType === 'PREPAID') {
          paymentStatus = advancePaidInMonth >= projectedMonthlyBill || advanceBalance > 0 ? 'PAID' : 'PAID';
        } else {
          paymentStatus = 'PAID';
        }
      } else if (totalPaidInMonth > 0) {
        paymentStatus = 'PARTIALLY_PAID';
      } else {
        paymentStatus = 'UNPAID';
      }
    }

    if (custBill && custBill.status === 'PAID') {
      paymentStatus = 'PAID';
    }

    // Accumulate to overall summary
    summary.totalSubscribedLitersPerDay += dailyLiters;
    summary.totalProjectedMonthlyBill += projectedMonthlyBill;
    summary.totalDeliveredValue += deliveredTotal;
    summary.totalAdvancePaymentsCollected += advancePaidInMonth;
    summary.totalDirectPaymentsCollected += directPaidInMonth;
    summary.totalAllPaymentsCollected += totalPaidInMonth;
    summary.totalPendingBalance += pendingBalance;
    summary.totalAdvanceBalanceHeld += advanceBalance;

    // Route breakdown
    const rName = cust.route || 'Unassigned';
    if (!routeBreakdown[rName]) {
      routeBreakdown[rName] = {
        name: rName,
        customerCount: 0,
        prepaidCount: 0,
        postpaidCount: 0,
        projectedMonthlyBill: 0,
        totalPaid: 0,
        pendingBalance: 0
      };
    }
    routeBreakdown[rName].customerCount++;
    if (bType === 'PREPAID') routeBreakdown[rName].prepaidCount++;
    else routeBreakdown[rName].postpaidCount++;
    routeBreakdown[rName].projectedMonthlyBill += projectedMonthlyBill;
    routeBreakdown[rName].totalPaid += totalPaidInMonth;
    routeBreakdown[rName].pendingBalance += pendingBalance;

    customerRows.push({
      slNo: idx + 1,
      customerId: cust.id,
      serialNo: cust.serial_no || (idx + 1),
      flatNo: cust.flat_no || cust.address || 'N/A',
      name: cust.name,
      phone: cust.phone || 'N/A',
      route: cust.route || 'Route 1',
      zone: cust.zone_name || 'General',
      category: cust.customer_category || 'APARTMENT',
      billingType: bType,
      hasActiveSubscription: custSubs.length > 0,
      subscriptionsSummary: subDescription.length > 0 ? subDescription.join('; ') : 'No Active Subscription',
      dailyLiters: parseFloat(dailyLiters.toFixed(2)),
      activeDaysCount: totalActiveDays,
      totalScheduledPackets,
      projectedProductSubtotal,
      projectedDeliveryCharges,
      projectedMonthlyBill,
      deliveredDeliveriesCount: custDeliv.completed_deliveries || 0,
      deliveredTotalAmount: deliveredTotal,
      billId: custBill ? custBill.id : null,
      billNumber: custBill ? custBill.bill_number : 'Not Generated',
      billNetPayable: custBill ? parseFloat(custBill.net_payable) : null,
      billPaidAmount: custBill ? parseFloat(custBill.paid_amount) : null,
      billStatus: custBill ? custBill.status : (custSubs.length > 0 ? 'NOT_GENERATED' : 'N/A'),
      advancePaidInMonth,
      directPaidInMonth,
      totalPaidInMonth,
      paymentReceipts: paymentReceiptNumbers.join(', ') || 'None',
      pendingBalance,
      advanceBalance,
      paymentStatus
    });
  }

  // Format summary numbers
  summary.totalSubscribedLitersPerDay = parseFloat(summary.totalSubscribedLitersPerDay.toFixed(2));
  summary.totalProjectedMonthlyBill = parseFloat(summary.totalProjectedMonthlyBill.toFixed(2));
  summary.totalDeliveredValue = parseFloat(summary.totalDeliveredValue.toFixed(2));
  summary.totalAdvancePaymentsCollected = parseFloat(summary.totalAdvancePaymentsCollected.toFixed(2));
  summary.totalDirectPaymentsCollected = parseFloat(summary.totalDirectPaymentsCollected.toFixed(2));
  summary.totalAllPaymentsCollected = parseFloat(summary.totalAllPaymentsCollected.toFixed(2));
  summary.totalPendingBalance = parseFloat(summary.totalPendingBalance.toFixed(2));
  summary.totalAdvanceBalanceHeld = parseFloat(summary.totalAdvanceBalanceHeld.toFixed(2));

  return {
    targetMonth,
    daysInMonth,
    monthStart,
    monthEnd,
    profile,
    summary,
    routes: Object.values(routeBreakdown),
    payments,
    customers: customerRows
  };
}

/**
 * Builds a clean, professional, multi-tab Excel workbook with ExcelJS.
 */
async function buildMonthlyBillingWorkbook(targetMonth, agentId = 1) {
  const data = await compileMonthlyBillingData(targetMonth, agentId);
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'Nandini Milk Parlour';
  workbook.lastModifiedBy = 'Nandini Milk Parlour Automatic Billing System';
  workbook.created = new Date();
  workbook.modified = new Date();

  const businessName = data.profile.business_name || 'Nandini Milk Parlour';
  const subtitle = `Monthly Customer Billing & Payment Reconciliation — ${data.targetMonth}`;

  // Styling Constants
  const fontFamily = 'Calibri';
  const navyHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // Dark Blue
  const tealHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; // Teal for Advance
  const amberHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } }; // Amber for Postpaid
  const purpleHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF581C87' } }; // Purple for Receipts
  const whiteBoldFont = { name: fontFamily, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  const zebraFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  const totalRowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };

  const totalRowBorder = {
    top: { style: 'thin', color: { argb: 'FF64748B' } },
    bottom: { style: 'double', color: { argb: 'FF0F172A' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };

  const currencyFmt = '₹#,##0.00;[Red](₹#,##0.00);"-"';

  // =========================================================================
  // SHEET 1: 📊 Overview & Summary
  // =========================================================================
  const wsSummary = workbook.addWorksheet('📊 Overview & Summary', {
    views: [{ showGridLines: true }]
  });

  // Title Block
  wsSummary.mergeCells('A1:G1');
  const titleCell = wsSummary.getCell('A1');
  titleCell.value = `🥛 ${businessName.toUpperCase()}`;
  titleCell.font = { name: fontFamily, size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = navyHeaderFill;
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsSummary.getRow(1).height = 36;

  wsSummary.mergeCells('A2:G2');
  const subCell = wsSummary.getCell('A2');
  subCell.value = `${subtitle} | Generated on ${new Date().toLocaleString('en-IN')}`;
  subCell.font = { name: fontFamily, size: 10, italic: true, color: { argb: 'FF475569' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  wsSummary.getRow(2).height = 20;

  // KPI Section Header
  wsSummary.getCell('A4').value = 'MONTHLY FINANCIAL & CUSTOMER METRICS SUMMARY';
  wsSummary.getCell('A4').font = { name: fontFamily, size: 12, bold: true, color: { argb: 'FF1E3A8A' } };

  // KPI Cards Table
  const kpis = [
    ['Total Registered Customers', data.summary.totalCustomers, 'Active Subscribed Milk Volume', `${data.summary.totalSubscribedLitersPerDay} L / day`],
    ['Prepaid (Advance) Customers', data.summary.prepaidCustomers, 'Expected Monthly Subscription Total', data.summary.totalProjectedMonthlyBill],
    ['Postpaid & Weekly Customers', data.summary.postpaidCustomers + data.summary.weeklyCustomers, 'Total Advance Payments Received', data.summary.totalAdvancePaymentsCollected],
    ['Daily Spot Customers', data.summary.dailyCustomers, 'Total Direct / Bill Payments Received', data.summary.totalDirectPaymentsCollected],
    ['Coupon Customers', data.summary.couponCustomers, 'Total Collections Received in Month', data.summary.totalAllPaymentsCollected],
    ['Total Pending Dues Across Customers', data.summary.totalPendingBalance, 'Total Customer Advance Wallet Balance Held', data.summary.totalAdvanceBalanceHeld]
  ];

  let kpiRowIdx = 5;
  kpis.forEach(k => {
    const row = wsSummary.getRow(kpiRowIdx);
    row.getCell(1).value = k[0];
    row.getCell(2).value = k[1];
    row.getCell(4).value = k[2];
    row.getCell(5).value = k[3];

    row.getCell(1).font = { name: fontFamily, size: 10, bold: true };
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    row.getCell(2).font = { name: fontFamily, size: 11, bold: true, color: { argb: 'FF1E3A8A' } };
    row.getCell(2).alignment = { horizontal: 'right' };
    if (typeof k[1] === 'number' && k[0].includes('Dues')) {
      row.getCell(2).numFmt = currencyFmt;
      row.getCell(2).font = { name: fontFamily, size: 11, bold: true, color: { argb: 'FFDC2626' } };
    }

    row.getCell(4).font = { name: fontFamily, size: 10, bold: true };
    row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    row.getCell(5).font = { name: fontFamily, size: 11, bold: true, color: { argb: 'FF0F766E' } };
    row.getCell(5).alignment = { horizontal: 'right' };
    if (typeof k[3] === 'number') {
      row.getCell(5).numFmt = currencyFmt;
    }

    [1, 2, 4, 5].forEach(col => {
      row.getCell(col).border = thinBorder;
    });

    row.height = 24;
    kpiRowIdx++;
  });

  // Route-wise Summary Table
  kpiRowIdx += 2;
  wsSummary.getCell(`A${kpiRowIdx}`).value = 'DELIVERY ROUTE-WISE BILLING BREAKDOWN';
  wsSummary.getCell(`A${kpiRowIdx}`).font = { name: fontFamily, size: 12, bold: true, color: { argb: 'FF1E3A8A' } };
  kpiRowIdx++;

  const routeHeaders = ['Route Name', 'Customers', 'Prepaid', 'Postpaid', 'Projected Monthly Bill', 'Total Paid', 'Pending Balance'];
  const routeHeaderRow = wsSummary.getRow(kpiRowIdx);
  routeHeaders.forEach((h, i) => {
    const cell = routeHeaderRow.getCell(i + 1);
    cell.value = h;
    cell.font = whiteBoldFont;
    cell.fill = navyHeaderFill;
    cell.alignment = { horizontal: i > 3 ? 'right' : 'center', vertical: 'middle' };
    cell.border = thinBorder;
  });
  routeHeaderRow.height = 24;
  kpiRowIdx++;

  data.routes.forEach((r, idx) => {
    const row = wsSummary.getRow(kpiRowIdx);
    row.getCell(1).value = r.name;
    row.getCell(2).value = r.customerCount;
    row.getCell(3).value = r.prepaidCount;
    row.getCell(4).value = r.postpaidCount;
    row.getCell(5).value = r.projectedMonthlyBill;
    row.getCell(6).value = r.totalPaid;
    row.getCell(7).value = r.pendingBalance;

    [1, 2, 3, 4, 5, 6, 7].forEach(c => {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      cell.font = { name: fontFamily, size: 10 };
      if (idx % 2 === 1) cell.fill = zebraFill;
    });

    row.getCell(1).font = { name: fontFamily, size: 10, bold: true };
    [2, 3, 4].forEach(c => row.getCell(c).alignment = { horizontal: 'center' });
    [5, 6, 7].forEach(c => {
      const cell = row.getCell(c);
      cell.numFmt = currencyFmt;
      cell.alignment = { horizontal: 'right' };
    });
    if (r.pendingBalance > 0) {
      row.getCell(7).font = { name: fontFamily, size: 10, bold: true, color: { argb: 'FFDC2626' } };
    }

    row.height = 20;
    kpiRowIdx++;
  });

  // Auto-fit columns for Summary Sheet
  wsSummary.getColumn(1).width = 32;
  wsSummary.getColumn(2).width = 16;
  wsSummary.getColumn(3).width = 6;
  wsSummary.getColumn(4).width = 38;
  wsSummary.getColumn(5).width = 24;
  wsSummary.getColumn(6).width = 18;
  wsSummary.getColumn(7).width = 18;

  // Helper function to build structured customer table sheets
  function buildCustomerSheet(sheetTitle, filterFn, headerBgColor) {
    const ws = workbook.addWorksheet(sheetTitle, {
      views: [{ showGridLines: true, state: 'frozen', ySplit: 4 }]
    });

    // Sheet Banner
    ws.mergeCells('A1:R1');
    const bCell = ws.getCell('A1');
    bCell.value = `${businessName.toUpperCase()} — ${sheetTitle.toUpperCase()}`;
    bCell.font = { name: fontFamily, size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    bCell.fill = headerBgColor;
    bCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;

    ws.mergeCells('A2:R2');
    const sCell = ws.getCell('A2');
    sCell.value = `Month: ${data.targetMonth} (${data.daysInMonth} Days) | Active Customers | All amounts in INR (₹)`;
    sCell.font = { name: fontFamily, size: 9, italic: true, color: { argb: 'FF64748B' } };
    sCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 18;

    // Table Column Headers
    const headers = [
      'Sl No',
      'Flat / Unit',
      'Customer Name',
      'Phone Number',
      'Route',
      'Category',
      'Billing Type',
      'Active Subscriptions & Daily Quantity',
      'Daily Milk (L)',
      'Active Days',
      'Monthly Subscription Bill (₹)',
      'Delivered Value (₹)',
      'Advance Paid in Month (₹)',
      'Direct Paid in Month (₹)',
      'Total Paid in Month (₹)',
      'Pending Balance (₹)',
      'Advance Balance (₹)',
      'Payment Status'
    ];

    const hRow = ws.getRow(4);
    headers.forEach((h, i) => {
      const cell = hRow.getCell(i + 1);
      cell.value = h;
      cell.font = whiteBoldFont;
      cell.fill = headerBgColor;
      cell.alignment = {
        horizontal: i >= 10 && i <= 16 ? 'right' : (i < 5 ? 'center' : (i === 7 ? 'left' : 'center')),
        vertical: 'middle',
        wrapText: true
      };
      cell.border = thinBorder;
    });
    hRow.height = 30;

    const filteredRows = data.customers.filter(filterFn);
    let rowIdx = 5;

    filteredRows.forEach((c, idx) => {
      const r = ws.getRow(rowIdx);
      r.getCell(1).value = idx + 1;
      r.getCell(2).value = c.flatNo;
      r.getCell(3).value = c.name;
      r.getCell(4).value = c.phone;
      r.getCell(5).value = c.route;
      r.getCell(6).value = c.category;
      r.getCell(7).value = c.billingType;
      r.getCell(8).value = c.subscriptionsSummary;
      r.getCell(9).value = c.dailyLiters;
      r.getCell(10).value = c.activeDaysCount;
      r.getCell(11).value = c.projectedMonthlyBill;
      r.getCell(12).value = c.deliveredTotalAmount;
      r.getCell(13).value = c.advancePaidInMonth;
      r.getCell(14).value = c.directPaidInMonth;
      r.getCell(15).value = c.totalPaidInMonth;
      r.getCell(16).value = c.pendingBalance;
      r.getCell(17).value = c.advanceBalance;
      r.getCell(18).value = c.paymentStatus;

      // Styling
      for (let col = 1; col <= 18; col++) {
        const cell = r.getCell(col);
        cell.border = thinBorder;
        cell.font = { name: fontFamily, size: 9.5 };
        if (idx % 2 === 1) cell.fill = zebraFill;
      }

      // Alignments & Number Formats
      r.getCell(1).alignment = { horizontal: 'center' };
      r.getCell(2).alignment = { horizontal: 'center' };
      r.getCell(2).font = { name: fontFamily, size: 9.5, bold: true };
      r.getCell(3).font = { name: fontFamily, size: 9.5, bold: true };
      r.getCell(4).alignment = { horizontal: 'center' };
      r.getCell(5).alignment = { horizontal: 'center' };
      r.getCell(6).alignment = { horizontal: 'center' };
      r.getCell(7).alignment = { horizontal: 'center' };
      r.getCell(7).font = { name: fontFamily, size: 9, bold: true };
      r.getCell(9).alignment = { horizontal: 'center' };
      r.getCell(9).numFmt = '0.00';
      r.getCell(10).alignment = { horizontal: 'center' };
      r.getCell(10).numFmt = '#,##0';

      // Currency Formatting
      [11, 12, 13, 14, 15, 16, 17].forEach(col => {
        const cell = r.getCell(col);
        cell.numFmt = currencyFmt;
        cell.alignment = { horizontal: 'right' };
      });

      // Highlight Pending Due in Red if positive
      if (c.pendingBalance > 0) {
        r.getCell(16).font = { name: fontFamily, size: 9.5, bold: true, color: { argb: 'FFDC2626' } };
      }

      // Highlight Advance Balance in Green if positive
      if (c.advanceBalance > 0) {
        r.getCell(17).font = { name: fontFamily, size: 9.5, bold: true, color: { argb: 'FF16A34A' } };
      }

      // Payment Status Badge
      const statusCell = r.getCell(18);
      statusCell.alignment = { horizontal: 'center' };
      statusCell.font = { name: fontFamily, size: 9, bold: true };
      if (c.paymentStatus === 'PAID') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }; // Light Green
        statusCell.font = { name: fontFamily, size: 9, bold: true, color: { argb: 'FF166534' } };
      } else if (c.paymentStatus === 'PARTIALLY_PAID') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Light Amber
        statusCell.font = { name: fontFamily, size: 9, bold: true, color: { argb: 'FF92400E' } };
      } else if (c.paymentStatus === 'UNPAID') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; // Light Red
        statusCell.font = { name: fontFamily, size: 9, bold: true, color: { argb: 'FF991B1B' } };
      }

      r.height = 22;
      rowIdx++;
    });

    // Grand Totals Row
    const totRow = ws.getRow(rowIdx);
    totRow.getCell(1).value = '';
    totRow.getCell(2).value = 'TOTAL';
    totRow.getCell(3).value = `Total Customers: ${filteredRows.length}`;

    // Excel SUM formulas
    totRow.getCell(9).value = { formula: `SUM(I5:I${rowIdx - 1})` };
    totRow.getCell(11).value = { formula: `SUM(K5:K${rowIdx - 1})` };
    totRow.getCell(12).value = { formula: `SUM(L5:L${rowIdx - 1})` };
    totRow.getCell(13).value = { formula: `SUM(M5:M${rowIdx - 1})` };
    totRow.getCell(14).value = { formula: `SUM(N5:N${rowIdx - 1})` };
    totRow.getCell(15).value = { formula: `SUM(O5:O${rowIdx - 1})` };
    totRow.getCell(16).value = { formula: `SUM(P5:P${rowIdx - 1})` };
    totRow.getCell(17).value = { formula: `SUM(Q5:Q${rowIdx - 1})` };

    for (let col = 1; col <= 18; col++) {
      const cell = totRow.getCell(col);
      cell.border = totalRowBorder;
      cell.fill = totalRowFill;
      cell.font = { name: fontFamily, size: 10, bold: true };
    }

    totRow.getCell(2).alignment = { horizontal: 'center' };
    totRow.getCell(9).alignment = { horizontal: 'center' };
    totRow.getCell(9).numFmt = '0.00';
    [11, 12, 13, 14, 15, 16, 17].forEach(col => {
      const cell = totRow.getCell(col);
      cell.numFmt = currencyFmt;
      cell.alignment = { horizontal: 'right' };
    });

    totRow.height = 25;

    // Set Column Widths with generous padding
    const colWidths = [
      8,  // Sl No
      14, // Flat / Unit
      22, // Customer Name
      15, // Phone Number
      13, // Route
      14, // Category
      15, // Billing Type
      36, // Subscriptions
      13, // Daily Milk (L)
      12, // Active Days
      18, // Monthly Subscription Bill
      16, // Delivered Value
      16, // Advance Paid
      16, // Direct Paid
      18, // Total Paid
      16, // Pending Balance
      16, // Advance Balance
      16  // Status
    ];

    colWidths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });

    return ws;
  }

  // =========================================================================
  // SHEET 2: 👥 All Customers Master
  // =========================================================================
  buildCustomerSheet('👥 All Customers Master', () => true, navyHeaderFill);

  // =========================================================================
  // SHEET 3: 💎 Advance (Prepaid) Customers
  // =========================================================================
  buildCustomerSheet('💎 Advance Customers', (c) => c.billingType === 'PREPAID', tealHeaderFill);

  // =========================================================================
  // SHEET 4: 📦 Postpaid & Daily Customers
  // =========================================================================
  buildCustomerSheet('📦 Postpaid & Daily Customers', (c) => c.billingType !== 'PREPAID', amberHeaderFill);

  // =========================================================================
  // SHEET 5: 🧾 Payment Receipts Log
  // =========================================================================
  const wsPayments = workbook.addWorksheet('🧾 Payment Receipts Log', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 4 }]
  });

  wsPayments.mergeCells('A1:J1');
  const pTitle = wsPayments.getCell('A1');
  pTitle.value = `${businessName.toUpperCase()} — PAYMENT COLLECTIONS & RECEIPTS LOG`;
  pTitle.font = { name: fontFamily, size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  pTitle.fill = purpleHeaderFill;
  pTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  wsPayments.getRow(1).height = 28;

  wsPayments.mergeCells('A2:J2');
  const pSub = wsPayments.getCell('A2');
  pSub.value = `Month: ${data.targetMonth} | Itemized Payment Receipts | Total Payments: ${data.payments.length}`;
  pSub.font = { name: fontFamily, size: 9, italic: true, color: { argb: 'FF64748B' } };
  pSub.alignment = { horizontal: 'center', vertical: 'middle' };
  wsPayments.getRow(2).height = 18;

  const payHeaders = [
    'Sl No',
    'Receipt Number',
    'Payment Date',
    'Customer Name',
    'Flat / Unit',
    'Route',
    'Billing Type',
    'Payment Type',
    'Payment Method',
    'Amount (₹)'
  ];

  const payHRow = wsPayments.getRow(4);
  payHeaders.forEach((h, i) => {
    const cell = payHRow.getCell(i + 1);
    cell.value = h;
    cell.font = whiteBoldFont;
    cell.fill = purpleHeaderFill;
    cell.alignment = {
      horizontal: i === 9 ? 'right' : (i === 3 ? 'left' : 'center'),
      vertical: 'middle'
    };
    cell.border = thinBorder;
  });
  payHRow.height = 28;

  let payRowIdx = 5;
  data.payments.forEach((p, idx) => {
    const row = wsPayments.getRow(payRowIdx);
    row.getCell(1).value = idx + 1;
    row.getCell(2).value = p.receipt_number || `RCT-${p.id}`;
    row.getCell(3).value = p.payment_date;
    row.getCell(4).value = p.customer_name;
    row.getCell(5).value = p.flat_no || 'N/A';
    row.getCell(6).value = p.route || 'Route 1';
    row.getCell(7).value = p.cust_billing_type || 'PREPAID';
    row.getCell(8).value = p.payment_type;
    row.getCell(9).value = p.payment_method;
    row.getCell(10).value = parseFloat(p.amount) || 0;

    for (let c = 1; c <= 10; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
      cell.font = { name: fontFamily, size: 9.5 };
      if (idx % 2 === 1) cell.fill = zebraFill;
    }

    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(2).font = { name: fontFamily, size: 9.5, bold: true };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).font = { name: fontFamily, size: 9.5, bold: true };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(7).alignment = { horizontal: 'center' };
    row.getCell(8).alignment = { horizontal: 'center' };
    row.getCell(9).alignment = { horizontal: 'center' };
    row.getCell(10).alignment = { horizontal: 'right' };
    row.getCell(10).numFmt = currencyFmt;
    row.getCell(10).font = { name: fontFamily, size: 9.5, bold: true, color: { argb: 'FF0F766E' } };

    row.height = 20;
    payRowIdx++;
  });

  // Grand Total for Payments Log
  const payTotRow = wsPayments.getRow(payRowIdx);
  payTotRow.getCell(1).value = '';
  payTotRow.getCell(2).value = 'TOTAL';
  payTotRow.getCell(4).value = `Total Receipts: ${data.payments.length}`;
  payTotRow.getCell(10).value = { formula: `SUM(J5:J${payRowIdx - 1})` };

  for (let c = 1; c <= 10; c++) {
    const cell = payTotRow.getCell(c);
    cell.border = totalRowBorder;
    cell.fill = totalRowFill;
    cell.font = { name: fontFamily, size: 10, bold: true };
  }
  payTotRow.getCell(2).alignment = { horizontal: 'center' };
  payTotRow.getCell(10).alignment = { horizontal: 'right' };
  payTotRow.getCell(10).numFmt = currencyFmt;
  payTotRow.height = 25;

  const payColWidths = [8, 20, 14, 24, 14, 14, 16, 20, 16, 18];
  payColWidths.forEach((w, i) => {
    wsPayments.getColumn(i + 1).width = w;
  });

  return {
    workbook,
    data
  };
}

module.exports = {
  getDaysInMonth,
  compileMonthlyBillingData,
  buildMonthlyBillingWorkbook
};
