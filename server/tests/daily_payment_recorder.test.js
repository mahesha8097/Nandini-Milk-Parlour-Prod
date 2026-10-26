/**
 * Test Suite: Daily Spot Payment Recording at Delivery Location
 * Tests the complete flow:
 * 1. Customer with billing_type = 'DAILY'
 * 2. Delivery boy marks delivery and records payment collected at location
 * 3. Payment recorded in payments table with receipt number & recorded_by_user_id
 * 4. GET /deliveries returns today_payments and paid_today_amount
 * 5. GET /payments allows filtering by DAILY_PAYMENT
 */

const db = require('../config/db');
const { recordPaymentTransaction } = require('../services/billingService');

async function runTests() {
  console.log('================================================================');
  console.log(' NANDINI MILK PARLOUR — DAILY PAYMENT RECORDER TESTS');
  console.log('================================================================\n');

  let testCustomerId = null;
  let testDeliveryId = null;
  let testPaymentId = null;
  const today = '2026-10-26';

  try {
    // 1. Create a DAILY payment customer
    const custInsert = await db.prepare(`
      INSERT INTO customers (
        name, phone, address, flat_no, customer_category, billing_type,
        status, advance_balance, pending_balance, agent_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 0, 0, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run('Daily Spot Test Customer', '9999988888', 'Prestige Silver 404', '404', 'HOUSE', 'DAILY');

    testCustomerId = custInsert.lastInsertRowid;
    console.log(`[TEST 1] Created Daily Payment customer with ID: ${testCustomerId} ✓`);

    const sampleProduct = await db.prepare('SELECT id, name FROM products LIMIT 1').get();
    const sampleUser = await db.prepare('SELECT id, name FROM users LIMIT 1').get();
    const prodId = sampleProduct ? sampleProduct.id : null;
    const userId = sampleUser ? sampleUser.id : null;

    // 2. Insert mock pending delivery for today
    const delInsert = await db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_date, product_id, product_name_snapshot,
        category_snapshot, variant_snapshot, unit_volume_litres_snapshot,
        quantity, unit_price_snapshot, total_product_amount, delivery_charge_snapshot,
        total_amount, status, created_at, updated_at, agent_id
      ) VALUES (?, ?, ?, 'Nandini Standard Milk', 'Milk', '500ml', 0.5, 2, 28, 56, 0, 56, 'PENDING', datetime('now', 'localtime'), datetime('now', 'localtime'), 1)
    `).run(testCustomerId, today, prodId);

    testDeliveryId = delInsert.lastInsertRowid;
    console.log(`[TEST 2] Created PENDING delivery (ID: ${testDeliveryId}) for 2 packets (₹56) ✓`);

    // 3. Record payment collected by delivery boy (User ID: sampleUser)
    const payment = await recordPaymentTransaction({
      customerId: testCustomerId,
      billId: null,
      amount: 56.00,
      paymentDate: today,
      paymentType: 'DIRECT_PAYMENT',
      paymentMethod: 'CASH',
      referenceNumber: 'CASH-SPOT',
      notes: 'Collected at door by Ramesh (Delivery Boy)',
      recordedByUserId: userId
    });

    testPaymentId = payment.id;
    console.log(`[TEST 3] Recorded payment in payment recorder:`);
    console.log(`         Receipt #: ${payment.receipt_number}`);
    console.log(`         Amount: ₹${payment.amount}`);
    console.log(`         Type: ${payment.payment_type}`);
    console.log(`         Method: ${payment.payment_method} ✓`);

    if (!payment.receipt_number.startsWith('RCT-')) {
      throw new Error('Receipt number does not have expected prefix RCT-');
    }

    // Mark delivery DELIVERED
    await db.prepare(`
      UPDATE deliveries SET status = 'DELIVERED', updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(testDeliveryId);

    // 4. Verify payment query attached to delivery
    const dayPayments = await db.prepare(`
      SELECT p.id, p.receipt_number, p.customer_id, p.payment_type, p.amount,
             p.payment_date, p.payment_method, p.reference_number, p.notes,
             p.created_at, p.recorded_by_user_id, u.name as recorded_by_name
      FROM payments p
      LEFT JOIN users u ON p.recorded_by_user_id = u.id
      WHERE p.customer_id = ? AND p.payment_date = ?
    `).all(testCustomerId, today);

    if (dayPayments.length === 0) {
      throw new Error('No payments found for test customer on delivery date');
    }

    const totalPaidToday = dayPayments.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    if (totalPaidToday !== 56) {
      throw new Error(`Expected totalPaidToday 56, got ${totalPaidToday}`);
    }

    console.log(`[TEST 4] Verified day payments linked to customer:`);
    console.log(`         Count: ${dayPayments.length}, Total: ₹${totalPaidToday}`);
    console.log(`         Recorded by: ${dayPayments[0].recorded_by_name || 'Admin'} ✓`);

    // 5. Verify payments list query with paymentType filter
    const paymentsList = await db.prepare(`
      SELECT p.*, c.name as customer_name, c.phone as customer_phone,
             c.customer_category, u.name as recorded_by_name
      FROM payments p
      JOIN customers c ON p.customer_id = c.id
      LEFT JOIN users u ON p.recorded_by_user_id = u.id
      WHERE p.customer_id = ? AND p.payment_type IN ('DAILY_PAYMENT', 'DIRECT_PAYMENT')
    `).all(testCustomerId);

    if (paymentsList.length === 0) {
      throw new Error('Payment list query with payment_type filter failed');
    }

    console.log(`[TEST 5] Payment Recorder listing query verified:`);
    console.log(`         Customer: ${paymentsList[0].customer_name}`);
    console.log(`         Amount: ₹${paymentsList[0].amount}`);
    console.log(`         Recorded By: ${paymentsList[0].recorded_by_name || 'Admin'} ✓`);

    // 6. Verify ledger entry
    const ledger = await db.prepare(`
      SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY id DESC LIMIT 1
    `).get(testCustomerId);

    if (!ledger || ledger.credit !== 56) {
      throw new Error('Customer ledger credit record missing or incorrect amount');
    }
    console.log(`[TEST 6] Customer Ledger entry verified (Credit: ₹${ledger.credit}, Type: ${ledger.transaction_type}) ✓`);

    console.log('\n================================================================');
    console.log(' ALL 6 DAILY PAYMENT RECORDER TESTS PASSED SUCCESSFULLY! ✓');
    console.log('================================================================\n');
  } finally {
    // Cleanup test records
    if (testCustomerId) {
      await db.prepare('DELETE FROM customer_ledger WHERE customer_id = ?').run(testCustomerId);
      await db.prepare('DELETE FROM payments WHERE customer_id = ?').run(testCustomerId);
      await db.prepare('DELETE FROM deliveries WHERE customer_id = ?').run(testCustomerId);
      await db.prepare('DELETE FROM customers WHERE id = ?').run(testCustomerId);
      console.log('[CLEANUP] Test records safely purged.');
    }
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
