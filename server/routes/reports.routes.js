const express = require('express');
const router = express.Router();
const xlsx = require('xlsx');
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const { getLocalDateString } = require('../utils/dateUtils');

// Get report data by report type
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { type, startDate, endDate, month, format } = req.query;
    const currentMonth = month || getLocalDateString().slice(0, 7);
    const today = getLocalDateString();
    const sDate = startDate || `${currentMonth}-01`;
    const eDate = endDate || today;

    let data = [];
    let title = 'Report';

    switch (type) {
      case 'DAILY_SALES':
        title = `Daily_Sales_${sDate}_to_${eDate}`;
        data = await db.prepare(`
          SELECT delivery_date,
                 COUNT(*) as total_deliveries,
                 SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_deliveries,
                 SUM(CASE WHEN status = 'DELIVERED' THEN total_product_amount ELSE 0 END) as product_amount,
                 SUM(CASE WHEN status = 'DELIVERED' THEN delivery_charge_snapshot ELSE 0 END) as delivery_charges,
                 SUM(CASE WHEN status = 'DELIVERED' THEN total_amount ELSE 0 END) as total_sales
          FROM deliveries
          WHERE delivery_date >= ? AND delivery_date <= ?
          GROUP BY delivery_date
          ORDER BY delivery_date DESC
        `).all(sDate, eDate);
        break;

      case 'MONTHLY_SALES':
        title = `Monthly_Sales_Summary`;
        data = await db.prepare(`
          SELECT SUBSTR(delivery_date, 1, 7) as month,
                 COUNT(*) as total_deliveries,
                 SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_deliveries,
                 SUM(CASE WHEN status = 'DELIVERED' THEN total_amount ELSE 0 END) as total_revenue
          FROM deliveries
          GROUP BY SUBSTR(delivery_date, 1, 7)
          ORDER BY month DESC
        `).all();
        break;

      case 'PRODUCT_SALES':
        title = `Product_Sales_${sDate}_to_${eDate}`;
        data = await db.prepare(`
          SELECT product_name_snapshot as product_name,
                 category_snapshot as category,
                 variant_snapshot as variant,
                 SUM(quantity) as total_quantity_delivered,
                 SUM(unit_volume_litres_snapshot * quantity) as total_litres,
                 SUM(total_product_amount) as product_sales,
                 SUM(delivery_charge_snapshot) as delivery_charges_collected,
                 SUM(total_amount) as total_revenue
          FROM deliveries
          WHERE delivery_date >= ? AND delivery_date <= ? AND status = 'DELIVERED'
          GROUP BY product_id, product_name_snapshot, variant_snapshot
          ORDER BY total_revenue DESC
        `).all(sDate, eDate);
        break;

      case 'CUSTOMER_SALES':
        title = `Customer_Sales_${sDate}_to_${eDate}`;
        data = await db.prepare(`
          SELECT c.name as customer_name,
                 c.phone as customer_phone,
                 c.customer_category,
                 c.billing_type,
                 c.route,
                 COUNT(d.id) as total_deliveries,
                 SUM(d.total_amount) as total_bill_amount,
                 c.advance_balance,
                 c.pending_balance
          FROM customers c
          LEFT JOIN deliveries d ON c.id = d.customer_id AND d.delivery_date >= ? AND d.delivery_date <= ? AND d.status = 'DELIVERED'
          GROUP BY c.id
          ORDER BY total_bill_amount DESC
        `).all(sDate, eDate);
        break;

      case 'COLLECTIONS':
        title = `Payment_Collections_${sDate}_to_${eDate}`;
        data = await db.prepare(`
          SELECT p.payment_date,
                 p.receipt_number,
                 c.name as customer_name,
                 c.phone as customer_phone,
                 p.payment_type,
                 p.payment_method,
                 p.reference_number,
                 p.amount
          FROM payments p
          JOIN customers c ON p.customer_id = c.id
          WHERE p.payment_date >= ? AND p.payment_date <= ?
          ORDER BY p.payment_date DESC
        `).all(sDate, eDate);
        break;

      case 'PENDING_PAYMENTS':
        title = `Pending_Payments_Report`;
        data = await db.prepare(`
          SELECT c.id, c.name, c.phone, c.address, c.customer_category, c.billing_type, c.route,
                 c.pending_balance, c.advance_balance
          FROM customers c
          WHERE c.pending_balance > 0 AND c.status = 'ACTIVE'
          ORDER BY c.pending_balance DESC
        `).all();
        break;

      case 'ADVANCE_BALANCES':
        title = `Advance_Balances_Report`;
        data = await db.prepare(`
          SELECT c.id, c.name, c.phone, c.address, c.customer_category, c.billing_type, c.route,
                 c.advance_balance, c.pending_balance
          FROM customers c
          WHERE c.advance_balance > 0 AND c.status = 'ACTIVE'
          ORDER BY c.advance_balance DESC
        `).all();
        break;

      case 'EXPENSES':
        title = `Expenses_Report_${sDate}_to_${eDate}`;
        data = await db.prepare(`
          SELECT expense_date, category, amount, payment_method, recipient_name, description
          FROM expenses
          WHERE expense_date >= ? AND expense_date <= ?
          ORDER BY expense_date DESC
        `).all(sDate, eDate);
        break;

      default:
        return res.status(400).json({ error: 'Valid report type is required' });
    }

    // Export as Excel workbook if requested
    if (format === 'excel') {
      const ws = xlsx.utils.json_to_sheet(data);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Report');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Disposition', `attachment; filename="${title}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buf);
    }

    res.json({
      title,
      type,
      count: data.length,
      data
    });
  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

module.exports = router;
