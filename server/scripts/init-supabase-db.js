// Script to initialize Supabase PostgreSQL Database using postgres-schema.sql
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function initSupabaseDb() {
  console.log('====================================================');
  console.log('  NANDINI MILK PARLOUR — SUPABASE SCHEMA INITIALIZER ');
  console.log('====================================================\n');

  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl || dbUrl.includes('[PROJECT-REF]') || dbUrl.includes('YOUR_ACTUAL_PASSWORD')) {
    console.error('❌ Error: DATABASE_URL in .env is missing or contains placeholder values.');
    console.error('   Please provide your real Supabase connection string in .env before running this script.');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, '..', 'config', 'postgres-schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ Error: Schema file not found at ${schemaPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Connecting to Supabase PostgreSQL database...');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  const client = await pool.connect();
  try {
    console.log('✅ Connected successfully!');
    console.log('Executing schema initialization script (postgres-schema.sql)...');

    await client.query(sql);

    console.log('✅ Schema executed successfully!\n');

    // Verify all created tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    const tables = res.rows.map(r => r.table_name);
    console.log(`✅ Verified ${tables.length} tables in Supabase public schema:`);
    tables.forEach(t => console.log(`   - ${t}`));

    console.log('\n====================================================');
    console.log('🎉 Supabase database initialization complete!');
    console.log('====================================================');
  } catch (err) {
    console.error('❌ Failed to execute schema script:', err.message);
    if (err.position) {
      console.error(`   Error at position: ${err.position}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

initSupabaseDb().catch(console.error);
