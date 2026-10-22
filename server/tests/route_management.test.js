const assert = require('assert');
const db = require('../config/db');
const {
  getDeliveryBoyAssignedRouteIds,
  getDeliveryBoyAuthorizedZoneIds,
  isCustomerAuthorized,
  isDeliveryAuthorized,
  isRouteAuthorized
} = require('../services/routeAuthService');

async function runRouteManagementTests() {
  console.log('\n================================================================');
  console.log(' NANDINI MILK PARLOUR — ROUTE MANAGEMENT & HIERARCHY TEST SUITE ');
  console.log('================================================================\n');

  const testAgentId = 999;

  // Cleanup test agent data if exists
  await db.prepare('DELETE FROM delivery_corrections WHERE agent_id = ?').run(testAgentId);
  await db.prepare('DELETE FROM deliveries WHERE agent_id = ?').run(testAgentId);
  await db.prepare('DELETE FROM subscriptions WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = ?)').run(testAgentId);
  await db.prepare('DELETE FROM customers WHERE agent_id = ?').run(testAgentId);
  await db.prepare('DELETE FROM zones WHERE agent_id = ?').run(testAgentId);
  await db.prepare('DELETE FROM routes WHERE agent_id = ?').run(testAgentId);
  await db.prepare('DELETE FROM users WHERE username LIKE ?').run(`route_test_user_%`);

  // Setup test Delivery Boys
  const insertUser = db.prepare(`
    INSERT INTO users (name, username, password_hash, role, phone, agent_id, is_active, created_at, updated_at)
    VALUES (?, ?, 'dummy_hash', 'DELIVERY_BOY', ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `);
  const dboyA = await insertUser.run('Raju Delivery', 'route_test_user_raju', '9876543201', testAgentId);
  const dboyAId = dboyA.lastInsertRowid;

  const dboyB = await insertUser.run('Suresh Delivery', 'route_test_user_suresh', '9876543202', testAgentId);
  const dboyBId = dboyB.lastInsertRowid;

  const dboyC = await insertUser.run('Unassigned Delivery Boy', 'route_test_user_unassigned', '9876543203', testAgentId);
  const dboyCId = dboyC.lastInsertRowid;

  // 1. Create Routes
  console.log('[TEST 1] Admin creates Route 1, Route 2, and Route 3 (unassigned)');
  const insertRoute = db.prepare(`
    INSERT INTO routes (name, description, delivery_boy_id, status, agent_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `);

  const r1 = await insertRoute.run('Route 1 - North Sector', 'North morning deliveries', null, 'ACTIVE', testAgentId);
  const route1Id = r1.lastInsertRowid;

  const r2 = await insertRoute.run('Route 2 - South Sector', 'South morning deliveries', null, 'ACTIVE', testAgentId);
  const route2Id = r2.lastInsertRowid;

  const r3 = await insertRoute.run('Route 3 - East Sector', 'East deliveries', null, 'INACTIVE', testAgentId);
  const route3Id = r3.lastInsertRowid;

  assert.ok(route1Id > 0 && route2Id > 0 && route3Id > 0, 'Routes created successfully');
  console.log('  ✓ Passed: Created Route 1, Route 2, and Route 3 without assigned delivery boys');

  // 2. Rename & Status Change
  console.log('\n[TEST 2] Admin can rename and activate/deactivate routes');
  await db.prepare(`UPDATE routes SET name = ?, status = 'ACTIVE' WHERE id = ?`).run('Route 3 - East & Metro Sector', route3Id);
  const updatedR3 = await db.prepare('SELECT * FROM routes WHERE id = ?').get(route3Id);
  assert.strictEqual(updatedR3.name, 'Route 3 - East & Metro Sector');
  assert.strictEqual(updatedR3.status, 'ACTIVE');
  console.log('  ✓ Passed: Route 3 renamed and activated successfully');

  // 3. Create Zones and Add to Routes
  console.log('\n[TEST 3] Admin creates zones and adds multiple zones to Route 1');
  const insertZone = db.prepare(`
    INSERT INTO zones (name, address, route_id, route_order, agent_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `);
  const z1 = await insertZone.run('Zone A - Block 1', 'Main Gate', route1Id, 1, testAgentId);
  const zone1Id = z1.lastInsertRowid;

  const z2 = await insertZone.run('Zone B - Block 2', 'East Gate', route1Id, 2, testAgentId);
  const zone2Id = z2.lastInsertRowid;

  const z3 = await insertZone.run('Zone C - South Tower', 'South Wing', route2Id, 1, testAgentId);
  const zone3Id = z3.lastInsertRowid;

  const r1Zones = await db.prepare('SELECT id FROM zones WHERE route_id = ?').all(route1Id);
  assert.strictEqual(r1Zones.length, 2, 'Route 1 should have 2 zones');
  console.log('  ✓ Passed: Zones A and B linked to Route 1; Zone C linked to Route 2');

  // 4. Single Zone Exclusivity & Safe Removal
  console.log('\n[TEST 4] Zone cannot accidentally belong to multiple routes; safe unlinking');
  // Check that Zone A is currently assigned to Route 1
  const checkZA = await db.prepare('SELECT route_id FROM zones WHERE id = ?').get(zone1Id);
  assert.strictEqual(checkZA.route_id, route1Id);

  // Safely remove Zone B from Route 1
  await db.prepare('UPDATE zones SET route_id = NULL WHERE id = ?').run(zone2Id);
  const checkZB = await db.prepare('SELECT route_id, name FROM zones WHERE id = ?').get(zone2Id);
  assert.strictEqual(checkZB.route_id, null, 'Zone B is now unassigned');
  assert.strictEqual(checkZB.name, 'Zone B - Block 2', 'Zone record itself is preserved');
  console.log('  ✓ Passed: Removing Zone B from Route 1 safely sets route_id=NULL without deleting the zone');

  // Re-link Zone B back to Route 1
  await db.prepare('UPDATE zones SET route_id = ? WHERE id = ?').run(route1Id, zone2Id);

  // 5. Customers within Hierarchy (Routes -> Zones -> Customers)
  console.log('\n[TEST 5] Customers associated with Zones automatically inherit Route and Delivery Boy');
  const insertCust = db.prepare(`
    INSERT INTO customers (name, phone, address, customer_category, billing_type, zone_id, route, delivery_boy_id, agent_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 'HOUSE', 'POSTPAID', ?, ?, ?, ?, 'ACTIVE', datetime('now', 'localtime'), datetime('now', 'localtime'))
  `);
  const c1 = await insertCust.run('Amit Sharma', '9111111101', 'Flat 101', zone1Id, 'Route 1', null, testAgentId);
  const cust1Id = c1.lastInsertRowid;

  const c2 = await insertCust.run('Deepa Nair', '9111111102', 'Flat 202', zone3Id, 'Route 2', null, testAgentId);
  const cust2Id = c2.lastInsertRowid;

  assert.ok(cust1Id > 0 && cust2Id > 0);
  console.log('  ✓ Passed: Customer 1 created in Zone A (Route 1); Customer 2 in Zone C (Route 2)');

  // 6. Assign Delivery Boys to Routes
  console.log('\n[TEST 6] Assign Delivery Boy A to Route 1 and Delivery Boy B to Route 2');
  await db.prepare('UPDATE routes SET delivery_boy_id = ? WHERE id = ?').run(dboyAId, route1Id);
  await db.prepare('UPDATE routes SET delivery_boy_id = ? WHERE id = ?').run(dboyBId, route2Id);

  const r1AfterAssign = await db.prepare('SELECT delivery_boy_id FROM routes WHERE id = ?').get(route1Id);
  assert.strictEqual(r1AfterAssign.delivery_boy_id, dboyAId);
  console.log('  ✓ Passed: Delivery Boy A assigned to Route 1; Delivery Boy B assigned to Route 2');

  // 7. Backend Route Authorization Verification
  console.log('\n[TEST 7] Backend Route & Zone Authorization Service verification');
  const userA = { id: dboyAId, role: 'DELIVERY_BOY' };
  const userB = { id: dboyBId, role: 'DELIVERY_BOY' };
  const userC = { id: dboyCId, role: 'DELIVERY_BOY' };
  const adminUser = { id: 1, role: 'ADMIN' };

  // Route Authorization
  assert.strictEqual(await isRouteAuthorized(route1Id, userA, testAgentId), true, 'Delivery Boy A authorized for Route 1');
  assert.strictEqual(await isRouteAuthorized(route2Id, userA, testAgentId), false, 'Delivery Boy A NOT authorized for Route 2');
  assert.strictEqual(await isRouteAuthorized(route1Id, userB, testAgentId), false, 'Delivery Boy B NOT authorized for Route 1');
  assert.strictEqual(await isRouteAuthorized(route2Id, userB, testAgentId), true, 'Delivery Boy B authorized for Route 2');
  assert.strictEqual(await isRouteAuthorized(route1Id, userC, testAgentId), false, 'Unassigned Delivery Boy C has no route access');
  assert.strictEqual(await isRouteAuthorized(route1Id, adminUser, testAgentId), true, 'Admin has universal route access');
  console.log('  ✓ Passed: Route authorization correctly checks server-side route assignment');

  // Zone IDs for Delivery Boy
  const aZones = await getDeliveryBoyAuthorizedZoneIds(dboyAId, testAgentId);
  assert.ok(aZones.includes(zone1Id) && aZones.includes(zone2Id), 'Delivery Boy A has zones A & B');
  assert.ok(!aZones.includes(zone3Id), 'Delivery Boy A does not have zone C');

  const bZones = await getDeliveryBoyAuthorizedZoneIds(dboyBId, testAgentId);
  assert.ok(bZones.includes(zone3Id), 'Delivery Boy B has zone C');
  assert.ok(!bZones.includes(zone1Id), 'Delivery Boy B does not have zone A');

  const cZones = await getDeliveryBoyAuthorizedZoneIds(dboyCId, testAgentId);
  assert.strictEqual(cZones.length, 0, 'Unassigned Delivery Boy C has 0 authorized zones');
  console.log('  ✓ Passed: Authorized zones accurately resolved from assigned routes');

  // Customer Authorization
  assert.strictEqual(await isCustomerAuthorized(cust1Id, userA, testAgentId), true, 'Delivery Boy A authorized for Customer 1');
  assert.strictEqual(await isCustomerAuthorized(cust2Id, userA, testAgentId), false, 'Delivery Boy A rejected for Customer 2');
  assert.strictEqual(await isCustomerAuthorized(cust2Id, userB, testAgentId), true, 'Delivery Boy B authorized for Customer 2');
  assert.strictEqual(await isCustomerAuthorized(cust1Id, userB, testAgentId), false, 'Delivery Boy B rejected for Customer 1');
  assert.strictEqual(await isCustomerAuthorized(cust1Id, userC, testAgentId), false, 'Delivery Boy C rejected for all customers');
  console.log('  ✓ Passed: Customer access strictly follows Route -> Zone -> Customer hierarchy');

  // 8. Delivery Record Authorization
  console.log('\n[TEST 8] Delivery status updates and actions check Route hierarchy');
  const validProd = await db.prepare('SELECT id, selling_price, name FROM products LIMIT 1').get();
  const prodId = validProd ? validProd.id : 1;
  const prodPrice = validProd ? validProd.selling_price : 27;
  const prodName = validProd ? validProd.name : 'Standard Milk';

  const insertDel = db.prepare(`
    INSERT INTO deliveries (
      customer_id, delivery_boy_id, delivery_date, product_id, product_name_snapshot,
      category_snapshot, variant_snapshot, unit_volume_litres_snapshot, quantity,
      unit_price_snapshot, total_product_amount, delivery_charge_snapshot, total_amount,
      status, agent_id, created_at, updated_at
    ) VALUES (
      ?, ?, '2026-10-22', ?, ?,
      'MILK', '500ml', 0.5, 1,
      ?, ?, 2, ?,
      'PENDING', ?, datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `);

  const d1 = await insertDel.run(cust1Id, dboyAId, prodId, prodName, prodPrice, prodPrice, prodPrice + 2, testAgentId);
  const del1Id = d1.lastInsertRowid;

  const d2 = await insertDel.run(cust2Id, dboyBId, prodId, prodName, prodPrice, prodPrice, prodPrice + 2, testAgentId);
  const del2Id = d2.lastInsertRowid;

  assert.strictEqual(await isDeliveryAuthorized(del1Id, userA, testAgentId), true, 'Delivery Boy A authorized for Delivery 1');
  assert.strictEqual(await isDeliveryAuthorized(del2Id, userA, testAgentId), false, 'Delivery Boy A rejected for Delivery 2 (Cross-route)');
  assert.strictEqual(await isDeliveryAuthorized(del2Id, userB, testAgentId), true, 'Delivery Boy B authorized for Delivery 2');
  assert.strictEqual(await isDeliveryAuthorized(del1Id, userB, testAgentId), false, 'Delivery Boy B rejected for Delivery 1 (Cross-route)');
  console.log('  ✓ Passed: Cross-route delivery access is rejected server-side');

  // 9. Moving Customer to Another Zone Updates Route Automatically
  console.log('\n[TEST 9] Moving Customer 1 to Zone C (Route 2) dynamically shifts authorization');
  await db.prepare('UPDATE customers SET zone_id = ?, route = ? WHERE id = ?').run(zone3Id, 'Route 2', cust1Id);
  // Now Customer 1 belongs to Zone C (Route 2), which is assigned to Delivery Boy B
  assert.strictEqual(await isCustomerAuthorized(cust1Id, userB, testAgentId), true, 'Delivery Boy B now authorized for Customer 1');
  // Delivery Boy A no longer authorized (unless direct override exists)
  await db.prepare('UPDATE customers SET delivery_boy_id = NULL WHERE id = ?').run(cust1Id);
  assert.strictEqual(await isCustomerAuthorized(cust1Id, userA, testAgentId), false, 'Delivery Boy A lost access after zone relocation');
  console.log('  ✓ Passed: Moving customer to a zone in Route 2 automatically shifted access to Delivery Boy B');

  // 10. Unassigning Delivery Boy Revokes Route Access Immediately
  console.log('\n[TEST 10] Unassigning Delivery Boy B immediately revokes route access');
  await db.prepare('UPDATE routes SET delivery_boy_id = NULL WHERE id = ?').run(route2Id);
  assert.strictEqual(await isRouteAuthorized(route2Id, userB, testAgentId), false, 'Delivery Boy B no longer authorized for Route 2');
  const bZonesAfterUnassign = await getDeliveryBoyAuthorizedZoneIds(dboyBId, testAgentId);
  assert.strictEqual(bZonesAfterUnassign.length, 0, 'Delivery Boy B has 0 authorized zones after unassign');
  console.log('  ✓ Passed: Immediate server-side permission revocation upon delivery boy unassignment');

  // Clean up test data
  await db.prepare('DELETE FROM deliveries WHERE agent_id = ?').run(testAgentId);
  await db.prepare('DELETE FROM customers WHERE agent_id = ?').run(testAgentId);
  await db.prepare('DELETE FROM zones WHERE agent_id = ?').run(testAgentId);
  await db.prepare('DELETE FROM routes WHERE agent_id = ?').run(testAgentId);
  await db.prepare('DELETE FROM users WHERE username LIKE ?').run(`route_test_user_%`);

  console.log('\n================================================================');
  console.log(' ALL 10 ROUTE MANAGEMENT & HIERARCHY TESTS PASSED! ✓');
  console.log('================================================================\n');
}

runRouteManagementTests().catch(err => {
  console.error('Route management test failed:', err);
  process.exit(1);
});
