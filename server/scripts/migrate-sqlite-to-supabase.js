// Script to migrate data from local SQLite (server/data/nandini.db) to Supabase PostgreSQL
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

async function migrateData() {
  console.log('====================================================');
  console.log(' NANDINI MILK PARLOUR — SQLITE TO SUPABASE MIGRATION ');
  console.log('====================================================\n');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes('[PROJECT-REF]') || dbUrl.includes('YOUR_ACTUAL_PASSWORD')) {
    console.error('❌ Error: DATABASE_URL in .env is missing or contains placeholder values.');
    console.error('   Please provide your real Supabase connection string in .env before running migration.');
    process.exit(1);
  }

  const sqlitePath = path.join(__dirname, '..', 'data', 'nandini.db');
  if (!fs.existsSync(sqlitePath)) {
    console.error(`❌ Error: Local SQLite database not found at ${sqlitePath}`);
    process.exit(1);
  }

  const sqlite = new Database(sqlitePath, { readonly: true });
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  const client = await pool.connect();

  const tablesInOrder = [
    { name: 'business_profile', hasSerial: false },
    { name: 'users', hasSerial: true },
    { name: 'products', hasSerial: true },
    { name: 'customers', hasSerial: true },
    { name: 'subscriptions', hasSerial: true },
    { name: 'deliveries', hasSerial: true },
    { name: 'bills', hasSerial: true },
    { name: 'payments', hasSerial: true },
    { name: 'customer_ledger', hasSerial: true },
    { name: 'expenses', hasSerial: true },
    { name: 'app_settings', hasSerial: false },
    { name: 'daily_delivery_requirements', hasSerial: true },
    { name: 'audit_logs', hasSerial: true }
  ];

  try {
    console.log('Starting migration transaction in Supabase PostgreSQL...');
    await client.query('BEGIN');

    for (const { name, hasSerial } of tablesInOrder) {
      // Check if table exists in SQLite
      const tableCheck = sqlite.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name = ?").get(name);
      if (tableCheck.count === 0) {
        console.log(`- Skipping ${name} (table not found in SQLite)`);
        continue;
      }

      const rows = sqlite.prepare(`SELECT * FROM ${name}`).all();
      if (rows.length === 0) {
        console.log(`- ${name}: 0 rows to migrate`);
        continue;
      }

      console.log(`Migrating ${name} (${rows.length} rows)...`);
      const columns = Object.keys(rows[0]);

      for (const row of rows) {
        const cols = columns.map(c => `"${c}"`).join(', ');
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const values = columns.map(c => row[c]);

        const conflictAction = name === 'business_profile' 
          ? `ON CONFLICT (id) DO UPDATE SET ${columns.filter(c => c !== 'id').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')}`
          : 'ON CONFLICT DO NOTHING';

        const insertQuery = `INSERT INTO "${name}" (${cols}) VALUES (${placeholders}) ${conflictAction};`;
        await client.query(insertQuery, values);
      }

      // Reset sequence counter for serial ID columns
      if (hasSerial) {
        try {
          await client.query(`
            SELECT setval(
              pg_get_serial_sequence('${name}', 'id'),
              COALESCE((SELECT MAX(id) FROM "${name}"), 1),
              (SELECT MAX(id) FROM "${name}") IS NOT NULL
            );
          `);
        } catch (seqErr) {
          console.warn(`  (Notice: Could not reset sequence for ${name}: ${seqErr.message})`);
        }
      }

      console.log(`  ✅ Successfully migrated ${rows.length} rows into "${name}"`);
    }

    await client.query('COMMIT');
    console.log('\n====================================================');
    console.log('🎉 Migration committed successfully!');
    console.log('====================================================');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed! Rolled back transaction:', err.message);
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

migrateData().catch(console.error);
