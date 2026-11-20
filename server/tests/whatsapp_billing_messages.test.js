/**
 * Test Suite: WhatsApp Professional Billing & Payment Messages
 * Tests all 5 Billing Schemes:
 *  A. PREPAID (Monthly Advance)
 *  B. POSTPAID (Monthly Actual Deliveries)
 *  C. WEEKLY (Weekly Actual Deliveries)
 *  D. DAILY (Spot / Daily Payment on Delivery)
 *  E. COUPON (Pre-purchased Coupon Book)
 */

const assert = require('assert');
const {
  formatMonthName,
  formatShortDate,
  formatCustomerFlat,
  buildWhatsAppBillingMessage,
  buildWhatsAppUrl
} = require('../services/whatsappMessageService');

console.log('🧪 Starting WhatsApp Professional Billing & Payment Messages Test Suite...\n');

let passedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// TEST 1: Date and Customer formatting utilities
// ---------------------------------------------------------------------------
runTest('Utility functions format months, dates, and customer/flat accurately', () => {
  assert.strictEqual(formatMonthName('2026-10'), 'October 2026');
  assert.strictEqual(formatMonthName('2026-11'), 'November 2026');
  assert.strictEqual(formatShortDate('2026-10-05'), '05 Oct 2026');
  assert.strictEqual(formatShortDate('2026-11-18'), '18 Nov 2026');

  const c1 = { name: 'Ramesh Kumar', flat_no: '204' };
  assert.strictEqual(formatCustomerFlat(c1), 'Ramesh Kumar / Flat 204');

  const c2 = { name: 'Suresh Patel', flat_no: 'Villa 12' };
  assert.strictEqual(formatCustomerFlat(c2), 'Suresh Patel / Villa 12');

  const c3 = { name: 'Green Edge Casero', address: 'Bangalore' };
  assert.strictEqual(formatCustomerFlat(c3), 'Green Edge Casero / Bangalore');
});

// ---------------------------------------------------------------------------
// TEST 2: Scheme A - PREPAID / Monthly Advance
// ---------------------------------------------------------------------------
runTest('Scheme A (PREPAID): Correct greeting, invoice amount, advance adjusted, remaining advance, and NO false outstanding dues', () => {
  const msg = buildWhatsAppBillingMessage({
    billingScheme: 'PREPAID',
    customer: {
      id: 101,
      name: 'Ramesh Kumar',
      flat_no: '204',
      total_advance_paid: 2000.00,
      remaining_advance: 1132.00,
      advance_balance: 1132.00
    },
    bill: {
      bill_number: 'NB-202610-0101',
      billing_month: '2026-10',
      gross_amount: 868.00,
      advance_adjusted: 868.00,
      paid_amount: 868.00,
      net_payable: 0.00,
      status: 'PAID'
    },
    profile: {
      upi_phone: '7022754524',
      upi_id: 'nandini@upi'
    },
    statementUrl: 'https://nandini-milk-parlour-prod.vercel.app/#orders?c=101&m=2026-10'
  });

  // Verify Greeting
  assert(msg.includes('Dear Valued Customer,'), 'Missing standard greeting');
  assert(msg.includes('Your October 2026 invoice/bill has been generated.'), 'Missing period header');
  assert(msg.includes('*Invoice No:* NB-202610-0101'), 'Missing invoice number');
  assert(msg.includes('*Customer / Flat:* Ramesh Kumar / Flat 204'), 'Missing customer and flat name');

  // Verify Scheme & Dynamic Financials
  assert(msg.includes('*Billing Scheme:* Prepaid (Monthly Advance)'), 'Missing billing scheme name');
  assert(msg.includes('*Invoice Amount:* ₹868.00'), 'Missing or incorrect invoice amount');
  assert(msg.includes('*Advance Adjusted:* ₹868.00'), 'Missing advance adjusted');
  assert(msg.includes('*Remaining Advance Balance:* ₹1132.00'), 'Missing or incorrect remaining advance balance');
  assert(msg.includes('*Net Payable:* ₹0.00 (All Clear ✓)'), 'Should show net payable clear');

  // CRITICAL RULE: Remaining advance must NEVER be shown as an outstanding due!
  assert(!msg.includes('Outstanding Balance'), 'Should NOT show outstanding balance for prepaid all-clear');
  assert(!msg.includes('Balance Due'), 'Should NOT show balance due for prepaid customer with advance');

  // Verify Online link & Closing
  assert(msg.includes('📱 *View Online Invoice & Deliveries:*'), 'Missing online statement link');
  assert(msg.includes('Kindly refer to the attached invoice/receipt for complete details.'), 'Missing attachment reference');
  assert(msg.includes('We sincerely appreciate your continued trust and support.'), 'Missing appreciation message');
  assert(msg.includes('*Thank you for choosing Nandini Milk Parlour.* 🙏'), 'Missing professional closing');
});

// ---------------------------------------------------------------------------
// TEST 3: Scheme B - POSTPAID (Monthly based on actual deliveries)
// ---------------------------------------------------------------------------
runTest('Scheme B (POSTPAID): Correct greeting, invoice amount, amount paid, outstanding balance, and UPI info', () => {
  const msg = buildWhatsAppBillingMessage({
    billingScheme: 'POSTPAID',
    customer: {
      id: 202,
      name: 'Suresh Patel',
      flat_no: 'Villa 12'
    },
    bill: {
      bill_number: 'NB-202610-0202',
      billing_month: '2026-10',
      gross_amount: 1200.00,
      paid_amount: 500.00,
      net_payable: 700.00,
      status: 'PENDING'
    },
    profile: {
      upi_phone: '7022754524',
      upi_id: 'nandini@upi'
    },
    statementUrl: 'https://nandini-milk-parlour-prod.vercel.app/#orders?c=202&m=2026-10'
  });

  // Verify Greeting
  assert(msg.includes('Dear Valued Customer,'), 'Missing standard greeting');
  assert(msg.includes('Your October 2026 invoice/bill has been generated.'), 'Missing period header');
  assert(msg.includes('*Invoice No:* NB-202610-0202'), 'Missing invoice number');
  assert(msg.includes('*Customer / Flat:* Suresh Patel / Villa 12'), 'Missing customer and flat name');

  // Verify Scheme & Postpaid Financials
  assert(msg.includes('*Billing Scheme:* Postpaid'), 'Missing billing scheme name');
  assert(msg.includes('*Invoice Amount:* ₹1200.00'), 'Missing invoice amount');
  assert(msg.includes('*Amount Paid:* ₹500.00'), 'Missing amount paid');
  assert(msg.includes('*Outstanding Balance:* ₹700.00'), 'Missing outstanding balance');

  // Verify Payment Details
  assert(msg.includes('*GPay / PhonePe / Paytm:* 7022754524'), 'Missing UPI phone');
  assert(msg.includes('*UPI ID:* nandini@upi'), 'Missing UPI ID');

  // Verify Closing
  assert(msg.includes('Kindly refer to the attached invoice/receipt for complete details.'));
  assert(msg.includes('*Thank you for choosing Nandini Milk Parlour.* 🙏'));
});

// ---------------------------------------------------------------------------
// TEST 4: Scheme C - WEEKLY BILL (Based on actual weekly deliveries)
// ---------------------------------------------------------------------------
runTest('Scheme C (WEEKLY): Correct billing period range (From - To), invoice amount, amount paid, and outstanding balance', () => {
  const msg = buildWhatsAppBillingMessage({
    billingScheme: 'WEEKLY',
    customer: {
      id: 303,
      name: 'Priya Sharma',
      flat_no: '401'
    },
    bill: {
      id: 55,
      bill_number: 'WB-0055',
      start_date: '2026-10-01',
      end_date: '2026-10-07',
      gross_amount: 350.00,
      paid_amount: 0.00,
      net_payable: 350.00,
      status: 'PENDING'
    },
    profile: {
      upi_phone: '7022754524',
      upi_id: 'nandini@upi'
    },
    statementUrl: 'https://nandini-milk-parlour-prod.vercel.app/#orders?c=303&b=55'
  });

  // Verify Greeting & Period
  assert(msg.includes('Dear Valued Customer,'), 'Missing standard greeting');
  assert(msg.includes('Your 01 Oct 2026 – 07 Oct 2026 invoice/bill has been generated.'), 'Missing weekly range in greeting');
  assert(msg.includes('*Invoice No:* WB-0055'), 'Missing invoice number');
  assert(msg.includes('*Customer / Flat:* Priya Sharma / Flat 401'), 'Missing customer and flat');

  // Verify Scheme & Weekly Financials
  assert(msg.includes('*Billing Scheme:* Weekly Bill'), 'Missing scheme');
  assert(msg.includes('*Billing Period:* 01 Oct 2026 – 07 Oct 2026'), 'Missing billing period row');
  assert(msg.includes('*Invoice Amount:* ₹350.00'), 'Missing invoice amount');
  assert(msg.includes('*Amount Paid:* ₹0.00'), 'Missing amount paid');
  assert(msg.includes('*Outstanding Balance:* ₹350.00'), 'Missing outstanding balance');

  // Verify Closing
  assert(msg.includes('Kindly refer to the attached invoice/receipt for complete details.'));
  assert(msg.includes('*Thank you for choosing Nandini Milk Parlour.* 🙏'));
});

// ---------------------------------------------------------------------------
// TEST 5: Scheme D - DAILY PAYMENT (Pay daily on delivery / cash / UPI)
// ---------------------------------------------------------------------------
runTest('Scheme D (DAILY): Concise daily payment receipt showing date, customer/flat, delivery amount, payment received, payment status, payment mode, without monthly invoice', () => {
  const msg = buildWhatsAppBillingMessage({
    billingScheme: 'DAILY',
    customer: {
      id: 404,
      name: 'Anita Rao',
      flat_no: '102'
    },
    payment: {
      receipt_number: 'REC-20261118-404',
      payment_date: '2026-11-18',
      delivery_amount: 56.00,
      amount: 56.00,
      status: 'Paid ✓',
      payment_method: 'UPI'
    },
    profile: {
      upi_phone: '7022754524'
    }
  });

  // Verify Greeting
  assert(msg.includes('Dear Valued Customer,'), 'Missing standard greeting');
  assert(msg.includes('Your 18 Nov 2026 daily payment receipt has been generated.'), 'Missing daily receipt greeting');
  assert(msg.includes('*Receipt No:* REC-20261118-404'), 'Missing receipt number');
  assert(msg.includes('*Customer / Flat:* Anita Rao / Flat 102'), 'Missing customer and flat');

  // Verify Scheme & Daily Receipt Details
  assert(msg.includes('*Billing Scheme:* Daily Payment'), 'Missing daily scheme label');
  assert(msg.includes('*Delivery Date:* 18 Nov 2026'), 'Missing delivery date');
  assert(msg.includes('*Delivery Amount:* ₹56.00'), 'Missing delivery amount');
  assert(msg.includes('*Payment Received:* ₹56.00'), 'Missing payment received');
  assert(msg.includes('*Payment Status:* Paid ✓'), 'Missing payment status');
  assert(msg.includes('*Payment Mode:* UPI'), 'Missing payment mode');

  // Verify NO unnecessary monthly invoice fields
  assert(!msg.includes('Gross Bill'), 'Should not contain monthly gross bill');
  assert(!msg.includes('Advance Adjusted'), 'Should not contain advance adjusted for daily pay');

  // Verify Closing
  assert(msg.includes('Kindly refer to the attached invoice/receipt for complete details.'));
  assert(msg.includes('*Thank you for choosing Nandini Milk Parlour.* 🙏'));
});

// ---------------------------------------------------------------------------
// TEST 6: Scheme E - COUPON SYSTEM (Pre-purchased coupon book)
// ---------------------------------------------------------------------------
runTest('Scheme E (COUPON): Displays coupons purchased, coupons used, remaining coupons, and statement period from recorded data only', () => {
  const msg = buildWhatsAppBillingMessage({
    billingScheme: 'COUPON',
    customer: {
      id: 505,
      name: 'Rajesh Gupta',
      flat_no: '505',
      coupon_balance: 18
    },
    coupon: {
      book_number: 'BK-SHUB-505-1101',
      total_coupons: 30,
      used_coupons: 12,
      remaining_coupons: 18,
      period: 'October 2026'
    },
    bill: {
      bill_number: 'CB-0505',
      gross_amount: 810.00,
      net_payable: 0.00
    },
    profile: {
      upi_phone: '7022754524'
    }
  });

  // Verify Greeting
  assert(msg.includes('Dear Valued Customer,'), 'Missing standard greeting');
  assert(msg.includes('Your October 2026 coupon statement/bill has been generated.'), 'Missing coupon greeting');
  assert(msg.includes('*Invoice No:* CB-0505'), 'Missing invoice number');
  assert(msg.includes('*Customer / Flat:* Rajesh Gupta / Flat 505'), 'Missing customer and flat');

  // Verify Scheme & Recorded Coupon Data
  assert(msg.includes('*Billing Scheme:* Coupon System'), 'Missing coupon scheme label');
  assert(msg.includes('*Coupon Statement Period:* October 2026'), 'Missing statement period');
  assert(msg.includes('*Coupon Book:* #BK-SHUB-505-1101'), 'Missing coupon book number');
  assert(msg.includes('*Coupons Purchased:* 30'), 'Missing coupons purchased');
  assert(msg.includes('*Coupons Used:* 12'), 'Missing coupons used');
  assert(msg.includes('*Remaining Coupons:* 18'), 'Missing remaining coupons');
  assert(msg.includes('*Book Amount:* ₹810.00'), 'Missing book amount');

  // Verify Closing
  assert(msg.includes('Kindly refer to the attached invoice/receipt for complete details.'));
  assert(msg.includes('*Thank you for choosing Nandini Milk Parlour.* 🙏'));
});

// ---------------------------------------------------------------------------
// TEST 7: WhatsApp Click URL Generation
// ---------------------------------------------------------------------------
runTest('buildWhatsAppUrl properly formats phone number (91 prefix) and encodes text', () => {
  const url1 = buildWhatsAppUrl('9876543210', 'Hello Customer');
  assert.strictEqual(url1, 'https://api.whatsapp.com/send?phone=919876543210&text=Hello%20Customer');

  const url2 = buildWhatsAppUrl('+91 98765 43210', 'Test 123');
  assert.strictEqual(url2, 'https://api.whatsapp.com/send?phone=919876543210&text=Test%20123');
});

console.log(`\n🎉 All ${passedTests} WhatsApp Billing Scheme tests passed successfully!`);
