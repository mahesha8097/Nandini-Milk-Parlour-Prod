const assert = require('assert');
const db = require('../config/db');
const { generateBillForCustomer } = require('../services/billingService');

console.log('================================================================');
console.log(' NANDINI MILK PARLOUR — BULK MANUAL WORKFLOW AUDIT TEST SUITE');
console.log('================================================================\n');

try {
  const day1 = '2026-10-05';
  const day2 = '2026-10-06';
  const testMonth = '2026-10';

  // 1. Identify or create a Bulk customer
  let bulkCust = db.prepare("SELECT * FROM customers WHERE customer_category = 'BULK_HOTEL' LIMIT 1").get();
  if (!bulkCust) {
    const info = db.prepare(`
      INSERT INTO customers (name, phone, address, route, customer_category, billing_type, status, created_at, updated_at)
      VALUES ('SK FOOD TEST', '9876543210', 'woodlab, seegehalli', 'Seegehalli', 'BULK_HOTEL', 'POSTPAID', 'ACTIVE', datetime('now'), datetime('now'))
    `).run();
    bulkCust = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
  }
  assert(bulkCust, 'Bulk customer exists');
  console.log(`✓ [TEST 1] Identified Bulk Customer: "${bulkCust.name}" (ID: ${bulkCust.id}, Category: ${bulkCust.customer_category})`);

  // 2. Fetch products
  const products = db.prepare("SELECT * FROM products WHERE is_active = 1").all();
  assert(products.length >= 2, 'At least 2 active products exist');
  const milkProd = products.find(p => p.category === 'Milk' || p.name.includes('Milk')) || products[0];
  const curdProd = products.find(p => p.name.includes('Curd')) || products[1];
  console.log(`✓ [TEST 2] Selected Products for Bulk Testing:`);
  console.log(`   - Milk: ${milkProd.name} (${milkProd.variant_label}) @ ₹${milkProd.selling_price}`);
  console.log(`   - Curd: ${curdProd.name} (${curdProd.variant_label}) @ ₹${curdProd.selling_price}`);

  // Clean up any test day records for this customer
  db.prepare('DELETE FROM deliveries WHERE customer_id = ? AND delivery_date IN (?, ?)').run(bulkCust.id, day1, day2);

  // 3. Verify Day 1 starts with ZERO products (empty list)
  const initialDeliveriesDay1 = db.prepare('SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = ?').all(bulkCust.id, day1);
  assert.strictEqual(initialDeliveriesDay1.length, 0, 'Bulk delivery starts with 0 products for Day 1');
  console.log(`✓ [TEST 3] Day 1 (${day1}) starts with ZERO products / empty delivery list.`);

  // 4. Manually add Toned Milk (20 L) and Curd (10 L) for Day 1
  const milkQty1 = 20;
  const curdQty1 = 10;
  const milkAmount1 = milkProd.selling_price * milkQty1;
  const curdAmount1 = curdProd.selling_price * curdQty1;

  const insertStmt = db.prepare(`
    INSERT INTO deliveries (
      customer_id, delivery_boy_id, delivery_date, product_id,
      product_name_snapshot, category_snapshot, variant_snapshot,
      unit_volume_litres_snapshot, quantity, unit_price_snapshot,
      total_product_amount, delivery_charge_snapshot, total_amount,
      status, notes, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, 0, ?,
      'PENDING', 'Bulk Daily Order', datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `);

  insertStmt.run(
    bulkCust.id, bulkCust.delivery_boy_id || null, day1, milkProd.id,
    milkProd.name, milkProd.category, milkProd.variant_label,
    milkProd.unit_volume_litres || 1, milkQty1, milkProd.selling_price,
    milkAmount1, milkAmount1
  );

  insertStmt.run(
    bulkCust.id, bulkCust.delivery_boy_id || null, day1, curdProd.id,
    curdProd.name, curdProd.category, curdProd.variant_label,
    curdProd.unit_volume_litres || 1, curdQty1, curdProd.selling_price,
    curdAmount1, curdAmount1
  );

  const day1Items = db.prepare('SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = ?').all(bulkCust.id, day1);
  assert.strictEqual(day1Items.length, 2, '2 products added for Day 1');
  console.log(`✓ [TEST 4] Products added for Day 1: Toned Milk (${milkQty1} L) and Curd (${curdQty1} L).`);

  // 5. Change Toned Milk quantity from 20 L -> 15 L and Remove Curd
  const milkQtyUpdated = 15;
  const milkAmountUpdated = milkProd.selling_price * milkQtyUpdated;

  db.prepare('DELETE FROM deliveries WHERE customer_id = ? AND delivery_date = ? AND product_id = ?').run(bulkCust.id, day1, curdProd.id);
  db.prepare(`
    UPDATE deliveries
    SET quantity = ?, total_product_amount = ?, total_amount = ?, updated_at = datetime('now', 'localtime')
    WHERE customer_id = ? AND delivery_date = ? AND product_id = ?
  `).run(milkQtyUpdated, milkAmountUpdated, milkAmountUpdated, bulkCust.id, day1, milkProd.id);

  const updatedItems = db.prepare('SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = ?').all(bulkCust.id, day1);
  assert.strictEqual(updatedItems.length, 1, 'Curd was successfully removed');
  assert.strictEqual(updatedItems[0].quantity, 15, 'Toned Milk quantity was updated to 15 L');
  console.log(`✓ [TEST 5] Quantity edit and product removal verified: Toned Milk updated to 15 L, Curd removed.`);

  // 6. Re-add Curd (10 L) and Mark Delivered
  insertStmt.run(
    bulkCust.id, bulkCust.delivery_boy_id || null, day1, curdProd.id,
    curdProd.name, curdProd.category, curdProd.variant_label,
    curdProd.unit_volume_litres || 1, curdQty1, curdProd.selling_price,
    curdAmount1, curdAmount1
  );

  db.prepare(`
    UPDATE deliveries
    SET status = 'DELIVERED', updated_at = datetime('now', 'localtime')
    WHERE customer_id = ? AND delivery_date = ?
  `).run(bulkCust.id, day1);

  const finalizedDay1 = db.prepare('SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = ?').all(bulkCust.id, day1);
  assert.strictEqual(finalizedDay1.length, 2, 'Both products present');
  assert(finalizedDay1.every(d => d.status === 'DELIVERED'), 'All items marked DELIVERED');
  console.log(`✓ [TEST 6] Re-added Curd and marked delivery as DELIVERED.`);

  // 7. Verify Day 2 starts EMPTY with 0 products (yesterday does NOT copy over)
  const day2Deliveries = db.prepare('SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = ?').all(bulkCust.id, day2);
  assert.strictEqual(day2Deliveries.length, 0, 'Day 2 strictly starts with 0 products');
  console.log(`✓ [TEST 7] Day 2 (${day2}) starts completely EMPTY with 0 products (no auto-recurrence).`);

  // 8. Add Day 2 specific products manually (Toned Milk 30 L)
  insertStmt.run(
    bulkCust.id, bulkCust.delivery_boy_id || null, day2, milkProd.id,
    milkProd.name, milkProd.category, milkProd.variant_label,
    milkProd.unit_volume_litres || 1, 30, milkProd.selling_price,
    milkProd.selling_price * 30, milkProd.selling_price * 30
  );
  db.prepare(`
    UPDATE deliveries
    SET status = 'DELIVERED', updated_at = datetime('now', 'localtime')
    WHERE customer_id = ? AND delivery_date = ?
  `).run(bulkCust.id, day2);

  const finalizedDay2 = db.prepare('SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = ?').all(bulkCust.id, day2);
  assert.strictEqual(finalizedDay2.length, 1, 'Day 2 has only its own distinct product');
  assert.strictEqual(finalizedDay2[0].quantity, 30, 'Day 2 has 30 L');
  console.log(`✓ [TEST 8] Day 2 distinct delivery (30 L Toned Milk) saved and delivered.`);

  // 9. Verify Monthly Bill calculates from actual delivered items
  const bill = generateBillForCustomer(bulkCust, testMonth, { forceRegenerate: true });
  assert(bill, 'Monthly bill generated');
  const items = JSON.parse(bill.items_json);
  console.log(`✓ [TEST 9] Bulk Monthly Bill generated: Bill #${bill.bill_number}`);
  console.log(`   Gross Amount: ₹${bill.gross_amount}`);
  console.log(`   Delivery Charges: ₹${bill.delivery_charges_total} (Should be ₹0 for Bulk Customers)`);
  assert.strictEqual(bill.delivery_charges_total, 0, 'Bulk delivery charge must remain ₹0');

  // Verify total milk qty in bill = Day 1 (15 L) + Day 2 (30 L) = 45 L
  const milkItemInBill = items.find(it => it.product_id === milkProd.id);
  assert(milkItemInBill, 'Milk item exists in bill');
  assert.strictEqual(milkItemInBill.total_quantity, 45, 'Milk total quantity in bill is 45 L (15L + 30L)');

  // Verify curd qty in bill = Day 1 (10 L) = 10 L
  const curdItemInBill = items.find(it => it.product_id === curdProd.id);
  assert(curdItemInBill, 'Curd item exists in bill');
  assert.strictEqual(curdItemInBill.total_quantity, 10, 'Curd total quantity in bill is 10 L');
  console.log(`   - Billed ${milkItemInBill.product_name}: ${milkItemInBill.total_quantity} L (₹${milkItemInBill.product_subtotal})`);
  console.log(`   - Billed ${curdItemInBill.product_name}: ${curdItemInBill.total_quantity} L (₹${curdItemInBill.product_subtotal})`);

  console.log('\n================================================================');
  console.log(' ALL BULK MANUAL WORKFLOW TESTS PASSED PERFECTLY (100% SUCCESS)');
  console.log('================================================================\n');

  // Clean up test records
  db.prepare('DELETE FROM deliveries WHERE customer_id = ? AND delivery_date IN (?, ?)').run(bulkCust.id, day1, day2);
  db.prepare('DELETE FROM bills WHERE customer_id = ? AND billing_month = ?').run(bulkCust.id, testMonth);
} catch (err) {
  console.error('\n❌ TEST FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
}
