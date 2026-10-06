import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import EmptyState from '../../components/common/EmptyState';
import { FileBarChart, Calendar, RefreshCw, CheckCircle2 } from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';

export default function DeliveryBoyHistory() {
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchHistory = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/deliveries?date=${selectedDate}`);
      setDeliveries(res);
    } catch (err) {
      setError(err.message || 'Unable to load delivery history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [selectedDate]);

  const completed = deliveries.filter((d) => d.status === 'DELIVERED');
  const skipped = deliveries.filter((d) => d.status === 'SKIPPED');

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <FileBarChart size={28} color="var(--primary)" />
            Delivery History
          </h1>
          <p className="page-subtitle">View your past deliveries and completion records by date</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Calendar size={18} color="var(--primary)" />
          <span style={{ fontWeight: '700', fontSize: '0.875rem' }}>Select Date:</span>
          <input
            type="date"
            className="form-input"
            style={{ width: 'auto', padding: '6px 12px' }}
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading delivery log...</div>
      ) : error ? (
        <div className="card" style={{ color: 'var(--accent-red)', padding: '20px' }}>{error}</div>
      ) : deliveries.length === 0 ? (
        <EmptyState
          icon={FileBarChart}
          title={`No delivery records on ${selectedDate}`}
          description="Select another date to view historical delivery logs."
        />
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
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div style={{ fontWeight: '700' }}>{d.customer_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.customer_address}</div>
                  </td>
                  <td>{d.product_name_snapshot} ({d.variant_snapshot})</td>
                  <td>{d.quantity}</td>
                  <td style={{ fontWeight: '700' }}>₹{d.total_amount?.toFixed(2)}</td>
                  <td>
                    <span className={`badge ${d.status === 'DELIVERED' ? 'badge-success' : d.status === 'SKIPPED' ? 'badge-warning' : 'badge-info'}`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
