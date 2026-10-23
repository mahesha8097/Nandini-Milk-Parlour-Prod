import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import {
  Truck,
  PlusCircle,
  KeyRound,
  Edit2,
  Trash2,
  Phone,
  Route,
  CheckCircle2,
  XCircle,
  RefreshCw,
  UserCheck,
  UserX,
  Power,
  Search,
  AlertCircle,
  CheckCircle,
  X,
  Users
} from 'lucide-react';

export default function DeliveryBoysPage({ initialOpenAdd = false }) {
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadingActionId, setLoadingActionId] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, ACTIVE, INACTIVE

  // Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(initialOpenAdd);
  const [editingDboy, setEditingDboy] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    phone: '',
    email: '',
    assigned_route: '',
    is_active: 1
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchDeliveryBoys = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/delivery-boys');
      setDeliveryBoys(res || []);
    } catch (err) {
      setError(err.message || 'Unable to load delivery boys.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveryBoys();
  }, []);

  const handleOpenAdd = () => {
    setEditingDboy(null);
    setFormData({
      name: '',
      username: '',
      password: '',
      phone: '',
      email: '',
      assigned_route: '',
      is_active: 1
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (dboy) => {
    setEditingDboy(dboy);
    setFormData({
      name: dboy.name,
      username: dboy.username,
      password: '', // blank unless updating
      phone: dboy.phone || '',
      email: dboy.email || '',
      assigned_route: dboy.assigned_route || '',
      is_active: dboy.is_active
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleToggleStatus = async (dboy) => {
    try {
      setLoadingActionId(dboy.id);
      const res = await api.patch(`/delivery-boys/${dboy.id}/status`);
      setMessage({
        type: 'success',
        text: res.message || `${dboy.name} is now ${dboy.is_active ? 'Inactive' : 'Active'}`
      });
      fetchDeliveryBoys();
    } catch (err) {
      console.error('Toggle status error:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to update delivery boy status' });
    } finally {
      setLoadingActionId(null);
    }
  };

  const handleDeleteDboy = async (dboy) => {
    if (
      !window.confirm(
        `Are you sure you want to delete delivery boy "${dboy.name}" (@${dboy.username})?\n\nThis will permanently delete their account and unassign their routes and customers.`
      )
    ) {
      return;
    }

    try {
      setLoadingActionId(dboy.id);
      const res = await api.delete(`/delivery-boys/${dboy.id}`);
      setMessage({
        type: 'success',
        text: res.message || `Delivery boy ${dboy.name} deleted successfully.`
      });
      fetchDeliveryBoys();
    } catch (err) {
      console.error('Delete delivery boy error:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to delete delivery boy' });
    } finally {
      setLoadingActionId(null);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.username) {
      setFormError('Name and Username are required.');
      return;
    }

    if (!editingDboy && !formData.password) {
      setFormError('Initial password is required.');
      return;
    }

    try {
      setSaving(true);
      setFormError('');

      if (editingDboy) {
        await api.put(`/delivery-boys/${editingDboy.id}`, {
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          assigned_route: formData.assigned_route,
          is_active: formData.is_active,
          newPassword: formData.password || undefined
        });
        setMessage({ type: 'success', text: `Delivery boy "${formData.name}" updated successfully.` });
      } else {
        await api.post('/delivery-boys', formData);
        setMessage({ type: 'success', text: `Delivery boy "${formData.name}" created successfully.` });
      }

      setIsModalOpen(false);
      fetchDeliveryBoys();
    } catch (err) {
      setFormError(err.message || 'Failed to save delivery boy.');
    } finally {
      setSaving(false);
    }
  };

  // Filtered Delivery Boys
  const filteredBoys = deliveryBoys.filter((dboy) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      (dboy.name || '').toLowerCase().includes(q) ||
      (dboy.username || '').toLowerCase().includes(q) ||
      (dboy.phone || '').includes(q) ||
      (dboy.assigned_route || '').toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && Boolean(dboy.is_active)) ||
      (statusFilter === 'INACTIVE' && !Boolean(dboy.is_active));

    return matchesSearch && matchesStatus;
  });

  const activeCount = deliveryBoys.filter((b) => Boolean(b.is_active)).length;
  const inactiveCount = deliveryBoys.filter((b) => !Boolean(b.is_active)).length;

  return (
    <div className="page-wrapper" style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Alert Notification */}
      {message.text && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: message.type === 'error' ? '#fef2f2' : '#f0fdf4',
            color: message.type === 'error' ? '#991b1b' : '#166534',
            border: `1px solid ${message.type === 'error' ? '#fecaca' : '#bbf7d0'}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            <span style={{ fontSize: '14px', fontWeight: 500 }}>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage({ type: '', text: '' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <Truck size={28} color="var(--primary)" />
            Delivery Boys Management
          </h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px', marginBottom: 0 }}>
            Create logins, manage active status, assign routes, and track delivery agents.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={fetchDeliveryBoys} className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={handleOpenAdd} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <PlusCircle size={16} /> Add Delivery Boy
          </button>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div style={{ background: 'var(--bg-surface)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Agents</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>{deliveryBoys.length}</div>
          </div>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
            <Users size={20} />
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active Agents</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a', marginTop: '2px' }}>{activeCount}</div>
          </div>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
            <UserCheck size={20} />
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Inactive / Deactivated</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626', marginTop: '2px' }}>{inactiveCount}</div>
          </div>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
            <UserX size={20} />
          </div>
        </div>
      </div>

      {/* Toolbar: Search and Filter Pills */}
      <div
        style={{
          background: 'var(--bg-surface)',
          padding: '14px 18px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '14px',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: '260px', maxWidth: '420px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-control"
            placeholder="Search delivery boy by name, username, phone, or route..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '36px', borderRadius: '8px', width: '100%' }}
          />
        </div>

        {/* Status Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {[
            { id: 'ALL', label: `All (${deliveryBoys.length})` },
            { id: 'ACTIVE', label: `Active (${activeCount})` },
            { id: 'INACTIVE', label: `Inactive (${inactiveCount})` }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                border: statusFilter === tab.id ? 'none' : '1px solid var(--border-color)',
                background:
                  statusFilter === tab.id
                    ? tab.id === 'ACTIVE'
                      ? '#16a34a'
                      : tab.id === 'INACTIVE'
                      ? '#dc2626'
                      : 'var(--primary)'
                    : 'transparent',
                color: statusFilter === tab.id ? '#fff' : 'var(--text-secondary)'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
          Loading delivery agents...
        </div>
      ) : error ? (
        <div className="card" style={{ color: 'var(--accent-red)', padding: '24px', textAlign: 'center' }}>{error}</div>
      ) : deliveryBoys.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No delivery boys created yet"
          description="Only administrators can create delivery agent logins. Click Add Delivery Boy to create an account."
          action={
            <button onClick={handleOpenAdd} className="btn btn-primary btn-sm">
              <PlusCircle size={16} /> Add First Delivery Boy
            </button>
          }
        />
      ) : filteredBoys.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <Truck size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
          <p style={{ margin: 0, fontWeight: 500 }}>No delivery boys match your search filter</p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="table-container desktop-only" style={{ background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '12px 16px' }}>Agent Name</th>
                  <th style={{ padding: '12px 16px' }}>Username</th>
                  <th style={{ padding: '12px 16px' }}>Phone</th>
                  <th style={{ padding: '12px 16px' }}>Assigned Route</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Assigned Customers</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Delivered</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBoys.map((dboy) => (
                  <tr
                    key={dboy.id}
                    style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{dboy.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{dboy.email || 'No email provided'}</div>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--primary)', background: '#f1f5f9', padding: '2px 8px', borderRadius: '6px' }}>
                        @{dboy.username}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      {dboy.phone ? (
                        <a
                          href={`tel:${dboy.phone}`}
                          style={{ color: 'var(--text-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}
                        >
                          <Phone size={13} color="var(--text-muted)" /> {dboy.phone}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                      )}
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Route size={14} color="var(--primary)" />
                        <span style={{ fontWeight: '600' }}>{dboy.assigned_route || 'All Routes'}</span>
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <span className="badge badge-info" style={{ fontWeight: 600 }}>{dboy.assigned_customers_count || 0} Customers</span>
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700' }}>
                      {dboy.total_deliveries_count || 0}
                    </td>

                    {/* Status Column with Interactive Badge */}
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(dboy)}
                        disabled={loadingActionId === dboy.id}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0
                        }}
                        title={`Click to ${dboy.is_active ? 'deactivate' : 'activate'} login`}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 10px',
                            borderRadius: '16px',
                            fontSize: '12px',
                            fontWeight: 700,
                            background: dboy.is_active ? '#dcfce7' : '#fee2e2',
                            color: dboy.is_active ? '#166534' : '#991b1b',
                            border: `1px solid ${dboy.is_active ? '#bbf7d0' : '#fecaca'}`,
                            cursor: 'pointer'
                          }}
                        >
                          {dboy.is_active ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                          {dboy.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </button>
                    </td>

                    {/* Actions Column */}
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        {/* Status Toggle Icon Button */}
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(dboy)}
                          disabled={loadingActionId === dboy.id}
                          className="btn btn-outline btn-sm"
                          style={{
                            padding: '6px 8px',
                            color: dboy.is_active ? '#d97706' : '#16a34a',
                            borderColor: dboy.is_active ? '#fde68a' : '#bbf7d0',
                            background: dboy.is_active ? '#fffbeb' : '#f0fdf4'
                          }}
                          title={dboy.is_active ? 'Click to Deactivate' : 'Click to Activate'}
                        >
                          <Power size={14} />
                        </button>

                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(dboy)}
                          className="btn btn-outline btn-sm"
                          style={{ padding: '6px 8px', color: '#2563eb', borderColor: '#bfdbfe', background: '#eff6ff' }}
                          title="Edit Agent & Credentials"
                        >
                          <Edit2 size={14} />
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteDboy(dboy)}
                          disabled={loadingActionId === dboy.id}
                          className="btn btn-outline btn-sm"
                          style={{ padding: '6px 8px', color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                          title="Delete Delivery Boy"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile-Only Delivery Boy Cards */}
          <div className="mobile-only mobile-card-list">
            {filteredBoys.map((dboy) => (
              <div key={dboy.id} className="mobile-data-card" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
                <div className="mobile-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <h3 className="mobile-card-title" style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{dboy.name}</h3>
                    <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '700', fontFamily: 'monospace', marginTop: '2px' }}>
                      @{dboy.username}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(dboy)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: dboy.is_active ? '#dcfce7' : '#fee2e2',
                        color: dboy.is_active ? '#166534' : '#991b1b',
                        border: `1px solid ${dboy.is_active ? '#bbf7d0' : '#fecaca'}`
                      }}
                    >
                      {dboy.is_active ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                      {dboy.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </button>
                </div>

                <div className="mobile-card-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                  <span className="mobile-card-row-label" style={{ color: 'var(--text-muted)' }}>Phone</span>
                  {dboy.phone ? (
                    <a
                      href={`tel:${dboy.phone}`}
                      style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Phone size={13} /> {dboy.phone}
                    </a>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                  )}
                </div>

                <div className="mobile-card-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                  <span className="mobile-card-row-label" style={{ color: 'var(--text-muted)' }}>Assigned Route</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '700', color: 'var(--text-primary)' }}>
                    <Route size={14} color="var(--primary)" />
                    <span>{dboy.assigned_route || 'All Routes'}</span>
                  </div>
                </div>

                <div className="mobile-card-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '12px' }}>
                  <span className="mobile-card-row-label" style={{ color: 'var(--text-muted)' }}>Customers / Records</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <span className="badge badge-info">{dboy.assigned_customers_count || 0} Customers</span>
                    <span className="badge badge-gray">{dboy.total_deliveries_count || 0} Delivered</span>
                  </div>
                </div>

                <div className="mobile-card-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(dboy)}
                    disabled={loadingActionId === dboy.id}
                    className="btn btn-outline btn-sm"
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      color: dboy.is_active ? '#d97706' : '#16a34a'
                    }}
                  >
                    <Power size={13} /> {dboy.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(dboy)}
                    className="btn btn-outline btn-sm"
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      color: '#2563eb'
                    }}
                  >
                    <Edit2 size={13} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteDboy(dboy)}
                    disabled={loadingActionId === dboy.id}
                    className="btn btn-outline btn-sm"
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      color: '#dc2626',
                      background: '#fef2f2',
                      borderColor: '#fca5a5'
                    }}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingDboy ? `Edit Delivery Boy: ${editingDboy.name}` : 'Add Delivery Boy'}
      >
        <form onSubmit={handleSave}>
          {formError && (
            <div style={{ background: 'var(--accent-red-light)', color: '#991b1b', padding: '10px', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '0.875rem' }}>
              {formError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Full Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Suresh Gowda"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Login Username *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. suresh_delivery"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                disabled={Boolean(editingDboy)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                {editingDboy ? 'New Password (leave blank to keep)' : 'Initial Password *'}
              </label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required={!editingDboy}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                className="form-input"
                placeholder="e.g. 9887766554"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Assigned Route</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Sector 1 to 4 / North Road"
                value={formData.assigned_route}
                onChange={(e) => setFormData({ ...formData, assigned_route: e.target.value })}
              />
            </div>
          </div>

          {editingDboy && (
            <div className="form-group">
              <label className="form-label">Account Status</label>
              <select
                className="form-select"
                value={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: parseInt(e.target.value) })}
              >
                <option value={1}>Active (Login Enabled)</option>
                <option value={0}>Inactive (Login Disabled)</option>
              </select>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : editingDboy ? 'Update Delivery Boy' : 'Create Delivery Boy'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
