const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { calculateDeliveryChargesForCustomerDay } = require('../services/deliveryChargeService');
const { parseCustomDays } = require('../services/billingService');

// Helper to format date like "16 Jul 2026, Thursday"
function formatDeliveryDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${day} ${monthNames[d.getMonth()]} ${year}, ${dayNames[d.getDay()]}`;
}

// Helper to format delivery timestamp into readable 12-hour AM/PM time
function formatDeliveryTime(timestampStr) {
  if (!timestampStr) return null;
  try {
    let hours, minutes;
    if (timestampStr.includes('T')) {
      const d = new Date(timestampStr);
      if (isNaN(d.getTime())) return null;
      hours = d.getHours();
      minutes = d.getMinutes();
    } else if (timestampStr.includes(' ')) {
      const parts = timestampStr.split(' ');
      const timeParts = parts[1].split(':');
      hours = parseInt(timeParts[0], 10);
      minutes = parseInt(timeParts[1], 10);
    } else {
      return null;
    }
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const formattedMinutes = String(minutes).padStart(2, '0');
    return `${formattedHours}:${formattedMinutes} ${ampm}`;
  } catch (e) {
    return null;
  }
}

// Helper to mask phone for public sharing privacy (shows first 2 and last 4 digits)
function maskPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length >= 10) {
    return `${digits.slice(0, 2)}****${digits.slice(-4)}`;
  }
  return phone;
}

/**
 * GET /api/public/statement
 * Public endpoint for customers to view and download their monthly delivery statement & invoice.
 * - PREPAID Customers: Bill and statement generated according to SCHEDULED DAYS (Advance monthly subscription).
 * - POSTPAID Customers: Bill and statement generated according to ACTUAL MILK DELIVERED with exact delivery times.
 */
router.get('/statement', async (req, res) => {
  try {
    const customerId = req.query.c || req.query.customer_id;
    const billId = req.query.b || req.query.bill_id;
    let targetMonth = req.query.m || req.query.month;

    let customer = null;
    let bill = null;

    if (billId) {
      bill = await db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
      if (bill) {
        if (!customerId) {
          customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(bill.customer_id);
        }
        if (!targetMonth) {
          targetMonth = bill.billing_month;
        }
      }
    }

    if (!customer && customerId) {
      customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    }

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found or invalid link' });
    }

    if (!targetMonth && !billId) {
      targetMonth = new Date().toISOString().slice(0, 7);
    }

    // If bill was not provided by ID, find the appropriate bill for this customer:
    if (!bill) {
      // 1. Try exact match on billing_month (for monthly bills or exact range)
      if (targetMonth) {
        bill = await db.prepare(`
          SELECT * FROM bills 
          WHERE customer_id = ? AND billing_month = ?
          ORDER BY id DESC LIMIT 1
        `).get(customer.id, targetMonth);
      }

      // 2. If targetMonth is YYYY-MM, check for bills overlapping this month
      if (!bill && targetMonth && typeof targetMonth === 'string' && targetMonth.length === 7) {
        const [ymYear, ymMonth] = targetMonth.split('-').map(Number);
        const ymDays = new Date(ymYear, ymMonth, 0).getDate();
        const mStart = `${targetMonth}-01`;
        const mEnd = `${targetMonth}-${String(ymDays).padStart(2, '0')}`;
        bill = await db.prepare(`
          SELECT * FROM bills
          WHERE customer_id = ?
            AND (
              billing_month = ?
              OR (start_date <= ? AND end_date >= ?)
            )
          ORDER BY CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END, id DESC LIMIT 1
        `).get(customer.id, targetMonth, mEnd, mStart);
      }

      // 3. If customer has pending balance or is on WEEKLY billing, resolve latest pending bill
      if (!bill && (customer.billing_type === 'WEEKLY' || Number(customer.pending_balance || 0) > 0)) {
        bill = await db.prepare(`
          SELECT * FROM bills
          WHERE customer_id = ? AND status = 'PENDING'
          ORDER BY id DESC LIMIT 1
        `).get(customer.id);
      }

      // 4. Fallback to latest bill for customer
      if (!bill) {
        bill = await db.prepare(`
          SELECT * FROM bills
          WHERE customer_id = ?
          ORDER BY id DESC LIMIT 1
        `).get(customer.id);
      }
    }

    const isPrepaid = customer.billing_type === 'PREPAID';
    const isPostpaid = customer.billing_type === 'POSTPAID' || customer.customer_category === 'BULK_HOTEL';
    const hasScheduledBill = Boolean(
      bill && (
        bill.billing_type === 'PREPAID' ||
        (bill.notes && bill.notes.includes('Advance Bill')) ||
        (bill.items_json && (bill.items_json.includes('selected_days') || bill.items_json.includes('selectedDays')))
      )
    );
    const isAdvanceCalendar = isPrepaid || hasScheduledBill;

    // Get Business Profile for the parlour
    const agentId = customer.agent_id || (bill && bill.agent_id) || 1;
    let profile = await db.prepare('SELECT * FROM business_profile WHERE id = ?').get(agentId);
    if (!profile) {
      profile = await db.prepare('SELECT * FROM business_profile WHERE id = 1').get();
    }

    // Determine start date, end date, display month, and period label
    let startDate = '';
    let endDate = '';
    let daysInPeriod = 30;
    let periodLabel = '';
    let displayMonth = '';

    if (bill && bill.start_date && bill.end_date) {
      startDate = bill.start_date;
      endDate = bill.end_date;
      periodLabel = bill.billing_month || `${startDate} to ${endDate}`;
      displayMonth = (bill.end_date || bill.start_date || '').slice(0, 7);
      const d1 = new Date(startDate);
      const d2 = new Date(endDate);
      daysInPeriod = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
    } else if (typeof targetMonth === 'string' && targetMonth.includes(' to ')) {
      const parts = targetMonth.split(' to ');
      startDate = parts[0].trim();
      endDate = parts[1].trim();
      periodLabel = targetMonth;
      displayMonth = (endDate || startDate || '').slice(0, 7);
      const d1 = new Date(startDate);
      const d2 = new Date(endDate);
      daysInPeriod = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
    } else {
      const ym = (typeof targetMonth === 'string' && targetMonth.length >= 7)
        ? targetMonth.slice(0, 7)
        : new Date().toISOString().slice(0, 7);
      const [yearStr, monthStr] = ym.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      daysInPeriod = new Date(year, month, 0).getDate();
      startDate = `${ym}-01`;
      endDate = `${ym}-${String(daysInPeriod).padStart(2, '0')}`;
      periodLabel = ym;
      displayMonth = ym;
    }
    const daysInMonth = daysInPeriod;
    const todayStr = new Date().toISOString().slice(0, 10);

    // Fetch recorded deliveries for this customer within the period
    const deliveryRows = await db.prepare(`
      SELECT d.*, p.name as current_product_name, p.category as current_category,
             p.variant_label as current_variant_label, p.delivery_charge_type as current_charge_type,
             p.fixed_delivery_charge as current_fixed_charge
      FROM deliveries d
      LEFT JOIN products p ON d.product_id = p.id
      WHERE d.customer_id = ?
        AND d.delivery_date >= ?
        AND d.delivery_date <= ?
      ORDER BY d.delivery_date DESC, d.id ASC
    `).all(customer.id, startDate, endDate);

    // Group actual deliveries by date
    const deliveriesByDate = {};
    const isHouse = customer.customer_category === 'HOUSE';

    for (const row of deliveryRows) {
      if (!deliveriesByDate[row.delivery_date]) {
        deliveriesByDate[row.delivery_date] = [];
      }

      let delCharge = row.delivery_charge_snapshot !== null && row.delivery_charge_snapshot !== undefined
        ? Number(row.delivery_charge_snapshot)
        : 0;
      let prodAmt = row.total_product_amount !== undefined && row.total_product_amount !== null
        ? Number(row.total_product_amount)
        : (Number(row.unit_price_snapshot || 0) * Number(row.quantity || 0));
      let totAmt = row.total_amount !== undefined && row.total_amount !== null
        ? Number(row.total_amount)
        : (prodAmt + delCharge);

      // Safety fallback: if delivery charge snapshot was 0 on a non-skipped HOUSE milk item, compute it accurately
      if (isHouse && row.quantity > 0 && delCharge === 0 && row.status !== 'SKIPPED') {
        const isMilk = Boolean(
          (row.category_snapshot && row.category_snapshot.toLowerCase() === 'milk') ||
          (row.current_category && row.current_category.toLowerCase() === 'milk') ||
          (row.product_name_snapshot && row.product_name_snapshot.toLowerCase().includes('milk'))
        );
        if (isMilk) {
          const vol = row.unit_volume_litres_snapshot || (row.variant_snapshot && row.variant_snapshot.includes('500') ? 0.5 : 1.0);
          const totalLitres = vol * row.quantity;
          delCharge = totalLitres <= 0.5 ? 2.0 : parseFloat((totalLitres * 3.0).toFixed(2));
          totAmt = parseFloat((prodAmt + delCharge).toFixed(2));
        }
      }

      deliveriesByDate[row.delivery_date].push({
        id: row.id,
        productId: row.product_id,
        productName: row.product_name_snapshot || row.current_product_name || 'Milk / Dairy Product',
        category: row.category_snapshot || row.current_category || 'Milk',
        variantLabel: row.variant_snapshot || row.current_variant_label || 'Pkt',
        volumeLitres: row.unit_volume_litres_snapshot || 0,
        quantity: row.quantity || 0,
        unitPrice: row.unit_price_snapshot || 0,
        productAmount: prodAmt,
        deliveryCharge: delCharge,
        totalAmount: totAmt,
        status: row.status || 'DELIVERED',
        notes: row.notes || '',
        updatedAt: row.updated_at || row.created_at || null,
        deliveredTime: formatDeliveryTime(row.updated_at || row.created_at)
      });
    }

    // Fetch active subscriptions that overlap with this billing month
    const subscriptions = await db.prepare(`
      SELECT s.*, p.name as product_name, p.category, p.variant_label, p.unit_volume_litres, p.selling_price, p.fixed_delivery_charge, p.delivery_charge_type
      FROM subscriptions s
      JOIN products p ON s.product_id = p.id
      WHERE s.customer_id = ? AND s.is_active = 1
        AND s.start_date <= ?
        AND (s.end_date IS NULL OR s.end_date = '' OR s.end_date >= ?)
    `).all(customer.id, endDate, startDate);

    // Fetch custom requirements / vacations if any
    const customReqs = await db.prepare(`
      SELECT * FROM daily_delivery_requirements
      WHERE customer_id = ? AND delivery_date >= ? AND delivery_date <= ? AND status = 'ACTIVE'
    `).all(customer.id, startDate, endDate);
    const reqsByDate = {};
    for (const req of customReqs) {
      if (!reqsByDate[req.delivery_date]) {
        reqsByDate[req.delivery_date] = [];
      }
      reqsByDate[req.delivery_date].push(req);
    }

    // Fetch active customer vacations
    const activeVacations = await db.prepare(`
      SELECT * FROM customer_vacations
      WHERE customer_id = ? AND status = 'ACTIVE'
        AND start_date <= ? AND end_date >= ?
    `).all(customer.id, endDate, startDate);

    // Also check if the bill saved custom selected_days or off_days
    let billSelectedDays = null;
    let billOffDays = null;
    if (bill && bill.items_json) {
      try {
        const parsed = typeof bill.items_json === 'string' ? JSON.parse(bill.items_json) : bill.items_json;
        if (parsed) {
          if (parsed.selected_days && Array.isArray(parsed.selected_days)) {
            billSelectedDays = new Set(parsed.selected_days.map(Number));
          }
          if (parsed.off_days && Array.isArray(parsed.off_days)) {
            billOffDays = new Set(parsed.off_days.map(Number));
          }
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (parsed[0].selected_days && Array.isArray(parsed[0].selected_days)) {
              billSelectedDays = new Set(parsed[0].selected_days.map(Number));
            }
            if (parsed[0].off_days && Array.isArray(parsed[0].off_days)) {
              billOffDays = new Set(parsed[0].off_days.map(Number));
            }
            if (parsed[0].selectedDays) {
              const allD = new Set();
              parsed.forEach(it => (it.selectedDays || []).forEach(d => allD.add(Number(d))));
              if (allD.size > 0 && !billSelectedDays) billSelectedDays = allD;
            }
          }
        }
      } catch (e) {}
    }

    const daysList = [];

    // =========================================================================
    // CASE A: ADVANCE / SCHEDULED CALENDAR CUSTOMER (Prepaid or custom schedule)
    // Bill & Statement strictly based on SCHEDULED DAYS in active subscription
    // =========================================================================
    if (isAdvanceCalendar) {
      let projectedGross = 0;
      let projectedProductSubtotal = 0;
      let projectedDeliveryCharges = 0;
      let scheduledItemsCount = 0;

      const targetYm = (bill?.billing_month && !bill.billing_month.includes(' to ')) ? bill.billing_month : (displayMonth || targetMonth.slice(0, 7));

      // Loop days of month descending
      for (let d = daysInMonth; d >= 1; d--) {
        const dateStr = `${targetYm}-${String(d).padStart(2, '0')}`;
        const dow = new Date(`${dateStr}T12:00:00Z`).getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
        
        // Check if customer had active subscriptions on this date
        const activeSubsOnDay = subscriptions.filter(s => {
          if (s.start_date > dateStr) return false;
          if (s.end_date && s.end_date.trim() !== '' && s.end_date < dateStr) return false;

          // Check custom days and frequency
          const customDows = (s.frequency === 'CUSTOM' || s.custom_days) ? parseCustomDays(s.custom_days) : null;
          if (customDows && customDows.length > 0) {
            return customDows.includes(dow);
          }
          if (s.frequency === 'ALTERNATE_DAYS' || s.frequency === 'ALTERNATE') {
            const startDayNum = parseInt(s.start_date.split('-')[2], 10) || 1;
            return (d - startDayNum) % 2 === 0;
          }
          if (s.frequency === 'WEEKDAYS') {
            return dow >= 1 && dow <= 5;
          }
          if (s.frequency === 'WEEKENDS') {
            return dow === 0 || dow === 6;
          }
          return true;
        });

        // Check if customer was subscribed at all in this month up to dateStr
        const anySubInMonth = subscriptions.some(s => s.start_date <= dateStr && (!s.end_date || s.end_date === '' || s.end_date >= dateStr));
        if (!anySubInMonth && (!deliveriesByDate[dateStr] || deliveriesByDate[dateStr].length === 0)) {
          continue;
        }

        const actualItems = deliveriesByDate[dateStr];
        const dayReqs = reqsByDate[dateStr] || [];

        // Check if this calendar day is an OFF / Paused day:
        const isVacationDay = activeVacations.some(v => v.start_date <= dateStr && v.end_date >= dateStr);
        const isBillOffDay = (billOffDays && billOffDays.has(d)) || (billSelectedDays && !billSelectedDays.has(d));
        const isReqSkip = dayReqs.some(r => r.requirement_type === 'SKIP_DELIVERY' || Number(r.required_quantity) === 0 || Number(r.effective_quantity) === 0);
        const isFrequencyOff = (activeSubsOnDay.length === 0 && anySubInMonth);

        const isCustomSkip = isBillOffDay || isVacationDay || isReqSkip || isFrequencyOff;

        if (actualItems && actualItems.length > 0) {
          const anyDelivered = actualItems.some(it => it.status === 'DELIVERED');
          const allSkipped = isCustomSkip || actualItems.every(it => it.status === 'SKIPPED');
          const timeStr = actualItems[0].deliveredTime;

          const totalItemsCount = isCustomSkip ? 0 : actualItems.reduce((acc, it) => {
            if (it.status === 'SKIPPED') return acc;
            return acc + (it.quantity || 0);
          }, 0);

          const totalDayProductAmt = isCustomSkip ? 0 : actualItems.reduce((acc, it) => {
            if (it.status === 'SKIPPED') return acc;
            return acc + (it.productAmount || 0);
          }, 0);

          const totalDayDelCharge = isCustomSkip ? 0 : actualItems.reduce((acc, it) => {
            if (it.status === 'SKIPPED') return acc;
            return acc + (it.deliveryCharge || 0);
          }, 0);

          const totalAmount = isCustomSkip ? 0 : actualItems.reduce((acc, it) => {
            if (it.status === 'SKIPPED') return acc;
            return acc + (it.totalAmount || 0);
          }, 0);

          projectedProductSubtotal += totalDayProductAmt;
          projectedDeliveryCharges += totalDayDelCharge;

          daysList.push({
            date: dateStr,
            formattedDate: formatDeliveryDate(dateStr),
            dayNumber: d,
            status: anyDelivered ? 'DELIVERED' : (allSkipped ? 'SKIPPED' : 'PENDING'),
            deliveredTime: anyDelivered ? timeStr : null,
            totalItems: totalItemsCount,
            totalAmount: totalAmount,
            deliveryCharge: totalDayDelCharge,
            isProjected: false,
            items: isCustomSkip
              ? actualItems.map(it => ({ ...it, status: 'SKIPPED', quantity: 0, totalAmount: 0, deliveryCharge: 0, notes: 'No Milk Required' }))
              : actualItems
          });
        } else {
          // Scheduled projected day under prepaid plan
          const isUpcoming = dateStr > todayStr;
          
          const subSource = (activeSubsOnDay && activeSubsOnDay.length > 0)
            ? activeSubsOnDay
            : subscriptions.filter(s => s.start_date <= dateStr && (!s.end_date || s.end_date === '' || s.end_date >= dateStr));

          const rawItems = subSource.map(sub => {
            const specificReq = dayReqs.find(r => r.product_id === sub.product_id);
            let itemQty = sub.quantity;
            if (isCustomSkip) {
              itemQty = 0;
            } else if (specificReq) {
              if (specificReq.requirement_type === 'SKIP_DELIVERY' || Number(specificReq.required_quantity) === 0 || Number(specificReq.effective_quantity) === 0) {
                itemQty = 0;
              } else if (specificReq.requirement_type === 'CHANGE_QUANTITY') {
                itemQty = specificReq.required_quantity || sub.quantity;
              } else if (specificReq.requirement_type === 'ADD_EXTRA_QUANTITY') {
                itemQty = sub.quantity + (specificReq.additional_quantity || 0);
              }
            }

            return {
              id: `sub-${sub.id}-${dateStr}`,
              subscriptionId: sub.id,
              productId: sub.product_id,
              productName: sub.product_name,
              category: sub.category || 'Milk',
              variantLabel: sub.variant_label,
              unitVolumeLitres: sub.unit_volume_litres || 0.5,
              quantity: itemQty,
              unitPrice: sub.selling_price || 0,
              sellingPrice: sub.selling_price || 0,
              deliveryChargeType: sub.delivery_charge_type || 'MILK_RULE',
              fixedDeliveryCharge: sub.fixed_delivery_charge !== undefined ? sub.fixed_delivery_charge : 0
            };
          });

          // Calculate delivery charges using the standard delivery charge service rules
          const calculatedItems = isCustomSkip
            ? rawItems.map(it => ({ ...it, deliveryCharge: 0 }))
            : calculateDeliveryChargesForCustomerDay(
                customer.customer_category,
                rawItems,
                customer.billing_type
              );

          const projItems = calculatedItems.map(item => {
            const productAmount = parseFloat((item.unitPrice * item.quantity).toFixed(2));
            const deliveryCharge = item.quantity > 0 ? (item.deliveryCharge || 0) : 0;
            const lineTotal = parseFloat((productAmount + deliveryCharge).toFixed(2));

            return {
              id: item.id,
              productId: item.productId,
              productName: item.productName,
              variantLabel: item.variantLabel,
              volumeLitres: item.unitVolumeLitres,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              productAmount,
              deliveryCharge,
              totalAmount: lineTotal,
              status: (isCustomSkip || item.quantity === 0) ? 'SKIPPED' : (isUpcoming ? 'SCHEDULED' : 'PENDING'),
              notes: (isCustomSkip || item.quantity === 0) ? 'No Milk Required / Paused' : (isUpcoming ? 'Scheduled Daily Delivery' : ''),
              deliveredTime: null
            };
          });

          const totalItemsCount = projItems.reduce((acc, it) => acc + (it.status !== 'SKIPPED' ? it.quantity : 0), 0);
          const totalAmount = projItems.reduce((acc, it) => acc + (it.status !== 'SKIPPED' ? it.totalAmount : 0), 0);
          const totalDayDelCharge = projItems.reduce((acc, it) => acc + (it.status !== 'SKIPPED' ? it.deliveryCharge : 0), 0);
          const totalDayProductAmt = projItems.reduce((acc, it) => acc + (it.status !== 'SKIPPED' ? it.productAmount : 0), 0);

          projectedProductSubtotal += totalDayProductAmt;
          projectedDeliveryCharges += totalDayDelCharge;

          daysList.push({
            date: dateStr,
            formattedDate: formatDeliveryDate(dateStr),
            dayNumber: d,
            status: isCustomSkip ? 'SKIPPED' : (isUpcoming ? 'SCHEDULED' : 'PENDING'),
            deliveredTime: null,
            totalItems: totalItemsCount,
            totalAmount: totalAmount,
            deliveryCharge: totalDayDelCharge,
            isProjected: true,
            items: projItems
          });
        }
      }

      // Calculate scheduled items & monthly projection strictly for active days
      for (const d of daysList) {
        if (d.status !== 'SKIPPED') {
          scheduledItemsCount += d.totalItems;
          projectedGross += d.totalAmount;
        }
      }

      const scheduledDaysCount = daysList.filter(d => d.status !== 'SKIPPED' && d.totalItems > 0).length;
      const totalDeliveredDays = daysList.filter(d => d.status === 'DELIVERED' && d.totalItems > 0).length;
      const totalDeliveredItems = daysList.filter(d => d.status === 'DELIVERED').reduce((acc, d) => acc + d.totalItems, 0);

      // Resolve Month Bill Gross: use actual bill if prepaid, else projected advance gross
      const finalGross = (bill && bill.billing_type === 'PREPAID') ? bill.gross_amount : parseFloat(projectedGross.toFixed(2));
      const currentAdvance = customer.advance_balance || 0;
      const finalAdvanceAdjusted = (bill && bill.billing_type === 'PREPAID') ? bill.advance_adjusted : Math.min(currentAdvance, finalGross);
      const finalNetPayable = (bill && bill.billing_type === 'PREPAID') ? bill.net_payable : Math.max(0, parseFloat((finalGross - finalAdvanceAdjusted).toFixed(2)));

      res.json({
        success: true,
        month: displayMonth,
        periodLabel: periodLabel || displayMonth,
        isWeekly: Boolean(bill?.billing_type === 'WEEKLY' || customer.billing_type === 'WEEKLY'),
        billingType: 'PREPAID',
        customer: {
          id: customer.id,
          name: customer.name,
          flatNo: customer.flat_no || '',
          address: customer.address || '',
          route: customer.route || '',
          phone: maskPhone(customer.phone),
          category: customer.customer_category,
          billingType: customer.billing_type,
          advanceBalance: customer.advance_balance || 0,
          pendingBalance: customer.pending_balance || 0
        },
        parlour: {
          businessName: (profile && (profile.invoice_business_name || profile.business_name)) || 'Nandini Milk Parlour',
          phone: (profile && (profile.phone || profile.upi_phone)) || '7022754524',
          address: (profile && profile.address) || 'Bangalore, Karnataka',
          upiId: (profile && profile.upi_id) || '',
          upiPhone: (profile && profile.upi_phone) || '7022754524',
          invoiceFooter: (profile && profile.invoice_footer) || 'Thank you for choosing Nandini Milk! Pure & Fresh.'
        },
        bill: bill ? {
          id: bill.id,
          billNumber: bill.bill_number,
          billingMonth: bill.billing_month,
          billingType: bill.billing_type,
          billDate: bill.bill_date,
          dueDate: bill.due_date,
          grossAmount: bill.gross_amount,
          advanceAdjusted: bill.advance_adjusted,
          previousDue: bill.previous_due,
          netPayable: bill.net_payable,
          paidAmount: bill.paid_amount,
          status: bill.status,
          items: bill.items_json ? (typeof bill.items_json === 'string' ? JSON.parse(bill.items_json) : bill.items_json) : []
        } : null,
        summary: {
          billingType: 'PREPAID',
          totalScheduledDays: (bill && bill.total_deliveries_count) ? bill.total_deliveries_count : scheduledDaysCount,
          totalScheduledItems: scheduledItemsCount,
          totalDeliveredDays,
          totalDeliveredItems,
          totalItemsCount: scheduledItemsCount,
          productSubtotal: (bill && bill.billing_type === 'PREPAID') ? bill.product_subtotal : parseFloat(projectedProductSubtotal.toFixed(2)),
          deliveryChargesTotal: (bill && bill.billing_type === 'PREPAID') ? bill.delivery_charges_total : parseFloat(projectedDeliveryCharges.toFixed(2)),
          monthBillGross: finalGross,
          advanceAdjusted: finalAdvanceAdjusted,
          netPayable: finalNetPayable,
          daysInMonth
        },
        days: daysList
      });

    // =========================================================================
    // CASE B: POSTPAID CUSTOMER (or Bulk/Hotel)
    // Bill & Statement strictly based on ACTUAL DELIVERIES with time to time details
    // =========================================================================
    } else {
      // Collect dates with actual delivery rows in descending order
      const sortedDeliveryDates = Object.keys(deliveriesByDate).sort().reverse();

      let totalDeliveredDays = 0;
      let totalDeliveredItems = 0;
      let totalDeliveredAmount = 0;
      let totalDeliveredProductSubtotal = 0;
      let totalDeliveredCharges = 0;

      for (const dateStr of sortedDeliveryDates) {
        const items = deliveriesByDate[dateStr];
        const anyDelivered = items.some(it => it.status === 'DELIVERED');
        const allSkipped = items.every(it => it.status === 'SKIPPED');
        const deliveredItemsQty = items.reduce((acc, it) => acc + (it.status === 'DELIVERED' ? it.quantity : 0), 0);
        const deliveredAmount = items.reduce((acc, it) => acc + (it.status === 'DELIVERED' ? it.totalAmount : 0), 0);
        const deliveredProductAmt = items.reduce((acc, it) => acc + (it.status === 'DELIVERED' ? it.productAmount : 0), 0);
        const deliveredDelCharge = items.reduce((acc, it) => acc + (it.status === 'DELIVERED' ? it.deliveryCharge : 0), 0);
        const timeStr = items[0] ? items[0].deliveredTime : null;

        if (anyDelivered) {
          totalDeliveredDays++;
          totalDeliveredItems += deliveredItemsQty;
          totalDeliveredAmount += deliveredAmount;
          totalDeliveredProductSubtotal += deliveredProductAmt;
          totalDeliveredCharges += deliveredDelCharge;
        }

        daysList.push({
          date: dateStr,
          formattedDate: formatDeliveryDate(dateStr),
          status: anyDelivered ? 'DELIVERED' : (allSkipped ? 'SKIPPED' : 'PENDING'),
          deliveredTime: anyDelivered ? timeStr : null,
          totalItems: deliveredItemsQty,
          totalAmount: deliveredAmount,
          deliveryCharge: deliveredDelCharge,
          isProjected: false,
          items
        });
      }

      totalDeliveredAmount = parseFloat(totalDeliveredAmount.toFixed(2));
      const finalGross = bill ? Number(bill.gross_amount) : totalDeliveredAmount;
      const finalAdvanceAdjusted = bill ? Number(bill.advance_adjusted) : Math.min(Number(customer.advance_balance || 0), finalGross);
      const finalNetPayable = bill ? Number(bill.net_payable) : Math.max(0, parseFloat((finalGross - finalAdvanceAdjusted).toFixed(2)));

      res.json({
        success: true,
        month: displayMonth,
        periodLabel: periodLabel || displayMonth,
        isWeekly: Boolean(bill?.billing_type === 'WEEKLY' || customer.billing_type === 'WEEKLY'),
        billingType: 'POSTPAID',
        customer: {
          id: customer.id,
          name: customer.name,
          flatNo: customer.flat_no || '',
          address: customer.address || '',
          route: customer.route || '',
          phone: maskPhone(customer.phone),
          category: customer.customer_category,
          billingType: customer.billing_type,
          advanceBalance: customer.advance_balance || 0,
          pendingBalance: customer.pending_balance || 0
        },
        parlour: {
          businessName: (profile && (profile.invoice_business_name || profile.business_name)) || 'Nandini Milk Parlour',
          phone: (profile && (profile.phone || profile.upi_phone)) || '7022754524',
          address: (profile && profile.address) || 'Bangalore, Karnataka',
          upiId: (profile && profile.upi_id) || '',
          upiPhone: (profile && profile.upi_phone) || '7022754524',
          invoiceFooter: (profile && profile.invoice_footer) || 'Thank you for choosing Nandini Milk! Pure & Fresh.'
        },
        bill: bill ? {
          id: bill.id,
          billNumber: bill.bill_number,
          billingMonth: bill.billing_month,
          billingType: bill.billing_type,
          billDate: bill.bill_date,
          dueDate: bill.due_date,
          grossAmount: Number(bill.gross_amount || 0),
          advanceAdjusted: Number(bill.advance_adjusted || 0),
          previousDue: Number(bill.previous_due || 0),
          netPayable: Number(bill.net_payable || 0),
          paidAmount: Number(bill.paid_amount || 0),
          status: bill.status,
          items: bill.items_json ? (typeof bill.items_json === 'string' ? JSON.parse(bill.items_json) : bill.items_json) : []
        } : null,
        summary: {
          billingType: 'POSTPAID',
          totalDeliveredDays,
          totalDeliveredItems,
          totalItemsCount: totalDeliveredItems,
          productSubtotal: bill ? Number(bill.product_subtotal || 0) : parseFloat(totalDeliveredProductSubtotal.toFixed(2)),
          deliveryChargesTotal: bill ? Number(bill.delivery_charges_total || 0) : parseFloat(totalDeliveredCharges.toFixed(2)),
          monthBillGross: finalGross,
          advanceAdjusted: finalAdvanceAdjusted,
          netPayable: finalNetPayable,
          daysInMonth: daysInPeriod,
          periodLabel: periodLabel || displayMonth
        },
        days: daysList
      });
    }
  } catch (err) {
    console.error('Public statement endpoint error:', err);
    res.status(500).json({ error: 'Failed to generate delivery statement: ' + err.message });
  }
});

module.exports = router;
