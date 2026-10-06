import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import {
  Truck,
  PlusCircle,
  KeyRound,
  Edit2,
  Phone,
  Route,
  CheckCircle2,
  XCircle,
  RefreshCw,
  UserCheck
} from 'lucide-react';

export default function DeliveryBoysPage({ initialOpenAdd = false }) {
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setDeliveryBoys(res);
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
      } else {
        await api.post('/delivery-boys', formData);
      }

      setIsModalOpen(false);
      fetchDeliveryBoys();
    } catch (err) {
      setFormError(err.message || 'Failed to save delivery boy.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Truck size={28} color="var(--primary)" />
            Delivery Boys Management
          </h1>
          <p className="page-subtitle">Create logins, manage routes, and track delivery agents</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchDeliveryBoys} className="btn btn-outline btn-sm">
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={handleOpenAdd} className="btn btn-primary btn-sm">
            <PlusCircle size={16} /> Add Delivery Boy
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading delivery agents...</div>
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
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Agent Name</th>
                <th>Username</th>
                <th>Phone</th>
                <th>Assigned Route</th>
                <th>Assigned Customers</th>
                <th>Delivered Records</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deliveryBoys.map((dboy) => (
                <tr key={dboy.id}>
                  <td>
                    <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{dboy.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{dboy.email || 'No email provided'}</div>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--primary)' }}>
                      {dboy.username}
                    </span>
                  </td>
                  <td>{dboy.phone || 'N/A'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Route size={14} color="var(--text-muted)" />
                      <span style={{ fontWeight: '600' }}>{dboy.assigned_route || 'All Routes'}</span>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-info">{dboy.assigned_customers_count || 0} Customers</span>
                  </td>
                  <td>
                    <span style={{ fontWeight: '700' }}>{dboy.total_deliveries_count || 0}</span>
                  </td>
                  <td>
                    <span className={`badge ${dboy.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {dboy.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => handleOpenEdit(dboy)}
                      className="btn btn-outline btn-sm"
                      style={{ padding: '6px 10px' }}
                      title="Edit Agent & Credentials"
                    >
                      <Edit2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                <option value={1}>Active</option>
                <option value={0}>Deactivated (Login Disabled)</option>
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
