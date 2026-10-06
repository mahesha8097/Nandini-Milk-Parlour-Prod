const assert = require('assert');
const db = require('../config/db');
const { calculateDeliveryChargesForCustomerDay } = require('../services/deliveryChargeService');
const { generateBillForCustomer } = require('../services/billingService');

console.log('================================================================');
console.log(' NANDINI MILK PARLOUR — EXTRA PRODUCT ON DELIVERY AUDIT TESTS');
console.log('================================================================\n');

try {
  const testDate = '2026-10-04';
  const testMonth = '2026-10';

  // 1. Get an active customer and delivery boy
  const cust = db.prepare("SELECT * FROM customers WHERE status = 'ACTIVE' LIMIT 1").get();
  assert(cust, 'Active customer exists');

  const products = db.prepare("SELECT * FROM products WHERE is_active = 1").all();
  assert(products.length >= 2, 'At least 2 active products exist');

  const prod1 = products[0];
  const prod2 = products[1];

  console.log(`[TEST 1] Setup: Testing with Customer "${cust.name}" (ID: ${cust.id})`);
  console.log(`  Product 1: ${prod1.name} (${prod1.variant_label}) - ₹${prod1.selling_price}`);
  console.log(`  Product 2: ${prod2.name} (${prod2.variant_label}) - ₹${prod2.selling_price}`);

  // 2. Clear test date delivery records for clean testing
  db.prepare('DELETE FROM deliveries WHERE customer_id = ? AND delivery_date = ?').run(cust.id, testDate);

  // 3. Add first product as normal delivery
  const calc1 = calculateDeliveryChargesForCustomerDay(cust.customer_category, [{
    productId: prod1.id,
    productName: prod1.name,
    category: prod1.category,
    variantLabel: prod1.variant_label,
    unitVolumeLitres: prod1.unit_volume_litres,
    quantity: 1,
    sellingPrice: prod1.selling_price,
    deliveryChargeType: prod1.delivery_charge_type,
    fixedDeliveryCharge: prod1.fixed_delivery_charge
  }]);

  const charge1 = calc1[0]?.deliveryCharge || 0;
  const total1 = parseFloat((prod1.selling_price * 1 + charge1).toFixed(2));

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
      ?, 1, ?,
      ?, ?, ?,
      'DELIVERED', 'Regular daily delivery', datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run(
    cust.id, cust.delivery_boy_id || null, testDate, prod1.id,
    prod1.name, prod1.category, prod1.variant_label,
    prod1.unit_volume_litres, prod1.selling_price,
    prod1.selling_price, charge1, total1
  );

  console.log('\n[TEST 2] Regular delivery created for product 1');
  const d1 = db.prepare('SELECT * FROM deliveries WHERE customer_id = ? AND product_id = ? AND delivery_date = ?').get(cust.id, prod1.id, testDate);
  assert.strictEqual(d1.quantity, 1);
  assert.strictEqual(d1.status, 'DELIVERED');
  console.log('  ✓ Verified regular delivery row in database.');

  // 4. Test adding an extra product on the spot (Product 2 - e.g. Curd)
  console.log('\n[TEST 3] Delivery Boy adds extra product (Product 2) on spot');
  const calc2 = calculateDeliveryChargesForCustomerDay(cust.customer_category, [{
    productId: prod2.id,
    productName: prod2.name,
    category: prod2.category,
    variantLabel: prod2.variant_label,
    unitVolumeLitres: prod2.unit_volume_litres,
    quantity: 2,
    sellingPrice: prod2.selling_price,
    deliveryChargeType: prod2.delivery_charge_type,
    fixedDeliveryCharge: prod2.fixed_delivery_charge
  }]);

  const charge2 = calc2[0]?.deliveryCharge || 0;
  const prodAmt2 = parseFloat((prod2.selling_price * 2).toFixed(2));
  const total2 = parseFloat((prodAmt2 + charge2).toFixed(2));

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
      ?, 2, ?,
      ?, ?, ?,
      'DELIVERED', 'Extra product: Customer requested on spot', datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run(
    cust.id, cust.delivery_boy_id || null, testDate, prod2.id,
    prod2.name, prod2.category, prod2.variant_label,
    prod2.unit_volume_litres, prod2.selling_price,
    prodAmt2, charge2, total2
  );

  const d2 = db.prepare('SELECT * FROM deliveries WHERE customer_id = ? AND product_id = ? AND delivery_date = ?').get(cust.id, prod2.id, testDate);
  assert.strictEqual(d2.quantity, 2);
  assert.strictEqual(d2.status, 'DELIVERED');
  assert(d2.notes.includes('Extra product'));
  console.log(`  ✓ Product 2 recorded as delivered (2 units, Total: ₹${d2.total_amount}).`);

  // 5. Test adding extra quantity of existing product (Product 1 + 1 extra packet)
  console.log('\n[TEST 4] Customer requests 1 extra packet of existing Product 1');
  const newQty = d1.quantity + 1;
  const newProdAmt1 = parseFloat((prod1.selling_price * newQty).toFixed(2));
  const newCalc1 = calculateDeliveryChargesForCustomerDay(cust.customer_category, [{
    productId: prod1.id,
    productName: prod1.name,
    category: prod1.category,
    variantLabel: prod1.variant_label,
    unitVolumeLitres: prod1.unit_volume_litres,
    quantity: newQty,
    sellingPrice: prod1.selling_price,
    deliveryChargeType: prod1.delivery_charge_type,
    fixedDeliveryCharge: prod1.fixed_delivery_charge
  }]);
  const newCharge1 = newCalc1[0]?.deliveryCharge || 0;
  const newTotal1 = parseFloat((newProdAmt1 + newCharge1).toFixed(2));

  db.prepare(`
    UPDATE deliveries
    SET quantity = ?,
        total_product_amount = ?,
        delivery_charge_snapshot = ?,
        total_amount = ?,
        status = 'DELIVERED',
        notes = notes || ' [+1 extra packet on delivery]',
        updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(newQty, newProdAmt1, newCharge1, newTotal1, d1.id);

  const d1Updated = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(d1.id);
  assert.strictEqual(d1Updated.quantity, 2);
  assert.strictEqual(d1Updated.total_amount, newTotal1);
  console.log(`  ✓ Product 1 quantity increased to 2 packets (Total: ₹${d1Updated.total_amount}).`);

  // 6. Test Billing Integration: Generate Delivered Milk Bill
  console.log('\n[TEST 5] Monthly Bill includes both regular and extra products');
  const bill = generateBillForCustomer(cust, testMonth, { billingBasis: 'DELIVERIES', forceRegenerate: true });
  assert(bill, 'Monthly bill generated successfully');

  const items = JSON.parse(bill.items_json || '[]');
  console.log(`  ✓ Generated Bill #${bill.bill_number} for ₹${bill.gross_amount}`);
  console.log(`  ✓ Items on invoice (${items.length} product lines):`);
  items.forEach((it, idx) => {
    console.log(`    ${idx + 1}. ${it.product_name} (${it.variant_label}): ${it.quantity} units, Total: ₹${it.total_line_amount}`);
  });

  // Verify that both products and their extra quantities are in the bill
  const billProd1 = items.find(i => i.product_id === prod1.id);
  const billProd2 = items.find(i => i.product_id === prod2.id);

  assert(billProd1, 'Product 1 is present in monthly bill');
  assert(billProd2, 'Product 2 (Extra product) is present in monthly bill');
  assert(billProd1.total_quantity >= 2, 'Product 1 includes the extra packet in total quantity');
  assert(billProd2.total_quantity >= 2, 'Product 2 includes both extra units in total quantity');

  console.log('\n================================================================');
  console.log(' ALL EXTRA PRODUCT DELIVERY & BILLING TESTS PASSED! ✓');
  console.log('================================================================\n');
} catch (err) {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
}
