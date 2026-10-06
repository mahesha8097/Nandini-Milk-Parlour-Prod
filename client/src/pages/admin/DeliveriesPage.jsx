import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import ProductPacketImage from '../../components/ProductPacketImage';
import {
  PackageCheck,
  Calendar,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  PlusCircle,
  Truck,
  User
} from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [dboyFilter, setDboyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Ad-hoc Delivery Modal
  const [isAdhocOpen, setIsAdhocOpen] = useState(false);
  const [adhocForm, setAdhocForm] = useState({
    customer_id: '',
    product_id: '',
    delivery_date: getLocalDateString(),
    quantity: 1,
    notes: 'Extra packet requested'
  });
  const [adhocError, setAdhocError] = useState('');
  const [adhocSaving, setAdhocSaving] = useState(false);

  const fetchDeliveries = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      params.append('date', selectedDate);
      if (dboyFilter) params.append('delivery_boy_id', dboyFilter);
      if (statusFilter) params.append('status', statusFilter);

      const res = await api.get(`/deliveries?${params.toString()}`);
      setDeliveries(res);
    } catch (err) {
      setError(err.message || 'Unable to load deliveries.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDependencies = async () => {
    try {
      const [dboys, prods, custs] = await Promise.all([
        api.get('/delivery-boys'),
        api.get('/products'),
        api.get('/customers')
      ]);
      setDeliveryBoys(dboys);
      setProducts(prods);
      setCustomers(custs);
      if (custs.length > 0 && prods.length > 0) {
        setAdhocForm((prev) => ({
          ...prev,
          customer_id: custs[0].id,
          product_id: prods[0].id
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDependencies();
  }, []);

  useEffect(() => {
    fetchDeliveries();
  }, [selectedDate, dboyFilter, statusFilter]);

  const handleUpdateStatus = async (id, status) => {
    try {
      await api.put(`/deliveries/${id}/status`, { status });
      fetchDeliveries();
    } catch (err) {
      alert(err.message || 'Failed to update delivery status');
    }
  };

  const handleBulkMarkDelivered = async () => {
    const pendingIds = deliveries.filter((d) => d.status === 'PENDING').map((d) => d.id);
    if (pendingIds.length === 0) {
      alert('No pending deliveries to mark.');
      return;
    }

    if (!window.confirm(`Mark ${pendingIds.length} pending deliveries as DELIVERED?`)) return;

    try {
      await api.post('/deliveries/bulk-status', {
        deliveryIds: pendingIds,
        status: 'DELIVERED'
      });
      fetchDeliveries();
    } catch (err) {
      alert(err.message || 'Failed to update deliveries in bulk');
    }
  };

  const handleSaveAdhoc = async (e) => {
    e.preventDefault();
    try {
      setAdhocSaving(true);
      setAdhocError('');
      await api.post('/deliveries/adhoc', adhocForm);
      setIsAdhocOpen(false);
      fetchDeliveries();
    } catch (err) {
      setAdhocError(err.message || 'Failed to add delivery.');
    } finally {
      setAdhocSaving(false);
    }
  };

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <PackageCheck size={28} color="var(--primary)" />
            Daily Deliveries
          </h1>
          <p className="page-subtitle">Real-time daily dispatch tracking and status updates</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={fetchDeliveries} className="btn btn-outline btn-sm">
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={handleBulkMarkDelivered} className="btn btn-success btn-sm">
            <CheckCircle2 size={16} /> Mark All Delivered
          </button>
          <button onClick={() => setIsAdhocOpen(true)} className="btn btn-primary btn-sm">
            <PlusCircle size={16} /> Record Extra Delivery
          </button>
        </div>
      </div>

      {/* Date & Filter Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calendar size={18} color="var(--primary)" />
            <span style={{ fontWeight: '700', fontSize: '0.875rem' }}>Delivery Date:</span>
            <input
              type="date"
              className="form-input"
              style={{ width: 'auto', padding: '6px 12px' }}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <select
              className="form-select"
              style={{ width: 'auto', fontSize: '0.813rem' }}
              value={dboyFilter}
              onChange={(e) => setDboyFilter(e.target.value)}
            >
              <option value="">All Delivery Boys</option>
              {deliveryBoys.map((dboy) => (
                <option key={dboy.id} value={dboy.id}>{dboy.name}</option>
              ))}
            </select>

            <select
              className="form-select"
              style={{ width: 'auto', fontSize: '0.813rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="DELIVERED">Delivered</option>
              <option value="PENDING">Pending</option>
              <option value="SKIPPED">Skipped</option>
            </select>
          </div>
        </div>
      </div>

      {/* Deliveries Table */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading deliveries for {selectedDate}...</div>
      ) : error ? (
        <div className="card" style={{ color: 'var(--accent-red)', padding: '24px', textAlign: 'center' }}>{error}</div>
      ) : deliveries.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title={`No deliveries found for ${selectedDate}`}
          description="Deliveries are generated automatically from active subscriptions on demand."
          action={
            <button onClick={() => setIsAdhocOpen(true)} className="btn btn-primary btn-sm">
              <PlusCircle size={16} /> Add Ad-hoc Delivery
            </button>
          }
        />
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Customer & Route</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Delivery Charge</th>
                <th>Total Amount</th>
                <th>Delivery Boy</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((del) => (
                <tr key={del.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {del.customer_serial_no > 0 && (
                        <span
                          style={{
                            background: '#0054a6',
                            color: '#fff',
                            fontWeight: '800',
                            fontSize: '0.7rem',
                            padding: '1px 6px',
                            borderRadius: '4px'
                          }}
                          title={`Drop Order #${del.customer_serial_no}`}
                        >
                          #{del.customer_serial_no}
                        </span>
                      )}
                      <span style={{ fontWeight: '700' }}>{del.customer_name}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Route: {del.customer_route || 'N/A'} • {del.customer_phone}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ProductPacketImage product={del} size={34} />
                      <div>
                        <div style={{ fontWeight: '600' }}>
                          {del.product_name_snapshot || (
                            <span style={{ color: '#7c3aed', fontWeight: '700' }}>🏨 Bulk (Pending Products)</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {del.variant_snapshot ? `Variant: ${del.variant_snapshot}` : 'Manual Daily Entry'}
                        </div>
                      </div>
                    </div>
                    {((del.subscription_quantity && del.quantity !== del.subscription_quantity) || del.requirement_type === 'CHANGE_QUANTITY') && del.status !== 'SKIPPED' && (
                      <span
                        className="badge"
                        style={{
                          background: '#e0f2fe',
                          color: '#0369a1',
                          border: '1px solid #bae6fd',
                          fontWeight: '800',
                          fontSize: '0.7rem',
                          marginTop: '3px',
                          display: 'inline-block'
                        }}
                      >
                        ✏ Normal: {del.subscription_quantity || del.req_normal_quantity || 1} → Today: {del.quantity}
                      </span>
                    )}
                    {(del.requirement_reason || del.notes) && (
                      <div style={{ fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic', marginTop: '2px' }}>
                        Note: {del.requirement_reason || del.notes}
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '1rem' }}>{del.quantity}</span>
                  </td>
                  <td>₹{del.unit_price_snapshot?.toFixed(2)}</td>
                  <td>
                    <span style={{ fontWeight: '600', color: del.delivery_charge_snapshot > 0 ? '#d97706' : 'var(--text-muted)' }}>
                      ₹{del.delivery_charge_snapshot?.toFixed(2)}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: '800' }}>₹{del.total_amount?.toFixed(2)}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.813rem' }}>{del.delivery_boy_name || 'Unassigned'}</span>
                  </td>
                  <td>
                    <span className={`badge ${del.status === 'DELIVERED' ? 'badge-success' : del.status === 'SKIPPED' ? 'badge-warning' : 'badge-info'}`}>
                      {del.status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {del.status !== 'DELIVERED' && (
                        <button
                          onClick={() => handleUpdateStatus(del.id, 'DELIVERED')}
                          className="btn btn-success btn-sm"
                          style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                        >
                          <CheckCircle2 size={13} /> Deliver
                        </button>
                      )}
                      {del.status !== 'SKIPPED' && (
                        <button
                          onClick={() => handleUpdateStatus(del.id, 'SKIPPED')}
                          className="btn btn-outline btn-sm"
                          style={{ padding: '5px 10px', fontSize: '0.75rem', color: 'var(--accent-amber)' }}
                        >
                          <XCircle size={13} /> Skip
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

      {/* Ad-hoc Extra Delivery Modal */}
      <Modal
        isOpen={isAdhocOpen}
        onClose={() => setIsAdhocOpen(false)}
        title="Record Extra / One-Time Delivery"
      >
        <form onSubmit={handleSaveAdhoc}>
          {adhocError && (
            <div style={{ background: 'var(--accent-red-light)', color: '#991b1b', padding: '10px', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '0.875rem' }}>
              {adhocError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Customer *</label>
            <select
              className="form-select"
              value={adhocForm.customer_id}
              onChange={(e) => setAdhocForm({ ...adhocForm, customer_id: e.target.value })}
              required
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.route || 'No Route'})</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Product *</label>
              <select
                className="form-select"
                value={adhocForm.product_id}
                onChange={(e) => setAdhocForm({ ...adhocForm, product_id: e.target.value })}
                required
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.variant_label}) - ₹{p.selling_price}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Quantity *</label>
              <input
                type="number"
                min="1"
                className="form-input"
                value={adhocForm.quantity}
                onChange={(e) => setAdhocForm({ ...adhocForm, quantity: parseInt(e.target.value) || 1 })}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Delivery Date *</label>
            <input
              type="date"
              className="form-input"
              value={adhocForm.delivery_date}
              onChange={(e) => setAdhocForm({ ...adhocForm, delivery_date: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <input
              type="text"
              className="form-input"
              value={adhocForm.notes}
              onChange={(e) => setAdhocForm({ ...adhocForm, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
            <button type="button" onClick={() => setIsAdhocOpen(false)} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={adhocSaving}>
              {adhocSaving ? 'Saving...' : 'Save Delivery'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
