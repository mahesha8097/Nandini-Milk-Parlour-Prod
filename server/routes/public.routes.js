const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Helper to format date like "16 Jul 2026, Thursday"
function formatDeliveryDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${day} ${monthNames[d.getMonth()]} ${year}, ${dayNames[d.getDay()]}`;
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
 * Query params:
 *   - c or customer_id: Customer ID
 *   - m or month: YYYY-MM (defaults to current month)
 *   - b or bill_id: Optional specific Bill ID
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

    if (!targetMonth) {
      targetMonth = new Date().toISOString().slice(0, 7);
    }

    // If bill was not provided by ID, find the latest bill for this customer and month
    if (!bill) {
      bill = await db.prepare(`
        SELECT * FROM bills 
        WHERE customer_id = ? AND billing_month = ?
        ORDER BY id DESC LIMIT 1
      `).get(customer.id, targetMonth);
    }

    // Get Business Profile for the parlour
    const agentId = customer.agent_id || (bill && bill.agent_id) || 1;
    let profile = await db.prepare('SELECT * FROM business_profile WHERE id = ?').get(agentId);
    if (!profile) {
      profile = await db.prepare('SELECT * FROM business_profile WHERE id = 1').get();
    }

    // Date range for the month
    const [yearStr, monthStr] = targetMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const startDate = `${targetMonth}-01`;
    const endDate = `${targetMonth}-${String(daysInMonth).padStart(2, '0')}`;

    // Fetch recorded deliveries for this customer within the month
    const deliveryRows = await db.prepare(`
      SELECT d.*, p.name as current_product_name, p.variant_label as current_variant_label
      FROM deliveries d
      LEFT JOIN products p ON d.product_id = p.id
      WHERE d.customer_id = ?
        AND d.delivery_date >= ?
        AND d.delivery_date <= ?
      ORDER BY d.delivery_date DESC, d.id ASC
    `).all(customer.id, startDate, endDate);

    // Group actual deliveries by date
    const deliveriesByDate = {};
    for (const row of deliveryRows) {
      if (!deliveriesByDate[row.delivery_date]) {
        deliveriesByDate[row.delivery_date] = [];
      }
      deliveriesByDate[row.delivery_date].push({
        id: row.id,
        productId: row.product_id,
        productName: row.product_name_snapshot || row.current_product_name || 'Milk / Dairy Product',
        variantLabel: row.variant_snapshot || row.current_variant_label || 'Pkt',
        volumeLitres: row.unit_volume_litres_snapshot || 0,
        quantity: row.quantity || 0,
        unitPrice: row.unit_price_snapshot || 0,
        productAmount: row.total_product_amount || 0,
        deliveryCharge: row.delivery_charge_snapshot || 0,
        totalAmount: row.total_amount || 0,
        status: row.status || 'DELIVERED',
        notes: row.notes || ''
      });
    }

    // Fetch active subscriptions to project scheduled/advance days if deliveries haven't been logged yet
    const subscriptions = await db.prepare(`
      SELECT s.*, p.name as product_name, p.variant_label, p.unit_volume_litres, p.selling_price, p.fixed_delivery_charge
      FROM subscriptions s
      JOIN products p ON s.product_id = p.id
      WHERE s.customer_id = ? AND s.is_active = 1
        AND s.start_date <= ?
        AND (s.end_date IS NULL OR s.end_date = '' OR s.end_date >= ?)
    `).all(customer.id, endDate, startDate);

    // Fetch custom requirements / vacations if any
    const customReqs = await db.prepare(`
      SELECT * FROM daily_delivery_requirements
      WHERE customer_id = ? AND delivery_date >= ? AND delivery_date <= ?
    `).all(customer.id, startDate, endDate);
    const reqsByDate = {};
    for (const req of customReqs) {
      reqsByDate[req.delivery_date] = req;
    }

    // Build complete date list in descending order (matching user's screenshot e.g. 16 Jul, 15 Jul, 14 Jul...)
    const todayStr = new Date().toISOString().slice(0, 10);
    const daysList = [];

    // If actual deliveries exist, we include all dates up to today or last recorded date
    // Also include projected days if this is an advance subscription bill
    for (let d = daysInMonth; d >= 1; d--) {
      const dateStr = `${targetMonth}-${String(d).padStart(2, '0')}`;
      const actualItems = deliveriesByDate[dateStr];

      if (actualItems && actualItems.length > 0) {
        const totalItemsCount = actualItems.reduce((acc, it) => acc + (it.status === 'DELIVERED' ? it.quantity : 0), 0);
        const totalAmount = actualItems.reduce((acc, it) => acc + (it.status === 'DELIVERED' ? it.totalAmount : 0), 0);
        const allSkipped = actualItems.every(it => it.status === 'SKIPPED');
        const anyDelivered = actualItems.some(it => it.status === 'DELIVERED');

        daysList.push({
          date: dateStr,
          formattedDate: formatDeliveryDate(dateStr),
          dayNumber: d,
          status: anyDelivered ? 'DELIVERED' : (allSkipped ? 'SKIPPED' : 'PENDING'),
          totalItems: totalItemsCount,
          totalAmount: totalAmount,
          isProjected: false,
          items: actualItems
        });
      } else if (subscriptions.length > 0) {
        // Project day based on recurring subscription
        const isPastOrToday = dateStr <= todayStr;
        const customReq = reqsByDate[dateStr];
        const isCustomSkip = customReq && customReq.quantity === 0;

        const projItems = subscriptions.map(sub => {
          const qty = isCustomSkip ? 0 : (customReq ? customReq.quantity : sub.quantity);
          const price = sub.selling_price || 0;
          const charge = sub.fixed_delivery_charge || 0;
          const lineTotal = (qty * price) + (qty > 0 ? charge : 0);
          return {
            id: `sub-${sub.id}-${dateStr}`,
            productId: sub.product_id,
            productName: sub.product_name,
            variantLabel: sub.variant_label,
            volumeLitres: sub.unit_volume_litres || 0,
            quantity: qty,
            unitPrice: price,
            productAmount: qty * price,
            deliveryCharge: qty > 0 ? charge : 0,
            totalAmount: lineTotal,
            status: isCustomSkip ? 'SKIPPED' : (isPastOrToday ? 'DELIVERED' : 'SCHEDULED'),
            notes: isCustomSkip ? 'Paused / Vacation' : ''
          };
        });

        const totalItemsCount = projItems.reduce((acc, it) => acc + (it.status !== 'SKIPPED' ? it.quantity : 0), 0);
        const totalAmount = projItems.reduce((acc, it) => acc + (it.status !== 'SKIPPED' ? it.totalAmount : 0), 0);

        daysList.push({
          date: dateStr,
          formattedDate: formatDeliveryDate(dateStr),
          dayNumber: d,
          status: isCustomSkip ? 'SKIPPED' : (isPastOrToday ? 'DELIVERED' : 'SCHEDULED'),
          totalItems: totalItemsCount,
          totalAmount: totalAmount,
          isProjected: true,
          items: projItems
        });
      }
    }

    // Monthly Delivery Summary Stats
    const totalDeliveredDays = daysList.filter(d => d.status === 'DELIVERED' && d.totalItems > 0).length;
    const totalItemsCount = daysList.reduce((acc, d) => acc + (d.status === 'DELIVERED' ? d.totalItems : 0), 0);
    const totalDeliveryAmount = daysList.reduce((acc, d) => acc + (d.status === 'DELIVERED' ? d.totalAmount : 0), 0);

    // Parsed bill items if available
    let billItems = [];
    if (bill && bill.items_json) {
      try {
        billItems = typeof bill.items_json === 'string' ? JSON.parse(bill.items_json) : bill.items_json;
      } catch (e) {
        billItems = [];
      }
    }

    res.json({
      success: true,
      month: targetMonth,
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
        items: billItems
      } : null,
      summary: {
        totalDeliveredDays,
        totalItemsCount,
        totalDeliveryAmount,
        daysInMonth
      },
      days: daysList
    });
  } catch (err) {
    console.error('Public statement endpoint error:', err);
    res.status(500).json({ error: 'Failed to generate delivery statement: ' + err.message });
  }
});

module.exports = router;
