/**
 * Migration: Add is_deleted and deleted_at columns to payments table
 * Run once: node server/scripts/migrate_payments_soft_delete.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const db = require('../config/db');

async function migrate() {
  console.log('--- Migration: Soft Delete columns for payments ---');
  console.log('Database:', db.isPostgres ? 'Supabase PostgreSQL' : 'Local SQLite');

  if (db.isPostgres) {
    await db.pool.query(`
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_deleted INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS deleted_at TEXT;
    `);
    console.log('✅ PostgreSQL: Added is_deleted and deleted_at to payments');
  } else {
    try {
      db.exec(`ALTER TABLE payments ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;`);
      console.log('✅ SQLite: Added is_deleted column');
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log('ℹ️  is_deleted column already exists');
      } else throw e;
    }
    try {
      db.exec(`ALTER TABLE payments ADD COLUMN deleted_at TEXT;`);
      console.log('✅ SQLite: Added deleted_at column');
    } catch (e) {
      if (e.message.includes('duplicate column')) {
        console.log('ℹ️  deleted_at column already exists');
      } else throw e;
    }
  }

  console.log('\n✅ Migration complete!');
  if (db.isPostgres) await db.pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
