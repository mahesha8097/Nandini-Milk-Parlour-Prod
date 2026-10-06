import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import StatCard from '../../components/common/StatCard';
import EmptyState from '../../components/common/EmptyState';
import {
  TrendingUp,
  Milk,
  PackageCheck,
  Users,
  CreditCard,
  Wallet,
  Calendar,
  PlusCircle,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  ShoppingBag,
  Truck,
  Receipt
} from 'lucide-react';

export default function AdminDashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('today'); // 'today' | 'week' | 'month'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/dashboard');
      setData(res);
    } catch (err) {
      setError(err.message || 'Unable to load data. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="page-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <RefreshCw size={32} className="spin" color="var(--primary)" />
          <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Loading live dashboard data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-wrapper">
        <div className="card" style={{ background: 'var(--accent-red-light)', borderColor: '#fecaca', textAlign: 'center', padding: '32px' }}>
          <p style={{ color: '#991b1b', fontWeight: '700', fontSize: '1rem', marginBottom: '12px' }}>{error}</p>
          <button onClick={fetchDashboardData} className="btn btn-primary btn-sm">
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const today = data?.todayOverview || {};
  const customers = data?.customerOverview || {};
  const payments = data?.paymentOverview || {};
  const expenses = data?.expenseOverview || {};
  const salesPeriod = data?.salesPeriods?.[period] || {};

  return (
    <div className="page-wrapper">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <TrendingUp size={28} color="var(--primary)" />
            Admin Live Dashboard
          </h1>
          <p className="page-subtitle">Real-time business performance and delivery operations</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={fetchDashboardData} className="btn btn-outline btn-sm">
            <RefreshCw size={16} />
            <span>Refresh Live Data</span>
          </button>
        </div>
      </div>

      {/* Quick Action Bar */}
      <div className="card" style={{ marginBottom: '24px', padding: '16px 20px', background: 'white' }}>
        <div style={{ fontSize: '0.813rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '12px' }}>
          Quick Actions
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <button onClick={() => onNavigate('customers', { openAdd: true })} className="btn btn-outline btn-sm">
            <PlusCircle size={15} color="var(--primary)" /> Add Customer
          </button>
          <button onClick={() => onNavigate('products', { openAdd: true })} className="btn btn-outline btn-sm">
            <ShoppingBag size={15} color="#059669" /> Add Product
          </button>
          <button onClick={() => onNavigate('delivery-boys', { openAdd: true })} className="btn btn-outline btn-sm">
            <Truck size={15} color="#6366f1" /> Add Delivery Boy
          </button>
          <button onClick={() => onNavigate('payments', { openAdd: true })} className="btn btn-outline btn-sm">
            <CreditCard size={15} color="#d97706" /> Record Payment
          </button>
          <button onClick={() => onNavigate('expenses', { openAdd: true })} className="btn btn-outline btn-sm">
            <Wallet size={15} color="#dc2626" /> Record Expense
          </button>
          <button onClick={() => onNavigate('bills')} className="btn btn-outline btn-sm">
            <Receipt size={15} color="var(--primary)" /> View Bills
          </button>
          <button onClick={() => onNavigate('deliveries')} className="btn btn-outline btn-sm">
            <PackageCheck size={15} color="#059669" /> View Deliveries
          </button>
        </div>
      </div>

      {/* Top Overview Cards */}
      <div className="stat-grid">
        <StatCard
          label="Today's Sales"
          value={`₹${today.todaySales?.toFixed(2) || '0.00'}`}
          subtext="Completed deliveries today"
          icon={TrendingUp}
          color="#0054a6"
          bgLight="#e8f1fb"
        />
        <StatCard
          label="Today's Milk"
          value={`${today.todayMilkLitres || 0} Litres`}
          subtext="Total milk delivered today"
          icon={Milk}
          color="#0284c7"
          bgLight="#e0f2fe"
        />
        <StatCard
          label="Today's Curd"
          value={`${today.todayCurdLitres || 0} Litres`}
          subtext="Total curd delivered today"
          icon={Milk}
          color="#0d9488"
          bgLight="#ccfbf1"
        />
        <StatCard
          label="Today's Deliveries"
          value={`${today.completedDeliveries || 0} / ${today.totalDeliveries || 0}`}
          subtext={`${today.pendingDeliveries || 0} Pending • ${today.skippedDeliveries || 0} Skipped`}
          icon={PackageCheck}
          color="#10b981"
          bgLight="#ecfdf5"
        />
        <StatCard
          label="Today's Collection"
          value={`₹${today.todayCollection?.toFixed(2) || '0.00'}`}
          subtext="Payments received today"
          icon={CreditCard}
          color="#16a34a"
          bgLight="#dcfce7"
        />
        <StatCard
          label="Pending Payments"
          value={`₹${payments.pendingAmount?.toFixed(2) || '0.00'}`}
          subtext={`${customers.customersWithPending || 0} customers with dues`}
          icon={Receipt}
          color="#dc2626"
          bgLight="#fee2e2"
        />
        <StatCard
          label="Customer Advance"
          value={`₹${payments.advanceBalance?.toFixed(2) || '0.00'}`}
          subtext="Total prepaid balance in credit"
          icon={Wallet}
          color="#d97706"
          bgLight="#fef3c7"
        />
        <StatCard
          label="Total Customers"
          value={customers.totalCustomers || 0}
          subtext={`${customers.houseCustomers || 0} House • ${customers.bulkCustomers || 0} Bulk`}
          icon={Users}
          color="#6366f1"
          bgLight="#e0e7ff"
        />
      </div>

      {/* Sales Overview Section with Period Switcher */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '800' }}>Sales Breakdown</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Product volume & revenue by timeframe</p>
            </div>
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', gap: '2px' }}>
              <button
                onClick={() => setPeriod('today')}
                style={{
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  background: period === 'today' ? 'white' : 'transparent',
                  color: period === 'today' ? 'var(--primary)' : 'var(--text-secondary)',
                  boxShadow: period === 'today' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                Today
              </button>
              <button
                onClick={() => setPeriod('week')}
                style={{
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  background: period === 'week' ? 'white' : 'transparent',
                  color: period === 'week' ? 'var(--primary)' : 'var(--text-secondary)',
                  boxShadow: period === 'week' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                This Week
              </button>
              <button
                onClick={() => setPeriod('month')}
                style={{
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  background: period === 'month' ? 'white' : 'transparent',
                  color: period === 'month' ? 'var(--primary)' : 'var(--text-secondary)',
                  boxShadow: period === 'month' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                This Month
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>TOTAL REVENUE</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--primary)', marginTop: '4px' }}>
                ₹{salesPeriod.totalSales?.toFixed(2) || '0.00'}
              </div>
            </div>
            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>MILK QUANTITY</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0284c7', marginTop: '4px' }}>
                {salesPeriod.milkLitres || 0} <span style={{ fontSize: '0.875rem' }}>L</span>
              </div>
            </div>
            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>CURD QUANTITY</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0d9488', marginTop: '4px' }}>
                {salesPeriod.curdLitres || 0} <span style={{ fontSize: '0.875rem' }}>L</span>
              </div>
            </div>
            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>OTHER PRODUCTS</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#8b5cf6', marginTop: '4px' }}>
                ₹{salesPeriod.otherSales?.toFixed(2) || '0.00'}
              </div>
            </div>
          </div>
        </div>

        {/* Expenses & Collection Summary */}
        <div className="card">
          <h3 style={{ fontSize: '1.05rem', fontWeight: '800', marginBottom: '16px' }}>Financial Health Overview</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.875rem' }}>Month Collections</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total received this month</div>
              </div>
              <div style={{ fontWeight: '800', fontSize: '1.125rem', color: '#16a34a' }}>
                ₹{payments.monthCollection?.toFixed(2) || '0.00'}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.875rem' }}>Today's Expenses</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Operational outlays today</div>
              </div>
              <div style={{ fontWeight: '800', fontSize: '1.125rem', color: '#dc2626' }}>
                ₹{expenses.todayExpenses?.toFixed(2) || '0.00'}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.875rem' }}>Month's Expenses</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total spend this month</div>
              </div>
              <div style={{ fontWeight: '800', fontSize: '1.125rem', color: '#dc2626' }}>
                ₹{expenses.monthExpenses?.toFixed(2) || '0.00'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Deliveries & Collections Table */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        {/* Recent Deliveries */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '800' }}>Recent Deliveries</h3>
            <button onClick={() => onNavigate('deliveries')} className="btn btn-outline btn-sm">View All</button>
          </div>

          {(!data?.recentActivity?.deliveries || data.recentActivity.deliveries.length === 0) ? (
            <EmptyState title="No deliveries recorded yet" description="Deliveries will appear here once marked." />
          ) : (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentActivity.deliveries.map((del) => (
                    <tr key={del.id}>
                      <td style={{ fontWeight: '600' }}>{del.customer_name}</td>
                      <td>{del.product_name_snapshot} ({del.variant_snapshot})</td>
                      <td>{del.quantity}</td>
                      <td style={{ fontWeight: '700' }}>₹{del.total_amount?.toFixed(2)}</td>
                      <td>
                        <span className={`badge ${del.status === 'DELIVERED' ? 'badge-success' : del.status === 'SKIPPED' ? 'badge-warning' : 'badge-info'}`}>
                          {del.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Payments */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '800' }}>Recent Collections</h3>
            <button onClick={() => onNavigate('payments')} className="btn btn-outline btn-sm">View All</button>
          </div>

          {(!data?.recentActivity?.payments || data.recentActivity.payments.length === 0) ? (
            <EmptyState title="No payments recorded yet" description="Payments recorded will show up in real-time." />
          ) : (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Method</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentActivity.payments.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--primary)' }}>{p.receipt_number}</td>
                      <td style={{ fontWeight: '600' }}>{p.customer_name}</td>
                      <td style={{ fontSize: '0.75rem' }}>{p.payment_type === 'ADVANCE_PAYMENT' ? 'Advance' : 'Postpaid'}</td>
                      <td><span className="badge badge-gray">{p.payment_method}</span></td>
                      <td style={{ fontWeight: '800', color: '#16a34a' }}>₹{p.amount?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
