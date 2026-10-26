const db = require('../config/db');
const { getLocalDateString } = require('../utils/dateUtils');

/**
 * Helper to parse product volume into Litres or Kilograms.
 * Handles variant labels like '500 ml', '1 L', '500 g', '1 kg', etc.
 */
function parseUnitVolume(volumeLitresSnapshot, variantLabel = '', productName = '') {
  const numVol = Number(volumeLitresSnapshot);
  if (!isNaN(numVol) && numVol > 0) {
    return numVol;
  }

  const combined = `${variantLabel} ${productName}`.toLowerCase();

  // Check grams (e.g. 500 g, 500gm, 200g)
  const gMatch = combined.match(/(\d+(?:\.\d+)?)\s*(?:g|gm|grams)\b/i);
  if (gMatch) {
    return parseFloat(gMatch[1]) / 1000;
  }

  // Check kg (e.g. 1 kg, 0.5 kg)
  const kgMatch = combined.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilos?)\b/i);
  if (kgMatch) {
    return parseFloat(kgMatch[1]);
  }

  // Check ml (e.g. 500 ml)
  const mlMatch = combined.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (mlMatch) {
    return parseFloat(mlMatch[1]) / 1000;
  }

  // Check litres (e.g. 1 l, 1 litre, 1.5 ltr)
  const lMatch = combined.match(/(\d+(?:\.\d+)?)\s*(?:l|ltr|litres?)\b/i);
  if (lMatch) {
    return parseFloat(lMatch[1]);
  }

  return 0;
}

/**
 * Returns the current date in Asia/Kolkata timezone formatted as YYYY-MM-DD.
 */
function getKolkataDateString(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date instanceof Date ? date : new Date(date));
  } catch (e) {
    return getLocalDateString(date);
  }
}

/**
 * Returns formatted human-readable date in Asia/Kolkata timezone.
 */
function formatKolkataReadableDate(dateStr) {
  try {
    const d = new Date(`${dateStr}T12:00:00+05:30`);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(d);
  } catch (e) {
    return dateStr;
  }
}

/**
 * Format currency in Indian Rupees style (₹).
 */
function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Generates all consolidated daily report metrics directly from existing database tables.
 */
async function generateDailyReportData(targetDate, agentId = 1) {
  const reportDate = targetDate || getKolkataDateString();
  const formattedDate = formatKolkataReadableDate(reportDate);

  // 1. Business Profile
  let businessProfile = {
    business_name: 'Nandini Milk Parlour',
    phone: '',
    email: '',
    address: ''
  };
  try {
    const bp = await db.prepare('SELECT business_name, phone, email, address, upi_phone FROM business_profile WHERE id = 1').get();
    if (bp) businessProfile = { ...businessProfile, ...bp };
  } catch (e) {
    console.warn('Business profile fetch note:', e.message);
  }

  // 2. Overview Delivery Counts & Revenue for Target Date
  const overviewQuery = `
    SELECT 
      COUNT(DISTINCT CASE WHEN d.status = 'DELIVERED' THEN d.customer_id END) as customers_served,
      COUNT(CASE WHEN d.status = 'DELIVERED' THEN 1 END) as delivered_items_count,
      COUNT(CASE WHEN d.status = 'SKIPPED' THEN 1 END) as skipped_count,
      COUNT(CASE WHEN d.status = 'MISSED' THEN 1 END) as missed_count,
      COUNT(CASE WHEN d.status = 'PENDING' THEN 1 END) as pending_count,
      COUNT(d.id) as total_deliveries_logged,
      COALESCE(SUM(CASE WHEN d.status = 'DELIVERED' THEN d.total_product_amount ELSE 0 END), 0) as product_amount,
      COALESCE(SUM(CASE WHEN d.status = 'DELIVERED' THEN d.delivery_charge_snapshot ELSE 0 END), 0) as delivery_charges,
      COALESCE(SUM(CASE WHEN d.status = 'DELIVERED' THEN d.total_amount ELSE 0 END), 0) as total_delivery_revenue
    FROM deliveries d
    WHERE d.delivery_date = ? AND (d.agent_id = ? OR d.agent_id IS NULL)
  `;
  const overview = (await db.prepare(overviewQuery).get(reportDate, agentId)) || {
    customers_served: 0,
    delivered_items_count: 0,
    skipped_count: 0,
    missed_count: 0,
    pending_count: 0,
    total_deliveries_logged: 0,
    product_amount: 0,
    delivery_charges: 0,
    total_delivery_revenue: 0
  };

  // 3. Product Deliveries Breakdown (Milk vs Curd vs Others)
  const productDeliveriesQuery = `
    SELECT 
      d.product_id,
      d.product_name_snapshot,
      d.category_snapshot,
      d.variant_snapshot,
      d.unit_volume_litres_snapshot,
      p.category as current_category,
      p.unit_volume_litres as current_volume,
      p.variant_label as current_variant,
      SUM(d.quantity) as total_quantity,
      SUM(d.total_product_amount) as total_product_amount,
      SUM(d.delivery_charge_snapshot) as total_delivery_charge,
      SUM(d.total_amount) as total_amount
    FROM deliveries d
    LEFT JOIN products p ON d.product_id = p.id
    WHERE d.delivery_date = ? 
      AND d.status = 'DELIVERED' 
      AND (d.agent_id = ? OR d.agent_id IS NULL)
    GROUP BY d.product_id, d.product_name_snapshot, d.category_snapshot, d.variant_snapshot, d.unit_volume_litres_snapshot, p.category, p.unit_volume_litres, p.variant_label
    ORDER BY total_quantity DESC
  `;
  const rawProducts = await db.prepare(productDeliveriesQuery).all(reportDate, agentId);

  let totalMilkLitres = 0;
  let totalMilkPackets = 0;
  let totalCurdKgLitres = 0;
  let totalCurdPackets = 0;
  const milkProducts = [];
  const curdProducts = [];
  const otherProducts = [];

  for (const item of rawProducts) {
    const category = (item.category_snapshot || item.current_category || '').toLowerCase();
    const name = (item.product_name_snapshot || '').toLowerCase();
    const variant = item.variant_snapshot || item.current_variant || '';
    const vol = parseUnitVolume(item.unit_volume_litres_snapshot || item.current_volume, variant, name);
    const qty = Number(item.total_quantity) || 0;
    const totalVol = qty * vol;

    const entry = {
      productId: item.product_id,
      name: item.product_name_snapshot,
      category: item.category_snapshot || item.current_category,
      variant,
      quantity: qty,
      unitVolume: vol,
      totalVolume: totalVol,
      totalAmount: Number(item.total_amount) || 0
    };

    if (category === 'milk' || name.includes('milk')) {
      milkProducts.push(entry);
      totalMilkLitres += totalVol;
      totalMilkPackets += qty;
    } else if (category === 'curd' || name.includes('curd')) {
      curdProducts.push(entry);
      totalCurdKgLitres += totalVol;
      totalCurdPackets += qty;
    } else {
      otherProducts.push(entry);
    }
  }

  // 4. Route-wise Delivery Totals
  const routeWiseQuery = `
    SELECT 
      COALESCE(r.name, c.route, 'Unassigned Route') as route_name,
      COUNT(DISTINCT CASE WHEN d.status = 'DELIVERED' THEN d.customer_id END) as customers_count,
      COALESCE(SUM(CASE WHEN d.status = 'DELIVERED' THEN d.quantity ELSE 0 END), 0) as total_packets,
      COALESCE(SUM(CASE WHEN d.status = 'DELIVERED' THEN d.total_amount ELSE 0 END), 0) as total_amount,
      d.category_snapshot,
      p.category as prod_category,
      d.product_name_snapshot,
      d.variant_snapshot,
      d.unit_volume_litres_snapshot,
      p.unit_volume_litres as p_unit_volume,
      p.variant_label as p_variant_label,
      d.quantity,
      d.status
    FROM deliveries d
    JOIN customers c ON d.customer_id = c.id
    LEFT JOIN zones z ON c.zone_id = z.id
    LEFT JOIN routes r ON z.route_id = r.id
    LEFT JOIN products p ON d.product_id = p.id
    WHERE d.delivery_date = ? AND (d.agent_id = ? OR ? IS NULL)
  `;
  // We process route totals accurately in JS to calculate exact litres per product volume
  const rawRouteRows = await db.prepare(`
    SELECT 
      COALESCE(r.name, c.route, 'Unassigned Route') as route_name,
      c.id as customer_id,
      d.status,
      d.quantity,
      d.total_amount,
      d.category_snapshot,
      p.category as prod_category,
      d.product_name_snapshot,
      d.variant_snapshot,
      d.unit_volume_litres_snapshot,
      p.unit_volume_litres as p_unit_volume,
      p.variant_label as p_variant_label
    FROM deliveries d
    JOIN customers c ON d.customer_id = c.id
    LEFT JOIN zones z ON c.zone_id = z.id
    LEFT JOIN routes r ON z.route_id = r.id
    LEFT JOIN products p ON d.product_id = p.id
    WHERE d.delivery_date = ? AND (d.agent_id = ? OR d.agent_id IS NULL)
  `).all(reportDate, agentId);

  const routeMap = new Map();
  for (const row of rawRouteRows) {
    if (!routeMap.has(row.route_name)) {
      routeMap.set(row.route_name, {
        routeName: row.route_name,
        customers: new Set(),
        totalPackets: 0,
        milkLitres: 0,
        curdKgLitres: 0,
        totalAmount: 0
      });
    }
    const rData = routeMap.get(row.route_name);
    if (row.status === 'DELIVERED') {
      rData.customers.add(row.customer_id);
      const qty = Number(row.quantity) || 0;
      rData.totalPackets += qty;
      rData.totalAmount += Number(row.total_amount) || 0;

      const cat = (row.category_snapshot || row.prod_category || '').toLowerCase();
      const name = (row.product_name_snapshot || '').toLowerCase();
      const variant = row.variant_snapshot || row.p_variant_label || '';
      const vol = parseUnitVolume(row.unit_volume_litres_snapshot || row.p_unit_volume, variant, name);

      if (cat === 'milk' || name.includes('milk')) {
        rData.milkLitres += qty * vol;
      } else if (cat === 'curd' || name.includes('curd')) {
        rData.curdKgLitres += qty * vol;
      }
    }
  }

  const routeTotals = Array.from(routeMap.values()).map(r => ({
    routeName: r.routeName,
    customersCount: r.customers.size,
    totalPackets: r.totalPackets,
    milkLitres: Number(r.milkLitres.toFixed(2)),
    curdKgLitres: Number(r.curdKgLitres.toFixed(2)),
    totalAmount: Number(r.totalAmount.toFixed(2))
  })).sort((a, b) => b.totalAmount - a.totalAmount);

  // 5. Zone-wise Delivery Totals
  const rawZoneRows = await db.prepare(`
    SELECT 
      COALESCE(z.name, 'Unassigned Zone') as zone_name,
      COALESCE(r.name, c.route, 'Unassigned Route') as route_name,
      c.id as customer_id,
      d.status,
      d.quantity,
      d.total_amount,
      d.category_snapshot,
      p.category as prod_category,
      d.product_name_snapshot,
      d.variant_snapshot,
      d.unit_volume_litres_snapshot,
      p.unit_volume_litres as p_unit_volume,
      p.variant_label as p_variant_label
    FROM deliveries d
    JOIN customers c ON d.customer_id = c.id
    LEFT JOIN zones z ON c.zone_id = z.id
    LEFT JOIN routes r ON z.route_id = r.id
    LEFT JOIN products p ON d.product_id = p.id
    WHERE d.delivery_date = ? AND (d.agent_id = ? OR d.agent_id IS NULL)
  `).all(reportDate, agentId);

  const zoneMap = new Map();
  for (const row of rawZoneRows) {
    const key = `${row.zone_name}__${row.route_name}`;
    if (!zoneMap.has(key)) {
      zoneMap.set(key, {
        zoneName: row.zone_name,
        routeName: row.route_name,
        customers: new Set(),
        totalPackets: 0,
        milkLitres: 0,
        curdKgLitres: 0,
        totalAmount: 0
      });
    }
    const zData = zoneMap.get(key);
    if (row.status === 'DELIVERED') {
      zData.customers.add(row.customer_id);
      const qty = Number(row.quantity) || 0;
      zData.totalPackets += qty;
      zData.totalAmount += Number(row.total_amount) || 0;

      const cat = (row.category_snapshot || row.prod_category || '').toLowerCase();
      const name = (row.product_name_snapshot || '').toLowerCase();
      const variant = row.variant_snapshot || row.p_variant_label || '';
      const vol = parseUnitVolume(row.unit_volume_litres_snapshot || row.p_unit_volume, variant, name);

      if (cat === 'milk' || name.includes('milk')) {
        zData.milkLitres += qty * vol;
      } else if (cat === 'curd' || name.includes('curd')) {
        zData.curdKgLitres += qty * vol;
      }
    }
  }

  const zoneTotals = Array.from(zoneMap.values()).map(z => ({
    zoneName: z.zoneName,
    routeName: z.routeName,
    customersCount: z.customers.size,
    totalPackets: z.totalPackets,
    milkLitres: Number(z.milkLitres.toFixed(2)),
    curdKgLitres: Number(z.curdKgLitres.toFixed(2)),
    totalAmount: Number(z.totalAmount.toFixed(2))
  })).sort((a, b) => b.totalAmount - a.totalAmount);

  // 6. Missed or Incomplete Deliveries
  const missedDeliveriesQuery = `
    SELECT 
      d.id,
      d.status,
      d.notes,
      d.quantity,
      d.product_name_snapshot,
      d.variant_snapshot,
      c.name as customer_name,
      c.phone as customer_phone,
      c.flat_no,
      COALESCE(z.name, 'No Zone') as zone_name
    FROM deliveries d
    JOIN customers c ON d.customer_id = c.id
    LEFT JOIN zones z ON c.zone_id = z.id
    WHERE d.delivery_date = ? 
      AND d.status IN ('MISSED', 'SKIPPED', 'PENDING')
      AND (d.agent_id = ? OR d.agent_id IS NULL)
    ORDER BY d.status, c.name
  `;
  const missedDeliveries = await db.prepare(missedDeliveriesQuery).all(reportDate, agentId);

  // 7. Extra Products & Daily Special Adjustments
  const extraRequirementsQuery = `
    SELECT 
      r.id,
      r.requirement_type,
      r.normal_quantity,
      r.required_quantity,
      r.additional_quantity,
      r.effective_quantity,
      r.reason,
      c.name as customer_name,
      c.flat_no,
      COALESCE(z.name, 'No Zone') as zone_name,
      p.name as product_name,
      p.variant_label
    FROM daily_delivery_requirements r
    JOIN customers c ON r.customer_id = c.id
    JOIN products p ON COALESCE(r.target_product_id, r.product_id) = p.id
    LEFT JOIN zones z ON c.zone_id = z.id
    WHERE r.delivery_date = ?
      AND r.requirement_type IN ('ADD_EXTRA_QUANTITY', 'CHANGE_QUANTITY')
      AND r.status IN ('ACTIVE', 'COMPLETED')
    ORDER BY c.name
  `;
  const extraRequirements = await db.prepare(extraRequirementsQuery).all(reportDate);

  // 8. Payments Received Today
  const paymentsQuery = `
    SELECT 
      p.receipt_number,
      p.amount,
      p.payment_type,
      p.payment_method,
      p.reference_number,
      c.name as customer_name,
      c.phone as customer_phone
    FROM payments p
    JOIN customers c ON p.customer_id = c.id
    WHERE p.payment_date = ? AND (p.agent_id = ? OR p.agent_id IS NULL)
    ORDER BY p.id DESC
  `;
  const paymentsToday = await db.prepare(paymentsQuery).all(reportDate, agentId);

  let totalPaymentsReceived = 0;
  const paymentMethodsBreakdown = {};
  for (const pay of paymentsToday) {
    const amt = Number(pay.amount) || 0;
    totalPaymentsReceived += amt;
    const method = pay.payment_method || 'OTHER';
    paymentMethodsBreakdown[method] = (paymentMethodsBreakdown[method] || 0) + amt;
  }

  // 9. Customer Outstanding & Advance Balances (Global Active State)
  const balancesQuery = `
    SELECT 
      COUNT(*) as total_active_customers,
      COALESCE(SUM(pending_balance), 0) as total_pending_balance,
      COALESCE(SUM(advance_balance), 0) as total_advance_balance,
      COUNT(CASE WHEN pending_balance > 0 THEN 1 END) as customers_with_due,
      COUNT(CASE WHEN advance_balance > 0 THEN 1 END) as customers_with_advance
    FROM customers
    WHERE status = 'ACTIVE' AND (agent_id = ? OR agent_id IS NULL)
  `;
  const customerBalances = (await db.prepare(balancesQuery).get(agentId)) || {
    total_active_customers: 0,
    total_pending_balance: 0,
    total_advance_balance: 0,
    customers_with_due: 0,
    customers_with_advance: 0
  };

  return {
    reportDate,
    formattedDate,
    businessProfile,
    overview: {
      customersServed: Number(overview.customers_served) || 0,
      deliveredItemsCount: Number(overview.delivered_items_count) || 0,
      skippedCount: Number(overview.skipped_count) || 0,
      missedCount: Number(overview.missed_count) || 0,
      pendingCount: Number(overview.pending_count) || 0,
      totalDeliveriesLogged: Number(overview.total_deliveries_logged) || 0,
      productAmount: Number(overview.product_amount) || 0,
      deliveryCharges: Number(overview.delivery_charges) || 0,
      totalDeliveryRevenue: Number(overview.total_delivery_revenue) || 0
    },
    milk: {
      totalLitres: Number(totalMilkLitres.toFixed(2)),
      totalPackets: totalMilkPackets,
      products: milkProducts
    },
    curd: {
      totalKgLitres: Number(totalCurdKgLitres.toFixed(2)),
      totalPackets: totalCurdPackets,
      products: curdProducts
    },
    otherProducts,
    routeTotals,
    zoneTotals,
    missedDeliveries,
    extraRequirements,
    payments: {
      totalReceived: totalPaymentsReceived,
      breakdown: paymentMethodsBreakdown,
      list: paymentsToday
    },
    customerBalances: {
      totalActiveCustomers: Number(customerBalances.total_active_customers) || 0,
      totalPendingBalance: Number(customerBalances.total_pending_balance) || 0,
      totalAdvanceBalance: Number(customerBalances.total_advance_balance) || 0,
      customersWithDue: Number(customerBalances.customers_with_due) || 0,
      customersWithAdvance: Number(customerBalances.customers_with_advance) || 0
    }
  };
}

/**
 * Builds a clean, responsive HTML email template for the daily operations report.
 */
function buildDailyReportHtml(data) {
  const {
    reportDate,
    formattedDate,
    businessProfile,
    overview,
    milk,
    curd,
    otherProducts,
    routeTotals,
    zoneTotals,
    missedDeliveries,
    extraRequirements,
    payments,
    customerBalances
  } = data;

  const generatedAtIst = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date());

  // HTML helpers
  const renderRow = (label, value) => `
    <tr>
      <td style="padding: 8px 12px; font-size: 13px; color: #475569; border-bottom: 1px solid #f1f5f9;">${label}</td>
      <td style="padding: 8px 12px; font-size: 13px; font-weight: 600; color: #0f172a; text-align: right; border-bottom: 1px solid #f1f5f9;">${value}</td>
    </tr>
  `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nandini Daily Report — ${reportDate}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5; }
    table { border-collapse: collapse; width: 100%; }
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; margin: 0 !important; border-radius: 0 !important; }
      .grid-cell { display: block !important; width: 100% !important; box-sizing: border-box !important; margin-bottom: 10px !important; }
      .header-title { font-size: 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 20px 10px; background-color: #f1f5f9;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="container" style="max-width: 640px; width: 100%; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0054a6 0%, #003366 100%); padding: 26px 24px; text-align: center; color: #ffffff;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #93c5fd; margin-bottom: 6px;">
                      DAILY OPERATIONS REPORT
                    </div>
                    <h1 class="header-title" style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                      ${businessProfile.business_name || 'Nandini Milk Parlour'}
                    </h1>
                    <div style="margin-top: 8px; font-size: 14px; color: #e0f2fe; font-weight: 500;">
                      📅 ${formattedDate}
                    </div>
                    <div style="margin-top: 4px; font-size: 11px; color: #bfdbfe;">
                      Generated at ${generatedAtIst} (IST)
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- KPI Summary Cards (2x2 Grid) -->
          <tr>
            <td style="padding: 20px 20px 10px 20px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td class="grid-cell" width="50%" style="padding: 6px;">
                    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 16px;">
                      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #1d4ed8; letter-spacing: 0.5px;">🥛 Milk Delivered</div>
                      <div style="font-size: 22px; font-weight: 800; color: #1e3a8a; margin-top: 4px;">
                        ${milk.totalLitres} <span style="font-size: 14px; font-weight: 600;">Litres</span>
                      </div>
                      <div style="font-size: 12px; color: #60a5fa; margin-top: 2px;">
                        ${milk.totalPackets} total packets
                      </div>
                    </div>
                  </td>
                  <td class="grid-cell" width="50%" style="padding: 6px;">
                    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 16px;">
                      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #15803d; letter-spacing: 0.5px;">🥣 Curd Delivered</div>
                      <div style="font-size: 22px; font-weight: 800; color: #14532d; margin-top: 4px;">
                        ${curd.totalKgLitres} <span style="font-size: 14px; font-weight: 600;">kg/L</span>
                      </div>
                      <div style="font-size: 12px; color: #4ade80; margin-top: 2px;">
                        ${curd.totalPackets} total packets
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td class="grid-cell" width="50%" style="padding: 6px;">
                    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px 16px;">
                      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #475569; letter-spacing: 0.5px;">👥 Customers Served</div>
                      <div style="font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 4px;">
                        ${overview.customersServed} <span style="font-size: 14px; font-weight: 600;">Customers</span>
                      </div>
                      <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
                        ${overview.deliveredItemsCount} completed deliveries
                      </div>
                    </div>
                  </td>
                  <td class="grid-cell" width="50%" style="padding: 6px;">
                    <div style="background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 14px 16px;">
                      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #a16207; letter-spacing: 0.5px;">💰 Payments Collected</div>
                      <div style="font-size: 22px; font-weight: 800; color: #713f12; margin-top: 4px;">
                        ${formatCurrency(payments.totalReceived)}
                      </div>
                      <div style="font-size: 12px; color: #ca8a04; margin-top: 2px;">
                        ${payments.list.length} receipts recorded
                      </div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${overview.totalDeliveriesLogged === 0 ? `
          <!-- Zero Deliveries Notice -->
          <tr>
            <td style="padding: 10px 24px;">
              <div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; text-align: center; color: #92400e; font-size: 13px;">
                ⚠️ <strong>No deliveries logged yet for ${reportDate}.</strong><br>
                Once delivery boys begin marking morning routes, totals will reflect in subsequent reports.
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- SECTION: Route-wise Performance -->
          ${routeTotals.length > 0 ? `
          <tr>
            <td style="padding: 14px 24px 8px 24px;">
              <div style="font-size: 14px; font-weight: 700; color: #0f172a; border-left: 4px solid #0054a6; padding-left: 8px; margin-bottom: 10px;">
                Route-wise Delivery Summary
              </div>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: #ffffff;">
                <thead>
                  <tr style="background: #f8fafc; font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px;">
                    <th align="left" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">Route</th>
                    <th align="center" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">Custs</th>
                    <th align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">Milk (L)</th>
                    <th align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">Curd</th>
                    <th align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${routeTotals.map(r => `
                    <tr>
                      <td style="padding: 8px 10px; font-size: 12px; font-weight: 600; color: #1e293b; border-bottom: 1px solid #f1f5f9;">${r.routeName}</td>
                      <td align="center" style="padding: 8px 10px; font-size: 12px; color: #475569; border-bottom: 1px solid #f1f5f9;">${r.customersCount}</td>
                      <td align="right" style="padding: 8px 10px; font-size: 12px; font-weight: 600; color: #1d4ed8; border-bottom: 1px solid #f1f5f9;">${r.milkLitres} L</td>
                      <td align="right" style="padding: 8px 10px; font-size: 12px; color: #15803d; border-bottom: 1px solid #f1f5f9;">${r.curdKgLitres}</td>
                      <td align="right" style="padding: 8px 10px; font-size: 12px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${formatCurrency(r.totalAmount)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- SECTION: Zone-wise Breakdown (Top Zones) -->
          ${zoneTotals.length > 0 ? `
          <tr>
            <td style="padding: 14px 24px 8px 24px;">
              <div style="font-size: 14px; font-weight: 700; color: #0f172a; border-left: 4px solid #0054a6; padding-left: 8px; margin-bottom: 10px;">
                Zone-wise Delivery Totals (${zoneTotals.length} Active Zones)
              </div>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: #ffffff;">
                <thead>
                  <tr style="background: #f8fafc; font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px;">
                    <th align="left" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">Zone / Community</th>
                    <th align="left" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">Route</th>
                    <th align="center" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">Served</th>
                    <th align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">Packets</th>
                    <th align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">Value</th>
                  </tr>
                </thead>
                <tbody>
                  ${zoneTotals.slice(0, 10).map(z => `
                    <tr>
                      <td style="padding: 7px 10px; font-size: 12px; font-weight: 600; color: #1e293b; border-bottom: 1px solid #f1f5f9;">${z.zoneName}</td>
                      <td style="padding: 7px 10px; font-size: 11px; color: #64748b; border-bottom: 1px solid #f1f5f9;">${z.routeName}</td>
                      <td align="center" style="padding: 7px 10px; font-size: 12px; color: #475569; border-bottom: 1px solid #f1f5f9;">${z.customersCount}</td>
                      <td align="right" style="padding: 7px 10px; font-size: 12px; font-weight: 600; color: #1d4ed8; border-bottom: 1px solid #f1f5f9;">${z.totalPackets}</td>
                      <td align="right" style="padding: 7px 10px; font-size: 12px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${formatCurrency(z.totalAmount)}</td>
                    </tr>
                  `).join('')}
                  ${zoneTotals.length > 10 ? `
                    <tr>
                      <td colspan="5" style="padding: 6px 10px; font-size: 11px; color: #64748b; text-align: center; background: #f8fafc;">
                        + ${zoneTotals.length - 10} more zones completed
                      </td>
                    </tr>
                  ` : ''}
                </tbody>
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- SECTION: Product Varieties Delivered -->
          <tr>
            <td style="padding: 14px 24px 8px 24px;">
              <div style="font-size: 14px; font-weight: 700; color: #0f172a; border-left: 4px solid #0054a6; padding-left: 8px; margin-bottom: 10px;">
                Product Variety Breakdown
              </div>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: #ffffff;">
                <thead>
                  <tr style="background: #f8fafc; font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px;">
                    <th align="left" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">Product</th>
                    <th align="left" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">Variant</th>
                    <th align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">Packets</th>
                    <th align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">Total Vol</th>
                    <th align="right" style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${[...milk.products, ...curd.products, ...otherProducts].map(p => `
                    <tr>
                      <td style="padding: 7px 10px; font-size: 12px; font-weight: 600; color: #1e293b; border-bottom: 1px solid #f1f5f9;">${p.name}</td>
                      <td style="padding: 7px 10px; font-size: 11px; color: #64748b; border-bottom: 1px solid #f1f5f9;">${p.variant}</td>
                      <td align="right" style="padding: 7px 10px; font-size: 12px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${p.quantity}</td>
                      <td align="right" style="padding: 7px 10px; font-size: 12px; color: #1d4ed8; font-weight: 600; border-bottom: 1px solid #f1f5f9;">${p.totalVolume ? p.totalVolume.toFixed(1) + ' ' + (p.category === 'Curd' ? 'kg/L' : 'L') : '-'}</td>
                      <td align="right" style="padding: 7px 10px; font-size: 12px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${formatCurrency(p.totalAmount)}</td>
                    </tr>
                  `).join('')}
                  ${[...milk.products, ...curd.products, ...otherProducts].length === 0 ? `
                    <tr>
                      <td colspan="5" style="padding: 14px; text-align: center; color: #94a3b8; font-size: 12px;">No products delivered yet for this date.</td>
                    </tr>
                  ` : ''}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- SECTION: Extra Products & Adjustments -->
          ${extraRequirements.length > 0 ? `
          <tr>
            <td style="padding: 14px 24px 8px 24px;">
              <div style="font-size: 14px; font-weight: 700; color: #0f172a; border-left: 4px solid #f59e0b; padding-left: 8px; margin-bottom: 10px;">
                ⭐ Extra Products & Quantity Adjustments (${extraRequirements.length})
              </div>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="width: 100%; border: 1px solid #fed7aa; border-radius: 6px; overflow: hidden; background: #fffaf0;">
                <thead>
                  <tr style="background: #ffedd5; font-size: 11px; text-transform: uppercase; color: #9a3412; font-weight: 700;">
                    <th align="left" style="padding: 7px 10px; border-bottom: 1px solid #fed7aa;">Customer</th>
                    <th align="left" style="padding: 7px 10px; border-bottom: 1px solid #fed7aa;">Zone / Flat</th>
                    <th align="left" style="padding: 7px 10px; border-bottom: 1px solid #fed7aa;">Product</th>
                    <th align="center" style="padding: 7px 10px; border-bottom: 1px solid #fed7aa;">Extra Qty</th>
                    <th align="left" style="padding: 7px 10px; border-bottom: 1px solid #fed7aa;">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  ${extraRequirements.map(req => `
                    <tr>
                      <td style="padding: 7px 10px; font-size: 12px; font-weight: 600; color: #7c2d12; border-bottom: 1px solid #fed7aa;">${req.customer_name}</td>
                      <td style="padding: 7px 10px; font-size: 11px; color: #9a3412; border-bottom: 1px solid #fed7aa;">${req.zone_name} ${req.flat_no ? `(${req.flat_no})` : ''}</td>
                      <td style="padding: 7px 10px; font-size: 12px; color: #7c2d12; border-bottom: 1px solid #fed7aa;">${req.product_name} (${req.variant_label})</td>
                      <td align="center" style="padding: 7px 10px; font-size: 12px; font-weight: 700; color: #c2410c; border-bottom: 1px solid #fed7aa;">+${req.additional_quantity || (req.effective_quantity - req.normal_quantity)}</td>
                      <td style="padding: 7px 10px; font-size: 11px; color: #9a3412; border-bottom: 1px solid #fed7aa;">${req.reason || 'Special Request'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- SECTION: Incomplete or Missed Deliveries -->
          <tr>
            <td style="padding: 14px 24px 8px 24px;">
              <div style="font-size: 14px; font-weight: 700; color: #0f172a; border-left: 4px solid ${missedDeliveries.length > 0 ? '#dc2626' : '#16a34a'}; padding-left: 8px; margin-bottom: 10px;">
                ${missedDeliveries.length > 0 ? `⚠️ Incomplete / Missed Deliveries (${missedDeliveries.length})` : `✅ Delivery Completion: 100%`}
              </div>
              ${missedDeliveries.length > 0 ? `
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="width: 100%; border: 1px solid #fecaca; border-radius: 6px; overflow: hidden; background: #fff5f5;">
                <thead>
                  <tr style="background: #fee2e2; font-size: 11px; text-transform: uppercase; color: #991b1b; font-weight: 700;">
                    <th align="left" style="padding: 7px 10px; border-bottom: 1px solid #fecaca;">Customer</th>
                    <th align="left" style="padding: 7px 10px; border-bottom: 1px solid #fecaca;">Zone / Flat</th>
                    <th align="left" style="padding: 7px 10px; border-bottom: 1px solid #fecaca;">Product</th>
                    <th align="center" style="padding: 7px 10px; border-bottom: 1px solid #fecaca;">Status</th>
                    <th align="left" style="padding: 7px 10px; border-bottom: 1px solid #fecaca;">Note / Reason</th>
                  </tr>
                </thead>
                <tbody>
                  ${missedDeliveries.map(m => `
                    <tr>
                      <td style="padding: 7px 10px; font-size: 12px; font-weight: 600; color: #7f1d1d; border-bottom: 1px solid #fecaca;">${m.customer_name}</td>
                      <td style="padding: 7px 10px; font-size: 11px; color: #991b1b; border-bottom: 1px solid #fecaca;">${m.zone_name} ${m.flat_no ? `(${m.flat_no})` : ''}</td>
                      <td style="padding: 7px 10px; font-size: 12px; color: #7f1d1d; border-bottom: 1px solid #fecaca;">${m.quantity}x ${m.product_name_snapshot}</td>
                      <td align="center" style="padding: 7px 10px; border-bottom: 1px solid #fecaca;">
                        <span style="display: inline-block; padding: 2px 6px; font-size: 10px; font-weight: 700; border-radius: 4px; background: ${m.status === 'MISSED' ? '#ef4444' : '#f59e0b'}; color: #ffffff;">
                          ${m.status}
                        </span>
                      </td>
                      <td style="padding: 7px 10px; font-size: 11px; color: #991b1b; border-bottom: 1px solid #fecaca;">${m.notes || 'No note recorded'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              ` : `
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px 16px; color: #166534; font-size: 13px;">
                🎉 <strong>Perfect execution!</strong> Zero missed or skipped deliveries recorded for this date.
              </div>
              `}
            </td>
          </tr>

          <!-- SECTION: Financial Collections & Customer Outstanding Balances -->
          <tr>
            <td style="padding: 14px 24px 20px 24px;">
              <div style="font-size: 14px; font-weight: 700; color: #0f172a; border-left: 4px solid #10b981; padding-left: 8px; margin-bottom: 10px;">
                Financials & Ledger Summary
              </div>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: #ffffff;">
                <tbody>
                  ${renderRow('Total Payments Collected Today', `<span style="color: #16a34a; font-size: 15px;">${formatCurrency(payments.totalReceived)}</span>`)}
                  ${Object.keys(payments.breakdown).map(k => renderRow(`&nbsp;&nbsp;↳ Via ${k}`, formatCurrency(payments.breakdown[k]))).join('')}
                  ${renderRow('Today Deliveries Billed Amount', formatCurrency(overview.totalDeliveryRevenue))}
                  ${renderRow('Current Total Customer Pending Due', `<span style="color: #dc2626; font-size: 14px;">${formatCurrency(customerBalances.totalPendingBalance)}</span> (${customerBalances.customersWithDue} customers)`)}
                  ${renderRow('Current Total Advance Balance Held', `<span style="color: #0284c7; font-size: 14px;">${formatCurrency(customerBalances.totalAdvanceBalance)}</span> (${customerBalances.customersWithAdvance} customers)`)}
                  ${renderRow('Total Active Customer Base', `${customerBalances.totalActiveCustomers} Registered Active Customers`)}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- System Footer -->
          <tr>
            <td style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 24px; text-align: center; color: #94a3b8; font-size: 12px;">
              <div style="font-weight: 600; color: #64748b; margin-bottom: 4px;">
                ${businessProfile.business_name || 'Nandini Milk Parlour'}
              </div>
              <div>
                Automatic Daily Operations Report • Vercel Cron • Resend SDK
              </div>
              <div style="margin-top: 6px; font-size: 11px; color: #cbd5e1;">
                Timezone: Asia/Kolkata (IST) • Business Date: ${reportDate}
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Sends the daily delivery report via Resend email.
 * Includes duplicate check, error handling, and audit logging.
 */
async function sendDailyReportEmail({ targetDate, recipientEmail, triggerType = 'CRON', force = false, agentId = 1 }) {
  const reportDate = targetDate || getKolkataDateString();
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = recipientEmail || process.env.ADMIN_REPORT_EMAIL;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'Nandini Milk Parlour <onboarding@resend.dev>';

  // 1. Generate consolidated report data
  const reportData = await generateDailyReportData(reportDate, agentId);
  const htmlContent = buildDailyReportHtml(reportData);

  const summary = {
    reportDate,
    customersServed: reportData.overview.customersServed,
    milkLitres: reportData.milk.totalLitres,
    curdKgLitres: reportData.curd.totalKgLitres,
    paymentsReceived: reportData.payments.totalReceived,
    missedDeliveriesCount: reportData.missedDeliveries.length
  };

  // 2. Prevent Duplicate Sends if running via automated Cron
  if (triggerType === 'CRON' && !force) {
    try {
      const existing = await db.prepare(`
        SELECT id, created_at, resend_id 
        FROM email_report_logs 
        WHERE report_date = ? AND report_type = 'DAILY_DELIVERY' AND status = 'SENT'
        LIMIT 1
      `).get(reportDate);

      if (existing) {
        // Record skipped duplicate in audit log
        await db.prepare(`
          INSERT INTO email_report_logs (
            report_date, report_type, recipient_email, sender_email,
            status, error_message, report_summary_json, trigger_type, agent_id, created_at
          ) VALUES (?, 'DAILY_DELIVERY', ?, ?, 'SKIPPED_DUPLICATE', 'Daily email report already sent for this date', ?, 'CRON', ?, datetime('now', 'localtime'))
        `).run(reportDate, toEmail || 'unconfigured', fromEmail, JSON.stringify(summary), agentId);

        return {
          success: true,
          status: 'SKIPPED_DUPLICATE',
          message: `Daily report for ${reportDate} was already sent previously (Log ID #${existing.id}). Skipped duplicate cron send.`,
          reportDate,
          existingLogId: existing.id
        };
      }
    } catch (dupCheckErr) {
      console.warn('Duplicate check warning:', dupCheckErr.message);
    }
  }

  // 3. Verify Resend API Key is configured
  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your-resend-api-key')) {
    const errorMsg = 'RESEND_API_KEY is missing or contains placeholder. Please set RESEND_API_KEY in server environment variables.';
    try {
      await db.prepare(`
        INSERT INTO email_report_logs (
          report_date, report_type, recipient_email, sender_email,
          status, error_message, report_summary_json, trigger_type, agent_id, created_at
        ) VALUES (?, 'DAILY_DELIVERY', ?, ?, 'FAILED', ?, ?, ?, ?, datetime('now', 'localtime'))
      `).run(reportDate, toEmail || 'unconfigured', fromEmail, errorMsg, JSON.stringify(summary), triggerType, agentId);
    } catch (e) {}

    return {
      success: false,
      status: 'API_KEY_MISSING',
      message: errorMsg,
      reportDate,
      summary,
      htmlPreview: htmlContent
    };
  }

  // 4. Verify Recipient Email is configured
  if (!toEmail || toEmail.trim() === '') {
    const errorMsg = 'Recipient email is not configured. Set ADMIN_REPORT_EMAIL in environment variables or specify recipient in test request.';
    try {
      await db.prepare(`
        INSERT INTO email_report_logs (
          report_date, report_type, recipient_email, sender_email,
          status, error_message, report_summary_json, trigger_type, agent_id, created_at
        ) VALUES (?, 'DAILY_DELIVERY', 'MISSING', ?, 'FAILED', ?, ?, ?, ?, datetime('now', 'localtime'))
      `).run(reportDate, fromEmail, errorMsg, JSON.stringify(summary), triggerType, agentId);
    } catch (e) {}

    return {
      success: false,
      status: 'RECIPIENT_MISSING',
      message: errorMsg,
      reportDate,
      summary,
      htmlPreview: htmlContent
    };
  }

  // 5. Send Email via Resend Node.js SDK
  try {
    const { Resend } = require('resend');
    const resend = new Resend(apiKey);

    const subject = `🥛 Nandini Milk Parlour — Daily Delivery Report (${reportDate})`;
    const response = await resend.emails.send({
      from: fromEmail,
      to: [toEmail.trim()],
      subject,
      html: htmlContent
    });

    if (response.error) {
      const isDomainRestriction = response.error.message && (
        response.error.message.includes('only send testing emails to your own email address') ||
        response.error.message.includes('verify a domain')
      );

      const friendlyError = isDomainRestriction
        ? `Resend Free Test Mode restriction: When using '${fromEmail}', Resend only allows sending to the email registered on your Resend account. To send to any other recipient, verify your domain in Resend Dashboard.`
        : response.error.message;

      // Log failure in database
      await db.prepare(`
        INSERT INTO email_report_logs (
          report_date, report_type, recipient_email, sender_email,
          status, error_message, report_summary_json, trigger_type, agent_id, created_at
        ) VALUES (?, 'DAILY_DELIVERY', ?, ?, 'FAILED', ?, ?, ?, ?, datetime('now', 'localtime'))
      `).run(reportDate, toEmail, fromEmail, friendlyError, JSON.stringify(summary), triggerType, agentId);

      return {
        success: false,
        status: isDomainRestriction ? 'DOMAIN_VERIFICATION_REQUIRED' : 'RESEND_API_ERROR',
        message: friendlyError,
        rawError: response.error,
        reportDate,
        recipient: toEmail,
        sender: fromEmail
      };
    }

    const messageId = response.data?.id || 'unknown';

    // Log success in database
    await db.prepare(`
      INSERT INTO email_report_logs (
        report_date, report_type, recipient_email, sender_email,
        resend_id, status, report_summary_json, trigger_type, agent_id, created_at
      ) VALUES (?, 'DAILY_DELIVERY', ?, ?, ?, 'SENT', ?, ?, ?, datetime('now', 'localtime'))
    `).run(reportDate, toEmail, fromEmail, messageId, JSON.stringify(summary), triggerType, agentId);

    return {
      success: true,
      status: 'SENT',
      message: `Daily delivery report for ${reportDate} successfully sent to ${toEmail}.`,
      messageId,
      reportDate,
      recipient: toEmail,
      sender: fromEmail,
      summary
    };
  } catch (sendErr) {
    console.error('Email report send error:', sendErr);
    try {
      await db.prepare(`
        INSERT INTO email_report_logs (
          report_date, report_type, recipient_email, sender_email,
          status, error_message, report_summary_json, trigger_type, agent_id, created_at
        ) VALUES (?, 'DAILY_DELIVERY', ?, ?, 'FAILED', ?, ?, ?, ?, datetime('now', 'localtime'))
      `).run(reportDate, toEmail, fromEmail, sendErr.message, JSON.stringify(summary), triggerType, agentId);
    } catch (e) {}

    return {
      success: false,
      status: 'SEND_EXCEPTION',
      message: sendErr.message || 'An unexpected error occurred while sending email.',
      reportDate,
      recipient: toEmail
    };
  }
}

/**
 * Retrieves recent email report audit logs.
 */
async function getEmailReportLogs(limit = 15, agentId = 1) {
  try {
    return await db.prepare(`
      SELECT id, report_date, report_type, recipient_email, sender_email, resend_id,
             status, error_message, report_summary_json, trigger_type, created_at
      FROM email_report_logs
      WHERE (agent_id = ? OR agent_id IS NULL)
      ORDER BY id DESC
      LIMIT ?
    `).all(agentId, limit);
  } catch (err) {
    console.warn('Failed to fetch email_report_logs (table may not exist yet):', err.message);
    return [];
  }
}

module.exports = {
  getKolkataDateString,
  generateDailyReportData,
  buildDailyReportHtml,
  sendDailyReportEmail,
  getEmailReportLogs
};
