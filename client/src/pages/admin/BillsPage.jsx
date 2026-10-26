import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import BillInvoiceModal from './BillInvoiceModal';
import CustomerSearchSelect from '../../components/common/CustomerSearchSelect';
import {
  Receipt,
  Calendar,
  Filter,
  Eye,
  PlayCircle,
  RefreshCw,
  Ban,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2,
  Clock,
  Ticket,
  Search,
  X
} from 'lucide-react';

export default function BillsPage() {
  const [bills, setBills] = useState([]);
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [statusFilter, setStatusFilter] = useState('');
  const [billingTypeFilter, setBillingTypeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedBillId, setSelectedBillId] = useState(null);
  const [generating, setGenerating] = useState(false);

  // Weekly Billing Modal States
  const [isWeeklyModalOpen, setIsWeeklyModalOpen] = useState(false);
  const [weeklyCustomerList, setWeeklyCustomerList] = useState([]);
  const [weeklyFormData, setWeeklyFormData] = useState({
    customerId: '',
    startDate: '',
    endDate: '',
    forceRegenerate: false
  });
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState('');

  // Edit Bill Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editBillData, setEditBillData] = useState({
    id: null,
    bill_number: '',
    customer_name: '',
    gross_amount: '',
    product_subtotal: '',
    delivery_charges_total: '',
    net_payable: '',
    status: 'PENDING',
    due_date: '',
    notes: ''
  });
  const [editingBill, setEditingBill] = useState(false);
  const [editBillError, setEditBillError] = useState('');

  const fetchBills = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (monthFilter) params.append('month', monthFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (billingTypeFilter) params.append('billing_type', billingTypeFilter);

      const res = await api.get(`/bills?${params.toString()}`);
      setBills(res);
    } catch (err) {
      setError(err.message || 'Unable to load bills.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomersForWeekly = async () => {
    try {
      const res = await api.get('/customers');
      setWeeklyCustomerList(res || []);
    } catch (err) {
      console.error('Failed to load customers for weekly billing:', err);
    }
  };

  useEffect(() => {
    fetchBills();
  }, [monthFilter, statusFilter, billingTypeFilter]);

  useEffect(() => {
    fetchCustomersForWeekly();
  }, []);

  const setQuickWeekRange = (type) => {
    const today = new Date();
    const day = today.getDay(); // 0 is Sunday, 1 is Monday...
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const currMonday = new Date(today);
    currMonday.setDate(today.getDate() + diffToMonday);

    if (type === 'this_week') {
      const currSunday = new Date(currMonday);
      currSunday.setDate(currMonday.getDate() + 6);
      setWeeklyFormData(prev => ({
        ...prev,
        startDate: currMonday.toISOString().slice(0, 10),
        endDate: currSunday.toISOString().slice(0, 10)
      }));
    } else if (type === 'last_week') {
      const prevMonday = new Date(currMonday);
      prevMonday.setDate(currMonday.getDate() - 7);
      const prevSunday = new Date(prevMonday);
      prevSunday.setDate(prevMonday.getDate() + 6);
      setWeeklyFormData(prev => ({
        ...prev,
        startDate: prevMonday.toISOString().slice(0, 10),
        endDate: prevSunday.toISOString().slice(0, 10)
      }));
    }
  };

  const handleGenerateWeeklyBills = async (e) => {
    e.preventDefault();
    try {
      setWeeklyLoading(true);
      setWeeklyError('');
      const res = await api.post('/bills/generate-weekly', {
        customerId: weeklyFormData.customerId || undefined,
        startDate: weeklyFormData.startDate,
        endDate: weeklyFormData.endDate,
        forceRegenerate: weeklyFormData.forceRegenerate
      });
      alert(res.message || 'Weekly bills generated successfully!');
      setIsWeeklyModalOpen(false);
      fetchBills();
    } catch (err) {
      setWeeklyError(err.message || 'Failed to generate weekly bills');
    } finally {
      setWeeklyLoading(false);
    }
  };

  const handleGenerateMonthlyBills = async (forceRegenerate = false) => {
    const promptMsg = forceRegenerate
      ? `Recalculate bills for ALL customers in ${monthFilter}? This will calculate delivered milk for all days, deduct the amounts from each customer's advance balance, and update their remaining advance.`
      : `Generate monthly bills for ALL customers in ${monthFilter}? This will calculate bills from delivered milk or subscriptions and adjust advances automatically.`;

    if (!window.confirm(promptMsg)) return;

    try {
      setGenerating(true);
      const res = await api.post('/bills/generate-monthly', { month: monthFilter, forceRegenerate, billingBasis: 'AUTO' });
      alert(`Billing complete for ALL customers: ${res.summary.deliveredBillsGenerated || 0} delivered milk bills and ${(res.summary.prepaidBillsGenerated || 0) + (res.summary.postpaidBillsGenerated || 0)} total bills processed.`);
      fetchBills();
    } catch (err) {
      alert(err.message || 'Failed to generate monthly bills');
    } finally {
      setGenerating(false);
    }
  };

  const handleRecalculateBill = async (billId, billNum) => {
    try {
      setGenerating(true);
      const res = await api.post(`/bills/${billId}/regenerate`);
      alert(res.message || `Bill #${billNum} recalculated successfully!`);
      fetchBills();
    } catch (err) {
      alert(err.message || 'Failed to recalculate bill');
    } finally {
      setGenerating(false);
    }
  };

  const handleCancelBill = async (billId, billNum) => {
    const reason = prompt(`Enter reason for cancelling bill #${billNum}:`);
    if (reason === null) return;

    try {
      await api.post(`/bills/${billId}/cancel`, { reason });
      fetchBills();
    } catch (err) {
      alert(err.message || 'Failed to cancel bill');
    }
  };

  const handleOpenEditBill = (bill) => {
    setEditBillData({
      id: bill.id,
      bill_number: bill.bill_number,
      customer_name: bill.customer_name,
      gross_amount: bill.gross_amount ?? 0,
      product_subtotal: bill.product_subtotal ?? 0,
      delivery_charges_total: bill.delivery_charges_total ?? 0,
      net_payable: bill.net_payable ?? 0,
      status: bill.status || 'PENDING',
      due_date: bill.due_date || '',
      notes: bill.notes || ''
    });
    setEditBillError('');
    setIsEditModalOpen(true);
  };

  const handleUpdateBill = async (e) => {
    e.preventDefault();
    try {
      setEditingBill(true);
      setEditBillError('');
      await api.put(`/bills/${editBillData.id}`, {
        gross_amount: parseFloat(editBillData.gross_amount),
        product_subtotal: parseFloat(editBillData.product_subtotal),
        delivery_charges_total: parseFloat(editBillData.delivery_charges_total),
        net_payable: parseFloat(editBillData.net_payable),
        status: editBillData.status,
        due_date: editBillData.due_date,
        notes: editBillData.notes
      });
      setIsEditModalOpen(false);
      fetchBills();
    } catch (err) {
      setEditBillError(err.message || 'Failed to update bill');
    } finally {
      setEditingBill(false);
    }
  };

  const handleDeleteBill = async (bill) => {
    if (!window.confirm(`Are you sure you want to permanently delete Bill #${bill.bill_number} for ${bill.customer_name}? The customer's advance and pending balances will be restored.`)) {
      return;
    }

    try {
      setLoading(true);
      await api.delete(`/bills/${bill.id}`);
      fetchBills();
    } catch (err) {
      alert(err.message || 'Failed to delete bill');
    } finally {
      setLoading(false);
    }
  };

  const filteredBills = useMemo(() => {
    if (!searchQuery.trim()) return bills;
    const q = searchQuery.toLowerCase().trim();
    return bills.filter(b => {
      const billNum = (b.bill_number || '').toLowerCase();
      const custName = (b.customer_name || '').toLowerCase();
      const phone = (b.customer_phone || '').toLowerCase();
      const flat = (b.flat_no || '').toLowerCase();
      const route = (b.route_name || '').toLowerCase();
      const status = (b.status || '').toLowerCase();
      const plan = (b.billing_type || '').toLowerCase();
      return billNum.includes(q) || custName.includes(q) || phone.includes(q) || flat.includes(q) || route.includes(q) || status.includes(q) || plan.includes(q);
    });
  }, [bills, searchQuery]);

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Receipt size={28} color="var(--primary)" />
            Customer Bills & Invoices
          </h1>
          <p className="page-subtitle">Monthly automated billing, advance deduction reconciliation, and invoice generation</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              setQuickWeekRange('last_week');
              setIsWeeklyModalOpen(true);
            }}
            className="btn btn-secondary btn-sm"
            style={{ background: '#e0e7ff', color: '#3730a3', borderColor: '#c7d2fe', fontWeight: '700' }}
            title="Generate weekly bill based on actual delivery count"
          >
            <Clock size={16} />
            Generate Weekly Bill
          </button>
          <button onClick={() => handleGenerateMonthlyBills(false)} className="btn btn-primary btn-sm" disabled={generating} title="Generate bills for any customers who don't have one yet">
            <PlayCircle size={16} />
            {generating ? 'Generating...' : `Run ${monthFilter} Monthly Billing`}
          </button>
          <button onClick={() => handleGenerateMonthlyBills(true)} className="btn btn-outline btn-sm" disabled={generating} title="Recalculate existing bills to sync with updated subscription start dates">
            <RotateCcw size={16} />
            {generating ? 'Processing...' : `Recalculate ${monthFilter} Bills`}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={18} color="var(--primary)" />
              <span style={{ fontWeight: '700', fontSize: '0.875rem' }}>Billing Month:</span>
              <input
                type="month"
                className="form-input"
                style={{ width: 'auto', padding: '6px 12px' }}
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
              />
            </div>

            {/* Live Search Bar */}
            <div style={{ position: 'relative', minWidth: '240px', maxWidth: '320px' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Search bill #, customer, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '32px', paddingRight: searchQuery ? '30px' : '10px', paddingBlock: '6px', fontSize: '0.825rem' }}
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
              value={billingTypeFilter}
              onChange={(e) => setBillingTypeFilter(e.target.value)}
            >
              <option value="">All Billing Schemes</option>
              <option value="PREPAID">Prepaid (Advance)</option>
              <option value="POSTPAID">Postpaid (Monthly)</option>
              <option value="WEEKLY">Weekly (Actual Delivery)</option>
              <option value="DAILY">Daily Payment</option>
              <option value="COUPON">Coupon Customers</option>
            </select>

            <select
              className="form-select"
              style={{ width: 'auto', fontSize: '0.813rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="ADVANCE_PAID">Advance Paid</option>
              <option value="PAID">Paid</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="PENDING">Pending</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            {searchQuery && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                Showing {filteredBills.length} of {bills.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Bills Table */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading monthly bills...</div>
      ) : error ? (
        <div className="card" style={{ color: 'var(--accent-red)', padding: '24px', textAlign: 'center' }}>{error}</div>
      ) : bills.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={`No bills found for ${monthFilter}`}
          description={`Click "Run ${monthFilter} Billing" to automatically calculate bills and apply prepaid advances for all active customers.`}
          action={
            <button onClick={() => handleGenerateMonthlyBills(false)} className="btn btn-primary btn-sm" disabled={generating}>
              <PlayCircle size={16} /> Run {monthFilter} Billing Now
            </button>
          }
        />
      ) : filteredBills.length === 0 ? (
        <div className="card" style={{ padding: '36px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>
            No bills match your search "<strong>{searchQuery}</strong>".
          </p>
          <button onClick={() => setSearchQuery('')} className="btn btn-outline btn-sm">
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
                  <th>Bill # / Date</th>
                  <th>Customer</th>
                  <th>Billing Plan</th>
                  <th>Product Total</th>
                  <th>Delivery</th>
                  <th>Gross Total</th>
                  <th>Advance Deducted</th>
                  <th>Net Payable</th>
                  <th>Advance Remaining</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.map((bill) => (
                  <tr key={bill.id}>
                    <td>
                      <div style={{ fontWeight: '700', color: 'var(--primary)' }}>{bill.bill_number}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Date: {bill.bill_date}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: '700' }}>{bill.customer_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{bill.customer_phone}</div>
                    </td>
                    <td>
                      {bill.billing_type === 'WEEKLY' ? (
                        <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Clock size={11} /> Weekly ({bill.start_date && bill.end_date ? `${bill.start_date.slice(5)} to ${bill.end_date.slice(5)}` : 'Actual'})
                        </span>
                      ) : bill.billing_type === 'COUPON' ? (
                        <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Ticket size={11} /> Coupon
                        </span>
                      ) : bill.billing_type === 'DAILY' ? (
                        <span className="badge" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }}>
                          Daily Payment
                        </span>
                      ) : (
                        <span className={`badge ${bill.billing_type === 'PREPAID' ? 'badge-success' : 'badge-warning'}`}>
                          {bill.billing_type === 'PREPAID' ? 'Prepaid (Advance)' : 'Postpaid'}
                        </span>
                      )}
                    </td>
                    <td>₹{bill.product_subtotal?.toFixed(2)}</td>
                    <td>
                      <span style={{ fontWeight: '600', color: bill.delivery_charges_total > 0 ? '#d97706' : 'var(--text-muted)' }}>
                        ₹{bill.delivery_charges_total?.toFixed(2)}
                      </span>
                    </td>
                    <td style={{ fontWeight: '700' }}>₹{bill.gross_amount?.toFixed(2)}</td>
                    <td style={{ color: '#16a34a', fontWeight: '700' }}>
                      {bill.advance_adjusted > 0 ? `- ₹${bill.advance_adjusted?.toFixed(2)}` : '₹0.00'}
                    </td>
                    <td>
                      <span style={{ fontWeight: '800', fontSize: '0.95rem', color: bill.net_payable > 0 ? '#dc2626' : 'inherit' }}>
                        ₹{bill.net_payable?.toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: '700', color: '#16a34a' }}>
                        ₹{bill.customer_advance_balance !== undefined ? Number(bill.customer_advance_balance).toFixed(2) : '0.00'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${bill.status === 'PAID' || bill.status === 'ADVANCE_PAID' ? 'badge-success' : bill.status === 'PARTIALLY_PAID' ? 'badge-warning' : bill.status === 'CANCELLED' ? 'badge-gray' : 'badge-danger'}`}>
                        {bill.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => setSelectedBillId(bill.id)}
                          className="btn btn-outline btn-sm"
                          style={{ padding: '6px 10px' }}
                          title="View / Print Invoice"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => handleOpenEditBill(bill)}
                          className="btn btn-outline btn-sm"
                          style={{ padding: '6px 10px' }}
                          title="Edit / Correct Bill"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleRecalculateBill(bill.id, bill.bill_number)}
                          className="btn btn-outline btn-sm"
                          style={{ padding: '6px 10px' }}
                          title="Recalculate Bill with latest subscription dates"
                          disabled={generating}
                        >
                          <RotateCcw size={15} />
                        </button>
                        {bill.status !== 'CANCELLED' && (
                          <button
                            onClick={() => handleCancelBill(bill.id, bill.bill_number)}
                            className="btn btn-outline btn-sm"
                            style={{ padding: '6px 10px', color: 'var(--accent-red)' }}
                            title="Cancel Bill"
                          >
                            <Ban size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteBill(bill)}
                          className="btn btn-outline btn-sm"
                          style={{ padding: '6px 10px', color: '#dc2626', borderColor: '#fca5a5' }}
                          title="Delete Bill"
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

          {/* Mobile-Only Bill Cards */}
          <div className="mobile-only mobile-card-list">
            {filteredBills.map((bill) => (
              <div key={bill.id} className="mobile-data-card" onClick={() => setSelectedBillId(bill.id)} style={{ cursor: 'pointer' }}>
                <div className="mobile-card-header">
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--primary)', fontFamily: 'monospace' }}>
                      {bill.bill_number}
                    </span>
                    <h3 className="mobile-card-title" style={{ marginTop: '2px' }}>{bill.customer_name}</h3>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Date: {bill.bill_date}</div>
                  </div>
                  <span className={`badge ${bill.status === 'PAID' || bill.status === 'ADVANCE_PAID' ? 'badge-success' : bill.status === 'PARTIALLY_PAID' ? 'badge-warning' : bill.status === 'CANCELLED' ? 'badge-gray' : 'badge-danger'}`}>
                    {bill.status}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                  {bill.billing_type === 'WEEKLY' ? (
                    <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Clock size={11} /> Weekly ({bill.start_date && bill.end_date ? `${bill.start_date.slice(5)} to ${bill.end_date.slice(5)}` : 'Actual'})
                    </span>
                  ) : bill.billing_type === 'COUPON' ? (
                    <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <Ticket size={11} /> Coupon
                    </span>
                  ) : bill.billing_type === 'DAILY' ? (
                    <span className="badge" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }}>
                      Daily Payment
                    </span>
                  ) : (
                    <span className={`badge ${bill.billing_type === 'PREPAID' ? 'badge-success' : 'badge-warning'}`}>
                      {bill.billing_type === 'PREPAID' ? 'Prepaid (Advance)' : 'Postpaid'}
                    </span>
                  )}

                  {bill.customer_phone && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      📞 {bill.customer_phone}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', marginTop: '4px' }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Gross Bill</div>
                    <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-primary)' }}>₹{bill.gross_amount?.toFixed(2)}</div>
                  </div>
                  {bill.advance_adjusted > 0 && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: '700', textTransform: 'uppercase' }}>Advance Deducted</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#16a34a' }}>-₹{bill.advance_adjusted?.toFixed(2)}</div>
                    </div>
                  )}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Net Payable</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: '800', color: bill.net_payable > 0 ? '#dc2626' : '#16a34a' }}>
                      ₹{bill.net_payable?.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="mobile-card-actions" onClick={(e) => e.stopPropagation()} style={{ flexWrap: 'wrap', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedBillId(bill.id)}
                    className="btn btn-primary btn-sm"
                    style={{ flex: '1 1 100px', minHeight: '36px', fontSize: '0.82rem', fontWeight: '700' }}
                  >
                    <Eye size={14} /> View
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEditBill(bill)}
                    className="btn btn-outline btn-sm"
                    style={{ minHeight: '36px', padding: '6px 10px' }}
                    title="Edit Bill"
                  >
                    <Edit2 size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRecalculateBill(bill.id, bill.bill_number)}
                    className="btn btn-outline btn-sm"
                    disabled={generating}
                    style={{ minHeight: '36px', padding: '6px 10px' }}
                    title="Recalculate"
                  >
                    <RotateCcw size={14} />
                  </button>

                  {bill.status !== 'CANCELLED' && (
                    <button
                      type="button"
                      onClick={() => handleCancelBill(bill.id, bill.bill_number)}
                      className="btn btn-outline btn-sm"
                      style={{ minHeight: '36px', padding: '6px 10px', color: 'var(--accent-red)' }}
                      title="Cancel Bill"
                    >
                      <Ban size={14} />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteBill(bill)}
                    className="btn btn-outline btn-sm"
                    style={{ minHeight: '36px', padding: '6px 10px', color: '#dc2626', borderColor: '#fca5a5' }}
                    title="Delete Bill"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Edit / Correct Bill Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={`Edit Bill (${editBillData.bill_number})`}>
        <form onSubmit={handleUpdateBill}>
          {editBillError && (
            <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#dc2626', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.875rem' }}>
              {editBillError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Customer</label>
            <input
              type="text"
              className="form-input"
              value={editBillData.customer_name}
              disabled
              style={{ background: '#f8fafc', color: 'var(--text-muted)', cursor: 'not-allowed' }}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Gross Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                value={editBillData.gross_amount}
                onChange={(e) => setEditBillData({ ...editBillData, gross_amount: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Net Payable (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                value={editBillData.net_payable}
                onChange={(e) => setEditBillData({ ...editBillData, net_payable: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Product Subtotal (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                value={editBillData.product_subtotal}
                onChange={(e) => setEditBillData({ ...editBillData, product_subtotal: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Delivery Charges Total (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                value={editBillData.delivery_charges_total}
                onChange={(e) => setEditBillData({ ...editBillData, delivery_charges_total: e.target.value })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Bill Status *</label>
              <select
                className="form-select"
                value={editBillData.status}
                onChange={(e) => setEditBillData({ ...editBillData, status: e.target.value })}
              >
                <option value="PENDING">PENDING (Unpaid)</option>
                <option value="ADVANCE_PAID">ADVANCE_PAID (Paid from Advance)</option>
                <option value="PAID">PAID (Settled)</option>
                <option value="PARTIALLY_PAID">PARTIALLY_PAID</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input
                type="date"
                className="form-input"
                value={editBillData.due_date}
                onChange={(e) => setEditBillData({ ...editBillData, due_date: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Correction Notes / Reason</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Corrected manual discount or delivery charge adjustment"
              value={editBillData.notes}
              onChange={(e) => setEditBillData({ ...editBillData, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
            <button type="button" onClick={() => setIsEditModalOpen(false)} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={editingBill}>
              {editingBill ? 'Saving Changes...' : 'Save & Update Bill'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Generate Weekly Bill Modal */}
      <Modal
        isOpen={isWeeklyModalOpen}
        onClose={() => !weeklyLoading && setIsWeeklyModalOpen(false)}
        title="Generate Weekly Bill (Based on Actual Delivery)"
        maxWidth="600px"
      >
        <form onSubmit={handleGenerateWeeklyBills}>
          <div style={{
            background: '#e0e7ff',
            border: '1px solid #c7d2fe',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            marginBottom: '16px',
            fontSize: '0.82rem',
            color: '#3730a3',
            lineHeight: '1.4'
          }}>
            <strong>Weekly Billing Scheme:</strong> Calculates milk bills based strictly on actual delivered milk recorded for each day in the selected date range.
            Advances are automatically deducted from the customer's advance balance.
          </div>

          {weeklyError && (
            <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '14px' }}>
              {weeklyError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Customer Selection *</label>
            <CustomerSearchSelect
              customers={weeklyCustomerList}
              value={weeklyFormData.customerId}
              onChange={(id) => setWeeklyFormData((prev) => ({ ...prev, customerId: id }))}
              placeholder="Search weekly customers by name, phone, flat..."
              allOptionLabel={`⚡ All Weekly Customers (${weeklyCustomerList.filter(c => c.billing_type === 'WEEKLY').length} configured)`}
            />
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Select a single customer or keep all weekly customers to batch-generate bills.
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label className="form-label" style={{ marginBottom: '6px' }}>Quick Preset Ranges</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setQuickWeekRange('this_week')}
                className="btn btn-outline btn-sm"
                style={{ fontSize: '0.78rem' }}
              >
                📅 This Week (Mon – Sun)
              </button>
              <button
                type="button"
                onClick={() => setQuickWeekRange('last_week')}
                className="btn btn-outline btn-sm"
                style={{ fontSize: '0.78rem' }}
              >
                📅 Previous Week (Mon – Sun)
              </button>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Start Date *</label>
              <input
                type="date"
                required
                className="form-input"
                value={weeklyFormData.startDate}
                onChange={(e) => setWeeklyFormData({ ...weeklyFormData, startDate: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">End Date *</label>
              <input
                type="date"
                required
                className="form-input"
                value={weeklyFormData.endDate}
                onChange={(e) => setWeeklyFormData({ ...weeklyFormData, endDate: e.target.value })}
              />
            </div>
          </div>

          <div style={{ marginTop: '8px', marginBottom: '18px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.84rem' }}>
              <input
                type="checkbox"
                checked={weeklyFormData.forceRegenerate}
                onChange={(e) => setWeeklyFormData({ ...weeklyFormData, forceRegenerate: e.target.checked })}
              />
              <span>Force Recalculate / Overwrite if bill already exists for this date range</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setIsWeeklyModalOpen(false)}
              className="btn btn-outline"
              disabled={weeklyLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ background: '#3730a3', borderColor: '#312e81' }}
              disabled={weeklyLoading}
            >
              {weeklyLoading ? 'Generating Weekly Bills...' : 'Generate Weekly Bill'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Invoice Modal */}
      {selectedBillId && (
        <BillInvoiceModal
          billId={selectedBillId}
          isOpen={Boolean(selectedBillId)}
          onClose={() => setSelectedBillId(null)}
          onRecalculate={fetchBills}
        />
      )}
    </div>
  );
}
