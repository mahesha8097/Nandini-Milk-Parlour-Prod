const assert = require('assert');
const express = require('express');
const db = require('../config/db');

// Set up express app with auth and business routes
const app = express();
app.use(express.json());
app.use('/api/auth', require('../routes/auth.routes'));
app.use('/api/customers', require('../routes/customers.routes'));
app.use('/api/zones', require('../routes/zones.routes'));
app.use('/api/profile', require('../routes/profile.routes'));
app.use('/api/dashboard', require('../routes/dashboard.routes'));

async function runMultiTenantIsolationTests() {
  const PORT = 5055;
  const server = app.listen(PORT);
  const baseUrl = `http://localhost:${PORT}/api`;

  try {
    console.log('\n================================================================');
    console.log(' MULTI-TENANT AGENT ISOLATION & REGISTRATION AUDIT TEST SUITE ');
    console.log('================================================================\n');

    const timestamp = Date.now();
    const usernameA = `agent_a_${timestamp}`;
    const usernameB = `agent_b_${timestamp}`;

    // 1. Register Agent A
    console.log('[TEST 1] Register Agent A with unique parlour name');
    const resA = await fetch(`${baseUrl}/auth/register-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parlour_name: 'Nandini Parlour Indiranagar',
        name: 'Agent A Ramesh',
        username: usernameA,
        password: 'password123',
        phone: '9888800001',
        email: `${usernameA}@example.com`
      })
    });

    const regA = await resA.json();
    assert.strictEqual(resA.status, 201, `Agent A registration failed: ${JSON.stringify(regA)}`);
    assert(regA.token, 'Agent A must receive a JWT token');
    const tokenA = regA.token;
    const userA = regA.user;
    console.log(`  ✓ Passed: Agent A registered with User ID ${userA.id} and Agent ID ${userA.agent_id}`);

    // 2. Register Agent B
    console.log('\n[TEST 2] Register Agent B with unique parlour name');
    const resB = await fetch(`${baseUrl}/auth/register-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parlour_name: 'Nandini Parlour Whitefield',
        name: 'Agent B Suresh',
        username: usernameB,
        password: 'password123',
        phone: '9888800002',
        email: `${usernameB}@example.com`
      })
    });

    const regB = await resB.json();
    assert.strictEqual(resB.status, 201, `Agent B registration failed: ${JSON.stringify(regB)}`);
    assert(regB.token, 'Agent B must receive a JWT token');
    const tokenB = regB.token;
    const userB = regB.user;
    console.log(`  ✓ Passed: Agent B registered with User ID ${userB.id} and Agent ID ${userB.agent_id}`);

    assert.notStrictEqual(userA.id, userB.id, 'Agent A and Agent B must have different user IDs');

    // 3. Verify Business Profiles are isolated
    console.log('\n[TEST 3] Verify Business Profile isolation between Agent A and Agent B');
    const pResA = await fetch(`${baseUrl}/profile`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const profileA = await pResA.json();
    assert.strictEqual(profileA.business_name, 'Nandini Parlour Indiranagar');

    const pResB = await fetch(`${baseUrl}/profile`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const profileB = await pResB.json();
    assert.strictEqual(profileB.business_name, 'Nandini Parlour Whitefield');
    console.log(`  ✓ Passed: Profiles isolated (Agent A: "${profileA.business_name}", Agent B: "${profileB.business_name}")`);

    // 4. Create customer under Agent A
    console.log('\n[TEST 4] Agent A creates a customer; verify Agent B cannot see it');
    const cResA = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        name: 'Customer of Agent A',
        phone: '9111122223',
        address: 'Flat 101, Indiranagar',
        customer_category: 'HOUSE',
        billing_type: 'PREPAID',
        initial_advance: 500
      })
    });
    const createdCustA = await cResA.json();
    assert.strictEqual(cResA.status, 201);
    const custAId = createdCustA.id;

    // Agent A queries customers -> Sees customer
    const listResA = await fetch(`${baseUrl}/customers`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const listCustA = await listResA.json();
    const foundInA = listCustA.some(c => c.id === custAId);
    assert(foundInA, 'Agent A must see their own created customer');

    // Agent B queries customers -> DOES NOT see customer
    const listResB = await fetch(`${baseUrl}/customers`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const listCustB = await listResB.json();
    const foundInB = listCustB.some(c => c.id === custAId);
    assert(!foundInB, 'Agent B must NEVER see Agent A’s customer');
    console.log('  ✓ Passed: Agent A customer is completely invisible in Agent B customer directory');

    // 5. Verify isolated Dashboard statistics
    console.log('\n[TEST 5] Verify Dashboard metrics are isolated per Agent');
    const dResA = await fetch(`${baseUrl}/dashboard`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const dashA = await dResA.json();
    assert.strictEqual(dashA.customerOverview.totalCustomers, 1, 'Agent A must see 1 customer');

    const dResB = await fetch(`${baseUrl}/dashboard`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const dashB = await dResB.json();
    assert.strictEqual(dashB.customerOverview.totalCustomers, 0, 'Agent B must see 0 customers');
    console.log('  ✓ Passed: Dashboard totalCustomers (Agent A: 1, Agent B: 0) completely isolated');

    // Clean up test data
    try {
      await db.prepare('DELETE FROM customers WHERE id = ?').run(custAId);
      await db.prepare('DELETE FROM business_profile WHERE agent_id IN (?, ?)').run(userA.id, userB.id);
      await db.prepare('DELETE FROM zones WHERE agent_id IN (?, ?)').run(userA.id, userB.id);
      await db.prepare('DELETE FROM products WHERE agent_id IN (?, ?)').run(userA.id, userB.id);
      await db.prepare('DELETE FROM users WHERE id IN (?, ?)').run(userA.id, userB.id);
    } catch (cleanErr) {}

    console.log('\n================================================================');
    console.log(' ALL MULTI-TENANT ISOLATION TESTS PASSED SUCCESSFULLY! ✓');
    console.log('================================================================\n');
  } finally {
    server.close();
  }
}

runMultiTenantIsolationTests()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  });
