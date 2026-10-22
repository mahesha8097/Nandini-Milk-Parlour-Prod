import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import CustomerProfileModal from './CustomerProfileModal';
import {
  Building2,
  Users,
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
  Home,
  ShoppingBag,
  Sparkles,
  ArrowRight,
  Route as RouteIcon
} from 'lucide-react';

function ZoneBuildingThumbnail({ name = '', index = 0 }) {
  const lower = (name || '').toLowerCase();
  const colors = [
    { bg: '#eff6ff', stroke: '#2563eb', accent: '#3b82f6', fill: '#dbeafe' },
    { bg: '#fdf4ff', stroke: '#c026d3', accent: '#d946ef', fill: '#fae8ff' },
    { bg: '#f0fdf4', stroke: '#16a34a', accent: '#22c55e', fill: '#dcfce7' },
    { bg: '#fff7ed', stroke: '#ea580c', accent: '#f97316', fill: '#ffedd5' },
    { bg: '#f0fdfa', stroke: '#0d9488', accent: '#14b8a6', fill: '#ccfbf1' }
  ];
  const color = colors[index % colors.length];

  if (lower.includes('villa') || lower.includes('green view')) {
    return (
      <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: color.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${color.fill}` }}>
        <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
          <path d="M6 22L20 8L34 22H30V32H10V22H6Z" fill={color.fill} stroke={color.stroke} strokeWidth="2" strokeLinejoin="round"/>
          <rect x="16" y="24" width="8" height="8" rx="1" fill={color.stroke}/>
          <rect x="12" y="16" width="4" height="4" rx="0.5" fill={color.accent}/>
          <rect x="24" y="16" width="4" height="4" rx="0.5" fill={color.accent}/>
        </svg>
      </div>
    );
  }

  if (lower.includes('house') || lower.includes('independent') || lower.includes('unassigned')) {
    return (
      <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid #e2e8f0' }}>
        <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
          <path d="M8 20L20 10L32 20V32H8V20Z" fill="#f1f5f9" stroke="#64748b" strokeWidth="2" strokeLinejoin="round"/>
          <path d="M17 32V22H23V32" fill="#64748b"/>
          <circle cx="20" cy="16" r="2" fill="#94a3b8"/>
        </svg>
      </div>
    );
  }

  if (lower.includes('bulk') || lower.includes('commercial') || lower.includes('hotel')) {
    return (
      <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid #fef3c7' }}>
        <ShoppingBag size={26} color="#d97706" />
      </div>
    );
  }

  // Apartment High-Rise Default
  return (
    <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: color.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${color.fill}` }}>
      <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
        <rect x="10" y="8" width="20" height="26" rx="2" fill={color.fill} stroke={color.stroke} strokeWidth="2"/>
        <rect x="14" y="12" width="3" height="3" rx="0.5" fill={color.stroke}/>
        <rect x="23" y="12" width="3" height="3" rx="0.5" fill={color.stroke}/>
        <rect x="14" y="18" width="3" height="3" rx="0.5" fill={color.stroke}/>
        <rect x="23" y="18" width="3" height="3" rx="0.5" fill={color.stroke}/>
        <rect x="14" y="24" width="3" height="3" rx="0.5" fill={color.stroke}/>
        <rect x="23" y="24" width="3" height="3" rx="0.5" fill={color.stroke}/>
        <rect x="17" y="28" width="6" height="6" fill={color.accent}/>
      </svg>
    </div>
  );
}

export default function ZonesPage({ onNavigate }) {
  const [zones, setZones] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Zone Navigation
  const [selectedZoneKey, setSelectedZoneKey] = useState(() => {
    try {
      return localStorage.getItem('nandini_zones_page_selected_zone') || null;
    } catch {
      return null;
    }
  });

  const handleSelectZone = (key) => {
    setSelectedZoneKey(key);
    try {
      if (key) {
        localStorage.setItem('nandini_zones_page_selected_zone', key);
      } else {
        localStorage.removeItem('nandini_zones_page_selected_zone');
      }
    } catch (e) {
      console.warn('Storage save error:', e);
    }
  };

  // Search & Filter
  const [zoneSearch, setZoneSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [routeFilter, setRouteFilter] = useState('ALL');
  const [routes, setRoutes] = useState([]);

  // Modals for Zones
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [zoneForm, setZoneForm] = useState({ id: null, name: '', address: '', route_order: '', route_id: '' });
  const [savingZone, setSavingZone] = useState(false);
  const [formError, setFormError] = useState('');

  // Customer Profile Modal
  const [profileCustomerId, setProfileCustomerId] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const [zonesRes, custsRes, routesRes] = await Promise.all([
        api.get('/zones'),
        api.get('/customers'),
        api.get('/routes').catch(() => [])
      ]);
      setZones(zonesRes || []);
      setCustomers(custsRes || []);
      setRoutes(routesRes || []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load zones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Group customers by zone
  const allZoneGroups = useMemo(() => {
    const map = new Map();

    for (const z of zones) {
      map.set(`zone_${z.id}`, {
        key: `zone_${z.id}`,
        id: z.id,
        name: z.name,
        address: z.address || 'Bangalore',
        route_order: z.route_order || 0,
        route_id: z.route_id || null,
        route_name: z.route_name || null,
        delivery_boy_name: z.delivery_boy_name || null,
        type: 'ZONE',
        customers: []
      });
    }

    const unassignedGroup = {
      key: 'unassigned',
      id: null,
      name: 'Independent Houses / Unassigned',
      address: 'General Route Area',
      route_order: 999,
      type: 'UNASSIGNED',
      customers: []
    };

    const bulkGroup = {
      key: 'bulk',
      id: 'bulk',
      name: 'Bulk & Commercial Accounts',
      address: 'Hotels, Restaurants & Commercial Orders',
      route_order: 1000,
      type: 'BULK',
      customers: []
    };

    for (const c of customers) {
      if (c.customer_category === 'BULK_HOTEL') {
        bulkGroup.customers.push(c);
      } else if (c.zone_id && map.has(`zone_${c.zone_id}`)) {
        map.get(`zone_${c.zone_id}`).customers.push(c);
      } else if (c.zone_name) {
        let found = false;
        for (const [k, zObj] of map.entries()) {
          if (zObj.name.toLowerCase() === c.zone_name.toLowerCase()) {
            zObj.customers.push(c);
            found = true;
            break;
          }
        }
        if (!found) unassignedGroup.customers.push(c);
      } else {
        unassignedGroup.customers.push(c);
      }
    }

    const list = Array.from(map.values());
    if (unassignedGroup.customers.length > 0) list.push(unassignedGroup);
    if (bulkGroup.customers.length > 0) list.push(bulkGroup);

    list.sort((a, b) => (a.route_order || 0) - (b.route_order || 0));

    return list.map((g) => {
      // Sort customers by serial_no, flat_no, name
      const sorted = [...g.customers].sort((a, b) => {
        if (a.serial_no && b.serial_no && a.serial_no !== b.serial_no) {
          return a.serial_no - b.serial_no;
        }
        if (a.flat_no && b.flat_no) {
          return a.flat_no.localeCompare(b.flat_no, undefined, { numeric: true });
        }
        return (a.name || '').localeCompare(b.name || '');
      });

      const totalSubscriptions = sorted.reduce((sum, c) => sum + (c.subscriptions?.length || 0), 0);
      const totalAdvance = sorted.reduce((sum, c) => sum + (c.advance_balance || 0), 0);
      const totalPending = sorted.reduce((sum, c) => sum + (c.pending_balance || 0), 0);

      return {
        ...g,
        customers: sorted,
        totalCustomers: sorted.length,
        totalSubscriptions,
        totalAdvance,
        totalPending
      };
    });
  }, [zones, customers]);

  const activeZone = useMemo(() => {
    if (!selectedZoneKey) return null;
    return allZoneGroups.find((g) => g.key === selectedZoneKey) || null;
  }, [allZoneGroups, selectedZoneKey]);

  const displayedZones = useMemo(() => {
    let list = allZoneGroups;
    if (routeFilter !== 'ALL') {
      if (routeFilter === 'UNASSIGNED') {
        list = list.filter((g) => g.type === 'ZONE' && !g.route_id);
      } else {
        const rId = parseInt(routeFilter, 10);
        list = list.filter((g) => g.type === 'ZONE' && g.route_id === rId);
      }
    }
    if (!zoneSearch.trim()) return list;
    const q = zoneSearch.toLowerCase().trim();
    return list.filter((g) =>
      g.name.toLowerCase().includes(q) || (g.address && g.address.toLowerCase().includes(q))
    );
  }, [allZoneGroups, zoneSearch, routeFilter]);

  const filteredActiveZoneCustomers = useMemo(() => {
    if (!activeZone) return [];
    if (!customerSearch.trim()) return activeZone.customers;
    const q = customerSearch.toLowerCase().trim();
    return activeZone.customers.filter((c) =>
      c.name?.toLowerCase().includes(q) ||
      c.flat_no?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.address?.toLowerCase().includes(q)
    );
  }, [activeZone, customerSearch]);

  // Zone CRUD
  const handleOpenCreateModal = () => {
    setZoneForm({
      id: null,
      name: '',
      address: '',
      route_order: zones.length + 1,
      route_id: routeFilter !== 'ALL' && routeFilter !== 'UNASSIGNED' ? routeFilter : ''
    });
    setFormError('');
    setIsCreateModalOpen(true);
  };

  const handleOpenEditModal = (zone) => {
    setZoneForm({
      id: zone.id,
      name: zone.name,
      address: zone.address || '',
      route_order: zone.route_order !== undefined && zone.route_order !== null ? zone.route_order : '',
      route_id: zone.route_id ? String(zone.route_id) : ''
    });
    setFormError('');
    setIsEditModalOpen(true);
  };

  const handleSaveZone = async (e) => {
    e.preventDefault();
    if (!zoneForm.name.trim()) {
      setFormError('Zone/Apartment name is required.');
      return;
    }
    try {
      setSavingZone(true);
      setFormError('');
      if (zoneForm.id) {
        await api.put(`/zones/${zoneForm.id}`, {
          name: zoneForm.name.trim(),
          address: zoneForm.address.trim(),
          route_order: parseInt(zoneForm.route_order, 10) || 0,
          route_id: zoneForm.route_id ? parseInt(zoneForm.route_id, 10) : null
        });
        setIsEditModalOpen(false);
      } else {
        await api.post('/zones', {
          name: zoneForm.name.trim(),
          address: zoneForm.address.trim(),
          route_order: parseInt(zoneForm.route_order, 10) || 0,
          route_id: zoneForm.route_id ? parseInt(zoneForm.route_id, 10) : null
        });
        setIsCreateModalOpen(false);
      }
      await fetchData();
    } catch (err) {
      setFormError(err.message || 'Failed to save zone');
    } finally {
      setSavingZone(false);
    }
  };

  const handleDeleteZone = async (zone, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete zone "${zone.name}"? Existing customers will safely become unassigned.`)) {
      return;
    }
    try {
      setLoading(true);
      await api.delete(`/zones/${zone.id}`);
      if (selectedZoneKey === `zone_${zone.id}`) {
        handleSelectZone(null);
      }
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to delete zone');
      setLoading(false);
    }
  };

  return (
    <div className="page-wrapper">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={28} color="var(--primary)" />
            Apartment & Villa Zones
          </h1>
          <p className="page-subtitle">
            Manage apartment complexes, route sequence stops, and view each community's customer directory
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={fetchData} className="btn btn-outline btn-sm">
            <RefreshCw size={15} /> Refresh
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="btn btn-primary btn-sm"
            style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <PlusCircle size={15} /> Add Zone
          </button>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #2563eb' }}>
          <div style={{ fontSize: '0.74rem', color: '#1e40af', fontWeight: '700', textTransform: 'uppercase' }}>
            Total Zones
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '800', color: '#1e3a8a', marginTop: '2px' }}>
            {zones.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Apartment & villa communities
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #16a34a' }}>
          <div style={{ fontSize: '0.74rem', color: '#166534', fontWeight: '700', textTransform: 'uppercase' }}>
            Customers in Zones
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '800', color: '#15803d', marginTop: '2px' }}>
            {customers.filter((c) => c.zone_id).length}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Mapped to apartment complexes
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '0.74rem', color: '#b45309', fontWeight: '700', textTransform: 'uppercase' }}>
            Unassigned / Houses
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '800', color: '#d97706', marginTop: '2px' }}>
            {customers.filter((c) => !c.zone_id && c.customer_category !== 'BULK_HOTEL').length}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Independent residential customers
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ fontSize: '0.74rem', color: '#6d28d9', fontWeight: '700', textTransform: 'uppercase' }}>
            Bulk Accounts
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '800', color: '#5b21b6', marginTop: '2px' }}>
            {customers.filter((c) => c.customer_category === 'BULK_HOTEL').length}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Hotels, cafes & restaurants
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <RefreshCw size={28} className="spin" color="var(--primary)" />
          <div style={{ marginTop: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
            Loading zones and customer directories...
          </div>
        </div>
      ) : error ? (
        <div className="card" style={{ color: 'var(--accent-red)', padding: '24px', textAlign: 'center' }}>
          {error}
        </div>
      ) : !activeZone ? (
        /* ========================================================================= */
        /* LEVEL 1: ALL ZONES OVERVIEW CARDS                                         */
        /* ========================================================================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header & Search Toolbar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            background: 'white',
            padding: '14px 18px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0'
          }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: '900', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building2 size={20} color="#2563eb" />
                Delivery Zones & Communities ({displayedZones.length})
              </h2>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '3px 0 0 0' }}>
                Click any zone card below to see the customers living in that community.
              </p>
            </div>

            {/* Zone Search Box */}
            <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Search apartment, villa, zone..."
                value={zoneSearch}
                onChange={(e) => setZoneSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  outline: 'none',
                  background: 'white'
                }}
              />
            </div>
          </div>

          {/* Route Filter Pills Bar */}
          {routes.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              background: '#ffffff',
              padding: '10px 16px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', fontSize: '0.825rem', color: '#1e293b' }}>
                <RouteIcon size={16} color="#2563eb" />
                <span>Filter by Route:</span>
              </div>
              <button
                type="button"
                onClick={() => setRouteFilter('ALL')}
                style={{
                  padding: '4px 12px',
                  borderRadius: '999px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  border: routeFilter === 'ALL' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: routeFilter === 'ALL' ? '#eff6ff' : '#f8fafc',
                  color: routeFilter === 'ALL' ? '#1d4ed8' : '#475569',
                  cursor: 'pointer'
                }}
              >
                All Zones ({allZoneGroups.length})
              </button>
              {routes.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRouteFilter(String(r.id))}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '999px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    border: String(routeFilter) === String(r.id) ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: String(routeFilter) === String(r.id) ? '#eff6ff' : '#f8fafc',
                    color: String(routeFilter) === String(r.id) ? '#1d4ed8' : '#475569',
                    cursor: 'pointer'
                  }}
                >
                  {r.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRouteFilter('UNASSIGNED')}
                style={{
                  padding: '4px 12px',
                  borderRadius: '999px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  border: routeFilter === 'UNASSIGNED' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: routeFilter === 'UNASSIGNED' ? '#eff6ff' : '#f8fafc',
                  color: routeFilter === 'UNASSIGNED' ? '#1d4ed8' : '#475569',
                  cursor: 'pointer'
                }}
              >
                Unassigned Zones
              </button>
            </div>
          )}

          {/* Zones Grid */}
          {displayedZones.length === 0 ? (
            <div style={{ background: 'white', padding: '40px', textAlign: 'center', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#64748b' }}>
              No zones found matching "{zoneSearch}".
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '16px'
            }}>
              {displayedZones.map((zone, idx) => {
                return (
                  <div
                    key={zone.key}
                    onClick={() => handleSelectZone(zone.key)}
                    style={{
                      background: 'white',
                      borderRadius: '14px',
                      border: '1.5px solid #e2e8f0',
                      padding: '18px 20px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '14px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#2563eb';
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,99,235,0.12)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)';
                      e.currentTarget.style.transform = 'none';
                    }}
                  >
                    {/* Top: Icon + Zone Name & Address */}
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                      <ZoneBuildingThumbnail name={zone.name} index={idx} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                          {zone.type === 'ZONE' && (
                            <>
                              <span style={{
                                background: '#2563eb',
                                color: 'white',
                                fontSize: '0.72rem',
                                fontWeight: '900',
                                padding: '2px 8px',
                                borderRadius: '999px'
                              }}>
                                Stop #{zone.route_order || (idx + 1)}
                              </span>
                              {zone.route_name ? (
                                <span style={{
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  border: '1px solid #bfdbfe',
                                  fontSize: '0.72rem',
                                  fontWeight: '800',
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}>
                                  <RouteIcon size={11} /> {zone.route_name}
                                </span>
                              ) : (
                                <span style={{
                                  background: '#f8fafc',
                                  color: '#64748b',
                                  border: '1px solid #e2e8f0',
                                  fontSize: '0.72rem',
                                  fontWeight: '700',
                                  padding: '2px 8px',
                                  borderRadius: '999px'
                                }}>
                                  No Route
                                </span>
                              )}
                            </>
                          )}
                          <h3 style={{ fontSize: '1.08rem', fontWeight: '800', color: '#0f172a', margin: 0, wordBreak: 'break-word' }}>
                            {zone.name}
                          </h3>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <MapPin size={13} color="#94a3b8" />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {zone.address || 'General delivery area'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Metrics */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      flexWrap: 'wrap',
                      paddingTop: '10px',
                      borderTop: '1px solid #f1f5f9'
                    }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569' }}>
                        <span style={{ color: '#0f172a', fontWeight: '900', fontSize: '1rem' }}>
                          {zone.totalCustomers}
                        </span> Customer{zone.totalCustomers !== 1 ? 's' : ''} •{' '}
                        <span style={{ color: '#0054a6', fontWeight: '800' }}>
                          {zone.totalSubscriptions}
                        </span> Subscriptions
                      </div>

                      {zone.type === 'ZONE' && (
                        <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(zone)}
                            className="btn btn-outline btn-sm"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            title="Edit Zone Name / Route Order"
                          >
                            <Edit2 size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteZone(zone, e)}
                            className="btn btn-outline btn-sm"
                            style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#dc2626', borderColor: '#fecaca' }}
                            title="Delete Zone"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Bottom: Open Zone Action */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingTop: '4px' }}>
                      <span style={{
                        color: '#2563eb',
                        fontSize: '0.84rem',
                        fontWeight: '800',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        View Customers <ChevronRight size={16} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* LEVEL 2: ACTIVE ZONE CUSTOMER DIRECTORY                                    */
        /* ========================================================================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Back Button */}
          <div>
            <button
              type="button"
              onClick={() => handleSelectZone(null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                background: 'white',
                color: '#0f172a',
                fontWeight: '800',
                fontSize: '0.88rem',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#94a3b8';
                e.currentTarget.style.background = '#f8fafc';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.background = 'white';
              }}
            >
              <ChevronLeft size={18} /> Back to All Zones
            </button>
          </div>

          {/* Active Zone Header Card */}
          <div style={{
            background: 'white',
            borderRadius: '14px',
            border: '1.5px solid #e2e8f0',
            padding: '18px 22px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
              <ZoneBuildingThumbnail name={activeZone.name} index={0} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  {activeZone.type === 'ZONE' && (
                    <span style={{
                      background: '#2563eb',
                      color: 'white',
                      fontSize: '0.72rem',
                      fontWeight: '900',
                      padding: '2px 8px',
                      borderRadius: '999px'
                    }}>
                      Route Stop #{activeZone.route_order || 1}
                    </span>
                  )}
                  <h2 style={{ fontSize: '1.35rem', fontWeight: '900', color: '#0f172a', margin: 0 }}>
                    {activeZone.name}
                  </h2>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={14} color="#94a3b8" />
                  <span>{activeZone.address}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{
                background: '#f1f5f9',
                color: '#334155',
                fontSize: '0.84rem',
                fontWeight: '800',
                padding: '6px 14px',
                borderRadius: '8px'
              }}>
                {activeZone.totalCustomers} Customer{activeZone.totalCustomers !== 1 ? 's' : ''} • {activeZone.totalSubscriptions} Subscriptions
              </span>

              {activeZone.type === 'ZONE' && (
                <button
                  type="button"
                  onClick={() => handleOpenEditModal(activeZone)}
                  className="btn btn-outline btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Edit2 size={14} /> Edit Zone Details
                </button>
              )}

              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('customers', { openAdd: true })}
                  className="btn btn-primary btn-sm"
                  style={{ fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <PlusCircle size={15} /> Add Customer
                </button>
              )}
            </div>
          </div>

          {/* Search Box in Zone */}
          <div className="card" style={{ padding: '14px 18px', background: 'white' }}>
            <div style={{ position: 'relative', maxWidth: '380px' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Search flat #, customer name, phone..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                style={{ paddingLeft: '36px' }}
              />
            </div>
          </div>

          {/* Customers Table strictly for this zone (NO DELIVERY MARKING BUTTONS) */}
          {filteredActiveZoneCustomers.length === 0 ? (
            <div style={{ background: 'white', padding: '40px', textAlign: 'center', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#64748b' }}>
              No customers found in <strong>{activeZone.name}</strong>.
            </div>
          ) : (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th style={{ width: '90px' }}>Flat / Unit</th>
                    <th>Customer Name</th>
                    <th>Category</th>
                    <th>Phone & Route</th>
                    <th>Assigned Delivery Boy</th>
                    <th>Subscriptions</th>
                    <th>Advance Balance</th>
                    <th>Pending Amount</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActiveZoneCustomers.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {c.flat_no ? (
                          <span style={{
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            borderRadius: '6px',
                            padding: '3px 8px',
                            fontSize: '0.8rem',
                            fontWeight: '800'
                          }}>
                            {c.flat_no}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{c.name}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{c.address}</div>
                      </td>
                      <td>
                        <span className={`badge ${c.customer_category === 'HOUSE' ? 'badge-info' : 'badge-indigo'}`}>
                          {c.customer_category === 'HOUSE' ? <Home size={12} /> : <ShoppingBag size={12} />}
                          {c.customer_category === 'HOUSE' ? 'House' : 'Bulk'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: '600' }}>{c.phone}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Route: {c.route || 'N/A'}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.813rem', color: c.delivery_boy_name ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {c.delivery_boy_name || 'Unassigned'}
                        </div>
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
                        <span style={{ fontWeight: '800', color: '#16a34a' }}>
                          ₹{c.advance_balance?.toFixed(2) || '0.00'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: '800', color: c.pending_balance > 0 ? '#dc2626' : 'var(--text-primary)' }}>
                          ₹{c.pending_balance?.toFixed(2) || '0.00'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => setProfileCustomerId(c.id)}
                          className="btn btn-outline btn-sm"
                          style={{ padding: '6px 10px' }}
                          title="View Full Profile"
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Customer Profile Modal */}
      {profileCustomerId && (
        <CustomerProfileModal
          customerId={profileCustomerId}
          isOpen={Boolean(profileCustomerId)}
          initialTab="overview"
          onClose={() => setProfileCustomerId(null)}
          onRefreshList={fetchData}
        />
      )}

      {/* Create Zone Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Add New Apartment / Villa Zone"
      >
        <form onSubmit={handleSaveZone}>
          {formError && (
            <div style={{ background: 'var(--accent-red-light)', color: '#991b1b', padding: '10px', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '0.875rem' }}>
              {formError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Apartment / Community Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Prestige Lakeside or Chaitanya Samarpan"
              value={zoneForm.name}
              onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Address / Landmark</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Seegehalli, Kadugodi Main Road"
              value={zoneForm.address}
              onChange={(e) => setZoneForm({ ...zoneForm, address: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RouteIcon size={14} color="#2563eb" />
              <span>Assigned Route</span>
            </label>
            <select
              className="form-select"
              value={zoneForm.route_id}
              onChange={(e) => setZoneForm({ ...zoneForm, route_id: e.target.value })}
            >
              <option value="">-- No Route Assigned (Assign Later) --</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.delivery_boy_name ? `(${r.delivery_boy_name})` : '(No Delivery Boy Assigned)'}
                </option>
              ))}
            </select>
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '4px' }}>
              Links this zone directly into the Route hierarchy (Routes → Zones → Customers).
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Route Sequence Order</label>
            <input
              type="number"
              className="form-input"
              placeholder="e.g. 1, 2, 3..."
              value={zoneForm.route_order}
              onChange={(e) => setZoneForm({ ...zoneForm, route_order: e.target.value })}
            />
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '4px' }}>
              Determines delivery stop order (1st apartment, 2nd apartment...) on the delivery run.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="btn btn-outline btn-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={savingZone}
            >
              {savingZone ? 'Saving...' : 'Create Zone'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Zone Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Apartment / Villa Zone"
      >
        <form onSubmit={handleSaveZone}>
          {formError && (
            <div style={{ background: 'var(--accent-red-light)', color: '#991b1b', padding: '10px', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '0.875rem' }}>
              {formError}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Apartment / Community Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Prestige Lakeside or Chaitanya Samarpan"
              value={zoneForm.name}
              onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Address / Landmark</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Seegehalli, Kadugodi Main Road"
              value={zoneForm.address}
              onChange={(e) => setZoneForm({ ...zoneForm, address: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RouteIcon size={14} color="#2563eb" />
              <span>Assigned Route</span>
            </label>
            <select
              className="form-select"
              value={zoneForm.route_id}
              onChange={(e) => setZoneForm({ ...zoneForm, route_id: e.target.value })}
            >
              <option value="">-- No Route Assigned (Assign Later) --</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.delivery_boy_name ? `(${r.delivery_boy_name})` : '(No Delivery Boy Assigned)'}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Route Sequence Order</label>
            <input
              type="number"
              className="form-input"
              placeholder="e.g. 1, 2, 3..."
              value={zoneForm.route_order}
              onChange={(e) => setZoneForm({ ...zoneForm, route_order: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="btn btn-outline btn-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={savingZone}
            >
              {savingZone ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
