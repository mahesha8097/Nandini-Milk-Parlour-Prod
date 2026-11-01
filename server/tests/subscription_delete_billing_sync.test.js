const assert = require('assert');
const db = require('../config/db');
const {
  generateBillForCustomer,
  recalculateSingleBill,
  syncCustomerBillingAfterSubscriptionChange
} = require('../services/billingService');

async function runTests() {
  console.log('=== Running Subscription Deletion & Billing Sync Test Suite ===\n');

  // Find a product
  const product = await db.prepare('SELECT * FROM products WHERE is_active = 1 LIMIT 1').get();
  assert.ok(product, 'Must have at least 1 active product in database');
  const unitPrice = Number(product.selling_price || 24);
  const currentMonth = '2026-11';
  const targetDate = '2026-11-01';

  // -------------------------------------------------------------
  // TEST 1: Add subscription -> recalculate bill -> delete subscription (0 deliveries) -> pending = 0
  // -------------------------------------------------------------
  console.log('[TEST 1] Add subscription -> generate bill -> delete subscription (0 deliveries) -> pending_balance resets to 0.00');
  
  const custRes1 = await db.prepare(`
    INSERT INTO customers (
      name, phone, address, route, customer_category, billing_type, pending_balance, advance_balance, status, created_at, updated_at
    ) VALUES (
      'Sync Test Customer 1', '9999900001', 'Flat 101', 'Route 1', 'HOUSE', 'PREPAID', 0, 0, 'ACTIVE', datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run();
  const custId1 = custRes1.lastInsertRowid;

  // Add subscription
  const subRes1 = await db.prepare(`
    INSERT INTO subscriptions (customer_id, product_id, quantity, frequency, start_date, is_active, created_at, updated_at)
    VALUES (?, ?, 1, 'DAILY', ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(custId1, product.id, `${currentMonth}-01`);
  const subId1 = subRes1.lastInsertRowid;

  // Generate / Recalculate bill
  const freshCust1 = await db.prepare('SELECT * FROM customers WHERE id = ?').get(custId1);
  const bill1 = await generateBillForCustomer(freshCust1, currentMonth, { billingBasis: 'AUTO', forceRegenerate: true });
  assert.ok(bill1, 'Advance bill must be generated');
  assert.ok(bill1.net_payable > 0, `Advance bill net_payable must be > 0 (was ₹${bill1.net_payable})`);

  let custAfterBill1 = await db.prepare('SELECT * FROM customers WHERE id = ?').get(custId1);
  assert.strictEqual(Number(custAfterBill1.pending_balance), Number(bill1.net_payable), 'Customer pending balance must match advance bill');
  console.log(`  ✓ Step A: Advance bill #${bill1.bill_number} generated for ₹${bill1.net_payable}, customer pending = ₹${custAfterBill1.pending_balance}`);

  // Now delete subscription (with 0 deliveries)
  await db.prepare('DELETE FROM subscriptions WHERE id = ?').run(subId1);
  await syncCustomerBillingAfterSubscriptionChange(custId1, currentMonth);

  const custAfterDelete1 = await db.prepare('SELECT * FROM customers WHERE id = ?').get(custId1);
  const billAfterDelete1 = await db.prepare('SELECT * FROM bills WHERE id = ?').get(bill1.id);

  assert.strictEqual(Number(custAfterDelete1.pending_balance), 0, `Customer pending_balance must be 0 after deleting subscription (was ${custAfterDelete1.pending_balance})`);
  assert.strictEqual(billAfterDelete1.status, 'CANCELLED', 'Bill must be marked CANCELLED');
  assert.strictEqual(Number(billAfterDelete1.net_payable), 0, 'Bill net_payable must be 0');
  console.log(`  ✓ Step B: After deleting subscription, customer pending balance is ₹${custAfterDelete1.pending_balance} and bill is CANCELLED (₹0.00) ✓`);

  // -------------------------------------------------------------
  // TEST 2: Add subscription -> recalculate bill -> mark 1 delivery DELIVERED -> delete subscription -> pending = delivered milk only
  // -------------------------------------------------------------
  console.log('\n[TEST 2] Add subscription -> generate bill -> mark 1 delivery DELIVERED -> delete subscription -> pending shows only delivered milk');

  const custRes2 = await db.prepare(`
    INSERT INTO customers (
      name, phone, address, route, customer_category, billing_type, pending_balance, advance_balance, status, created_at, updated_at
    ) VALUES (
      'Sync Test Customer 2', '9999900002', 'Flat 102', 'Route 1', 'HOUSE', 'PREPAID', 0, 0, 'ACTIVE', datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run();
  const custId2 = custRes2.lastInsertRowid;

  const subRes2 = await db.prepare(`
    INSERT INTO subscriptions (customer_id, product_id, quantity, frequency, start_date, is_active, created_at, updated_at)
    VALUES (?, ?, 1, 'DAILY', ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(custId2, product.id, `${currentMonth}-01`);
  const subId2 = subRes2.lastInsertRowid;

  const freshCust2 = await db.prepare('SELECT * FROM customers WHERE id = ?').get(custId2);
  const bill2 = await generateBillForCustomer(freshCust2, currentMonth, { billingBasis: 'AUTO', forceRegenerate: true });
  assert.ok(bill2, 'Advance bill 2 must be generated');

  // Insert 1 delivery marked DELIVERED
  const delCharge = 2.0;
  const expectedDeliveredTotal = parseFloat((unitPrice + delCharge).toFixed(2));
  await db.prepare(`
    INSERT INTO deliveries (
      customer_id, product_id, delivery_date, quantity, unit_price_snapshot,
      total_product_amount, delivery_charge_snapshot, total_amount, status,
      product_name_snapshot, category_snapshot, variant_snapshot, unit_volume_litres_snapshot,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, 1, ?,
      ?, ?, ?, 'DELIVERED',
      ?, ?, ?, 0.5,
      datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run(
    custId2, product.id, targetDate, unitPrice,
    unitPrice, delCharge, expectedDeliveredTotal,
    product.name, product.category, product.variant_label || '500ml'
  );

  // Now delete subscription
  await db.prepare('DELETE FROM subscriptions WHERE id = ?').run(subId2);
  await syncCustomerBillingAfterSubscriptionChange(custId2, currentMonth);

  const custAfterDelete2 = await db.prepare('SELECT * FROM customers WHERE id = ?').get(custId2);
  const billAfterDelete2 = await db.prepare('SELECT * FROM bills WHERE customer_id = ? AND billing_month = ?').get(custId2, currentMonth);

  assert.strictEqual(Number(custAfterDelete2.pending_balance), expectedDeliveredTotal, `Customer pending must be only delivered amount ₹${expectedDeliveredTotal} (got ₹${custAfterDelete2.pending_balance})`);
  assert.strictEqual(Number(billAfterDelete2.gross_amount), expectedDeliveredTotal, `Bill gross must match delivered milk ₹${expectedDeliveredTotal}`);
  assert.strictEqual(Number(billAfterDelete2.net_payable), expectedDeliveredTotal, `Bill net payable must match delivered milk ₹${expectedDeliveredTotal}`);
  assert.strictEqual(billAfterDelete2.total_deliveries_count, 1, 'Bill must reflect exactly 1 delivered item');
  console.log(`  ✓ Passed: Advance bill converted to Delivered Milk Bill (₹${billAfterDelete2.net_payable}), pending balance is strictly delivered milk: ₹${custAfterDelete2.pending_balance} ✓`);

  // -------------------------------------------------------------
  // TEST 3: Customer with 0 subscriptions marks delivery -> pending updates to delivered; unmark delivery -> pending resets to 0
  // -------------------------------------------------------------
  console.log('\n[TEST 3] Customer with no subscriptions: mark delivery DELIVERED -> pending shows delivered; unmark delivery -> pending resets to 0.00');

  // Using Customer 1 (no subscriptions, 0 pending)
  const delRes3 = await db.prepare(`
    INSERT INTO deliveries (
      customer_id, product_id, delivery_date, quantity, unit_price_snapshot,
      total_product_amount, delivery_charge_snapshot, total_amount, status,
      product_name_snapshot, category_snapshot, variant_snapshot, unit_volume_litres_snapshot,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, 1, ?,
      ?, ?, ?, 'DELIVERED',
      ?, ?, ?, 0.5,
      datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run(
    custId1, product.id, targetDate, unitPrice,
    unitPrice, delCharge, expectedDeliveredTotal,
    product.name, product.category, product.variant_label || '500ml'
  );
  const delId3 = delRes3.lastInsertRowid;

  // Sync on delivery marked
  await syncCustomerBillingAfterSubscriptionChange(custId1, currentMonth);
  const custDelivered1 = await db.prepare('SELECT * FROM customers WHERE id = ?').get(custId1);
  assert.strictEqual(Number(custDelivered1.pending_balance), expectedDeliveredTotal, `Customer 1 pending must now be delivered amount ₹${expectedDeliveredTotal}`);
  console.log(`  ✓ Step A: Delivery marked DELIVERED -> customer pending balance is ₹${custDelivered1.pending_balance}`);

  // Now unmark delivery to PENDING
  await db.prepare("UPDATE deliveries SET status = 'PENDING' WHERE id = ?").run(delId3);
  await syncCustomerBillingAfterSubscriptionChange(custId1, currentMonth);

  const custUnmarked1 = await db.prepare('SELECT * FROM customers WHERE id = ?').get(custId1);
  assert.strictEqual(Number(custUnmarked1.pending_balance), 0, `Customer 1 pending must return to 0 (got ₹${custUnmarked1.pending_balance})`);
  console.log(`  ✓ Step B: Delivery reverted from DELIVERED -> customer pending balance returned to ₹${custUnmarked1.pending_balance} ✓`);

  // -------------------------------------------------------------
  // TEST 4: Recalculate bill endpoint directly on a bill whose subscription was deleted
  // -------------------------------------------------------------
  console.log('\n[TEST 4] recalculateSingleBill on bill whose subscription was deleted');

  // Customer 2 currently has 1 delivery and bill of ₹expectedDeliveredTotal
  const recalcBill2 = await recalculateSingleBill(billAfterDelete2.id);
  assert.ok(recalcBill2, 'Recalculated bill must exist');
  assert.strictEqual(Number(recalcBill2.net_payable), expectedDeliveredTotal, `Recalculate must keep net_payable at ₹${expectedDeliveredTotal}`);
  console.log(`  ✓ Passed: recalculateSingleBill kept accurate delivered bill at ₹${recalcBill2.net_payable} ✓`);

  // Clean up test records
  await db.prepare('DELETE FROM deliveries WHERE customer_id IN (?, ?)').run(custId1, custId2);
  await db.prepare('DELETE FROM bills WHERE customer_id IN (?, ?)').run(custId1, custId2);
  await db.prepare('DELETE FROM customer_ledger WHERE customer_id IN (?, ?)').run(custId1, custId2);
  await db.prepare('DELETE FROM customers WHERE id IN (?, ?)').run(custId1, custId2);

  console.log('\n=== ALL SUBSCRIPTION DELETION & BILLING SYNC TESTS PASSED! ===');
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
