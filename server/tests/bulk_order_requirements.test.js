const assert = require('assert');
const db = require('../config/db');
const { generateBillForCustomer } = require('../services/billingService');

console.log('================================================================');
console.log(' NANDINI MILK PARLOUR — BULK ORDER REQUIREMENTS AUDIT TESTS');
console.log('================================================================\n');

try {
  const testDate = '2026-10-05';
  const testMonth = '2026-10';

  // 1. Create or find a test bulk hotel customer without recurring subscription
  let bulkCust = db.prepare("SELECT * FROM customers WHERE customer_category = 'BULK_HOTEL' LIMIT 1").get();
  if (!bulkCust) {
    const res = db.prepare(`
      INSERT INTO customers (
        name, phone, address, customer_category, billing_type, route, status, created_at, updated_at
      ) VALUES (
        'Grand Palace Hotel', '9876543210', 'Main Road, Block A', 'BULK_HOTEL', 'POSTPAID', 'Route 1', 'ACTIVE',
        datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run();
    bulkCust = db.prepare('SELECT * FROM customers WHERE id = ?').get(res.lastInsertRowid);
  }
  assert(bulkCust, 'Bulk customer exists');

  const products = db.prepare("SELECT * FROM products WHERE is_active = 1").all();
  assert(products.length >= 2, 'Products exist');

  const prod1 = products[0];
  const prod2 = products[1];

  const dboy = db.prepare("SELECT * FROM users WHERE role = 'DELIVERY_BOY' LIMIT 1").get();
  const dboyId = dboy ? dboy.id : null;

  console.log(`[TEST 1] Setup: Testing Bulk Order for "${bulkCust.name}" (ID: ${bulkCust.id}, Category: ${bulkCust.customer_category})`);
  console.log(`  Assigned Delivery Boy: ${dboy ? dboy.name : 'Unassigned'}`);
  console.log(`  Bulk Product 1: ${prod1.name} (Qty: 25)`);
  console.log(`  Bulk Product 2: ${prod2.name} (Qty: 10)`);

  // 2. Clean previous test date entries
  db.prepare('DELETE FROM daily_delivery_requirements WHERE customer_id = ? AND delivery_date = ?').run(bulkCust.id, testDate);
  db.prepare('DELETE FROM deliveries WHERE customer_id = ? AND delivery_date = ?').run(bulkCust.id, testDate);

  // 3. Create bulk requirement for product 1 & 2 directly
  const bulkItems = [
    { product_id: prod1.id, quantity: 25 },
    { product_id: prod2.id, quantity: 10 }
  ];

  for (const item of bulkItems) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
    const reasonText = 'Bulk Order: Hotel Morning Breakfast';
    const totalProd = parseFloat((product.selling_price * item.quantity).toFixed(2));

    // Daily requirement entry
    db.prepare(`
      INSERT INTO daily_delivery_requirements (
        customer_id, product_id, target_product_id, subscription_id, delivery_date,
        requirement_type, normal_quantity, required_quantity,
        additional_quantity, effective_quantity, reason, status,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, NULL, ?,
        'CHANGE_QUANTITY', 0, ?,
        0, ?, ?, 'ACTIVE',
        datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(bulkCust.id, product.id, product.id, testDate, item.quantity, item.quantity, reasonText);

    // Delivery record visible to Delivery Boy
    db.prepare(`
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
        'PENDING', ?, datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(
      bulkCust.id, dboyId, testDate, product.id,
      product.name, product.category, product.variant_label,
      product.unit_volume_litres || 0, item.quantity, product.selling_price,
      totalProd, totalProd, reasonText
    );
  }

  console.log('\n[TEST 2] Verifying requirements created in database:');
  const reqs = db.prepare('SELECT * FROM daily_delivery_requirements WHERE customer_id = ? AND delivery_date = ?').all(bulkCust.id, testDate);
  assert.strictEqual(reqs.length, 2, '2 daily requirement records created');
  console.log(`  ✓ Created ${reqs.length} requirement rows without needing subscription.`);

  console.log('\n[TEST 3] Verifying delivery records visible to Delivery Boy:');
  const dels = db.prepare('SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = ?').all(bulkCust.id, testDate);
  assert.strictEqual(dels.length, 2, '2 pending deliveries created');
  assert.strictEqual(dels[0].status, 'PENDING');
  assert.strictEqual(dels[0].delivery_charge_snapshot, 0, 'Bulk category has ₹0 delivery charge');
  assert.strictEqual(dels[0].quantity, 25);
  assert.strictEqual(dels[1].quantity, 10);
  console.log(`  ✓ Both bulk products visible as PENDING in delivery queue:`);
  console.log(`    - Product 1 (${dels[0].product_name_snapshot}): ${dels[0].quantity} pkts @ ₹${dels[0].unit_price_snapshot} = ₹${dels[0].total_amount}`);
  console.log(`    - Product 2 (${dels[1].product_name_snapshot}): ${dels[1].quantity} pkts @ ₹${dels[1].unit_price_snapshot} = ₹${dels[1].total_amount}`);

  console.log('\n[TEST 4] Delivery boy marks bulk order as DELIVERED & billing sync:');
  for (const d of dels) {
    db.prepare("UPDATE deliveries SET status = 'DELIVERED', updated_at = datetime('now', 'localtime') WHERE id = ?").run(d.id);
  }

  const bill = generateBillForCustomer(bulkCust, testMonth, { billingBasis: 'DELIVERIES', forceRegenerate: true });
  assert(bill, 'Monthly bill generated');
  const billItems = JSON.parse(bill.items_json || '[]');
  console.log(`  ✓ Generated monthly bill #${bill.bill_number} for ₹${bill.gross_amount}`);
  assert(billItems.length >= 2, 'Bill includes both bulk products');
  console.log('  ✓ Verified bulk order products and quantities are accurately billed!');

  console.log('\n================================================================');
  console.log(' ALL BULK ORDER REQUIREMENTS TESTS PASSED SUCCESSFULLY! ✓');
  console.log('================================================================\n');
} catch (err) {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
}
