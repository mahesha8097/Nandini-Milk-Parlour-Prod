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

    // Calculate start of current week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const distanceToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - distanceToMonday);
    const weekStartStr = getLocalDateString(monday);

    // 1. Top-Level / Today's Metrics
    const todayDeliveries = await db.prepare(`
      SELECT 
        COUNT(*) as total_deliveries,
        SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_deliveries,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_deliveries,
        SUM(CASE WHEN status = 'SKIPPED' THEN 1 ELSE 0 END) as skipped_deliveries,
        SUM(CASE WHEN status = 'DELIVERED' THEN total_amount ELSE 0 END) as today_sales_amount,
        SUM(CASE WHEN status = 'DELIVERED' AND (category_snapshot = 'Milk' OR product_name_snapshot LIKE '%Milk%') THEN (unit_volume_litres_snapshot * quantity) ELSE 0 END) as today_milk_quantity_litres,
        SUM(CASE WHEN status = 'DELIVERED' AND (category_snapshot = 'Curd' OR product_name_snapshot LIKE '%Curd%') THEN (unit_volume_litres_snapshot * quantity) ELSE 0 END) as today_curd_quantity_litres
      FROM deliveries
      WHERE delivery_date = ?
    `).get(today);

    // 2. Customer Summary
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
      WHERE status = 'ACTIVE'
    `).get();

    // 3. Payments Summary
    const todayPayments = await db.prepare(`
      SELECT 
        SUM(amount) as today_collection,
        SUM(CASE WHEN payment_type = 'ADVANCE_PAYMENT' THEN amount ELSE 0 END) as today_advance_collection,
        SUM(CASE WHEN payment_type = 'POSTPAID_BILL_PAYMENT' THEN amount ELSE 0 END) as today_postpaid_collection
      FROM payments
      WHERE payment_date = ?
    `).get(today);

    const monthPayments = await db.prepare(`
      SELECT SUM(amount) as month_collection
      FROM payments
      WHERE payment_date LIKE ?
    `).get(`${currentMonth}%`);

    // 4. Expenses Summary
    const todayExpenses = await db.prepare(`
      SELECT SUM(amount) as today_expense FROM expenses WHERE expense_date = ?
    `).get(today);

    const monthExpenses = await db.prepare(`
      SELECT SUM(amount) as month_expense FROM expenses WHERE expense_date LIKE ?
    `).get(`${currentMonth}%`);

    // 5. Active Delivery Boys count
    const activeDboys = await db.prepare(`
      SELECT COUNT(*) as count FROM users WHERE role = 'DELIVERY_BOY' AND is_active = 1
    `).get();

    // 6. Sales Overview by Periods (Today, This Week, This Month)
    const weekSales = await db.prepare(`
      SELECT 
        SUM(total_amount) as total_amount,
        SUM(CASE WHEN category_snapshot = 'Milk' OR product_name_snapshot LIKE '%Milk%' THEN (unit_volume_litres_snapshot * quantity) ELSE 0 END) as milk_litres,
        SUM(CASE WHEN category_snapshot = 'Curd' OR product_name_snapshot LIKE '%Curd%' THEN (unit_volume_litres_snapshot * quantity) ELSE 0 END) as curd_litres,
        SUM(CASE WHEN category_snapshot NOT IN ('Milk', 'Curd') AND product_name_snapshot NOT LIKE '%Milk%' AND product_name_snapshot NOT LIKE '%Curd%' THEN total_amount ELSE 0 END) as other_sales_amount
      FROM deliveries
      WHERE delivery_date >= ? AND delivery_date <= ? AND status = 'DELIVERED'
    `).get(weekStartStr, today);

    const monthSales = await db.prepare(`
      SELECT 
        SUM(total_amount) as total_amount,
        SUM(CASE WHEN category_snapshot = 'Milk' OR product_name_snapshot LIKE '%Milk%' THEN (unit_volume_litres_snapshot * quantity) ELSE 0 END) as milk_litres,
        SUM(CASE WHEN category_snapshot = 'Curd' OR product_name_snapshot LIKE '%Curd%' THEN (unit_volume_litres_snapshot * quantity) ELSE 0 END) as curd_litres,
        SUM(CASE WHEN category_snapshot NOT IN ('Milk', 'Curd') AND product_name_snapshot NOT LIKE '%Milk%' AND product_name_snapshot NOT LIKE '%Curd%' THEN total_amount ELSE 0 END) as other_sales_amount
      FROM deliveries
      WHERE delivery_date LIKE ? AND status = 'DELIVERED'
    `).get(`${currentMonth}%`);

    // 7. Recent Activity (Latest 10 deliveries, payments, or bills)
    const recentDeliveries = await db.prepare(`
      SELECT d.*, c.name as customer_name
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      ORDER BY d.id DESC
      LIMIT 8
    `).all();

    const recentPayments = await db.prepare(`
      SELECT p.*, c.name as customer_name
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      ORDER BY p.id DESC
      LIMIT 5
    `).all();

    res.json({
      todayOverview: {
        todaySales: todayDeliveries?.today_sales_amount || 0,
        todayMilkLitres: todayDeliveries?.today_milk_quantity_litres || 0,
        todayCurdLitres: todayDeliveries?.today_curd_quantity_litres || 0,
        totalDeliveries: todayDeliveries?.total_deliveries || 0,
        completedDeliveries: todayDeliveries?.completed_deliveries || 0,
        pendingDeliveries: todayDeliveries?.pending_deliveries || 0,
        skippedDeliveries: todayDeliveries?.skipped_deliveries || 0,
        todayCollection: todayPayments?.today_collection || 0,
        todayExpense: todayExpenses?.today_expense || 0
      },
      customerOverview: {
        totalCustomers: customerStats?.total_customers || 0,
        houseCustomers: customerStats?.total_house_customers || 0,
        bulkCustomers: customerStats?.total_bulk_customers || 0,
        prepaidCustomers: customerStats?.prepaid_customers || 0,
        postpaidCustomers: customerStats?.postpaid_customers || 0,
        totalAdvanceBalance: customerStats?.total_advance_balance || 0,
        totalPendingBalance: customerStats?.total_pending_balance || 0,
        customersWithPending: customerStats?.customers_with_pending || 0
      },
      paymentOverview: {
        todayCollection: todayPayments?.today_collection || 0,
        todayAdvance: todayPayments?.today_advance_collection || 0,
        todayPostpaid: todayPayments?.today_postpaid_collection || 0,
        monthCollection: monthPayments?.month_collection || 0,
        pendingAmount: customerStats?.total_pending_balance || 0,
        advanceBalance: customerStats?.total_advance_balance || 0
      },
      expenseOverview: {
        todayExpenses: todayExpenses?.today_expense || 0,
        monthExpenses: monthExpenses?.month_expense || 0
      },
      salesPeriods: {
        today: {
          totalSales: todayDeliveries?.today_sales_amount || 0,
          milkLitres: todayDeliveries?.today_milk_quantity_litres || 0,
          curdLitres: todayDeliveries?.today_curd_quantity_litres || 0
        },
        week: {
          totalSales: weekSales?.total_amount || 0,
          milkLitres: weekSales?.milk_litres || 0,
          curdLitres: weekSales?.curd_litres || 0,
          otherSales: weekSales?.other_sales_amount || 0
        },
        month: {
          totalSales: monthSales?.total_amount || 0,
          milkLitres: monthSales?.milk_litres || 0,
          curdLitres: monthSales?.curd_litres || 0,
          otherSales: monthSales?.other_sales_amount || 0
        }
      },
      activeDeliveryBoysCount: activeDboys?.count || 0,
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
