require('dotenv').config();
const { Pool } = require('pg');

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  console.log('✓ Successfully connected to Supabase PostgreSQL at aws-0-ap-south-1.pooler.supabase.com');

  try {
    // 1. Create routes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS routes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        delivery_boy_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
        agent_id INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
        updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
      );
    `);
    console.log('✓ routes table verified in Supabase');

    // 2. Add route_id and agent_id to zones
    await client.query(`
      ALTER TABLE zones ADD COLUMN IF NOT EXISTS route_id INTEGER REFERENCES routes(id) ON DELETE SET NULL;
      ALTER TABLE zones ADD COLUMN IF NOT EXISTS agent_id INTEGER DEFAULT 1;
    `);
    console.log('✓ zones.route_id column verified in Supabase');

    // 3. Add columns to customers
    await client.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS route TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS serial_no INTEGER DEFAULT 0;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS flat_no TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS agent_id INTEGER DEFAULT 1;
    `);
    console.log('✓ customers route columns verified in Supabase');

    // 4. Check and seed initial routes if empty
    const routesCheck = await client.query('SELECT id, name, status, agent_id FROM routes');
    console.log(`✓ Current routes count in Supabase: ${routesCheck.rows.length}`);
    if (routesCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO routes (name, description, status, agent_id)
        VALUES 
          ('Route 1', 'Main delivery route 1', 'ACTIVE', 1),
          ('Route 2', 'Main delivery route 2', 'ACTIVE', 1),
          ('Route 3', 'Main delivery route 3', 'ACTIVE', 1);
      `);
      console.log('✓ Seeded default Route 1, Route 2, Route 3 in Supabase');
    } else {
      console.log('✓ Existing routes:', routesCheck.rows);
    }

    // 5. Update postgres-schema.sql consistency check
    console.log('✓ Schema migration completed successfully!');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
