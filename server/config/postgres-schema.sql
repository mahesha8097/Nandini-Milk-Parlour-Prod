-- ====================================================================
-- NANDINI MILK PARLOUR — SUPABASE POSTGRESQL PRODUCTION SCHEMA
-- ====================================================================
-- Instructions: Execute this entire script once in the Supabase SQL Editor.
-- It initializes all required tables, constraints, indexes, and compatibility
-- helpers for a fresh, completely empty production database.
-- ====================================================================

-- 1. Enable Cryptographic extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Compatibility functions for SQLite datetime/date calls
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

-- 3. Users table (Admins and Delivery Boys)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN', 'DELIVERY_BOY')),
  phone TEXT,
  email TEXT,
  is_active INTEGER DEFAULT 1,
  assigned_route TEXT,
  agent_id INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

-- 3b. Routes table (Routes -> Zones -> Customers -> Deliveries hierarchy)
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

-- 3c. Zones table (Apartment and Villa Communities)
CREATE TABLE IF NOT EXISTS zones (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  route_order INTEGER DEFAULT 0,
  route_id INTEGER REFERENCES routes(id) ON DELETE SET NULL,
  image_url TEXT,
  agent_id INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

-- 4. Business & Invoicing Profile (Starts clean for first Admin registration)
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
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

-- Ensure base business profile row exists
INSERT INTO business_profile (id, business_name, upi_phone, updated_at)
VALUES (1, 'Nandini Milk Parlour', '7022754524', TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'))
ON CONFLICT (id) DO NOTHING;

-- 5. Products table (Flexible units and delivery rule settings)
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  variant_label TEXT NOT NULL,
  unit_volume_litres DOUBLE PRECISION DEFAULT 0,
  selling_price DOUBLE PRECISION NOT NULL,
  delivery_charge_type TEXT DEFAULT 'MILK_RULE' CHECK(delivery_charge_type IN ('MILK_RULE', 'FIXED_PER_UNIT', 'NONE')),
  fixed_delivery_charge DOUBLE PRECISION DEFAULT 0,
  is_coupon_eligible INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  image_url TEXT,
  agent_id INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

-- 5b. Zones table (Apartment, villa community, gated community, or delivery cluster)
CREATE TABLE IF NOT EXISTS zones (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  route_order INTEGER DEFAULT 0,
  image_url TEXT,
  agent_id INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

-- 6. Customers table (House and Bulk / Commercial)
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
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
  advance_balance DOUBLE PRECISION DEFAULT 0.0,
  pending_balance DOUBLE PRECISION DEFAULT 0.0,
  coupon_balance INTEGER DEFAULT 0,
  agent_id INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

-- 7. Subscriptions table (House recurring deliveries)
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1,
  frequency TEXT DEFAULT 'DAILY' CHECK(frequency IN ('DAILY', 'ALTERNATE_DAYS', 'CUSTOM')),
  custom_days TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

-- 8. Deliveries table (Historical records with complete price & rule snapshots)
CREATE TABLE IF NOT EXISTS deliveries (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  delivery_boy_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  delivery_date TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  category_snapshot TEXT NOT NULL,
  variant_snapshot TEXT NOT NULL,
  unit_volume_litres_snapshot DOUBLE PRECISION DEFAULT 0,
  quantity INTEGER NOT NULL,
  unit_price_snapshot DOUBLE PRECISION NOT NULL,
  total_product_amount DOUBLE PRECISION NOT NULL,
  delivery_charge_snapshot DOUBLE PRECISION NOT NULL,
  total_amount DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('DELIVERED', 'SKIPPED', 'PENDING', 'MISSED')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE (customer_id, product_id, delivery_date)
);

-- 9. Monthly Bills table (Advance for PREPAID or Actual Deliveries for POSTPAID)
CREATE TABLE IF NOT EXISTS bills (
  id SERIAL PRIMARY KEY,
  bill_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  billing_month TEXT NOT NULL,
  billing_type TEXT NOT NULL CHECK(billing_type IN ('PREPAID', 'POSTPAID', 'WEEKLY', 'COUPON', 'DAILY')),
  bill_date TEXT NOT NULL,
  due_date TEXT,
  start_date TEXT,
  end_date TEXT,
  total_deliveries_count INTEGER DEFAULT 0,
  product_subtotal DOUBLE PRECISION NOT NULL DEFAULT 0,
  delivery_charges_total DOUBLE PRECISION NOT NULL DEFAULT 0,
  gross_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  previous_due DOUBLE PRECISION NOT NULL DEFAULT 0,
  advance_adjusted DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_payable DOUBLE PRECISION NOT NULL DEFAULT 0,
  paid_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('DRAFT', 'GENERATED', 'ADVANCE_PAID', 'PARTIALLY_PAID', 'PAID', 'PENDING', 'CANCELLED')),
  lifecycle_stage TEXT DEFAULT 'FINALIZED' CHECK(lifecycle_stage IN ('DRAFT', 'REVIEW', 'FINALIZED')),
  items_json TEXT,
  notes TEXT,
  agent_id INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE (customer_id, billing_month, billing_type)
);

-- 9b. Coupon Books table
CREATE TABLE IF NOT EXISTS coupon_books (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
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

-- 9c. Coupon Transactions table
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

-- 10. Payments table
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  receipt_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
  payment_type TEXT NOT NULL CHECK(payment_type IN ('ADVANCE_PAYMENT', 'POSTPAID_BILL_PAYMENT', 'DIRECT_PAYMENT')),
  amount DOUBLE PRECISION NOT NULL,
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER')),
  reference_number TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
  recorded_by_user_id INTEGER REFERENCES users(id)
);

-- 11. Customer Continuous Ledger
CREATE TABLE IF NOT EXISTS customer_ledger (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  transaction_date TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('BILL_GENERATED', 'PAYMENT_RECEIVED', 'ADVANCE_DEPOSITED', 'ADVANCE_ADJUSTED', 'REFUND', 'ADJUSTMENT')),
  reference_id TEXT,
  debit DOUBLE PRECISION DEFAULT 0.0,
  credit DOUBLE PRECISION DEFAULT 0.0,
  advance_balance_after DOUBLE PRECISION NOT NULL,
  pending_balance_after DOUBLE PRECISION NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

-- 12. Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL CHECK(category IN ('RENT', 'SALARY', 'PETROL', 'ELECTRICITY', 'MAINTENANCE', 'PURCHASE', 'OTHER')),
  amount DOUBLE PRECISION NOT NULL,
  expense_date TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER')),
  recipient_name TEXT,
  description TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
  created_by_user_id INTEGER REFERENCES users(id)
);

-- 13. App Settings table
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

-- 14. Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

-- 15. Daily Delivery Requirements table
CREATE TABLE IF NOT EXISTS daily_delivery_requirements (
  id SERIAL PRIMARY KEY,
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
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
  UNIQUE(customer_id, product_id, delivery_date)
);

-- 16. Delivery Corrections table
CREATE TABLE IF NOT EXISTS delivery_corrections (
  id SERIAL PRIMARY KEY,
  delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  delivery_date TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  previous_quantity INTEGER NOT NULL,
  corrected_quantity INTEGER NOT NULL,
  previous_amount REAL NOT NULL DEFAULT 0,
  corrected_amount REAL NOT NULL DEFAULT 0,
  reason TEXT,
  corrected_by_user_id INTEGER REFERENCES users(id),
  corrected_by_role TEXT,
  agent_id INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

-- 17. Customer Vacations / Delivery Pause Scheduler
CREATE TABLE IF NOT EXISTS customer_vacations (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  resume_date TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  notify_agent_date TEXT,
  agent_id INTEGER DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
  updated_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

-- 18. Automated Email Report Audit Logs
CREATE TABLE IF NOT EXISTS email_report_logs (
  id SERIAL PRIMARY KEY,
  report_date TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'DAILY_DELIVERY',
  recipient_email TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  resend_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('SENT', 'FAILED', 'SKIPPED_DUPLICATE', 'TEST_MODE')),
  error_message TEXT,
  report_summary_json TEXT,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('CRON', 'ADMIN_TEST', 'MANUAL')),
  agent_id INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
);

-- 19. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_email_logs_date ON email_report_logs(report_date, report_type);
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
CREATE INDEX IF NOT EXISTS idx_deliv_corr_deliv ON delivery_corrections(delivery_id);
CREATE INDEX IF NOT EXISTS idx_deliv_corr_cust ON delivery_corrections(customer_id);
CREATE INDEX IF NOT EXISTS idx_deliv_corr_date ON delivery_corrections(delivery_date);
CREATE INDEX IF NOT EXISTS idx_cust_vacations_dates ON customer_vacations(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_cust_vacations_notify ON customer_vacations(notify_agent_date);

