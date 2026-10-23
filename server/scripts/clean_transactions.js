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
    // 1. Delete payments for agent 1
    const pRes = await pool.query(`
      DELETE FROM payments 
      WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1)
    `);
    console.log(`Supabase: Deleted ${pRes.rowCount} payment(s).`);

    // 2. Delete bills for agent 1
    const bRes = await pool.query(`
      DELETE FROM bills 
      WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1)
    `);
    console.log(`Supabase: Deleted ${bRes.rowCount} bill(s).`);

    // 3. Delete deliveries for agent 1
    const dRes = await pool.query(`
      DELETE FROM deliveries 
      WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1)
    `);
    console.log(`Supabase: Deleted ${dRes.rowCount} delivery(ies).`);

    // 4. Delete subscriptions for agent 1 customers
    const sRes = await pool.query(`
      DELETE FROM subscriptions 
      WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = 1)
    `);
    console.log(`Supabase: Deleted ${sRes.rowCount} subscription(s).`);

    // 5. Delete customer_ledger for agent 1 customers
    const lRes = await pool.query(`
      DELETE FROM customer_ledger 
      WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = 1)
    `);
    console.log(`Supabase: Deleted ${lRes.rowCount} ledger record(s).`);

    // 6. Delete delivery corrections if any
    try {
      await pool.query(`
        DELETE FROM delivery_corrections 
        WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1)
      `);
      console.log('Supabase: Cleared delivery_corrections.');
    } catch (e) {
      // table might not exist
    }

    // 7. Reset all customer balances to 0 for agent 1
    const cRes = await pool.query(`
      UPDATE customers 
      SET advance_balance = 0, pending_balance = 0 
      WHERE agent_id = 1
    `);
    console.log(`Supabase: Reset balances to 0 for ${cRes.rowCount} customers.`);

    // Verification in Supabase
    const payCount = await pool.query('SELECT COUNT(*) FROM payments WHERE agent_id = 1');
    const billCount = await pool.query('SELECT COUNT(*) FROM bills WHERE agent_id = 1');
    const delCount = await pool.query('SELECT COUNT(*) FROM deliveries WHERE agent_id = 1');
    const subCount = await pool.query('SELECT COUNT(*) FROM subscriptions WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = 1)');
    const nonZeroCust = await pool.query('SELECT COUNT(*) FROM customers WHERE agent_id = 1 AND (advance_balance > 0 OR pending_balance > 0)');
    const totalCust = await pool.query('SELECT COUNT(*) FROM customers WHERE agent_id = 1');

    console.log('\n--- Supabase Verification ---');
    console.log('Total Customers (preserved):', totalCust.rows[0].count);
    console.log('Payments Count:', payCount.rows[0].count);
    console.log('Bills Count:', billCount.rows[0].count);
    console.log('Deliveries Count:', delCount.rows[0].count);
    console.log('Subscriptions Count:', subCount.rows[0].count);
    console.log('Customers with non-zero balances:', nonZeroCust.rows[0].count);

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
      DELETE FROM deliveries WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1);
      DELETE FROM subscriptions WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = 1);
      DELETE FROM customer_ledger WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = 1);
      UPDATE customers SET advance_balance = 0, pending_balance = 0 WHERE agent_id = 1;
    `);

    try {
      db.exec(`DELETE FROM delivery_corrections WHERE agent_id = 1 OR customer_id IN (SELECT id FROM customers WHERE agent_id = 1);`);
    } catch (e) {}

    const sqliteCustCount = db.prepare('SELECT COUNT(*) as count FROM customers WHERE agent_id = 1').get();
    const sqlitePayCount = db.prepare('SELECT COUNT(*) as count FROM payments WHERE agent_id = 1').get();
    const sqliteBillCount = db.prepare('SELECT COUNT(*) as count FROM bills WHERE agent_id = 1').get();
    const sqliteDelCount = db.prepare('SELECT COUNT(*) as count FROM deliveries WHERE agent_id = 1').get();
    const sqliteSubCount = db.prepare('SELECT COUNT(*) as count FROM subscriptions WHERE customer_id IN (SELECT id FROM customers WHERE agent_id = 1)').get();

    console.log('SQLite Customers (preserved):', sqliteCustCount.count);
    console.log('SQLite Payments Count:', sqlitePayCount.count);
    console.log('SQLite Bills Count:', sqliteBillCount.count);
    console.log('SQLite Deliveries Count:', sqliteDelCount.count);
    console.log('SQLite Subscriptions Count:', sqliteSubCount.count);
    db.close();
  } catch (err) {
    console.error('SQLite cleanup error:', err);
  }
}

cleanEverything();
