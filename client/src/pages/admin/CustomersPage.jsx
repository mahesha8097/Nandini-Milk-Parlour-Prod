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
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(''); // '' | 'HOUSE' | 'BULK_HOTEL'
  const [billingFilter, setBillingFilter] = useState(''); // '' | 'PREPAID' | 'POSTPAID'
  const [deliveryBoyFilter, setDeliveryBoyFilter] = useState(''); // '' | dboyId
  const [zoneFilter, setZoneFilter] = useState(''); // '' | 'UNASSIGNED' | zoneId

  // Selected for profile modal
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [profileInitialTab, setProfileInitialTab] = useState('overview');

  const handleOpenProfile = (customerId, tab = 'overview') => {
    setProfileInitialTab(tab);
    setSelectedCustomerId(customerId);
  };

  // Add / Edit Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(initialOpenAdd);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    flat_no: '',
    zone_id: '',
    customer_category: 'HOUSE',
    billing_type: 'PREPAID',
    delivery_boy_id: '',
    route: '',
    notes: '',
    initial_advance: 0,
    serial_no: ''
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Create Zone modal on-the-fly state
  const [isCreateZoneModalOpen, setIsCreateZoneModalOpen] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneAddress, setNewZoneAddress] = useState('');
  const [newZoneRouteOrder, setNewZoneRouteOrder] = useState('');
  const [creatingZone, setCreatingZone] = useState(false);

  // Edit Zone modal state
  const [isEditZoneModalOpen, setIsEditZoneModalOpen] = useState(false);
  const [editZoneId, setEditZoneId] = useState(null);
  const [editZoneName, setEditZoneName] = useState('');
  const [editZoneAddress, setEditZoneAddress] = useState('');
  const [editZoneRouteOrder, setEditZoneRouteOrder] = useState('');
  const [updatingZone, setUpdatingZone] = useState(false);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (categoryFilter) params.append('category', categoryFilter);
      if (billingFilter) params.append('billing_type', billingFilter);
      if (deliveryBoyFilter) params.append('delivery_boy_id', deliveryBoyFilter);

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

  const fetchZones = async () => {
    try {
      const res = await api.get('/zones');
      setZones(res || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchDeliveryBoys();
    fetchZones();
  }, [categoryFilter, billingFilter, deliveryBoyFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchCustomers();
  };

  const handleQuickSerialUpdate = async (customerId, newSerial) => {
    try {
      const val = newSerial === '' ? 0 : parseInt(newSerial) || 0;
      await api.put(`/customers/${customerId}`, { serial_no: val });
      setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, serial_no: val } : c));
    } catch (err) {
      console.error('Failed to update serial number:', err);
    }
  };

  const handleAutoAssignSequence = async () => {
    if (customers.length === 0) return;
    const confirmMsg = deliveryBoyFilter
      ? `Auto-assign sequential drop order (1 to ${customers.length}) for the selected delivery boy's customers?`
      : `Auto-assign sequential drop order (1 to ${customers.length}) for all currently visible customers?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setLoading(true);
      const orders = customers.map((c, idx) => ({ id: c.id, serial_no: idx + 1 }));
      await api.put('/customers/reorder', { orders });
      await fetchCustomers();
    } catch (err) {
      alert(err.message || 'Failed to auto-assign serial numbers');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setFormData({
      name: '',
      phone: '',
      address: '',
      flat_no: '',
      zone_id: zoneFilter && zoneFilter !== 'UNASSIGNED' ? zoneFilter : '',
      customer_category: 'HOUSE',
      billing_type: 'PREPAID',
      delivery_boy_id: deliveryBoyFilter || '',
      route: '',
      notes: '',
      advance_balance: 0,
      initial_advance: 0,
      serial_no: customers.length > 0 ? (Math.max(...customers.map(c => c.serial_no || 0), 0) + 1) : 1
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
      flat_no: customer.flat_no || '',
      zone_id: customer.zone_id || '',
      customer_category: customer.customer_category,
      billing_type: customer.billing_type,
      delivery_boy_id: customer.delivery_boy_id || '',
      route: customer.route || '',
      notes: customer.notes || '',
      advance_balance: adv,
      initial_advance: adv,
      serial_no: customer.serial_no || ''
    });
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleCreateZoneFromCustomerModal = async (e) => {
    e.preventDefault();
    if (!newZoneName.trim()) return;
    try {
      setCreatingZone(true);
      const created = await api.post('/zones', {
        name: newZoneName.trim(),
        address: newZoneAddress.trim(),
        route_order: parseInt(newZoneRouteOrder) || 0
      });
      await fetchZones();
      setFormData(prev => ({ ...prev, zone_id: created.id }));
      setIsCreateZoneModalOpen(false);
      setNewZoneName('');
      setNewZoneAddress('');
      setNewZoneRouteOrder('');
    } catch (err) {
      alert(err.message || 'Failed to create zone');
    } finally {
      setCreatingZone(false);
    }
  };

  const handleOpenEditZoneFromCustomerModal = () => {
    const targetZone = zones.find(z => String(z.id) === String(formData.zone_id));
    if (!targetZone) return;
    setEditZoneId(targetZone.id);
    setEditZoneName(targetZone.name || '');
    setEditZoneAddress(targetZone.address || '');
    setEditZoneRouteOrder(targetZone.route_order !== undefined && targetZone.route_order !== null ? targetZone.route_order : '');
    setIsEditZoneModalOpen(true);
  };

  const handleUpdateZoneFromCustomerModal = async (e) => {
    e.preventDefault();
    if (!editZoneName.trim() || !editZoneId) return;
    try {
      setUpdatingZone(true);
      await api.put(`/zones/${editZoneId}`, {
        name: editZoneName.trim(),
        address: editZoneAddress.trim(),
        route_order: parseInt(editZoneRouteOrder, 10) || 0
      });
      await fetchZones();
      setIsEditZoneModalOpen(false);
    } catch (err) {
      alert(err.message || 'Failed to update zone');
    } finally {
      setUpdatingZone(false);
    }
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
        // Protect ledger balance: do not overwrite advance_balance during normal profile edits
        const { advance_balance, initial_advance, ...updatePayload } = formData;
        await api.put(`/customers/${editingCustomer.id}`, updatePayload);
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

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="form-select"
              style={{ width: 'auto', fontSize: '0.813rem' }}
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
            >
              <option value="">All Zones</option>
              <option value="UNASSIGNED">Unassigned Zone</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>

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

            <select
              className="form-select"
              style={{ width: 'auto', fontSize: '0.813rem' }}
              value={deliveryBoyFilter}
              onChange={(e) => setDeliveryBoyFilter(e.target.value)}
            >
              <option value="">All Delivery Boys</option>
              {deliveryBoys.map(dboy => (
                <option key={dboy.id} value={dboy.id}>
                  {dboy.name} ({dboy.assigned_route || 'All Routes'})
                </option>
              ))}
            </select>

            {customers.length > 0 && (
              <button
                type="button"
                onClick={handleAutoAssignSequence}
                className="btn btn-outline btn-sm"
                style={{
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  color: '#0054a6',
                  borderColor: '#93c5fd',
                  background: '#eff6ff'
                }}
                title="Automatically assign sequential drop numbers (1, 2, 3...) to visible customers in order"
              >
                ⚡ Auto-Sequence (1..{customers.length})
              </button>
            )}
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
        <>
          {/* Desktop Table: Completely unchanged */}
          <div className="table-container desktop-only">
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '80px', textAlign: 'center' }}>S.No / Drop #</th>
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
                {customers
                  .filter(c => {
                    if (!zoneFilter) return true;
                    if (zoneFilter === 'UNASSIGNED') return !c.zone_id;
                    return String(c.zone_id) === String(zoneFilter);
                  })
                  .map((c) => (
                  <tr key={c.id}>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          className="form-input"
                          style={{
                            width: '56px',
                            padding: '3px 4px',
                            textAlign: 'center',
                            fontWeight: '800',
                            fontSize: '0.85rem',
                            color: c.serial_no > 0 ? '#0054a6' : 'var(--text-muted)',
                            borderColor: c.serial_no > 0 ? '#93c5fd' : 'var(--border-color)',
                            background: c.serial_no > 0 ? '#f0f9ff' : '#ffffff',
                            borderRadius: '6px'
                          }}
                          defaultValue={c.serial_no || ''}
                          key={`${c.id}-${c.serial_no}`}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val !== String(c.serial_no || '')) {
                              handleQuickSerialUpdate(c.id, val);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          title="Delivery drop order number. Click to edit."
                        />
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        {c.serial_no > 0 && (
                          <span
                            style={{
                              background: '#0054a6',
                              color: '#ffffff',
                              fontWeight: '800',
                              fontSize: '0.7rem',
                              padding: '1px 6px',
                              borderRadius: '4px'
                            }}
                          >
                            #{c.serial_no}
                          </span>
                        )}
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{c.name}</div>
                        {c.flat_no && (
                          <span style={{
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            borderRadius: '4px',
                            padding: '1px 6px',
                            fontSize: '0.72rem',
                            fontWeight: '800'
                          }}>
                            Flat {c.flat_no}
                          </span>
                        )}
                        {c.zone_name && (
                          <span style={{
                            background: '#f8fafc',
                            color: '#475569',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            padding: '1px 6px',
                            fontSize: '0.72rem',
                            fontWeight: '600'
                          }}>
                            🏢 {c.zone_name}
                          </span>
                        )}
                      </div>
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
                          onClick={() => handleOpenProfile(c.id, 'overview')}
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

          {/* Mobile-Only Customer Card List */}
          <div className="mobile-only mobile-card-list">
            {customers
              .filter(c => {
                if (!zoneFilter) return true;
                if (zoneFilter === 'UNASSIGNED') return !c.zone_id;
                return String(c.zone_id) === String(zoneFilter);
              })
              .map((c) => (
                <div
                  key={c.id}
                  className="mobile-data-card"
                  onClick={() => handleOpenProfile(c.id, 'overview')}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="mobile-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {c.serial_no > 0 && (
                        <span style={{
                          background: '#0054a6',
                          color: '#ffffff',
                          fontWeight: '800',
                          fontSize: '0.72rem',
                          padding: '2px 7px',
                          borderRadius: '6px'
                        }}>
                          #{c.serial_no}
                        </span>
                      )}
                      <span className="mobile-card-title">{c.name}</span>
                      {c.flat_no && (
                        <span style={{
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid #bfdbfe',
                          borderRadius: '6px',
                          padding: '2px 7px',
                          fontSize: '0.72rem',
                          fontWeight: '800'
                        }}>
                          Flat {c.flat_no}
                        </span>
                      )}
                    </div>
                    <span className={`badge ${c.customer_category === 'HOUSE' ? 'badge-info' : 'badge-indigo'}`} style={{ flexShrink: 0 }}>
                      {c.customer_category === 'HOUSE' ? <Home size={11} /> : <Building2 size={11} />}
                      {c.customer_category === 'HOUSE' ? 'House' : 'Bulk'}
                    </span>
                  </div>

                  {c.zone_name && (
                    <div style={{ fontSize: '0.78rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>🏢 {c.zone_name}</span>
                      {c.route && <span>• Route: {c.route}</span>}
                    </div>
                  )}

                  {c.address && (
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={12} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                    <span className={`badge ${c.billing_type === 'PREPAID' ? 'badge-success' : 'badge-warning'}`}>
                      {c.billing_type === 'PREPAID' ? 'Prepaid (Advance)' : 'Postpaid'}
                    </span>

                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: '600', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Phone size={12} /> {c.phone}
                      </a>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '2px' }}>
                    <div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Advance Balance</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#16a34a' }}>₹{c.advance_balance?.toFixed(2) || '0.00'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Pending Amount</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: '800', color: c.pending_balance > 0 ? '#dc2626' : 'var(--text-primary)' }}>₹{c.pending_balance?.toFixed(2) || '0.00'}</div>
                    </div>
                  </div>

                  {c.subscriptions && c.subscriptions.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--primary-dark)', background: '#eff6ff', padding: '6px 10px', borderRadius: '6px' }}>
                      <strong>Subscribed:</strong> {c.subscriptions.map(s => `${s.product_name} (${s.quantity})`).join(', ')}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="mobile-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleOpenProfile(c.id, 'overview')}
                      className="btn btn-primary btn-sm"
                      style={{ flex: '1 1 120px', minHeight: '38px', fontSize: '0.8rem' }}
                    >
                      <Eye size={14} /> View Details
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenProfile(c.id, 'subscriptions')}
                      className="btn btn-outline btn-sm"
                      style={{ flex: '1 1 110px', minHeight: '38px', fontSize: '0.8rem', color: '#166534', borderColor: '#bbf7d0', background: '#f0fdf4' }}
                    >
                      Subscriptions ({c.subscriptions?.length || 0})
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(c)}
                      className="btn btn-outline btn-sm"
                      style={{ minHeight: '38px', padding: '6px 12px' }}
                      title="Edit Customer"
                    >
                      <Edit2 size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteCustomer(c)}
                      className="btn btn-outline btn-sm"
                      style={{ minHeight: '38px', padding: '6px 12px', color: '#dc2626', borderColor: '#fca5a5' }}
                      title="Delete Customer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      {/* Customer Profile Full Modal */}
      {selectedCustomerId && (
        <CustomerProfileModal
          customerId={selectedCustomerId}
          isOpen={Boolean(selectedCustomerId)}
          initialTab={profileInitialTab}
          onClose={() => setSelectedCustomerId(null)}
          onRefreshList={fetchCustomers}
          onEditCustomer={(cust) => handleOpenEdit(cust)}
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

          {/* Apartment / Villa Community Zone & Flat No */}
          <div className="form-row">
            <div className="form-group" style={{ flex: 1.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Apartment / Villa Zone</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {formData.zone_id && (
                    <button
                      type="button"
                      onClick={handleOpenEditZoneFromCustomerModal}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#d97706',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        padding: 0
                      }}
                      title="Edit selected zone name, address, or route order"
                    >
                      <Edit2 size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '3px' }} />
                      Edit Zone
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsCreateZoneModalOpen(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563eb',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    <PlusCircle size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '3px' }} />
                    New Zone
                  </button>
                </div>
              </div>
              <select
                className="form-select"
                style={{ marginTop: '4px' }}
                value={formData.zone_id || ''}
                onChange={(e) => setFormData({ ...formData, zone_id: e.target.value })}
              >
                <option value="">-- No Zone (Unassigned / Independent) --</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} {z.address ? `(${z.address})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Flat / House / Villa No.</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. A-102, Villa 36"
                value={formData.flat_no || ''}
                onChange={(e) => setFormData({ ...formData, flat_no: e.target.value })}
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
                {editingCustomer ? 'Current Advance Balance' : 'Opening Advance Balance (₹)'}
              </label>
              {editingCustomer ? (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: '#f8fafc',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span style={{ fontWeight: '800', color: '#16a34a', fontSize: '1rem' }}>
                    ₹{(formData.advance_balance ?? 0).toFixed(2)}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Managed via Payments & Bills
                  </span>
                </div>
              ) : (
                <>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="form-input"
                    placeholder="0.00"
                    value={formData.initial_advance ?? 0}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setFormData({ ...formData, initial_advance: val, advance_balance: val });
                    }}
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: '1.3' }}>
                    💡 For fresh payments (Cash/UPI), keep this <strong>0.00</strong> and record under <strong>Payment Collections</strong> to get an official Receipt #. Use this only for old carried-over balances.
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">
                Serial No / Delivery Drop Order
              </label>
              <input
                type="number"
                min="1"
                className="form-input"
                placeholder="e.g. 1, 2, 3..."
                value={formData.serial_no || ''}
                onChange={(e) => setFormData({ ...formData, serial_no: e.target.value === '' ? '' : parseInt(e.target.value) || 0 })}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Delivery boy sequence order (1st house, 2nd house...).
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

      {/* Create New Zone On-the-Fly Modal */}
      <Modal
        isOpen={isCreateZoneModalOpen}
        onClose={() => setIsCreateZoneModalOpen(false)}
        title="Create New Apartment / Villa Zone"
      >
        <form onSubmit={handleCreateZoneFromCustomerModal}>
          <div className="form-group">
            <label className="form-label">Apartment / Community Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Prestige Lakeside or Chaitanya Apartments"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Address / Landmark</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Varthur Main Road, Bangalore"
              value={newZoneAddress}
              onChange={(e) => setNewZoneAddress(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Route Sequence Order</label>
            <input
              type="number"
              className="form-input"
              placeholder="e.g. 1, 2, 3..."
              value={newZoneRouteOrder}
              onChange={(e) => setNewZoneRouteOrder(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setIsCreateZoneModalOpen(false)}
              className="btn btn-outline btn-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={creatingZone}
            >
              {creatingZone ? 'Saving...' : 'Create Zone'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Zone Modal */}
      <Modal
        isOpen={isEditZoneModalOpen}
        onClose={() => setIsEditZoneModalOpen(false)}
        title="Edit Apartment / Villa Zone"
      >
        <form onSubmit={handleUpdateZoneFromCustomerModal}>
          <div className="form-group">
            <label className="form-label">Apartment / Community Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Prestige Lakeside or Chaitanya Apartments"
              value={editZoneName}
              onChange={(e) => setEditZoneName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Address / Landmark</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Varthur Main Road, Bangalore"
              value={editZoneAddress}
              onChange={(e) => setEditZoneAddress(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Route Sequence Order</label>
            <input
              type="number"
              className="form-input"
              placeholder="e.g. 1, 2, 3..."
              value={editZoneRouteOrder}
              onChange={(e) => setEditZoneRouteOrder(e.target.value)}
            />
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '4px' }}>
              Determines stop order (1st stop, 2nd stop...) on delivery lists and daily route screens.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setIsEditZoneModalOpen(false)}
              className="btn btn-outline btn-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={updatingZone}
            >
              {updatingZone ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
