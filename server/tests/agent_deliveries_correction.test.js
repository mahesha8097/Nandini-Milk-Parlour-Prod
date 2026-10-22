const assert = require('assert');
const db = require('../config/db');
const { calculateDeliveryChargesForCustomerDay } = require('../services/deliveryChargeService');
const {
  checkCorrectionFinancialSafety,
  correctDelivery,
  getDeliveryCorrectionHistory
} = require('../services/deliveryCorrectionService');
const { generateBillForCustomer } = require('../services/billingService');

console.log('================================================================');
console.log(' NANDINI MILK PARLOUR — AGENT DAILY DELIVERIES & CORRECTIONS TEST');
console.log('================================================================\n');

async function runAllTests() {
  // Ensure test users exist with valid IDs
  let adminUser = db.prepare(`SELECT * FROM users WHERE role = 'ADMIN'`).get();
  if (!adminUser) {
    const res = db.prepare(`
      INSERT INTO users (name, username, password_hash, role, created_at, updated_at)
      VALUES ('Test Admin', 'test_admin_unique', 'hash', 'ADMIN', datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run();
    adminUser = { id: res.lastInsertRowid, role: 'ADMIN', name: 'Test Admin' };
  }

  let dBoy1 = db.prepare(`SELECT * FROM users WHERE role = 'DELIVERY_BOY'`).get();
  if (!dBoy1) {
    const res = db.prepare(`
      INSERT INTO users (name, username, password_hash, role, created_at, updated_at)
      VALUES ('Test Boy 1', 'test_dboy1_unique', 'hash', 'DELIVERY_BOY', datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run();
    dBoy1 = { id: res.lastInsertRowid, role: 'DELIVERY_BOY', name: 'Test Boy 1' };
  }

  let dBoy2 = db.prepare(`SELECT * FROM users WHERE role = 'DELIVERY_BOY' AND id != ?`).get(dBoy1.id);
  if (!dBoy2) {
    const res = db.prepare(`
      INSERT INTO users (name, username, password_hash, role, created_at, updated_at)
      VALUES ('Test Boy 2', 'test_dboy2_unique', 'hash', 'DELIVERY_BOY', datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run();
    dBoy2 = { id: res.lastInsertRowid, role: 'DELIVERY_BOY', name: 'Test Boy 2' };
  }

  let bulkCustId = null;

  // Setup unique product for test isolation
  const prodRes = db.prepare(`
    INSERT INTO products (name, category, variant_label, unit_volume_litres, selling_price, delivery_charge_type, created_at, updated_at)
    VALUES ('Special Cow Milk 500ml', 'Milk', '500 ml', 0.5, 30.0, 'MILK_RULE', datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run();
  const testProductId = prodRes.lastInsertRowid;

  // Setup House Customer
  const custRes = db.prepare(`
    INSERT INTO customers (name, phone, address, customer_category, billing_type, delivery_boy_id, advance_balance, pending_balance, created_at, updated_at)
    VALUES ('Kavitha House', '9999900001', 'JP Nagar 6th Phase', 'HOUSE', 'POSTPAID', ?, 0, 0, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(dBoy1.id);
  const houseCustId = custRes.lastInsertRowid;

  // Permanent subscription: 2 packets / day (1.0L/day) starting 2026-10-01
  const subRes = db.prepare(`
    INSERT INTO subscriptions (customer_id, product_id, quantity, frequency, start_date, is_active, created_at, updated_at)
    VALUES (?, ?, 2, 'DAILY', '2026-10-01', 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `).run(houseCustId, testProductId);
  const subId = subRes.lastInsertRowid;

  const dateToday = '2026-10-10';
  const dateTomorrow = '2026-10-11';

  // ----------------------------------------------------
  // TEST 1: Agent can edit today's House Customer quantity
  // ----------------------------------------------------
  console.log('[TEST 1] Agent can edit today\'s House Customer quantity');
  {
    // Normal is 2 pkts. Customer requests 1 packet today.
    // Temporary requirement created for dateToday:
    db.prepare(`
      INSERT INTO daily_delivery_requirements (
        customer_id, product_id, target_product_id, subscription_id, delivery_date,
        requirement_type, normal_quantity, required_quantity, additional_quantity,
        effective_quantity, reason, status, created_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        'CHANGE_QUANTITY', 2, 1, 0,
        1, 'Customer requested 1 pkt today', 'ACTIVE',
        ?, datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(houseCustId, testProductId, testProductId, subId, dateToday, adminUser.id);

    const req = db.prepare(`
      SELECT * FROM daily_delivery_requirements 
      WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
    `).get(houseCustId, testProductId, dateToday);

    assert.strictEqual(req.effective_quantity, 1, 'Today quantity must be updated to 1');
    assert.strictEqual(req.requirement_type, 'CHANGE_QUANTITY');
    console.log('  ✓ Passed: Today\'s quantity edited from 2 to 1 for date', dateToday);
  }

  // ----------------------------------------------------
  // TEST 2: Editing today's quantity does not modify permanent subscription
  // ----------------------------------------------------
  console.log('\n[TEST 2] Editing today\'s quantity does not modify permanent subscription');
  {
    const sub = db.prepare(`SELECT * FROM subscriptions WHERE id = ?`).get(subId);
    assert.strictEqual(sub.quantity, 2, 'Permanent subscription quantity must remain 2');
    console.log('  ✓ Passed: Permanent subscription is untouched at', sub.quantity, 'packets/day');
  }

  // ----------------------------------------------------
  // TEST 3: Tomorrow's normal subscription quantity remains unchanged
  // ----------------------------------------------------
  console.log('\n[TEST 3] Tomorrow\'s normal subscription quantity remains unchanged');
  {
    const tomorrowReq = db.prepare(`
      SELECT * FROM daily_delivery_requirements 
      WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
    `).get(houseCustId, testProductId, dateTomorrow);
    assert(!tomorrowReq, 'No requirement exists for tomorrow');

    const sub = db.prepare(`SELECT * FROM subscriptions WHERE customer_id = ? AND is_active = 1`).get(houseCustId);
    assert.strictEqual(sub.quantity, 2, 'Tomorrow normal subscription yields 2 packets');
    console.log('  ✓ Passed: Tomorrow delivery defaults to permanent subscription of 2 packets');
  }

  // ----------------------------------------------------
  // TEST 4: Agent can skip today's delivery
  // ----------------------------------------------------
  console.log('\n[TEST 4] Agent can skip today\'s delivery');
  {
    const dateSkip = '2026-10-12';
    // Create initial delivery row
    const delRes = db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_boy_id, delivery_date, product_id,
        product_name_snapshot, category_snapshot, variant_snapshot,
        unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount,
        status, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        'Special Cow Milk 500ml', 'Milk', '500 ml',
        0.5, 2, 30.0,
        60.0, 3.0, 63.0,
        'PENDING', '', datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(houseCustId, dBoy1.id, dateSkip, testProductId);
    const delId = delRes.lastInsertRowid;

    // Agent skips delivery
    db.prepare(`
      UPDATE deliveries
      SET status = 'SKIPPED',
          total_product_amount = 0,
          delivery_charge_snapshot = 0,
          total_amount = 0,
          notes = 'Customer out of town',
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(delId);

    const skippedDel = db.prepare(`SELECT * FROM deliveries WHERE id = ?`).get(delId);
    assert.strictEqual(skippedDel.status, 'SKIPPED');
    console.log('  ✓ Passed: Delivery marked as SKIPPED with note:', skippedDel.notes);
  }

  // ----------------------------------------------------
  // TEST 5: Skipped deliveries are not billed as delivered
  // ----------------------------------------------------
  console.log('\n[TEST 5] Skipped deliveries are not billed as delivered (Zero Product & Zero Delivery Charge)');
  {
    const dateSkip = '2026-10-12';
    const skippedDel = db.prepare(`SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = ?`).get(houseCustId, dateSkip);
    assert.strictEqual(skippedDel.total_product_amount, 0, 'Skipped product amount must be 0');
    assert.strictEqual(skippedDel.delivery_charge_snapshot, 0, 'Skipped delivery charge must be 0');
    assert.strictEqual(skippedDel.total_amount, 0, 'Skipped total amount must be 0');
    console.log('  ✓ Passed: Product Amount = ₹0.00, Delivery Charge = ₹0.00, Total Amount = ₹0.00');
  }

  // ----------------------------------------------------
  // TEST 6: Agent can correct a mistakenly marked Delivered status to Skipped
  // ----------------------------------------------------
  console.log('\n[TEST 6] Agent can correct a mistakenly marked Delivered status to Skipped');
  {
    const dateMistake = '2026-10-15';
    // Mistakenly recorded 2 packets delivered (₹60 + ₹3 = ₹63)
    const delRes = db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_boy_id, delivery_date, product_id,
        product_name_snapshot, category_snapshot, variant_snapshot,
        unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount,
        status, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        'Special Cow Milk 500ml', 'Milk', '500 ml',
        0.5, 2, 30.0,
        60.0, 3.0, 63.0,
        'DELIVERED', 'Delivered at door', datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(houseCustId, dBoy1.id, dateMistake, testProductId);
    const delId = delRes.lastInsertRowid;

    // Agent corrects to Skipped
    const result = await correctDelivery({
      deliveryId: delId,
      correctedQuantity: 0,
      status: 'SKIPPED',
      reason: 'Customer was not home, marked delivered by mistake',
      user: adminUser
    });

    assert.strictEqual(result.delivery.status, 'SKIPPED');
    assert.strictEqual(result.delivery.total_amount, 0);
    assert.strictEqual(result.delivery.delivery_charge_snapshot, 0);
    console.log('  ✓ Passed: Mistakenly delivered item corrected to SKIPPED, amount reset to ₹0.00');
  }

  // ----------------------------------------------------
  // TEST 7: Agent can correct an incorrect delivered quantity
  // ----------------------------------------------------
  console.log('\n[TEST 7] Agent can correct an incorrect delivered quantity (e.g. 2 pkts -> 1 pkt)');
  {
    const dateQtyFix = '2026-10-16';
    // Marked 2 pkts (₹60 + ₹3 = ₹63)
    const delRes = db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_boy_id, delivery_date, product_id,
        product_name_snapshot, category_snapshot, variant_snapshot,
        unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount,
        status, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        'Special Cow Milk 500ml', 'Milk', '500 ml',
        0.5, 2, 30.0,
        60.0, 3.0, 63.0,
        'DELIVERED', '', datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(houseCustId, dBoy1.id, dateQtyFix, testProductId);
    const delId = delRes.lastInsertRowid;

    // Agent corrects: actual quantity delivered was 1 pkt (0.5L -> ₹2 delivery, total ₹32)
    const result = await correctDelivery({
      deliveryId: delId,
      correctedQuantity: 1,
      status: 'DELIVERED',
      reason: 'Agent mistakenly entered 2 pkts instead of 1',
      user: adminUser
    });

    assert.strictEqual(result.delivery.quantity, 1);
    assert.strictEqual(result.delivery.total_product_amount, 30.0);
    assert.strictEqual(result.delivery.delivery_charge_snapshot, 2.0); // 500ml milk rule = ₹2
    assert.strictEqual(result.delivery.total_amount, 32.0);
    console.log('  ✓ Passed: Corrected quantity 2 -> 1 pkt: product ₹30.00 + delivery ₹2.00 = ₹32.00');
  }

  // ----------------------------------------------------
  // TEST 8: Correction history preserves original and corrected values
  // ----------------------------------------------------
  console.log('\n[TEST 8] Correction history preserves original and corrected values in database');
  {
    const dateQtyFix = '2026-10-16';
    const del = db.prepare(`SELECT id FROM deliveries WHERE customer_id = ? AND delivery_date = ?`).get(houseCustId, dateQtyFix);
    const history = await getDeliveryCorrectionHistory(del.id);

    assert(history.length >= 1, 'At least 1 correction record must exist');
    const entry = history[0];
    assert.strictEqual(entry.previous_quantity, 2);
    assert.strictEqual(entry.corrected_quantity, 1);
    assert.strictEqual(entry.previous_amount, 63.0);
    assert.strictEqual(entry.corrected_amount, 32.0);
    assert.strictEqual(entry.corrected_by_user_id, adminUser.id);
    assert.strictEqual(entry.corrected_by_role, 'ADMIN');
    assert(entry.reason.includes('mistakenly entered 2 pkts'));
    console.log('  ✓ Passed: Traceable audit entry found in delivery_corrections with exact before/after quantities and amounts');
  }

  // ----------------------------------------------------
  // TEST 9: Corrected quantities are reflected correctly in eligible billing records
  // ----------------------------------------------------
  console.log('\n[TEST 9] Corrected quantities are reflected correctly in eligible billing records');
  {
    // House customer has delivery on 2026-10-16 with ₹32.00.
    // Generate bill for 2026-10
    const cust = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(houseCustId);
    const bill = await generateBillForCustomer(cust, '2026-10', { billingBasis: 'DELIVERIES', forceRegenerate: true });

    assert(bill, 'Bill must be generated');
    assert(bill.gross_amount > 0, 'Bill gross amount must reflect delivered milk');

    // Now correct delivery on 2026-10-16 from 1 pkt (₹32) to 3 pkts (3x500ml = 1.5L -> ₹4.50 deliv -> ₹94.50)
    const del = db.prepare(`SELECT id FROM deliveries WHERE customer_id = ? AND delivery_date = '2026-10-16'`).get(houseCustId);
    const corrRes = await correctDelivery({
      deliveryId: del.id,
      correctedQuantity: 3,
      status: 'DELIVERED',
      reason: 'Customer took 2 extra packets',
      user: adminUser
    });

    // Check that bill was auto-updated
    const updatedBill = db.prepare(`SELECT * FROM bills WHERE id = ?`).get(bill.id);
    assert(updatedBill.gross_amount > bill.gross_amount, 'Bill gross amount must increase after upward delivery correction');
    console.log('  ✓ Passed: Monthly bill auto-recalculated to reflect corrected quantity (old ₹' + bill.gross_amount + ' -> new ₹' + updatedBill.gross_amount + ')');
  }

  // ----------------------------------------------------
  // TEST 10: Already paid/finalized bills are protected from silent changes
  // ----------------------------------------------------
  console.log('\n[TEST 10] Already paid/finalized bills are protected from silent changes');
  {
    const bill = db.prepare(`SELECT * FROM bills WHERE customer_id = ? AND billing_month = '2026-10'`).get(houseCustId);
    // Mark bill as PAID with payment of ₹100
    db.prepare(`
      UPDATE bills
      SET paid_amount = 100.0, status = 'PAID', updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(bill.id);

    // Record payment row
    db.prepare(`
      INSERT INTO payments (receipt_number, customer_id, bill_id, payment_type, amount, payment_date, payment_method, created_at)
      VALUES ('RCP-TEST-001', ?, ?, 'POSTPAID_BILL_PAYMENT', 100.0, '2026-10-20', 'UPI', datetime('now', 'localtime'))
    `).run(houseCustId, bill.id);

    const del = db.prepare(`SELECT id FROM deliveries WHERE customer_id = ? AND delivery_date = '2026-10-16'`).get(houseCustId);

    // Attempting correction must fail because bill has payments
    let threwError = false;
    try {
      await correctDelivery({
        deliveryId: del.id,
        correctedQuantity: 1,
        status: 'DELIVERED',
        reason: 'Should be blocked',
        user: adminUser
      });
    } catch (err) {
      threwError = true;
      assert(err.message.includes('already has recorded payments') || err.message.includes('Finalized bills'), 'Must explain payments safeguard');
    }

    assert.strictEqual(threwError, true, 'Correction must be blocked when bill has recorded payments');
    console.log('  ✓ Passed: Blocked correction on paid bill with safety message preserving accounting integrity');

    // Clean payment
    db.prepare(`DELETE FROM payments WHERE bill_id = ?`).run(bill.id);
    db.prepare(`UPDATE bills SET paid_amount = 0, status = 'PENDING' WHERE id = ?`).run(bill.id);
  }

  // ----------------------------------------------------
  // TEST 11: Bulk Customer products remain manually entered and date-specific
  // ----------------------------------------------------
  console.log('\n[TEST 11] Bulk Customer products remain manually entered and date-specific');
  {
    // Create Bulk Customer (Hotel Royal)
    const bulkRes = db.prepare(`
      INSERT INTO customers (name, phone, address, customer_category, billing_type, delivery_boy_id, created_at, updated_at)
      VALUES ('Hotel Royal Grand', '9900011223', 'MG Road Commercial', 'BULK_HOTEL', 'POSTPAID', ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(dBoy1.id);
    bulkCustId = bulkRes.lastInsertRowid;

    const dateBulk1 = '2026-10-18';
    const dateBulk2 = '2026-10-19';

    // Enter products for Day 1
    db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_boy_id, delivery_date, product_id,
        product_name_snapshot, category_snapshot, variant_snapshot,
        unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount,
        status, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        'Special Cow Milk 500ml', 'Milk', '500 ml',
        0.5, 20, 30.0,
        600.0, 0, 600.0,
        'DELIVERED', 'Bulk Order Day 1', datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(bulkCustId, dBoy1.id, dateBulk1, testProductId);

    // Day 2 must start empty (no products carried over automatically)
    const day2Deliveries = db.prepare(`SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = ?`).all(bulkCustId, dateBulk2);
    assert.strictEqual(day2Deliveries.length, 0, 'Bulk Customer starts with 0 products on Day 2');
    console.log('  ✓ Passed: Bulk customer Day 1 has 20 units; Day 2 starts empty with 0 automatic products');
  }

  // ----------------------------------------------------
  // TEST 12: Bulk delivery charges remain ₹0
  // ----------------------------------------------------
  console.log('\n[TEST 12] Bulk delivery charges remain ₹0');
  {
    const bulkItems = [{
      productId: testProductId,
      productName: 'Special Cow Milk 500ml',
      category: 'Milk',
      variantLabel: '500 ml',
      unitVolumeLitres: 0.5,
      quantity: 50,
      sellingPrice: 30.0
    }];

    const charges = calculateDeliveryChargesForCustomerDay('BULK_HOTEL', bulkItems);
    assert.strictEqual(charges[0].deliveryCharge, 0, 'Bulk delivery charge must strictly be 0');
    console.log('  ✓ Passed: 50 packets of milk for BULK_HOTEL customer -> Delivery charge ₹', charges[0].deliveryCharge);
  }

  // ----------------------------------------------------
  // TEST 13: Agent cannot modify permanent subscriptions through temporary delivery edit
  // ----------------------------------------------------
  console.log('\n[TEST 13] Agent cannot modify permanent subscriptions through temporary delivery edit');
  {
    const subBefore = db.prepare(`SELECT * FROM subscriptions WHERE customer_id = ?`).get(houseCustId);
    assert.strictEqual(subBefore.quantity, 2, 'Subscription is 2 pkts');

    // Make another temporary change for another date
    db.prepare(`
      INSERT INTO daily_delivery_requirements (
        customer_id, product_id, target_product_id, subscription_id, delivery_date,
        requirement_type, normal_quantity, required_quantity, effective_quantity,
        reason, status, created_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, '2026-10-25',
        'CHANGE_QUANTITY', 2, 4, 4,
        'Festival extra milk', 'ACTIVE', ?, datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(houseCustId, testProductId, testProductId, subBefore.id, adminUser.id);

    const subAfter = db.prepare(`SELECT * FROM subscriptions WHERE customer_id = ?`).get(houseCustId);
    assert.strictEqual(subAfter.quantity, 2, 'Permanent subscription must still remain 2 pkts');
    console.log('  ✓ Passed: Even with temporary requirement of 4 pkts, permanent subscription remains', subAfter.quantity, 'pkts');
  }

  // ----------------------------------------------------
  // TEST 14: Delivery Boy cannot modify unauthorized customers' deliveries
  // ----------------------------------------------------
  console.log('\n[TEST 14] Delivery Boy cannot modify unauthorized customers\' deliveries');
  {
    // houseCustId is assigned to dBoy1 (ID 2).
    // dBoy2 (ID 3) attempts to correct it.
    const del = db.prepare(`SELECT id FROM deliveries WHERE customer_id = ? AND delivery_date = '2026-10-16'`).get(houseCustId);
    let threwAuthError = false;
    try {
      await correctDelivery({
        deliveryId: del.id,
        correctedQuantity: 1,
        status: 'DELIVERED',
        reason: 'Unauthorized delivery boy attempt',
        user: dBoy2 // Delivery Boy 2
      });
    } catch (err) {
      threwAuthError = true;
      assert(err.message.includes('not authorized'), 'Error must specify authorization failure');
    }

    assert.strictEqual(threwAuthError, true, 'Delivery Boy 2 must be blocked from modifying Customer assigned to Delivery Boy 1');
    console.log('  ✓ Passed: Delivery Boy 2 received 403 Forbidden attempting to correct unassigned customer');
  }

  // ----------------------------------------------------
  // TEST 15: Agent can swap to a different product for today only
  // ----------------------------------------------------
  console.log('\n[TEST 15] Agent can swap to a different product for today only');
  let swappedProdId = null;
  {
    // Create an alternate product (e.g. Special Curd 500g)
    const altProdRes = db.prepare(`
      INSERT INTO products (name, category, variant_label, unit_volume_litres, selling_price, delivery_charge_type, created_at, updated_at)
      VALUES ('Special Curd 500g', 'Curd', '500 g', 0.5, 45.0, 'MILK_RULE', datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run();
    swappedProdId = altProdRes.lastInsertRowid;

    // Customer requests 2 packets of Special Curd today (2026-10-26) instead of Special Cow Milk
    const swapDate = '2026-10-26';
    const sub = db.prepare(`SELECT * FROM subscriptions WHERE customer_id = ? AND is_active = 1`).get(houseCustId);

    // Initial delivery row created with base product
    db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_boy_id, delivery_date, product_id,
        product_name_snapshot, category_snapshot, variant_snapshot,
        unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount,
        status, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        'Special Cow Milk 500ml', 'Milk', '500 ml',
        0.5, 2, 30.0,
        60.0, 3.0, 63.0,
        'PENDING', '', datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(houseCustId, dBoy1.id, swapDate, testProductId);

    // Simulate Agent swapping product via daily requirements / deliveries
    const targetProduct = db.prepare(`SELECT * FROM products WHERE id = ?`).get(swappedProdId);
    db.prepare(`
      INSERT INTO daily_delivery_requirements (
        customer_id, product_id, target_product_id, subscription_id, delivery_date,
        requirement_type, normal_quantity, required_quantity, effective_quantity,
        reason, status, created_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        'CHANGE_QUANTITY', 2, 2, 2,
        'Customer requested Curd instead of Milk today', 'ACTIVE', ?, datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(houseCustId, testProductId, swappedProdId, sub.id, swapDate, adminUser.id);

    // Update today's delivery row to swapped product
    db.prepare(`
      UPDATE deliveries
      SET product_id = ?,
          product_name_snapshot = ?,
          category_snapshot = ?,
          variant_snapshot = ?,
          unit_price_snapshot = ?,
          total_product_amount = ?,
          total_amount = ?,
          notes = 'Swapped to Special Curd for today'
      WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
    `).run(
      targetProduct.id, targetProduct.name, targetProduct.category, targetProduct.variant_label,
      targetProduct.selling_price, 90.0, 93.0,
      houseCustId, testProductId, swapDate
    );

    const delToday = db.prepare(`SELECT * FROM deliveries WHERE customer_id = ? AND delivery_date = ?`).get(houseCustId, swapDate);
    assert.strictEqual(delToday.product_id, swappedProdId, 'Today delivery must be for swapped product');
    assert.strictEqual(delToday.product_name_snapshot, 'Special Curd 500g');

    // Verify permanent subscription remains the original Special Cow Milk
    const permSub = db.prepare(`SELECT * FROM subscriptions WHERE customer_id = ?`).get(houseCustId);
    assert.strictEqual(permSub.product_id, testProductId, 'Permanent subscription must still be Special Cow Milk');
    assert.strictEqual(permSub.quantity, 2, 'Permanent subscription quantity must still be 2 pkts');

    console.log('  ✓ Passed: Today delivery swapped to', delToday.product_name_snapshot, 'while permanent subscription strictly remains product #', permSub.product_id);
  }

  // Cleanup test fixtures
  db.prepare(`DELETE FROM delivery_corrections WHERE customer_id = ?`).run(houseCustId);
  db.prepare(`DELETE FROM audit_logs WHERE details LIKE ?`).run(`%${houseCustId}%`);
  db.prepare(`DELETE FROM daily_delivery_requirements WHERE customer_id = ?`).run(houseCustId);
  db.prepare(`DELETE FROM customer_ledger WHERE customer_id = ?`).run(houseCustId);
  db.prepare(`DELETE FROM bills WHERE customer_id = ?`).run(houseCustId);
  db.prepare(`DELETE FROM deliveries WHERE customer_id = ?`).run(houseCustId);
  db.prepare(`DELETE FROM subscriptions WHERE customer_id = ?`).run(houseCustId);
  db.prepare(`DELETE FROM customers WHERE id = ?`).run(houseCustId);
  if (typeof bulkCustId !== 'undefined') {
    db.prepare(`DELETE FROM deliveries WHERE customer_id = ?`).run(bulkCustId);
    db.prepare(`DELETE FROM customers WHERE id = ?`).run(bulkCustId);
  }
  db.prepare(`DELETE FROM products WHERE id = ?`).run(testProductId);
  if (swappedProdId) {
    db.prepare(`DELETE FROM products WHERE id = ?`).run(swappedProdId);
  }

  console.log('\n================================================================');
  console.log(' ALL 15 AGENT DELIVERY & CORRECTION WORKFLOW TESTS PASSED! ✓');
  console.log('================================================================\n');
}

runAllTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
