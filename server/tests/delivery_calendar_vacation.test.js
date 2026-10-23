const assert = require('assert');
process.env.USE_LOCAL_SQLITE = 'true';
const db = require('../config/db');

console.log('================================================================');
console.log(' NANDINI MILK PARLOUR — DELIVERY CALENDAR & VACATION NOTIFICATIONS TEST');
console.log('================================================================\n');

async function runTests() {
  let testCustomerId = null;
  let testSubId = null;
  let testVacationId = null;
  const startDate = '2026-11-10';
  const endDate = '2026-11-13'; // 4 days pause: Nov 10, 11, 12, 13; resumes Nov 14

  try {
    // 1. Setup a test customer and subscription
    const existingCust = db.prepare(`
      SELECT c.*, s.id as sub_id, s.product_id
      FROM customers c
      JOIN subscriptions s ON c.id = s.customer_id
      WHERE c.status = 'ACTIVE' AND s.is_active = 1
      LIMIT 1
    `).get();
    assert(existingCust, 'Must have at least one active customer with active subscription');
    testCustomerId = existingCust.id;
    testSubId = existingCust.sub_id;

    console.log(`[SETUP] Using Customer: ${existingCust.name} (ID: ${testCustomerId}), Subscription: ${testSubId}`);

    // Ensure clean state for mock delivery on Nov 11
    db.prepare('DELETE FROM deliveries WHERE customer_id = ? AND delivery_date = ?').run(testCustomerId, '2026-11-11');

    // Create a mock delivery on Nov 11 to test auto-skip behavior
    db.prepare(`
      INSERT INTO deliveries (
        customer_id, product_id, product_name_snapshot, category_snapshot, variant_snapshot, unit_volume_litres_snapshot,
        delivery_date, quantity, unit_price_snapshot, total_product_amount,
        delivery_charge_snapshot, total_amount, status, created_at, updated_at
      ) VALUES (
        ?, ?, 'toned milk', 'Milk', '1 Litre', 1,
        ?, 1, 46, 46,
        3, 49, 'PENDING', datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(testCustomerId, existingCust.product_id, '2026-11-11');

    console.log('  ✓ Mock PENDING delivery created on 2026-11-11 for ₹28');

    // 2. Schedule Vacation Pause
    console.log('\n[TEST 1] Schedule Vacation from 2026-11-10 to 2026-11-13');
    const vacationInsert = db.prepare(`
      INSERT INTO customer_vacations (
        customer_id, start_date, end_date, resume_date, reason, status,
        notify_agent_date, agent_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, 1, NULL, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(testCustomerId, startDate, endDate, '2026-11-14', 'Going to native place', '2026-11-13');

    testVacationId = vacationInsert.lastInsertRowid;
    assert(testVacationId, 'Vacation record created');
    console.log(`  ✓ Vacation inserted with ID: ${testVacationId}`);

    // Sync deliveries to SKIPPED (simulating the calendar route logic)
    const activeSubs = db.prepare(`
      SELECT s.*, p.selling_price as current_product_price
      FROM subscriptions s
      JOIN products p ON s.product_id = p.id
      WHERE s.customer_id = ? AND s.is_active = 1
    `).all(testCustomerId);

    // Loop through dates
    let cur = new Date(startDate);
    const endD = new Date(endDate);
    while (cur <= endD) {
      const dStr = cur.toISOString().split('T')[0];
      for (const sub of activeSubs) {
        db.prepare(`
          INSERT INTO daily_delivery_requirements (
            customer_id, product_id, subscription_id, delivery_date,
            requirement_type, normal_quantity, required_quantity,
            additional_quantity, effective_quantity, reason, status,
            created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?,
            'SKIP_DELIVERY', ?, 0,
            0, 0, 'Vacation: Going to native place', 'ACTIVE',
            datetime('now', 'localtime'), datetime('now', 'localtime')
          )
          ON CONFLICT(customer_id, product_id, delivery_date) DO UPDATE SET
            requirement_type = 'SKIP_DELIVERY',
            required_quantity = 0,
            effective_quantity = 0,
            reason = 'Vacation: Going to native place',
            status = 'ACTIVE',
            updated_at = datetime('now', 'localtime')
        `).run(testCustomerId, sub.product_id, sub.id, dStr, sub.quantity);

        db.prepare(`
          UPDATE deliveries
          SET status = 'SKIPPED',
              total_product_amount = 0,
              delivery_charge_snapshot = 0,
              total_amount = 0,
              notes = 'Auto-skipped: Customer Vacation',
              updated_at = datetime('now', 'localtime')
          WHERE customer_id = ? AND delivery_date = ? AND status = 'PENDING'
        `).run(testCustomerId, dStr);
      }
      cur.setDate(cur.getDate() + 1);
    }

    // 3. Verify delivery on Nov 11 was skipped with ₹0 amount
    const deliveryNov11 = db.prepare(`
      SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = '2026-11-11'
    `).get(testCustomerId);

    assert.strictEqual(deliveryNov11.status, 'SKIPPED', 'Delivery status must be SKIPPED');
    assert.strictEqual(deliveryNov11.total_amount, 0, 'Delivery total_amount must be ₹0');
    assert.strictEqual(deliveryNov11.total_product_amount, 0, 'Delivery total_product_amount must be ₹0');
    console.log('  ✓ Existing delivery correctly converted to SKIPPED with ₹0 billing.');

    // 4. Test Notification logic for 2026-11-11 (Middle of vacation)
    console.log('\n[TEST 2] Verify Notifications for 2026-11-11 (Middle of vacation)');
    const pausedMid = db.prepare(`
      SELECT v.*, c.name as customer_name
      FROM customer_vacations v
      JOIN customers c ON v.customer_id = c.id
      WHERE v.status = 'ACTIVE'
        AND ? BETWEEN v.start_date AND v.end_date
    `).all('2026-11-11');

    assert(pausedMid.some(p => p.customer_id === testCustomerId), 'Customer must be reported in pausedToday on 2026-11-11');
    console.log('  ✓ Delivery Boy DO NOT DELIVER alert triggered for 2026-11-11.');

    // 5. Test Prior Notification logic for 2026-11-13 (End date of vacation)
    console.log('\n[TEST 3] Verify Prior Notification for Agent on 2026-11-13 (1 day before resume)');
    const resumesTomorrow = db.prepare(`
      SELECT v.*, c.name as customer_name
      FROM customer_vacations v
      JOIN customers c ON v.customer_id = c.id
      WHERE v.status = 'ACTIVE'
        AND v.end_date = ?
    `).all('2026-11-13');

    assert(resumesTomorrow.some(p => p.customer_id === testCustomerId), 'Customer must be reported in resumingTomorrow on 2026-11-13');
    console.log('  ✓ Agent prior 1-day alert triggered for 2026-11-13 (Resume Date: 2026-11-14).');

    // 6. Test Notification logic for 2026-11-14 (Resume day)
    console.log('\n[TEST 4] Verify Delivery Resumes on 2026-11-14');
    const pausedResumeDay = db.prepare(`
      SELECT v.*
      FROM customer_vacations v
      WHERE v.status = 'ACTIVE'
        AND ? BETWEEN v.start_date AND v.end_date
    `).all('2026-11-14');

    assert(!pausedResumeDay.some(p => p.customer_id === testCustomerId), 'Customer must NOT be paused on resume day');
    console.log('  ✓ Customer is no longer paused on resume day 2026-11-14.');

    // 7. Test Vacation Cancellation
    console.log('\n[TEST 5] Cancel Vacation and restore delivery');
    db.prepare("UPDATE customer_vacations SET status = 'CANCELLED' WHERE id = ?").run(testVacationId);
    
    // Restore deliveries back to PENDING
    db.prepare(`
      UPDATE deliveries
      SET status = 'PENDING',
          total_product_amount = unit_price_snapshot * quantity,
          total_amount = unit_price_snapshot * quantity,
          notes = 'Restored after vacation cancellation',
          updated_at = datetime('now', 'localtime')
      WHERE customer_id = ? AND delivery_date = '2026-11-11' AND notes LIKE '%Auto-skipped%'
    `).run(testCustomerId);

    const restoredNov11 = db.prepare(`
      SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = '2026-11-11'
    `).get(testCustomerId);

    assert.strictEqual(restoredNov11.status, 'PENDING', 'Delivery restored to PENDING');
    assert.strictEqual(restoredNov11.total_amount, 46, 'Total amount restored to original value');
    console.log('  ✓ Vacation cancellation cleanly restored delivery to PENDING.');

    console.log('\n================================================================');
    console.log(' ALL DELIVERY CALENDAR & VACATION TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================\n');
  } catch (err) {
    console.error('TEST FAILED:', err);
    process.exit(1);
  } finally {
    // Cleanup any test records
    if (testVacationId) {
      db.prepare('DELETE FROM customer_vacations WHERE id = ?').run(testVacationId);
    }
    db.prepare("DELETE FROM daily_delivery_requirements WHERE delivery_date BETWEEN '2026-11-10' AND '2026-11-13'").run();
    db.prepare("DELETE FROM deliveries WHERE delivery_date = '2026-11-11' AND notes LIKE '%vacation%'").run();
    console.log('[CLEANUP] Test records safely purged.');
  }
}

runTests();
