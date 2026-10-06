# Nandini Milk Parlour — Production Setup & Architecture Guide

## 1. Production Architecture Overview
```
[ Responsive Frontend (React + Vite) ]
        ↕ HTTP / REST / JWT
[ Secure Node.js / Express Backend API ]
        ↕ Central Database Engine (WAL Concurrency)
[ Live Central Database (Persistent Storage / Volume) ]
```

- **Single Responsive Website**: Works across Desktop, Laptop, Tablet, and Mobile devices accessing the same live backend.
- **Role-Based Security**: Complete separation between Admin and Delivery Boy accounts enforced on server endpoints.
- **Zero Default Credentials**: Production starts with a clean database. The first Administrator creates credentials via `/register-admin`.

---

## 2. Production Database Strategy

### Initial Clean Database Guarantee:
When deploying to production for the first time:
- Set `DATABASE_PATH=/path/to/production/nandini_prod.db` in your environment.
- The system automatically creates all tables and relational indexes with Foreign Keys and WAL (Write-Ahead Logging) enabled.
- **NO default Admin, NO default Delivery Boy, NO demo Customers, NO demo Products, NO demo Deliveries, and NO demo Bills** will exist.
- When the owner visits the URL for the first time, the UI detects `hasAdmin = false` and opens the **Admin Registration** screen.

### Environment Variables:
```env
PORT=5000
NODE_ENV=production
JWT_SECRET=your-strong-production-secret-key-32-chars-min
DATABASE_PATH=./server/data/nandini_production.db
```

---

## 3. Verified Business Rules Reference

| Rule | Implementation Details |
| :--- | :--- |
| **Milk Delivery Charge Rule** | Total quantity of the same product delivered to the same customer on the same day: <br>• **500ml** = ₹2.00<br>• **1.0L** = ₹3.00<br>• **1.5L** = ₹4.50<br>• **2.0L** = ₹6.00<br>• **2.5L** = ₹7.50<br>• **3.0L** = ₹9.00 |
| **Product Grouping** | Calculated strictly per product identity (`productId` / base product name). Separate products (e.g. Toned Milk vs Special Cow Milk) calculate independently and are not incorrectly combined. |
| **Bulk / Hotel Customers** | Delivery Charge = ₹0.00. |
| **Historical Price & Charge Immutability** | Every recorded delivery stores an immutable snapshot (`unit_price_snapshot`, `delivery_charge_snapshot`, `product_name_snapshot`). Changing product prices in Admin never alters past deliveries or finalized bills. |
| **Effective-Date Subscription Billing** | Day-by-day evaluation across the month. A subscription starting Oct 16 bills only for active days in that month (16 days). Split subscriptions reflect both periods accurately. |
| **Advance / Prepaid Carry-Forward** | Advance payments carry forward continuously in customer ledger. When a bill is generated, available advance is adjusted first, and remaining advance is retained. |
| **Idempotent Monthly Billing** | Safe to trigger monthly generation at any time; duplicate bills for the same customer, month, and type are prevented by database unique constraints. |

---

## 4. Running the Application

### Development (with local test data intact):
```bash
# Start backend server
npm run server

# Start frontend dev server
npm run client
```

### Production Build & Run:
```bash
# Build frontend
cd client && npm run build && cd ..

# Start backend server
NODE_ENV=production npm start
```

### Run Comprehensive Automated Verification Suite:
```bash
npm test
```
