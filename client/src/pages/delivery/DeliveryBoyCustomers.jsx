import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import EmptyState from '../../components/common/EmptyState';
import { Users, Phone, MapPin, Search, RefreshCw, Calendar } from 'lucide-react';

export default function DeliveryBoyCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/customers');
      setCustomers(res);
    } catch (err) {
      setError(err.message || 'Unable to load assigned customers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const filtered = customers.filter(
    (c) =>
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.address?.toLowerCase().includes(search.toLowerCase()) ||
      c.route?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Users size={28} color="var(--primary)" />
            My Assigned Customers
          </h1>
          <p className="page-subtitle">Customers and recurring delivery schedules on your route</p>
        </div>
        <button onClick={fetchCustomers} className="btn btn-outline btn-sm">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div style={{ marginBottom: '16px', position: 'relative' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Search customer name, route, or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ paddingLeft: '38px', borderRadius: 'var(--radius-full)' }}
        />
        <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading customer directory...</div>
      ) : error ? (
        <div className="card" style={{ color: 'var(--accent-red)', padding: '20px' }}>{error}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers assigned"
          description="Your admin will assign customers and delivery routes to your account."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map((c) => (
            <div key={c.id} className="card" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: '800' }}>{c.name}</h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Route: {c.route || 'General Route'}</div>
                </div>

                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    className="btn btn-outline btn-sm"
                    style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Phone size={14} color="var(--primary)" />
                    <span>Call</span>
                  </a>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.813rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                <MapPin size={14} color="var(--text-muted)" />
                <span>{c.address}</span>
              </div>

              {/* Subscriptions badge summary */}
              {c.subscriptions && c.subscriptions.length > 0 ? (
                <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '4px' }}>DAILY SUBSCRIPTIONS:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {c.subscriptions.map((s) => (
                      <span key={s.id} className="badge badge-info">
                        {s.product_name} ({s.variant_label}) × {s.quantity}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No active recurring subscription</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
