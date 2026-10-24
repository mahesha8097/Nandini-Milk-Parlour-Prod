const { Pool } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

async function cleanEverything() {
  console.log('--- Cleaning Agent 1 Transactions in Supabase (Production) ---');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // 1. Delete payments
    const pRes = await pool.query(`DELETE FROM payments WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1)`);
    console.log(`Supabase: Deleted ${pRes.rowCount} payment(s).`);

    // 2. Delete bills
    const bRes = await pool.query(`DELETE FROM bills WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1)`);
    console.log(`Supabase: Deleted ${bRes.rowCount} bill(s).`);

    // 3. Delete delivery corrections
    try {
      const dcRes = await pool.query(`DELETE FROM delivery_corrections WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1)`);
      console.log(`Supabase: Deleted ${dcRes.rowCount} delivery correction(s).`);
    } catch (e) {}

    // 4. Delete coupon transactions & books
    try {
      const ctxRes = await pool.query(`DELETE FROM coupon_transactions WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1)`);
      console.log(`Supabase: Deleted ${ctxRes.rowCount} coupon transaction(s).`);
      const cbRes = await pool.query(`DELETE FROM coupon_books WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1)`);
      console.log(`Supabase: Deleted ${cbRes.rowCount} coupon book(s).`);
    } catch (e) {}

    // 5. Delete deliveries (makes 0 deliveries)
    const dRes = await pool.query(`DELETE FROM deliveries WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1)`);
    console.log(`Supabase: Deleted ${dRes.rowCount} delivery(ies).`);

    // 6. Delete daily delivery requirements
    try {
      const reqRes = await pool.query(`DELETE FROM daily_delivery_requirements WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = 1)`);
      console.log(`Supabase: Deleted ${reqRes.rowCount} daily requirement(s).`);
    } catch (e) {}

    // 7. Delete customer vacations
    try {
      const vacRes = await pool.query(`DELETE FROM customer_vacations WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1)`);
      console.log(`Supabase: Deleted ${vacRes.rowCount} vacation schedule(s).`);
    } catch (e) {}

    // 8. Delete subscriptions for customers so 0 deliveries auto-generate
    const sRes = await pool.query(`DELETE FROM subscriptions WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = 1)`);
    console.log(`Supabase: Deleted ${sRes.rowCount} subscription(s).`);

    // 9. Delete customer ledger records
    const lRes = await pool.query(`DELETE FROM customer_ledger WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = 1)`);
    console.log(`Supabase: Deleted ${lRes.rowCount} ledger record(s).`);

    // 10. Delete expenses
    try {
      const expRes = await pool.query(`DELETE FROM expenses WHERE agent_id = 1`);
      console.log(`Supabase: Deleted ${expRes.rowCount} expense record(s).`);
    } catch (e) {}

    // 11. Reset all customer balances to 0
    const cRes = await pool.query(`UPDATE customers SET advance_balance = 0, pending_balance = 0, coupon_balance = 0 WHERE agent_id = 1`);
    console.log(`Supabase: Reset balances to 0 for ${cRes.rowCount} customers.`);

    // Verification in Supabase
    const payCount = await pool.query('SELECT COUNT(*) FROM payments WHERE agent_id = 1');
    const billCount = await pool.query('SELECT COUNT(*) FROM bills WHERE agent_id = 1');
    const delCount = await pool.query('SELECT COUNT(*) FROM deliveries WHERE agent_id = 1');
    const subCount = await pool.query('SELECT COUNT(*) FROM subscriptions WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = 1)');
    const totalCust = await pool.query('SELECT COUNT(*) FROM customers WHERE agent_id = 1');
    const totalZones = await pool.query('SELECT COUNT(*) FROM zones WHERE agent_id = 1');
    const totalRoutes = await pool.query('SELECT COUNT(*) FROM routes WHERE agent_id = 1');

    console.log('\n--- Supabase Verification ---');
    console.log('Customers (preserved):', totalCust.rows[0].count);
    console.log('Zones (preserved):', totalZones.rows[0].count);
    console.log('Routes (preserved):', totalRoutes.rows[0].count);
    console.log('Deliveries Count (should be 0):', delCount.rows[0].count);
    console.log('Payments Count (should be 0):', payCount.rows[0].count);
    console.log('Bills Count (should be 0):', billCount.rows[0].count);
    console.log('Subscriptions Count (should be 0):', subCount.rows[0].count);

  } catch (err) {
    console.error('Supabase cleanup error:', err);
  } finally {
    await pool.end();
  }

  console.log('\n--- Cleaning Agent 1 Transactions in SQLite (Local) ---');
  try {
    const dbPath = path.join(__dirname, '..', 'data', 'nandini.db');
    const db = new Database(dbPath);

    db.exec(`
      DELETE FROM payments WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1);
      DELETE FROM bills WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1);
      DELETE FROM delivery_corrections WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1);
      DELETE FROM coupon_transactions WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1);
      DELETE FROM coupon_books WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1);
      DELETE FROM deliveries WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1);
      DELETE FROM daily_delivery_requirements WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = 1);
      DELETE FROM subscriptions WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = 1);
      DELETE FROM customer_ledger WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = 1);
      DELETE FROM expenses WHERE agent_id = 1;
      UPDATE customers SET advance_balance = 0, pending_balance = 0, coupon_balance = 0 WHERE agent_id = 1;
    `);

    try {
      db.exec(`DELETE FROM customer_vacations WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1);`);
    } catch (e) {}

    const sqliteCustCount = db.prepare('SELECT COUNT(*) as count FROM customers WHERE agent_id = 1').get();
    const sqliteDelCount = db.prepare('SELECT COUNT(*) as count FROM deliveries WHERE agent_id = 1').get();
    const sqlitePayCount = db.prepare('SELECT COUNT(*) as count FROM payments WHERE agent_id = 1').get();
    const sqliteBillCount = db.prepare('SELECT COUNT(*) as count FROM bills WHERE agent_id = 1').get();
    const sqliteSubCount = db.prepare('SELECT COUNT(*) as count FROM subscriptions WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = 1)').get();

    console.log('SQLite Customers (preserved):', sqliteCustCount.count);
    console.log('SQLite Deliveries Count (should be 0):', sqliteDelCount.count);
    console.log('SQLite Payments Count (should be 0):', sqlitePayCount.count);
    console.log('SQLite Bills Count (should be 0):', sqliteBillCount.count);
    console.log('SQLite Subscriptions Count (should be 0):', sqliteSubCount.count);
    db.close();
  } catch (err) {
    console.error('SQLite cleanup error:', err);
  }
}

if (require.main === module) {
  cleanEverything();
}

module.exports = { cleanEverything };
