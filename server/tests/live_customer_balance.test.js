const assert = require('assert');
const db = require('../config/db');
const {
  syncCustomerLiveBalance,
  generateAdvanceBillForPrepaidCustomer,
  recordPaymentTransaction
} = require('../services/billingService');

async function runTests() {
  console.log('================================================================');
  console.log(' NANDINI MILK PARLOUR — LIVE CUSTOMER BALANCE AUDIT TEST SUITE ');
  console.log('================================================================\n');

  const testPhonePrepaid = '9999900081';
  const testPhoneAdvanceBill = '9999900082';
  const testPhonePostpaid = '9999900083';

  // Cleanup past test data
  for (const ph of [testPhonePrepaid, testPhoneAdvanceBill, testPhonePostpaid]) {
    const cust = db.prepare('SELECT id FROM customers WHERE phone = ?').get(ph);
    if (cust) {
      db.prepare('DELETE FROM deliveries WHERE customer_id = ?').run(cust.id);
      db.prepare('DELETE FROM bills WHERE customer_id = ?').run(cust.id);
      db.prepare('DELETE FROM payments WHERE customer_id = ?').run(cust.id);
      db.prepare('DELETE FROM customer_ledger WHERE customer_id = ?').run(cust.id);
      db.prepare('DELETE FROM subscriptions WHERE customer_id = ?').run(cust.id);
      db.prepare('DELETE FROM customers WHERE id = ?').run(cust.id);
    }
  }

  const prod = db.prepare('SELECT * FROM products LIMIT 1').get() || {
    id: 1, name: 'Special Milk', selling_price: 30.0, category: 'Milk', variant_label: '500 ml'
  };

  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);

  try {
    // -------------------------------------------------------------
    // TEST 1: Prepaid Customer with Wallet (Advance Balance ₹500)
    // -------------------------------------------------------------
    console.log('[TEST 1] Prepaid Customer: ₹500 advance, deliveries minused daily');

    const res1 = db.prepare(`
      INSERT INTO customers (name, phone, address, customer_category, billing_type, advance_balance, pending_balance, agent_id, status, created_at, updated_at)
      VALUES ('Prepaid Wallet User', ?, 'Flat 101, Test Appt', 'HOUSE', 'PREPAID', 500.0, 0.0, 1, 'ACTIVE', datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(testPhonePrepaid);
    const cust1Id = res1.lastInsertRowid;

    // Record initial advance ledger entry
    db.prepare(`
      INSERT INTO customer_ledger (
        customer_id, transaction_date, transaction_type, reference_id, debit, credit,
        advance_balance_after, pending_balance_after, description, created_at
      ) VALUES (?, date('now', 'localtime'), 'ADVANCE_DEPOSITED', 'INIT', 0, 500.0, 500.0, 0, 'Opening Advance Balance', datetime('now', 'localtime'))
    `).run(cust1Id);

    let bal1 = await syncCustomerLiveBalance(cust1Id);
    assert.strictEqual(bal1.advance_balance, 500.0, 'Initial advance balance must be ₹500.00');
    assert.strictEqual(bal1.pending_balance, 0.0, 'Pending balance must be ₹0.00');

    // Add Delivery 1: ₹50
    const del1Res = db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_date, product_id, product_name_snapshot, category_snapshot,
        variant_snapshot, unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount, status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'Special Milk', 'Milk', '500 ml', 0.5, 1, 48.0, 48.0, 2.0, 50.0, 'DELIVERED', datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(cust1Id, today, prod.id);
    const del1Id = del1Res.lastInsertRowid;

    bal1 = await syncCustomerLiveBalance(cust1Id);
    assert.strictEqual(bal1.advance_balance, 450.0, 'Advance balance must be minused by ₹50 to ₹450.00');
    assert.strictEqual(bal1.pending_balance, 0.0, 'Pending balance must be ₹0.00');
    console.log('  ✓ Delivery 1 (₹50) delivered: Remaining advance = ₹450.00');

    // Add Delivery 2: ₹50
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const del2Res = db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_date, product_id, product_name_snapshot, category_snapshot,
        variant_snapshot, unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount, status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'Special Milk', 'Milk', '500 ml', 0.5, 1, 48.0, 48.0, 2.0, 50.0, 'DELIVERED', datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(cust1Id, yesterday, prod.id);
    const del2Id = del2Res.lastInsertRowid;

    bal1 = await syncCustomerLiveBalance(cust1Id);
    assert.strictEqual(bal1.advance_balance, 400.0, 'Advance balance after 2 deliveries must be ₹400.00');
    console.log('  ✓ Delivery 2 (₹50) delivered: Remaining advance = ₹400.00');

    // Revert Delivery 2 to PENDING
    db.prepare(`UPDATE deliveries SET status = 'PENDING' WHERE id = ?`).run(del2Id);
    bal1 = await syncCustomerLiveBalance(cust1Id);
    assert.strictEqual(bal1.advance_balance, 450.0, 'Reverting delivery 2 to PENDING must restore advance to ₹450.00');
    console.log('  ✓ Delivery 2 reverted to PENDING: Advance restored to ₹450.00');

    // -------------------------------------------------------------
    // TEST 2: Prepaid Customer with Paid Advance Bill (₹2010.00)
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Prepaid Customer with Advance Bill: ₹2010 paid for month');

    const res2 = db.prepare(`
      INSERT INTO customers (name, phone, address, customer_category, billing_type, advance_balance, pending_balance, agent_id, status, created_at, updated_at)
      VALUES ('Prepaid Bill Customer', ?, 'Flat 908, Casero', 'HOUSE', 'PREPAID', 0.0, 0.0, 1, 'ACTIVE', datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(testPhoneAdvanceBill);
    const cust2Id = res2.lastInsertRowid;

    // Create a 30-day subscription for Customer 2
    db.prepare(`
      INSERT INTO subscriptions (customer_id, product_id, quantity, frequency, start_date, is_active, created_at, updated_at)
      VALUES (?, ?, 2, 'DAILY', ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(cust2Id, prod.id, `${currentMonth}-01`);

    // Generate Advance Bill
    const cust2 = db.prepare('SELECT * FROM customers WHERE id = ?').get(cust2Id);
    const bill2 = await generateAdvanceBillForPrepaidCustomer(cust2, currentMonth, true);
    assert.ok(bill2, 'Advance bill generated successfully');

    // Record payment for the full advance bill
    await recordPaymentTransaction({
      customerId: cust2Id,
      billId: bill2.id,
      amount: bill2.gross_amount,
      paymentDate: `${currentMonth}-01`,
      paymentType: 'ADVANCE_PAYMENT',
      paymentMethod: 'UPI'
    });

    // Check balance before deliveries
    let bal2 = await syncCustomerLiveBalance(cust2Id);
    assert.strictEqual(bal2.advance_balance, bill2.gross_amount, `Advance balance must be full bill gross ₹${bill2.gross_amount}`);
    assert.strictEqual(bal2.pending_balance, 0.0, 'Pending balance must be ₹0.00');

    // Mark 2 deliveries as DELIVERED (e.g. ₹67 each = ₹134 total)
    const delDay1 = `${currentMonth}-01`;
    const delDay2 = `${currentMonth}-02`;
    db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_date, product_id, product_name_snapshot, category_snapshot,
        variant_snapshot, unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount, status, created_at, updated_at
      ) VALUES 
      (?, ?, ?, 'Special Milk', 'Milk', '500 ml', 0.5, 2, 32.0, 64.0, 3.0, 67.0, 'DELIVERED', datetime('now', 'localtime'), datetime('now', 'localtime')),
      (?, ?, ?, 'Special Milk', 'Milk', '500 ml', 0.5, 2, 32.0, 64.0, 3.0, 67.0, 'DELIVERED', datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(cust2Id, delDay1, prod.id, cust2Id, delDay2, prod.id);

    bal2 = await syncCustomerLiveBalance(cust2Id);
    const expectedRemaining = parseFloat((bill2.gross_amount - 134.0).toFixed(2));
    assert.strictEqual(bal2.advance_balance, expectedRemaining, `Remaining advance must be ₹${expectedRemaining}`);
    assert.strictEqual(bal2.pending_balance, 0.0, 'Pending balance must stay ₹0.00');
    console.log(`  ✓ 2 deliveries (₹134 total) marked DELIVERED: Remaining advance = ₹${expectedRemaining}`);

    // -------------------------------------------------------------
    // TEST 3: Postpaid Customer: Live Pending Balance Accumulates
    // -------------------------------------------------------------
    console.log('\n[TEST 3] Postpaid Customer: live pending balance increments with daily deliveries');

    const res3 = db.prepare(`
      INSERT INTO customers (name, phone, address, customer_category, billing_type, advance_balance, pending_balance, agent_id, status, created_at, updated_at)
      VALUES ('Postpaid User', ?, 'Flat 303, Test', 'HOUSE', 'POSTPAID', 0.0, 0.0, 1, 'ACTIVE', datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(testPhonePostpaid);
    const cust3Id = res3.lastInsertRowid;

    let bal3 = await syncCustomerLiveBalance(cust3Id);
    assert.strictEqual(bal3.pending_balance, 0.0, 'Initial pending balance must be ₹0.00');

    // Add 1 delivery of ₹60
    db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_date, product_id, product_name_snapshot, category_snapshot,
        variant_snapshot, unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount, status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'Curd 1L', 'Curd', '1 Litre', 1.0, 1, 57.0, 57.0, 3.0, 60.0, 'DELIVERED', datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(cust3Id, today, prod.id);

    bal3 = await syncCustomerLiveBalance(cust3Id);
    assert.strictEqual(bal3.pending_balance, 60.0, 'Live pending balance must be ₹60.00 after 1 delivery');
    console.log('  ✓ Postpaid 1 delivery (₹60) delivered: Live pending balance = ₹60.00');

    // Add 2nd delivery of ₹40
    const delPostpaid2 = db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_date, product_id, product_name_snapshot, category_snapshot,
        variant_snapshot, unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount, status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'Special Milk', 'Milk', '500 ml', 0.5, 1, 38.0, 38.0, 2.0, 40.0, 'DELIVERED', datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(cust3Id, yesterday, prod.id);

    bal3 = await syncCustomerLiveBalance(cust3Id);
    assert.strictEqual(bal3.pending_balance, 100.0, 'Live pending balance must be ₹100.00 after 2 deliveries');
    console.log('  ✓ Postpaid 2nd delivery (₹40) delivered: Live pending balance = ₹100.00');

    // Postpaid customer pays ₹100
    await recordPaymentTransaction({
      customerId: cust3Id,
      billId: null,
      amount: 100.0,
      paymentDate: today,
      paymentType: 'DIRECT_PAYMENT',
      paymentMethod: 'CASH'
    });

    bal3 = await syncCustomerLiveBalance(cust3Id);
    assert.strictEqual(bal3.pending_balance, 0.0, 'After ₹100 payment, pending balance must be ₹0.00');
    console.log('  ✓ Postpaid pays ₹100: Pending balance clears to ₹0.00');

    // -------------------------------------------------------------
    // TEST 4: Customer Management Refresh (Simulation of GET /api/customers)
    // -------------------------------------------------------------
    console.log('\n[TEST 4] Customer Management: Live Refresh verification for all customer types');

    // Add delivery to Customer 1 (Prepaid): ₹50 on tomorrow's date (or 3rd delivery)
    const dayAfter = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_date, product_id, product_name_snapshot, category_snapshot,
        variant_snapshot, unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount, status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'Special Milk', 'Milk', '500 ml', 0.5, 1, 48.0, 48.0, 2.0, 50.0, 'DELIVERED', datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(cust1Id, dayAfter, prod.id);

    // Add delivery to Customer 3 (Postpaid): ₹75 on dayAfter
    db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_date, product_id, product_name_snapshot, category_snapshot,
        variant_snapshot, unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount, status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'Curd 1L', 'Curd', '1 Litre', 1.0, 1, 72.0, 72.0, 3.0, 75.0, 'DELIVERED', datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(cust3Id, dayAfter, prod.id);

    // Simulate Customer Management refresh query and live balance enrichment
    const refreshedCustomers = await Promise.all([cust1Id, cust2Id, cust3Id].map(async (cId) => {
      const custRow = db.prepare('SELECT * FROM customers WHERE id = ?').get(cId);
      const liveFinancials = await syncCustomerLiveBalance(cId, { persist: true });
      return {
        ...custRow,
        advance_balance: liveFinancials.advance_balance,
        pending_balance: liveFinancials.pending_balance
      };
    }));

    const refreshedCust1 = refreshedCustomers.find(c => c.id === cust1Id);
    const refreshedCust2 = refreshedCustomers.find(c => c.id === cust2Id);
    const refreshedCust3 = refreshedCustomers.find(c => c.id === cust3Id);

    // Cust 1: 500 - 50 - 50 = 400
    assert.strictEqual(refreshedCust1.advance_balance, 400.0, 'Refreshed Cust 1 must show ₹400.00 advance');
    // Cust 2: 1710 - 134 = 1576
    assert.strictEqual(refreshedCust2.advance_balance, expectedRemaining, `Refreshed Cust 2 must show ₹${expectedRemaining} advance`);
    // Cust 3: 0 + 75 = 75 pending
    assert.strictEqual(refreshedCust3.pending_balance, 75.0, 'Refreshed Cust 3 must show ₹75.00 pending');

    console.log('  ✓ Customer Management Refresh: Cust 1 Advance = ₹400.00 (minused daily)');
    console.log(`  ✓ Customer Management Refresh: Cust 2 Advance = ₹${expectedRemaining} (remaining advance)`);
    console.log('  ✓ Customer Management Refresh: Cust 3 Pending = ₹75.00 (live pending balance)');

    console.log('\n================================================================');
    console.log(' ALL LIVE CUSTOMER BALANCE TESTS PASSED SUCCESSFULLY! ✓');
    console.log('================================================================');
  } finally {
    // Cleanup
    for (const ph of [testPhonePrepaid, testPhoneAdvanceBill, testPhonePostpaid]) {
      const cust = db.prepare('SELECT id FROM customers WHERE phone = ?').get(ph);
      if (cust) {
        db.prepare('DELETE FROM deliveries WHERE customer_id = ?').run(cust.id);
        db.prepare('DELETE FROM bills WHERE customer_id = ?').run(cust.id);
        db.prepare('DELETE FROM payments WHERE customer_id = ?').run(cust.id);
        db.prepare('DELETE FROM customer_ledger WHERE customer_id = ?').run(cust.id);
        db.prepare('DELETE FROM subscriptions WHERE customer_id = ?').run(cust.id);
        db.prepare('DELETE FROM customers WHERE id = ?').run(cust.id);
      }
    }
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
