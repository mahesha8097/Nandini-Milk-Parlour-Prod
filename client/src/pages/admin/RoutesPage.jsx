import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import CustomerProfileModal from './CustomerProfileModal';
import {
  Route as RouteIcon,
  Building2,
  Users,
  Truck,
  PlusCircle,
  Search,
  MapPin,
  RefreshCw,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Phone,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  Layers,
  ArrowRight,
  Plus,
  X,
  UserCheck,
  ArrowRightLeft
} from 'lucide-react';

export default function RoutesPage({ onNavigate }) {
  const [routes, setRoutes] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE'
  const [assignmentFilter, setAssignmentFilter] = useState('ALL'); // 'ALL' | 'ASSIGNED' | 'UNASSIGNED'

  // Route Detail / Manage View
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedRouteDetail, setSelectedRouteDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Expanded Zone for Customers View inside Route Details
  const [expandedZoneId, setExpandedZoneId] = useState(null);
  const [zoneCustomers, setZoneCustomers] = useState({});
  const [loadingZoneCustomers, setLoadingZoneCustomers] = useState(false);

  // Customer Profile Modal
  const [profileCustomerId, setProfileCustomerId] = useState(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddZonesModalOpen, setIsAddZonesModalOpen] = useState(false);
  const [isAssignDboyModalOpen, setIsAssignDboyModalOpen] = useState(false);

  // Form states
  const [createForm, setCreateForm] = useState({ name: '', description: '', delivery_boy_id: '', status: 'ACTIVE' });
  const [editForm, setEditForm] = useState({ id: null, name: '', description: '', delivery_boy_id: '', status: 'ACTIVE' });
  const [selectedZoneIdsToAdd, setSelectedZoneIdsToAdd] = useState([]);
  const [zoneAddSearch, setZoneAddSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Shift Customer Zone Modal State
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [customerToShift, setCustomerToShift] = useState(null);
  const [currentZoneOfCustomer, setCurrentZoneOfCustomer] = useState(null);
  const [targetShiftZoneId, setTargetShiftZoneId] = useState('');
  const [shiftZoneSearch, setShiftZoneSearch] = useState('');
  const [allParlourZones, setAllParlourZones] = useState([]);
  const [shiftingCustomer, setShiftingCustomer] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Fetch routes list & delivery boys
  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const [routesData, dboysData] = await Promise.all([
        api.get('/routes'),
        api.get('/delivery-boys').catch(() => [])
      ]);
      setRoutes(routesData || []);
      setDeliveryBoys(dboysData || []);
    } catch (err) {
      console.error('Fetch routes error:', err);
      setError(err.message || 'Failed to load routes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch route details when selectedRouteId changes
  const fetchRouteDetail = async (routeId) => {
    if (!routeId) return;
    try {
      setDetailLoading(true);
      const detail = await api.get(`/routes/${routeId}`);
      setSelectedRouteDetail(detail);
    } catch (err) {
      console.error('Fetch route detail error:', err);
      showToast(err.message || 'Failed to load route details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleOpenRoute = (routeId) => {
    setSelectedRouteId(routeId);
    setExpandedZoneId(null);
    fetchRouteDetail(routeId);
  };

  const handleCloseRoute = () => {
    setSelectedRouteId(null);
    setSelectedRouteDetail(null);
    setExpandedZoneId(null);
    fetchData(); // refresh list counts
  };

  // Load customers for a zone
  const toggleZoneCustomers = async (zoneId) => {
    if (expandedZoneId === zoneId) {
      setExpandedZoneId(null);
      return;
    }
    setExpandedZoneId(zoneId);
    if (!zoneCustomers[zoneId]) {
      try {
        setLoadingZoneCustomers(true);
        const res = await api.get('/customers', { params: { zone_id: zoneId } });
        const filtered = Array.isArray(res) ? res.filter(c => String(c.zone_id) === String(zoneId)) : [];
        setZoneCustomers(prev => ({ ...prev, [zoneId]: filtered }));
      } catch (err) {
        console.error('Fetch zone customers error:', err);
      } finally {
        setLoadingZoneCustomers(false);
      }
    }
  };

  // Open Shift Zone Modal for a customer
  const handleOpenShiftZoneModal = async (customer, zone) => {
    setCustomerToShift(customer);
    setCurrentZoneOfCustomer(zone);
    setTargetShiftZoneId('');
    setShiftModalOpen(true);
    try {
      const zList = await api.get('/zones');
      setAllParlourZones(zList || []);
    } catch (e) {
      console.error('Failed to load zones for shift:', e);
    }
  };

  // Confirm shifting customer to target zone
  const handleConfirmShiftZone = async (e) => {
    e.preventDefault();
    if (!customerToShift || !targetShiftZoneId) return;
    try {
      setShiftingCustomer(true);
      await api.put(`/customers/${customerToShift.id}`, {
        zone_id: parseInt(targetShiftZoneId, 10)
      });
      showToast(`Shifted "${customerToShift.name}" to new zone successfully!`);
      setShiftModalOpen(false);

      // Refresh current route detail & zone customers
      if (selectedRouteId) {
        await fetchRouteDetail(selectedRouteId);
      }
      if (expandedZoneId) {
        const res = await api.get('/customers', { params: { zone_id: expandedZoneId } });
        const filtered = Array.isArray(res) ? res.filter(c => String(c.zone_id) === String(expandedZoneId)) : [];
        setZoneCustomers(prev => ({ ...prev, [expandedZoneId]: filtered }));
      }
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to shift customer zone');
    } finally {
      setShiftingCustomer(false);
    }
  };

  // Create Route
  const handleCreateRoute = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    try {
      setSubmitting(true);
      const created = await api.post('/routes', {
        name: createForm.name.trim(),
        description: createForm.description.trim() || null,
        delivery_boy_id: createForm.delivery_boy_id ? parseInt(createForm.delivery_boy_id, 10) : null,
        status: createForm.status
      });
      setIsCreateModalOpen(false);
      setCreateForm({ name: '', description: '', delivery_boy_id: '', status: 'ACTIVE' });
      showToast(`Route "${created.name}" created successfully!`);
      await fetchData();
      handleOpenRoute(created.id);
    } catch (err) {
      alert(err.message || 'Failed to create route');
    } finally {
      setSubmitting(false);
    }
  };

  // Edit Route
  const handleOpenEditModal = (route) => {
    setEditForm({
      id: route.id,
      name: route.name,
      description: route.description || '',
      delivery_boy_id: route.delivery_boy_id || '',
      status: route.status || 'ACTIVE'
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEditRoute = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim()) return;
    try {
      setSubmitting(true);
      const updated = await api.put(`/routes/${editForm.id}`, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        delivery_boy_id: editForm.delivery_boy_id ? parseInt(editForm.delivery_boy_id, 10) : null,
        status: editForm.status
      });
      setIsEditModalOpen(false);
      showToast(`Route "${updated.name}" updated successfully!`);
      await fetchData();
      if (selectedRouteId === updated.id) {
        await fetchRouteDetail(updated.id);
      }
    } catch (err) {
      alert(err.message || 'Failed to update route');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Route
  const handleDeleteRoute = async (route, e) => {
    if (e) e.stopPropagation();
    if (!route) return;

    const confirmMsg = `Are you sure you want to delete "${route.name}"?\n\nAny attached zones will safely become unassigned, and no customers or delivery history will be lost.`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      setSubmitting(true);
      await api.delete(`/routes/${route.id}`);
      showToast(`Route "${route.name}" deleted successfully.`);
      if (selectedRouteId === route.id) {
        setSelectedRouteId(null);
        setSelectedRouteDetail(null);
      }
      await fetchData();
    } catch (err) {
      console.error('Delete route error:', err);
      alert(err.message || 'Failed to delete route');
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Delivery Boy Assignment
  const handleAssignDeliveryBoy = async (deliveryBoyId) => {
    if (!selectedRouteDetail?.route) return;
    try {
      setSubmitting(true);
      const dboyId = deliveryBoyId ? parseInt(deliveryBoyId, 10) : null;
      await api.put(`/routes/${selectedRouteDetail.route.id}`, {
        delivery_boy_id: dboyId
      });
      showToast('Delivery boy assignment updated!');
      await fetchRouteDetail(selectedRouteDetail.route.id);
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to update delivery boy');
    } finally {
      setSubmitting(false);
    }
  };

  // Add Zones to Route
  const handleAddZonesSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRouteDetail?.route || selectedZoneIdsToAdd.length === 0) return;
    try {
      setSubmitting(true);
      const res = await api.post(`/routes/${selectedRouteDetail.route.id}/zones`, {
        zone_ids: selectedZoneIdsToAdd,
        force: true
      });
      setIsAddZonesModalOpen(false);
      setSelectedZoneIdsToAdd([]);
      showToast(res.message || 'Zones added to route successfully!');
      await fetchRouteDetail(selectedRouteDetail.route.id);
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to add zones');
    } finally {
      setSubmitting(false);
    }
  };

  // Remove Zone from Route (Safe unlink)
  const handleRemoveZone = async (zoneId, zoneName) => {
    if (!window.confirm(`Are you sure you want to remove "${zoneName}" from this route? The zone, its customers, and delivery history will NOT be deleted.`)) {
      return;
    }
    try {
      setSubmitting(true);
      await api.delete(`/routes/${selectedRouteDetail.route.id}/zones/${zoneId}`);
      showToast(`Zone "${zoneName}" removed from route.`);
      await fetchRouteDetail(selectedRouteDetail.route.id);
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to remove zone from route');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle Route Status (Active/Inactive)
  const handleToggleRouteStatus = async (route, e) => {
    if (e) e.stopPropagation();
    const newStatus = route.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.put(`/routes/${route.id}`, { status: newStatus });
      showToast(`Route marked as ${newStatus}`);
      await fetchData();
      if (selectedRouteId === route.id) {
        await fetchRouteDetail(route.id);
      }
    } catch (err) {
      alert(err.message || 'Failed to update route status');
    }
  };

  // Filtered routes
  const filteredRoutes = useMemo(() => {
    return routes.filter(r => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q ||
        r.name?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.delivery_boy_name?.toLowerCase().includes(q);

      // Status
      const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;

      // Assignment
      const matchAssignment = assignmentFilter === 'ALL' ||
        (assignmentFilter === 'ASSIGNED' && r.delivery_boy_id) ||
        (assignmentFilter === 'UNASSIGNED' && !r.delivery_boy_id);

      return matchSearch && matchStatus && matchAssignment;
    });
  }, [routes, searchQuery, statusFilter, assignmentFilter]);

  // Overall Stats
  const stats = useMemo(() => {
    const total = routes.length;
    const active = routes.filter(r => r.status === 'ACTIVE').length;
    const assigned = routes.filter(r => r.delivery_boy_id).length;
    const unassigned = total - assigned;
    const totalZones = routes.reduce((sum, r) => sum + (parseInt(r.zone_count, 10) || 0), 0);
    const totalCustomers = routes.reduce((sum, r) => sum + (parseInt(r.customer_count, 10) || 0), 0);
    return { total, active, assigned, unassigned, totalZones, totalCustomers };
  }, [routes]);

  return (
    <div className="page-container" style={{ padding: '24px 20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          background: '#0f172a',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '10px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.875rem',
          fontWeight: '600',
          borderLeft: '4px solid #10b981'
        }}>
          <Sparkles size={18} color="#10b981" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'var(--primary-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 4px 12px rgba(37,99,235,0.25)'
          }}>
            <RouteIcon size={26} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-main)', letterSpacing: '-0.02em' }}>
              Route Management
            </h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: '500' }}>
              Distribution Hierarchy: <strong>Routes → Zones → Customers → Daily Deliveries</strong>
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={fetchData}
            disabled={loading}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px' }}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px', fontWeight: '700' }}
          >
            <PlusCircle size={18} />
            <span>Create Route</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px',
        marginBottom: '24px'
      }}>
        <div className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
            <RouteIcon size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Routes</div>
            <div style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--text-main)' }}>
              {stats.total} <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#16a34a' }}>({stats.active} Active)</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
            <Truck size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Assigned Routes</div>
            <div style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--text-main)' }}>
              {stats.assigned} <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#ea580c' }}>({stats.unassigned} Unassigned)</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#faf5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9333ea' }}>
            <Building2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Zones</div>
            <div style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--text-main)' }}>{stats.totalZones}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea580c' }}>
            <Users size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Customers</div>
            <div style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--text-main)' }}>{stats.totalCustomers}</div>
          </div>
        </div>
      </div>

      {/* If a Route is opened -> Show Route Details Screen */}
      {selectedRouteId && selectedRouteDetail ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Breadcrumb / Back button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleCloseRoute}
              className="btn btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px' }}
            >
              <ChevronLeft size={18} />
              <span>Back to All Routes</span>
            </button>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>/</span>
            <span style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-main)' }}>
              {selectedRouteDetail.route.name}
            </span>
          </div>

          {/* Route Info & Primary Actions Banner */}
          <div className="card" style={{ padding: '24px', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-main)' }}>
                    {selectedRouteDetail.route.name}
                  </h2>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    background: selectedRouteDetail.route.status === 'ACTIVE' ? '#dcfce7' : '#f1f5f9',
                    color: selectedRouteDetail.route.status === 'ACTIVE' ? '#15803d' : '#64748b'
                  }}>
                    {selectedRouteDetail.route.status}
                  </span>
                </div>
                {selectedRouteDetail.route.description && (
                  <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    {selectedRouteDetail.route.description}
                  </p>
                )}
              </div>

              {/* Delivery Boy Assignment Quick Dropdown */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: '#ffffff',
                padding: '10px 16px',
                borderRadius: '12px',
                border: '1.5px solid #e2e8f0',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
              }}>
                <Truck size={20} color="#2563eb" />
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Assigned Delivery Boy
                  </div>
                  <select
                    value={selectedRouteDetail.route.delivery_boy_id || ''}
                    onChange={(e) => handleAssignDeliveryBoy(e.target.value)}
                    disabled={submitting}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontWeight: '700',
                      fontSize: '0.875rem',
                      color: selectedRouteDetail.route.delivery_boy_id ? 'var(--text-main)' : '#ea580c',
                      cursor: 'pointer',
                      outline: 'none',
                      padding: '2px 0'
                    }}
                  >
                    <option value="">(No Delivery Boy - Unassigned)</option>
                    {deliveryBoys.map(dboy => (
                      <option key={dboy.id} value={dboy.id}>
                        {dboy.name} ({dboy.phone || 'No phone'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Edit route details */}
                <button
                  onClick={() => handleOpenEditModal(selectedRouteDetail.route)}
                  className="btn btn-outline"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px' }}
                >
                  <Edit2 size={16} />
                  <span>Edit Route</span>
                </button>

                {/* Delete route */}
                <button
                  onClick={() => handleDeleteRoute(selectedRouteDetail.route)}
                  className="btn btn-outline"
                  title="Delete Route"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    color: '#dc2626',
                    borderColor: '#fca5a5',
                    background: '#ffffff'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#fef2f2';
                    e.currentTarget.style.borderColor = '#f87171';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#ffffff';
                    e.currentTarget.style.borderColor = '#fca5a5';
                  }}
                >
                  <Trash2 size={16} />
                  <span>Delete Route</span>
                </button>
              </div>
            </div>
          </div>

          {/* Zones Management inside this Route */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '14px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Building2 size={20} color="#2563eb" />
                  <span>Zones in this Route ({selectedRouteDetail.zones?.length || 0})</span>
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.813rem', color: 'var(--text-muted)' }}>
                  Delivery boys assigned to this route will handle deliveries for all customers in these zones.
                </p>
              </div>

              <button
                onClick={() => {
                  setSelectedZoneIdsToAdd([]);
                  setIsAddZonesModalOpen(true);
                }}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: '700' }}
              >
                <Plus size={18} />
                <span>Add Zones to Route</span>
              </button>
            </div>

            {/* List of Zones */}
            {selectedRouteDetail.zones?.length === 0 ? (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                background: '#f8fafc',
                borderRadius: '12px',
                border: '1.5px dashed #cbd5e1'
              }}>
                <Building2 size={40} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
                <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)' }}>
                  No Zones in this Route Yet
                </h4>
                <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Add existing zones to link apartments, villas, and customers to this delivery route.
                </p>
                <button
                  onClick={() => {
                    setSelectedZoneIdsToAdd([]);
                    setIsAddZonesModalOpen(true);
                  }}
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  <Plus size={16} />
                  <span>Add Zones Now</span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {selectedRouteDetail.zones.map((zone, idx) => (
                  <div
                    key={zone.id}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      background: '#ffffff'
                    }}
                  >
                    {/* Zone Row Header */}
                    <div style={{
                      padding: '16px 20px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      background: expandedZoneId === zone.id ? '#f8fafc' : '#ffffff',
                      borderBottom: expandedZoneId === zone.id ? '1px solid #e2e8f0' : 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          background: '#eff6ff',
                          color: '#2563eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '800',
                          fontSize: '0.875rem'
                        }}>
                          {idx + 1}
                        </div>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-main)' }}>
                            {zone.name}
                          </div>
                          {zone.address && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <MapPin size={12} />
                              <span>{zone.address}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: '#f1f5f9',
                          fontSize: '0.813rem',
                          fontWeight: '700',
                          color: 'var(--text-main)'
                        }}>
                          <Users size={14} color="#64748b" />
                          <span>{zone.customer_count || 0} Customers</span>
                        </div>

                        <button
                          onClick={() => toggleZoneCustomers(zone.id)}
                          className="btn btn-outline"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            fontSize: '0.813rem',
                            fontWeight: '600'
                          }}
                        >
                          <Eye size={14} />
                          <span>{expandedZoneId === zone.id ? 'Hide Customers' : 'View Customers'}</span>
                        </button>

                        <button
                          onClick={() => handleRemoveZone(zone.id, zone.name)}
                          disabled={submitting}
                          title="Remove zone from this route"
                          style={{
                            border: '1px solid rgba(239,68,68,0.2)',
                            background: 'rgba(239,68,68,0.06)',
                            color: '#ef4444',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.813rem',
                            fontWeight: '600'
                          }}
                        >
                          <X size={14} />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>

                    {/* Zone Customers Accordion */}
                    {expandedZoneId === zone.id && (() => {
                      const currentZoneCusts = (zoneCustomers[zone.id] || []).filter(c => String(c.zone_id) === String(zone.id));
                      return (
                        <div style={{ padding: '16px 20px', background: '#fafbfc' }}>
                          {loadingZoneCustomers ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                              <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                              <div>Loading customers in {zone.name}...</div>
                            </div>
                          ) : currentZoneCusts.length === 0 ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                              No active customers assigned to {zone.name} yet.
                            </div>
                          ) : (
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                              gap: '12px'
                            }}>
                              {currentZoneCusts.map(cust => (
                              <div
                                key={cust.id}
                                style={{
                                  background: '#ffffff',
                                  padding: '12px 14px',
                                  borderRadius: '10px',
                                  border: '1px solid #e2e8f0',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '6px'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ fontWeight: '700', fontSize: '0.875rem', color: 'var(--text-main)' }}>
                                    {cust.name}
                                  </div>
                                  <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: '700',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: cust.customer_category === 'BULK_HOTEL' ? '#fef3c7' : '#eff6ff',
                                    color: cust.customer_category === 'BULK_HOTEL' ? '#b45309' : '#1d4ed8'
                                  }}>
                                    {cust.customer_category === 'BULK_HOTEL' ? 'BULK' : 'HOUSE'}
                                  </span>
                                </div>

                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Phone size={12} />
                                  <span>{cust.phone}</span>
                                  {cust.flat_no && (
                                    <>
                                      <span>•</span>
                                      <span>Flat: <strong>{cust.flat_no}</strong></span>
                                    </>
                                  )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    Seq #{cust.serial_no || '0'}
                                  </span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenShiftZoneModal(cust, zone)}
                                      className="btn btn-outline"
                                      style={{
                                        padding: '2px 8px',
                                        fontSize: '0.75rem',
                                        fontWeight: '700',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        color: '#2563eb',
                                        borderColor: '#bfdbfe',
                                        background: '#eff6ff'
                                      }}
                                      title={`Shift ${cust.name} to another zone`}
                                    >
                                      <ArrowRightLeft size={12} />
                                      <span>Shift Zone</span>
                                    </button>
                                    <button
                                      onClick={() => setProfileCustomerId(cust.id)}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#2563eb',
                                        fontWeight: '600',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        padding: '2px 4px'
                                      }}
                                    >
                                      View Details →
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Routes List View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Search & Filters Bar */}
          <div className="card" style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 300px' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
                <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search routes or delivery boys..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 38px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: 'var(--text-main)',
                  background: '#ffffff'
                }}
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active Only</option>
                <option value="INACTIVE">Inactive Only</option>
              </select>

              {/* Assignment Filter */}
              <select
                value={assignmentFilter}
                onChange={(e) => setAssignmentFilter(e.target.value)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: 'var(--text-main)',
                  background: '#ffffff'
                }}
              >
                <option value="ALL">All Assignments</option>
                <option value="ASSIGNED">Assigned Only</option>
                <option value="UNASSIGNED">Unassigned Only</option>
              </select>
            </div>
          </div>

          {/* Routes Grid / Cards */}
          {loading ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={28} className="spin" style={{ margin: '0 auto 12px' }} />
              <div>Loading routes...</div>
            </div>
          ) : filteredRoutes.length === 0 ? (
            <EmptyState
              icon={RouteIcon}
              title="No routes found"
              description={searchQuery ? "No routes match your search criteria." : "Create your first route to start organizing zones and delivery assignments."}
              action={
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}
                >
                  <PlusCircle size={18} />
                  <span>Create First Route</span>
                </button>
              }
            />
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
              gap: '16px'
            }}>
              {filteredRoutes.map((route) => (
                <div
                  key={route.id}
                  onClick={() => handleOpenRoute(route.id)}
                  className="card"
                  style={{
                    padding: '20px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '16px',
                    border: '1px solid #e2e8f0',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#93c5fd';
                    e.currentTarget.style.boxShadow = '0 6px 18px rgba(37,99,235,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {/* Card Top: Title, Description, Status */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '10px',
                          background: route.status === 'ACTIVE' ? '#eff6ff' : '#f1f5f9',
                          color: route.status === 'ACTIVE' ? '#2563eb' : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <RouteIcon size={20} />
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-main)' }}>
                            {route.name}
                          </h3>
                        </div>
                      </div>

                      <button
                        onClick={(e) => handleToggleRouteStatus(route, e)}
                        title={route.status === 'ACTIVE' ? 'Deactivate Route' : 'Activate Route'}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          padding: '4px'
                        }}
                      >
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '999px',
                          fontSize: '0.725rem',
                          fontWeight: '700',
                          background: route.status === 'ACTIVE' ? '#dcfce7' : '#f1f5f9',
                          color: route.status === 'ACTIVE' ? '#15803d' : '#64748b'
                        }}>
                          {route.status}
                        </span>
                      </button>
                    </div>

                    {route.description ? (
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.825rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                        {route.description}
                      </p>
                    ) : (
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.825rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        No description provided
                      </p>
                    )}
                  </div>

                  {/* Delivery Boy Badge */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: route.delivery_boy_id ? '#f0fdf4' : '#fff7ed',
                    border: `1px solid ${route.delivery_boy_id ? '#bbf7d0' : '#fed7aa'}`
                  }}>
                    <Truck size={18} color={route.delivery_boy_id ? '#16a34a' : '#ea580c'} />
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Delivery Person
                      </div>
                      <div style={{
                        fontSize: '0.85rem',
                        fontWeight: '700',
                        color: route.delivery_boy_id ? 'var(--text-main)' : '#ea580c',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {route.delivery_boy_name ? `${route.delivery_boy_name} (${route.delivery_boy_phone || 'Assigned'})` : 'Unassigned'}
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom: Counts & Action */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: '1px solid #f1f5f9',
                    paddingTop: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '0.813rem', fontWeight: '600', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Building2 size={14} />
                        <strong>{route.zone_count || 0}</strong> Zones
                      </span>
                      <span>•</span>
                      <span style={{ fontSize: '0.813rem', fontWeight: '600', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={14} />
                        <strong>{route.customer_count || 0}</strong> Customers
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteRoute(route, e)}
                        title={`Delete ${route.name}`}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #fee2e2',
                          color: '#dc2626',
                          borderRadius: '8px',
                          padding: '6px 8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#fef2f2';
                          e.currentTarget.style.borderColor = '#fca5a5';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#ffffff';
                          e.currentTarget.style.borderColor = '#fee2e2';
                        }}
                      >
                        <Trash2 size={15} />
                      </button>

                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: '#2563eb',
                        fontWeight: '700',
                        fontSize: '0.813rem'
                      }}>
                        <span>Manage</span>
                        <ChevronRight size={16} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Create Route */}
      {isCreateModalOpen && (
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title="Create New Route"
        >
          <form onSubmit={handleCreateRoute} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                Route Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Route 1, Route 2, North Sector"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                Description (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Morning milk delivery covering North apartments and villas"
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                Assigned Delivery Boy (Optional)
              </label>
              <select
                value={createForm.delivery_boy_id}
                onChange={(e) => setCreateForm({ ...createForm, delivery_boy_id: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              >
                <option value="">(Unassigned - Leave for later)</option>
                {deliveryBoys.map(dboy => (
                  <option key={dboy.id} value={dboy.id}>
                    {dboy.name} ({dboy.phone || 'No phone'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                Status
              </label>
              <select
                value={createForm.status}
                onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{ fontWeight: '700' }}
              >
                {submitting ? 'Creating...' : 'Create Route'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Edit Route */}
      {isEditModalOpen && (
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Edit Route Details"
        >
          <form onSubmit={handleSaveEditRoute} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                Route Name *
              </label>
              <input
                type="text"
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                Description (Optional)
              </label>
              <textarea
                rows={2}
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                Assigned Delivery Boy
              </label>
              <select
                value={editForm.delivery_boy_id}
                onChange={(e) => setEditForm({ ...editForm, delivery_boy_id: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              >
                <option value="">(Unassigned)</option>
                {deliveryBoys.map(dboy => (
                  <option key={dboy.id} value={dboy.id}>
                    {dboy.name} ({dboy.phone || 'No phone'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                Status
              </label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  handleDeleteRoute(editForm);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#dc2626',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  padding: '6px 0'
                }}
              >
                <Trash2 size={15} />
                <span>Delete Route</span>
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary"
                  style={{ fontWeight: '700' }}
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Add Multiple Zones to Route */}
      {isAddZonesModalOpen && selectedRouteDetail && (
        <Modal
          isOpen={isAddZonesModalOpen}
          onClose={() => setIsAddZonesModalOpen(false)}
          title={`Add Zones to ${selectedRouteDetail.route.name}`}
        >
          <form onSubmit={handleAddZonesSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              Select one or multiple existing zones to add to this route. Zones currently assigned to other routes will be safely reassigned here upon confirmation.
            </p>

            {selectedRouteDetail.availableZones?.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', color: 'var(--text-muted)' }}>
                No available zones to add. All zones are already in this route, or no other zones exist yet.
              </div>
            ) : (
              <>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Search zones by name or address..."
                    value={zoneAddSearch}
                    onChange={(e) => setZoneAddSearch(e.target.value)}
                    style={{ paddingLeft: '32px', fontSize: '0.82rem', paddingBlock: '6px' }}
                  />
                </div>

                <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px' }}>
                  {selectedRouteDetail.availableZones
                    .filter(zone => {
                      if (!zoneAddSearch.trim()) return true;
                      const q = zoneAddSearch.toLowerCase();
                      return (zone.name || '').toLowerCase().includes(q) || (zone.address || '').toLowerCase().includes(q);
                    })
                    .map(zone => {
                      const isChecked = selectedZoneIdsToAdd.includes(zone.id);
                  return (
                    <label
                      key={zone.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: `1.5px solid ${isChecked ? '#2563eb' : '#e2e8f0'}`,
                        background: isChecked ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedZoneIdsToAdd([...selectedZoneIdsToAdd, zone.id]);
                            } else {
                              setSelectedZoneIdsToAdd(selectedZoneIdsToAdd.filter(id => id !== zone.id));
                            }
                          }}
                          style={{ width: '18px', height: '18px', accentColor: '#2563eb', cursor: 'pointer' }}
                        />
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                            {zone.name}
                          </div>
                          {zone.address && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              {zone.address}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {zone.current_route_name ? (
                          <span style={{
                            fontSize: '0.725rem',
                            fontWeight: '700',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: '#fef3c7',
                            color: '#b45309'
                          }}>
                            In: {zone.current_route_name}
                          </span>
                        ) : (
                          <span style={{
                            fontSize: '0.725rem',
                            fontWeight: '700',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: '#f1f5f9',
                            color: '#64748b'
                          }}>
                            Unassigned
                          </span>
                        )}

                        <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)' }}>
                          {zone.customer_count || 0} cust
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-main)' }}>
                {selectedZoneIdsToAdd.length} zone(s) selected
              </span>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddZonesModalOpen(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || selectedZoneIdsToAdd.length === 0}
                  className="btn btn-primary"
                  style={{ fontWeight: '700' }}
                >
                  {submitting ? 'Adding...' : `Add Selected (${selectedZoneIdsToAdd.length})`}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Customer Profile Modal Reuse */}
      {profileCustomerId && (
        <CustomerProfileModal
          customerId={profileCustomerId}
          onClose={() => setProfileCustomerId(null)}
          onCustomerUpdated={() => {
            // refresh zone customers if opened
            if (expandedZoneId) {
              api.get('/customers', { params: { zone_id: expandedZoneId } })
                .then(res => {
                  const filtered = Array.isArray(res) ? res.filter(c => String(c.zone_id) === String(expandedZoneId)) : [];
                  setZoneCustomers(prev => ({ ...prev, [expandedZoneId]: filtered }));
                })
                .catch(() => {});
            }
          }}
        />
      )}

      {/* Modal: Shift Customer to Another Zone */}
      {shiftModalOpen && customerToShift && (
        <Modal
          isOpen={shiftModalOpen}
          onClose={() => setShiftModalOpen(false)}
          title={`Shift Customer: ${customerToShift.name}`}
        >
          <form onSubmit={handleConfirmShiftZone} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '0.875rem' }}>
              <div style={{ marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Customer: </span>
                <strong style={{ color: 'var(--text-main)' }}>{customerToShift.name}</strong> ({customerToShift.phone})
              </div>
              {customerToShift.flat_no && (
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Flat / House: </span>
                  <strong style={{ color: 'var(--text-main)' }}>{customerToShift.flat_no}</strong>
                </div>
              )}
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Current Zone: </span>
                <span style={{ fontWeight: '700', color: '#ea580c' }}>{currentZoneOfCustomer?.name || 'Unassigned'}</span>
              </div>
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="form-label" style={{ fontWeight: '700', marginBottom: 0 }}>Select Destination Zone *</label>
                {shiftZoneSearch && (
                  <button
                    type="button"
                    onClick={() => setShiftZoneSearch('')}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                  >
                    Clear Filter
                  </button>
                )}
              </div>
              <div style={{ position: 'relative', marginBottom: '8px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Filter destination zones..."
                  value={shiftZoneSearch}
                  onChange={(e) => setShiftZoneSearch(e.target.value)}
                  style={{ paddingLeft: '32px', fontSize: '0.82rem', paddingBlock: '6px' }}
                />
              </div>
              <select
                className="form-select"
                value={targetShiftZoneId}
                onChange={(e) => setTargetShiftZoneId(e.target.value)}
                required
              >
                <option value="">-- Choose New Zone / Apartment --</option>
                {allParlourZones
                  .filter(z => {
                    if (!shiftZoneSearch.trim()) return true;
                    const q = shiftZoneSearch.toLowerCase();
                    return (z.name || '').toLowerCase().includes(q) || (z.route_name || '').toLowerCase().includes(q);
                  })
                  .map(z => {
                    const isCurrent = String(z.id) === String(customerToShift.zone_id);
                    return (
                      <option key={z.id} value={z.id} disabled={isCurrent}>
                        {z.name} {z.route_name ? `(Route: ${z.route_name})` : '(No Route)'} {isCurrent ? '— Current Zone' : ''}
                      </option>
                    );
                  })}
              </select>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Upon shifting, this customer will automatically appear under the new zone and inherit that zone's delivery route and delivery boy.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setShiftModalOpen(false)}
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={shiftingCustomer || !targetShiftZoneId}
                className="btn btn-primary"
                style={{ fontWeight: '700' }}
              >
                {shiftingCustomer ? 'Shifting...' : 'Confirm Shift'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
