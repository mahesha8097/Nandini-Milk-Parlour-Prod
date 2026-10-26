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

    const agentId = req.agentId || 1;
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
          WHERE delivery_date >= ? AND delivery_date <= ? AND agent_id = ?
          GROUP BY delivery_date
          ORDER BY delivery_date DESC
        `).all(sDate, eDate, agentId);
        break;

      case 'MONTHLY_SALES':
        title = `Monthly_Sales_Summary`;
        data = await db.prepare(`
          SELECT SUBSTR(delivery_date, 1, 7) as month,
                 COUNT(*) as total_deliveries,
                 SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_deliveries,
                 SUM(CASE WHEN status = 'DELIVERED' THEN total_amount ELSE 0 END) as total_revenue
          FROM deliveries
          WHERE agent_id = ?
          GROUP BY SUBSTR(delivery_date, 1, 7)
          ORDER BY month DESC
        `).all(agentId);
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
          WHERE delivery_date >= ? AND delivery_date <= ? AND status = 'DELIVERED' AND agent_id = ?
          GROUP BY product_id, product_name_snapshot, variant_snapshot
          ORDER BY total_revenue DESC
        `).all(sDate, eDate, agentId);
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
          LEFT JOIN deliveries d ON c.id = d.customer_id AND d.delivery_date >= ? AND d.delivery_date <= ? AND d.status = 'DELIVERED' AND d.agent_id = ?
          WHERE c.agent_id = ?
          GROUP BY c.id
          ORDER BY total_bill_amount DESC
        `).all(sDate, eDate, agentId, agentId);
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
          WHERE p.payment_date >= ? AND p.payment_date <= ? AND p.agent_id = ?
          ORDER BY p.payment_date DESC
        `).all(sDate, eDate, agentId);
        break;

      case 'PENDING_PAYMENTS':
        title = `Pending_Payments_Report`;
        data = await db.prepare(`
          SELECT c.id, c.name, c.phone, c.address, c.customer_category, c.billing_type, c.route,
                 c.pending_balance, c.advance_balance
          FROM customers c
          WHERE c.pending_balance > 0 AND c.status = 'ACTIVE' AND c.agent_id = ?
          ORDER BY c.pending_balance DESC
        `).all(agentId);
        break;

      case 'ADVANCE_BALANCES':
        title = `Advance_Balances_Report`;
        data = await db.prepare(`
          SELECT c.id, c.name, c.phone, c.address, c.customer_category, c.billing_type, c.route,
                 c.advance_balance, c.pending_balance
          FROM customers c
          WHERE c.advance_balance > 0 AND c.status = 'ACTIVE' AND c.agent_id = ?
          ORDER BY c.advance_balance DESC
        `).all(agentId);
        break;

      case 'EXPENSES':
        title = `Expenses_Report_${sDate}_to_${eDate}`;
        data = await db.prepare(`
          SELECT expense_date, category, amount, payment_method, recipient_name, description
          FROM expenses
          WHERE expense_date >= ? AND expense_date <= ? AND agent_id = ?
          ORDER BY expense_date DESC
        `).all(sDate, eDate, agentId);
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

const {
  getKolkataDateString,
  generateDailyReportData,
  buildDailyReportHtml,
  sendDailyReportEmail,
  getEmailReportLogs
} = require('../services/emailReportService');

// Get automated daily email report configuration and audit logs
router.get('/daily-email/status', requireAdmin, async (req, res) => {
  try {
    const agentId = req.agentId || 1;
    const isConfigured = !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim() !== '');
    const logs = await getEmailReportLogs(15, agentId);

    res.json({
      isConfigured,
      recipientEmail: process.env.ADMIN_REPORT_EMAIL || '',
      senderEmail: process.env.RESEND_FROM_EMAIL || 'Nandini Milk Parlour <onboarding@resend.dev>',
      hasCronSecret: !!(process.env.CRON_SECRET && process.env.CRON_SECRET.trim() !== ''),
      scheduleTimeIst: '10:00 AM IST (04:30 UTC daily)',
      cronPath: '/api/cron/daily-delivery-report',
      todayKolkataDate: getKolkataDateString(),
      recentLogs: logs
    });
  } catch (err) {
    console.error('Failed to get email report status:', err);
    res.status(500).json({ error: 'Failed to retrieve email report status' });
  }
});

// Preview daily email report data and rendered HTML without sending
router.get('/daily-email/preview', requireAdmin, async (req, res) => {
  try {
    const agentId = req.agentId || 1;
    const targetDate = req.query.date || getKolkataDateString();
    const data = await generateDailyReportData(targetDate, agentId);
    const html = buildDailyReportHtml(data);

    res.json({
      targetDate,
      data,
      html
    });
  } catch (err) {
    console.error('Failed to generate report preview:', err);
    res.status(500).json({ error: 'Failed to generate email report preview' });
  }
});

// Admin test-send action to verify email delivery format
router.post('/daily-email/test', requireAdmin, async (req, res) => {
  try {
    const agentId = req.agentId || 1;
    const { date, recipientEmail } = req.body;
    const targetDate = date || getKolkataDateString();

    const result = await sendDailyReportEmail({
      targetDate,
      recipientEmail,
      triggerType: 'ADMIN_TEST',
      force: true,
      agentId
    });

    res.json(result);
  } catch (err) {
    console.error('Failed to execute test email send:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to send test email'
    });
  }
});

module.exports = router;
