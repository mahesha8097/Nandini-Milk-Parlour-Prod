import React, { useState, useEffect, useMemo } from 'react';
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
  Trash2,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  Sparkles,
  Layers,
  ArrowRight
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
      <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: color.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${color.fill}` }}>
        <svg width="30" height="30" viewBox="0 0 40 40" fill="none">
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
      <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid #e2e8f0' }}>
        <svg width="30" height="30" viewBox="0 0 40 40" fill="none">
          <path d="M8 20L20 10L32 20V32H8V20Z" fill="#f1f5f9" stroke="#64748b" strokeWidth="2" strokeLinejoin="round"/>
          <path d="M17 32V22H23V32" fill="#64748b"/>
          <circle cx="20" cy="16" r="2" fill="#94a3b8"/>
        </svg>
      </div>
    );
  }

  if (lower.includes('bulk') || lower.includes('commercial') || lower.includes('hotel')) {
    return (
      <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid #fef3c7' }}>
        <ShoppingBag size={24} color="#d97706" />
      </div>
    );
  }

  // Apartment High-Rise Default
  return (
    <div style={{ width: '50px', height: '50px', borderRadius: '12px', background: color.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${color.fill}` }}>
      <svg width="30" height="30" viewBox="0 0 40 40" fill="none">
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

export default function CustomersPage({ initialOpenAdd = false }) {
  const [customers, setCustomers] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Zone Navigation State (Persisted in localStorage)
  const [viewMode, setViewMode] = useState('ZONES'); // 'ZONES' | 'ALL'
  const [selectedZoneKey, setSelectedZoneKey] = useState(() => {
    try {
      return localStorage.getItem('nandini_customers_selected_zone') || null;
    } catch {
      return null;
    }
  });

  // Search & Filter States
  const [zoneSearch, setZoneSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(''); // '' | 'HOUSE' | 'BULK_HOTEL'
  const [billingFilter, setBillingFilter] = useState(''); // '' | 'PREPAID' | 'POSTPAID'
  const [deliveryBoyFilter, setDeliveryBoyFilter] = useState(''); // '' | dboyId
  const [zoneFilter, setZoneFilter] = useState(''); // '' | 'UNASSIGNED' | zoneId (used for flat list)

  const handleSelectZone = (key) => {
    setSelectedZoneKey(key);
    try {
      if (key) {
        localStorage.setItem('nandini_customers_selected_zone', key);
      } else {
        localStorage.removeItem('nandini_customers_selected_zone');
      }
    } catch (e) {
      console.warn('Storage save error:', e);
    }
  };

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
      const res = await api.get('/customers');
      setCustomers(res || []);
    } catch (err) {
      setError(err.message || 'Unable to load customers.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliveryBoys = async () => {
    try {
      const res = await api.get('/delivery-boys');
      setDeliveryBoys(res || []);
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
  }, []);

  const handleQuickSerialUpdate = async (customerId, newSerial) => {
    try {
      const val = newSerial === '' ? 0 : parseInt(newSerial, 10) || 0;
      await api.put(`/customers/${customerId}`, { serial_no: val });
      setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, serial_no: val } : c)));
    } catch (err) {
      console.error('Failed to update serial number:', err);
    }
  };

  const handleAutoAssignSequence = async (targetList) => {
    const listToReorder = targetList && targetList.length > 0 ? targetList : customers;
    if (listToReorder.length === 0) return;

    const confirmMsg = activeZone
      ? `Auto-assign sequential drop numbers (1 to ${listToReorder.length}) for customers in "${activeZone.name}"?`
      : `Auto-assign sequential drop numbers (1 to ${listToReorder.length}) for visible customers?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setLoading(true);
      const orders = listToReorder.map((c, idx) => ({ id: c.id, serial_no: idx + 1 }));
      await api.put('/customers/reorder', { orders });
      await fetchCustomers();
    } catch (err) {
      alert(err.message || 'Failed to auto-assign serial numbers');
    } finally {
      setLoading(false);
    }
  };

  // Group all customers by Apartment / Community Zone
  const allZoneGroups = useMemo(() => {
    const map = new Map();

    // 1. Initialize registered database zones
    for (const z of zones) {
      map.set(`zone_${z.id}`, {
        key: `zone_${z.id}`,
        id: z.id,
        name: z.name,
        address: z.address || 'Bangalore',
        route_order: z.route_order || 0,
        type: 'ZONE',
        customers: []
      });
    }

    // Special group: Unassigned / Independent Houses
    const unassignedGroup = {
      key: 'unassigned',
      id: null,
      name: 'Independent Houses / Unassigned',
      address: 'General Route Area',
      route_order: 999,
      type: 'UNASSIGNED',
      customers: []
    };

    // Special group: Bulk & Commercial Accounts
    const bulkGroup = {
      key: 'bulk',
      id: 'bulk',
      name: 'Bulk & Commercial Accounts',
      address: 'Hotels, Restaurants & Daily Bulk Deliveries',
      route_order: 1000,
      type: 'BULK',
      customers: []
    };

    // 2. Distribute all customers into zones
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

    const allGroups = Array.from(map.values());
    if (unassignedGroup.customers.length > 0) {
      allGroups.push(unassignedGroup);
    }
    if (bulkGroup.customers.length > 0) {
      allGroups.push(bulkGroup);
    }

    // Sort zones by route_order
    allGroups.sort((a, b) => (a.route_order || 0) - (b.route_order || 0));

    return allGroups.map((g) => {
      // Sort customers within zone by serial_no, then flat_no, then name
      const sorted = [...g.customers].sort((a, b) => {
        if (a.serial_no && b.serial_no && a.serial_no !== b.serial_no) {
          return a.serial_no - b.serial_no;
        }
        if (a.flat_no && b.flat_no) {
          return a.flat_no.localeCompare(b.flat_no, undefined, { numeric: true });
        }
        return (a.name || '').localeCompare(b.name || '');
      });

      const totalAdvance = sorted.reduce((sum, c) => sum + (c.advance_balance || 0), 0);
      const totalPending = sorted.reduce((sum, c) => sum + (c.pending_balance || 0), 0);
      const totalSubscriptions = sorted.reduce((sum, c) => sum + (c.subscriptions?.length || 0), 0);

      return {
        ...g,
        customers: sorted,
        totalCustomers: sorted.length,
        totalAdvance,
        totalPending,
        totalSubscriptions
      };
    });
  }, [zones, customers]);

  // Active Zone when one is selected
  const activeZone = useMemo(() => {
    if (!selectedZoneKey) return null;
    return allZoneGroups.find((g) => g.key === selectedZoneKey) || null;
  }, [allZoneGroups, selectedZoneKey]);

  // Level 1: Filtered zones based on zoneSearch
  const displayedZones = useMemo(() => {
    if (!zoneSearch.trim()) return allZoneGroups;
    const q = zoneSearch.toLowerCase().trim();
    return allZoneGroups.filter((g) =>
      g.name.toLowerCase().includes(q) || (g.address && g.address.toLowerCase().includes(q))
    );
  }, [allZoneGroups, zoneSearch]);

  // Level 2: Filtered customers inside the active zone
  const filteredActiveZoneCustomers = useMemo(() => {
    if (!activeZone) return [];
    return activeZone.customers.filter((c) => {
      const q = customerSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.name?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.address?.toLowerCase().includes(q) ||
        c.flat_no?.toLowerCase().includes(q);

      const matchesCategory = !categoryFilter || c.customer_category === categoryFilter;
      const matchesBilling = !billingFilter || c.billing_type === billingFilter;
      const matchesDboy = !deliveryBoyFilter || String(c.delivery_boy_id) === String(deliveryBoyFilter);

      return matchesSearch && matchesCategory && matchesBilling && matchesDboy;
    });
  }, [activeZone, customerSearch, categoryFilter, billingFilter, deliveryBoyFilter]);

  // Filtered customers for Flat List mode
  const filteredFlatCustomers = useMemo(() => {
    return customers.filter((c) => {
      const q = customerSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.name?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.address?.toLowerCase().includes(q) ||
        c.flat_no?.toLowerCase().includes(q);

      const matchesCategory = !categoryFilter || c.customer_category === categoryFilter;
      const matchesBilling = !billingFilter || c.billing_type === billingFilter;
      const matchesDboy = !deliveryBoyFilter || String(c.delivery_boy_id) === String(deliveryBoyFilter);
      const matchesZone =
        !zoneFilter ||
        (zoneFilter === 'UNASSIGNED' ? !c.zone_id : String(c.zone_id) === String(zoneFilter));

      return matchesSearch && matchesCategory && matchesBilling && matchesDboy && matchesZone;
    });
  }, [customers, customerSearch, categoryFilter, billingFilter, deliveryBoyFilter, zoneFilter]);

  const handleOpenAdd = (presetZoneId = null) => {
    setEditingCustomer(null);
    let targetZoneId = presetZoneId;
    if (!targetZoneId && activeZone && activeZone.type === 'ZONE') {
      targetZoneId = activeZone.id;
    }
    setFormData({
      name: '',
      phone: '',
      address: activeZone && activeZone.address ? activeZone.address : '',
      flat_no: '',
      zone_id: targetZoneId || '',
      customer_category: activeZone && activeZone.type === 'BULK' ? 'BULK_HOTEL' : 'HOUSE',
      billing_type: 'PREPAID',
      delivery_boy_id: deliveryBoyFilter || '',
      route: '',
      notes: '',
      advance_balance: 0,
      initial_advance: 0,
      serial_no: customers.length > 0 ? Math.max(...customers.map((c) => c.serial_no || 0), 0) + 1 : 1
    });
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (customer) => {
    setEditingCustomer(customer);
    const adv = customer.advance_balance !== undefined ? customer.advance_balance : customer.initial_advance || 0;
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
        route_order: parseInt(newZoneRouteOrder, 10) || 0
      });
      await fetchZones();
      setFormData((prev) => ({ ...prev, zone_id: created.id }));
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

  const handleOpenEditZone = (zoneIdToEdit) => {
    const targetZone = zones.find((z) => String(z.id) === String(zoneIdToEdit));
    if (!targetZone) return;
    setEditZoneId(targetZone.id);
    setEditZoneName(targetZone.name || '');
    setEditZoneAddress(targetZone.address || '');
    setEditZoneRouteOrder(targetZone.route_order !== undefined && targetZone.route_order !== null ? targetZone.route_order : '');
    setIsEditZoneModalOpen(true);
  };

  const handleUpdateZone = async (e) => {
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

  // Metrics summary
  const totalCustomersCount = customers.length;
  const totalAdvanceAmount = customers.reduce((s, c) => s + (c.advance_balance || 0), 0);
  const totalPendingAmount = customers.reduce((s, c) => s + (c.pending_balance || 0), 0);

  return (
    <div className="page-wrapper">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={28} color="var(--primary)" />
            Customers Management
          </h1>
          <p className="page-subtitle">
            Manage apartment, villa, and bulk customer accounts grouped by delivery zones
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={fetchCustomers} className="btn btn-outline btn-sm">
            <RefreshCw size={15} /> Refresh
          </button>
          <button
            onClick={() => setIsCreateZoneModalOpen(true)}
            className="btn btn-outline btn-sm"
            style={{ fontWeight: '700' }}
          >
            <Building2 size={15} color="#2563eb" /> + New Zone
          </button>
          <button
            onClick={() => handleOpenAdd(activeZone?.id)}
            className="btn btn-primary btn-sm"
            style={{ fontWeight: '800' }}
          >
            <PlusCircle size={15} /> + Add Customer
          </button>
        </div>
      </div>

      {/* Top Overview Metric Badges */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div className="card" style={{ padding: '12px 16px', borderLeft: '4px solid #2563eb' }}>
          <div style={{ fontSize: '0.74rem', color: '#1e40af', fontWeight: '700', textTransform: 'uppercase' }}>
            Total Customers
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '800', color: '#1e3a8a', marginTop: '2px' }}>
            {totalCustomersCount}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Across {allZoneGroups.length} zones & communities
          </div>
        </div>

        <div className="card" style={{ padding: '12px 16px', borderLeft: '4px solid #16a34a' }}>
          <div style={{ fontSize: '0.74rem', color: '#166534', fontWeight: '700', textTransform: 'uppercase' }}>
            Total Advance Balance
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '800', color: '#15803d', marginTop: '2px' }}>
            ₹{totalAdvanceAmount.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Prepaid account balances
          </div>
        </div>

        <div className="card" style={{ padding: '12px 16px', borderLeft: '4px solid #dc2626' }}>
          <div style={{ fontSize: '0.74rem', color: '#991b1b', fontWeight: '700', textTransform: 'uppercase' }}>
            Total Pending Amount
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '800', color: '#b91c1c', marginTop: '2px' }}>
            ₹{totalPendingAmount.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Uncollected monthly bills
          </div>
        </div>

        <div className="card" style={{ padding: '12px 16px', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ fontSize: '0.74rem', color: '#6d28d9', fontWeight: '700', textTransform: 'uppercase' }}>
            Communities & Zones
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: '800', color: '#5b21b6', marginTop: '2px' }}>
            {zones.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Organized delivery complexes
          </div>
        </div>
      </div>

      {/* View Switcher Bar (Zones First vs All Customers Flat View) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'inline-flex', background: '#e2e8f0', borderRadius: '10px', padding: '3px' }}>
          <button
            type="button"
            onClick={() => {
              setViewMode('ZONES');
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: 'none',
              background: viewMode === 'ZONES' ? 'white' : 'transparent',
              color: viewMode === 'ZONES' ? '#0f172a' : '#64748b',
              fontWeight: viewMode === 'ZONES' ? '800' : '600',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: viewMode === 'ZONES' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
            }}
          >
            <Building2 size={15} color={viewMode === 'ZONES' ? '#2563eb' : '#64748b'} />
            Organized by Zones
          </button>

          <button
            type="button"
            onClick={() => {
              setViewMode('ALL');
              handleSelectZone(null);
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: 'none',
              background: viewMode === 'ALL' ? 'white' : 'transparent',
              color: viewMode === 'ALL' ? '#0f172a' : '#64748b',
              fontWeight: viewMode === 'ALL' ? '800' : '600',
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: viewMode === 'ALL' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
            }}
          >
            <Layers size={15} color={viewMode === 'ALL' ? '#2563eb' : '#64748b'} />
            All Customers (Flat List)
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <RefreshCw size={28} className="spin" color="var(--primary)" />
          <div style={{ marginTop: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
            Loading customers and zones...
          </div>
        </div>
      ) : error ? (
        <div className="card" style={{ color: 'var(--accent-red)', padding: '24px', textAlign: 'center' }}>
          {error}
        </div>
      ) : viewMode === 'ZONES' && !activeZone ? (
        /* ========================================================================= */
        /* LEVEL 1: ALL ZONES OVERVIEW CARDS                                         */
        /* ========================================================================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header & Zone Search Toolbar */}
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
                Apartment & Community Zones ({displayedZones.length})
              </h2>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '3px 0 0 0' }}>
                Click any apartment or zone to view and manage its customers easily.
              </p>
            </div>

            {/* Zone Search Box */}
            <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Search apartment or zone..."
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
                            <span style={{
                              background: '#2563eb',
                              color: 'white',
                              fontSize: '0.72rem',
                              fontWeight: '900',
                              padding: '2px 8px',
                              borderRadius: '999px'
                            }}>
                              Route #{zone.route_order || (idx + 1)}
                            </span>
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

                    {/* Middle: Metrics and Balance preview */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      flexWrap: 'wrap',
                      paddingTop: '10px',
                      borderTop: '1px solid #f1f5f9'
                    }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#475569' }}>
                        <span style={{ color: '#0f172a', fontWeight: '900', fontSize: '0.95rem' }}>
                          {zone.totalCustomers}
                        </span> Customer{zone.totalCustomers !== 1 ? 's' : ''} •{' '}
                        <span style={{ color: '#0054a6', fontWeight: '800' }}>
                          {zone.totalSubscriptions}
                        </span> Subscriptions
                      </div>

                      {zone.totalPending > 0 && (
                        <span style={{
                          background: '#fef2f2',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                          fontSize: '0.75rem',
                          fontWeight: '800',
                          padding: '3px 8px',
                          borderRadius: '6px'
                        }}>
                          Pending: ₹{zone.totalPending.toFixed(0)}
                        </span>
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
      ) : viewMode === 'ZONES' && activeZone ? (
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
                      Route #{activeZone.route_order || 1}
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
                  onClick={() => handleOpenEditZone(activeZone.id)}
                  className="btn btn-outline btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Edit2 size={14} /> Edit Zone
                </button>
              )}

              <button
                type="button"
                onClick={() => handleOpenAdd(activeZone.id)}
                className="btn btn-primary btn-sm"
                style={{ fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <PlusCircle size={15} /> + Add Customer to this Zone
              </button>
            </div>
          </div>

          {/* Active Zone Customer Filter Toolbar */}
          <div className="card" style={{ padding: '14px 16px', background: 'white' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'center' }}>
              {/* Customer Search Box */}
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search flat #, customer name, phone..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  style={{ paddingLeft: '36px' }}
                />
                <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>

              {/* Category Filter */}
              <div>
                <select
                  className="form-input"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  style={{ fontWeight: '700' }}
                >
                  <option value="">All Categories ({activeZone.customers.length})</option>
                  <option value="HOUSE">House Customers</option>
                  <option value="BULK_HOTEL">Bulk / Hotel / Restaurant</option>
                </select>
              </div>

              {/* Billing Scheme Filter */}
              <div>
                <select
                  className="form-input"
                  value={billingFilter}
                  onChange={(e) => setBillingFilter(e.target.value)}
                  style={{ fontWeight: '700' }}
                >
                  <option value="">All Billing Types</option>
                  <option value="PREPAID">Prepaid (Advance)</option>
                  <option value="POSTPAID">Postpaid</option>
                </select>
              </div>

              {/* Delivery Boy Filter */}
              {deliveryBoys.length > 0 && (
                <div>
                  <select
                    className="form-input"
                    value={deliveryBoyFilter}
                    onChange={(e) => setDeliveryBoyFilter(e.target.value)}
                  >
                    <option value="">All Delivery Boys</option>
                    {deliveryBoys.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.assigned_route || 'General'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Auto Sequence Button */}
              {filteredActiveZoneCustomers.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => handleAutoAssignSequence(filteredActiveZoneCustomers)}
                    className="btn btn-outline btn-sm"
                    style={{
                      width: '100%',
                      fontWeight: '800',
                      color: '#0054a6',
                      borderColor: '#93c5fd',
                      background: '#eff6ff',
                      height: '38px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                    title="Automatically assign drop order 1..N to customers in this zone"
                  >
                    ⚡ Auto-Sequence (1..{filteredActiveZoneCustomers.length})
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Customer Table / Cards */}
          {filteredActiveZoneCustomers.length === 0 ? (
            <div style={{ background: 'white', padding: '40px', textAlign: 'center', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#64748b' }}>
              No customers found in <strong>{activeZone.name}</strong> matching your criteria.
              <div style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => handleOpenAdd(activeZone.id)}
                  className="btn btn-primary btn-sm"
                >
                  <PlusCircle size={15} /> Add First Customer to {activeZone.name}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="table-container desktop-only">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th style={{ width: '80px', textAlign: 'center' }}>S.No / Drop #</th>
                      <th>Customer Name & Flat #</th>
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
                    {filteredActiveZoneCustomers.map((c) => (
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
                              <span style={{
                                background: '#0054a6',
                                color: '#ffffff',
                                fontWeight: '800',
                                fontSize: '0.7rem',
                                padding: '1px 6px',
                                borderRadius: '4px'
                              }}>
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
                {filteredActiveZoneCustomers.map((c) => (
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
                        <strong>Subscribed:</strong> {c.subscriptions.map((s) => `${s.product_name} (${s.quantity})`).join(', ')}
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
        </div>
      ) : (
        /* ========================================================================= */
        /* FLAT VIEW: ALL CUSTOMERS TABLE                                            */
        /* ========================================================================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filter Bar */}
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ position: 'relative', flex: '1 1 280px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search by customer name, phone, or address..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  style={{ paddingLeft: '36px' }}
                />
                <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>

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
                  {deliveryBoys.map((dboy) => (
                    <option key={dboy.id} value={dboy.id}>
                      {dboy.name} ({dboy.assigned_route || 'All Routes'})
                    </option>
                  ))}
                </select>

                {filteredFlatCustomers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleAutoAssignSequence(filteredFlatCustomers)}
                    className="btn btn-outline btn-sm"
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      color: '#0054a6',
                      borderColor: '#93c5fd',
                      background: '#eff6ff'
                    }}
                    title="Automatically assign sequential drop numbers (1, 2, 3...) to visible customers"
                  >
                    ⚡ Auto-Sequence (1..{filteredFlatCustomers.length})
                  </button>
                )}
              </div>
            </div>
          </div>

          {filteredFlatCustomers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No customers found"
              description="No customer accounts exist matching the filters."
              action={
                <button onClick={() => handleOpenAdd()} className="btn btn-primary btn-sm">
                  <PlusCircle size={16} /> Add First Customer
                </button>
              }
            />
          ) : (
            <>
              {/* Desktop Table View */}
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
                    {filteredFlatCustomers.map((c) => (
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
                              <span style={{
                                background: '#0054a6',
                                color: '#ffffff',
                                fontWeight: '800',
                                fontSize: '0.7rem',
                                padding: '1px 6px',
                                borderRadius: '4px'
                              }}>
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
                {filteredFlatCustomers.map((c) => (
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
                        <strong>Subscribed:</strong> {c.subscriptions.map((s) => `${s.product_name} (${s.quantity})`).join(', ')}
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
        </div>
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
                      onClick={() => handleOpenEditZone(formData.zone_id)}
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
                onChange={(e) => setFormData({ ...formData, serial_no: e.target.value === '' ? '' : parseInt(e.target.value, 10) || 0 })}
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
        <form onSubmit={handleUpdateZone}>
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
