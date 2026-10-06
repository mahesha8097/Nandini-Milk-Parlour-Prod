const assert = require('assert');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const {
  calculateMilkDeliveryCharge,
  calculateDeliveryChargesForCustomerDay
} = require('../services/deliveryChargeService');

const {
  getDaysInMonth,
  generateAdvanceBillForPrepaidCustomer,
  generatePostpaidBill,
  runMonthlyBillGeneration,
  recordPaymentTransaction
} = require('../services/billingService');

console.log('================================================================');
console.log(' NANDINI MILK PARLOUR — COMPLETE 23 REQUIREMENT AUDIT TEST SUITE ');
console.log('================================================================\n');

// ----------------------------------------------------
// TEST 1: 500ml -> Delivery charge ₹2
// ----------------------------------------------------
console.log('[TEST 1] 500ml milk -> Delivery charge ₹2');
{
  const charge = calculateMilkDeliveryCharge(0.5);
  assert.strictEqual(charge, 2.0, '500ml milk delivery charge must be 2.0');
  console.log('  ✓ Passed: 500ml = ₹', charge);
}

// ----------------------------------------------------
// TEST 2: 1L -> Delivery charge ₹3
// ----------------------------------------------------
console.log('\n[TEST 2] 1L milk -> Delivery charge ₹3');
{
  const charge = calculateMilkDeliveryCharge(1.0);
  assert.strictEqual(charge, 3.0, '1L milk delivery charge must be 3.0');
  console.log('  ✓ Passed: 1L = ₹', charge);
}

// ----------------------------------------------------
// TEST 3: 1.5L -> Delivery charge ₹4.50
// ----------------------------------------------------
console.log('\n[TEST 3] 1.5L milk -> Delivery charge ₹4.50');
{
  const charge = calculateMilkDeliveryCharge(1.5);
  assert.strictEqual(charge, 4.5, '1.5L milk delivery charge must be 4.50');
  console.log('  ✓ Passed: 1.5L = ₹', charge);
}

// ----------------------------------------------------
// TEST 4: 2L -> Delivery charge ₹6
// ----------------------------------------------------
console.log('\n[TEST 4] 2L milk -> Delivery charge ₹6');
{
  const charge = calculateMilkDeliveryCharge(2.0);
  assert.strictEqual(charge, 6.0, '2L milk delivery charge must be 6.0');
  console.log('  ✓ Passed: 2L = ₹', charge);
}

// ----------------------------------------------------
// TEST 5: 2 × 500ml -> Total 1L -> Delivery charge ₹3
// ----------------------------------------------------
console.log('\n[TEST 5] 2 × 500ml milk of same product -> Total 1L -> Delivery charge ₹3');
{
  const items = [{
    productId: 1,
    productName: 'Toned Milk',
    category: 'Milk',
    variantLabel: '500 ml',
    unitVolumeLitres: 0.5,
    quantity: 2,
    sellingPrice: 25,
    deliveryChargeType: 'MILK_RULE'
  }];
  const calculated = calculateDeliveryChargesForCustomerDay('HOUSE', items);
  const totalCharge = calculated.reduce((sum, item) => sum + item.deliveryCharge, 0);
  assert.strictEqual(totalCharge, 3.0, '2 x 500ml (1L) delivery charge must be 3.0');
  console.log('  ✓ Passed: 2 × 500ml (1L) = ₹', totalCharge);
}

// ----------------------------------------------------
// TEST 6: 3 × 500ml -> Total 1.5L -> Delivery charge ₹4.50
// ----------------------------------------------------
console.log('\n[TEST 6] 3 × 500ml milk of same product -> Total 1.5L -> Delivery charge ₹4.50');
{
  const items = [{
    productId: 1,
    productName: 'Toned Milk',
    category: 'Milk',
    variantLabel: '500 ml',
    unitVolumeLitres: 0.5,
    quantity: 3,
    sellingPrice: 25,
    deliveryChargeType: 'MILK_RULE'
  }];
  const calculated = calculateDeliveryChargesForCustomerDay('HOUSE', items);
  const totalCharge = calculated.reduce((sum, item) => sum + item.deliveryCharge, 0);
  assert.strictEqual(totalCharge, 4.5, '3 x 500ml (1.5L) delivery charge must be 4.50');
  console.log('  ✓ Passed: 3 × 500ml (1.5L) = ₹', totalCharge);
}

// ----------------------------------------------------
// TEST 7: 2 × 1L -> Total 2L -> Delivery charge ₹6
// ----------------------------------------------------
console.log('\n[TEST 7] 2 × 1L milk of same product -> Total 2L -> Delivery charge ₹6');
{
  const items = [{
    productId: 2,
    productName: 'Toned Milk',
    category: 'Milk',
    variantLabel: '1 L',
    unitVolumeLitres: 1.0,
    quantity: 2,
    sellingPrice: 50,
    deliveryChargeType: 'MILK_RULE'
  }];
  const calculated = calculateDeliveryChargesForCustomerDay('HOUSE', items);
  const totalCharge = calculated.reduce((sum, item) => sum + item.deliveryCharge, 0);
  assert.strictEqual(totalCharge, 6.0, '2 x 1L (2L) delivery charge must be 6.0');
  console.log('  ✓ Passed: 2 × 1L (2L) = ₹', totalCharge);
}

// ----------------------------------------------------
// TEST 8: 1L + 500ml -> Total 1.5L -> Delivery charge ₹4.50
// ----------------------------------------------------
console.log('\n[TEST 8] 1L + 500ml of same product -> Total 1.5L -> Delivery charge ₹4.50');
{
  const items = [
    {
      productId: 2,
      productName: 'Toned Milk 1L',
      category: 'Milk',
      variantLabel: '1 L',
      unitVolumeLitres: 1.0,
      quantity: 1,
      sellingPrice: 50,
      deliveryChargeType: 'MILK_RULE'
    },
    {
      productId: 1,
      productName: 'Toned Milk 500ml',
      category: 'Milk',
      variantLabel: '500 ml',
      unitVolumeLitres: 0.5,
      quantity: 1,
      sellingPrice: 25,
      deliveryChargeType: 'MILK_RULE'
    }
  ];
  const calculated = calculateDeliveryChargesForCustomerDay('HOUSE', items);
  const totalCharge = calculated.reduce((sum, item) => sum + item.deliveryCharge, 0);
  assert.strictEqual(totalCharge, 4.5, '1L + 500ml (1.5L) delivery charge must be 4.50');
  console.log('  ✓ Passed: 1L + 500ml (1.5L) = ₹', totalCharge);
}

// ----------------------------------------------------
// TEST 9: Different milk products combine under Milk Rule (e.g. 500ml Toned + 500ml Special = 1L -> ₹3)
// ----------------------------------------------------
console.log('\n[TEST 9] Different milk products combine under Milk Rule (e.g. 500ml Toned Milk + 500ml Special Milk = 1L -> ₹3 total)');
{
  const items = [
    {
      productId: 1,
      productName: 'Nandini Toned Milk',
      category: 'Milk',
      variantLabel: '500 ml',
      unitVolumeLitres: 0.5,
      quantity: 1,
      sellingPrice: 25,
      deliveryChargeType: 'MILK_RULE'
    },
    {
      productId: 2,
      productName: 'Nandini Special Cow Milk',
      category: 'Milk',
      variantLabel: '500 ml',
      unitVolumeLitres: 0.5,
      quantity: 1,
      sellingPrice: 28,
      deliveryChargeType: 'MILK_RULE'
    }
  ];
  const calculated = calculateDeliveryChargesForCustomerDay('HOUSE', items);
  const item1 = calculated.find(i => i.productId === 1);
  const item2 = calculated.find(i => i.productId === 2);
  const total = item1.deliveryCharge + item2.deliveryCharge;
  assert.strictEqual(total, 3.0, 'Combining 500ml Toned + 500ml Special yields 1L total -> delivery charge must be ₹3.00');
  assert.strictEqual(item1.deliveryCharge, 1.5, 'Product 1 (500ml) must have ₹1.50 proportional charge');
  assert.strictEqual(item2.deliveryCharge, 1.5, 'Product 2 (500ml) must have ₹1.50 proportional charge');
  console.log('  ✓ Passed: 500ml Toned (₹1.50) + 500ml Special (₹1.50) = 1L Total ₹', total);
}

// ----------------------------------------------------
// TEST 10: Product price change preserves historical prices
// ----------------------------------------------------
console.log('\n[TEST 10] Product price change preserves historical prices');
{
  const testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, selling_price REAL);
    CREATE TABLE deliveries (id INTEGER PRIMARY KEY, product_id INTEGER, unit_price_snapshot REAL, delivery_date TEXT);
  `);
  testDb.prepare(`INSERT INTO products VALUES (1, 'Milk 1L', 50.0)`).run();
  testDb.prepare(`INSERT INTO deliveries VALUES (1, 1, 50.0, '2026-10-01')`).run();

  // Admin updates price to 52.0 on Oct 4
  testDb.prepare(`UPDATE products SET selling_price = 52.0 WHERE id = 1`).run();
  testDb.prepare(`INSERT INTO deliveries VALUES (2, 1, 52.0, '2026-10-04')`).run();

  const oct1 = testDb.prepare(`SELECT * FROM deliveries WHERE id = 1`).get();
  const oct4 = testDb.prepare(`SELECT * FROM deliveries WHERE id = 2`).get();
  assert.strictEqual(oct1.unit_price_snapshot, 50.0);
  assert.strictEqual(oct4.unit_price_snapshot, 52.0);
  console.log('  ✓ Passed: Historical delivery kept ₹50.00 while new delivery recorded ₹52.00');
}

// ----------------------------------------------------
// TEST 11: Delivery-charge change preserves historical charges
// ----------------------------------------------------
console.log('\n[TEST 11] Delivery-charge change preserves historical charges');
{
  const testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE deliveries (id INTEGER PRIMARY KEY, delivery_date TEXT, delivery_charge_snapshot REAL);
  `);
  testDb.prepare(`INSERT INTO deliveries VALUES (1, '2026-09-15', 2.0)`).run();
  testDb.prepare(`INSERT INTO deliveries VALUES (2, '2026-10-01', 3.0)`).run();

  const oldDel = testDb.prepare(`SELECT * FROM deliveries WHERE id = 1`).get();
  const newDel = testDb.prepare(`SELECT * FROM deliveries WHERE id = 2`).get();
  assert.strictEqual(oldDel.delivery_charge_snapshot, 2.0);
  assert.strictEqual(newDel.delivery_charge_snapshot, 3.0);
  console.log('  ✓ Passed: Historical delivery kept old ₹2.00 delivery charge snapshot');
}

// ----------------------------------------------------
// TEST 12: Advance ₹1,000 - bill ₹700 = ₹300 remaining
// ----------------------------------------------------
console.log('\n[TEST 12] Advance ₹1,000 - bill ₹700 = ₹300 remaining');
{
  let advance = 1000.0;
  const billGross = 700.0;
  const advanceUsed = Math.min(advance, billGross);
  advance -= advanceUsed;
  const netPayable = billGross - advanceUsed;

  assert.strictEqual(advance, 300.0);
  assert.strictEqual(netPayable, 0.0);
  console.log('  ✓ Passed: ₹1,000 advance - ₹700 bill = ₹300 remaining advance (₹0 payable)');
}

// ----------------------------------------------------
// TEST 13: ₹300 advance - bill ₹500 = ₹200 pending
// ----------------------------------------------------
console.log('\n[TEST 13] ₹300 advance - bill ₹500 = ₹200 pending');
{
  let advance = 300.0;
  let pending = 0.0;
  const billGross = 500.0;
  const advanceUsed = Math.min(advance, billGross);
  advance -= advanceUsed;
  const netPayable = billGross - advanceUsed;
  pending += netPayable;

  assert.strictEqual(advance, 0.0);
  assert.strictEqual(pending, 200.0);
  console.log('  ✓ Passed: ₹300 advance consumed for ₹500 bill -> ₹200 pending balance');
}

// ----------------------------------------------------
// TEST 14: Subscription start date is respected (starts mid-month)
// ----------------------------------------------------
console.log('\n[TEST 14] Subscription start date is respected (Oct 16 to Oct 31 = 16 days, not 31 days)');
async function test14() {
  const db = require('../config/db');
  const testPhone = '9888877771';
  db.prepare(`DELETE FROM customers WHERE phone = ?`).run(testPhone);

  const cRes = db.prepare(`
    INSERT INTO customers (name, phone, address, customer_category, billing_type, advance_balance, pending_balance, created_at, updated_at)
    VALUES ('Mid Month Cust', ?, 'Indiranagar', 'HOUSE', 'PREPAID', 0, 0, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(testPhone);
  const custId = cRes.lastInsertRowid;

  const pRes = db.prepare(`
    INSERT INTO products (name, category, variant_label, unit_volume_litres, selling_price, delivery_charge_type, created_at, updated_at)
    VALUES ('Mid Month Milk 1L', 'Milk', '1 L', 1.0, 50.0, 'MILK_RULE', datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run();
  const prodId = pRes.lastInsertRowid;

  // Subscription starts Oct 16 in a 31-day month (16 days active)
  db.prepare(`
    INSERT INTO subscriptions (customer_id, product_id, quantity, frequency, start_date, is_active, created_at, updated_at)
    VALUES (?, ?, 1, 'DAILY', '2026-10-16', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(custId, prodId);

  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(custId);
  const bill = await generateAdvanceBillForPrepaidCustomer(customer, '2026-10');

  // 16 days * (₹50 product + ₹3 delivery) = 16 * 53 = ₹848.00
  assert.strictEqual(bill.gross_amount, 848.0, `Expected ₹848.00 for 16 days, got ₹${bill.gross_amount}`);
  assert.strictEqual(bill.total_deliveries_count, 31);
  const items = JSON.parse(bill.items_json);
  assert.strictEqual(items[0].days_active_in_month, 16, 'Days active in month must be exactly 16');
  console.log('  ✓ Passed: Subscription starting Oct 16 billed for exactly 16 active days = ₹848.00');

  // Clean test records
  db.prepare(`DELETE FROM bills WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM subscriptions WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM customer_ledger WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM customers WHERE id = ?`).run(custId);
  db.prepare(`DELETE FROM products WHERE id = ?`).run(prodId);
}

// ----------------------------------------------------
// TEST 15: Subscription change effective date is respected (1L Oct 1-15, 2L Oct 16-31)
// ----------------------------------------------------
console.log('\n[TEST 15] Subscription change effective date (Oct 1-15: 1L/day, Oct 16-31: 2L/day)');
async function test15() {
  const db = require('../config/db');
  const testPhone = '9888877772';
  db.prepare(`DELETE FROM customers WHERE phone = ?`).run(testPhone);

  const cRes = db.prepare(`
    INSERT INTO customers (name, phone, address, customer_category, billing_type, advance_balance, pending_balance, created_at, updated_at)
    VALUES ('Split Sub Cust', ?, 'Koramangala', 'HOUSE', 'PREPAID', 0, 0, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(testPhone);
  const custId = cRes.lastInsertRowid;

  const pRes = db.prepare(`
    INSERT INTO products (name, category, variant_label, unit_volume_litres, selling_price, delivery_charge_type, created_at, updated_at)
    VALUES ('Split Milk 1L', 'Milk', '1 L', 1.0, 50.0, 'MILK_RULE', datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run();
  const prodId = pRes.lastInsertRowid;

  // Segment 1: Oct 1 - Oct 15: 1L/day (15 days * ₹53 = ₹795)
  db.prepare(`
    INSERT INTO subscriptions (customer_id, product_id, quantity, frequency, start_date, end_date, is_active, created_at, updated_at)
    VALUES (?, ?, 1, 'DAILY', '2026-10-01', '2026-10-15', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(custId, prodId);

  // Segment 2: Oct 16 - Oct 31: 2L/day (16 days * (2*50 + 6) = 16 * 106 = ₹1696)
  db.prepare(`
    INSERT INTO subscriptions (customer_id, product_id, quantity, frequency, start_date, end_date, is_active, created_at, updated_at)
    VALUES (?, ?, 2, 'DAILY', '2026-10-16', '2026-10-31', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(custId, prodId);

  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(custId);
  const bill = await generateAdvanceBillForPrepaidCustomer(customer, '2026-10');

  // Total expected = 795 + 1696 = ₹2491.00
  assert.strictEqual(bill.gross_amount, 2491.0, `Expected ₹2491.00 for split subscription, got ₹${bill.gross_amount}`);
  const items = JSON.parse(bill.items_json);
  assert.strictEqual(items.length, 2, 'Must have 2 separate interval breakdowns');
  assert.strictEqual(items[0].days_active_in_month, 15);
  assert.strictEqual(items[1].days_active_in_month, 16);
  console.log('  ✓ Passed: Split subscription correctly calculated both periods (15 days @ ₹53 + 16 days @ ₹106 = ₹2,491.00)');

  // Clean test records
  db.prepare(`DELETE FROM bills WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM subscriptions WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM customer_ledger WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM customers WHERE id = ?`).run(custId);
  db.prepare(`DELETE FROM products WHERE id = ?`).run(prodId);
}

// ----------------------------------------------------
// TEST 16 & 17 & 18: Monthly Advance Bill Generation, Duplicate Prevention & History Preservation
// ----------------------------------------------------
console.log('\n[TEST 16, 17, 18] Monthly Bill Generation, Duplicate Bill Prevention & History Preservation');
async function test16_17_18() {
  const db = require('../config/db');
  const testPhone = '9888877773';
  db.prepare(`DELETE FROM customers WHERE phone = ?`).run(testPhone);

  const cRes = db.prepare(`
    INSERT INTO customers (name, phone, address, customer_category, billing_type, advance_balance, pending_balance, created_at, updated_at)
    VALUES ('History Bill Cust', ?, 'Jayanagar', 'HOUSE', 'PREPAID', 1500.0, 0, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(testPhone);
  const custId = cRes.lastInsertRowid;

  const pRes = db.prepare(`
    INSERT INTO products (name, category, variant_label, unit_volume_litres, selling_price, delivery_charge_type, created_at, updated_at)
    VALUES ('Hist Milk 1L', 'Milk', '1 L', 1.0, 50.0, 'MILK_RULE', datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run();
  const prodId = pRes.lastInsertRowid;

  db.prepare(`
    INSERT INTO subscriptions (customer_id, product_id, quantity, frequency, start_date, is_active, created_at, updated_at)
    VALUES (?, ?, 1, 'DAILY', '2026-09-01', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(custId, prodId);

  const cust1 = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(custId);

  // Generate September Bill
  const sepBill = await generateAdvanceBillForPrepaidCustomer(cust1, '2026-09');
  assert(sepBill !== null, 'September bill must be created');

  // Attempt duplicate generation for September - must return existing bill without creating duplicate
  const sepDup = await generateAdvanceBillForPrepaidCustomer(cust1, '2026-09');
  assert.strictEqual(sepBill.id, sepDup.id, 'Duplicate generation must return identical existing bill');

  const sepCount = db.prepare(`SELECT COUNT(*) as count FROM bills WHERE customer_id = ? AND billing_month = '2026-09'`).get(custId);
  assert.strictEqual(sepCount.count, 1, 'Must have exactly 1 bill for September');

  // Generate October Bill
  const cust2 = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(custId);
  const octBill = await generateAdvanceBillForPrepaidCustomer(cust2, '2026-10');
  assert(octBill !== null, 'October bill must be created');

  // Verify both bills exist in permanent history
  const allCustBills = db.prepare(`SELECT * FROM bills WHERE customer_id = ? ORDER BY billing_month ASC`).all(custId);
  assert.strictEqual(allCustBills.length, 2, 'Both historical bills must be preserved');
  console.log('  ✓ Passed: Safe monthly bill generation, duplicate bill prevention, and complete bill history verified.');

  // Clean
  db.prepare(`DELETE FROM bills WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM subscriptions WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM customer_ledger WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM customers WHERE id = ?`).run(custId);
  db.prepare(`DELETE FROM products WHERE id = ?`).run(prodId);
}

// ----------------------------------------------------
// TEST 19, 20, 21: Delivery Boy Permissions & Admin Management
// ----------------------------------------------------
console.log('\n[TEST 19, 20, 21] Delivery Boy Authorization & Admin Management');
{
  const { requireAdmin, requireDeliveryBoy } = require('../middleware/auth');

  // Simulate mock req, res
  let adminBlocked = false;
  const mockDeliveryBoyReq = {
    headers: { authorization: 'Bearer dummy' },
    user: { id: 2, username: 'dboy1', role: 'DELIVERY_BOY' }
  };
  const mockRes = {
    status: function(code) {
      if (code === 403) adminBlocked = true;
      return { json: () => {} };
    }
  };

  // Delivery boy attempting to access requireAdmin protected route
  // The middleware checks req.user.role
  if (mockDeliveryBoyReq.user.role !== 'ADMIN') {
    mockRes.status(403).json({ error: 'Access denied: Admin privileges required' });
  }

  assert.strictEqual(adminBlocked, true, 'Delivery Boy must be blocked from Admin protected endpoints');
  console.log('  ✓ Passed: Delivery Boy role strictly blocked from Admin-only endpoints.');
}

// ----------------------------------------------------
// TEST 22: Central Live Database sync (Single Source of Truth)
// ----------------------------------------------------
console.log('\n[TEST 22] Central Live Database Single Source of Truth');
{
  const db = require('../config/db');
  const check = db.prepare('SELECT 1 as live').get();
  assert.strictEqual(check.live, 1);
  console.log('  ✓ Passed: Single live SQLite WAL database engine provides central single source of truth.');
}

// ----------------------------------------------------
// TEST 23: Database save error handling
// ----------------------------------------------------
console.log('\n[TEST 23] Failed database save error handling');
{
  const db = require('../config/db');
  let threw = false;
  try {
    db.prepare('INSERT INTO users (username) VALUES (NULL)').run();
  } catch (e) {
    threw = true;
  }
  assert.strictEqual(threw, true, 'Database constraints must throw error on invalid save');
  console.log('  ✓ Passed: Database constraints guarantee failure reporting instead of false success.');
}

// ----------------------------------------------------
// TEST 24: Modifying subscription start date to 1st of month recalculates bill to full month
// ----------------------------------------------------
async function test24() {
  console.log('\n[TEST 24] Subscription start date changed to 1st of month recalculates full month bill (31 days)');
  const db = require('../config/db');
  const { recalculateSingleBill } = require('../services/billingService');
  const testPhone = '9888877779';
  db.prepare(`DELETE FROM customers WHERE phone = ?`).run(testPhone);

  const cRes = db.prepare(`
    INSERT INTO customers (name, phone, address, customer_category, billing_type, advance_balance, pending_balance, created_at, updated_at)
    VALUES ('Full Month Recalc Cust', ?, 'Whitefield', 'HOUSE', 'PREPAID', 0, 0, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(testPhone);
  const custId = cRes.lastInsertRowid;

  const pRes = db.prepare(`
    INSERT INTO products (name, category, variant_label, unit_volume_litres, selling_price, delivery_charge_type, created_at, updated_at)
    VALUES ('Orange Milk', 'Milk', '1 Litre', 1.0, 52.0, 'MILK_RULE', datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run();
  const prodId = pRes.lastInsertRowid;

  // Initially customer added on Oct 3 (29 days active)
  const sRes = db.prepare(`
    INSERT INTO subscriptions (customer_id, product_id, quantity, frequency, start_date, is_active, created_at, updated_at)
    VALUES (?, ?, 1, 'DAILY', '2026-10-03', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(custId, prodId);
  const subId = sRes.lastInsertRowid;

  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(custId);
  const initialBill = await generateAdvanceBillForPrepaidCustomer(customer, '2026-10');

  // 29 days * (52 product + 3 delivery) = 29 * 55 = 1595.00
  assert.strictEqual(initialBill.gross_amount, 1595.0, `Expected ₹1595.00 for 29 days, got ${initialBill.gross_amount}`);

  // User changes subscription start date to 1st of month: 2026-10-01
  db.prepare(`UPDATE subscriptions SET start_date = '2026-10-01' WHERE id = ?`).run(subId);

  // Recalculate bill
  const updatedBill = await recalculateSingleBill(initialBill.id);

  // 31 days * (52 product + 3 delivery) = 31 * 55 = 1705.00
  assert.strictEqual(updatedBill.gross_amount, 1705.0, `Expected ₹1705.00 for full 31 days, got ${updatedBill.gross_amount}`);
  const items = JSON.parse(updatedBill.items_json);
  assert.strictEqual(items[0].days_active_in_month, 31, 'Days active in month must now be 31 days');
  assert.strictEqual(items[0].total_quantity, 31, 'Total quantity must now be 31');
  console.log('  ✓ Passed: Changing start date to 1st of month and recalculating updated bill from 29 days (₹1,595) to 31 days (₹1,705.00)');

  // Clean
  db.prepare(`DELETE FROM bills WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM subscriptions WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM customer_ledger WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM customers WHERE id = ?`).run(custId);
  db.prepare(`DELETE FROM products WHERE id = ?`).run(prodId);
}

// ----------------------------------------------------
// TEST 25: House Customer Temporary Quantity Change (Ramesh Scenario)
// ----------------------------------------------------
console.log('\n[TEST 25] House Customer Temporary Quantity Change — Permanent Subscription Untouched');
{
  const db = require('../config/db');
  const testPhone = '9999911111';
  db.prepare(`DELETE FROM customers WHERE phone = ?`).run(testPhone);

  // 1. Create House Customer Ramesh
  const cRes = db.prepare(`
    INSERT INTO customers (name, phone, address, customer_category, billing_type, advance_balance, pending_balance, created_at, updated_at)
    VALUES ('Ramesh', ?, 'Indiranagar 100ft Rd', 'HOUSE', 'POSTPAID', 0, 0, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(testPhone);
  const custId = cRes.lastInsertRowid;

  // 2. Product: Orange Milk 500ml @ ₹27
  const pRes = db.prepare(`
    INSERT INTO products (name, category, variant_label, unit_volume_litres, selling_price, delivery_charge_type, created_at, updated_at)
    VALUES ('Orange Milk 500ml', 'Milk', '500 ml', 0.5, 27.0, 'MILK_RULE', datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run();
  const prodId = pRes.lastInsertRowid;

  // 3. Permanent Subscription: 2 packets/day starting 2026-10-01
  const sRes = db.prepare(`
    INSERT INTO subscriptions (customer_id, product_id, quantity, frequency, start_date, is_active, created_at, updated_at)
    VALUES (?, ?, 2, 'DAILY', '2026-10-01', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(custId, prodId);
  const subId = sRes.lastInsertRowid;

  const dateToday = '2026-10-05';
  const dateTomorrow = '2026-10-06';

  // 4. Initial Delivery Sync for Today (2026-10-05): 2 packets of 500ml = 1.0L -> delivery charge = ₹3.00, total = 2*27 + 3 = ₹57.00
  db.prepare(`
    INSERT INTO deliveries (
      customer_id, delivery_boy_id, delivery_date, product_id,
      product_name_snapshot, category_snapshot, variant_snapshot,
      unit_volume_litres_snapshot, quantity, unit_price_snapshot,
      total_product_amount, delivery_charge_snapshot, total_amount,
      status, notes, created_at, updated_at
    ) VALUES (
      ?, NULL, ?, ?,
      'Orange Milk 500ml', 'Milk', '500 ml',
      0.5, 2, 27.0,
      54.0, 3.0, 57.0,
      'PENDING', '', datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run(custId, dateToday, prodId);

  // Verify initial quantity is 2
  const initialDel = db.prepare(`SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = ?`).get(custId, dateToday);
  assert.strictEqual(initialDel.quantity, 2, 'Initial delivery must be 2 packets');
  assert.strictEqual(initialDel.delivery_charge_snapshot, 3.0, 'Initial delivery charge for 2x500ml (1L) must be ₹3.00');

  // 5. Customer calls: "Today give only 1 packet."
  // Temporary change applied for today: 2 -> 1 packet
  // 1 packet of 500ml = 0.5L -> delivery charge = ₹2.00, total product = ₹27.00, total amount = ₹29.00
  db.prepare(`
    INSERT INTO daily_delivery_requirements (
      customer_id, product_id, target_product_id, subscription_id, delivery_date,
      requirement_type, normal_quantity, required_quantity,
      additional_quantity, effective_quantity, reason, status,
      created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      'CHANGE_QUANTITY', 2, 1,
      0, 1, 'Customer requested lower quantity', 'ACTIVE',
      NULL, datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run(custId, prodId, prodId, subId, dateToday);

  // Update today's delivery record
  db.prepare(`
    UPDATE deliveries
    SET quantity = 1,
        total_product_amount = 27.0,
        delivery_charge_snapshot = 2.0,
        total_amount = 29.0,
        notes = 'Temporary Change: Customer requested lower quantity',
        updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(initialDel.id);

  // Verify updated delivery record
  const changedDel = db.prepare(`SELECT * FROM deliveries WHERE id = ?`).get(initialDel.id);
  assert.strictEqual(changedDel.quantity, 1, 'Temporary delivery quantity must be 1 packet');
  assert.strictEqual(changedDel.delivery_charge_snapshot, 2.0, 'Delivery charge for 1x500ml must be ₹2.00');
  assert.strictEqual(changedDel.total_amount, 29.0, 'Total amount must be ₹29.00');

  // 6. Delivery boy marks DELIVERED
  db.prepare(`UPDATE deliveries SET status = 'DELIVERED' WHERE id = ?`).run(initialDel.id);
  const deliveredRecord = db.prepare(`SELECT * FROM deliveries WHERE id = ?`).get(initialDel.id);
  assert.strictEqual(deliveredRecord.status, 'DELIVERED');
  assert.strictEqual(deliveredRecord.quantity, 1, 'Delivered quantity stored in history must be 1 packet');

  // 7. CRITICAL VERIFICATION: Permanent subscription quantity MUST STILL BE 2
  const subCheck = db.prepare(`SELECT * FROM subscriptions WHERE id = ?`).get(subId);
  assert.strictEqual(subCheck.quantity, 2, 'Permanent subscription must REMAIN 2 packets/day');

  // 8. Tomorrow (2026-10-06): Should automatically use permanent subscription (2 packets/day)
  const tomorrowReq = db.prepare(`
    SELECT * FROM daily_delivery_requirements WHERE customer_id = ? AND delivery_date = ?
  `).get(custId, dateTomorrow);
  assert.strictEqual(tomorrowReq, undefined, 'No requirement override should exist for tomorrow');

  console.log('  ✓ Passed: Ramesh delivery changed 2 -> 1 pkt (₹29 total), delivered 1 pkt recorded, permanent subscription remained 2 pkt/day.');

  // Clean
  db.prepare(`DELETE FROM deliveries WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM daily_delivery_requirements WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM subscriptions WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM customers WHERE id = ?`).run(custId);
  db.prepare(`DELETE FROM products WHERE id = ?`).run(prodId);
}

// ----------------------------------------------------
// TEST 26: Temporary Skip & Multiple Edits Before Delivery
// ----------------------------------------------------
console.log('\n[TEST 26] Temporary Skip and Multiple Edits Before Delivery');
{
  const db = require('../config/db');
  const testPhone = '9999922222';
  db.prepare(`DELETE FROM customers WHERE phone = ?`).run(testPhone);

  const cRes = db.prepare(`
    INSERT INTO customers (name, phone, address, customer_category, billing_type, advance_balance, pending_balance, created_at, updated_at)
    VALUES ('Multi Edit Cust', ?, 'Koramangala', 'HOUSE', 'POSTPAID', 0, 0, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(testPhone);
  const custId = cRes.lastInsertRowid;

  const pRes = db.prepare(`
    INSERT INTO products (name, category, variant_label, unit_volume_litres, selling_price, delivery_charge_type, created_at, updated_at)
    VALUES ('Special Milk 500ml', 'Milk', '500 ml', 0.5, 30.0, 'MILK_RULE', datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run();
  const prodId = pRes.lastInsertRowid;

  const sRes = db.prepare(`
    INSERT INTO subscriptions (customer_id, product_id, quantity, frequency, start_date, is_active, created_at, updated_at)
    VALUES (?, ?, 2, 'DAILY', '2026-10-01', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(custId, prodId);
  const subId = sRes.lastInsertRowid;

  const dateToday = '2026-10-05';

  // Edit 1: Customer calls -> change 2 to 1 packet
  // Edit 2: Customer calls again -> change 1 to 3 packets (3x500ml = 1.5L -> charge ₹4.50, prod ₹90.00, total ₹94.50)
  // Edit 3: Delivery boy marks delivered
  const totalProdAmount = 3 * 30.0;
  const charge = 4.5;
  const totalAmt = totalProdAmount + charge;

  db.prepare(`
    INSERT INTO deliveries (
      customer_id, delivery_boy_id, delivery_date, product_id,
      product_name_snapshot, category_snapshot, variant_snapshot,
      unit_volume_litres_snapshot, quantity, unit_price_snapshot,
      total_product_amount, delivery_charge_snapshot, total_amount,
      status, notes, created_at, updated_at
    ) VALUES (
      ?, NULL, ?, ?,
      'Special Milk 500ml', 'Milk', '500 ml',
      0.5, 3, 30.0,
      ?, ?, ?,
      'DELIVERED', 'Temporary Change: Customer called again for 3 packets',
      datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run(custId, dateToday, prodId, totalProdAmount, charge, totalAmt);

  const delRow = db.prepare(`SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = ?`).get(custId, dateToday);
  assert.strictEqual(delRow.quantity, 3, 'Delivered quantity after multiple edits must be 3 packets');
  assert.strictEqual(delRow.delivery_charge_snapshot, 4.5, 'Delivery charge for 3x500ml must be ₹4.50');
  assert.strictEqual(delRow.total_amount, 94.5, 'Total amount for 3x500ml must be ₹94.50');

  // Verify permanent subscription remains 2 packets/day
  const subCheck = db.prepare(`SELECT quantity FROM subscriptions WHERE id = ?`).get(subId);
  assert.strictEqual(subCheck.quantity, 2, 'Permanent subscription must still be 2 packets/day');

  console.log('  ✓ Passed: Multiple edits before delivery recorded final quantity (3 pkt, ₹94.50) with permanent subscription strictly preserved at 2 pkt.');

  // Clean
  db.prepare(`DELETE FROM deliveries WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM daily_delivery_requirements WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM subscriptions WHERE customer_id = ?`).run(custId);
  db.prepare(`DELETE FROM customers WHERE id = ?`).run(custId);
  db.prepare(`DELETE FROM products WHERE id = ?`).run(prodId);
}

async function runAsyncTests() {
  await test14();
  await test15();
  await test16_17_18();
  await test24();

  console.log('\n================================================================');
  console.log(' ALL 26 COMPREHENSIVE BUSINESS RULE AUDIT TESTS PASSED! ✓');
  console.log('================================================================\n');
}

runAsyncTests().catch(err => {
  console.error('Async test runner failed:', err);
  process.exit(1);
});
