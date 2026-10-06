import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import StatCard from '../../components/common/StatCard';
import EmptyState from '../../components/common/EmptyState';
import {
  Truck,
  PackageCheck,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Users,
  MapPin,
  Phone,
  ArrowRight,
  AlertTriangle,
  ClipboardList,
  TrendingUp,
  PlusCircle,
  Bell
} from 'lucide-react';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';

export default function DeliveryBoyDashboard({ onNavigate }) {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentDate, setCurrentDate] = useState(getLocalDateString());

  const fetchDashboardData = async (targetDate = currentDate) => {
    try {
      setLoading(true);
      setError('');
      const dateToFetch = targetDate || getLocalDateString();
      const [delRes, reqRes, custRes] = await Promise.all([
        api.get(`/deliveries?date=${dateToFetch}`),
        api.get(`/daily-requirements?date=${dateToFetch}`),
        api.get('/customers')
      ]);
      setDeliveries(delRes || []);
      setRequirements(reqRes || []);
      setCustomers(custRes || []);
    } catch (err) {
      setError(err.message || 'Unable to load delivery data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(currentDate);

    // Auto-detect 12:00 AM midnight rollover
    const interval = setInterval(() => {
      const freshToday = getLocalDateString();
      if (freshToday !== currentDate) {
        setCurrentDate(freshToday);
      }
    }, 30000);

    const handleFocus = () => {
      const freshToday = getLocalDateString();
      if (freshToday !== currentDate) {
        setCurrentDate(freshToday);
      } else {
        fetchDashboardData(freshToday);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentDate]);

  const totalToday = deliveries.length;
  const completedToday = deliveries.filter((d) => d.status === 'DELIVERED').length;
  const pendingToday = deliveries.filter((d) => d.status === 'PENDING').length;
  const skippedToday = deliveries.filter((d) => d.status === 'SKIPPED').length;

  // Filter special requirements for today
  const specialRequirements = requirements.filter(
    (r) => r.requirement_type && r.requirement_type !== 'NORMAL'
  );

  return (
    <div className="page-wrapper">
      {/* Welcome Banner */}
      <div style={{
        background: 'var(--primary-gradient)',
        color: 'white',
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
        marginBottom: '20px',
        boxShadow: 'var(--shadow-md)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <span style={{ fontSize: '0.813rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
              Delivery Agent Portal
            </span>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'white', marginTop: '2px' }}>
              Welcome, {user?.name}!
            </h1>
            <p style={{ fontSize: '0.875rem', opacity: 0.9, marginTop: '4px' }}>
              Assigned Route: <strong>{user?.assigned_route || 'General Delivery'}</strong> • Date: {formatDisplayDate(currentDate)}
            </p>
          </div>
          <button
            onClick={() => onNavigate('deliveries')}
            className="btn"
            style={{ background: 'white', color: 'var(--primary)', fontWeight: '700' }}
          >
            Start Deliveries <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Special Requirements Notification Banner */}
      {specialRequirements.length > 0 && (
        <div
          onClick={() => onNavigate('deliveries')}
          style={{
            background: '#fffbeb',
            border: '2px solid #f59e0b',
            borderRadius: 'var(--radius-md)',
            padding: '14px 18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: '#fef3c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#d97706',
              flexShrink: 0
            }}>
              <Bell size={20} />
            </div>
            <div>
              <div style={{ fontWeight: '800', color: '#92400e', fontSize: '0.95rem' }}>
                ⚠ {specialRequirements.length} Customer Special Delivery Requirement{specialRequirements.length > 1 ? 's' : ''} for Today!
              </div>
              <div style={{ fontSize: '0.8rem', color: '#b45309', marginTop: '2px' }}>
                Admin has updated specific instructions (Skip / Quantity Changes) for your route today.
              </div>
            </div>
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#b45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Review Deliveries <ArrowRight size={15} />
          </span>
        </div>
      )}

      {/* Progress Cards */}
      <div className="stat-grid" style={{ marginBottom: '20px' }}>
        <StatCard
          label="Today's Deliveries"
          value={`${completedToday} / ${totalToday}`}
          subtext={`${pendingToday} remaining to deliver`}
          icon={PackageCheck}
          color="var(--primary)"
          bgLight="var(--primary-light)"
        />
        <StatCard
          label="Completed"
          value={completedToday}
          subtext="Delivered successfully"
          icon={CheckCircle2}
          color="#10b981"
          bgLight="#ecfdf5"
        />
        <StatCard
          label="Special Requests"
          value={specialRequirements.length}
          subtext={`${skippedToday} skipped today`}
          icon={AlertTriangle}
          color="#f59e0b"
          bgLight="#fffbeb"
        />
        <StatCard
          label="Assigned Customers"
          value={customers.length}
          subtext="Total delivery stops"
          icon={Users}
          color="#6366f1"
          bgLight="#eef2ff"
        />
      </div>

      {/* TODAY'S CUSTOMER REQUIREMENTS SECTION */}
      {specialRequirements.length > 0 && (
        <div className="card" style={{ marginBottom: '20px', borderLeft: '5px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} color="#d97706" />
                TODAY'S CUSTOMER REQUIREMENTS
              </h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Please check before delivering to these customers today ({formatDisplayDate(currentDate)}):
              </span>
            </div>
            <button onClick={() => onNavigate('deliveries')} className="btn btn-warning btn-sm" style={{ fontWeight: '700' }}>
              Go to Deliveries
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
            {specialRequirements.map((req) => {
              const isSkipped = req.requirement_type === 'SKIP_DELIVERY';
              const isQtyChange = req.requirement_type === 'CHANGE_QUANTITY';
              const isExtra = req.requirement_type === 'ADD_EXTRA_QUANTITY';

              return (
                <div
                  key={`${req.customer_id}_${req.product_id}`}
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    border: `1.5px solid ${isSkipped ? '#fca5a5' : isQtyChange ? '#7dd3fc' : '#86efac'}`,
                    background: isSkipped ? '#fef2f2' : isQtyChange ? '#f0f9ff' : '#f0fdf4'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: '800', fontSize: '1rem', color: '#0f172a' }}>
                        {req.customer_name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {req.customer_address}
                      </div>
                    </div>
                    {isSkipped ? (
                      <span className="badge badge-danger" style={{ fontWeight: '800' }}>
                        ⚠ SKIP DELIVERY
                      </span>
                    ) : isQtyChange ? (
                      <span className="badge badge-info" style={{ fontWeight: '800' }}>
                        TODAY: {req.required_quantity} PKT
                      </span>
                    ) : (
                      <span className="badge badge-success" style={{ fontWeight: '800' }}>
                        EXTRA: +{req.additional_quantity} PKT
                      </span>
                    )}
                  </div>

                  <div style={{ marginTop: '10px', fontSize: '0.813rem', fontWeight: '700', color: 'var(--primary-dark)' }}>
                    {req.product_name} ({req.variant_label})
                    <span style={{ color: 'var(--text-muted)', fontWeight: '500', marginLeft: '6px' }}>
                      Normal: {req.normal_quantity} pkt
                    </span>
                  </div>

                  {req.reason && (
                    <div style={{ marginTop: '8px', padding: '6px 10px', background: 'rgba(0,0,0,0.04)', borderRadius: '4px', fontSize: '0.78rem', color: '#334155' }}>
                      <strong>Reason:</strong> {req.reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Today's Queue Preview */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '800' }}>Today's Delivery Queue</h2>
          <button onClick={() => onNavigate('deliveries')} className="btn btn-primary btn-sm">
            View Full List
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center' }}>Loading today's deliveries...</div>
        ) : error ? (
          <div style={{ color: 'var(--accent-red)', padding: '16px' }}>{error}</div>
        ) : deliveries.length === 0 ? (
          <EmptyState
            icon={PackageCheck}
            title="No deliveries assigned for today"
            description="All active subscriptions on your route will automatically appear here."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {deliveries.slice(0, 5).map((del) => (
              <div
                key={del.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: '#f8fafc',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)'
                }}
              >
                <div>
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
                    <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>{del.customer_name}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {del.product_name_snapshot
                      ? `${del.product_name_snapshot} (${del.variant_snapshot}) × ${del.quantity} • ${del.customer_address}`
                      : `🏨 Bulk Order (Manual Daily Products) • ${del.customer_address}`}
                  </div>
                </div>
                <span className={`badge ${del.status === 'DELIVERED' ? 'badge-success' : del.status === 'SKIPPED' ? 'badge-warning' : 'badge-info'}`}>
                  {del.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
