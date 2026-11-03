import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import CustomerSearchSelect from '../../components/common/CustomerSearchSelect';
import CustomerProfileModal from './CustomerProfileModal';
import {
  CreditCard,
  PlusCircle,
  Calendar,
  Filter,
  RefreshCw,
  Search,
  CheckCircle2,
  Wallet,
  Edit2,
  Trash2,
  X,
  RotateCcw,
  Clock,
  AlertCircle,
  Home,
  Building2,
  Phone,
  Eye,
  Receipt,
  ExternalLink,
  MessageCircle,
  ArrowUpDown
} from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';

export default function PaymentsPage({ initialOpenAdd = false }) {
  // Primary Tab state: 'pending' (Pending Customers with Dues) vs 'history' (Payment History Receipts)
  const [activeTab, setActiveTab] = useState('pending');

  // Payment Collections History state
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pending Customers state
  const [pendingCustomers, setPendingCustomers] = useState([]);
  const [pendingSummary, setPendingSummary] = useState({
    total_pending_amount: 0,
    total_customers_count: 0,
    house_count: 0,
    house_pending_amount: 0,
    bulk_count: 0,
    bulk_pending_amount: 0,
    weekly_count: 0,
    weekly_pending_amount: 0,
    prepaid_count: 0,
    prepaid_pending_amount: 0,
    postpaid_count: 0,
    postpaid_pending_amount: 0,
    routes: []
  });
  const [loadingPending, setLoadingPending] = useState(true);
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingRouteFilter, setPendingRouteFilter] = useState('ALL');
  const [pendingCategoryFilter, setPendingCategoryFilter] = useState('ALL');
  const [pendingBillingTypeFilter, setPendingBillingTypeFilter] = useState('ALL');
  const [pendingSortBy, setPendingSortBy] = useState('DUE_DESC');

  // Customer Profile inspection modal
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);

  // Search & Filter state for Payment History
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('ALL');

  // Add Payment Modal
  const [isModalOpen, setIsModalOpen] = useState(initialOpenAdd);
  const [formData, setFormData] = useState({
    customer_id: '',
    bill_id: null,
    payment_type: 'ADVANCE_PAYMENT',
    amount: '',
    payment_date: getLocalDateString(),
    payment_method: 'UPI',
    reference_number: '',
    notes: ''
  });
  const [selectedCustomerDues, setSelectedCustomerDues] = useState(null);
  const [loadingDues, setLoadingDues] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit / Correct Payment Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    id: null,
    receipt_number: '',
    customer_name: '',
    customer_id: '',
    payment_type: 'ADVANCE_PAYMENT',
    amount: '',
    payment_date: getLocalDateString(),
    payment_method: 'UPI',
    reference_number: '',
    notes: ''
  });
  const [editFormError, setEditFormError] = useState('');
  const [editing, setEditing] = useState(false);

  // Undo toast state
  const [undoToast, setUndoToast] = useState(null); // { paymentId, receiptNumber, customerName, amount, timer, countdown }
  const undoTimerRef = useRef(null);
  const undoCountdownRef = useRef(null);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/payments');
      setPayments(res || []);
    } catch (err) {
      setError(err.message || 'Unable to load payments.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await api.get('/customers');
      setCustomers(res || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPendingCustomers = async () => {
    try {
      setLoadingPending(true);
      const res = await api.get('/payments/pending-customers');
      if (res && res.customers) {
        setPendingCustomers(res.customers || []);
        if (res.summary) setPendingSummary(res.summary);
      } else if (Array.isArray(res)) {
        setPendingCustomers(res);
      }
    } catch (err) {
      console.warn('Failed to fetch pending customers:', err);
    } finally {
      setLoadingPending(false);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchCustomers();
    fetchPendingCustomers();
  }, []);

  const handleCustomerChange = async (id, overrideAmount = null) => {
    setFormData((prev) => ({ ...prev, customer_id: id, bill_id: null }));
    if (!id) {
      setSelectedCustomerDues(null);
      return;
    }

    try {
      setLoadingDues(true);
      const res = await api.get(`/customers/${id}/dues`);
      setSelectedCustomerDues(res);

      // Intelligently default payment type and amount
      if (res && res.pending_balance > 0) {
        setFormData((prev) => ({
          ...prev,
          payment_type: 'POSTPAID_BILL_PAYMENT',
          amount: overrideAmount !== null ? String(overrideAmount) : (prev.amount || String(res.pending_balance))
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          payment_type: 'ADVANCE_PAYMENT',
          amount: overrideAmount !== null ? String(overrideAmount) : prev.amount
        }));
      }
    } catch (err) {
      console.warn('Failed to load customer dues:', err);
    } finally {
      setLoadingDues(false);
    }
  };

  const handleOpenAdd = () => {
    setFormData({
      customer_id: '',
      bill_id: null,
      payment_type: 'ADVANCE_PAYMENT',
      amount: '',
      payment_date: getLocalDateString(),
      payment_method: 'UPI',
      reference_number: '',
      notes: ''
    });
    setSelectedCustomerDues(null);
    setLoadingDues(false);
    setFormError('');
    setIsModalOpen(true);
  };

  // Direct action from Pending Customers section: pre-fills the exact customer, amount, and loads bills
  const handleRecordPaymentForPendingCustomer = async (cust) => {
    setFormError('');
    const dueAmount = Number(cust.pending_balance || 0);
    const firstBill = cust.unpaid_bills && cust.unpaid_bills.length === 1 ? cust.unpaid_bills[0] : null;

    setFormData({
      customer_id: cust.id,
      bill_id: firstBill ? firstBill.id : null,
      payment_type: (cust.billing_type === 'PREPAID' || cust.billing_type === 'COUPON') ? 'ADVANCE_PAYMENT' : 'POSTPAID_BILL_PAYMENT',
      amount: String(dueAmount > 0 ? dueAmount : ''),
      payment_date: getLocalDateString(),
      payment_method: 'UPI',
      reference_number: '',
      notes: firstBill ? `Settling Bill ${firstBill.bill_number}` : ''
    });
    setIsModalOpen(true);
    await handleCustomerChange(cust.id, dueAmount > 0 ? dueAmount : null);
  };

  const handleOpenEdit = (payment) => {
    setEditFormData({
      id: payment.id,
      receipt_number: payment.receipt_number,
      customer_name: payment.customer_name,
      customer_id: payment.customer_id,
      payment_type: payment.payment_type,
      amount: payment.amount,
      payment_date: payment.payment_date,
      payment_method: payment.payment_method,
      reference_number: payment.reference_number || '',
      notes: payment.notes || ''
    });
    setEditFormError('');
    setIsEditModalOpen(true);
  };

  const handleRefresh = async () => {
    await Promise.all([fetchPayments(), fetchCustomers(), fetchPendingCustomers()]);
  };

  const handleSavePayment = async (e) => {
    e.preventDefault();
    if (!formData.customer_id || !formData.amount || !formData.payment_date) {
      setFormError('Please fill in all required fields.');
      return;
    }

    const amt = parseFloat(formData.amount);
    if (isNaN(amt) || amt <= 0) {
      setFormError('Please enter a valid payment amount.');
      return;
    }

    try {
      setSaving(true);
      setFormError('');
      await api.post('/payments', {
        ...formData,
        bill_id: formData.bill_id || null
      });
      setIsModalOpen(false);
      setSelectedCustomerDues(null);
      await Promise.all([fetchPayments(), fetchCustomers(), fetchPendingCustomers()]);
    } catch (err) {
      setFormError(err.message || 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePayment = async (e) => {
    e.preventDefault();
    if (!editFormData.amount || !editFormData.payment_date) {
      setEditFormError('Please fill in amount and payment date.');
      return;
    }

    const amt = parseFloat(editFormData.amount);
    if (isNaN(amt) || amt <= 0) {
      setEditFormError('Please enter a valid positive payment amount.');
      return;
    }

    try {
      setEditing(true);
      setEditFormError('');
      await api.put(`/payments/${editFormData.id}`, {
        amount: amt,
        payment_date: editFormData.payment_date,
        payment_method: editFormData.payment_method,
        reference_number: editFormData.reference_number,
        notes: editFormData.notes
      });
      setIsEditModalOpen(false);
      await Promise.all([fetchPayments(), fetchCustomers(), fetchPendingCustomers()]);
    } catch (err) {
      setEditFormError(err.message || 'Failed to update payment.');
    } finally {
      setEditing(false);
    }
  };

  const handleDeletePayment = async (p) => {
    try {
      setLoading(true);
      const result = await api.delete(`/payments/${p.id}`);
      setPayments(prev => prev.filter(x => x.id !== p.id));

      const UNDO_SECONDS = 10;
      setUndoToast({
        paymentId: result.paymentId || p.id,
        receiptNumber: p.receipt_number,
        customerName: p.customer_name,
        amount: p.amount,
        countdown: UNDO_SECONDS
      });

      undoCountdownRef.current = setInterval(() => {
        setUndoToast(prev => {
          if (!prev) return null;
          if (prev.countdown <= 1) {
            clearInterval(undoCountdownRef.current);
            return null;
          }
          return { ...prev, countdown: prev.countdown - 1 };
        });
      }, 1000);

      undoTimerRef.current = setTimeout(async () => {
        try {
          await api.delete(`/payments/${result.paymentId || p.id}/permanent`);
          await fetchPendingCustomers();
        } catch (e) {
          console.error('Permanent delete failed:', e);
        }
      }, UNDO_SECONDS * 1000);

      // Refresh pending dues to show restored balance immediately
      await fetchPendingCustomers();
    } catch (err) {
      alert(err.message || 'Failed to delete payment');
    } finally {
      setLoading(false);
    }
  };

  const handleUndoDelete = async () => {
    if (!undoToast) return;
    clearTimeout(undoTimerRef.current);
    clearInterval(undoCountdownRef.current);
    const toastCopy = { ...undoToast };
    setUndoToast(null);
    try {
      await api.post(`/payments/${toastCopy.paymentId}/restore`);
      await Promise.all([fetchPayments(), fetchPendingCustomers()]);
    } catch (err) {
      alert('Failed to restore payment: ' + (err.message || ''));
    }
  };

  useEffect(() => {
    return () => {
      clearTimeout(undoTimerRef.current);
      clearInterval(undoCountdownRef.current);
    };
  }, []);

  // Filtered & Sorted Pending Customers
  const filteredPendingCustomers = useMemo(() => {
    let list = [...pendingCustomers];

    // Search filter
    if (pendingSearch.trim()) {
      const q = pendingSearch.toLowerCase().trim();
      list = list.filter(c => {
        const name = (c.name || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        const flat = (c.flat_no || '').toLowerCase();
        const route = (c.route || '').toLowerCase();
        const zone = (c.zone_name || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || flat.includes(q) || route.includes(q) || zone.includes(q);
      });
    }

    // Route filter
    if (pendingRouteFilter !== 'ALL') {
      list = list.filter(c => c.route === pendingRouteFilter);
    }

    // Category filter
    if (pendingCategoryFilter !== 'ALL') {
      if (pendingCategoryFilter === 'HOUSE') {
        list = list.filter(c => c.customer_category === 'HOUSE');
      } else {
        list = list.filter(c => c.customer_category !== 'HOUSE');
      }
    }

    // Billing type filter
    if (pendingBillingTypeFilter !== 'ALL') {
      list = list.filter(c => c.billing_type === pendingBillingTypeFilter);
    }

    // Sorting
    list.sort((a, b) => {
      if (pendingSortBy === 'DUE_DESC') {
        return (Number(b.pending_balance) || 0) - (Number(a.pending_balance) || 0);
      }
      if (pendingSortBy === 'DUE_ASC') {
        return (Number(a.pending_balance) || 0) - (Number(b.pending_balance) || 0);
      }
      if (pendingSortBy === 'NAME_ASC') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (pendingSortBy === 'FLAT_ASC') {
        return (a.flat_no || '').localeCompare(b.flat_no || '');
      }
      return 0;
    });

    return list;
  }, [pendingCustomers, pendingSearch, pendingRouteFilter, pendingCategoryFilter, pendingBillingTypeFilter, pendingSortBy]);

  // Available routes for filter dropdown
  const availableRoutes = useMemo(() => {
    if (pendingSummary.routes && pendingSummary.routes.length > 0) {
      return pendingSummary.routes;
    }
    const set = new Set();
    pendingCustomers.forEach(c => {
      if (c.route && c.route.trim()) set.add(c.route.trim());
    });
    return Array.from(set).sort();
  }, [pendingCustomers, pendingSummary.routes]);

  // Filtered total dues in Pending view
  const pendingFilteredTotal = useMemo(() => {
    return filteredPendingCustomers.reduce((sum, c) => sum + (Number(c.pending_balance) || 0), 0);
  }, [filteredPendingCustomers]);

  // Filtered Payments History
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      if (paymentTypeFilter !== 'ALL') {
        if (paymentTypeFilter === 'DAILY_PAYMENT') {
          if (p.payment_type !== 'DAILY_PAYMENT' && p.payment_type !== 'DIRECT_PAYMENT') return false;
        } else if (p.payment_type !== paymentTypeFilter) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const receipt = (p.receipt_number || '').toLowerCase();
        const name = (p.customer_name || '').toLowerCase();
        const phone = (p.customer_phone || '').toLowerCase();
        const method = (p.payment_method || '').toLowerCase();
        const ref = (p.reference_number || '').toLowerCase();
        const amount = String(p.amount || '');
        if (!receipt.includes(q) && !name.includes(q) && !phone.includes(q) && !method.includes(q) && !ref.includes(q) && !amount.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [payments, searchQuery, paymentTypeFilter]);

  return (
    <div className="page-wrapper">
      {/* Undo Toast */}
      {undoToast && (
        <div style={{
          position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: '#f1f5f9', borderRadius: '14px',
          padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.35)', zIndex: 9999,
          minWidth: '340px', maxWidth: '520px', animation: 'slideUp 0.3s ease'
        }}>
          <Trash2 size={18} color="#f87171" />
          <div style={{ flex: 1, fontSize: '0.875rem' }}>
            <span style={{ fontWeight: '700' }}>{undoToast.receiptNumber}</span>
            {' '}deleted — <span style={{ color: '#94a3b8' }}>₹{Number(undoToast.amount).toFixed(2)} ({undoToast.customerName})</span>
          </div>
          <button
            onClick={handleUndoDelete}
            style={{
              background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px',
              padding: '7px 16px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap'
            }}
          >
            <RotateCcw size={14} /> Undo ({undoToast.countdown}s)
          </button>
          <button
            onClick={() => {
              clearTimeout(undoTimerRef.current);
              clearInterval(undoCountdownRef.current);
              api.delete(`/payments/${undoToast.paymentId}/permanent`).catch(() => {});
              setUndoToast(null);
            }}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <CreditCard size={28} color="var(--primary)" />
            Payment Collections & Dues
          </h1>
          <p className="page-subtitle">Track pending customer dues, record collections, and view receipt history</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleRefresh} className="btn btn-outline btn-sm">
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={handleOpenAdd} className="btn btn-primary btn-sm">
            <PlusCircle size={16} /> Record Payment
          </button>
        </div>
      </div>

      {/* Primary Section Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '2px solid #e2e8f0',
        marginBottom: '20px',
        paddingBottom: '2px'
      }}>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'pending' ? '3px solid #dc2626' : '3px solid transparent',
            color: activeTab === 'pending' ? '#dc2626' : 'var(--text-secondary)',
            fontWeight: activeTab === 'pending' ? '800' : '600',
            fontSize: '0.92rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <Clock size={18} />
          <span>Pending Customers</span>
          <span style={{
            background: activeTab === 'pending' ? '#fee2e2' : '#f1f5f9',
            color: activeTab === 'pending' ? '#dc2626' : 'var(--text-muted)',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '0.74rem',
            fontWeight: '800'
          }}>
            {pendingCustomers.length}
          </span>
          {pendingSummary.total_pending_amount > 0 && (
            <span style={{
              background: '#fef2f2',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '0.74rem',
              fontWeight: '800'
            }}>
              ₹{Number(pendingSummary.total_pending_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'history' ? '3px solid var(--primary)' : '3px solid transparent',
            color: activeTab === 'history' ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'history' ? '800' : '600',
            fontSize: '0.92rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <CheckCircle2 size={18} />
          <span>Payment History</span>
          <span style={{
            background: activeTab === 'history' ? '#e0e7ff' : '#f1f5f9',
            color: activeTab === 'history' ? 'var(--primary)' : 'var(--text-muted)',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '0.74rem',
            fontWeight: '800'
          }}>
            {payments.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PENDING CUSTOMERS SECTION */}
      {/* ========================================================================= */}
      {activeTab === 'pending' && (
        <>
          {/* KPI Metrics Banner */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: '12px',
            marginBottom: '20px'
          }}>
            {/* Total Pending Dues */}
            <div className="card" style={{
              padding: '16px',
              background: 'linear-gradient(135deg, #fff5f5 0%, #fee2e2 100%)',
              border: '1px solid #fecaca',
              borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Total Pending Dues
                </span>
                <AlertCircle size={20} color="#dc2626" />
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#dc2626', marginTop: '6px' }}>
                ₹{Number(pendingSummary.total_pending_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#b91c1c', marginTop: '4px', fontWeight: '600' }}>
                Across {pendingSummary.total_customers_count || 0} customers with dues
              </div>
            </div>

            {/* House Customers Dues */}
            <div className="card" style={{
              padding: '16px',
              background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
              border: '1px solid #bae6fd',
              borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  House Customers
                </span>
                <Home size={20} color="#0284c7" />
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#0369a1', marginTop: '6px' }}>
                ₹{Number(pendingSummary.house_pending_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#0284c7', marginTop: '4px', fontWeight: '600' }}>
                {pendingSummary.house_count || 0} Apartment accounts
              </div>
            </div>

            {/* Bulk / Commercial Dues */}
            <div className="card" style={{
              padding: '16px',
              background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
              border: '1px solid #e9d5ff',
              borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#6b21a8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Bulk & Commercial
                </span>
                <Building2 size={20} color="#9333ea" />
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#6b21a8', marginTop: '6px' }}>
                ₹{Number(pendingSummary.bulk_pending_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#9333ea', marginTop: '4px', fontWeight: '600' }}>
                {pendingSummary.bulk_count || 0} Hotels & Shops accounts
              </div>
            </div>

            {/* Weekly Accounts Dues */}
            <div className="card" style={{
              padding: '16px',
              background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
              border: '1px solid #bbf7d0',
              borderRadius: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Weekly Billing Dues
                </span>
                <Wallet size={20} color="#16a34a" />
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#166534', marginTop: '6px' }}>
                ₹{Number(pendingSummary.weekly_pending_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#16a34a', marginTop: '4px', fontWeight: '600' }}>
                {pendingSummary.weekly_count || 0} Weekly cycle accounts
              </div>
            </div>
          </div>

          {/* Search, Filter & Sort Toolbar */}
          <div className="card" style={{ marginBottom: '18px', padding: '14px 18px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Search input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 260px', maxWidth: '380px' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Search pending customer, phone, flat #..."
                    value={pendingSearch}
                    onChange={(e) => setPendingSearch(e.target.value)}
                    style={{ paddingLeft: '32px', paddingRight: pendingSearch ? '30px' : '10px', paddingBlock: '6px', fontSize: '0.84rem' }}
                  />
                  {pendingSearch && (
                    <button
                      type="button"
                      onClick={() => setPendingSearch('')}
                      style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Filters & Sorter */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Route filter */}
                <select
                  className="form-select"
                  style={{ width: 'auto', fontSize: '0.813rem' }}
                  value={pendingRouteFilter}
                  onChange={(e) => setPendingRouteFilter(e.target.value)}
                >
                  <option value="ALL">All Routes</option>
                  {availableRoutes.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

                {/* Category filter */}
                <select
                  className="form-select"
                  style={{ width: 'auto', fontSize: '0.813rem' }}
                  value={pendingCategoryFilter}
                  onChange={(e) => setPendingCategoryFilter(e.target.value)}
                >
                  <option value="ALL">All Categories</option>
                  <option value="HOUSE">House (Apartments)</option>
                  <option value="BULK">Bulk / Commercial</option>
                </select>

                {/* Billing Type filter */}
                <select
                  className="form-select"
                  style={{ width: 'auto', fontSize: '0.813rem' }}
                  value={pendingBillingTypeFilter}
                  onChange={(e) => setPendingBillingTypeFilter(e.target.value)}
                >
                  <option value="ALL">All Billing Plans</option>
                  <option value="PREPAID">Prepaid (Advance)</option>
                  <option value="POSTPAID">Postpaid</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="COUPON">Coupon Customers</option>
                  <option value="DAILY">Daily Spot</option>
                </select>

                {/* Sort By */}
                <select
                  className="form-select"
                  style={{ width: 'auto', fontSize: '0.813rem' }}
                  value={pendingSortBy}
                  onChange={(e) => setPendingSortBy(e.target.value)}
                  title="Sort Order"
                >
                  <option value="DUE_DESC">Highest Due First</option>
                  <option value="DUE_ASC">Lowest Due First</option>
                  <option value="NAME_ASC">Customer Name (A-Z)</option>
                  <option value="FLAT_ASC">Flat / Room #</option>
                </select>

                {(pendingSearch || pendingRouteFilter !== 'ALL' || pendingCategoryFilter !== 'ALL' || pendingBillingTypeFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setPendingSearch('');
                      setPendingRouteFilter('ALL');
                      setPendingCategoryFilter('ALL');
                      setPendingBillingTypeFilter('ALL');
                      setPendingSortBy('DUE_DESC');
                    }}
                    className="btn btn-outline btn-xs"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            </div>

            {/* Filter Result Counter */}
            <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              <span>
                Showing <strong>{filteredPendingCustomers.length}</strong> of <strong>{pendingCustomers.length}</strong> pending customers
              </span>
              <span>
                Filtered Total: <strong style={{ color: '#dc2626' }}>₹{pendingFilteredTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </span>
            </div>
          </div>

          {/* Pending Customers Content */}
          {loadingPending ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>Loading pending customer accounts...</div>
          ) : pendingCustomers.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="All Customers Paid Up! ✓"
              description="No outstanding customer dues at this time. All customer balances are clear."
            />
          ) : filteredPendingCustomers.length === 0 ? (
            <div className="card" style={{ padding: '36px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>
                No pending customers match your search filters.
              </p>
              <button
                onClick={() => {
                  setPendingSearch('');
                  setPendingRouteFilter('ALL');
                  setPendingCategoryFilter('ALL');
                  setPendingBillingTypeFilter('ALL');
                }}
                className="btn btn-outline btn-sm"
              >
                Clear Search Filter
              </button>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="table-container desktop-only">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Flat & Route</th>
                      <th>Billing Plan</th>
                      <th>Unpaid Invoices</th>
                      <th style={{ textAlign: 'right' }}>Pending Due</th>
                      <th style={{ textAlign: 'right' }}>Advance Bal</th>
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPendingCustomers.map((cust) => {
                      const cleanPhone = (cust.phone || '').replace(/\D/g, '');
                      return (
                        <tr key={cust.id}>
                          {/* Customer Name & Phone */}
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontWeight: '700', fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                                {cust.name}
                              </span>
                              <span className={`badge ${cust.customer_category === 'HOUSE' ? 'badge-info' : 'badge-indigo'}`} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                                {cust.customer_category === 'HOUSE' ? 'House' : 'Bulk'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                              <a
                                href={`tel:${cust.phone}`}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--text-secondary)', textDecoration: 'none' }}
                                title="Click to call"
                              >
                                <Phone size={12} /> {cust.phone}
                              </a>
                              {cleanPhone && (
                                <a
                                  href={`https://wa.me/91${cleanPhone.length === 10 ? cleanPhone : cleanPhone.slice(-10)}?text=${encodeURIComponent(`Dear ${cust.name}, your Nandini Milk pending balance is ₹${Number(cust.pending_balance).toFixed(2)}. Please settle via UPI or Cash.`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: '2px', textDecoration: 'none', fontWeight: '600' }}
                                  title="Send WhatsApp payment reminder"
                                >
                                  <MessageCircle size={12} /> WhatsApp
                                </a>
                              )}
                            </div>
                          </td>

                          {/* Flat, Zone & Route */}
                          <td>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                              {cust.flat_no || '—'}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                              {cust.zone_name || cust.address || '—'}
                            </div>
                            {cust.route && (
                              <span className="badge badge-gray" style={{ fontSize: '0.68rem', marginTop: '2px' }}>
                                {cust.route}
                              </span>
                            )}
                          </td>

                          {/* Billing Type */}
                          <td>
                            {cust.billing_type === 'PREPAID' ? (
                              <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>Prepaid (Advance)</span>
                            ) : cust.billing_type === 'WEEKLY' ? (
                              <span className="badge badge-indigo" style={{ fontSize: '0.72rem' }}>Weekly Billing</span>
                            ) : cust.billing_type === 'DAILY' ? (
                              <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>Daily Spot</span>
                            ) : cust.billing_type === 'COUPON' ? (
                              <span className="badge" style={{ fontSize: '0.72rem', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontWeight: '700' }}>Coupon Plan</span>
                            ) : (
                              <span className="badge badge-gray" style={{ fontSize: '0.72rem' }}>Postpaid</span>
                            )}
                          </td>

                          {/* Unpaid Invoices Context */}
                          <td>
                            {cust.unpaid_bills && cust.unpaid_bills.length > 0 ? (
                              <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#dc2626' }}>
                                  {cust.unpaid_bills.length} Unpaid {cust.unpaid_bills.length === 1 ? 'Bill' : 'Bills'}
                                </div>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                                  {cust.unpaid_bills.slice(0, 2).map(b => (
                                    <span
                                      key={b.id}
                                      style={{
                                        fontSize: '0.68rem',
                                        background: '#fef2f2',
                                        color: '#991b1b',
                                        border: '1px solid #fecaca',
                                        borderRadius: '4px',
                                        padding: '1px 5px'
                                      }}
                                      title={`Bill: ${b.bill_number} (${b.period || ''}) - Remaining: ₹${b.remaining_due}`}
                                    >
                                      {b.bill_number} (₹{b.remaining_due})
                                    </span>
                                  ))}
                                  {cust.unpaid_bills.length > 2 && (
                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                      +{cust.unpaid_bills.length - 2} more
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.74rem', color: '#b45309', fontStyle: 'italic' }}>
                                Delivered Milk Dues
                              </div>
                            )}
                          </td>

                          {/* Pending Balance */}
                          <td style={{ textAlign: 'right' }}>
                            <span style={{
                              fontWeight: '900',
                              fontSize: '1.05rem',
                              color: '#dc2626',
                              background: '#fef2f2',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              border: '1px solid #fee2e2'
                            }}>
                              ₹{Number(cust.pending_balance || 0).toFixed(2)}
                            </span>
                          </td>

                          {/* Advance Balance */}
                          <td style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.85rem', color: cust.advance_balance > 0 ? '#2563eb' : 'var(--text-muted)', fontWeight: cust.advance_balance > 0 ? '700' : '400' }}>
                              ₹{Number(cust.advance_balance || 0).toFixed(2)}
                            </span>
                          </td>

                          {/* Action Buttons */}
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button
                                onClick={() => handleRecordPaymentForPendingCustomer(cust)}
                                className="btn btn-primary btn-sm"
                                style={{
                                  padding: '5px 12px',
                                  fontSize: '0.78rem',
                                  fontWeight: '700',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  background: '#16a34a',
                                  borderColor: '#16a34a'
                                }}
                                title="Record payment for this customer"
                              >
                                <CreditCard size={14} /> Record Payment
                              </button>
                              <button
                                onClick={() => setSelectedCustomerId(cust.id)}
                                className="btn btn-outline btn-sm"
                                style={{ padding: '5px 8px', fontSize: '0.75rem' }}
                                title="View Customer Profile & Bills"
                              >
                                <Eye size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile-Only Pending Customer Cards */}
              <div className="mobile-only mobile-card-list">
                {filteredPendingCustomers.map((cust) => {
                  const cleanPhone = (cust.phone || '').replace(/\D/g, '');
                  return (
                    <div key={cust.id} className="mobile-data-card" style={{ borderLeft: '4px solid #dc2626' }}>
                      <div className="mobile-card-header">
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <h3 className="mobile-card-title" style={{ margin: 0, fontSize: '0.98rem' }}>{cust.name}</h3>
                            <span className={`badge ${cust.customer_category === 'HOUSE' ? 'badge-info' : 'badge-indigo'}`} style={{ fontSize: '0.68rem' }}>
                              {cust.customer_category === 'HOUSE' ? 'House' : 'Bulk'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            Flat: <strong>{cust.flat_no || '—'}</strong> • {cust.zone_name || cust.route || 'No Route'}
                          </div>
                        </div>

                        {/* Phone with WhatsApp Link */}
                        <div style={{ textAlign: 'right' }}>
                          <a href={`tel:${cust.phone}`} style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-primary)', textDecoration: 'none' }}>
                            {cust.phone}
                          </a>
                          {cleanPhone && (
                            <div>
                              <a
                                href={`https://wa.me/91${cleanPhone.length === 10 ? cleanPhone : cleanPhone.slice(-10)}?text=${encodeURIComponent(`Dear ${cust.name}, your Nandini Milk pending balance is ₹${Number(cust.pending_balance).toFixed(2)}. Please settle via UPI or Cash.`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: '0.72rem', color: '#16a34a', textDecoration: 'none', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                              >
                                <MessageCircle size={12} /> WhatsApp
                              </a>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mobile-card-row">
                        <span className="mobile-card-row-label">Plan & Unpaid Bills</span>
                        <div style={{ textAlign: 'right' }}>
                          {cust.billing_type === 'PREPAID' ? (
                            <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Prepaid</span>
                          ) : cust.billing_type === 'WEEKLY' ? (
                            <span className="badge badge-indigo" style={{ fontSize: '0.7rem' }}>Weekly</span>
                          ) : cust.billing_type === 'DAILY' ? (
                            <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>Daily</span>
                          ) : cust.billing_type === 'COUPON' ? (
                            <span className="badge" style={{ fontSize: '0.7rem', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>Coupon</span>
                          ) : (
                            <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>Postpaid</span>
                          )}
                          {cust.unpaid_bills && cust.unpaid_bills.length > 0 ? (
                            <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: '700', marginTop: '2px' }}>
                              {cust.unpaid_bills.length} Unpaid {cust.unpaid_bills.length === 1 ? 'Bill' : 'Bills'}
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.72rem', color: '#b45309', marginTop: '2px' }}>Delivered Milk Dues</div>
                          )}
                        </div>
                      </div>

                      {/* Prominent Pending Amount Box */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: '#fef2f2',
                        borderRadius: '10px',
                        border: '1px solid #fecaca',
                        marginTop: '4px'
                      }}>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: '#991b1b', fontWeight: '800', textTransform: 'uppercase' }}>
                            Pending Amount
                          </div>
                          <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#dc2626' }}>
                            ₹{Number(cust.pending_balance || 0).toFixed(2)}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleRecordPaymentForPendingCustomer(cust)}
                            className="btn btn-primary btn-sm"
                            style={{
                              background: '#16a34a',
                              borderColor: '#16a34a',
                              fontWeight: '700',
                              fontSize: '0.8rem',
                              padding: '6px 14px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            <CreditCard size={15} /> Pay
                          </button>
                          <button
                            onClick={() => setSelectedCustomerId(cust.id)}
                            className="btn btn-outline btn-sm"
                            style={{ padding: '6px 10px' }}
                            title="Profile"
                          >
                            <Eye size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PAYMENT HISTORY & COLLECTIONS SECTION */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <>
          {/* Search & Filter Bar */}
          <div className="card" style={{ marginBottom: '18px', padding: '14px 18px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 260px', maxWidth: '380px' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Search receipt #, customer, phone, ref..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ paddingLeft: '32px', paddingRight: searchQuery ? '30px' : '10px', paddingBlock: '6px', fontSize: '0.84rem' }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                      title="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  className="form-select"
                  style={{ width: 'auto', fontSize: '0.813rem' }}
                  value={paymentTypeFilter}
                  onChange={(e) => setPaymentTypeFilter(e.target.value)}
                >
                  <option value="ALL">All Payment Types</option>
                  <option value="ADVANCE_PAYMENT">Advance Payment</option>
                  <option value="BILL_PAYMENT">Bill Payment (Postpaid)</option>
                  <option value="DAILY_PAYMENT">Daily Spot Payment (Delivery)</option>
                </select>

                {(searchQuery || paymentTypeFilter !== 'ALL') && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                    Showing {filteredPayments.length} of {payments.length}
                  </span>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>Loading payment records...</div>
          ) : error ? (
            <div className="card" style={{ color: 'var(--accent-red)', padding: '24px', textAlign: 'center' }}>{error}</div>
          ) : payments.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No payments recorded yet"
              description="Click Record Payment to log customer cash or UPI payments."
              action={
                <button onClick={handleOpenAdd} className="btn btn-primary btn-sm">
                  <PlusCircle size={16} /> Record First Payment
                </button>
              }
            />
          ) : filteredPayments.length === 0 ? (
            <div className="card" style={{ padding: '36px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>
                No payment receipts match your search "<strong>{searchQuery}</strong>".
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setPaymentTypeFilter('ALL');
                }}
                className="btn btn-outline btn-sm"
              >
                Clear Search Filter
              </button>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="table-container desktop-only">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Receipt #</th>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Category</th>
                      <th>Payment Type</th>
                      <th>Method & Ref</th>
                      <th>Amount</th>
                      <th>Recorded By</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <span style={{ fontWeight: '700', color: 'var(--primary)' }}>{p.receipt_number}</span>
                        </td>
                        <td>{p.payment_date}</td>
                        <td>
                          <div style={{ fontWeight: '700' }}>{p.customer_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.customer_phone}</div>
                        </td>
                        <td>
                          <span className={`badge ${p.customer_category === 'HOUSE' ? 'badge-info' : 'badge-indigo'}`}>
                            {p.customer_category === 'HOUSE' ? 'House' : 'Bulk'}
                          </span>
                        </td>
                        <td>
                          {p.payment_type === 'ADVANCE_PAYMENT' ? (
                            <span className="badge badge-success">Advance Payment</span>
                          ) : (p.payment_type === 'DAILY_PAYMENT' || p.payment_type === 'DIRECT_PAYMENT') ? (
                            <span className="badge" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                              Daily Spot Pay
                            </span>
                          ) : (
                            <span className="badge badge-gray">Postpaid Settle</span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: '600' }}>{p.payment_method}</div>
                          {p.reference_number && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ref: {p.reference_number}</div>
                          )}
                        </td>
                        <td>
                          <span style={{ fontWeight: '800', fontSize: '1rem', color: '#16a34a' }}>
                            ₹{p.amount?.toFixed(2)}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.813rem', color: 'var(--text-secondary)' }}>{p.recorded_by_name || 'Admin'}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => handleOpenEdit(p)}
                              className="btn btn-outline btn-sm"
                              style={{ padding: '6px 10px' }}
                              title="Edit / Correct Payment"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => handleDeletePayment(p)}
                              className="btn btn-outline btn-sm"
                              style={{ padding: '6px 10px', color: '#dc2626', borderColor: '#fca5a5' }}
                              title="Delete / Void Payment"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile-Only Payment Cards */}
              <div className="mobile-only mobile-card-list">
                {filteredPayments.map((p) => (
                  <div key={p.id} className="mobile-data-card">
                    <div className="mobile-card-header">
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--primary)', fontFamily: 'monospace' }}>
                          {p.receipt_number}
                        </span>
                        <h3 className="mobile-card-title" style={{ marginTop: '2px' }}>{p.customer_name}</h3>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Date: {p.payment_date}</div>
                      </div>
                      <span className={`badge ${p.customer_category === 'HOUSE' ? 'badge-info' : 'badge-indigo'}`}>
                        {p.customer_category === 'HOUSE' ? 'House' : 'Bulk'}
                      </span>
                    </div>

                    <div className="mobile-card-row">
                      <span className="mobile-card-row-label">Payment Type</span>
                      {p.payment_type === 'ADVANCE_PAYMENT' ? (
                        <span className="badge badge-success">Advance Payment</span>
                      ) : (p.payment_type === 'DAILY_PAYMENT' || p.payment_type === 'DIRECT_PAYMENT') ? (
                        <span className="badge" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                          Daily Spot Pay
                        </span>
                      ) : (
                        <span className="badge badge-gray">Postpaid Settle</span>
                      )}
                    </div>

                    <div className="mobile-card-row">
                      <span className="mobile-card-row-label">Method & Reference</span>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{p.payment_method}</span>
                        {p.reference_number && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Ref: {p.reference_number}</div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0', marginTop: '2px' }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: '#166534', fontWeight: '700', textTransform: 'uppercase' }}>Amount Received</div>
                        <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#15803d' }}>
                          ₹{p.amount?.toFixed(2)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleOpenEdit(p)}
                          className="btn btn-outline btn-sm"
                          style={{ padding: '6px 10px' }}
                          title="Edit Payment"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleDeletePayment(p)}
                          className="btn btn-outline btn-sm"
                          style={{ padding: '6px 10px', color: '#dc2626', borderColor: '#fca5a5' }}
                          title="Delete Payment"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Record New Payment Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Record Customer Payment">
        <form onSubmit={handleSavePayment}>
          {formError && (
            <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#dc2626', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.875rem' }}>
              {formError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Customer *</label>
            <CustomerSearchSelect
              customers={customers}
              value={formData.customer_id}
              onChange={(id) => handleCustomerChange(id)}
              placeholder="Search customer by name, phone, flat..."
              required
            />
          </div>

          {/* Customer Live Dues & Active Bills Section */}
          {formData.customer_id && (
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '16px'
            }}>
              {loadingDues ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RefreshCw size={14} className="spin" /> Loading customer dues & balance...
                </div>
              ) : selectedCustomerDues ? (
                <div>
                  {/* Customer Header info */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '4px' }}>
                    <div>
                      <span style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                        {selectedCustomerDues.customer?.name}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                        ({selectedCustomerDues.customer?.phone})
                      </span>
                    </div>
                    <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                      Plan: {selectedCustomerDues.customer?.billing_type}
                    </span>
                  </div>

                  {/* Dues & Advance Balance Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                    {/* Pending Dues Box */}
                    <div style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: selectedCustomerDues.pending_balance > 0 ? '#fef2f2' : '#f0fdf4',
                      border: `1px solid ${selectedCustomerDues.pending_balance > 0 ? '#fecaca' : '#bbf7d0'}`
                    }}>
                      <div style={{ fontSize: '0.7rem', color: selectedCustomerDues.pending_balance > 0 ? '#991b1b' : '#166534', fontWeight: '700', textTransform: 'uppercase' }}>
                        Pending Dues
                      </div>
                      <div style={{ fontSize: '1.15rem', fontWeight: '800', color: selectedCustomerDues.pending_balance > 0 ? '#dc2626' : '#16a34a' }}>
                        ₹{Number(selectedCustomerDues.pending_balance || 0).toFixed(2)}
                      </div>
                      {selectedCustomerDues.pending_balance <= 0 && (
                        <div style={{ fontSize: '0.7rem', color: '#16a34a', marginTop: '2px' }}>✓ All previous bills paid</div>
                      )}
                    </div>

                    {/* Advance Balance Box */}
                    <div style={{
                      padding: '8px 10px',
                      borderRadius: '8px',
                      background: selectedCustomerDues.advance_balance > 0 ? '#eff6ff' : '#f8fafc',
                      border: `1px solid ${selectedCustomerDues.advance_balance > 0 ? '#bfdbfe' : '#e2e8f0'}`
                    }}>
                      <div style={{ fontSize: '0.7rem', color: selectedCustomerDues.advance_balance > 0 ? '#1e40af' : '#64748b', fontWeight: '700', textTransform: 'uppercase' }}>
                        Advance Balance
                      </div>
                      <div style={{ fontSize: '1.15rem', fontWeight: '800', color: selectedCustomerDues.advance_balance > 0 ? '#2563eb' : '#64748b' }}>
                        ₹{Number(selectedCustomerDues.advance_balance || 0).toFixed(2)}
                      </div>
                      {selectedCustomerDues.advance_balance > 0 && (
                        <div style={{ fontSize: '0.7rem', color: '#2563eb', marginTop: '2px' }}>Available for future bills</div>
                      )}
                    </div>
                  </div>

                  {/* Quick Settlement Buttons if pending dues > 0 */}
                  {selectedCustomerDues.pending_balance > 0 && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-outline btn-xs"
                        style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#dc2626', fontWeight: '700' }}
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            amount: String(selectedCustomerDues.pending_balance),
                            payment_type: 'POSTPAID_BILL_PAYMENT',
                            bill_id: null
                          }));
                        }}
                      >
                        ⚡ Settle Full Due (₹{Number(selectedCustomerDues.pending_balance).toFixed(2)})
                      </button>

                      <button
                        type="button"
                        className="btn btn-outline btn-xs"
                        style={{ background: '#fff', borderColor: '#cbd5e1', color: 'var(--text-primary)' }}
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            amount: (selectedCustomerDues.pending_balance / 2).toFixed(2),
                            payment_type: 'POSTPAID_BILL_PAYMENT',
                            bill_id: null
                          }));
                        }}
                      >
                        Pay 50% (₹{(selectedCustomerDues.pending_balance / 2).toFixed(2)})
                      </button>
                    </div>
                  )}

                  {/* List of Unpaid / Pending Bills */}
                  {selectedCustomerDues.unpaid_bills && selectedCustomerDues.unpaid_bills.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: '800', color: '#475569', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Unpaid / Active Bills ({selectedCustomerDues.unpaid_bills.length}):
                      </div>
                      <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', background: 'white' }}>
                        <table style={{ width: '100%', fontSize: '0.74rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
                              <th style={{ padding: '5px 6px', textAlign: 'left' }}>Bill #</th>
                              <th style={{ padding: '5px 6px', textAlign: 'left' }}>Period</th>
                              <th style={{ padding: '5px 6px', textAlign: 'right' }}>Total</th>
                              <th style={{ padding: '5px 6px', textAlign: 'right' }}>Paid</th>
                              <th style={{ padding: '5px 6px', textAlign: 'right', color: '#dc2626' }}>Remaining Due</th>
                              <th style={{ padding: '5px 6px', textAlign: 'center' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedCustomerDues.unpaid_bills.map((b) => (
                              <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '5px 6px', fontWeight: '600' }}>{b.bill_number}</td>
                                <td style={{ padding: '5px 6px', color: '#64748b' }}>
                                  {b.billing_month || `${b.start_date} to ${b.end_date}`}
                                </td>
                                <td style={{ padding: '5px 6px', textAlign: 'right' }}>₹{Number(b.net_payable).toFixed(2)}</td>
                                <td style={{ padding: '5px 6px', textAlign: 'right', color: '#16a34a' }}>₹{Number(b.paid_amount || 0).toFixed(2)}</td>
                                <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '700', color: '#dc2626' }}>
                                  ₹{Number(b.remaining_due).toFixed(2)}
                                </td>
                                <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    className="btn btn-xs"
                                    style={{
                                      padding: '2px 6px',
                                      fontSize: '0.68rem',
                                      background: formData.bill_id === b.id ? '#15803d' : '#f1f5f9',
                                      color: formData.bill_id === b.id ? 'white' : '#0f172a',
                                      border: '1px solid #cbd5e1'
                                    }}
                                    onClick={() => {
                                      setFormData(prev => ({
                                        ...prev,
                                        amount: String(b.remaining_due),
                                        bill_id: b.id,
                                        payment_type: 'POSTPAID_BILL_PAYMENT'
                                      }));
                                    }}
                                  >
                                    {formData.bill_id === b.id ? 'Selected' : 'Pay This'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Payment Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="1"
                className="form-input"
                placeholder="e.g. 1500"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Payment Date *</label>
              <input
                type="date"
                className="form-input"
                value={formData.payment_date}
                onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Dynamic Live Payment Impact Breakdown */}
          {formData.customer_id && formData.amount && parseFloat(formData.amount) > 0 && selectedCustomerDues && (
            <div style={{
              background: '#f8fafc',
              border: '1px dashed #cbd5e1',
              borderRadius: '8px',
              padding: '10px 12px',
              marginBottom: '14px',
              fontSize: '0.78rem'
            }}>
              <div style={{ fontWeight: '800', color: '#0f172a', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💡 Payment Settlement Preview:</span>
              </div>
              {(() => {
                const payAmt = parseFloat(formData.amount) || 0;
                const dues = Number(selectedCustomerDues.pending_balance || 0);
                const reducesDues = Math.min(payAmt, dues);
                const remainingDues = Math.max(0, parseFloat((dues - payAmt).toFixed(2)));
                const surplusToAdvance = Math.max(0, parseFloat((payAmt - dues).toFixed(2)));

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', color: '#334155' }}>
                    {dues > 0 ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Reduces previous bill(s) by:</span>
                          <strong style={{ color: '#16a34a' }}>- ₹{reducesDues.toFixed(2)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Remaining pending due after this payment:</span>
                          <strong style={{ color: remainingDues > 0 ? '#dc2626' : '#16a34a' }}>
                            ₹{remainingDues.toFixed(2)}
                          </strong>
                        </div>
                        {remainingDues > 0 ? (
                          <div style={{ fontSize: '0.72rem', color: '#b45309', marginTop: '2px' }}>
                            ↳ ₹{remainingDues.toFixed(2)} unpaid due will continue to the next bill as Previous Due.
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.72rem', color: '#15803d', marginTop: '2px', fontWeight: '700' }}>
                            ✓ Previous bill(s) fully settled! Next bill will calculate freshly from ₹0 dues.
                          </div>
                        )}
                        {surplusToAdvance > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2563eb', borderTop: '1px solid #e2e8f0', paddingTop: '4px', marginTop: '2px' }}>
                            <span>Surplus credited to Advance Balance:</span>
                            <strong>+ ₹{surplusToAdvance.toFixed(2)}</strong>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ color: '#15803d', fontWeight: '600' }}>
                        ✓ Customer has no pending dues. Full <strong>₹{payAmt.toFixed(2)}</strong> will be credited to Advance Balance for future milk!
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Payment Type *</label>
              <select
                className="form-select"
                value={formData.payment_type}
                onChange={(e) => setFormData({ ...formData, payment_type: e.target.value })}
              >
                <option value="ADVANCE_PAYMENT">Advance Deposit (Prepaid)</option>
                <option value="POSTPAID_BILL_PAYMENT">Postpaid Bill Settlement</option>
                <option value="DIRECT_PAYMENT">Daily Spot Payment (Cash/UPI on Delivery)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Payment Method *</label>
              <select
                className="form-select"
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
              >
                <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer (NEFT/IMPS)</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Transaction / UPI Reference Number</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. UPI Ref # 348921894"
              value={formData.reference_number}
              onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Notes (Optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Advance received for upcoming month"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Recording Payment...' : 'Confirm & Save Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit / Correct Payment Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={`Edit Payment (${editFormData.receipt_number})`}>
        <form onSubmit={handleUpdatePayment}>
          {editFormError && (
            <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#dc2626', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.875rem' }}>
              {editFormError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Customer</label>
            <input
              type="text"
              className="form-input"
              value={editFormData.customer_name}
              disabled
              style={{ background: '#f8fafc', color: 'var(--text-muted)', cursor: 'not-allowed' }}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Corrected Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="form-input"
                placeholder="e.g. 1500"
                value={editFormData.amount}
                onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Payment Date *</label>
              <input
                type="date"
                className="form-input"
                value={editFormData.payment_date}
                onChange={(e) => setEditFormData({ ...editFormData, payment_date: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Payment Method *</label>
              <select
                className="form-select"
                value={editFormData.payment_method}
                onChange={(e) => setEditFormData({ ...editFormData, payment_method: e.target.value })}
              >
                <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer (NEFT/IMPS)</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Transaction / UPI Ref #</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. UPI Ref # 348921894"
                value={editFormData.reference_number}
                onChange={(e) => setEditFormData({ ...editFormData, reference_number: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Correction Notes / Reason</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Amount corrected from mistake"
              value={editFormData.notes}
              onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
            <button type="button" onClick={() => setIsEditModalOpen(false)} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={editing}>
              {editing ? 'Saving Corrections...' : 'Save & Update Balance'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Customer Profile & Dues Inspection Modal */}
      {selectedCustomerId && (
        <CustomerProfileModal
          customerId={selectedCustomerId}
          isOpen={Boolean(selectedCustomerId)}
          initialTab="bills"
          onClose={() => {
            setSelectedCustomerId(null);
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}
