import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import {
  Wallet,
  PlusCircle,
  Calendar,
  Filter,
  RefreshCw,
  Trash2,
  Tag
} from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';

export default function ExpensesPage({ initialOpenAdd = false }) {
  const [expenses, setExpenses] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add Expense Modal
  const [isModalOpen, setIsModalOpen] = useState(initialOpenAdd);
  const [formData, setFormData] = useState({
    category: 'RENT',
    amount: '',
    expense_date: getLocalDateString(),
    payment_method: 'UPI',
    recipient_name: '',
    description: '',
    notes: ''
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (categoryFilter) params.append('category', categoryFilter);

      const res = await api.get(`/expenses?${params.toString()}`);
      setExpenses(res);
    } catch (err) {
      setError(err.message || 'Unable to load expenses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [categoryFilter]);

  const handleOpenAdd = () => {
    setFormData({
      category: 'RENT',
      amount: '',
      expense_date: getLocalDateString(),
      payment_method: 'UPI',
      recipient_name: '',
      description: '',
      notes: ''
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!formData.category || !formData.amount || !formData.expense_date) {
      setFormError('Please fill in required fields.');
      return;
    }

    const amt = parseFloat(formData.amount);
    if (isNaN(amt) || amt <= 0) {
      setFormError('Please enter a valid expense amount.');
      return;
    }

    try {
      setSaving(true);
      setFormError('');
      await api.post('/expenses', formData);
      setIsModalOpen(false);
      fetchExpenses();
    } catch (err) {
      setFormError(err.message || 'Failed to save expense.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Delete this expense record?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      fetchExpenses();
    } catch (err) {
      alert(err.message || 'Failed to delete expense');
    }
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Wallet size={28} color="var(--primary)" />
            Business Expenses
          </h1>
          <p className="page-subtitle">Track rent, staff salaries, petrol, electricity, and maintenance outlays</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchExpenses} className="btn btn-outline btn-sm">
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={handleOpenAdd} className="btn btn-primary btn-sm">
            <PlusCircle size={16} /> Record Expense
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Tag size={16} color="var(--text-muted)" />
          <span style={{ fontWeight: '700', fontSize: '0.875rem' }}>Category Filter:</span>
          <select
            className="form-select"
            style={{ width: 'auto', fontSize: '0.813rem' }}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Expense Categories</option>
            <option value="RENT">Rent</option>
            <option value="SALARY">Salary</option>
            <option value="PETROL">Petrol</option>
            <option value="ELECTRICITY">Electricity</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="PURCHASE">Purchase / Inventory</option>
            <option value="OTHER">Other Expenses</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading expenses...</div>
      ) : error ? (
        <div className="card" style={{ color: 'var(--accent-red)', padding: '24px', textAlign: 'center' }}>{error}</div>
      ) : expenses.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No expenses recorded"
          description="Click Record Expense to log operational expenses."
          action={
            <button onClick={handleOpenAdd} className="btn btn-primary btn-sm">
              <PlusCircle size={16} /> Record First Expense
            </button>
          }
        />
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Recipient</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Recorded By</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp) => (
                <tr key={exp.id}>
                  <td>{exp.expense_date}</td>
                  <td>
                    <span className="badge badge-indigo">{exp.category}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: '600' }}>{exp.description || 'N/A'}</div>
                    {exp.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{exp.notes}</div>}
                  </td>
                  <td>{exp.recipient_name || 'N/A'}</td>
                  <td><span className="badge badge-gray">{exp.payment_method}</span></td>
                  <td>
                    <span style={{ fontWeight: '800', color: '#dc2626' }}>
                      ₹{exp.amount?.toFixed(2)}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.813rem', color: 'var(--text-secondary)' }}>{exp.created_by_name || 'Admin'}</span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleDeleteExpense(exp.id)}
                      className="btn btn-outline btn-sm"
                      style={{ color: 'var(--accent-red)', padding: '4px 8px' }}
                      title="Delete expense"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Expense Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Record Business Expense"
      >
        <form onSubmit={handleSaveExpense}>
          {formError && (
            <div style={{ background: 'var(--accent-red-light)', color: '#991b1b', padding: '10px', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '0.875rem' }}>
              {formError}
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Category *</label>
              <select
                className="form-select"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                required
              >
                <option value="RENT">Rent</option>
                <option value="SALARY">Salary</option>
                <option value="PETROL">Petrol / Fuel</option>
                <option value="ELECTRICITY">Electricity</option>
                <option value="MAINTENANCE">Maintenance / Repairs</option>
                <option value="PURCHASE">Purchase / Inventory</option>
                <option value="OTHER">Other Expenses</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Amount (₹) *</label>
              <input
                type="number"
                min="1"
                step="any"
                className="form-input"
                placeholder="e.g. 2500"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date *</label>
              <input
                type="date"
                className="form-input"
                value={formData.expense_date}
                onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Payment Method *</label>
              <select
                className="form-select"
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
              >
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Recipient / Paid To</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Landlord / Delivery Agent / BESCOM"
              value={formData.recipient_name}
              onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Parlour Monthly Rent"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Expense'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
