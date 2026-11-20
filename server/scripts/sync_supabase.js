require('dotenv').config();
const { Pool } = require('pg');

async function syncSupabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Supabase PostgreSQL...');
    const connCheck = await pool.query('SELECT NOW() as now, current_database() as db');
    console.log('Connected to Supabase:', connCheck.rows[0]);

    // 1. Check & add is_delivery_available to products table
    const colCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'products' AND column_name = 'is_delivery_available'
    `);
    if (colCheck.rows.length === 0) {
      console.log('Adding is_delivery_available column to products table in Supabase...');
      await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS is_delivery_available INTEGER DEFAULT 1;');
      console.log('Successfully added is_delivery_available to products table!');
    } else {
      console.log('is_delivery_available column already exists in Supabase products table.');
    }

    // 2. Check & create daily_indents and daily_indent_items tables
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('daily_indents', 'daily_indent_items')
    `);
    const existingTables = tableCheck.rows.map(r => r.table_name);
    console.log('Existing Indent tables in Supabase:', existingTables);

    if (!existingTables.includes('daily_indents')) {
      console.log('Creating daily_indents table in Supabase...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS daily_indents (
          id SERIAL PRIMARY KEY,
          agent_id INTEGER DEFAULT 1,
          indent_date TEXT NOT NULL,
          invoice_no TEXT,
          supplier_name TEXT DEFAULT 'KMF / Nandini Mother Dairy',
          crate_deposit_amount NUMERIC(10,2) DEFAULT 0,
          other_charges NUMERIC(10,2) DEFAULT 0,
          total_inward_amount NUMERIC(10,2) DEFAULT 0,
          total_sales_amount NUMERIC(10,2) DEFAULT 0,
          total_procurement_cost NUMERIC(10,2) DEFAULT 0,
          total_margin_profit NUMERIC(10,2) DEFAULT 0,
          total_damage_loss NUMERIC(10,2) DEFAULT 0,
          total_missing_loss NUMERIC(10,2) DEFAULT 0,
          net_daily_profit NUMERIC(10,2) DEFAULT 0,
          status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED')),
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
          updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
          UNIQUE(agent_id, indent_date)
        );
        CREATE INDEX IF NOT EXISTS idx_pg_daily_indents_date ON daily_indents(agent_id, indent_date);
      `);
      console.log('Created daily_indents table successfully!');
    }

    if (!existingTables.includes('daily_indent_items')) {
      console.log('Creating daily_indent_items table in Supabase...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS daily_indent_items (
          id SERIAL PRIMARY KEY,
          indent_id INTEGER NOT NULL REFERENCES daily_indents(id) ON DELETE CASCADE,
          product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
          product_name TEXT NOT NULL,
          item_code TEXT,
          category TEXT DEFAULT 'Milk',
          unit_label TEXT DEFAULT '500 ml',
          opening_stock NUMERIC(10,2) DEFAULT 0,
          inward_qty NUMERIC(10,2) NOT NULL DEFAULT 0,
          total_available NUMERIC(10,2) DEFAULT 0,
          purchase_price NUMERIC(10,2) NOT NULL DEFAULT 0,
          selling_price NUMERIC(10,2) NOT NULL DEFAULT 0,
          margin_per_unit NUMERIC(10,2) DEFAULT 0,
          closing_stock NUMERIC(10,2) DEFAULT 0,
          damaged_qty NUMERIC(10,2) DEFAULT 0,
          missing_qty NUMERIC(10,2) DEFAULT 0,
          sold_qty NUMERIC(10,2) DEFAULT 0,
          sales_revenue NUMERIC(10,2) DEFAULT 0,
          cost_of_goods_sold NUMERIC(10,2) DEFAULT 0,
          profit_earned NUMERIC(10,2) DEFAULT 0,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
          updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
        );
        CREATE INDEX IF NOT EXISTS idx_pg_daily_indent_items_indent ON daily_indent_items(indent_id);
      `);
      console.log('Created daily_indent_items table successfully!');
    }

    console.log('Supabase PostgreSQL database schema is 100% synchronized and verified!');
  } catch (err) {
    console.error('Error syncing Supabase schema:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

syncSupabase();

