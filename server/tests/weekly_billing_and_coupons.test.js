const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const db = require('../config/db');

const {
  issueCouponBook,
  deductCouponsForDelivery,
  revertCouponsForDelivery,
  adjustCouponBalance,
  getCustomerCouponDetails,
  getCouponMonthEndSummary
} = require('../services/couponService');

const {
  generateWeeklyBillForCustomer,
  generateWeeklyBillsForPeriod
} = require('../services/billingService');

async function runWeeklyAndCouponTests() {
  console.log('\n================================================================');
  console.log(' NANDINI MILK PARLOUR — WEEKLY BILLING & COUPON SYSTEM TESTS ');
  console.log('================================================================\n');

  // Clean test fixtures
  const TEST_PHONE = '9888877771';
  const prevCust = await db.prepare('SELECT id FROM customers WHERE phone = ?').get(TEST_PHONE);
  if (prevCust) {
    await db.prepare('DELETE FROM coupon_transactions WHERE customer_id = ?').run(prevCust.id);
    await db.prepare('DELETE FROM coupon_books WHERE customer_id = ?').run(prevCust.id);
    await db.prepare('DELETE FROM deliveries WHERE customer_id = ?').run(prevCust.id);
    await db.prepare('DELETE FROM payments WHERE customer_id = ?').run(prevCust.id);
    await db.prepare('DELETE FROM customer_ledger WHERE customer_id = ?').run(prevCust.id);
    await db.prepare('DELETE FROM customers WHERE id = ?').run(prevCust.id);
  }

  // Create test customer
  const custRes = await db.prepare(`
    INSERT INTO customers (
      name, phone, address, customer_category, billing_type,
      advance_balance, pending_balance, coupon_balance, agent_id,
      created_at, updated_at
    ) VALUES (
      'Coupon Test Customer', ?, 'Flat 401, Galaxy Enclave', 'HOUSE', 'COUPON',
      0.0, 0.0, 0, 1,
      datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run(TEST_PHONE);

  const customerId = custRes.lastInsertRowid;
  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  assert.strictEqual(customer.coupon_balance, 0, 'Initial coupon balance should be 0');
  console.log('[TEST 1] Created customer with COUPON billing type and 0 coupons ✓');

  // 1. Issue first coupon book: 30 coupons @ ₹750
  const book1 = await issueCouponBook({
    customerId,
    bookNumber: 'BK-TEST-001',
    totalCoupons: 30,
    pricePaid: 750,
    paymentMethod: 'UPI',
    issueDate: '2026-10-01',
    notes: 'Advance October coupon book'
  });

  assert.strictEqual(book1.book.total_coupons, 30);
  assert.strictEqual(book1.book.remaining_coupons, 30);
  assert.strictEqual(book1.newCouponBalance, 30);

  const custAfterBook1 = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  assert.strictEqual(custAfterBook1.coupon_balance, 30, 'Customer coupon balance should now be 30');

  // Verify advance payment receipt was created
  const payment = await db.prepare('SELECT * FROM payments WHERE customer_id = ? AND reference_number = ?').get(customerId, 'BK-TEST-001');
  assert.ok(payment, 'Payment receipt for coupon purchase must be recorded');
  assert.strictEqual(payment.amount, 750);
  console.log('[TEST 2] Issued 30-coupon book, credited coupon balance, and recorded ₹750 receipt ✓');

  // 2. Simulate deliveries and verify coupon deduction
  const testProd = await db.prepare('SELECT id, name FROM products LIMIT 1').get();
  const delInsert = await db.prepare(`
    INSERT INTO deliveries (
      customer_id, delivery_date, product_id, product_name_snapshot,
      category_snapshot, variant_snapshot, unit_volume_litres_snapshot,
      quantity, unit_price_snapshot, total_product_amount,
      delivery_charge_snapshot, total_amount, status, agent_id,
      created_at, updated_at
    ) VALUES (
      ?, '2026-10-02', ?, ?,
      'MILK', '500ml', 0.5,
      2, 26.50, 53.00,
      2.00, 55.00, 'DELIVERED', 1,
      datetime('now'), datetime('now')
    )
  `).run(customerId, testProd.id, testProd.name);

  const mockDelivery = await db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delInsert.lastInsertRowid);

  const deductRes = await deductCouponsForDelivery(mockDelivery);
  assert.strictEqual(deductRes.deducted, 2);
  assert.strictEqual(deductRes.balanceAfter, 28);

  const custAfterDel = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  assert.strictEqual(custAfterDel.coupon_balance, 28, 'Customer coupon balance should now be 28');

  const bookAfterDel = await db.prepare('SELECT * FROM coupon_books WHERE id = ?').get(book1.book.id);
  assert.strictEqual(bookAfterDel.used_coupons, 2);
  assert.strictEqual(bookAfterDel.remaining_coupons, 28);
  console.log('[TEST 3] Delivery of 2 packets successfully deducted 2 coupons (30 -> 28) ✓');

  // 3. Simulate delivery revert (e.g. delivery boy marked skipped or cancelled)
  const revertRes = await revertCouponsForDelivery(mockDelivery.id);
  assert.strictEqual(revertRes.restored, 2);
  assert.strictEqual(revertRes.balanceAfter, 30);

  const custAfterRevert = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  assert.strictEqual(custAfterRevert.coupon_balance, 30, 'Customer coupon balance should be restored to 30');
  console.log('[TEST 4] Reverting delivery successfully restored coupons back to 30 ✓');

  // 4. Add a new coupon book (Top-up)
  const book2 = await issueCouponBook({
    customerId,
    bookNumber: 'BK-TEST-002',
    totalCoupons: 50,
    pricePaid: 1250,
    paymentMethod: 'CASH',
    issueDate: '2026-10-15',
    notes: 'Mid-month second book'
  });

  assert.strictEqual(book2.book.total_coupons, 50);
  assert.strictEqual(book2.newCouponBalance, 80, '30 remaining + 50 new = 80 coupons total');

  const custAfterBook2 = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  assert.strictEqual(custAfterBook2.coupon_balance, 80);
  console.log('[TEST 5] Adding second coupon book (50 coupons) topped up customer balance to 80 ✓');

  // 5. Test getCustomerCouponDetails
  const details = await getCustomerCouponDetails(customerId);
  assert.strictEqual(details.summary.totalBooks, 2);
  assert.strictEqual(details.summary.totalCouponsIssued, 80);
  assert.strictEqual(details.summary.remainingCoupons, 80);
  console.log('[TEST 6] Customer coupon profile correctly aggregates active books and transactions ✓');

  // 6. Test Month-End Summary Report
  const summaryReport = await getCouponMonthEndSummary(1, '2026-10');
  const foundCust = summaryReport.report.find(r => r.customerId === customerId);
  assert.ok(foundCust, 'Customer should be present in month-end summary report');
  assert.strictEqual(foundCust.remainingCoupons, 80);
  assert.strictEqual(foundCust.totalBooks, 2);
  console.log('[TEST 7] Month-end report accurately displays leftover coupons and customer balances ✓');

  // ================================================================
  // WEEKLY BILLING TESTS
  // ================================================================
  const WEEKLY_PHONE = '9888877772';
  await db.prepare('DELETE FROM customers WHERE phone = ?').run(WEEKLY_PHONE);

  const weeklyCustRes = await db.prepare(`
    INSERT INTO customers (
      name, phone, address, customer_category, billing_type,
      advance_balance, pending_balance, agent_id,
      created_at, updated_at
    ) VALUES (
      'Weekly Test Customer', ?, 'Villa 12, Palm Meadows', 'HOUSE', 'WEEKLY',
      100.0, 0.0, 1,
      datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run(WEEKLY_PHONE);

  const weeklyCustId = weeklyCustRes.lastInsertRowid;
  const weeklyCust = await db.prepare('SELECT * FROM customers WHERE id = ?').get(weeklyCustId);

  // Add mock product
  let product = await db.prepare('SELECT * FROM products LIMIT 1').get();
  if (!product) {
    const pRes = await db.prepare(`
      INSERT INTO products (name, category, variant_label, selling_price, agent_id, created_at, updated_at)
      VALUES ('Special Toned Milk 500ml', 'MILK', '500ml', 26.50, 1, datetime('now'), datetime('now'))
    `).run();
    product = await db.prepare('SELECT * FROM products WHERE id = ?').get(pRes.lastInsertRowid);
  }

  // Insert 7 delivered deliveries for the week (2026-10-12 to 2026-10-18)
  const startDate = '2026-10-12';
  const endDate = '2026-10-18';
  for (let d = 12; d <= 18; d++) {
    const dateStr = `2026-10-${d.toString().padStart(2, '0')}`;
    await db.prepare(`
      INSERT OR REPLACE INTO deliveries (
        customer_id, delivery_date, product_id, product_name_snapshot,
        category_snapshot, variant_snapshot, unit_volume_litres_snapshot,
        quantity, unit_price_snapshot, total_product_amount,
        delivery_charge_snapshot, total_amount, status, agent_id,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        'MILK', '500ml', 0.5,
        2, 26.50, 53.00,
        2.00, 55.00, 'DELIVERED', 1,
        datetime('now'), datetime('now')
      )
    `).run(weeklyCustId, dateStr, product.id, product.name);
  }

  // Generate Weekly Bill
  const weeklyBill = await generateWeeklyBillForCustomer(weeklyCust, startDate, endDate, true);
  assert.ok(weeklyBill, 'Weekly bill must be generated');
  assert.strictEqual(weeklyBill.billing_type, 'WEEKLY');
  assert.strictEqual(weeklyBill.total_deliveries_count, 7);
  // 7 days * ₹53 product subtotal = ₹371.00
  assert.strictEqual(weeklyBill.product_subtotal, 371);
  // 7 days * ₹2 delivery charges = ₹14.00
  assert.strictEqual(weeklyBill.delivery_charges_total, 14);
  // Gross = 371 + 14 = ₹385.00
  assert.strictEqual(weeklyBill.gross_amount, 385);
  // Customer had ₹100 advance -> adjusted ₹100 -> net payable = ₹285.00
  assert.strictEqual(weeklyBill.advance_adjusted, 100);
  assert.strictEqual(weeklyBill.net_payable, 285);
  assert.strictEqual(weeklyBill.start_date, startDate);
  assert.strictEqual(weeklyBill.end_date, endDate);
  assert.ok(weeklyBill.bill_number.startsWith('WB-'), 'Weekly bill number should start with WB-');

  const custAfterWeekly = await db.prepare('SELECT * FROM customers WHERE id = ?').get(weeklyCustId);
  assert.strictEqual(custAfterWeekly.advance_balance, 0, 'Advance balance should be exhausted to 0');
  assert.strictEqual(custAfterWeekly.pending_balance, 285, 'Pending balance should be ₹285.00');

  console.log('[TEST 8] Weekly Bill based on actual deliveries (7 days, Gross: ₹385, Advance Used: ₹100, Net: ₹285) verified! ✓');

  // Test batch weekly generation
  const batchRes = await generateWeeklyBillsForPeriod(startDate, endDate, { customerId: weeklyCustId, forceRegenerate: true });
  assert.strictEqual(batchRes.weeklyBillsGenerated, 1);
  assert.strictEqual(batchRes.totalGrossAmount, 385);
  console.log('[TEST 9] Batch weekly bill generation endpoint logic verified! ✓');

  // Clean test data
  await db.prepare('DELETE FROM bills WHERE customer_id IN (?, ?)').run(customerId, weeklyCustId);
  await db.prepare('DELETE FROM coupon_transactions WHERE customer_id = ?').run(customerId);
  await db.prepare('DELETE FROM coupon_books WHERE customer_id = ?').run(customerId);
  await db.prepare('DELETE FROM deliveries WHERE customer_id IN (?, ?)').run(customerId, weeklyCustId);
  await db.prepare('DELETE FROM payments WHERE customer_id IN (?, ?)').run(customerId, weeklyCustId);
  await db.prepare('DELETE FROM customer_ledger WHERE customer_id IN (?, ?)').run(customerId, weeklyCustId);
  await db.prepare('DELETE FROM customers WHERE id IN (?, ?)').run(customerId, weeklyCustId);

  console.log('\n================================================================');
  console.log(' ALL WEEKLY BILLING & COUPON SYSTEM TESTS PASSED! ✓');
  console.log('================================================================\n');
}

runWeeklyAndCouponTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
