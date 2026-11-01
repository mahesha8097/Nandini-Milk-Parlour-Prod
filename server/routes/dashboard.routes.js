const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const { getLocalDateString } = require('../utils/dateUtils');

// Get real-time Dashboard statistics (Admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const today = getLocalDateString();
    const currentMonth = today.slice(0, 7);
    const agentId = req.agentId || 1;

    // Calculate start of current week (Monday in local IST time)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMonday);
    const weekStartStr = getLocalDateString(monday);

    // 1. Deliveries & Sales Metrics across Daily, Weekly, Monthly
    const dayDeliveries = await db.prepare(`
      SELECT 
        COUNT(*) as total_deliveries,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_deliveries,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_deliveries,
        SUM(CASE WHEN status = 'SKIPPED' THEN 1 ELSE 0 END) as skipped_deliveries,
        SUM(CASE WHEN status = 'DELIVERED' THEN total_amount ELSE 0 END) as sales_amount,
        SUM(CASE WHEN status = 'DELIVERED' AND (category_snapshot = 'Milk' OR product_name_snapshot LIKE '%Milk%') THEN (unit_volume_litres_snapshot * quantity) ELSE 0 END) as milk_quantity_litres,
        SUM(CASE WHEN status = 'DELIVERED' AND (category_snapshot = 'Curd' OR product_name_snapshot LIKE '%Curd%') THEN (unit_volume_litres_snapshot * quantity) ELSE 0 END) as curd_quantity_litres,
        SUM(CASE WHEN status = 'DELIVERED' AND category_snapshot NOT IN ('Milk', 'Curd') AND product_name_snapshot NOT LIKE '%Milk%' AND product_name_snapshot NOT LIKE '%Curd%' THEN total_amount ELSE 0 END) as other_sales_amount
      FROM deliveries
      WHERE delivery_date = ? AND COALESCE(agent_id, 1) = ?
    `).get(today, agentId);

    const weekDeliveries = await db.prepare(`
      SELECT 
        COUNT(*) as total_deliveries,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_deliveries,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_deliveries,
        SUM(CASE WHEN status = 'SKIPPED' THEN 1 ELSE 0 END) as skipped_deliveries,
        SUM(CASE WHEN status = 'DELIVERED' THEN total_amount ELSE 0 END) as sales_amount,
        SUM(CASE WHEN status = 'DELIVERED' AND (category_snapshot = 'Milk' OR product_name_snapshot LIKE '%Milk%') THEN (unit_volume_litres_snapshot * quantity) ELSE 0 END) as milk_quantity_litres,
        SUM(CASE WHEN status = 'DELIVERED' AND (category_snapshot = 'Curd' OR product_name_snapshot LIKE '%Curd%') THEN (unit_volume_litres_snapshot * quantity) ELSE 0 END) as curd_quantity_litres,
        SUM(CASE WHEN status = 'DELIVERED' AND category_snapshot NOT IN ('Milk', 'Curd') AND product_name_snapshot NOT LIKE '%Milk%' AND product_name_snapshot NOT LIKE '%Curd%' THEN total_amount ELSE 0 END) as other_sales_amount
      FROM deliveries
      WHERE delivery_date >= ? AND delivery_date <= ? AND COALESCE(agent_id, 1) = ?
    `).get(weekStartStr, today, agentId);

    const monthDeliveries = await db.prepare(`
      SELECT 
        COUNT(*) as total_deliveries,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_deliveries,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_deliveries,
        SUM(CASE WHEN status = 'SKIPPED' THEN 1 ELSE 0 END) as skipped_deliveries,
        SUM(CASE WHEN status = 'DELIVERED' THEN total_amount ELSE 0 END) as sales_amount,
        SUM(CASE WHEN status = 'DELIVERED' AND (category_snapshot = 'Milk' OR product_name_snapshot LIKE '%Milk%') THEN (unit_volume_litres_snapshot * quantity) ELSE 0 END) as milk_quantity_litres,
        SUM(CASE WHEN status = 'DELIVERED' AND (category_snapshot = 'Curd' OR product_name_snapshot LIKE '%Curd%') THEN (unit_volume_litres_snapshot * quantity) ELSE 0 END) as curd_quantity_litres,
        SUM(CASE WHEN status = 'DELIVERED' AND category_snapshot NOT IN ('Milk', 'Curd') AND product_name_snapshot NOT LIKE '%Milk%' AND product_name_snapshot NOT LIKE '%Curd%' THEN total_amount ELSE 0 END) as other_sales_amount
      FROM deliveries
      WHERE delivery_date LIKE ? AND COALESCE(agent_id, 1) = ?
    `).get(`${currentMonth}%`, agentId);

    // 2. Customer Summary (Active Customers standing balance)
    const customerStats = await db.prepare(`
      SELECT
        COUNT(*) as total_customers,
        SUM(CASE WHEN customer_category = 'HOUSE' THEN 1 ELSE 0 END) as total_house_customers,
        SUM(CASE WHEN customer_category = 'BULK_HOTEL' THEN 1 ELSE 0 END) as total_bulk_customers,
        SUM(CASE WHEN billing_type = 'PREPAID' THEN 1 ELSE 0 END) as prepaid_customers,
        SUM(CASE WHEN billing_type = 'POSTPAID' THEN 1 ELSE 0 END) as postpaid_customers,
        SUM(advance_balance) as total_advance_balance,
        SUM(pending_balance) as total_pending_balance,
        SUM(CASE WHEN pending_balance > 0 THEN 1 ELSE 0 END) as customers_with_pending
      FROM customers
      WHERE status = 'ACTIVE' AND COALESCE(agent_id, 1) = ?
    `).get(agentId);

    // 3. Payments Collections across Daily, Weekly, Monthly
    const dayPayments = await db.prepare(`
      SELECT 
        SUM(amount) as total_collection,
        SUM(CASE WHEN payment_type = 'ADVANCE_PAYMENT' THEN amount ELSE 0 END) as advance_collection,
        SUM(CASE WHEN payment_type = 'POSTPAID_BILL_PAYMENT' THEN amount ELSE 0 END) as postpaid_collection,
        SUM(CASE WHEN payment_type = 'DIRECT_PAYMENT' THEN amount ELSE 0 END) as direct_collection
      FROM payments
      WHERE payment_date = ? AND COALESCE(agent_id, 1) = ? AND (is_deleted = 0 OR is_deleted IS NULL)
    `).get(today, agentId);

    const weekPayments = await db.prepare(`
      SELECT 
        SUM(amount) as total_collection,
        SUM(CASE WHEN payment_type = 'ADVANCE_PAYMENT' THEN amount ELSE 0 END) as advance_collection,
        SUM(CASE WHEN payment_type = 'POSTPAID_BILL_PAYMENT' THEN amount ELSE 0 END) as postpaid_collection,
        SUM(CASE WHEN payment_type = 'DIRECT_PAYMENT' THEN amount ELSE 0 END) as direct_collection
      FROM payments
      WHERE payment_date >= ? AND payment_date <= ? AND COALESCE(agent_id, 1) = ? AND (is_deleted = 0 OR is_deleted IS NULL)
    `).get(weekStartStr, today, agentId);

    const monthPayments = await db.prepare(`
      SELECT 
        SUM(amount) as total_collection,
        SUM(CASE WHEN payment_type = 'ADVANCE_PAYMENT' THEN amount ELSE 0 END) as advance_collection,
        SUM(CASE WHEN payment_type = 'POSTPAID_BILL_PAYMENT' THEN amount ELSE 0 END) as postpaid_collection,
        SUM(CASE WHEN payment_type = 'DIRECT_PAYMENT' THEN amount ELSE 0 END) as direct_collection
      FROM payments
      WHERE payment_date LIKE ? AND COALESCE(agent_id, 1) = ? AND (is_deleted = 0 OR is_deleted IS NULL)
    `).get(`${currentMonth}%`, agentId);

    // 4. Expenses across Daily, Weekly, Monthly
    const dayExpenses = await db.prepare(`
      SELECT SUM(amount) as total_expense FROM expenses WHERE expense_date = ? AND COALESCE(agent_id, 1) = ?
    `).get(today, agentId);

    const weekExpenses = await db.prepare(`
      SELECT SUM(amount) as total_expense FROM expenses WHERE expense_date >= ? AND expense_date <= ? AND COALESCE(agent_id, 1) = ?
    `).get(weekStartStr, today, agentId);

    const monthExpenses = await db.prepare(`
      SELECT SUM(amount) as total_expense FROM expenses WHERE expense_date LIKE ? AND COALESCE(agent_id, 1) = ?
    `).get(`${currentMonth}%`, agentId);

    // 5. Active Delivery Boys count
    const activeDboys = await db.prepare(`
      SELECT COUNT(*) as count FROM users WHERE role = 'DELIVERY_BOY' AND is_active = 1 AND COALESCE(agent_id, 1) = ?
    `).get(agentId);

    // 6. Recent Activity (Latest deliveries & payments)
    const recentDeliveries = await db.prepare(`
      SELECT d.*, c.name as customer_name
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      WHERE COALESCE(d.agent_id, 1) = ?
      ORDER BY d.id DESC
      LIMIT 8
    `).all(agentId);

    const recentPayments = await db.prepare(`
      SELECT p.*, c.name as customer_name
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      WHERE COALESCE(p.agent_id, 1) = ? AND (p.is_deleted = 0 OR p.is_deleted IS NULL)
      ORDER BY p.id DESC
      LIMIT 5
    `).all(agentId);

    // Helper to package period stats cleanly
    const buildPeriodStats = (label, dateRange, del, pay, exp) => {
      const totalDel = Number(del?.total_deliveries) || 0;
      const compDel = Number(del?.completed_deliveries) || 0;
      const pendDel = Number(del?.pending_deliveries) || 0;
      const skipDel = Number(del?.skipped_deliveries) || 0;
      const rate = totalDel > 0 ? parseFloat(((compDel / totalDel) * 100).toFixed(1)) : 0;
      const totalSales = Number(del?.sales_amount) || 0;
      const milkLitres = Number(del?.milk_quantity_litres) || 0;
      const curdLitres = Number(del?.curd_quantity_litres) || 0;
      const otherSales = Number(del?.other_sales_amount) || 0;
      const totalCollection = Number(pay?.total_collection) || 0;
      const advanceCollection = Number(pay?.advance_collection) || 0;
      const postpaidCollection = Number(pay?.postpaid_collection) || 0;
      const directCollection = Number(pay?.direct_collection) || 0;
      const totalExpense = Number(exp?.total_expense) || 0;
      const netCashflow = totalCollection - totalExpense;

      return {
        label,
        dateRange,
        sales: totalSales,
        milkLitres: parseFloat(milkLitres.toFixed(2)),
        curdLitres: parseFloat(curdLitres.toFixed(2)),
        otherSales: parseFloat(otherSales.toFixed(2)),
        totalDeliveries: totalDel,
        completedDeliveries: compDel,
        pendingDeliveries: pendDel,
        skippedDeliveries: skipDel,
        deliverySuccessRate: rate,
        totalCollection,
        advanceCollection,
        postpaidCollection,
        directCollection,
        totalExpenses: totalExpense,
        netCashflow
      };
    };

    const dailyPeriod = buildPeriodStats('Daily (Today)', today, dayDeliveries, dayPayments, dayExpenses);
    const weeklyPeriod = buildPeriodStats('Weekly (This Week)', `${weekStartStr} to ${today}`, weekDeliveries, weekPayments, weekExpenses);
    const monthlyPeriod = buildPeriodStats('Monthly (This Month)', currentMonth, monthDeliveries, monthPayments, monthExpenses);

    res.json({
      // Backwards-compatible today overview
      todayOverview: {
        todaySales: dailyPeriod.sales,
        todayMilkLitres: dailyPeriod.milkLitres,
        todayCurdLitres: dailyPeriod.curdLitres,
        totalDeliveries: dailyPeriod.totalDeliveries,
        completedDeliveries: dailyPeriod.completedDeliveries,
        pendingDeliveries: dailyPeriod.pendingDeliveries,
        skippedDeliveries: dailyPeriod.skippedDeliveries,
        todayCollection: dailyPeriod.totalCollection,
        todayExpense: dailyPeriod.totalExpenses
      },
      customerOverview: {
        totalCustomers: Number(customerStats?.total_customers) || 0,
        houseCustomers: Number(customerStats?.total_house_customers) || 0,
        bulkCustomers: Number(customerStats?.total_bulk_customers) || 0,
        prepaidCustomers: Number(customerStats?.prepaid_customers) || 0,
        postpaidCustomers: Number(customerStats?.postpaid_customers) || 0,
        totalAdvanceBalance: Number(customerStats?.total_advance_balance) || 0,
        totalPendingBalance: Number(customerStats?.total_pending_balance) || 0,
        customersWithPending: Number(customerStats?.customers_with_pending) || 0
      },
      paymentOverview: {
        todayCollection: dailyPeriod.totalCollection,
        todayAdvance: dailyPeriod.advanceCollection,
        todayPostpaid: dailyPeriod.postpaidCollection,
        monthCollection: monthlyPeriod.totalCollection,
        pendingAmount: Number(customerStats?.total_pending_balance) || 0,
        advanceBalance: Number(customerStats?.total_advance_balance) || 0
      },
      expenseOverview: {
        todayExpenses: dailyPeriod.totalExpenses,
        monthExpenses: monthlyPeriod.totalExpenses
      },
      salesPeriods: {
        today: {
          totalSales: dailyPeriod.sales,
          milkLitres: dailyPeriod.milkLitres,
          curdLitres: dailyPeriod.curdLitres,
          otherSales: dailyPeriod.otherSales
        },
        week: {
          totalSales: weeklyPeriod.sales,
          milkLitres: weeklyPeriod.milkLitres,
          curdLitres: weeklyPeriod.curdLitres,
          otherSales: weeklyPeriod.otherSales
        },
        month: {
          totalSales: monthlyPeriod.sales,
          milkLitres: monthlyPeriod.milkLitres,
          curdLitres: monthlyPeriod.curdLitres,
          otherSales: monthlyPeriod.otherSales
        }
      },
      // New complete daily, weekly, monthly section data
      periods: {
        daily: dailyPeriod,
        weekly: weeklyPeriod,
        monthly: monthlyPeriod
      },
      activeDeliveryBoysCount: Number(activeDboys?.count) || 0,
      recentActivity: {
        deliveries: recentDeliveries,
        payments: recentPayments
      }
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

module.exports = router;
