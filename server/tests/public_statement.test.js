process.env.NODE_ENV = 'test';
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const app = require('../index');
const db = require('../config/db');

async function runTests() {
  console.log('\n================================================================');
  console.log(' NANDINI MILK PARLOUR — PUBLIC STATEMENT & WHATSAPP VIEW TESTS ');
  console.log('================================================================\n');

  // Start test server on dynamic/ephemeral port
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Get an active customer or create one
    let customer = await db.prepare("SELECT id, name FROM customers WHERE status = 'ACTIVE' LIMIT 1").get();
    if (!customer) {
      const res = await db.prepare(`
        INSERT INTO customers (name, phone, address, customer_category, billing_type, status)
        VALUES ('Public Test Customer', '9123456780', 'Flat 101, Test Layout', 'HOUSE', 'PREPAID', 'ACTIVE')
      `).run();
      customer = { id: res.lastInsertRowid, name: 'Public Test Customer' };
    }

    console.log(`[TEST 1] Fetch public delivery statement for customer #${customer.id}`);
    const res1 = await fetch(`${baseUrl}/api/public/statement?c=${customer.id}&m=2026-10`);
    if (res1.status !== 200) {
      throw new Error(`Expected status 200, got ${res1.status}: ${await res1.text()}`);
    }
    const data1 = await res1.json();
    if (!data1.success || !data1.customer || !Array.isArray(data1.days)) {
      throw new Error(`Invalid statement response structure: ${JSON.stringify(data1)}`);
    }
    if (!data1.customer.phone.includes('****')) {
      throw new Error(`Customer phone is not masked for public privacy: ${data1.customer.phone}`);
    }
    console.log(`  ✓ Passed: Statement returned customer "${data1.customer.name}" with ${data1.days.length} days of delivery data`);

    console.log(`[TEST 2] Verify day structure matches WhatsApp "My Orders" layout`);
    if (data1.days.length > 0) {
      const day = data1.days[0];
      if (!day.formattedDate || typeof day.totalItems !== 'number' || typeof day.totalAmount !== 'number') {
        throw new Error(`Invalid day item structure: ${JSON.stringify(day)}`);
      }
      console.log(`  ✓ Passed: Day format "${day.formattedDate}", Items: ${day.totalItems}, Amount: ₹${day.totalAmount}`);
    }

    console.log(`[TEST 3] Verify invalid customer link returns 404 cleanly`);
    const res3 = await fetch(`${baseUrl}/api/public/statement?c=999999&m=2026-10`);
    if (res3.status !== 404) {
      throw new Error(`Expected 404 for invalid customer, got ${res3.status}`);
    }
    console.log(`  ✓ Passed: Non-existent customer rejected with 404 as expected`);

    console.log('\n================================================================');
    console.log(' ALL PUBLIC STATEMENT & WHATSAPP VIEW TESTS PASSED! ✓');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
