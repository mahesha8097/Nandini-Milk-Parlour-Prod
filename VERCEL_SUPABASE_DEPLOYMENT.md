# 🚀 NANDINI MILK PARLOUR — VERCEL + SUPABASE PRODUCTION DEPLOYMENT GUIDE

This guide provides the complete, step-by-step manual sequence to deploy the **Nandini Milk Parlour** web application to **Vercel** (Frontend + Backend Serverless API) and **Supabase** (PostgreSQL Database + Persistent Cloud Storage).

---

## 🏗️ Architecture Overview

| Layer | Local Development | Live Production |
| :--- | :--- | :--- |
| **Frontend** | React 18 + Vite (`localhost:5173`) | Vercel SPA (Unified Domain) |
| **Backend API** | Node.js + Express (`localhost:5000`) | Vercel Serverless Function (`/api/*`) |
| **Database** | SQLite WAL (`server/data/nandini.db`) | Supabase PostgreSQL (Connection Pooled) |
| **Asset Storage** | Local Disk (`server/uploads/`) | Supabase Storage (`nandini-assets` Bucket) |
| **Initial State** | Local test data preserved | **100% Clean & Empty** (Zero test data) |

---

## 📋 STEP-BY-STEP DEPLOYMENT SEQUENCE

### Phase 1: Create and Configure Supabase Project

1. **Sign Up / Log In to Supabase**:
   - Go to [supabase.com](https://supabase.com) and log in.
2. **Create a New Project**:
   - Click **New Project**.
   - **Name**: `nandini-milk-parlour`
   - **Database Password**: Set a strong password (save this securely).
   - **Region**: Choose the region closest to your users (e.g. `South Asia (Mumbai)` / `ap-south-1`).
   - Click **Create new project**.

3. **Initialize the Production PostgreSQL Schema**:
   - In your Supabase dashboard, navigate to **SQL Editor** (left navigation menu).
   - Click **New query**.
   - Open the file [`server/config/postgres-schema.sql`](file:///c:/Projects/nandini-milk-parlour/server/config/postgres-schema.sql) from this repository, copy its entire contents, and paste it into the SQL editor.
   - Click **Run**.
   - Verify that all tables (`users`, `customers`, `products`, `deliveries`, `bills`, `payments`, `customer_ledger`, `daily_delivery_requirements`, `business_profile`, etc.) are created successfully.

4. **Create the Supabase Storage Bucket**:
   - Navigate to **Storage** (left navigation menu).
   - Click **New bucket**.
   - **Bucket Name**: `nandini-assets`
   - **Public bucket**: Toggle **ON** (Enable public bucket so invoice logos, QR codes, and signatures can be viewed by customers on bills).
   - Click **Save**.

5. **Obtain Supabase Connection Keys**:
   - Go to **Project Settings** → **Database**:
     - Scroll to **Connection string** → **URI**.
     - Select **Transaction** (Port `6543`) mode for serverless pooler.
     - Copy the connection URI: `postgresql://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true`
   - Go to **Project Settings** → **API**:
     - Copy **Project URL** (e.g. `https://xyzcompany.supabase.co`).
     - Copy **service_role** key (Secret key for backend storage uploads).
     - Copy **anon** key.

---

### Phase 2: Push Repository to GitHub

1. Ensure your local git repository is committed:
   ```bash
   git add .
   git commit -m "Prepare Nandini Milk Parlour for Vercel + Supabase production deployment"
   ```
2. Push your code to your private GitHub/GitLab repository.

---

### Phase 3: Deploy to Vercel

1. **Log in to Vercel**:
   - Go to [vercel.com](https://vercel.com) and log in.
2. **Import Project**:
   - Click **Add New...** → **Project**.
   - Select your Git repository `nandini-milk-parlour` and click **Import**.
3. **Configure Project Settings**:
   - **Framework Preset**: `Vite` (or `Other`)
   - **Root Directory**: `./` (leave default root)
   - **Build Command**: `npm --prefix client run build`
   - **Output Directory**: `client/dist`
   - **Install Command**: `npm install && npm --prefix client install`

4. **Add Environment Variables in Vercel**:
   In the **Environment Variables** section, add the following variables:

   | Variable Name | Environment | Value Description |
   | :--- | :--- | :--- |
   | `NODE_ENV` | Production | `production` |
   | `DATABASE_URL` | Production | `postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true` |
   | `DATABASE_SSL` | Production | `true` |
   | `JWT_SECRET` | Production | Generate a strong 32+ character random string (e.g., `openssl rand -base64 32`) |
   | `SUPABASE_URL` | Production | `https://[YOUR-PROJECT-REF].supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Production | Your Supabase `service_role` secret key |
   | `SUPABASE_ANON_KEY` | Production | Your Supabase `anon` public key |
   | `SUPABASE_STORAGE_BUCKET` | Production | `nandini-assets` |
   | `CORS_ORIGIN` | Production | Your specific production Vercel domain (e.g. `https://nandini-milk-parlour.vercel.app`). Do not use `*`. |

5. **Deploy**:
   - Click **Deploy**.
   - Vercel will build the frontend and deploy the serverless backend.

---

### Phase 4: Production Verification & First Admin Onboarding

1. **Verify Health Endpoint**:
   - Visit: `https://your-app.vercel.app/api/health`
   - Expected Response:
     ```json
     {
       "status": "online",
       "environment": "production",
       "database": "PostgreSQL (Supabase)"
     }
     ```

2. **Verify Database is 100% Clean**:
   - Open your deployed web app in browser: `https://your-app.vercel.app`
   - Because the production database has zero users, it will automatically show the **Admin Setup / Registration** screen.

3. **Register First Owner / Admin**:
   - Enter your actual Admin details (Name, Username, Strong Password, Contact Phone, Email).
   - Click **Create Admin Account**.
   - You will be logged in immediately.

4. **Setup Business & Invoicing Profile**:
   - Go to **Admin Profile** in the top navigation.
   - Enter Parlour Name: `NANDINI MILK PARLOUR`
   - Enter Parlour Address, Phone, State (`Karnataka`), and PIN Code.
   - Under **Invoice & Payment Settings**:
     - Verify **GPay / PhonePe / Paytm Number**: `7022754524`
     - Enter your UPI ID (e.g., `nandini@upi`).
     - Upload your **Business Logo**, **UPI QR Code**, and **Authorized Signature**.
   - Click **Save Profile Details**.
   - Verify that images upload to Supabase Storage and display persistently.

5. **Add Production Master Data**:
   - **Products**: Add fresh milk variants (e.g. `Samruddhi Milk 500ml`, `Special Milk 1L`, `Toned Milk 500ml`, `Curd`, `Paneer`, `Ghee`) with their volume in litres and prices.
   - **Delivery Boys**: Add real delivery boy accounts with their assigned routes.
   - **Customers**: Add House and Bulk customers with their addresses, contact numbers, and delivery plans.
   - **Subscriptions**: Set up daily milk packet subscriptions for House customers.

6. **Verify End-to-End Live Workflows**:
   - **Delivery Boy Mobile View**: Log in as a Delivery Boy on mobile browser, verify route cards, temporary quantity edits, and delivery confirmations.
   - **Admin Daily Requirements**: Test adding customer skip or extra packet requests.
   - **Billing & Invoices**: Generate monthly bills and test single-sheet invoice printing and WhatsApp image sharing.

---

## 🔒 Security & Best Practices Checklist

- [x] Zero hardcoded passwords or database URLs in source code.
- [x] Passwords hashed using bcrypt.
- [x] No default admin credentials (`admin/admin` removed).
- [x] `.env` and local `nandini.db` excluded from Git via `.gitignore`.
- [x] Supabase connection pooler configured for serverless concurrency.
- [x] All 26 core business rules preserved and audited.
