import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import BillInvoiceModal from './BillInvoiceModal';
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
  AlertCircle
} from 'lucide-react';

export default function BillsPage() {
  const [bills, setBills] = useState([]);
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedBillId, setSelectedBillId] = useState(null);
  const [generating, setGenerating] = useState(false);

  const fetchBills = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (monthFilter) params.append('month', monthFilter);
      if (statusFilter) params.append('status', statusFilter);

      const res = await api.get(`/bills?${params.toString()}`);
      setBills(res);
    } catch (err) {
      setError(err.message || 'Unable to load bills.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, [monthFilter, statusFilter]);

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

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Receipt size={28} color="var(--primary)" />
            Customer Bills & Invoices
          </h1>
          <p className="page-subtitle">Monthly automated billing, advance expected calculations, and invoice history</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={fetchBills} className="btn btn-outline btn-sm">
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={() => handleGenerateMonthlyBills(false)} className="btn btn-outline btn-sm" disabled={generating}>
            <PlayCircle size={16} />
            {generating ? 'Generating...' : `Run ${monthFilter} Billing`}
          </button>
          <button onClick={() => handleGenerateMonthlyBills(true)} className="btn btn-primary btn-sm" disabled={generating} title="Recalculate existing bills to sync with updated subscription start dates">
            <RotateCcw size={16} />
            {generating ? 'Processing...' : `Recalculate / Sync ${monthFilter} Bills`}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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

          <div style={{ display: 'flex', gap: '10px' }}>
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
          description="Click 'Run Billing' to automatically generate monthly bills for active customers."
          action={
            <button onClick={() => handleGenerateMonthlyBills(false)} className="btn btn-primary btn-sm" disabled={generating}>
              <PlayCircle size={16} /> Run Monthly Billing
            </button>
          }
        />
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Bill Number</th>
                <th>Customer</th>
                <th>Billing Scheme</th>
                <th>Product Subtotal</th>
                <th>Delivery Charges</th>
                <th>Gross Total</th>
                <th>Advance Deducted</th>
                <th>Net Payable</th>
                <th>Advance Remaining</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
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
                    <span className={`badge ${bill.billing_type === 'PREPAID' ? 'badge-success' : 'badge-warning'}`}>
                      {bill.billing_type === 'PREPAID' ? 'Prepaid (Advance)' : 'Postpaid'}
                    </span>
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
