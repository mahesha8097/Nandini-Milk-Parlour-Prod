const path = require('path');
const fs = require('fs');

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

let db;

if (isProduction && process.env.DATABASE_URL) {
  // ====================================================================
  // SUPABASE POSTGRESQL (PRODUCTION SERVERLESS MODE)
  // ====================================================================
  const { Pool } = require('pg');

  // Supabase connection pooling (Supports Transaction Pooler on port 6543 or direct 5432)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err);
  });

  // Automatically ensure PostgreSQL compatibility functions exist
  pool.query(`
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
  `).catch((err) => {
    console.warn('PostgreSQL compatibility functions setup note:', err.message);
  });

  // Ensure serial_no column exists on customers in PostgreSQL
  pool.query(`
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS serial_no INTEGER DEFAULT 0;
  `).catch((err) => {
    console.warn('PostgreSQL customers.serial_no column setup note:', err.message);
  });

  function translateSql(sql) {
    let paramIndex = 0;
    // Replace SQLite date/datetime function calls with PostgreSQL equivalents
    const translated = sql
      .replace(/datetime\s*\(\s*'now'\s*,\s*'localtime'\s*\)/gi, "TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')")
      .replace(/datetime\s*\(\s*'now'\s*\)/gi, "TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')")
      .replace(/date\s*\(\s*'now'\s*,\s*'localtime'\s*\)/gi, "TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')")
      .replace(/date\s*\(\s*'now'\s*\)/gi, "TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')");

    // Translate ? placeholders to $1, $2, etc.
    return translated.replace(/\?/g, () => `$${++paramIndex}`);
  }

  db = {
    isPostgres: true,
    pool,
    prepare(sql) {
      const translatedSql = translateSql(sql);
      const isInsert = /^\s*insert\s+into/i.test(sql);
      const hasReturning = /returning\s+/i.test(sql);
      const insertSql = (isInsert && !hasReturning) ? `${translatedSql} RETURNING id` : translatedSql;

      return {
        async get(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const res = await pool.query(translatedSql, flatParams);
          return res.rows[0] || null;
        },
        async all(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const res = await pool.query(translatedSql, flatParams);
          return res.rows || [];
        },
        async run(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const res = await pool.query(insertSql, flatParams);
          return {
            changes: res.rowCount,
            rowCount: res.rowCount,
            lastInsertRowid: res.rows?.[0]?.id || null
          };
        }
      };
    },
    async exec(sql) {
      return await pool.query(sql);
    },
    async query(sql, params = []) {
      const translated = translateSql(sql);
      return await pool.query(translated, params);
    },
    transaction(fn) {
      return async (...args) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn(...args);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      };
    }
  };
} else {
  // ====================================================================
  // LOCAL SQLITE (DEVELOPMENT ENVIRONMENT)
  // ====================================================================
  const Database = require('better-sqlite3');
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'nandini.db');
  db = new Database(dbPath, { verbose: null });

  // Enable Foreign Keys and Write-Ahead Logging for concurrency & integrity
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize complete database schema for local development
  function initSchema() {
    db.exec(`
      -- Users table (Admins and Delivery Boys)
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('ADMIN', 'DELIVERY_BOY')),
        phone TEXT,
        email TEXT,
        is_active INTEGER DEFAULT 1,
        assigned_route TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Business & Invoicing Profile
      CREATE TABLE IF NOT EXISTS business_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        business_name TEXT DEFAULT 'Nandini Milk Parlour',
        business_logo TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        state TEXT DEFAULT 'Karnataka',
        pincode TEXT,
        business_details TEXT,
        invoice_business_name TEXT DEFAULT 'Nandini Milk Parlour',
        invoice_logo TEXT,
        signature TEXT,
        upi_id TEXT,
        upi_qr TEXT,
        upi_phone TEXT DEFAULT '7022754524',
        invoice_footer TEXT DEFAULT 'Thank you for choosing Nandini Milk! Pure & Fresh.',
        updated_at TEXT NOT NULL
      );

      -- Products table (Supports flexible units, Milk rule or fixed rule)
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        variant_label TEXT NOT NULL,
        unit_volume_litres REAL DEFAULT 0,
        selling_price REAL NOT NULL,
        delivery_charge_type TEXT DEFAULT 'MILK_RULE' CHECK(delivery_charge_type IN ('MILK_RULE', 'FIXED_PER_UNIT', 'NONE')),
        fixed_delivery_charge REAL DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        image_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Customers table
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serial_no INTEGER DEFAULT 0,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        customer_category TEXT NOT NULL CHECK(customer_category IN ('HOUSE', 'BULK_HOTEL')),
        billing_type TEXT NOT NULL CHECK(billing_type IN ('PREPAID', 'POSTPAID')),
        delivery_boy_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        route TEXT,
        status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
        notes TEXT,
        advance_balance REAL DEFAULT 0.0,
        pending_balance REAL DEFAULT 0.0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Subscriptions table (Recurring daily or scheduled delivery)
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity INTEGER NOT NULL DEFAULT 1,
        frequency TEXT DEFAULT 'DAILY' CHECK(frequency IN ('DAILY', 'ALTERNATE_DAYS', 'CUSTOM')),
        custom_days TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Deliveries table (Historical records with complete price & rule snapshots)
      CREATE TABLE IF NOT EXISTS deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        delivery_boy_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        delivery_date TEXT NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        product_name_snapshot TEXT NOT NULL,
        category_snapshot TEXT NOT NULL,
        variant_snapshot TEXT NOT NULL,
        unit_volume_litres_snapshot REAL DEFAULT 0,
        quantity INTEGER NOT NULL,
        unit_price_snapshot REAL NOT NULL,
        total_product_amount REAL NOT NULL,
        delivery_charge_snapshot REAL NOT NULL,
        total_amount REAL NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('DELIVERED', 'SKIPPED', 'PENDING', 'MISSED')),
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (customer_id, product_id, delivery_date)
      );

      -- Monthly Bills table (Advance for PREPAID or Actual Deliveries for POSTPAID)
      CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_number TEXT UNIQUE NOT NULL,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        billing_month TEXT NOT NULL,
        billing_type TEXT NOT NULL CHECK(billing_type IN ('PREPAID', 'POSTPAID')),
        bill_date TEXT NOT NULL,
        due_date TEXT,
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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (customer_id, billing_month, billing_type)
      );

      -- Payments table
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_number TEXT UNIQUE NOT NULL,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
        payment_type TEXT NOT NULL CHECK(payment_type IN ('ADVANCE_PAYMENT', 'POSTPAID_BILL_PAYMENT', 'DIRECT_PAYMENT')),
        amount REAL NOT NULL,
        payment_date TEXT NOT NULL,
        payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER')),
        reference_number TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        recorded_by_user_id INTEGER REFERENCES users(id)
      );

      -- Continuous Customer Ledger
      CREATE TABLE IF NOT EXISTS customer_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL CHECK(transaction_type IN ('BILL_GENERATED', 'PAYMENT_RECEIVED', 'ADVANCE_DEPOSITED', 'ADVANCE_ADJUSTED', 'REFUND', 'ADJUSTMENT')),
        reference_id TEXT,
        debit REAL DEFAULT 0.0,
        credit REAL DEFAULT 0.0,
        advance_balance_after REAL NOT NULL,
        pending_balance_after REAL NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL
      );

      -- Expenses table
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL CHECK(category IN ('RENT', 'SALARY', 'PETROL', 'ELECTRICITY', 'MAINTENANCE', 'PURCHASE', 'OTHER')),
        amount REAL NOT NULL,
        expense_date TEXT NOT NULL,
        payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER')),
        recipient_name TEXT,
        description TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        created_by_user_id INTEGER REFERENCES users(id)
      );

      -- Settings / Key-Value configuration
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- System Audit Logs
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id INTEGER,
        details TEXT,
        created_at TEXT NOT NULL
      );

      -- Daily Customer Delivery Requirements (Special requests per day: Skip, Change Qty, Add Extra, Change Product)
      CREATE TABLE IF NOT EXISTS daily_delivery_requirements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        target_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
        delivery_date TEXT NOT NULL,
        requirement_type TEXT NOT NULL CHECK(requirement_type IN ('NORMAL', 'SKIP_DELIVERY', 'CHANGE_QUANTITY', 'ADD_EXTRA_QUANTITY')),
        normal_quantity INTEGER NOT NULL DEFAULT 1,
        required_quantity INTEGER,
        additional_quantity INTEGER DEFAULT 0,
        effective_quantity INTEGER NOT NULL DEFAULT 1,
        reason TEXT,
        status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(customer_id, product_id, delivery_date)
      );

      -- Indexes for high performance queries
      CREATE INDEX IF NOT EXISTS idx_deliveries_date ON deliveries(delivery_date);
      CREATE INDEX IF NOT EXISTS idx_deliveries_cust ON deliveries(customer_id);
      CREATE INDEX IF NOT EXISTS idx_deliveries_dboy ON deliveries(delivery_boy_id);
      CREATE INDEX IF NOT EXISTS idx_bills_month ON bills(billing_month);
      CREATE INDEX IF NOT EXISTS idx_bills_cust ON bills(customer_id);
      CREATE INDEX IF NOT EXISTS idx_payments_cust ON payments(customer_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_cust ON customer_ledger(customer_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
      CREATE INDEX IF NOT EXISTS idx_req_date_cust ON daily_delivery_requirements(delivery_date, customer_id);
      CREATE INDEX IF NOT EXISTS idx_req_date_status ON daily_delivery_requirements(delivery_date, status);
    `);

    // Ensure upi_phone column exists on business_profile
    try {
      const tableInfo = db.prepare("PRAGMA table_info(business_profile)").all();
      const hasUpiPhone = tableInfo.some(col => col.name === 'upi_phone');
      if (!hasUpiPhone) {
        db.prepare("ALTER TABLE business_profile ADD COLUMN upi_phone TEXT DEFAULT '7022754524'").run();
      }
    } catch (mErr) {
      console.warn('Migration note for business_profile.upi_phone:', mErr.message);
    }

    // Ensure serial_no column exists on customers in SQLite
    try {
      const custTableInfo = db.prepare("PRAGMA table_info(customers)").all();
      const hasSerialNo = custTableInfo.some(col => col.name === 'serial_no');
      if (!hasSerialNo) {
        db.prepare("ALTER TABLE customers ADD COLUMN serial_no INTEGER DEFAULT 0").run();
      }
    } catch (mErr) {
      console.warn('Migration note for customers.serial_no:', mErr.message);
    }

    // Ensure default profile row exists (empty / initial defaults, no fake business data)
    const profileCount = db.prepare('SELECT COUNT(*) as count FROM business_profile WHERE id = 1').get();
    if (profileCount.count === 0) {
      db.prepare(`
        INSERT INTO business_profile (
          id, business_name, phone, email, address, state, pincode, business_details,
          invoice_business_name, invoice_footer, upi_phone, updated_at
        ) VALUES (
          1, 'Nandini Milk Parlour', '', '', '', 'Karnataka', '', '',
          'Nandini Milk Parlour', 'Thank you for choosing Nandini Milk! Pure & Fresh.', '7022754524', datetime('now', 'localtime')
        )
      `).run();
    }
  }

  initSchema();
}

module.exports = db;
