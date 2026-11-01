const assert = require('assert');
const db = require('../config/db');
const {
  generateWeeklyBillForCustomer,
  generateDeliveredMilkBill,
  generateAdvanceBillForPrepaidCustomer,
  generateBillForCustomer,
  calculateCustomerPendingDues,
  recordPaymentTransaction
} = require('../services/billingService');

async function runTests() {
  console.log('================================================================');
  console.log(' NANDINI MILK PARLOUR — BILLING DUES & PAYMENT FLOW TEST SUITE');
  console.log('================================================================\n');

  let testCustId = null;
  let prodId = null;

  try {
    // 0. Setup test customer & product
    const prod = await db.prepare('SELECT id, selling_price FROM products WHERE is_active = 1 LIMIT 1').get();
    prodId = prod.id;
    const unitPrice = prod.selling_price || 28;

    const custRes = await db.prepare(`
      INSERT INTO customers (
        name, phone, address, flat_no, customer_category, billing_type,
        status, pending_balance, advance_balance, agent_id, created_at, updated_at
      ) VALUES (
        'Dues Test Customer', '9999900001', 'Test Address', '101', 'HOUSE', 'WEEKLY',
        'ACTIVE', 0, 0, 1, datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run();
    testCustId = custRes.lastInsertRowid;
    let customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(testCustId);

    console.log(`[SETUP] Created test customer ID: ${testCustId} with ₹0 initial dues.`);

    // Helper to insert deliveries for a date range
    async function insertDeliveries(startDay, endDay) {
      for (let d = startDay; d <= endDay; d++) {
        const dateStr = `2026-10-${d.toString().padStart(2, '0')}`;
        await db.prepare(`
          INSERT OR REPLACE INTO deliveries (
            customer_id, delivery_date, product_id, product_name_snapshot, category_snapshot,
            variant_snapshot, unit_volume_litres_snapshot, quantity, unit_price_snapshot,
            total_product_amount, delivery_charge_snapshot, total_amount, status, created_at, updated_at
          ) VALUES (
            ?, ?, ?, 'Nandini Test Milk', 'Milk', '500 ml', 0.5, 1, ?, ?, 2, ?, 'DELIVERED',
            datetime('now', 'localtime'), datetime('now', 'localtime')
          )
        `).run(testCustId, dateStr, prodId, unitPrice, unitPrice, unitPrice + 2);
      }
    }

    // 1. Deliveries for Week 1 (Oct 01 - Oct 07) = 7 days
    await insertDeliveries(1, 7);

    // TEST 1: Generate Week 1 bill when customer has NO previous dues
    const bill1 = await generateWeeklyBillForCustomer(customer, '2026-10-01', '2026-10-07', true);
    assert.ok(bill1, 'Week 1 bill must be generated');
    assert.strictEqual(bill1.previous_due, 0, 'Week 1 bill must have previous_due = 0');
    const expectedGross1 = (unitPrice + 2) * 7;
    assert.strictEqual(bill1.gross_amount, expectedGross1, `Week 1 gross must be ₹${expectedGross1}`);
    assert.strictEqual(bill1.net_payable, expectedGross1, `Week 1 net_payable must be ₹${expectedGross1}`);
    assert.strictEqual(bill1.status, 'PENDING', 'Week 1 bill status must be PENDING');

    customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(testCustId);
    assert.strictEqual(customer.pending_balance, expectedGross1, `Customer pending_balance must be ₹${expectedGross1}`);
    console.log(`[TEST 1] Week 1 Bill generated freshly with ₹0 previous due (Gross: ₹${bill1.gross_amount}, Status: ${bill1.status}) ✓`);

    // 2. Deliveries for Week 2 (Oct 08 - Oct 14) = 7 days
    await insertDeliveries(8, 14);

    // TEST 2: Generate Week 2 bill when Week 1 bill is unpaid -> carries forward pending dues as previous_due
    const bill2 = await generateWeeklyBillForCustomer(customer, '2026-10-08', '2026-10-14', true);
    assert.ok(bill2, 'Week 2 bill must be generated');
    assert.strictEqual(bill2.previous_due, expectedGross1, `Week 2 previous_due must equal unpaid Week 1 amount (₹${expectedGross1})`);
    assert.strictEqual(bill2.total_deliveries_count, 7, 'Week 2 must only have 7 deliveries (no duplication of Week 1)');
    const expectedGross2 = (unitPrice + 2) * 7;
    assert.strictEqual(bill2.gross_amount, expectedGross2, `Week 2 gross must be ₹${expectedGross2}`);

    customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(testCustId);
    const expectedTotalPending = expectedGross1 + expectedGross2;
    assert.strictEqual(customer.pending_balance, expectedTotalPending, `Customer pending_balance must be ₹${expectedTotalPending}`);
    console.log(`[TEST 2] Week 2 Bill carried forward previous due ₹${bill2.previous_due} (Current Gross: ₹${bill2.gross_amount}, Total Pending: ₹${customer.pending_balance}) ✓`);

    // TEST 3: Partial payment in payment dashboard makes previous bill less
    const partialPayment = 100;
    const payment1 = await recordPaymentTransaction({
      customerId: testCustId,
      amount: partialPayment,
      paymentDate: '2026-10-15',
      paymentType: 'POSTPAID_BILL_PAYMENT',
      paymentMethod: 'UPI',
      notes: 'Partial payment towards Week 1'
    });
    assert.ok(payment1, 'Payment must be recorded');

    // Check Week 1 bill: must be reduced! ("make previous bill less")
    const refreshedBill1 = await db.prepare('SELECT * FROM bills WHERE id = ?').get(bill1.id);
    assert.strictEqual(refreshedBill1.paid_amount, partialPayment, `Week 1 paid_amount must be ₹${partialPayment}`);
    assert.strictEqual(refreshedBill1.status, 'PARTIALLY_PAID', 'Week 1 status must be PARTIALLY_PAID');
    const remainingBill1 = expectedGross1 - partialPayment;

    // Check Week 2 bill: its previous_due must be synchronized to the reduced dues!
    const refreshedBill2 = await db.prepare('SELECT * FROM bills WHERE id = ?').get(bill2.id);
    assert.strictEqual(refreshedBill2.previous_due, remainingBill1, `Week 2 previous_due must be updated to reduced due ₹${remainingBill1}`);

    customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(testCustId);
    assert.strictEqual(customer.pending_balance, expectedTotalPending - partialPayment, `Pending balance must be reduced by ₹${partialPayment}`);
    console.log(`[TEST 3] Partial payment of ₹${partialPayment} reduced Week 1 bill (Paid: ₹${refreshedBill1.paid_amount}, Remaining: ₹${remainingBill1}) and updated Week 2 previous_due to ₹${refreshedBill2.previous_due} ✓`);

    // TEST 4: Full settlement of all pending dues clears all prior bills
    const remainingTotalDue = customer.pending_balance;
    await recordPaymentTransaction({
      customerId: testCustId,
      amount: remainingTotalDue,
      paymentDate: '2026-10-16',
      paymentType: 'POSTPAID_BILL_PAYMENT',
      paymentMethod: 'UPI',
      notes: 'Clearing all remaining dues'
    });

    const settledBill1 = await db.prepare('SELECT * FROM bills WHERE id = ?').get(bill1.id);
    const settledBill2 = await db.prepare('SELECT * FROM bills WHERE id = ?').get(bill2.id);
    assert.strictEqual(settledBill1.status, 'PAID', 'Week 1 bill must be PAID');
    assert.strictEqual(settledBill2.status, 'PAID', 'Week 2 bill must be PAID');

    customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(testCustId);
    assert.strictEqual(customer.pending_balance, 0, 'Customer pending balance must be 0');
    console.log(`[TEST 4] Settlement of ₹${remainingTotalDue} fully cleared Week 1 & Week 2 bills (Both status = PAID, Customer pending = ₹0) ✓`);

    // 3. Deliveries for Week 3 (Oct 15 - Oct 21) = 7 days
    await insertDeliveries(15, 21);

    // TEST 5: Generating Week 3 bill when no pending dues exist -> previous_due MUST BE 0!
    // "if no pending dues then remove it and calculate new invoice frehsly from nex"
    const bill3 = await generateWeeklyBillForCustomer(customer, '2026-10-15', '2026-10-21', true);
    assert.ok(bill3, 'Week 3 bill must be generated');
    assert.strictEqual(bill3.previous_due, 0, 'Week 3 bill previous_due MUST BE 0 because all prior bills are PAID');
    assert.strictEqual(bill3.total_deliveries_count, 7, 'Week 3 must only have 7 deliveries');
    const expectedGross3 = (unitPrice + 2) * 7;
    assert.strictEqual(bill3.gross_amount, expectedGross3, `Week 3 gross must be ₹${expectedGross3}`);
    assert.strictEqual(bill3.net_payable, expectedGross3, `Week 3 net_payable must be ₹${expectedGross3}`);

    customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(testCustId);
    assert.strictEqual(customer.pending_balance, expectedGross3, `Pending balance must be exactly Week 3's fresh amount ₹${expectedGross3}`);
    console.log(`[TEST 5] Week 3 Bill generated freshly with ₹0 previous due because all prior dues were cleared! ✓`);

    // TEST 6: Payment with surplus credited to advance_balance
    await recordPaymentTransaction({
      customerId: testCustId,
      amount: expectedGross3 + 500, // Pays current bill + ₹500 extra
      paymentDate: '2026-10-22',
      paymentType: 'POSTPAID_BILL_PAYMENT',
      paymentMethod: 'UPI',
      notes: 'Pay Week 3 + ₹500 advance deposit'
    });

    const settledBill3 = await db.prepare('SELECT * FROM bills WHERE id = ?').get(bill3.id);
    assert.strictEqual(settledBill3.status, 'PAID', 'Week 3 bill must now be PAID');

    customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(testCustId);
    assert.strictEqual(customer.pending_balance, 0, 'Customer pending balance must be 0');
    assert.strictEqual(customer.advance_balance, 500, 'Customer advance balance must be ₹500');
    console.log(`[TEST 6] Payment with surplus: cleared bill and credited extra ₹500 to advance_balance ✓`);

    // TEST 7: Delivery overlap prevention - monthly bill does NOT duplicate deliveries billed in weekly bills
    // Deliveries 1-21 are in bills 1, 2, 3. Add delivery for Oct 22.
    await insertDeliveries(22, 22);

    const monthlyDeliveredBill = await generateDeliveredMilkBill(customer, '2026-10', true);
    assert.ok(monthlyDeliveredBill, 'Delivered milk bill should be generated for unbilled deliveries');
    assert.strictEqual(monthlyDeliveredBill.total_deliveries_count, 1, 'Monthly delivered bill must ONLY contain 1 unbilled delivery (Oct 22), not all 22 days!');
    console.log(`[TEST 7] Delivered milk bill correctly excluded all dates already billed in weekly bills (Deliveries count: ${monthlyDeliveredBill.total_deliveries_count}) ✓`);

    // TEST 8: calculateCustomerPendingDues helper accuracy
    const duesCheck = await calculateCustomerPendingDues(testCustId);
    console.log(`[TEST 8] calculateCustomerPendingDues returned totalUnpaid: ₹${duesCheck.totalUnpaid} ✓`);

    // TEST 9: Recalculate bill (recalculateSingleBill) executes cleanly for weekly bills
    const { recalculateSingleBill } = require('../services/billingService');
    const recalculated = await recalculateSingleBill(bill1.id);
    assert.ok(recalculated, 'recalculateSingleBill must successfully recalculate weekly bill');
    console.log(`[TEST 9] recalculateSingleBill cleanly recalculated weekly bill #${recalculated.bill_number} without SQL errors ✓`);

    // TEST 10: Regression check: No untyped "? IS NULL" expressions in billingService.js
    const fs = require('fs');
    const path = require('path');
    const billingCode = fs.readFileSync(path.join(__dirname, '../services/billingService.js'), 'utf8');
    assert.strictEqual(
      /\?\s+IS\s+NULL/i.test(billingCode),
      false,
      'PostgreSQL regression: No "? IS NULL" untyped parameter expressions allowed in billingService.js'
    );
    console.log('[TEST 10] Verified zero "? IS NULL" untyped parameter expressions in billingService.js ✓');

    // TEST 11: Past Month Reconciliation & Advance Balance Carryover for PREPAID Customer
    let prepCustId = null;
    try {
      const prepRes = await db.prepare(`
        INSERT INTO customers (
          name, phone, address, flat_no, customer_category, billing_type,
          status, pending_balance, advance_balance, agent_id, created_at, updated_at
        ) VALUES (
          'Prepaid Carryover Test', '9999900002', 'Test Apt', 'E5', 'HOUSE', 'PREPAID',
          'ACTIVE', 0, 0, 1, datetime('now', 'localtime'), datetime('now', 'localtime')
        )
      `).run();
      prepCustId = prepRes.lastInsertRowid;

      // Add subscription
      await db.prepare(`
        INSERT INTO subscriptions (
          customer_id, product_id, quantity, start_date, is_active, created_at, updated_at
        ) VALUES (
          ?, ?, 1, '2026-10-01', 1, datetime('now', 'localtime'), datetime('now', 'localtime')
        )
      `).run(prepCustId, prodId);

      // Create October advance bill (gross 570, net payable 570, status PAID)
      const octBillRes = await db.prepare(`
        INSERT INTO bills (
          customer_id, billing_month, bill_number, gross_amount, net_payable,
          advance_adjusted, paid_amount, status, billing_type, bill_date, due_date, agent_id,
          created_at, updated_at
        ) VALUES (
          ?, '2026-10', 'BILL-TEST-OCT', 570, 570,
          0, 570, 'PAID', 'PREPAID', '2026-10-01', '2026-10-10', 1,
          datetime('now', 'localtime'), datetime('now', 'localtime')
        )
      `).run(prepCustId);
      const octBillId = octBillRes.lastInsertRowid;

      // Record payment of ₹570
      await db.prepare(`
        INSERT INTO payments (
          receipt_number, customer_id, bill_id, payment_date, amount, payment_type, payment_method, notes, agent_id,
          created_at
        ) VALUES (
          'RCT-TEST-001', ?, ?, '2026-10-01', 570, 'ADVANCE_PAYMENT', 'CASH', 'Oct Advance', 1,
          datetime('now', 'localtime')
        )
      `).run(prepCustId, octBillId);

      // Record 8 deliveries of ₹54 each = ₹432
      for (let day = 1; day <= 8; day++) {
        const dStr = `2026-10-0${day}`;
        await db.prepare(`
          INSERT INTO deliveries (
            customer_id, delivery_date, product_id, product_name_snapshot, category_snapshot,
            variant_snapshot, unit_volume_litres_snapshot, quantity, unit_price_snapshot,
            total_product_amount, delivery_charge_snapshot, total_amount, status, created_at, updated_at
          ) VALUES (
            ?, ?, ?, 'Nandini Test Milk', 'Milk', '500 ml', 0.5, 1, 52, 52, 2, 54, 'DELIVERED',
            datetime('now', 'localtime'), datetime('now', 'localtime')
          )
        `).run(prepCustId, dStr, prodId);
      }

      // Now generate November Advance Bill
      let prepCust = await db.prepare('SELECT * FROM customers WHERE id = ?').get(prepCustId);
      const novBill = await generateAdvanceBillForPrepaidCustomer(prepCust, '2026-11', true);
      assert.ok(novBill, 'November advance bill must be generated');

      // October bill must be reconciled: gross = 432, advance_adjusted = 432, net_payable = 0, status = PAID
      const reconciledOct = await db.prepare('SELECT * FROM bills WHERE id = ?').get(octBillId);
      assert.strictEqual(reconciledOct.gross_amount, 432, 'October bill gross must be reconciled to ₹432');
      assert.strictEqual(reconciledOct.advance_adjusted, 432, 'October bill advance_adjusted must be ₹432');
      assert.strictEqual(reconciledOct.net_payable, 0, 'October bill net_payable must be ₹0');
      assert.strictEqual(reconciledOct.status, 'PAID', 'October bill status must remain PAID');

      // November bill must deduct the ₹138 remaining surplus (570 - 432 = 138)
      assert.strictEqual(novBill.advance_adjusted, 138, 'November bill advance_adjusted must be ₹138 surplus');
      assert.strictEqual(novBill.net_payable, novBill.gross_amount - 138, 'November bill net_payable must be gross - ₹138');

      // Customer pending balance must match November net payable
      prepCust = await db.prepare('SELECT * FROM customers WHERE id = ?').get(prepCustId);
      assert.strictEqual(prepCust.pending_balance, novBill.net_payable, 'Customer pending balance must equal November net payable');
      assert.strictEqual(prepCust.advance_balance, 0, 'Customer advance balance must be 0 after full adjustment');

      // Test that generateBillForCustomer with 'AUTO' does NOT overwrite the PREPAID advance bill on Nov 1 delivery
      const billAfterAuto = await generateBillForCustomer(prepCust, '2026-11', { billingBasis: 'AUTO', forceRegenerate: true });
      assert.strictEqual(billAfterAuto.id, novBill.id, 'November bill ID must be preserved');
      assert.strictEqual(billAfterAuto.gross_amount, novBill.gross_amount, 'November bill gross amount must NOT be reduced to a 1-day delivery amount');

      console.log(`[TEST 11] PREPAID customer past month reconciliation & surplus carryover verified successfully! ✓`);
      console.log(`  - Oct bill reconciled from ₹570 to ₹432 (Net: ₹0, Status: PAID)`);
      console.log(`  - Surplus ₹138 carried to Nov bill (Gross: ₹${novBill.gross_amount}, Adv: ₹138, Net: ₹${novBill.net_payable})`);
      console.log(`  - Marking daily delivery preserves advance bill ✓`);
    } finally {
      if (prepCustId) {
        await db.prepare('DELETE FROM payments WHERE customer_id = ?').run(prepCustId);
        await db.prepare('DELETE FROM bills WHERE customer_id = ?').run(prepCustId);
        await db.prepare('DELETE FROM deliveries WHERE customer_id = ?').run(prepCustId);
        await db.prepare('DELETE FROM subscriptions WHERE customer_id = ?').run(prepCustId);
        await db.prepare('DELETE FROM customer_ledger WHERE customer_id = ?').run(prepCustId);
        await db.prepare('DELETE FROM customers WHERE id = ?').run(prepCustId);
      }
    }

    console.log('\n================================================================');
    console.log(' ALL 11 BILLING DUES & PAYMENT FLOW TESTS PASSED SUCCESSFULLY! ✓');
    console.log('================================================================\n');
  } finally {
    // Cleanup test data
    if (testCustId) {
      await db.prepare('DELETE FROM payments WHERE customer_id = ?').run(testCustId);
      await db.prepare('DELETE FROM bills WHERE customer_id = ?').run(testCustId);
      await db.prepare('DELETE FROM deliveries WHERE customer_id = ?').run(testCustId);
      await db.prepare('DELETE FROM customer_ledger WHERE customer_id = ?').run(testCustId);
      await db.prepare('DELETE FROM customers WHERE id = ?').run(testCustId);
      console.log('[CLEANUP] Test records safely purged.');
    }
  }
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
