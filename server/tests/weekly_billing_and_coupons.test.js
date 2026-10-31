const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const db = require('../config/db');

const {
  issueCouponBook,
  updateCouponBook,
  deductCouponsForDelivery,
  revertCouponsForDelivery,
  adjustCouponBalance,
  getCustomerCouponDetails,
  getCouponMonthEndSummary,
  syncCouponsForDelivery
} = require('../services/couponService');

const {
  generateWeeklyBillForCustomer,
  generateWeeklyBillsForPeriod
} = require('../services/billingService');

const { calculateDeliveryChargesForCustomerDay } = require('../services/deliveryChargeService');

async function runWeeklyAndCouponTests() {
  console.log('\n================================================================');
  console.log(' NANDINI MILK PARLOUR — WEEKLY BILLING & COUPON SYSTEM TESTS ');
  console.log('================================================================\n');

  // Clean test fixtures
  const TEST_PHONE = '9888877779';
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
  assert.strictEqual(foundCust.usedThisMonth, 0, 'Reverted delivery should result in 0 net coupons used this month');
  assert.strictEqual(foundCust.totalCouponsUsed, 0, 'Reverted delivery should result in 0 net total coupons used');
  console.log('[TEST 7] Month-end report accurately displays leftover coupons and nets out reverted deliveries ✓');

  // 6b. Test Multi-day deliveries with custom quantities (5 pkts Day 1 + 4 pkts Day 2 = exactly 9 coupons deducted)
  const d1Res = await db.prepare(`
    INSERT INTO deliveries (
      customer_id, delivery_date, product_id, product_name_snapshot,
      category_snapshot, variant_snapshot, unit_volume_litres_snapshot,
      quantity, unit_price_snapshot, total_product_amount,
      delivery_charge_snapshot, total_amount, status, agent_id,
      created_at, updated_at
    ) VALUES (
      ?, '2026-10-22', ?, ?,
      'MILK', '500ml', 0.5,
      5, 26.50, 132.50,
      3.00, 135.50, 'DELIVERED', 1,
      datetime('now'), datetime('now')
    )
  `).run(customerId, testProd.id, testProd.name);

  const d2Res = await db.prepare(`
    INSERT INTO deliveries (
      customer_id, delivery_date, product_id, product_name_snapshot,
      category_snapshot, variant_snapshot, unit_volume_litres_snapshot,
      quantity, unit_price_snapshot, total_product_amount,
      delivery_charge_snapshot, total_amount, status, agent_id,
      created_at, updated_at
    ) VALUES (
      ?, '2026-10-23', ?, ?,
      'MILK', '500ml', 0.5,
      4, 26.50, 106.00,
      3.00, 109.00, 'DELIVERED', 1,
      datetime('now'), datetime('now')
    )
  `).run(customerId, testProd.id, testProd.name);

  await syncCouponsForDelivery(d1Res.lastInsertRowid);
  await syncCouponsForDelivery(d2Res.lastInsertRowid);

  const reportAfter9 = await getCouponMonthEndSummary(1, '2026-10');
  const custAfter9 = reportAfter9.report.find(r => r.customerId === customerId);
  assert.strictEqual(custAfter9.usedThisMonth, 9, '5 pkts Day 1 + 4 pkts Day 2 must strictly deduct exactly 9 coupons');
  assert.strictEqual(custAfter9.remainingCoupons, 71, '80 - 9 = 71 remaining coupons');
  console.log('[TEST 7b] Multi-day deliveries with custom quantities (5 pkts + 4 pkts = 9 pkts) accurately deducted exactly 9 coupons ✓');

  // ================================================================
  // WEEKLY BILLING TESTS
  // ================================================================
  const WEEKLY_PHONE = '9888877772';
  const oldWeeklyCust = await db.prepare('SELECT id FROM customers WHERE phone = ?').get(WEEKLY_PHONE);
  if (oldWeeklyCust) {
    await db.prepare('DELETE FROM bills WHERE customer_id = ?').run(oldWeeklyCust.id);
    await db.prepare('DELETE FROM deliveries WHERE customer_id = ?').run(oldWeeklyCust.id);
    await db.prepare('DELETE FROM payments WHERE customer_id = ?').run(oldWeeklyCust.id);
    await db.prepare('DELETE FROM customer_ledger WHERE customer_id = ?').run(oldWeeklyCust.id);
    await db.prepare('DELETE FROM coupon_transactions WHERE customer_id = ?').run(oldWeeklyCust.id);
    await db.prepare('DELETE FROM coupon_books WHERE customer_id = ?').run(oldWeeklyCust.id);
    await db.prepare('DELETE FROM customers WHERE id = ?').run(oldWeeklyCust.id);
  }

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

  // -------------------------------------------------------------
  // Multi-Product Coupons & Book Editing Tests
  // -------------------------------------------------------------
  const prods = await db.prepare('SELECT id, name FROM products ORDER BY id ASC LIMIT 2').all();
  const prodA = prods[0];
  const prodB = prods[1];

  // Create a dedicated customer for multi-product coupon testing
  const multiCustInsert = await db.prepare(`
    INSERT INTO customers (
      name, phone, address, customer_category, billing_type,
      advance_balance, pending_balance, coupon_balance, agent_id,
      created_at, updated_at
    ) VALUES (
      'Multi-Coupon Customer', '9988776655', 'Flat 401, Sapphire Block', 'HOUSE', 'COUPON',
      0.0, 0.0, 0, 1,
      datetime('now'), datetime('now')
    )
  `).run();
  const multiCustId = multiCustInsert.lastInsertRowid;

  // Issue Book A for Product A (30 coupons)
  const bookA = await issueCouponBook({
    customerId: multiCustId,
    productId: prodA.id,
    bookNumber: 'BK-PROD-A',
    totalCoupons: 30,
    pricePaid: 750,
    paymentMethod: 'UPI'
  });

  // Issue Book B for Product B (15 coupons)
  const bookB = await issueCouponBook({
    customerId: multiCustId,
    productId: prodB.id,
    bookNumber: 'BK-PROD-B',
    totalCoupons: 15,
    pricePaid: 450,
    paymentMethod: 'CASH'
  });

  const custAfterTwoBooks = await db.prepare('SELECT coupon_balance FROM customers WHERE id = ?').get(multiCustId);
  assert.strictEqual(custAfterTwoBooks.coupon_balance, 45, '30 + 15 = 45 total coupons');

  // Deliver 2 packets of Product A
  const delAInsert = await db.prepare(`
    INSERT INTO deliveries (
      customer_id, delivery_date, product_id, product_name_snapshot,
      category_snapshot, variant_snapshot, unit_volume_litres_snapshot,
      quantity, unit_price_snapshot, total_product_amount,
      delivery_charge_snapshot, total_amount, status, agent_id,
      created_at, updated_at
    ) VALUES (
      ?, '2026-10-18', ?, ?,
      'MILK', '500ml', 0.5,
      2, 25.0, 50.0,
      2.0, 52.0, 'DELIVERED', 1,
      datetime('now'), datetime('now')
    )
  `).run(multiCustId, prodA.id, prodA.name);
  const delA = await db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delAInsert.lastInsertRowid);

  const deductARes = await deductCouponsForDelivery(delA);
  assert.strictEqual(deductARes.deducted, 2);

  // Check that Book A was reduced to 28, but Book B is still 15!
  const bookACheck = await db.prepare('SELECT remaining_coupons FROM coupon_books WHERE id = ?').get(bookA.book.id);
  const bookBCheck = await db.prepare('SELECT remaining_coupons FROM coupon_books WHERE id = ?').get(bookB.book.id);
  assert.strictEqual(bookACheck.remaining_coupons, 28, 'Book A coupons should be 28');
  assert.strictEqual(bookBCheck.remaining_coupons, 15, 'Book B coupons should strictly remain 15');

  // Deliver 1 packet of Product B
  const delBInsert = await db.prepare(`
    INSERT INTO deliveries (
      customer_id, delivery_date, product_id, product_name_snapshot,
      category_snapshot, variant_snapshot, unit_volume_litres_snapshot,
      quantity, unit_price_snapshot, total_product_amount,
      delivery_charge_snapshot, total_amount, status, agent_id,
      created_at, updated_at
    ) VALUES (
      ?, '2026-10-18', ?, ?,
      'MILK', '500ml', 0.5,
      1, 30.0, 30.0,
      1.0, 31.0, 'DELIVERED', 1,
      datetime('now'), datetime('now')
    )
  `).run(multiCustId, prodB.id, prodB.name);
  const delB = await db.prepare('SELECT * FROM deliveries WHERE id = ?').get(delBInsert.lastInsertRowid);

  const deductBRes = await deductCouponsForDelivery(delB);
  assert.strictEqual(deductBRes.deducted, 1);

  const bookBCheck2 = await db.prepare('SELECT remaining_coupons FROM coupon_books WHERE id = ?').get(bookB.book.id);
  assert.strictEqual(bookBCheck2.remaining_coupons, 14, 'Book B coupons should now be 14');

  // Verify details return per-product breakdown
  const multiDetails = await getCustomerCouponDetails(multiCustId);
  assert.strictEqual(multiDetails.productBalances.length, 2, 'Customer should have 2 product balances');
  console.log('[TEST 10] Customer holding 2 different milk coupon books deducts product-specifically without cross-contamination ✓');

  // Test [TEST 11] Edit / Modify Coupon Book
  const editRes = await updateCouponBook({
    bookId: bookB.book.id,
    bookNumber: 'BK-PROD-B-MODIFIED',
    remainingCoupons: 20,
    pricePaid: 500,
    notes: 'Admin adjusted remaining to 20'
  });
  assert.strictEqual(editRes.book.book_number, 'BK-PROD-B-MODIFIED');
  assert.strictEqual(editRes.book.remaining_coupons, 20);
  // Total balance: Book A (28) + Book B (20) = 48
  assert.strictEqual(editRes.newCouponBalance, 48);

  // Test [TEST 12] Coupon Book issuance automatically includes bulk coupon milk delivery charges (₹1.50 per 500ml coupon)
  const prodAFull = await db.prepare('SELECT selling_price FROM products WHERE id = ?').get(prodA.id);
  const expectedDelPerUnit = 1.5;
  const expectedTotal = 30 * (parseFloat(prodAFull.selling_price) + expectedDelPerUnit);
  const bookDelChargeTest = await issueCouponBook({
    customerId: multiCustId,
    productId: prodA.id,
    bookNumber: 'BK-DEL-CHARGE-TEST',
    totalCoupons: 30
    // pricePaid is omitted so it defaults to (product price + coupon milk delivery charge) * coupons
  });
  assert.strictEqual(bookDelChargeTest.book.price_paid, expectedTotal, `Coupon book price must include ₹1.5/packet delivery charge (30 × ₹${parseFloat(prodAFull.selling_price) + 1.5} = ₹${expectedTotal})`);
  console.log('[TEST 12] Coupon Book issuance automatically includes ₹1.50/coupon delivery charge in payment ✓');

  // Test [TEST 13] Coupon-Eligible Product Separation: Non-coupon items (Curd, Ghee) NEVER deduct coupons
  const curdProd = await db.prepare(`
    INSERT INTO products (name, category, variant_label, selling_price, is_coupon_eligible, agent_id, created_at, updated_at)
    VALUES ('Special Curd Pkt', 'Curd', '500 g', 28.0, 0, 1, datetime('now'), datetime('now'))
  `).run();
  const curdProdId = curdProd.lastInsertRowid;

  // 1. Attempting to issue coupon book for non-eligible product must throw error
  let rejectedAsNonCoupon = false;
  try {
    await issueCouponBook({
      customerId: multiCustId,
      productId: curdProdId,
      totalCoupons: 10
    });
  } catch (err) {
    rejectedAsNonCoupon = true;
    assert(err.message.includes('not eligible for coupon books'), 'Error message must state product not eligible for coupons');
  }
  assert.strictEqual(rejectedAsNonCoupon, true, 'Issuing coupon book for Curd must be rejected');

  // 2. Customer current balance
  const custBeforeCurd = await db.prepare('SELECT coupon_balance FROM customers WHERE id = ?').get(multiCustId);
  const balBeforeCurd = custBeforeCurd.coupon_balance;

  // 3. Deliver Curd to coupon customer: MUST NOT deduct any coupons
  const curdDeliv = await db.prepare(`
    INSERT INTO deliveries (
      customer_id, delivery_date, product_id, product_name_snapshot, category_snapshot,
      variant_snapshot, unit_volume_litres_snapshot, quantity, unit_price_snapshot,
      total_product_amount, delivery_charge_snapshot, total_amount, status, created_at, updated_at
    ) VALUES (
      ?, '2026-10-25', ?, 'Special Curd Pkt', 'Curd',
      '500 g', 0.5, 3, 28.0,
      84.0, 0, 84.0, 'DELIVERED', datetime('now'), datetime('now')
    )
  `).run(multiCustId, curdProdId);

  await syncCouponsForDelivery(curdDeliv.lastInsertRowid);
  const custAfterCurd = await db.prepare('SELECT coupon_balance FROM customers WHERE id = ?').get(multiCustId);
  assert.strictEqual(custAfterCurd.coupon_balance, balBeforeCurd, 'Delivering Curd to a coupon customer must NEVER deduct coupons');

  // 4. Deliver Milk to the same customer: MUST deduct coupons strictly for milk
  const milkDeliv = await db.prepare(`
    INSERT INTO deliveries (
      customer_id, delivery_date, product_id, product_name_snapshot, category_snapshot,
      variant_snapshot, unit_volume_litres_snapshot, quantity, unit_price_snapshot,
      total_product_amount, delivery_charge_snapshot, total_amount, status, created_at, updated_at
    ) VALUES (
      ?, '2026-10-25', ?, 'Special Milk A', 'Milk',
      '500 ml', 0.5, 2, 27.0,
      54.0, 0, 54.0, 'DELIVERED', datetime('now'), datetime('now')
    )
  `).run(multiCustId, prodA.id);

  await syncCouponsForDelivery(milkDeliv.lastInsertRowid);
  const custAfterMilk = await db.prepare('SELECT coupon_balance FROM customers WHERE id = ?').get(multiCustId);
  assert.strictEqual(custAfterMilk.coupon_balance, balBeforeCurd - 2, 'Delivering 2 milk packets must deduct exactly 2 coupons');

  // 5. Skipping curd must NOT change balance
  await db.prepare("UPDATE deliveries SET status = 'SKIPPED' WHERE id = ?").run(curdDeliv.lastInsertRowid);
  await syncCouponsForDelivery(curdDeliv.lastInsertRowid);
  const custAfterCurdSkip = await db.prepare('SELECT coupon_balance FROM customers WHERE id = ?').get(multiCustId);
  assert.strictEqual(custAfterCurdSkip.coupon_balance, balBeforeCurd - 2, 'Skipping Curd must not alter coupon balance');

  // 6. Skipping milk restores milk coupons
  await db.prepare("UPDATE deliveries SET status = 'SKIPPED' WHERE id = ?").run(milkDeliv.lastInsertRowid);
  await syncCouponsForDelivery(milkDeliv.lastInsertRowid);
  const custAfterMilkSkip = await db.prepare('SELECT coupon_balance FROM customers WHERE id = ?').get(multiCustId);
  assert.strictEqual(custAfterMilkSkip.coupon_balance, balBeforeCurd, 'Skipping Milk must restore deducted coupons');

  console.log('[TEST 13] Separate Products for Coupon Books: Non-coupon items never deduct coupons, Milk deducts & restores perfectly ✓');

  // Test [TEST 14] Coupon System delivery charges: 1 coupon (500ml) = ₹1.50, 2 coupons (1L) = ₹3.00
  const couponItem1Pkt = [{
    productId: prodA.id,
    productName: 'Toned Milk',
    category: 'Milk',
    variantLabel: '500 ml',
    unitVolumeLitres: 0.5,
    quantity: 1,
    sellingPrice: 24.0,
    deliveryChargeType: 'MILK_RULE'
  }];
  const couponItem2Pkt = [{
    productId: prodA.id,
    productName: 'Toned Milk',
    category: 'Milk',
    variantLabel: '500 ml',
    unitVolumeLitres: 0.5,
    quantity: 2,
    sellingPrice: 24.0,
    deliveryChargeType: 'MILK_RULE'
  }];

  // For COUPON customer:
  const couponDeliv1 = calculateDeliveryChargesForCustomerDay('HOUSE', couponItem1Pkt, 'COUPON');
  assert.strictEqual(couponDeliv1[0].deliveryCharge, 1.5, '1 coupon (500ml) delivery charge must be ₹1.50');

  const couponDeliv2 = calculateDeliveryChargesForCustomerDay('HOUSE', couponItem2Pkt, 'COUPON');
  assert.strictEqual(couponDeliv2[0].deliveryCharge, 3.0, '2 coupons (1000ml) delivery charge must be ₹3.00');

  // For regular PREPAID/POSTPAID customer:
  const regularDeliv1 = calculateDeliveryChargesForCustomerDay('HOUSE', couponItem1Pkt, 'PREPAID');
  assert.strictEqual(regularDeliv1[0].deliveryCharge, 2.0, 'Regular 1 packet (500ml) delivery charge must remain ₹2.00');

  const regularDeliv2 = calculateDeliveryChargesForCustomerDay('HOUSE', couponItem2Pkt, 'PREPAID');
  assert.strictEqual(regularDeliv2[0].deliveryCharge, 3.0, 'Regular 2 packets (1000ml) delivery charge must remain ₹3.00');

  console.log('[TEST 14] Coupon Delivery Charge Rule (1 coupon = ₹1.50, 2 coupons = ₹3.00, regular = ₹2.00) verified! ✓');

  // [TEST 15] Leftover Physical Coupons (Pre-App, ₹0 Price)
  const leftoverCustRes = await db.prepare(`
    INSERT INTO customers (
      name, phone, address, customer_category, billing_type,
      advance_balance, pending_balance, coupon_balance, agent_id,
      created_at, updated_at
    ) VALUES (
      'Leftover Physical Coupon Customer', '9888877778', 'Flat 101, Test Enclave', 'HOUSE', 'COUPON',
      0.0, 0.0, 0, 1,
      datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run();
  const leftoverCustId = leftoverCustRes.lastInsertRowid;

  // Issue 15 leftover physical coupons with price = 0
  const leftoverBook = await issueCouponBook({
    customerId: leftoverCustId,
    totalCoupons: 15,
    isLeftover: true,
    pricePaid: 0,
    notes: 'Existing physical coupons held prior to app creation'
  });

  assert.strictEqual(leftoverBook.book.price_paid, 0, 'Leftover coupon book price must be ₹0.00');
  assert.strictEqual(leftoverBook.book.remaining_coupons, 15, 'Leftover book must have 15 remaining coupons');

  const leftoverCustAfterIssue = await db.prepare('SELECT * FROM customers WHERE id = ?').get(leftoverCustId);
  assert.strictEqual(leftoverCustAfterIssue.coupon_balance, 15, 'Customer coupon balance must be 15');

  // Verify NO payments or customer_ledger entries were created (zero financial distortion)
  const paymentCount = await db.prepare('SELECT COUNT(*) as cnt FROM payments WHERE customer_id = ?').get(leftoverCustId);
  assert.strictEqual(paymentCount.cnt, 0, 'No payment record should be created for leftover coupons (₹0)');

  const ledgerCount = await db.prepare('SELECT COUNT(*) as cnt FROM customer_ledger WHERE customer_id = ?').get(leftoverCustId);
  assert.strictEqual(ledgerCount.cnt, 0, 'No ledger entry should be created for leftover coupons (₹0)');

  // Verify normal delivery deduction works with leftover coupons (deliver 2 packets)
  const leftoverDelivery = await db.prepare(`
    INSERT INTO deliveries (
      customer_id, product_id, quantity, status, delivery_date,
      unit_price_snapshot, delivery_charge_snapshot, total_product_amount, total_amount,
      category_snapshot, product_name_snapshot, variant_snapshot, agent_id,
      created_at, updated_at
    ) VALUES (
      ?, ?, 2, 'DELIVERED', '2026-10-31',
      24.0, 3.0, 48.0, 51.0,
      'Milk', 'Toned Milk', '500 ml', 1,
      datetime('now'), datetime('now')
    )
  `).run(leftoverCustId, prodA.id);

  await syncCouponsForDelivery(leftoverDelivery.lastInsertRowid);

  const leftoverCustAfterDelivery = await db.prepare('SELECT * FROM customers WHERE id = ?').get(leftoverCustId);
  assert.strictEqual(leftoverCustAfterDelivery.coupon_balance, 13, 'Customer balance should deduct 2 coupons (15 -> 13)');

  const leftoverBookAfterDelivery = await db.prepare('SELECT * FROM coupon_books WHERE id = ?').get(leftoverBook.book.id);
  assert.strictEqual(leftoverBookAfterDelivery.remaining_coupons, 13, 'Book remaining coupons should be 13');
  assert.strictEqual(leftoverBookAfterDelivery.used_coupons, 2, 'Book used coupons should be 2');

  console.log('[TEST 15] Leftover Physical Coupons (Pre-App, ₹0 Price, No Payment Receipt, Normal Delivery Deduction 15 -> 13) verified! ✓');

  // Clean test data
  await db.prepare('DELETE FROM bills WHERE customer_id IN (?, ?, ?, ?)').run(customerId, weeklyCustId, multiCustId, leftoverCustId);
  await db.prepare('DELETE FROM coupon_transactions WHERE customer_id IN (?, ?, ?)').run(customerId, multiCustId, leftoverCustId);
  await db.prepare('DELETE FROM coupon_books WHERE customer_id IN (?, ?, ?)').run(customerId, multiCustId, leftoverCustId);
  await db.prepare('DELETE FROM deliveries WHERE customer_id IN (?, ?, ?, ?)').run(customerId, weeklyCustId, multiCustId, leftoverCustId);
  await db.prepare('DELETE FROM payments WHERE customer_id IN (?, ?, ?, ?)').run(customerId, weeklyCustId, multiCustId, leftoverCustId);
  await db.prepare('DELETE FROM customer_ledger WHERE customer_id IN (?, ?, ?, ?)').run(customerId, weeklyCustId, multiCustId, leftoverCustId);
  await db.prepare('DELETE FROM customers WHERE id IN (?, ?, ?, ?)').run(customerId, weeklyCustId, multiCustId, leftoverCustId);
  await db.prepare('DELETE FROM products WHERE id = ?').run(curdProdId);

  console.log('\n================================================================');
  console.log(' ALL WEEKLY BILLING & COUPON SYSTEM TESTS PASSED! ✓');
  console.log('================================================================\n');
}

runWeeklyAndCouponTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
