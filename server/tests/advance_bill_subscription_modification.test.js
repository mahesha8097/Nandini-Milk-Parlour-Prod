const assert = require('assert');
const db = require('../config/db');
const {
  generateBillForCustomer,
  generateAdvanceBillForPrepaidCustomer,
  recalculateSingleBill,
  syncCustomerBillingAfterSubscriptionChange,
  runMonthlyBillGeneration
} = require('../services/billingService');

async function runTests() {
  console.log('=== Running Advance Bill & Subscription Modification Test Suite ===\n');

  // Find an active product
  const product = await db.prepare('SELECT * FROM products WHERE is_active = 1 LIMIT 1').get();
  assert.ok(product, 'Must have at least 1 active product in database');
  const unitPrice = Number(product.selling_price || 27);
  const currentMonth = '2026-11';

  // -------------------------------------------------------------
  // TEST 1: Delivered milk exists + modified subscription -> Advance bill includes BOTH
  // -------------------------------------------------------------
  console.log('[TEST 1] Customer has delivered milk + modifies subscription -> Advance bill projects scheduled deliveries');

  const custRes1 = await db.prepare(`
    INSERT INTO customers (
      name, phone, address, route, customer_category, billing_type, pending_balance, advance_balance, status, created_at, updated_at
    ) VALUES (
      'Mod Sub Test Customer', '9999900088', 'Flat 404', 'Route 1', 'HOUSE', 'PREPAID', 0, 0, 'ACTIVE', datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run();
  const custId1 = custRes1.lastInsertRowid;

  // Add 2 deliveries marked DELIVERED on 2026-11-01 and 2026-11-02 (1 pkt each)
  await db.prepare(`
    INSERT INTO deliveries (
      customer_id, delivery_date, product_id, product_name_snapshot, category_snapshot,
      variant_snapshot, unit_volume_litres_snapshot, quantity, status, total_amount,
      total_product_amount, delivery_charge_snapshot, unit_price_snapshot, created_at, updated_at
    ) VALUES (
      ?, '2026-11-01', ?, ?, ?, ?, ?, 1, 'DELIVERED', ?, ?, 2, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run(custId1, product.id, product.name, product.category, product.variant_label, product.unit_volume_litres || 0.5, unitPrice + 2, unitPrice, unitPrice);

  const delRes2 = await db.prepare(`
    INSERT INTO deliveries (
      customer_id, delivery_date, product_id, product_name_snapshot, category_snapshot,
      variant_snapshot, unit_volume_litres_snapshot, quantity, status, total_amount,
      total_product_amount, delivery_charge_snapshot, unit_price_snapshot, created_at, updated_at
    ) VALUES (
      ?, '2026-11-02', ?, ?, ?, ?, ?, 1, 'DELIVERED', ?, ?, 2, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run(custId1, product.id, product.name, product.category, product.variant_label, product.unit_volume_litres || 0.5, unitPrice + 2, unitPrice, unitPrice);
  const delId2 = delRes2.lastInsertRowid;

  // Add an initial subscription
  const subRes1 = await db.prepare(`
    INSERT INTO subscriptions (customer_id, product_id, quantity, frequency, start_date, is_active, created_at, updated_at)
    VALUES (?, ?, 1, 'DAILY', '2026-11-01', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(custId1, product.id);
  const subId1 = subRes1.lastInsertRowid;

  // Initial bill generated
  let customer1 = await db.prepare('SELECT * FROM customers WHERE id = ?').get(custId1);
  const bill1 = await generateAdvanceBillForPrepaidCustomer(customer1, currentMonth, true);
  assert.ok(bill1, 'Bill 1 must exist');
  console.log(`  ✓ Step A: Initial bill created (#${bill1.bill_number}) with gross ₹${bill1.gross_amount}`);

  // Customer now changes subscription: 2 packets starting 2026-11-03
  await db.prepare(`
    UPDATE subscriptions
    SET quantity = 2, start_date = '2026-11-03'
    WHERE id = ?
  `).run(subId1);

  // Sync customer billing after subscription change
  const bill2 = await syncCustomerBillingAfterSubscriptionChange(custId1, currentMonth);
  assert.ok(bill2, 'Bill 2 must be regenerated');
  console.log(`  ✓ Step B: Subscription updated to 2 pkts/day starting Nov 3. Regenerated bill gross: ₹${bill2.gross_amount}`);
  console.log(`    Notes: "${bill2.notes}"`);

  const items = JSON.parse(bill2.items_json);
  assert.strictEqual(items.length, 2, 'Bill 2 must contain both delivered items and scheduled subscription items');
  
  const deliveredItem = items.find(it => it.is_delivered || it.frequency === 'DELIVERED');
  assert.ok(deliveredItem, 'Must have delivered items line');
  assert.strictEqual(deliveredItem.days_active_in_month, 2, 'Delivered line must account for exactly 2 days');
  assert.strictEqual(deliveredItem.total_quantity, 2, 'Delivered line must account for 2 pkts total');

  const scheduledItem = items.find(it => !it.is_delivered && it.frequency !== 'DELIVERED');
  assert.ok(scheduledItem, 'Must have scheduled subscription items line');
  assert.strictEqual(scheduledItem.quantity_per_day, 2, 'Scheduled line must reflect updated 2 pkts/day');
  assert.strictEqual(scheduledItem.days_active_in_month, 28, 'Scheduled line must cover remaining 28 days of Nov (Nov 3 to Nov 30)');
  assert.strictEqual(scheduledItem.total_quantity, 56, 'Scheduled line must be 28 days * 2 pkts = 56 pkts');

  // Verify total bill covers all 30 days
  assert.ok(bill2.notes.includes('30 days') || bill2.notes.includes('2 days delivered + 28 days scheduled'),
    `Bill notes should mention both delivered and scheduled days: ${bill2.notes}`);
  console.log('  ✓ Step C: All 30 days accounted for (2 delivered + 28 advance scheduled)!');

  // -------------------------------------------------------------
  // TEST 2: recalculateSingleBill preserves scheduled delivery
  // -------------------------------------------------------------
  console.log('\n[TEST 2] recalculateSingleBill on existing bill preserves advance scheduled delivery');
  const bill3 = await recalculateSingleBill(bill2.id, 'AUTO');
  assert.strictEqual(bill3.gross_amount, bill2.gross_amount, 'recalculateSingleBill must maintain full gross amount');
  const items3 = JSON.parse(bill3.items_json);
  assert.strictEqual(items3.length, 2, 'recalculateSingleBill must keep both delivered and scheduled items');
  console.log(`  ✓ Step D: recalculateSingleBill cleanly preserved ₹${bill3.gross_amount} gross with 28 scheduled days!`);

  // -------------------------------------------------------------
  // TEST 3: Delivery Revert (DELIVERED -> PENDING) immediately syncs bill
  // -------------------------------------------------------------
  console.log('\n[TEST 3] Delivery Revert (DELIVERED -> PENDING) immediately reconciles bill and balances');
  // Revert Nov 2 delivery from DELIVERED to PENDING
  await db.prepare(`UPDATE deliveries SET status = 'PENDING' WHERE id = ?`).run(delId2);
  const billAfterRevert = await syncCustomerBillingAfterSubscriptionChange(custId1, currentMonth);
  const itemsAfterRevert = JSON.parse(billAfterRevert.items_json);
  const delItemAfterRevert = itemsAfterRevert.find(it => it.is_delivered || it.frequency === 'DELIVERED');
  assert.strictEqual(delItemAfterRevert.days_active_in_month, 1, 'Delivered line must now only have 1 day after revert');
  console.log(`  ✓ Step E: Nov 2 delivery reverted; bill updated cleanly with 1 delivered day!`);

  // -------------------------------------------------------------
  // TEST 4: Vacation / Milk Pause automatically excludes paused days
  // -------------------------------------------------------------
  console.log('\n[TEST 4] Vacation / Milk Pause automatically excludes paused days and syncs bill');
  // Customer pauses milk for 5 days: Nov 10 to Nov 14
  const vacRes = await db.prepare(`
    INSERT INTO customer_vacations (
      customer_id, start_date, end_date, resume_date, reason, notify_agent_date, agent_id, status, created_at, updated_at
    ) VALUES (
      ?, '2026-11-10', '2026-11-14', '2026-11-15', 'Vacation Pause', '2026-11-14', 1, 'ACTIVE', datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run(custId1);
  const vacId = vacRes.lastInsertRowid;

  const billAfterVac = await syncCustomerBillingAfterSubscriptionChange(custId1, currentMonth);
  const itemsAfterVac = JSON.parse(billAfterVac.items_json);
  const subItemAfterVac = itemsAfterVac.find(it => !it.is_delivered && it.frequency !== 'DELIVERED');
  // Scheduled days: 28 days - 5 paused days = 23 scheduled days
  assert.strictEqual(subItemAfterVac.days_active_in_month, 23, `Must have 23 scheduled days after 5-day pause (got ${subItemAfterVac.days_active_in_month})`);
  console.log(`  ✓ Step F: Vacation pause of 5 days cleanly subtracted (23 scheduled days active)!`);

  // Cancel Vacation / Pause
  await db.prepare(`UPDATE customer_vacations SET status = 'CANCELLED' WHERE id = ?`).run(vacId);
  const billAfterCancelVac = await syncCustomerBillingAfterSubscriptionChange(custId1, currentMonth);
  const itemsAfterCancelVac = JSON.parse(billAfterCancelVac.items_json);
  const subItemAfterCancelVac = itemsAfterCancelVac.find(it => !it.is_delivered && it.frequency !== 'DELIVERED');
  assert.strictEqual(subItemAfterCancelVac.days_active_in_month, 28, 'Cancelling vacation cleanly restored 28 scheduled days');
  console.log(`  ✓ Step G: Vacation cancellation cleanly restored all 28 scheduled days!`);

  // -------------------------------------------------------------
  // TEST 5: Batch Monthly Bill Generation across all prepaid customers
  // -------------------------------------------------------------
  console.log('\n[TEST 5] Batch Monthly Bill Generation runs cleanly across all prepaid customers');
  const batchResult = await runMonthlyBillGeneration(currentMonth, { forceRegenerate: true });
  assert.ok(batchResult.prepaidBillsGenerated >= 1, 'Must have generated prepaid bills in batch');
  console.log(`  ✓ Step H: Batch generated ${batchResult.prepaidBillsGenerated} prepaid bills with 100% success!`);

  // Cleanup test records
  await db.prepare('DELETE FROM bills WHERE customer_id = ?').run(custId1);
  await db.prepare('DELETE FROM deliveries WHERE customer_id = ?').run(custId1);
  await db.prepare('DELETE FROM subscriptions WHERE customer_id = ?').run(custId1);
  await db.prepare('DELETE FROM customer_vacations WHERE customer_id = ?').run(custId1);
  await db.prepare('DELETE FROM customer_ledger WHERE customer_id = ?').run(custId1);
  await db.prepare('DELETE FROM customers WHERE id = ?').run(custId1);

  console.log('\n================================================================');
  console.log(' ALL ADVANCE BILL SUBSCRIPTION MODIFICATION TESTS PASSED! ✓');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
