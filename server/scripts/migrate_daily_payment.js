const db = require('../config/db');

async function migrate() {
  console.log('--- Starting Migration for DAILY Billing Type & Route Delivery Boy Sync ---');

  if (process.env.DATABASE_URL) {
    // Postgres
    console.log('Running on Postgres...');
    try {
      await db.query(`
        ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_billing_type_check;
        ALTER TABLE customers ADD CONSTRAINT customers_billing_type_check CHECK(billing_type IN ('PREPAID', 'POSTPAID', 'WEEKLY', 'COUPON', 'DAILY'));
        ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_billing_type_check;
        ALTER TABLE bills ADD CONSTRAINT bills_billing_type_check CHECK(billing_type IN ('PREPAID', 'POSTPAID', 'WEEKLY', 'COUPON', 'DAILY'));
      `);
      console.log('Postgres constraints updated successfully.');
    } catch (e) {
      console.error('Postgres error:', e);
    }
  } else {
    // SQLite
    console.log('Running on SQLite...');
    try {
      const custSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='customers'").get()?.sql || '';
      if (!custSql.includes("'DAILY'")) {
        console.log('Updating customers table to include DAILY billing_type...');
        db.exec('PRAGMA foreign_keys=OFF;');
        db.exec('BEGIN TRANSACTION;');
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
            billing_type TEXT NOT NULL CHECK(billing_type IN ('PREPAID', 'POSTPAID', 'WEEKLY', 'COUPON', 'DAILY')),
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
            COALESCE(pending_balance, 0), COALESCE(coupon_balance, 0), COALESCE(agent_id, 1), created_at, updated_at
          FROM customers;

          DROP TABLE customers;
          ALTER TABLE customers_new RENAME TO customers;
        `);
        db.exec('COMMIT;');
        db.exec('PRAGMA foreign_keys=ON;');
        console.log('Customers table migrated with DAILY billing_type successfully.');
      } else {
        console.log('Customers table already includes DAILY billing_type.');
      }
    } catch (err) {
      console.error('SQLite customers migration error:', err);
      try { db.exec('ROLLBACK;'); } catch (e) {}
    }

    try {
      const billSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='bills'").get()?.sql || '';
      if (!billSql.includes("'DAILY'")) {
        console.log('Updating bills table to include DAILY billing_type...');
        db.exec('PRAGMA foreign_keys=OFF;');
        db.exec('BEGIN TRANSACTION;');
        db.exec(`
          CREATE TABLE bills_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_number TEXT UNIQUE NOT NULL,
            customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
            billing_month TEXT NOT NULL,
            billing_type TEXT NOT NULL CHECK(billing_type IN ('PREPAID', 'POSTPAID', 'WEEKLY', 'COUPON', 'DAILY')),
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
            start_date, end_date, total_deliveries_count, product_subtotal, delivery_charges_total, gross_amount,
            previous_due, advance_adjusted, net_payable, paid_amount, status, lifecycle_stage,
            items_json, notes, agent_id, created_at, updated_at
          )
          SELECT 
            id, bill_number, customer_id, billing_month, billing_type, bill_date, due_date,
            start_date, end_date, total_deliveries_count, product_subtotal, delivery_charges_total, gross_amount,
            previous_due, advance_adjusted, net_payable, paid_amount, status, lifecycle_stage,
            items_json, notes, COALESCE(agent_id, 1), created_at, updated_at
          FROM bills;

          DROP TABLE bills;
          ALTER TABLE bills_new RENAME TO bills;
        `);
        db.exec('COMMIT;');
        db.exec('PRAGMA foreign_keys=ON;');
        console.log('Bills table migrated with DAILY billing_type successfully.');
      } else {
        console.log('Bills table already includes DAILY billing_type.');
      }
    } catch (err) {
      console.error('SQLite bills migration error:', err);
      try { db.exec('ROLLBACK;'); } catch (e) {}
    }
  }

  // Sync routes and users.assigned_route
  try {
    console.log('Syncing routes and delivery boys...');
    const dboys = await db.prepare("SELECT id, assigned_route, agent_id FROM users WHERE role = 'DELIVERY_BOY'").all();
    for (const dboy of dboys || []) {
      if (dboy.assigned_route) {
        const rName = dboy.assigned_route.trim();
        await db.prepare(`
          UPDATE routes
          SET delivery_boy_id = ?, updated_at = datetime('now', 'localtime')
          WHERE (LOWER(name) = LOWER(?) OR CAST(id AS TEXT) = ? OR LOWER(name) LIKE LOWER(?))
            AND COALESCE(agent_id, 1) = ?
        `).run(dboy.id, rName, rName, `%${rName}%`, dboy.agent_id || 1);
      }
    }

    // Explicitly ensure Route 1 has delivery_boy_id = 3 (Mahesha)
    await db.prepare("UPDATE routes SET delivery_boy_id = 3 WHERE id = 1 AND (delivery_boy_id IS NULL OR delivery_boy_id = 0)").run();

    // Sync any customers in zone 11 (Chaitanya Samarpan) to delivery_boy_id = 3
    const updatedCusts = await db.prepare("UPDATE customers SET delivery_boy_id = 3 WHERE zone_id = 11 AND (delivery_boy_id IS NULL OR delivery_boy_id = 0)").run();
    console.log('Customers in Zone 11 updated:', updatedCusts.changes || 0);

    console.log('Sync complete.');
  } catch (err) {
    console.error('Sync error:', err);
  }
}

migrate().then(() => {
  console.log('Migration finished successfully!');
  process.exit(0);
}).catch(e => {
  console.error('Fatal migration error:', e);
  process.exit(1);
});
