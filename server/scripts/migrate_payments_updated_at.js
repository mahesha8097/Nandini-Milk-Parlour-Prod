const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
process.env.USE_LOCAL_SQLITE = 'false';
process.env.NODE_ENV = 'production';
const db = require('../config/db');

async function migrate() {
  console.log('--- Migration: Add updated_at column to payments ---');
  console.log('Database:', db.isPostgres ? 'Supabase PostgreSQL' : 'Local SQLite');

  if (db.isPostgres) {
    await db.pool.query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS updated_at TEXT;
    `);
    console.log('✅ PostgreSQL: Added updated_at to payments');

    const cols = await db.pool.query(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'payments'
    `);
    console.log('Columns in payments:', cols.rows.map(r => r.column_name));
  } else {
    try {
      db.exec(`ALTER TABLE payments ADD COLUMN updated_at TEXT;`);
      console.log('✅ SQLite: Added updated_at column');
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log('ℹ️  updated_at column already exists');
      } else throw e;
    }
  }

  // Also test updating a payment with updatePaymentTransaction!
  console.log('\n--- Testing payment update for REC-CPN-20261101-0004 ---');
  const targetPayment = await db.prepare("SELECT * FROM payments WHERE receipt_number = 'REC-CPN-20261101-0004'").get();
  console.log('Target payment:', targetPayment);

  if (targetPayment) {
    const { updatePaymentTransaction } = require('../services/billingService');
    const updated = await updatePaymentTransaction(targetPayment.id, {
      amount: targetPayment.amount,
      paymentDate: targetPayment.payment_date,
      paymentMethod: targetPayment.payment_method,
      referenceNumber: targetPayment.reference_number,
      notes: targetPayment.notes
    });
    console.log('✅ Successfully updated payment without error:', updated);
  }

  console.log('\n✅ Migration and Verification Complete!');
  if (db.isPostgres) await db.pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
