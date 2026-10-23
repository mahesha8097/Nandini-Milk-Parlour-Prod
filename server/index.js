const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const db = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/products.routes');
const customerRoutes = require('./routes/customers.routes');
const deliveryBoyRoutes = require('./routes/deliveryBoys.routes');
const deliveryRoutes = require('./routes/deliveries.routes');
const billRoutes = require('./routes/bills.routes');
const paymentRoutes = require('./routes/payments.routes');
const expenseRoutes = require('./routes/expenses.routes');
const reportRoutes = require('./routes/reports.routes');
const profileRoutes = require('./routes/profile.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const settingsRoutes = require('./routes/settings.routes');
const dailyRequirementsRoutes = require('./routes/dailyRequirements.routes');
const zoneRoutes = require('./routes/zones.routes');
const routeRoutes = require('./routes/routes.routes');
const couponRoutes = require('./routes/coupons.routes');
const calendarRoutes = require('./routes/calendar.routes');

const { runMonthlyBillGeneration } = require('./services/billingService');

const app = express();
const PORT = process.env.PORT || 5000;

// Strict Environment-Aware CORS Configuration (Production does NOT allow wildcard '*')
const isProd = process.env.NODE_ENV === 'production';
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
  : (isProd ? [] : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:5000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000']);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, same-domain requests, server-to-server)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Automatically allow Vercel deployment domains (*.vercel.app)
    if (/\.vercel\.app$/.test(new URL(origin).hostname)) {
      return callback(null, true);
    }

    // In development mode, permit localhost and 127.0.0.1 on any port
    if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    // In production, reject unauthorized foreign origins
    return callback(new Error(`CORS policy: Origin ${origin} is not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads for local development
const uploadDir = path.join(__dirname, 'uploads');
const fs = require('fs');
if (!process.env.VERCEL && !fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (e) {
    console.warn('Upload directory creation note:', e.message);
  }
}
if (!process.env.VERCEL) {
  app.use('/uploads', express.static(uploadDir));
}

// Safe Production Health check (instant response for uptime monitors & cold-start diagnostics)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    database: db.isPostgres ? 'PostgreSQL (Supabase)' : 'SQLite (Local WAL)'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/delivery-boys', deliveryBoyRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/daily-requirements', dailyRequirementsRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/zones', zoneRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/calendar', calendarRoutes);

// Public downloadable template for bulk customer onboarding
app.get('/api/download/customer-template', (req, res) => {
  const filePath = path.join(__dirname, '../Nandini_Customers_Bulk_Import_Template.xlsx');
  res.download(filePath, 'Nandini_Customers_Bulk_Import_Template.xlsx');
});

// Run monthly advance generation on server startup for current month safely in non-serverless environments
if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    runMonthlyBillGeneration(currentMonth);
  } catch (e) {
    console.warn('Initial month bill generation check notice:', e.message);
  }
}

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Standalone listener for Local Development & Docker (Skipped automatically on Vercel Serverless)
if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(` Nandini Milk Parlour Live Backend Server`);
    console.log(` Running on: http://localhost:${PORT}`);
    console.log(` Mode: ${db.isPostgres ? 'Supabase PostgreSQL' : 'SQLite WAL'}`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
