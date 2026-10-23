const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const db = require('../config/db');

async function migrate() {
  console.log('--- Starting Migration for Weekly Billing & Coupon System ---');
  console.log('Database mode:', db.isPostgres ? 'Supabase PostgreSQL' : 'Local SQLite');

  if (db.isPostgres) {
    console.log('Applying PostgreSQL migrations...');
    // 1. Customers billing_type check constraint & coupon_balance
    await db.pool.query(`
      ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_billing_type_check;
      ALTER TABLE customers ADD CONSTRAINT customers_billing_type_check 
        CHECK (billing_type IN ('PREPAID', 'POSTPAID', 'WEEKLY', 'COUPON'));
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS coupon_balance INTEGER DEFAULT 0;
    `);
    console.log('Customers table updated in PostgreSQL.');

    // 2. Bills billing_type check constraint & date range columns
    await db.pool.query(`
      ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_billing_type_check;
      ALTER TABLE bills ADD CONSTRAINT bills_billing_type_check 
        CHECK (billing_type IN ('PREPAID', 'POSTPAID', 'WEEKLY', 'COUPON'));
      ALTER TABLE bills ADD COLUMN IF NOT EXISTS start_date TEXT;
      ALTER TABLE bills ADD COLUMN IF NOT EXISTS end_date TEXT;
    `);
    console.log('Bills table updated in PostgreSQL.');

    // 3. Coupon books table
    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS coupon_books (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        book_number TEXT NOT NULL,
        total_coupons INTEGER NOT NULL,
        used_coupons INTEGER NOT NULL DEFAULT 0,
        remaining_coupons INTEGER NOT NULL,
        price_paid DOUBLE PRECISION DEFAULT 0.0,
        payment_method TEXT DEFAULT 'CASH',
        issue_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'EXHAUSTED', 'CANCELLED')),
        notes TEXT,
        agent_id INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
        updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
      );
    `);

    // 4. Coupon transactions table
    await db.pool.query(`
      CREATE TABLE IF NOT EXISTS coupon_transactions (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        coupon_book_id INTEGER REFERENCES coupon_books(id) ON DELETE SET NULL,
        delivery_id INTEGER REFERENCES deliveries(id) ON DELETE SET NULL,
        change_amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        transaction_type TEXT NOT NULL CHECK(transaction_type IN ('BOOK_PURCHASE', 'DELIVERY_USAGE', 'MANUAL_ADJUSTMENT', 'DELIVERY_REVERTED')),
        transaction_date TEXT NOT NULL,
        notes TEXT,
        agent_id INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
      );
      CREATE INDEX IF NOT EXISTS idx_coupon_books_cust ON coupon_books(customer_id);
      CREATE INDEX IF NOT EXISTS idx_coupon_tx_cust ON coupon_transactions(customer_id);
      CREATE INDEX IF NOT EXISTS idx_coupon_tx_date ON coupon_transactions(transaction_date);
    `);
    console.log('Coupon tables created in PostgreSQL.');

    const custCount = await db.pool.query('SELECT count(*) as count FROM customers');
    console.log('Verified customer count in PostgreSQL:', custCount.rows[0].count);
  } else {
    console.log('Applying SQLite migrations...');
    const dbPath = path.join(__dirname, '../data/nandini.db');
    const backupPath = path.join(__dirname, '../data/nandini.db.backup');
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
      console.log('SQLite backup created at:', backupPath);
    }

    const initialCount = db.prepare('SELECT count(*) as count FROM customers').get().count;
    console.log('Initial customer count:', initialCount);

    // Disable foreign keys during table recreation
    db.exec('PRAGMA foreign_keys=OFF;');
    db.exec('BEGIN TRANSACTION;');

    try {
      // 1. Recreate customers with new billing_type constraint and coupon_balance
      db.exec(`
        CREATE TABLE customers_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          serial_no INTEGER DEFAULT 0,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          address TEXT NOT NULL,
          flat_no TEXT,
          zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL,
          customer_category TEXT NOT NULL CHECK(customer_category IN ('HOUSE', 'BULK_HOTEL')),
          billing_type TEXT NOT NULL CHECK(billing_type IN ('PREPAID', 'POSTPAID', 'WEEKLY', 'COUPON')),
          delivery_boy_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          route TEXT,
          status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
          notes TEXT,
          advance_balance REAL DEFAULT 0.0,
          pending_balance REAL DEFAULT 0.0,
          coupon_balance INTEGER DEFAULT 0,
          agent_id INTEGER DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        INSERT INTO customers_new (
          id, serial_no, name, phone, address, flat_no, zone_id, customer_category,
          billing_type, delivery_boy_id, route, status, notes, advance_balance,
          pending_balance, coupon_balance, agent_id, created_at, updated_at
        )
        SELECT 
          id, COALESCE(serial_no, 0), name, phone, address, flat_no, zone_id, customer_category,
          billing_type, delivery_boy_id, route, status, notes, COALESCE(advance_balance, 0),
          COALESCE(pending_balance, 0), 0, COALESCE(agent_id, 1), created_at, updated_at
        FROM customers;

        DROP TABLE customers;
        ALTER TABLE customers_new RENAME TO customers;
      `);

      // 2. Recreate bills with new billing_type constraint and start_date / end_date
      db.exec(`
        CREATE TABLE bills_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bill_number TEXT UNIQUE NOT NULL,
          customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
          billing_month TEXT NOT NULL,
          billing_type TEXT NOT NULL CHECK(billing_type IN ('PREPAID', 'POSTPAID', 'WEEKLY', 'COUPON')),
          bill_date TEXT NOT NULL,
          due_date TEXT,
          start_date TEXT,
          end_date TEXT,
          total_deliveries_count INTEGER DEFAULT 0,
          product_subtotal REAL NOT NULL DEFAULT 0,
          delivery_charges_total REAL NOT NULL DEFAULT 0,
          gross_amount REAL NOT NULL DEFAULT 0,
          previous_due REAL NOT NULL DEFAULT 0,
          advance_adjusted REAL NOT NULL DEFAULT 0,
          net_payable REAL NOT NULL DEFAULT 0,
          paid_amount REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL CHECK(status IN ('DRAFT', 'GENERATED', 'ADVANCE_PAID', 'PARTIALLY_PAID', 'PAID', 'PENDING', 'CANCELLED')),
          lifecycle_stage TEXT DEFAULT 'FINALIZED' CHECK(lifecycle_stage IN ('DRAFT', 'REVIEW', 'FINALIZED')),
          items_json TEXT,
          notes TEXT,
          agent_id INTEGER DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (customer_id, billing_month, billing_type)
        );

        INSERT INTO bills_new (
          id, bill_number, customer_id, billing_month, billing_type, bill_date, due_date,
          total_deliveries_count, product_subtotal, delivery_charges_total, gross_amount,
          previous_due, advance_adjusted, net_payable, paid_amount, status, lifecycle_stage,
          items_json, notes, agent_id, created_at, updated_at
        )
        SELECT 
          id, bill_number, customer_id, billing_month, billing_type, bill_date, due_date,
          total_deliveries_count, product_subtotal, delivery_charges_total, gross_amount,
          previous_due, advance_adjusted, net_payable, paid_amount, status, lifecycle_stage,
          items_json, notes, COALESCE(agent_id, 1), created_at, updated_at
        FROM bills;

        DROP TABLE bills;
        ALTER TABLE bills_new RENAME TO bills;
      `);

      // 3. Create coupon_books table in SQLite
      db.exec(`
        CREATE TABLE IF NOT EXISTS coupon_books (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          book_number TEXT NOT NULL,
          total_coupons INTEGER NOT NULL,
          used_coupons INTEGER NOT NULL DEFAULT 0,
          remaining_coupons INTEGER NOT NULL,
          price_paid REAL DEFAULT 0.0,
          payment_method TEXT DEFAULT 'CASH',
          issue_date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'EXHAUSTED', 'CANCELLED')),
          notes TEXT,
          agent_id INTEGER DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      // 4. Create coupon_transactions table in SQLite
      db.exec(`
        CREATE TABLE IF NOT EXISTS coupon_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
          coupon_book_id INTEGER REFERENCES coupon_books(id) ON DELETE SET NULL,
          delivery_id INTEGER REFERENCES deliveries(id) ON DELETE SET NULL,
          change_amount INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          transaction_type TEXT NOT NULL CHECK(transaction_type IN ('BOOK_PURCHASE', 'DELIVERY_USAGE', 'MANUAL_ADJUSTMENT', 'DELIVERY_REVERTED')),
          transaction_date TEXT NOT NULL,
          notes TEXT,
          agent_id INTEGER DEFAULT 1,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_coupon_books_cust ON coupon_books(customer_id);
        CREATE INDEX IF NOT EXISTS idx_coupon_tx_cust ON coupon_transactions(customer_id);
        CREATE INDEX IF NOT EXISTS idx_coupon_tx_date ON coupon_transactions(transaction_date);
      `);

      db.exec('COMMIT;');
      db.exec('PRAGMA foreign_keys=ON;');

      const afterCount = db.prepare('SELECT count(*) as count FROM customers').get().count;
      console.log('Customer count after migration in SQLite:', afterCount);
      if (initialCount !== afterCount) {
        throw new Error(`Customer count mismatch! Before: ${initialCount}, After: ${afterCount}`);
      }
      console.log('SQLite migration successfully completed with full data integrity!');
    } catch (e) {
      db.exec('ROLLBACK;');
      db.exec('PRAGMA foreign_keys=ON;');
      console.error('Migration failed in SQLite, transaction rolled back:', e);
      throw e;
    }
  }

  console.log('--- Migration Completed Successfully ---');
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('Migration script error:', e);
    process.exit(1);
  });
