import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import CustomerSearchSelect from '../../components/common/CustomerSearchSelect';
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
  RotateCcw
} from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';

export default function PaymentsPage({ initialOpenAdd = false }) {
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search & Filter state
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
      setPayments(res);
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

  useEffect(() => {
    fetchPayments();
    fetchCustomers();
  }, []);

  const handleCustomerChange = async (id) => {
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
          amount: prev.amount || String(res.pending_balance)
        }));
      } else {
        setFormData((prev) => ({
          ...prev,
          payment_type: 'ADVANCE_PAYMENT'
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
    await Promise.all([fetchPayments(), fetchCustomers()]);
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
      await Promise.all([fetchPayments(), fetchCustomers()]);
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
      await Promise.all([fetchPayments(), fetchCustomers()]);
    } catch (err) {
      setEditFormError(err.message || 'Failed to update payment.');
    } finally {
      setEditing(false);
    }
  };

  const handleDeletePayment = async (p) => {
    // Immediately soft-delete and update the UI — no confirm dialog
    try {
      setLoading(true);
      const result = await api.delete(`/payments/${p.id}`);
      // Remove from list immediately
      setPayments(prev => prev.filter(x => x.id !== p.id));

      // Show undo toast with 10-second countdown
      const UNDO_SECONDS = 10;
      setUndoToast({
        paymentId: result.paymentId || p.id,
        receiptNumber: p.receipt_number,
        customerName: p.customer_name,
        amount: p.amount,
        countdown: UNDO_SECONDS
      });

      // Countdown tick
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

      // After UNDO_SECONDS, permanently delete
      undoTimerRef.current = setTimeout(async () => {
        try {
          await api.delete(`/payments/${result.paymentId || p.id}/permanent`);
        } catch (e) {
          console.error('Permanent delete failed:', e);
        }
      }, UNDO_SECONDS * 1000);

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
      await fetchPayments();
    } catch (err) {
      alert('Failed to restore payment: ' + (err.message || ''));
    }
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(undoTimerRef.current);
      clearInterval(undoCountdownRef.current);
    };
  }, []);

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
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <CreditCard size={28} color="var(--primary)" />
            Payment Collections
          </h1>
          <p className="page-subtitle">Record Advance and Postpaid bill collections with ledger updates</p>
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
    </div>
  );
}
