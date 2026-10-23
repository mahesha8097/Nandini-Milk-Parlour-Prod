import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import {
  Ticket,
  Plus,
  Search,
  Calendar,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  BookOpen,
  ArrowDownLeft,
  ArrowUpRight,
  User,
  Phone,
  Building2,
  DollarSign,
  History,
  Sliders,
  X,
  FileSpreadsheet
} from 'lucide-react';

export default function CouponsPage({ onNavigate, initialCustomerId = null }) {
  const [loading, setLoading] = useState(true);
  const [summaryData, setSummaryData] = useState({
    targetMonth: new Date().toISOString().slice(0, 7),
    totalCouponCustomers: 0,
    totalRemainingCoupons: 0,
    totalUsedThisMonth: 0,
    report: []
  });
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, ACTIVE, LOW, EXHAUSTED

  // Customer dropdown list for issuing books
  const [allCustomers, setAllCustomers] = useState([]);

  // Modals
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerHistory, setCustomerHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Form states
  const [issueForm, setIssueForm] = useState({
    customer_id: '',
    book_number: '',
    total_coupons: 30,
    price_paid: 750,
    payment_method: 'CASH',
    issue_date: new Date().toISOString().slice(0, 10),
    notes: ''
  });

  const [adjustForm, setAdjustForm] = useState({
    customer_id: '',
    change_amount: 1,
    reason: ''
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchSummary();
    fetchCustomers();
  }, [selectedMonth]);

  useEffect(() => {
    if (initialCustomerId && allCustomers.length > 0) {
      const target = allCustomers.find(c => c.id === parseInt(initialCustomerId, 10));
      if (target) {
        handleOpenIssueModal(target);
      }
    }
  }, [initialCustomerId, allCustomers]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/coupons/summary?month=${selectedMonth}`);
      setSummaryData(res || {});
    } catch (err) {
      console.error('Error fetching coupon summary:', err);
      setMessage({ type: 'error', text: 'Failed to load coupon summary report' });
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await api.get('/customers');
      setAllCustomers(res || []);
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  };

  const fetchCustomerHistory = async (customerId) => {
    try {
      setHistoryLoading(true);
      const res = await api.get(`/coupons/customers/${customerId}`);
      setCustomerHistory(res);
    } catch (err) {
      console.error('Error fetching customer history:', err);
      setMessage({ type: 'error', text: 'Failed to load customer coupon history' });
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenIssueModal = (cust = null) => {
    const custId = cust ? cust.id : (allCustomers[0]?.id || '');
    const defaultBookNo = `BK-${custId || '001'}-${new Date().toISOString().slice(5, 7)}${Math.floor(100 + Math.random() * 900)}`;
    setIssueForm({
      customer_id: custId,
      book_number: defaultBookNo,
      total_coupons: 30,
      price_paid: 750,
      payment_method: 'CASH',
      issue_date: new Date().toISOString().slice(0, 10),
      notes: cust ? `Coupon Book for ${cust.name}` : ''
    });
    setSelectedCustomer(cust);
    setShowIssueModal(true);
  };

  const handleOpenAdjustModal = (cust) => {
    setSelectedCustomer(cust);
    setAdjustForm({
      customer_id: cust.id || cust.customerId,
      change_amount: 1,
      reason: ''
    });
    setShowAdjustModal(true);
  };

  const handleOpenHistoryModal = (cust) => {
    const custId = cust.customerId || cust.id;
    setSelectedCustomer(cust);
    setShowHistoryModal(true);
    fetchCustomerHistory(custId);
  };

  const handleIssueSubmit = async (e) => {
    e.preventDefault();
    if (!issueForm.customer_id) {
      setMessage({ type: 'error', text: 'Please select a customer' });
      return;
    }
    if (!issueForm.total_coupons || parseInt(issueForm.total_coupons, 10) <= 0) {
      setMessage({ type: 'error', text: 'Total coupons must be greater than 0' });
      return;
    }

    try {
      setSaving(true);
      const res = await api.post('/coupons/issue', issueForm);
      setMessage({ type: 'success', text: res.message || 'Coupon book issued successfully!' });
      setShowIssueModal(false);
      fetchSummary();
      fetchCustomers();
    } catch (err) {
      console.error('Issue coupon book error:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to issue coupon book' });
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!adjustForm.customer_id) return;
    const diff = parseInt(adjustForm.change_amount, 10);
    if (isNaN(diff) || diff === 0) {
      setMessage({ type: 'error', text: 'Adjustment amount must be non-zero' });
      return;
    }

    try {
      setSaving(true);
      const res = await api.post('/coupons/adjust', adjustForm);
      setMessage({ type: 'success', text: res.message || 'Balance adjusted successfully!' });
      setShowAdjustModal(false);
      fetchSummary();
      fetchCustomers();
    } catch (err) {
      console.error('Adjust error:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to adjust balance' });
    } finally {
      setSaving(false);
    }
  };

  // Filter report rows
  const filteredReport = (summaryData.report || []).filter((item) => {
    const matchSearch =
      (item.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.customerPhone || '').includes(searchTerm) ||
      (item.zoneName || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && item.status === 'ACTIVE') ||
      (statusFilter === 'LOW' && item.status === 'LOW') ||
      (statusFilter === 'EXHAUSTED' && item.status === 'EXHAUSTED');

    return matchSearch && matchStatus;
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Alert message */}
      {message.text && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: message.type === 'error' ? '#fef2f2' : '#f0fdf4',
            color: message.type === 'error' ? '#991b1b' : '#166534',
            border: `1px solid ${message.type === 'error' ? '#fecaca' : '#bbf7d0'}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            <span style={{ fontSize: '14px', fontWeight: 500 }}>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage({ type: '', text: '' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <Ticket size={28} color="#d97706" />
            Coupon Management & Month-End Leftover Tracker
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px', marginBottom: 0 }}>
            Issue prepaid coupon books to customers, monitor actual delivery deductions, and see exact leftover balances.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={fetchSummary}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Refresh Report"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => handleOpenIssueModal()}
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#d97706',
              borderColor: '#d97706',
              color: '#fff',
              fontWeight: 600
            }}
          >
            <Plus size={18} />
            Issue New Coupon Book
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Coupon Customers</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
              <User size={20} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {summaryData.totalCouponCustomers}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Operating on prepaid coupon books
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Remaining Coupons Left Over</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
              <Ticket size={20} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#16a34a' }}>
            {summaryData.totalRemainingCoupons}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Active coupons in circulation across all customers
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Used In {selectedMonth}</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
              <ArrowDownLeft size={20} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#4f46e5' }}>
            {summaryData.totalUsedThisMonth}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Coupons redeemed for delivered milk packets
          </div>
        </div>
      </div>

      {/* Filter and Month Toolbar */}
      <div
        style={{
          background: 'var(--bg-surface)',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
          {/* Month Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} color="var(--text-muted)" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="form-control"
              style={{ width: '160px', padding: '8px 12px', fontSize: '14px', borderRadius: '8px' }}
            />
          </div>

          {/* Search Bar */}
          <div style={{ position: 'relative', minWidth: '240px', flex: 1, maxWidth: '380px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search customer name, phone, zone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control"
              style={{ paddingLeft: '36px', paddingRight: '12px', width: '100%', borderRadius: '8px' }}
            />
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {['ALL', 'ACTIVE', 'LOW', 'EXHAUSTED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: statusFilter === st ? 'none' : '1px solid var(--border-color)',
                  background:
                    statusFilter === st
                      ? (st === 'ACTIVE' ? '#16a34a' : st === 'LOW' ? '#d97706' : st === 'EXHAUSTED' ? '#dc2626' : 'var(--primary)')
                      : 'transparent',
                  color: statusFilter === st ? '#fff' : 'var(--text-secondary)'
                }}
              >
                {st === 'ALL' ? 'All Customers' : st === 'LOW' ? 'Low (≤5)' : st}
              </button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Showing <strong>{filteredReport.length}</strong> customer{filteredReport.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Customer Coupon Report Table */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '12px 16px' }}>Customer</th>
                <th style={{ padding: '12px 16px' }}>Zone</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Coupon Books</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Total Issued</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Used ({selectedMonth})</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Leftover Remaining</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                    Loading coupon tracker...
                  </td>
                </tr>
              ) : filteredReport.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Ticket size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontWeight: 500 }}>No coupon customers match the current filter</p>
                    <button
                      onClick={() => handleOpenIssueModal()}
                      className="btn btn-primary"
                      style={{ marginTop: '12px', background: '#d97706', borderColor: '#d97706', fontSize: '13px' }}
                    >
                      <Plus size={14} style={{ marginRight: '4px' }} />
                      Issue First Coupon Book
                    </button>
                  </td>
                </tr>
              ) : (
                filteredReport.map((row) => (
                  <tr
                    key={row.customerId}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.customerName}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <Phone size={12} />
                        {row.customerPhone}
                        {row.flatNo && <span>• Flat {row.flatNo}</span>}
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                        <Building2 size={13} color="var(--text-muted)" />
                        <span>{row.zoneName}</span>
                      </div>
                      {row.routeName && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {row.routeName}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 600 }}>
                      <span style={{ padding: '2px 8px', borderRadius: '10px', background: '#f1f5f9', fontSize: '13px' }}>
                        {row.totalBooks} book{row.totalBooks !== 1 ? 's' : ''}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {row.totalCouponsIssued}
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'center', color: '#4f46e5', fontWeight: 600 }}>
                      {row.usedThisMonth}
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 12px',
                          borderRadius: '16px',
                          fontWeight: 700,
                          fontSize: '15px',
                          background:
                            row.remainingCoupons === 0
                              ? '#fee2e2'
                              : row.remainingCoupons <= 5
                              ? '#fef3c7'
                              : '#dcfce7',
                          color:
                            row.remainingCoupons === 0
                              ? '#991b1b'
                              : row.remainingCoupons <= 5
                              ? '#92400e'
                              : '#166534'
                        }}
                      >
                        <Ticket size={14} />
                        <span>{row.remainingCoupons}</span>
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      {row.remainingCoupons === 0 ? (
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#fee2e2', color: '#991b1b' }}>
                          Exhausted
                        </span>
                      ) : row.remainingCoupons <= 5 ? (
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#fef3c7', color: '#92400e' }}>
                          Low Balance
                        </span>
                      ) : (
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#dcfce7', color: '#166534' }}>
                          Active
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          onClick={() => handleOpenIssueModal({ id: row.customerId, name: row.customerName })}
                          className="btn btn-outline"
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            borderColor: '#d97706',
                            color: '#d97706',
                            background: '#fffbeb'
                          }}
                          title="Add / Top-up Coupon Book"
                        >
                          <Plus size={13} />
                          Add Book
                        </button>

                        <button
                          onClick={() => handleOpenHistoryModal(row)}
                          className="btn btn-outline"
                          style={{
                            padding: '4px 10px',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="View Usage History"
                        >
                          <History size={13} />
                          History
                        </button>

                        <button
                          onClick={() => handleOpenAdjustModal(row)}
                          className="btn btn-outline"
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            color: 'var(--text-muted)'
                          }}
                          title="Manual Adjustment"
                        >
                          <Sliders size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: Issue New Coupon Book */}
      {/* ========================================================================= */}
      {showIssueModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setShowIssueModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              width: '100%',
              maxWidth: '520px',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fffbeb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
                  <Ticket size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#92400e' }}>
                    Issue Coupon Book
                  </h3>
                  <div style={{ fontSize: '12px', color: '#b45309' }}>
                    Add new coupons to customer balance and record advance payment
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowIssueModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleIssueSubmit} style={{ padding: '24px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Customer Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Select Customer *
                  </label>
                  <select
                    className="form-control"
                    value={issueForm.customer_id}
                    onChange={(e) => {
                      const id = e.target.value;
                      const c = allCustomers.find(item => item.id === parseInt(id, 10));
                      setIssueForm({
                        ...issueForm,
                        customer_id: id,
                        book_number: `BK-${id || '001'}-${new Date().toISOString().slice(5, 7)}${Math.floor(100 + Math.random() * 900)}`
                      });
                      setSelectedCustomer(c || null);
                    }}
                    required
                    style={{ width: '100%', borderRadius: '8px', padding: '10px' }}
                  >
                    <option value="">-- Choose Customer --</option>
                    {allCustomers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone}) - {c.zone_name || 'No Zone'} {c.billing_type === 'COUPON' ? '★ COUPON' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Book Number & Total Coupons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Book Number *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={issueForm.book_number}
                      onChange={(e) => setIssueForm({ ...issueForm, book_number: e.target.value })}
                      placeholder="e.g. BK-2026-001"
                      required
                      style={{ width: '100%', borderRadius: '8px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Total Coupons in Book *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      className="form-control"
                      value={issueForm.total_coupons}
                      onChange={(e) => setIssueForm({ ...issueForm, total_coupons: parseInt(e.target.value, 10) || '' })}
                      required
                      style={{ width: '100%', borderRadius: '8px' }}
                    />
                  </div>
                </div>

                {/* Quick Coupon Buttons */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Quick Presets:</span>
                  {[30, 50, 60, 100].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setIssueForm({ ...issueForm, total_coupons: preset, price_paid: preset * 25 })}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        background: issueForm.total_coupons === preset ? '#d97706' : '#f1f5f9',
                        color: issueForm.total_coupons === preset ? '#fff' : 'var(--text-secondary)',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {preset} coupons
                    </button>
                  ))}
                </div>

                {/* Advance Price Paid & Payment Mode */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Advance Amount Paid (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-control"
                      value={issueForm.price_paid}
                      onChange={(e) => setIssueForm({ ...issueForm, price_paid: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', borderRadius: '8px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Payment Method
                    </label>
                    <select
                      className="form-control"
                      value={issueForm.payment_method}
                      onChange={(e) => setIssueForm({ ...issueForm, payment_method: e.target.value })}
                      style={{ width: '100%', borderRadius: '8px' }}
                    >
                      <option value="CASH">CASH</option>
                      <option value="UPI">UPI / GooglePay / PhonePe</option>
                      <option value="BANK_TRANSFER">Bank Transfer (NEFT/IMPS)</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>
                </div>

                {/* Issue Date & Notes */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Issue Date
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={issueForm.issue_date}
                      onChange={(e) => setIssueForm({ ...issueForm, issue_date: e.target.value })}
                      style={{ width: '100%', borderRadius: '8px' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Notes / Remarks
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Optional notes..."
                      value={issueForm.notes}
                      onChange={(e) => setIssueForm({ ...issueForm, notes: e.target.value })}
                      style={{ width: '100%', borderRadius: '8px' }}
                    />
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)', border: '1px solid #e2e8f0' }}>
                  💡 <strong>Automatic Sync:</strong> Adding this book will immediately add <strong>+{issueForm.total_coupons || 0} coupons</strong> to the customer's balance and record an advance receipt for <strong>₹{issueForm.price_paid || 0}</strong>.
                </div>
              </div>

              <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowIssueModal(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ background: '#d97706', borderColor: '#d97706' }}
                >
                  {saving ? 'Issuing...' : 'Confirm & Issue Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: Customer Coupon History & Breakdown */}
      {/* ========================================================================= */}
      {showHistoryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setShowHistoryModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              width: '100%',
              maxWidth: '720px',
              maxHeight: '85vh',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Coupon Books & Usage History: {selectedCustomer?.customerName || selectedCustomer?.name}
                </h3>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Live Balance: <strong style={{ color: '#16a34a', fontSize: '15px' }}>{customerHistory?.summary?.remainingCoupons || 0} coupons</strong>
                </div>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {historyLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                  Loading history...
                </div>
              ) : !customerHistory ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No history available.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Summary row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Books Issued</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{customerHistory.summary?.totalBooks || 0}</div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Issued</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{customerHistory.summary?.totalCouponsIssued || 0}</div>
                    </div>
                    <div style={{ background: '#dcfce7', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#166534', fontWeight: 600, textTransform: 'uppercase' }}>Remaining Left Over</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: '#16a34a' }}>{customerHistory.summary?.remainingCoupons || 0}</div>
                    </div>
                  </div>

                  {/* Issued Books Table */}
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                      Issued Coupon Books
                    </h4>
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Book #</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center' }}>Issue Date</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center' }}>Total</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center' }}>Used</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center' }}>Left</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Price Paid</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(customerHistory.books || []).map((b) => (
                            <tr key={b.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600 }}>{b.book_number}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>{b.issue_date}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>{b.total_coupons}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', color: '#4f46e5' }}>{b.used_coupons}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#16a34a' }}>{b.remaining_coupons}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹{b.price_paid || 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Transaction History Log */}
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                      Recent Usage & Deductions (Last 50 entries)
                    </h4>
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', maxHeight: '250px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Date</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Type</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Description</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center' }}>Change</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(customerHistory.transactions || []).map((tx) => (
                            <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{tx.transaction_date}</td>
                              <td style={{ padding: '8px 12px' }}>
                                <span
                                  style={{
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    background:
                                      tx.transaction_type === 'BOOK_PURCHASE'
                                        ? '#dcfce7'
                                        : tx.transaction_type === 'DELIVERY_USAGE'
                                        ? '#fee2e2'
                                        : '#e0e7ff',
                                    color:
                                      tx.transaction_type === 'BOOK_PURCHASE'
                                        ? '#166534'
                                        : tx.transaction_type === 'DELIVERY_USAGE'
                                        ? '#991b1b'
                                        : '#3730a3'
                                  }}
                                >
                                  {tx.transaction_type}
                                </span>
                              </td>
                              <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{tx.notes}</td>
                              <td
                                style={{
                                  padding: '8px 12px',
                                  textAlign: 'center',
                                  fontWeight: 700,
                                  color: tx.change_amount > 0 ? '#16a34a' : '#dc2626'
                                }}
                              >
                                {tx.change_amount > 0 ? `+${tx.change_amount}` : tx.change_amount}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{tx.balance_after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowHistoryModal(false)} className="btn btn-outline">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: Manual Adjustment */}
      {/* ========================================================================= */}
      {showAdjustModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setShowAdjustModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              width: '100%',
              maxWidth: '440px',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                Manual Coupon Adjustment
              </h3>
              <button onClick={() => setShowAdjustModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Customer
                  </label>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {selectedCustomer?.customerName || selectedCustomer?.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Current Remaining Balance: <strong>{selectedCustomer?.remainingCoupons || selectedCustomer?.coupon_balance || 0} coupons</strong>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Adjustment Amount (+ to add, - to subtract) *
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    value={adjustForm.change_amount}
                    onChange={(e) => setAdjustForm({ ...adjustForm, change_amount: parseInt(e.target.value, 10) || 0 })}
                    required
                    style={{ width: '100%', borderRadius: '8px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Reason for Adjustment *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Lost coupon replacement, physical count correction"
                    value={adjustForm.reason}
                    onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                    required
                    style={{ width: '100%', borderRadius: '8px' }}
                  />
                </div>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowAdjustModal(false)} className="btn btn-outline">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? 'Saving...' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
