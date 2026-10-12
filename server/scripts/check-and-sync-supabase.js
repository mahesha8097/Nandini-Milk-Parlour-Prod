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

    // Inspect columns of customers and products
    const custCols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'customers'
      ORDER BY ordinal_position;
    `);
    console.log('Customer columns:', custCols.rows.map(r => r.column_name).join(', '));

    const prodCols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'products'
      ORDER BY ordinal_position;
    `);
    console.log('Product columns:', prodCols.rows.map(r => r.column_name).join(', '));

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
