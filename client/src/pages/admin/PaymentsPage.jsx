import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import {
  CreditCard,
  PlusCircle,
  Calendar,
  Filter,
  RefreshCw,
  Search,
  CheckCircle2,
  Wallet
} from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';

export default function PaymentsPage({ initialOpenAdd = false }) {
  const [payments, setPayments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add Payment Modal
  const [isModalOpen, setIsModalOpen] = useState(initialOpenAdd);
  const [formData, setFormData] = useState({
    customer_id: '',
    payment_type: 'ADVANCE_PAYMENT',
    amount: '',
    payment_date: getLocalDateString(),
    payment_method: 'UPI',
    reference_number: '',
    notes: ''
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

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
      setCustomers(res);
      if (res.length > 0 && !formData.customer_id) {
        setFormData((prev) => ({ ...prev, customer_id: res[0].id }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchCustomers();
  }, []);

  const handleOpenAdd = () => {
    setFormData({
      customer_id: customers.length > 0 ? customers[0].id : '',
      payment_type: 'ADVANCE_PAYMENT',
      amount: '',
      payment_date: getLocalDateString(),
      payment_method: 'UPI',
      reference_number: '',
      notes: ''
    });
    setFormError('');
    setIsModalOpen(true);
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
      await api.post('/payments', formData);
      setIsModalOpen(false);
      fetchPayments();
    } catch (err) {
      setFormError(err.message || 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <CreditCard size={28} color="var(--primary)" />
            Payment Collections
          </h1>
          <p className="page-subtitle">Record Advance and Postpaid bill collections with ledger updates</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchPayments} className="btn btn-outline btn-sm">
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={handleOpenAdd} className="btn btn-primary btn-sm">
            <PlusCircle size={16} /> Record Payment
          </button>
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
      ) : (
        <div className="table-container">
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
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
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
                    <span className={`badge ${p.payment_type === 'ADVANCE_PAYMENT' ? 'badge-success' : 'badge-gray'}`}>
                      {p.payment_type === 'ADVANCE_PAYMENT' ? 'Advance Payment' : 'Postpaid Settle'}
                    </span>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Payment Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Record Customer Payment"
      >
        <form onSubmit={handleSavePayment}>
          {formError && (
            <div style={{ background: 'var(--accent-red-light)', color: '#991b1b', padding: '10px', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '0.875rem' }}>
              {formError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Customer *</label>
            <select
              className="form-select"
              value={formData.customer_id}
              onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
              required
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.billing_type === 'PREPAID' ? 'Prepaid' : 'Postpaid'}) • Due: ₹{c.pending_balance?.toFixed(2) || '0.00'} • Adv: ₹{c.advance_balance?.toFixed(2) || '0.00'}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Payment Amount (₹) *</label>
              <input
                type="number"
                min="1"
                step="any"
                className="form-input"
                placeholder="e.g. 1000"
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
    </div>
  );
}
