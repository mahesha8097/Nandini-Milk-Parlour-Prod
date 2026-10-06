import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import CustomerProfileModal from './CustomerProfileModal';
import {
  Users,
  PlusCircle,
  Search,
  Filter,
  Eye,
  Edit2,
  Phone,
  MapPin,
  Truck,
  RefreshCw,
  Home,
  Building2,
  Trash2
} from 'lucide-react';

export default function CustomersPage({ initialOpenAdd = false }) {
  const [customers, setCustomers] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(''); // '' | 'HOUSE' | 'BULK_HOTEL'
  const [billingFilter, setBillingFilter] = useState(''); // '' | 'PREPAID' | 'POSTPAID'

  // Selected for profile modal
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);

  // Add / Edit Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(initialOpenAdd);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    customer_category: 'HOUSE',
    billing_type: 'PREPAID',
    delivery_boy_id: '',
    route: '',
    notes: '',
    initial_advance: 0
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (categoryFilter) params.append('category', categoryFilter);
      if (billingFilter) params.append('billing_type', billingFilter);

      const res = await api.get(`/customers?${params.toString()}`);
      setCustomers(res);
    } catch (err) {
      setError(err.message || 'Unable to load customers.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliveryBoys = async () => {
    try {
      const res = await api.get('/delivery-boys');
      setDeliveryBoys(res);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchDeliveryBoys();
  }, [categoryFilter, billingFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchCustomers();
  };

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setFormData({
      name: '',
      phone: '',
      address: '',
      customer_category: 'HOUSE',
      billing_type: 'PREPAID',
      delivery_boy_id: '',
      route: '',
      notes: '',
      advance_balance: 0,
      initial_advance: 0
    });
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (customer) => {
    setEditingCustomer(customer);
    const adv = customer.advance_balance !== undefined ? customer.advance_balance : (customer.initial_advance || 0);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      customer_category: customer.customer_category,
      billing_type: customer.billing_type,
      delivery_boy_id: customer.delivery_boy_id || '',
      route: customer.route || '',
      notes: customer.notes || '',
      advance_balance: adv,
      initial_advance: adv
    });
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone || !formData.address) {
      setFormError('Please fill in all required fields.');
      return;
    }

    try {
      setSaving(true);
      setFormError('');

      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer.id}`, formData);
      } else {
        await api.post('/customers', formData);
      }

      setIsAddModalOpen(false);
      fetchCustomers();
    } catch (err) {
      setFormError(err.message || 'Changes were not saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomer = async (customer) => {
    if (!window.confirm(`Are you sure you want to delete "${customer.name}"? This will delete the customer profile, subscriptions, and associated history.`)) {
      return;
    }
    try {
      setLoading(true);
      await api.delete(`/customers/${customer.id}`);
      await fetchCustomers();
    } catch (err) {
      alert(err.message || 'Failed to delete customer');
      setLoading(false);
    }
  };

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Users size={28} color="var(--primary)" />
            Customers Management
          </h1>
          <p className="page-subtitle">Manage House and Bulk/Hotel customer accounts & subscriptions</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchCustomers} className="btn btn-outline btn-sm">
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={handleOpenAdd} className="btn btn-primary btn-sm">
            <PlusCircle size={16} /> Add Customer
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: '1 1 280px' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Search by customer name, phone, or address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '36px' }}
              />
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            </div>
            <button type="submit" className="btn btn-secondary btn-sm">Search</button>
          </form>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select
              className="form-select"
              style={{ width: 'auto', fontSize: '0.813rem' }}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">All Categories</option>
              <option value="HOUSE">House Customers</option>
              <option value="BULK_HOTEL">Bulk / Hotel / Restaurant</option>
            </select>

            <select
              className="form-select"
              style={{ width: 'auto', fontSize: '0.813rem' }}
              value={billingFilter}
              onChange={(e) => setBillingFilter(e.target.value)}
            >
              <option value="">All Billing Types</option>
              <option value="PREPAID">Prepaid (Advance)</option>
              <option value="POSTPAID">Postpaid</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Customers List / Table */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading customers...</div>
      ) : error ? (
        <div className="card" style={{ color: 'var(--accent-red)', padding: '24px', textAlign: 'center' }}>{error}</div>
      ) : customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers found"
          description="No customer accounts exist matching the filters."
          action={
            <button onClick={handleOpenAdd} className="btn btn-primary btn-sm">
              <PlusCircle size={16} /> Add First Customer
            </button>
          }
        />
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Category</th>
                <th>Billing</th>
                <th>Phone & Route</th>
                <th>Delivery Boy</th>
                <th>Advance Balance</th>
                <th>Pending Amount</th>
                <th>Active Subscriptions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{c.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.address}</div>
                  </td>
                  <td>
                    <span className={`badge ${c.customer_category === 'HOUSE' ? 'badge-info' : 'badge-indigo'}`}>
                      {c.customer_category === 'HOUSE' ? <Home size={12} /> : <Building2 size={12} />}
                      {c.customer_category === 'HOUSE' ? 'House' : 'Bulk / Hotel'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${c.billing_type === 'PREPAID' ? 'badge-success' : 'badge-warning'}`}>
                      {c.billing_type === 'PREPAID' ? 'Prepaid (Advance)' : 'Postpaid'}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: '600' }}>{c.phone}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Route: {c.route || 'N/A'}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.813rem', color: c.delivery_boy_name ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {c.delivery_boy_name || 'Unassigned'}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontWeight: '800', color: '#16a34a' }}>
                      ₹{c.advance_balance?.toFixed(2) || '0.00'}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: '800', color: c.pending_balance > 0 ? '#dc2626' : 'var(--text-primary)' }}>
                      ₹{c.pending_balance?.toFixed(2) || '0.00'}
                    </span>
                  </td>
                  <td>
                    {c.subscriptions && c.subscriptions.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {c.subscriptions.map((s) => (
                          <span key={s.id} style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--primary)' }}>
                            • {s.product_name} ({s.variant_label}) × {s.quantity}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No subscriptions</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => setSelectedCustomerId(c.id)}
                        className="btn btn-outline btn-sm"
                        style={{ padding: '6px 10px' }}
                        title="View Full Profile"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(c)}
                        className="btn btn-outline btn-sm"
                        style={{ padding: '6px 10px' }}
                        title="Edit Customer"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeleteCustomer(c)}
                        className="btn btn-outline btn-sm"
                        style={{ padding: '6px 10px', color: '#dc2626', borderColor: '#fca5a5' }}
                        title={`Delete Customer: ${c.name}`}
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
      )}

      {/* Customer Profile Full Modal */}
      {selectedCustomerId && (
        <CustomerProfileModal
          customerId={selectedCustomerId}
          isOpen={Boolean(selectedCustomerId)}
          onClose={() => setSelectedCustomerId(null)}
          onRefreshList={fetchCustomers}
        />
      )}

      {/* Add / Edit Customer Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingCustomer ? 'Edit Customer' : 'Add New Customer'}
      >
        <form onSubmit={handleSaveCustomer}>
          {formError && (
            <div style={{ background: 'var(--accent-red-light)', color: '#991b1b', padding: '10px', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '0.875rem' }}>
              {formError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Customer / Business Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Anand Sharma or Hotel Grand"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Phone Number *</label>
              <input
                type="tel"
                className="form-input"
                placeholder="e.g. 9876543210"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Route</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 5th Cross / Sector A"
                value={formData.route}
                onChange={(e) => setFormData({ ...formData, route: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Address *</label>
            <textarea
              className="form-textarea"
              rows={2}
              placeholder="Full delivery address..."
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Customer Category *</label>
              <select
                className="form-select"
                value={formData.customer_category}
                onChange={(e) => setFormData({ ...formData, customer_category: e.target.value })}
              >
                <option value="HOUSE">House Customer</option>
                <option value="BULK_HOTEL">Bulk / Hotel / Restaurant (₹0 Del Charge)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Billing Scheme *</label>
              <select
                className="form-select"
                value={formData.billing_type}
                onChange={(e) => setFormData({ ...formData, billing_type: e.target.value })}
              >
                <option value="PREPAID">Prepaid / Advance (Auto generated monthly)</option>
                <option value="POSTPAID">Postpaid (Based on actual deliveries)</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Assign Delivery Boy</label>
              <select
                className="form-select"
                value={formData.delivery_boy_id}
                onChange={(e) => setFormData({ ...formData, delivery_boy_id: e.target.value })}
              >
                <option value="">-- Unassigned --</option>
                {deliveryBoys.map((dboy) => (
                  <option key={dboy.id} value={dboy.id}>{dboy.name} ({dboy.assigned_route || 'All Routes'})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">
                {editingCustomer ? 'Advance Balance (₹)' : 'Opening Advance Balance (₹)'}
              </label>
              <input
                type="number"
                min="0"
                step="any"
                className="form-input"
                placeholder="0.00"
                value={formData.advance_balance !== undefined ? formData.advance_balance : (formData.initial_advance ?? 0)}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setFormData({ ...formData, advance_balance: val, initial_advance: val });
                }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes (Optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Ring bell twice / 1st floor"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
            <button type="button" onClick={() => setIsAddModalOpen(false)} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : editingCustomer ? 'Update Customer' : 'Save Customer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
