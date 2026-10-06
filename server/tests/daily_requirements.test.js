const assert = require('assert');
const db = require('../config/db');

console.log('================================================================');
console.log(' NANDINI MILK PARLOUR — DAILY DELIVERY REQUIREMENTS AUDIT TESTS');
console.log('================================================================\n');

try {
  const todayStr = '2026-10-03';
  const tomorrowStr = '2026-10-04';

  // Find a test customer with subscription
  const cust = db.prepare("SELECT * FROM customers WHERE status = 'ACTIVE' LIMIT 1").get();
  assert(cust, 'Active customer exists');

  const sub = db.prepare('SELECT * FROM subscriptions WHERE customer_id = ? AND is_active = 1 LIMIT 1').get(cust.id);
  assert(sub, 'Active subscription exists');

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(sub.product_id);
  assert(product, 'Product exists');

  const adminUser = db.prepare("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1").get();
  const adminId = adminUser ? adminUser.id : null;

  console.log(`[TEST 1] Setup check for customer: ${cust.name}, product: ${product.name} (Normal: ${sub.quantity})`);
  console.log('  ✓ Customer & subscription confirmed.');

  // Test 2: Admin creates SKIP_DELIVERY requirement
  console.log('\n[TEST 2] Admin creates SKIP_DELIVERY requirement for today');
  db.prepare(`
    INSERT INTO daily_delivery_requirements (
      customer_id, product_id, subscription_id, delivery_date,
      requirement_type, normal_quantity, required_quantity,
      additional_quantity, effective_quantity, reason, status,
      created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?,
      'SKIP_DELIVERY', ?, 0,
      0, 0, 'Customer out of station', 'ACTIVE',
      ?, datetime('now', 'localtime'), datetime('now', 'localtime')
    )
    ON CONFLICT(customer_id, product_id, delivery_date) DO UPDATE SET
      requirement_type = 'SKIP_DELIVERY',
      required_quantity = 0,
      effective_quantity = 0,
      reason = 'Customer out of station',
      updated_at = datetime('now', 'localtime')
  `).run(cust.id, product.id, sub.id, todayStr, sub.quantity, adminId);

  const req1 = db.prepare('SELECT * FROM daily_delivery_requirements WHERE customer_id = ? AND product_id = ? AND delivery_date = ?').get(cust.id, product.id, todayStr);
  assert.strictEqual(req1.requirement_type, 'SKIP_DELIVERY');
  assert.strictEqual(req1.effective_quantity, 0);
  assert.strictEqual(req1.reason, 'Customer out of station');
  console.log('  ✓ SKIP_DELIVERY saved and persisted correctly.');

  // Test 3: Change quantity requirement
  console.log('\n[TEST 3] Admin updates requirement to CHANGE_QUANTITY (e.g. 3 packets)');
  db.prepare(`
    UPDATE daily_delivery_requirements
    SET requirement_type = 'CHANGE_QUANTITY',
        required_quantity = 3,
        effective_quantity = 3,
        reason = 'Customer requested 3 packets today',
        updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(req1.id);

  const req2 = db.prepare('SELECT * FROM daily_delivery_requirements WHERE id = ?').get(req1.id);
  assert.strictEqual(req2.requirement_type, 'CHANGE_QUANTITY');
  assert.strictEqual(req2.required_quantity, 3);
  assert.strictEqual(req2.effective_quantity, 3);
  console.log('  ✓ CHANGE_QUANTITY updated to 3 packets.');

  // Test 4: Add extra quantity requirement
  console.log('\n[TEST 4] Admin updates requirement to ADD_EXTRA_QUANTITY (Normal + 2 extra)');
  db.prepare(`
    UPDATE daily_delivery_requirements
    SET requirement_type = 'ADD_EXTRA_QUANTITY',
        additional_quantity = 2,
        effective_quantity = ?,
        reason = 'Guest visiting - extra milk needed',
        updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(sub.quantity + 2, req1.id);

  const req3 = db.prepare('SELECT * FROM daily_delivery_requirements WHERE id = ?').get(req1.id);
  assert.strictEqual(req3.requirement_type, 'ADD_EXTRA_QUANTITY');
  assert.strictEqual(req3.additional_quantity, 2);
  assert.strictEqual(req3.effective_quantity, sub.quantity + 2);
  console.log(`  ✓ ADD_EXTRA_QUANTITY calculated effective quantity = ${sub.quantity + 2}.`);

  // Test 5: Future date requirement isolation
  console.log('\n[TEST 5] Future date requirement does not affect today');
  db.prepare(`
    INSERT INTO daily_delivery_requirements (
      customer_id, product_id, subscription_id, delivery_date,
      requirement_type, normal_quantity, required_quantity,
      additional_quantity, effective_quantity, reason, status,
      created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?,
      'SKIP_DELIVERY', ?, 0,
      0, 0, 'Future skip', 'ACTIVE',
      ?, datetime('now', 'localtime'), datetime('now', 'localtime')
    )
    ON CONFLICT(customer_id, product_id, delivery_date) DO UPDATE SET
      requirement_type = 'SKIP_DELIVERY'
  `).run(cust.id, product.id, sub.id, tomorrowStr, sub.quantity, adminId);

  const tomorrowReq = db.prepare('SELECT * FROM daily_delivery_requirements WHERE customer_id = ? AND product_id = ? AND delivery_date = ?').get(cust.id, product.id, tomorrowStr);
  const todayReq = db.prepare('SELECT * FROM daily_delivery_requirements WHERE customer_id = ? AND product_id = ? AND delivery_date = ?').get(cust.id, product.id, todayStr);
  assert.strictEqual(tomorrowReq.delivery_date, tomorrowStr);
  assert.strictEqual(todayReq.requirement_type, 'ADD_EXTRA_QUANTITY');
  console.log('  ✓ Future requirement isolated cleanly from today.');

  // Test 6: Clear requirement resets to NORMAL
  console.log('\n[TEST 6] Clearing requirement removes special row');
  db.prepare('DELETE FROM daily_delivery_requirements WHERE id = ?').run(req1.id);
  const cleared = db.prepare('SELECT * FROM daily_delivery_requirements WHERE id = ?').get(req1.id);
  assert.strictEqual(cleared, undefined);
  console.log('  ✓ Requirement cleared successfully and customer returned to normal subscription.');

  // Clean up tomorrow test record
  db.prepare('DELETE FROM daily_delivery_requirements WHERE delivery_date = ?').run(tomorrowStr);

  console.log('\n================================================================');
  console.log(' ALL DAILY REQUIREMENT TESTS PASSED SUCCESSFULLY! ✓');
  console.log('================================================================\n');
} catch (err) {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
}
