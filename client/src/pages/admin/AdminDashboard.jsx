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
  Receipt,
  CalendarRange,
  BarChart3,
  Layers,
  ArrowUpRight,
  Percent,
  Check
} from 'lucide-react';

export default function AdminDashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [timeframe, setTimeframe] = useState('daily'); // 'daily' | 'weekly' | 'monthly'
  const [displayMode, setDisplayMode] = useState('cards'); // 'cards' | 'matrix'
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

  // Formatted period statistics with robust fallbacks
  const periods = data?.periods || {
    daily: {
      label: 'Daily (Today)',
      dateRange: 'Today',
      sales: today.todaySales || 0,
      milkLitres: today.todayMilkLitres || 0,
      curdLitres: today.todayCurdLitres || 0,
      otherSales: data?.salesPeriods?.today?.otherSales || 0,
      totalDeliveries: today.totalDeliveries || 0,
      completedDeliveries: today.completedDeliveries || 0,
      pendingDeliveries: today.pendingDeliveries || 0,
      skippedDeliveries: today.skippedDeliveries || 0,
      deliverySuccessRate: today.totalDeliveries > 0 ? parseFloat(((today.completedDeliveries / today.totalDeliveries) * 100).toFixed(1)) : 0,
      totalCollection: today.todayCollection || 0,
      advanceCollection: payments.todayAdvance || 0,
      postpaidCollection: payments.todayPostpaid || 0,
      directCollection: 0,
      totalExpenses: expenses.todayExpenses || 0,
      netCashflow: (today.todayCollection || 0) - (expenses.todayExpenses || 0)
    },
    weekly: {
      label: 'Weekly (This Week)',
      dateRange: 'This Week',
      sales: data?.salesPeriods?.week?.totalSales || 0,
      milkLitres: data?.salesPeriods?.week?.milkLitres || 0,
      curdLitres: data?.salesPeriods?.week?.curdLitres || 0,
      otherSales: data?.salesPeriods?.week?.otherSales || 0,
      totalDeliveries: 0,
      completedDeliveries: 0,
      pendingDeliveries: 0,
      skippedDeliveries: 0,
      deliverySuccessRate: 0,
      totalCollection: 0,
      advanceCollection: 0,
      postpaidCollection: 0,
      directCollection: 0,
      totalExpenses: 0,
      netCashflow: 0
    },
    monthly: {
      label: 'Monthly (This Month)',
      dateRange: 'This Month',
      sales: data?.salesPeriods?.month?.totalSales || 0,
      milkLitres: data?.salesPeriods?.month?.milkLitres || 0,
      curdLitres: data?.salesPeriods?.month?.curdLitres || 0,
      otherSales: data?.salesPeriods?.month?.otherSales || 0,
      totalDeliveries: today.totalDeliveries || 0,
      completedDeliveries: today.completedDeliveries || 0,
      pendingDeliveries: today.pendingDeliveries || 0,
      skippedDeliveries: today.skippedDeliveries || 0,
      deliverySuccessRate: today.totalDeliveries > 0 ? parseFloat(((today.completedDeliveries / today.totalDeliveries) * 100).toFixed(1)) : 0,
      totalCollection: payments.monthCollection || 0,
      advanceCollection: 0,
      postpaidCollection: 0,
      directCollection: 0,
      totalExpenses: expenses.monthExpenses || 0,
      netCashflow: (payments.monthCollection || 0) - (expenses.monthExpenses || 0)
    }
  };

  const activePeriod = periods[timeframe] || periods.daily;

  // Label prefix for the current timeframe (e.g. "Today's", "This Week's", "This Month's")
  const periodPrefix = timeframe === 'daily' ? "Today's" : timeframe === 'weekly' ? "Week's" : "Month's";

  return (
    <div className="page-wrapper">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
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
      <div className="card" style={{ marginBottom: '20px', padding: '14px 18px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.05em' }}>
          Quick Actions
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
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

      {/* Primary Period Selection Ribbon */}
      <div
        className="card"
        style={{
          marginBottom: '20px',
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 100%)',
          border: '1px solid #cbd5e1'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: 'var(--primary)', color: 'white', padding: '6px 8px', borderRadius: '8px', display: 'flex', alignItems: 'center' }}>
            <CalendarRange size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: '800', color: 'var(--text-primary)' }}>
              Viewing: <span style={{ color: 'var(--primary)' }}>{activePeriod.label}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Period: {activePeriod.dateRange}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#e2e8f0', padding: '4px', borderRadius: '10px' }}>
          <button
            onClick={() => setTimeframe('daily')}
            style={{
              border: 'none',
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '0.813rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: timeframe === 'daily' ? 'white' : 'transparent',
              color: timeframe === 'daily' ? 'var(--primary)' : 'var(--text-secondary)',
              boxShadow: timeframe === 'daily' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Calendar size={14} /> Daily (Today)
          </button>
          <button
            onClick={() => setTimeframe('weekly')}
            style={{
              border: 'none',
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '0.813rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: timeframe === 'weekly' ? 'white' : 'transparent',
              color: timeframe === 'weekly' ? 'var(--primary)' : 'var(--text-secondary)',
              boxShadow: timeframe === 'weekly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <TrendingUp size={14} /> Weekly (This Week)
          </button>
          <button
            onClick={() => setTimeframe('monthly')}
            style={{
              border: 'none',
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '0.813rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: timeframe === 'monthly' ? 'white' : 'transparent',
              color: timeframe === 'monthly' ? 'var(--primary)' : 'var(--text-secondary)',
              boxShadow: timeframe === 'monthly' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Receipt size={14} /> Monthly (This Month)
          </button>
        </div>
      </div>

      {/* Top Dynamic Overview Cards */}
      <div className="stat-grid" style={{ marginBottom: '24px' }}>
        <StatCard
          label={`${periodPrefix} Sales`}
          value={`₹${activePeriod.sales?.toFixed(2) || '0.00'}`}
          subtext={`Completed sales (${timeframe})`}
          icon={TrendingUp}
          color="#0054a6"
          bgLight="#e8f1fb"
        />
        <StatCard
          label={`${periodPrefix} Milk`}
          value={`${activePeriod.milkLitres || 0} Litres`}
          subtext={`Total milk delivered (${timeframe})`}
          icon={Milk}
          color="#0284c7"
          bgLight="#e0f2fe"
        />
        <StatCard
          label={`${periodPrefix} Curd`}
          value={`${activePeriod.curdLitres || 0} Litres`}
          subtext={`Total curd delivered (${timeframe})`}
          icon={Milk}
          color="#0d9488"
          bgLight="#ccfbf1"
        />
        <StatCard
          label={`${periodPrefix} Deliveries`}
          value={`${activePeriod.completedDeliveries || 0} / ${activePeriod.totalDeliveries || 0}`}
          subtext={`${activePeriod.pendingDeliveries || 0} Pending • ${activePeriod.skippedDeliveries || 0} Skipped (${activePeriod.deliverySuccessRate || 0}%)`}
          icon={PackageCheck}
          color="#10b981"
          bgLight="#ecfdf5"
        />
        <StatCard
          label={`${periodPrefix} Collection`}
          value={`₹${activePeriod.totalCollection?.toFixed(2) || '0.00'}`}
          subtext={`Adv: ₹${activePeriod.advanceCollection?.toFixed(0) || '0'} • Post: ₹${activePeriod.postpaidCollection?.toFixed(0) || '0'}`}
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

      {/* Multi-Period Detailed Section (Daily • Weekly • Monthly) */}
      <div className="card" style={{ marginBottom: '24px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart3 size={20} color="var(--primary)" />
              <h3 style={{ fontSize: '1.15rem', fontWeight: '800' }}>Operations & Financial Performance</h3>
            </div>
            <p style={{ fontSize: '0.813rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Comprehensive performance details across Daily, Weekly, and Monthly periods
            </p>
          </div>

          {/* View Mode Toggle: Cards vs Comparison Matrix */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', gap: '3px' }}>
            <button
              onClick={() => setDisplayMode('cards')}
              style={{
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: displayMode === 'cards' ? 'white' : 'transparent',
                color: displayMode === 'cards' ? 'var(--primary)' : 'var(--text-secondary)',
                boxShadow: displayMode === 'cards' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
              }}
            >
              <Layers size={14} /> Detailed Cards ({activePeriod.label.split(' ')[0]})
            </button>
            <button
              onClick={() => setDisplayMode('matrix')}
              style={{
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: displayMode === 'matrix' ? 'white' : 'transparent',
                color: displayMode === 'matrix' ? 'var(--primary)' : 'var(--text-secondary)',
                boxShadow: displayMode === 'matrix' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
              }}
            >
              <BarChart3 size={14} /> All-Timeframes Comparison (Daily • Weekly • Monthly)
            </button>
          </div>
        </div>

        {/* View Mode 1: Detailed Cards for the Selected Timeframe */}
        {displayMode === 'cards' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            {/* Sales & Product Quantities Card */}
            <div style={{ background: '#f8fafc', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '0.813rem', fontWeight: '800', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  📦 Sales & Product Volumes
                </span>
                <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>{activePeriod.label}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)' }}>TOTAL REVENUE</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--primary)', marginTop: '2px' }}>
                    ₹{activePeriod.sales?.toFixed(2) || '0.00'}
                  </div>
                </div>

                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)' }}>MILK QUANTITY</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0284c7', marginTop: '2px' }}>
                    {activePeriod.milkLitres || 0} <span style={{ fontSize: '0.8rem' }}>L</span>
                  </div>
                </div>

                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)' }}>CURD QUANTITY</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0d9488', marginTop: '2px' }}>
                    {activePeriod.curdLitres || 0} <span style={{ fontSize: '0.8rem' }}>L</span>
                  </div>
                </div>

                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)' }}>OTHER PRODUCTS</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#8b5cf6', marginTop: '2px' }}>
                    ₹{activePeriod.otherSales?.toFixed(2) || '0.00'}
                  </div>
                </div>
              </div>
            </div>

            {/* Delivery Operations & Success Rate Card */}
            <div style={{ background: '#f8fafc', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '0.813rem', fontWeight: '800', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  🚚 Delivery Fulfillment
                </span>
                <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>
                  {activePeriod.deliverySuccessRate || 0}% Success
                </span>
              </div>

              {/* Progress Bar */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  <span>Completed: {activePeriod.completedDeliveries} of {activePeriod.totalDeliveries}</span>
                  <span>{activePeriod.deliverySuccessRate}%</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(activePeriod.deliverySuccessRate || 0, 100)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                      borderRadius: '999px',
                      transition: 'width 0.4s ease'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <div style={{ background: 'white', padding: '10px 8px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: '700', color: '#059669' }}>COMPLETED</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#059669', marginTop: '2px' }}>
                    {activePeriod.completedDeliveries}
                  </div>
                </div>

                <div style={{ background: 'white', padding: '10px 8px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: '700', color: '#d97706' }}>PENDING</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#d97706', marginTop: '2px' }}>
                    {activePeriod.pendingDeliveries}
                  </div>
                </div>

                <div style={{ background: 'white', padding: '10px 8px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748b' }}>SKIPPED</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#64748b', marginTop: '2px' }}>
                    {activePeriod.skippedDeliveries}
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Health & Collections Breakdown Card */}
            <div style={{ background: '#f8fafc', padding: '18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontSize: '0.813rem', fontWeight: '800', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  💰 Financials & Cashflow
                </span>
                <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>{activePeriod.label}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: '700' }}>Total Collections</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      Adv ₹{activePeriod.advanceCollection?.toFixed(0)} • Post ₹{activePeriod.postpaidCollection?.toFixed(0)} • Dir ₹{activePeriod.directCollection?.toFixed(0)}
                    </div>
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#16a34a' }}>
                    ₹{activePeriod.totalCollection?.toFixed(2) || '0.00'}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: '700' }}>Operating Expenses</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Recorded expenses ({timeframe})</div>
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#dc2626' }}>
                    ₹{activePeriod.totalExpenses?.toFixed(2) || '0.00'}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#065f46' }}>Net Operating Flow</div>
                    <div style={{ fontSize: '0.68rem', color: '#047857' }}>Collections minus expenses</div>
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#047857' }}>
                    ₹{activePeriod.netCashflow?.toFixed(2) || '0.00'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View Mode 2: Full Side-by-Side Comparison Matrix */}
        {displayMode === 'matrix' && (
          <div className="table-container" style={{ marginTop: '8px' }}>
            <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ textAlign: 'left', padding: '12px 14px', fontWeight: '800', fontSize: '0.813rem' }}>METRIC CATEGORY</th>
                  <th style={{ textAlign: 'center', padding: '12px 14px', fontWeight: '800', fontSize: '0.813rem', color: 'var(--primary)', background: timeframe === 'daily' ? '#e0f2fe' : 'transparent' }}>
                    📅 DAILY (TODAY)
                    <div style={{ fontSize: '0.68rem', fontWeight: '600', color: 'var(--text-secondary)' }}>{periods.daily.dateRange}</div>
                  </th>
                  <th style={{ textAlign: 'center', padding: '12px 14px', fontWeight: '800', fontSize: '0.813rem', color: '#0284c7', background: timeframe === 'weekly' ? '#e0f2fe' : 'transparent' }}>
                    📆 WEEKLY (THIS WEEK)
                    <div style={{ fontSize: '0.68rem', fontWeight: '600', color: 'var(--text-secondary)' }}>{periods.weekly.dateRange}</div>
                  </th>
                  <th style={{ textAlign: 'center', padding: '12px 14px', fontWeight: '800', fontSize: '0.813rem', color: '#0d9488', background: timeframe === 'monthly' ? '#e0f2fe' : 'transparent' }}>
                    📊 MONTHLY (THIS MONTH)
                    <div style={{ fontSize: '0.68rem', fontWeight: '600', color: 'var(--text-secondary)' }}>{periods.monthly.dateRange}</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Section Header: Sales & Volume */}
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={4} style={{ fontWeight: '800', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', padding: '8px 14px', letterSpacing: '0.05em' }}>
                    1. Sales Revenue & Volumes
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: '600', padding: '10px 14px' }}>Total Completed Sales (₹)</td>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: 'var(--primary)', padding: '10px 14px', background: timeframe === 'daily' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.daily.sales?.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: 'var(--primary)', padding: '10px 14px', background: timeframe === 'weekly' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.weekly.sales?.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: 'var(--primary)', padding: '10px 14px', background: timeframe === 'monthly' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.monthly.sales?.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: '600', padding: '10px 14px' }}>Total Milk Delivered (Litres)</td>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: '#0284c7', padding: '10px 14px', background: timeframe === 'daily' ? '#f0f9ff' : 'transparent' }}>
                    {periods.daily.milkLitres} L
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: '#0284c7', padding: '10px 14px', background: timeframe === 'weekly' ? '#f0f9ff' : 'transparent' }}>
                    {periods.weekly.milkLitres} L
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: '#0284c7', padding: '10px 14px', background: timeframe === 'monthly' ? '#f0f9ff' : 'transparent' }}>
                    {periods.monthly.milkLitres} L
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: '600', padding: '10px 14px' }}>Total Curd Delivered (Litres)</td>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: '#0d9488', padding: '10px 14px', background: timeframe === 'daily' ? '#f0f9ff' : 'transparent' }}>
                    {periods.daily.curdLitres} L
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: '#0d9488', padding: '10px 14px', background: timeframe === 'weekly' ? '#f0f9ff' : 'transparent' }}>
                    {periods.weekly.curdLitres} L
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: '#0d9488', padding: '10px 14px', background: timeframe === 'monthly' ? '#f0f9ff' : 'transparent' }}>
                    {periods.monthly.curdLitres} L
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: '600', padding: '10px 14px' }}>Other Products Sales (₹)</td>
                  <td style={{ textAlign: 'center', fontWeight: '600', padding: '10px 14px', background: timeframe === 'daily' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.daily.otherSales?.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '600', padding: '10px 14px', background: timeframe === 'weekly' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.weekly.otherSales?.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '600', padding: '10px 14px', background: timeframe === 'monthly' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.monthly.otherSales?.toFixed(2)}
                  </td>
                </tr>

                {/* Section Header: Deliveries Operations */}
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={4} style={{ fontWeight: '800', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', padding: '8px 14px', letterSpacing: '0.05em' }}>
                    2. Delivery Operations
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: '600', padding: '10px 14px' }}>Total Scheduled Deliveries</td>
                  <td style={{ textAlign: 'center', fontWeight: '700', padding: '10px 14px', background: timeframe === 'daily' ? '#f0f9ff' : 'transparent' }}>
                    {periods.daily.totalDeliveries}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '700', padding: '10px 14px', background: timeframe === 'weekly' ? '#f0f9ff' : 'transparent' }}>
                    {periods.weekly.totalDeliveries}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '700', padding: '10px 14px', background: timeframe === 'monthly' ? '#f0f9ff' : 'transparent' }}>
                    {periods.monthly.totalDeliveries}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: '600', padding: '10px 14px' }}>Completed Deliveries (Delivered)</td>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: '#16a34a', padding: '10px 14px', background: timeframe === 'daily' ? '#f0f9ff' : 'transparent' }}>
                    {periods.daily.completedDeliveries}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: '#16a34a', padding: '10px 14px', background: timeframe === 'weekly' ? '#f0f9ff' : 'transparent' }}>
                    {periods.weekly.completedDeliveries}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: '#16a34a', padding: '10px 14px', background: timeframe === 'monthly' ? '#f0f9ff' : 'transparent' }}>
                    {periods.monthly.completedDeliveries}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: '600', padding: '10px 14px' }}>Pending / In Progress</td>
                  <td style={{ textAlign: 'center', fontWeight: '600', color: '#d97706', padding: '10px 14px', background: timeframe === 'daily' ? '#f0f9ff' : 'transparent' }}>
                    {periods.daily.pendingDeliveries}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '600', color: '#d97706', padding: '10px 14px', background: timeframe === 'weekly' ? '#f0f9ff' : 'transparent' }}>
                    {periods.weekly.pendingDeliveries}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '600', color: '#d97706', padding: '10px 14px', background: timeframe === 'monthly' ? '#f0f9ff' : 'transparent' }}>
                    {periods.monthly.pendingDeliveries}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: '600', padding: '10px 14px' }}>Skipped Deliveries</td>
                  <td style={{ textAlign: 'center', fontWeight: '600', color: '#64748b', padding: '10px 14px', background: timeframe === 'daily' ? '#f0f9ff' : 'transparent' }}>
                    {periods.daily.skippedDeliveries}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '600', color: '#64748b', padding: '10px 14px', background: timeframe === 'weekly' ? '#f0f9ff' : 'transparent' }}>
                    {periods.weekly.skippedDeliveries}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '600', color: '#64748b', padding: '10px 14px', background: timeframe === 'monthly' ? '#f0f9ff' : 'transparent' }}>
                    {periods.monthly.skippedDeliveries}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: '600', padding: '10px 14px' }}>Delivery Fulfillment Success Rate</td>
                  <td style={{ textAlign: 'center', padding: '10px 14px', background: timeframe === 'daily' ? '#f0f9ff' : 'transparent' }}>
                    <span className="badge badge-success">{periods.daily.deliverySuccessRate}%</span>
                  </td>
                  <td style={{ textAlign: 'center', padding: '10px 14px', background: timeframe === 'weekly' ? '#f0f9ff' : 'transparent' }}>
                    <span className="badge badge-success">{periods.weekly.deliverySuccessRate}%</span>
                  </td>
                  <td style={{ textAlign: 'center', padding: '10px 14px', background: timeframe === 'monthly' ? '#f0f9ff' : 'transparent' }}>
                    <span className="badge badge-success">{periods.monthly.deliverySuccessRate}%</span>
                  </td>
                </tr>

                {/* Section Header: Financials & Collections */}
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={4} style={{ fontWeight: '800', fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', padding: '8px 14px', letterSpacing: '0.05em' }}>
                    3. Collections & Financial Health
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: '700', padding: '10px 14px' }}>Total Collections Received (₹)</td>
                  <td style={{ textAlign: 'center', fontWeight: '800', color: '#16a34a', padding: '10px 14px', background: timeframe === 'daily' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.daily.totalCollection?.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '800', color: '#16a34a', padding: '10px 14px', background: timeframe === 'weekly' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.weekly.totalCollection?.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '800', color: '#16a34a', padding: '10px 14px', background: timeframe === 'monthly' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.monthly.totalCollection?.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: '600', padding: '8px 14px', fontSize: '0.813rem', color: 'var(--text-secondary)' }}>• Advance Collections (₹)</td>
                  <td style={{ textAlign: 'center', fontSize: '0.813rem', padding: '8px 14px', background: timeframe === 'daily' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.daily.advanceCollection?.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '0.813rem', padding: '8px 14px', background: timeframe === 'weekly' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.weekly.advanceCollection?.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '0.813rem', padding: '8px 14px', background: timeframe === 'monthly' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.monthly.advanceCollection?.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: '600', padding: '8px 14px', fontSize: '0.813rem', color: 'var(--text-secondary)' }}>• Postpaid Bill Collections (₹)</td>
                  <td style={{ textAlign: 'center', fontSize: '0.813rem', padding: '8px 14px', background: timeframe === 'daily' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.daily.postpaidCollection?.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '0.813rem', padding: '8px 14px', background: timeframe === 'weekly' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.weekly.postpaidCollection?.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '0.813rem', padding: '8px 14px', background: timeframe === 'monthly' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.monthly.postpaidCollection?.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: '600', padding: '10px 14px' }}>Operational Expenses (₹)</td>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: '#dc2626', padding: '10px 14px', background: timeframe === 'daily' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.daily.totalExpenses?.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: '#dc2626', padding: '10px 14px', background: timeframe === 'weekly' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.weekly.totalExpenses?.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: '#dc2626', padding: '10px 14px', background: timeframe === 'monthly' ? '#f0f9ff' : 'transparent' }}>
                    ₹{periods.monthly.totalExpenses?.toFixed(2)}
                  </td>
                </tr>
                <tr style={{ background: '#ecfdf5', fontWeight: '800' }}>
                  <td style={{ color: '#065f46', padding: '12px 14px' }}>Net Cashflow (Collections - Expenses)</td>
                  <td style={{ textAlign: 'center', color: '#047857', fontSize: '1rem', padding: '12px 14px' }}>
                    ₹{periods.daily.netCashflow?.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', color: '#047857', fontSize: '1rem', padding: '12px 14px' }}>
                    ₹{periods.weekly.netCashflow?.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center', color: '#047857', fontSize: '1rem', padding: '12px 14px' }}>
                    ₹{periods.monthly.netCashflow?.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
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
            <>
              <div className="table-container desktop-only">
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

              <div className="mobile-only mobile-card-list">
                {data.recentActivity.deliveries.map((del) => (
                  <div key={del.id} style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.875rem' }}>{del.customer_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{del.product_name_snapshot} ({del.variant_snapshot}) × {del.quantity}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '800', fontSize: '0.9rem', color: 'var(--primary-dark)' }}>₹{del.total_amount?.toFixed(2)}</div>
                      <span className={`badge ${del.status === 'DELIVERED' ? 'badge-success' : del.status === 'SKIPPED' ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: '0.68rem' }}>
                        {del.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
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
            <>
              <div className="table-container desktop-only">
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

              <div className="mobile-only mobile-card-list">
                {data.recentActivity.payments.map((p) => (
                  <div key={p.id} style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.875rem' }}>{p.customer_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.receipt_number} • {p.payment_method}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#16a34a' }}>₹{p.amount?.toFixed(2)}</div>
                      <span className="badge badge-gray" style={{ fontSize: '0.68rem' }}>
                        {p.payment_type === 'ADVANCE_PAYMENT' ? 'Advance' : 'Postpaid'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
