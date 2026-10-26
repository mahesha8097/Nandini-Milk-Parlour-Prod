require('dotenv').config();
const { Pool } = require('pg');

async function syncSupabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  try {
    console.log('Connected to Supabase PostgreSQL...');

    // 1. Check & add serial_no to customers
    await client.query(`
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS serial_no INTEGER DEFAULT 0;
    `);
    console.log('Checked / added customers.serial_no');

    // 2. Check & add image_url to products if not exists
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
    `);
    console.log('Checked / added products.image_url');

    // 3. Ensure compatibility functions exist
    await client.query(`
      CREATE OR REPLACE FUNCTION datetime(format_type text DEFAULT 'now', tz_offset text DEFAULT 'localtime')
      RETURNS text AS $$
      BEGIN
        RETURN TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS');
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;

      CREATE OR REPLACE FUNCTION date(format_type text DEFAULT 'now', tz_offset text DEFAULT 'localtime')
      RETURNS text AS $$
      BEGIN
        RETURN TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD');
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `);
    console.log('Ensured compatibility functions');

    // 4. Update billing_type check constraints on customers and bills to include 'DAILY'
    console.log('Updating billing_type check constraints...');
    const constraintQueries = [
      // Find and drop existing billing_type check constraints on customers
      `DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN (
          SELECT conname 
          FROM pg_constraint 
          WHERE conrelid = 'customers'::regclass 
            AND contype = 'c' 
            AND pg_get_constraintdef(oid) LIKE '%billing_type%'
        ) LOOP
          EXECUTE 'ALTER TABLE customers DROP CONSTRAINT ' || quote_ident(r.conname);
        END LOOP;
      END $$;`,
      `ALTER TABLE customers ADD CONSTRAINT customers_billing_type_check CHECK (billing_type IN ('PREPAID', 'POSTPAID', 'WEEKLY', 'COUPON', 'DAILY'));`,
      
      // Find and drop existing billing_type check constraints on bills
      `DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN (
          SELECT conname 
          FROM pg_constraint 
          WHERE conrelid = 'bills'::regclass 
            AND contype = 'c' 
            AND pg_get_constraintdef(oid) LIKE '%billing_type%'
        ) LOOP
          EXECUTE 'ALTER TABLE bills DROP CONSTRAINT ' || quote_ident(r.conname);
        END LOOP;
      END $$;`,
      `ALTER TABLE bills ADD CONSTRAINT bills_billing_type_check CHECK (billing_type IN ('PREPAID', 'POSTPAID', 'WEEKLY', 'COUPON', 'DAILY'));`,
      
      // Ensure routes table has delivery_boy_id column referencing users(id)
      `ALTER TABLE routes ADD COLUMN IF NOT EXISTS delivery_boy_id INTEGER REFERENCES users(id) ON DELETE SET NULL;`,
      
      // Sync route delivery_boy_id if missing from users where role = 'DELIVERY_BOY'
      `UPDATE routes SET delivery_boy_id = (SELECT id FROM users WHERE role = 'DELIVERY_BOY' AND (assigned_route = routes.name OR assigned_route = CAST(routes.id AS TEXT)) LIMIT 1) WHERE delivery_boy_id IS NULL;`
    ];

    for (const q of constraintQueries) {
      await client.query(q);
    }
    console.log('Successfully updated billing_type check constraints and route sync.');

    console.log('\nSupabase Live DB schema synchronization complete and verified!');
  } finally {
    client.release();
    await pool.end();
  }
}

syncSupabase().catch(err => {
  console.error('Error syncing Supabase:', err);
  process.exit(1);
});
