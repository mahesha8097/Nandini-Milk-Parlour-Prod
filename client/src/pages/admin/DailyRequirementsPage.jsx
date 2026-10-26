import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import {
  ClipboardList,
  Calendar,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
  PlusCircle,
  Save,
  RotateCcw,
  User,
  MapPin,
  Truck,
  RefreshCw,
  Sparkles,
  ShoppingBag,
  Info,
  Trash2,
  Plus,
  Minus,
  Building2,
  Package,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Home,
  Layers,
  ArrowRight
} from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';

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
      <div style={{ width: '52px', height: '52px', borderRadius: '10px', background: color.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${color.fill}` }}>
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
      <div style={{ width: '52px', height: '52px', borderRadius: '10px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid #e2e8f0' }}>
        <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
          <path d="M8 20L20 10L32 20V32H8V20Z" fill="#f1f5f9" stroke="#64748b" strokeWidth="2" strokeLinejoin="round"/>
          <path d="M17 32V22H23V32" fill="#64748b"/>
          <circle cx="20" cy="16" r="2" fill="#94a3b8"/>
        </svg>
      </div>
    );
  }

  if (lower.includes('bulk') || lower.includes('commercial')) {
    return (
      <div style={{ width: '52px', height: '52px', borderRadius: '10px', background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1.5px solid #fef3c7' }}>
        <ShoppingBag size={26} color="#d97706" />
      </div>
    );
  }

  // Apartment High-Rise Default
  return (
    <div style={{ width: '52px', height: '52px', borderRadius: '10px', background: color.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${color.fill}` }}>
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

export default function DailyRequirementsPage() {
  const todayStr = getLocalDateString();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState({
    totalCustomers: 0,
    totalDeliveries: 0,
    specialRequirements: 0,
    skipDeliveries: 0,
    quantityChanges: 0,
    extraQuantity: 0
  });
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState({}); // { [rowKey]: { saving: boolean, success: string, error: string } }

  // Local draft state for active edits per row: { [rowKey]: { requirement_type, target_product_id, required_quantity, additional_quantity, reason } }
  const [drafts, setDrafts] = useState({});

  // Selected Zone state (persisted across page reloads)
  const [selectedZoneKey, setSelectedZoneKey] = useState(() => {
    try {
      return localStorage.getItem('nandini_daily_req_selected_zone') || null;
    } catch {
      return null;
    }
  });

  // Filter & Search state
  const [zoneSearch, setZoneSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedDeliveryBoy, setSelectedDeliveryBoy] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedReqFilter, setSelectedReqFilter] = useState('ALL'); // 'ALL' | 'SPECIAL' | 'NORMAL' | 'SKIP_DELIVERY' | 'CHANGE_QUANTITY' | 'ADD_EXTRA_QUANTITY'

  const handleSelectZone = (key) => {
    setSelectedZoneKey(key);
    setCustomerSearch('');
    setSelectedReqFilter('ALL');
    try {
      if (key) {
        localStorage.setItem('nandini_daily_req_selected_zone', String(key));
      } else {
        localStorage.removeItem('nandini_daily_req_selected_zone');
      }
    } catch {
      // Ignore storage errors
    }
  };

  // Bulk Order Modal State
  const [allCustomers, setAllCustomers] = useState([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    customer_id: '',
    delivery_date: selectedDate,
    delivery_boy_id: '',
    notes: '',
    items: [] // [{ product_id, product_name, variant_label, selling_price, quantity }]
  });
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkSuccess, setBulkSuccess] = useState('');

  // Load initial data (Delivery boys, products, customers, zones, and requirements)
  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      const [reqRes, sumRes, dboyRes, prodRes, custRes, zoneRes] = await Promise.all([
        api.get(`/daily-requirements?date=${selectedDate}`),
        api.get(`/daily-requirements/summary?date=${selectedDate}`),
        api.get('/delivery-boys').catch(() => []),
        api.get('/products').catch(() => []),
        api.get('/customers').catch(() => []),
        api.get('/zones').catch(() => [])
      ]);

      setItems(reqRes || []);
      setSummary(sumRes || {});
      setDeliveryBoys(dboyRes || []);
      setProducts(prodRes || []);
      setAllCustomers(custRes || []);
      setZones(zoneRes || []);

      // Initialize local drafts from existing saved values
      const initialDrafts = {};
      for (const it of reqRes || []) {
        const key = `${it.customer_id}_${it.product_id}`;
        initialDrafts[key] = {
          requirement_type: it.requirement_type || 'NORMAL',
          target_product_id: it.target_product_id || it.product_id,
          required_quantity: it.required_quantity !== null && it.required_quantity !== undefined ? it.required_quantity : it.normal_quantity,
          additional_quantity: it.additional_quantity || 1,
          reason: it.reason || ''
        };
      }
      setDrafts(initialDrafts);
    } catch (err) {
      console.error('Fetch daily requirements error:', err);
      setError(err.message || 'Unable to load daily delivery requirements.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const handleOpenBulkModal = () => {
    setBulkError('');
    setBulkSuccess('');
    // Pick first bulk/hotel customer or first customer
    const defaultCust = allCustomers.find((c) => c.customer_category === 'BULK_HOTEL') || allCustomers[0];
    const defaultDboy = defaultCust ? (defaultCust.delivery_boy_id || '') : (deliveryBoys.length > 0 ? deliveryBoys[0].id : '');
    
    // Pick first product as default item if available
    const initialItems = products.length > 0 ? [{
      product_id: products[0].id,
      product_name: products[0].name,
      variant_label: products[0].variant_label,
      selling_price: products[0].selling_price,
      quantity: 10
    }] : [];

    setBulkForm({
      customer_id: defaultCust ? defaultCust.id : '',
      delivery_date: selectedDate,
      delivery_boy_id: defaultDboy,
      notes: 'Bulk Order Requirement',
      items: initialItems
    });
    setIsBulkModalOpen(true);
  };

  const handleBulkCustomerChange = (custId) => {
    const cust = allCustomers.find((c) => c.id === parseInt(custId, 10));
    setBulkForm((prev) => ({
      ...prev,
      customer_id: custId,
      delivery_boy_id: cust && cust.delivery_boy_id ? cust.delivery_boy_id : prev.delivery_boy_id
    }));
  };

  const handleAddProductToBulk = (prod) => {
    setBulkForm((prev) => {
      const existingIdx = prev.items.findIndex((it) => it.product_id === prod.id);
      if (existingIdx >= 0) {
        // Increment quantity
        const updated = [...prev.items];
        updated[existingIdx].quantity += 5;
        return { ...prev, items: updated };
      } else {
        return {
          ...prev,
          items: [
            ...prev.items,
            {
              product_id: prod.id,
              product_name: prod.name,
              variant_label: prod.variant_label,
              selling_price: prod.selling_price,
              quantity: 10
            }
          ]
        };
      }
    });
  };

  const handleBulkItemQtyChange = (prodId, qty) => {
    setBulkForm((prev) => ({
      ...prev,
      items: prev.items.map((it) =>
        it.product_id === prodId ? { ...it, quantity: Math.max(1, parseInt(qty, 10) || 1) } : it
      )
    }));
  };

  const handleRemoveBulkItem = (prodId) => {
    setBulkForm((prev) => ({
      ...prev,
      items: prev.items.filter((it) => it.product_id !== prodId)
    }));
  };

  const handleSubmitBulkOrder = async (e) => {
    if (e) e.preventDefault();
    if (!bulkForm.customer_id) {
      setBulkError('Please select a customer.');
      return;
    }
    if (bulkForm.items.length === 0) {
      setBulkError('Please select at least one product with quantity.');
      return;
    }

    try {
      setBulkSaving(true);
      setBulkError('');
      const payload = {
        customer_id: parseInt(bulkForm.customer_id, 10),
        delivery_date: bulkForm.delivery_date,
        delivery_boy_id: bulkForm.delivery_boy_id ? parseInt(bulkForm.delivery_boy_id, 10) : null,
        notes: bulkForm.notes,
        items: bulkForm.items.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity
        }))
      };

      const res = await api.post('/daily-requirements/bulk-order', payload);
      setBulkSuccess(res.message || 'Bulk order created successfully!');
      setTimeout(() => {
        setIsBulkModalOpen(false);
        setBulkSuccess('');
        fetchData();
      }, 1200);
    } catch (err) {
      setBulkError(err.message || 'Failed to save bulk order.');
    } finally {
      setBulkSaving(false);
    }
  };

  const handleDraftChange = (key, field, value) => {
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
  };

  const handleSaveRequirement = async (item) => {
    const key = `${item.customer_id}_${item.product_id}`;
    const draft = drafts[key] || {
      requirement_type: item.requirement_type || 'NORMAL',
      target_product_id: item.product_id,
      required_quantity: item.normal_quantity,
      additional_quantity: 1,
      reason: item.reason || ''
    };

    setSaveStatus((prev) => ({ ...prev, [key]: { saving: true, success: '', error: '' } }));

    try {
      const payload = {
        customer_id: item.customer_id,
        product_id: item.product_id,
        target_product_id: draft.target_product_id || item.product_id,
        subscription_id: item.subscription_id,
        delivery_date: selectedDate,
        requirement_type: draft.requirement_type,
        normal_quantity: item.normal_quantity,
        required_quantity: draft.requirement_type === 'CHANGE_QUANTITY' ? Number(draft.required_quantity) : null,
        additional_quantity: draft.requirement_type === 'ADD_EXTRA_QUANTITY' ? Number(draft.additional_quantity) : 0,
        reason: draft.reason?.trim() || ''
      };

      const res = await api.post('/daily-requirements', payload);

      setSaveStatus((prev) => ({
        ...prev,
        [key]: { saving: false, success: res.message || 'Saved!', error: '' }
      }));

      // Refresh list & summary metrics
      const [updatedItems, updatedSum] = await Promise.all([
        api.get(`/daily-requirements?date=${selectedDate}`),
        api.get(`/daily-requirements/summary?date=${selectedDate}`)
      ]);
      setItems(updatedItems);
      setSummary(updatedSum);

      setTimeout(() => {
        setSaveStatus((prev) => ({
          ...prev,
          [key]: { saving: false, success: '', error: '' }
        }));
      }, 3000);
    } catch (err) {
      setSaveStatus((prev) => ({
        ...prev,
        [key]: { saving: false, success: '', error: err.message || 'Failed to save.' }
      }));
    }
  };

  const handleClearToNormal = async (item) => {
    const key = `${item.customer_id}_${item.product_id}`;
    handleDraftChange(key, 'requirement_type', 'NORMAL');
    handleDraftChange(key, 'target_product_id', item.product_id);
    handleDraftChange(key, 'reason', '');
    handleDraftChange(key, 'required_quantity', item.normal_quantity);

    setSaveStatus((prev) => ({ ...prev, [key]: { saving: true, success: '', error: '' } }));

    try {
      await api.post('/daily-requirements', {
        customer_id: item.customer_id,
        product_id: item.product_id,
        target_product_id: item.product_id,
        subscription_id: item.subscription_id,
        delivery_date: selectedDate,
        requirement_type: 'NORMAL',
        normal_quantity: item.normal_quantity
      });

      setSaveStatus((prev) => ({
        ...prev,
        [key]: { saving: false, success: 'Reset to normal!', error: '' }
      }));

      const [updatedItems, updatedSum] = await Promise.all([
        api.get(`/daily-requirements?date=${selectedDate}`),
        api.get(`/daily-requirements/summary?date=${selectedDate}`)
      ]);
      setItems(updatedItems);
      setSummary(updatedSum);

      setTimeout(() => {
        setSaveStatus((prev) => ({
          ...prev,
          [key]: { saving: false, success: '', error: '' }
        }));
      }, 3000);
    } catch (err) {
      setSaveStatus((prev) => ({
        ...prev,
        [key]: { saving: false, success: '', error: err.message || 'Failed to clear.' }
      }));
    }
  };

  const handleStepDay = (deltaDays) => {
    const parts = (selectedDate || todayStr).split('-');
    const current = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    current.setDate(current.getDate() + deltaDays);
    const newDateStr = getLocalDateString(current);
    setSelectedDate(newDateStr);
  };

  // Quick reason presets
  const quickReasons = [
    'Customer out of station',
    'Customer requested 500ml',
    'Guest visiting - extra milk',
    'Changed milk brand today',
    'Customer requested Curd today',
    'Do not deliver today',
    'Customer called in morning'
  ];

  // Unique routes from items
  const availableRoutes = Array.from(new Set(items.map((it) => it.customer_route).filter(Boolean)));

  // Group all items by Apartment / Villa Zone
  const allZoneGroups = useMemo(() => {
    const map = new Map();

    // 1. Initialize known database zones
    for (const z of zones) {
      map.set(`zone_${z.id}`, {
        key: `zone_${z.id}`,
        id: z.id,
        name: z.name,
        address: z.address || 'Bangalore',
        route_order: z.route_order || 0,
        type: 'ZONE',
        items: []
      });
    }

    // Special groups
    const unassignedGroup = {
      key: 'unassigned',
      id: null,
      name: 'Independent Houses / Unassigned',
      address: 'General Route Area',
      route_order: 999,
      type: 'UNASSIGNED',
      items: []
    };

    // 2. Distribute all items into zone groups
    for (const it of items) {
      if (it.zone_id && map.has(`zone_${it.zone_id}`)) {
        map.get(`zone_${it.zone_id}`).items.push(it);
      } else if (it.zone_name) {
        let found = false;
        for (const [k, zObj] of map.entries()) {
          if (zObj.name.toLowerCase() === it.zone_name.toLowerCase()) {
            zObj.items.push(it);
            found = true;
            break;
          }
        }
        if (!found) unassignedGroup.items.push(it);
      } else {
        unassignedGroup.items.push(it);
      }
    }

    const allGroups = Array.from(map.values());
    if (unassignedGroup.items.length > 0) {
      allGroups.push(unassignedGroup);
    }

    // Sort zones by route_order
    allGroups.sort((a, b) => (a.route_order || 0) - (b.route_order || 0));

    return allGroups.map((g) => {
      const custSet = new Set(g.items.map((it) => it.customer_id));
      let specialCount = 0;
      let skipCount = 0;
      let qtyChangeCount = 0;
      let extraCount = 0;

      for (const it of g.items) {
        const k = `${it.customer_id}_${it.product_id}`;
        const dr = drafts[k] || {};
        const eff = dr.requirement_type || it.requirement_type || 'NORMAL';
        if (eff !== 'NORMAL') specialCount++;
        if (eff === 'SKIP_DELIVERY') skipCount++;
        if (eff === 'CHANGE_QUANTITY') qtyChangeCount++;
        if (eff === 'ADD_EXTRA_QUANTITY') extraCount++;
      }

      // Sort items within zone by flat number / serial number
      const sortedItems = [...g.items].sort((a, b) => {
        if (a.customer_serial_no && b.customer_serial_no && a.customer_serial_no !== b.customer_serial_no) {
          return a.customer_serial_no - b.customer_serial_no;
        }
        if (a.flat_no && b.flat_no) {
          return a.flat_no.localeCompare(b.flat_no, undefined, { numeric: true });
        }
        return (a.customer_name || '').localeCompare(b.customer_name || '');
      });

      return {
        ...g,
        items: sortedItems,
        totalCustomers: custSet.size,
        totalItems: sortedItems.length,
        specialCount,
        skipCount,
        qtyChangeCount,
        extraCount
      };
    });
  }, [zones, items, drafts]);

  // Active Zone when one is clicked / selected
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

  // Level 2: Filtered customer items in the active zone
  const filteredActiveZoneItems = useMemo(() => {
    if (!activeZone) return [];
    return activeZone.items.filter((it) => {
      const key = `${it.customer_id}_${it.product_id}`;
      const draft = drafts[key] || {};
      const effectiveType = draft.requirement_type || it.requirement_type || 'NORMAL';

      const q = customerSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        it.customer_name?.toLowerCase().includes(q) ||
        it.customer_phone?.includes(q) ||
        it.customer_address?.toLowerCase().includes(q) ||
        it.flat_no?.toLowerCase().includes(q) ||
        it.product_name?.toLowerCase().includes(q) ||
        it.target_product_name?.toLowerCase().includes(q);

      const matchesDboy = !selectedDeliveryBoy || String(it.delivery_boy_id) === String(selectedDeliveryBoy);
      const matchesRoute = !selectedRoute || it.customer_route === selectedRoute;

      let matchesType = true;
      if (selectedReqFilter === 'SPECIAL') {
        matchesType = effectiveType !== 'NORMAL';
      } else if (selectedReqFilter === 'NORMAL') {
        matchesType = effectiveType === 'NORMAL';
      } else if (selectedReqFilter !== 'ALL') {
        matchesType = effectiveType === selectedReqFilter;
      }

      return matchesSearch && matchesDboy && matchesRoute && matchesType;
    });
  }, [activeZone, drafts, customerSearch, selectedDeliveryBoy, selectedRoute, selectedReqFilter]);

  return (
    <div className="page-wrapper">
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardList size={26} color="var(--primary)" />
            Daily Delivery Requirements
          </h1>
          <p className="page-subtitle">
            Update special customer delivery requirements (Skip, Change Quantity, Product Switch, Add Extra) for today or any future date.
          </p>
        </div>

        {/* Date Selector Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleStepDay(-1)}
            className="btn btn-outline btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            title="Previous Day"
          >
            <ChevronLeft size={16} /> Prev
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'white', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '6px 12px' }}>
            <Calendar size={16} color="var(--primary)" />
            <input
              type="date"
              className="form-input"
              style={{ border: 'none', padding: '2px 4px', fontSize: '0.875rem', fontWeight: '700', outline: 'none' }}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          <button
            onClick={() => setSelectedDate(todayStr)}
            className={`btn btn-sm ${selectedDate === todayStr ? 'btn-primary' : 'btn-outline'}`}
            title="Set date to Today"
          >
            Today
          </button>

          <button
            onClick={() => handleStepDay(1)}
            className="btn btn-outline btn-sm"
            style={{ fontWeight: '700', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            title="Next Day"
          >
            Next Day <ChevronRight size={16} />
          </button>

          <button
            onClick={handleOpenBulkModal}
            className="btn btn-warning btn-sm"
            style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(245,158,11,0.25)' }}
            title="Create bulk orders for hotels/restaurants by clicking products"
          >
            <ShoppingBag size={16} /> Bulk Order Requirement
          </button>

          <button onClick={fetchData} className="btn btn-outline btn-sm" title="Refresh requirements">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {/* Daily Summary Metrics */}
      <div className="stat-grid" style={{ marginBottom: '20px' }}>
        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid var(--primary)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>
            Total Customers
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
            {summary.totalCustomers || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            {summary.totalDeliveries || 0} scheduled deliveries
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #f59e0b', background: summary.specialRequirements > 0 ? '#fffbeb' : 'white' }}>
          <div style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: '700', textTransform: 'uppercase' }}>
            Special Requirements
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#d97706', marginTop: '2px' }}>
            {summary.specialRequirements || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#92400e' }}>
            Active changes for {selectedDate}
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: '700', textTransform: 'uppercase' }}>
            Skip Deliveries
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#dc2626', marginTop: '2px' }}>
            {summary.skipDeliveries || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#991b1b' }}>
            Customers skipping today
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #0054a6' }}>
          <div style={{ fontSize: '0.75rem', color: '#0054a6', fontWeight: '700', textTransform: 'uppercase' }}>
            Quantity Changes
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0284c7', marginTop: '2px' }}>
            {summary.quantityChanges || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#0369a1' }}>
            Modified quantities & product switches
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '0.75rem', color: '#047857', fontWeight: '700', textTransform: 'uppercase' }}>
            Extra Quantity
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#10b981', marginTop: '2px' }}>
            {summary.extraQuantity || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#065f46' }}>
            Added additional milk/product packets
          </div>
        </div>
      </div>

      {/* Loading & Error States */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <RefreshCw size={28} className="spin" color="var(--primary)" />
          <div style={{ marginTop: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
            Loading daily requirements for {selectedDate}...
          </div>
        </div>
      ) : error ? (
        <div className="card" style={{ color: 'var(--accent-red)', padding: '24px', textAlign: 'center' }}>
          {error}
        </div>
      ) : !activeZone ? (
        /* ========================================================================= */
        /* LEVEL 1: ALL ZONES OVERVIEW                                               */
        /* ========================================================================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header & Zone Search Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building2 size={20} color="#2563eb" />
                Apartment & Community Zones
              </h2>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '3px 0 0 0' }}>
                Click any zone below to manage customer requirements (skips, quantity changes, product switches) for {selectedDate}.
              </p>
            </div>

            {/* Zone Search Box */}
            <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Search zone or apartment..."
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

                    {/* Middle: Metrics and Special Requirement Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#475569' }}>
                        <span style={{ color: '#0f172a', fontWeight: '800' }}>{zone.totalCustomers}</span> Customers • <span style={{ color: '#0f172a', fontWeight: '800' }}>{zone.totalItems}</span> Scheduled
                      </div>

                      {zone.specialCount > 0 && (
                        <span style={{
                          background: '#fef3c7',
                          color: '#b45309',
                          border: '1px solid #fde68a',
                          fontSize: '0.75rem',
                          fontWeight: '800',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Sparkles size={12} color="#d97706" />
                          {zone.specialCount} Special Change{zone.specialCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Bottom: Open Zone Action */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingTop: '6px' }}>
                      <span style={{
                        color: '#2563eb',
                        fontSize: '0.84rem',
                        fontWeight: '800',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        Open Requirements <ChevronRight size={16} />
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
        /* LEVEL 2: ACTIVE ZONE CUSTOMER REQUIREMENTS                                */
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
                {activeZone.totalCustomers} Customer{activeZone.totalCustomers !== 1 ? 's' : ''} • {activeZone.totalItems} Scheduled
              </span>

              {activeZone.specialCount > 0 && (
                <span style={{
                  background: '#fef3c7',
                  color: '#b45309',
                  border: '1px solid #fde68a',
                  fontSize: '0.84rem',
                  fontWeight: '800',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <Sparkles size={14} color="#d97706" />
                  {activeZone.specialCount} Special Change{activeZone.specialCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Active Zone Customer Filter Toolbar */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'center' }}>
              {/* Customer Search Box */}
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search customer, flat #, phone, product..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  style={{ paddingLeft: '36px' }}
                />
                <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>

              {/* Requirement Type Filter */}
              <div>
                <select
                  className="form-input"
                  value={selectedReqFilter}
                  onChange={(e) => setSelectedReqFilter(e.target.value)}
                  style={{ fontWeight: '700' }}
                >
                  <option value="ALL">All Requirements ({activeZone.items.length})</option>
                  <option value="SPECIAL">Special Requirements Only ({activeZone.specialCount})</option>
                  <option value="NORMAL">Normal Subscription Only</option>
                  <option value="SKIP_DELIVERY">Skip Deliveries ({activeZone.skipCount})</option>
                  <option value="CHANGE_QUANTITY">Quantity Changes ({activeZone.qtyChangeCount})</option>
                  <option value="ADD_EXTRA_QUANTITY">Extra Quantity ({activeZone.extraCount})</option>
                </select>
              </div>

              {/* Delivery Boy Filter */}
              {deliveryBoys.length > 0 && (
                <div>
                  <select
                    className="form-input"
                    value={selectedDeliveryBoy}
                    onChange={(e) => setSelectedDeliveryBoy(e.target.value)}
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

              {/* Route Filter */}
              {availableRoutes.length > 1 && (
                <div>
                  <select
                    className="form-input"
                    value={selectedRoute}
                    onChange={(e) => setSelectedRoute(e.target.value)}
                  >
                    <option value="">All Routes</option>
                    {availableRoutes.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Customer Requirement Cards */}
          {filteredActiveZoneItems.length === 0 ? (
            <div style={{ background: 'white', padding: '40px', textAlign: 'center', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#64748b' }}>
              No customers found in <strong>{activeZone.name}</strong> matching your search/filter criteria.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredActiveZoneItems.map((item) => {
                const key = `${item.customer_id}_${item.product_id}`;
                const draft = drafts[key] || {
                  requirement_type: item.requirement_type || 'NORMAL',
                  target_product_id: item.product_id,
                  required_quantity: item.normal_quantity,
                  additional_quantity: 1,
                  reason: item.reason || ''
                };
                const statusInfo = saveStatus[key] || {};
                const isSpecial = draft.requirement_type !== 'NORMAL';
                const isSkipped = draft.requirement_type === 'SKIP_DELIVERY';
                const isQtyChange = draft.requirement_type === 'CHANGE_QUANTITY';
                const isExtra = draft.requirement_type === 'ADD_EXTRA_QUANTITY';
                const isProductSwitched = draft.target_product_id && Number(draft.target_product_id) !== Number(item.product_id);
                const targetProdObj = products.find((p) => p.id === Number(draft.target_product_id)) || item;

                return (
                  <div
                    key={key}
                    style={{
                      padding: '16px 18px',
                      borderRadius: '12px',
                      border: isSpecial ? '1.5px solid #93c5fd' : '1px solid #e2e8f0',
                      borderLeft: `5px solid ${
                        isSkipped
                          ? '#ef4444'
                          : isQtyChange
                          ? '#0284c7'
                          : isExtra
                          ? '#10b981'
                          : '#3b82f6'
                      }`,
                      background: isSkipped ? '#fef2f2' : isSpecial ? '#ffffff' : 'white',
                      boxShadow: isSpecial ? '0 4px 12px rgba(37,99,235,0.06)' : '0 1px 3px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', alignItems: 'flex-start' }}>
                      {/* Customer & Product Info with Flat Number */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          {/* Flat / Villa Number Chip */}
                          <span style={{
                            background: '#0054a6',
                            color: 'white',
                            fontWeight: '900',
                            fontSize: '0.78rem',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            letterSpacing: '-0.01em'
                          }}>
                            {item.flat_no ? (item.flat_no.toLowerCase().includes('villa') ? item.flat_no : `Flat ${item.flat_no}`) : `Stop #${item.customer_serial_no || item.customer_id}`}
                          </span>

                          <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                            {item.customer_name}
                          </h3>

                          {item.billing_type === 'COUPON' ? (
                            <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontSize: '0.68rem' }}>
                              Coupon
                            </span>
                          ) : item.billing_type === 'WEEKLY' ? (
                            <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', fontSize: '0.68rem' }}>
                              Weekly
                            </span>
                          ) : item.billing_type === 'DAILY' ? (
                            <span className="badge" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', fontSize: '0.68rem' }}>
                              Daily Payment
                            </span>
                          ) : (
                            <span className={`badge ${item.billing_type === 'PREPAID' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.68rem' }}>
                              {item.billing_type === 'PREPAID' ? 'Prepaid (Advance)' : 'Postpaid'}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          <MapPin size={13} />
                          <span>{item.customer_address}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          <span>Phone: <strong>{item.customer_phone || 'N/A'}</strong></span>
                          <span>•</span>
                          <span>Route: <strong>{item.customer_route || 'General'}</strong></span>
                          <span>•</span>
                          <span>Agent: <strong>{item.delivery_boy_name || 'Unassigned'}</strong></span>
                        </div>

                        <div style={{ marginTop: '10px', padding: '6px 10px', background: '#f1f5f9', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '800', color: 'var(--primary-dark)', fontSize: '0.875rem' }}>
                            {item.product_name} ({item.variant_label})
                          </span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Normal: <strong>{item.normal_quantity} pkt</strong> (@ ₹{item.selling_price})
                          </span>
                        </div>
                      </div>

                      {/* Requirement Control Form */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: '800', color: '#475569', minWidth: '130px' }}>
                            Today's Requirement:
                          </label>
                          <select
                            className="form-input"
                            style={{
                              flex: '1 1 180px',
                              fontWeight: '700',
                              color: isSkipped ? '#b91c1c' : isSpecial ? '#0369a1' : '#1e293b',
                              background: isSkipped ? '#fee2e2' : isSpecial ? '#e0f2fe' : 'white',
                              borderColor: isSkipped ? '#fca5a5' : isSpecial ? '#7dd3fc' : 'var(--border-color)'
                            }}
                            value={draft.requirement_type}
                            onChange={(e) => handleDraftChange(key, 'requirement_type', e.target.value)}
                          >
                            <option value="NORMAL">NORMAL (Deliver {item.normal_quantity} × {item.product_name})</option>
                            <option value="SKIP_DELIVERY">SKIP DELIVERY (Do not deliver today)</option>
                            <option value="CHANGE_QUANTITY">CHANGE QUANTITY / PRODUCT (Deliver different qty or product)</option>
                            <option value="ADD_EXTRA_QUANTITY">ADD EXTRA QUANTITY (Add extra)</option>
                          </select>
                        </div>

                        {/* Quantity & Product Adjustment Controls */}
                        {(isQtyChange || isExtra) && (
                          <div style={{
                            background: isQtyChange ? '#e0f2fe' : '#ecfdf5',
                            border: `1px solid ${isQtyChange ? '#bae6fd' : '#bbf7d0'}`,
                            borderRadius: '6px',
                            padding: '10px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}>
                            {/* Product Selector Dropdown */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <label style={{ fontSize: '0.78rem', fontWeight: '800', color: isQtyChange ? '#0369a1' : '#065f46', minWidth: '90px' }}>
                                <ShoppingBag size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                Product:
                              </label>
                              <select
                                className="form-input"
                                style={{ flex: '1 1 190px', padding: '4px 8px', fontSize: '0.813rem', fontWeight: '700' }}
                                value={draft.target_product_id || item.product_id}
                                onChange={(e) => handleDraftChange(key, 'target_product_id', Number(e.target.value))}
                              >
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.variant_label}) — ₹{p.selling_price} {p.id === item.product_id ? '(Normal Subscribed)' : ''}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Quantity Selector */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: '800', color: isQtyChange ? '#0369a1' : '#065f46', minWidth: '90px' }}>
                                {isQtyChange ? "Today's Qty:" : "Extra Qty (+):"}
                              </span>
                              <input
                                type="number"
                                min="1"
                                max="50"
                                className="form-input"
                                style={{ width: '80px', padding: '4px 8px', fontWeight: '800', textAlign: 'center' }}
                                value={isQtyChange ? draft.required_quantity : draft.additional_quantity}
                                onChange={(e) => handleDraftChange(key, isQtyChange ? 'required_quantity' : 'additional_quantity', e.target.value)}
                              />

                              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: isQtyChange ? '#0369a1' : '#047857' }}>
                                {isQtyChange ? (
                                  isProductSwitched ? (
                                    `Delivering ${draft.required_quantity} pkt of ${targetProdObj.name} (${targetProdObj.variant_label})`
                                  ) : (
                                    `(Normal was ${item.normal_quantity} pkt)`
                                  )
                                ) : (
                                  `Total Today: ${Number(item.normal_quantity) + Number(draft.additional_quantity || 0)} pkt`
                                )}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Reason / Note input with Quick Chips */}
                        {isSpecial && (
                          <div>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Enter reason or note for Delivery Boy (e.g. Requested 500ml, Changed brand, Out of station)..."
                              value={draft.reason}
                              onChange={(e) => handleDraftChange(key, 'reason', e.target.value)}
                              style={{ fontSize: '0.813rem' }}
                            />

                            {/* Quick Suggestion Chips */}
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                              {quickReasons.map((qr) => (
                                <button
                                  key={qr}
                                  type="button"
                                  onClick={() => handleDraftChange(key, 'reason', qr)}
                                  style={{
                                    border: '1px solid #cbd5e1',
                                    background: '#f8fafc',
                                    borderRadius: '4px',
                                    padding: '2px 6px',
                                    fontSize: '0.68rem',
                                    color: '#475569',
                                    cursor: 'pointer'
                                  }}
                                >
                                  + {qr}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions & Live Status */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {item.requirement_type && item.requirement_type !== 'NORMAL' && (
                            <button
                              onClick={() => handleClearToNormal(item)}
                              className="btn btn-outline btn-sm"
                              disabled={statusInfo.saving}
                              title="Restore normal subscription"
                            >
                              <RotateCcw size={14} /> Clear
                            </button>
                          )}

                          <button
                            onClick={() => handleSaveRequirement(item)}
                            className="btn btn-primary btn-sm"
                            disabled={statusInfo.saving}
                            style={{ fontWeight: '700' }}
                          >
                            <Save size={14} />
                            {statusInfo.saving ? 'Saving...' : 'Save'}
                          </button>
                        </div>

                        {statusInfo.success && (
                          <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={14} /> {statusInfo.success}
                          </span>
                        )}

                        {statusInfo.error && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)', fontWeight: '700' }}>
                            {statusInfo.error}
                          </span>
                        )}

                        {/* Requirement Status Indicator */}
                        <div style={{ marginTop: '4px' }}>
                          {isSkipped ? (
                            <span className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <XCircle size={12} /> SKIPPING TODAY
                            </span>
                          ) : isQtyChange ? (
                            <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <TrendingUp size={12} />
                              {isProductSwitched ? (
                                `SWITCH: ${targetProdObj.name} × ${draft.required_quantity}`
                              ) : (
                                `QTY: ${draft.required_quantity} (was ${item.normal_quantity})`
                              )}
                            </span>
                          ) : isExtra ? (
                            <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <PlusCircle size={12} /> EXTRA: +{draft.additional_quantity}
                            </span>
                          ) : (
                            <span className="badge badge-gray">NORMAL DELIVERY</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* BULK ORDER REQUIREMENT MODAL */}
      <Modal
        isOpen={isBulkModalOpen}
        onClose={() => !bulkSaving && setIsBulkModalOpen(false)}
        title="Add Bulk Order Requirement (Click Products)"
        maxWidth="680px"
      >
        <form onSubmit={handleSubmitBulkOrder} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {bulkError && (
            <div style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', fontWeight: '600' }}>
              {bulkError}
            </div>
          )}

          {bulkSuccess && (
            <div style={{ padding: '10px 14px', background: '#dcfce7', border: '1px solid #4ade80', color: '#166534', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} color="#16a34a" /> {bulkSuccess}
            </div>
          )}

          {/* Customer & Date Selection */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: '700' }}>Select Customer *</label>
              <select
                className="form-input"
                value={bulkForm.customer_id}
                onChange={(e) => handleBulkCustomerChange(e.target.value)}
                required
              >
                <option value="">-- Choose Customer --</option>
                {allCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.customer_category === 'BULK_HOTEL' ? '🏨 [BULK] ' : '🏠 '}
                    {c.name} ({c.route || 'No Route'} - {c.address})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: '700' }}>Delivery Date *</label>
              <input
                type="date"
                className="form-input"
                value={bulkForm.delivery_date}
                onChange={(e) => setBulkForm({ ...bulkForm, delivery_date: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Delivery Boy Selection */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: '700' }}>Assign Delivery Boy *</label>
            <select
              className="form-input"
              value={bulkForm.delivery_boy_id}
              onChange={(e) => setBulkForm({ ...bulkForm, delivery_boy_id: e.target.value })}
            >
              <option value="">-- Assigned Route Delivery Boy --</option>
              {deliveryBoys.map((dboy) => (
                <option key={dboy.id} value={dboy.id}>
                  {dboy.name} ({dboy.assigned_route || 'All Routes'})
                </option>
              ))}
            </select>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              This bulk order will immediately appear in this delivery boy's live delivery queue.
            </span>
          </div>

          {/* PRODUCT CLICKER SECTION */}
          <div style={{ background: '#f8fafc', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: '800', fontSize: '0.9rem', color: 'var(--primary-dark)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Package size={16} />
              Click Products to Add to Bulk Order:
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '160px', overflowY: 'auto', padding: '4px' }}>
              {products.map((p) => {
                const isSelected = bulkForm.items.some((it) => it.product_id === p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleAddProductToBulk(p)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1.5px solid',
                      borderColor: isSelected ? 'var(--primary)' : 'var(--border-color)',
                      background: isSelected ? '#e0f2fe' : 'white',
                      color: isSelected ? 'var(--primary-dark)' : 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Plus size={13} color={isSelected ? 'var(--primary)' : '#64748b'} />
                    <span>{p.name} ({p.variant_label})</span>
                    <span style={{ color: '#059669' }}>₹{p.selling_price}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SELECTED BULK ITEMS TABLE */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: '700', display: 'flex', justifyContent: 'space-between' }}>
              <span>Selected Products & Bulk Quantities ({bulkForm.items.length} items)</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Enter exact required packets/units</span>
            </label>

            {bulkForm.items.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', background: '#f8fafc', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No products selected yet. Click any product above to add.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                {bulkForm.items.map((it) => (
                  <div
                    key={it.product_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'white',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 12px',
                      gap: '10px'
                    }}
                  >
                    <div style={{ flex: '1 1 auto' }}>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>
                        {it.product_name} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({it.variant_label})</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        ₹{it.selling_price} each • Subtotal: <strong style={{ color: 'var(--primary-dark)' }}>₹{(it.selling_price * it.quantity).toFixed(2)}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleBulkItemQtyChange(it.product_id, Math.max(1, it.quantity - 5))}
                        style={{ width: '28px', height: '28px', borderRadius: '4px', border: '1px solid var(--border-color)', background: '#f8fafc', cursor: 'pointer', fontWeight: '800' }}
                        title="-5 units"
                      >
                        -
                      </button>

                      <input
                        type="number"
                        min="1"
                        max="5000"
                        className="form-input"
                        value={it.quantity}
                        onChange={(e) => handleBulkItemQtyChange(it.product_id, e.target.value)}
                        style={{ width: '70px', textAlign: 'center', fontWeight: '800', padding: '4px 6px' }}
                      />

                      <button
                        type="button"
                        onClick={() => handleBulkItemQtyChange(it.product_id, it.quantity + 5)}
                        style={{ width: '28px', height: '28px', borderRadius: '4px', border: '1px solid var(--border-color)', background: '#f8fafc', cursor: 'pointer', fontWeight: '800' }}
                        title="+5 units"
                      >
                        +
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveBulkItem(it.product_id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', marginLeft: '4px' }}
                        title="Remove product"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary & Price preview */}
          {bulkForm.items.length > 0 && (
            <div style={{
              background: '#f1f5f9',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1.5px dashed #cbd5e1'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>Total Items / Packets:</span>
                <span style={{ fontWeight: '800' }}>{bulkForm.items.reduce((s, it) => s + it.quantity, 0)} units</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px', borderTop: '1px solid #cbd5e1', paddingTop: '6px' }}>
                <span>Estimated Bulk Order Value:</span>
                <span style={{ color: 'var(--primary-dark)' }}>
                  ₹{bulkForm.items.reduce((s, it) => s + (it.selling_price * it.quantity), 0).toFixed(2)}
                </span>
              </div>
              <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#065f46', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}>
                <Sparkles size={14} color="#059669" />
                Visible directly to the Delivery Boy as a Pending Delivery with exact bulk quantities.
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: '700' }}>Bulk Order Notes / Occasion</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Hotel Grand Morning Breakfast, Event catering, etc."
              value={bulkForm.notes}
              onChange={(e) => setBulkForm({ ...bulkForm, notes: e.target.value })}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setIsBulkModalOpen(false)}
              className="btn btn-outline"
              disabled={bulkSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px', minWidth: '220px', justifyContent: 'center' }}
              disabled={bulkSaving}
            >
              {bulkSaving ? (
                <span>Creating Bulk Order...</span>
              ) : (
                <>
                  <CheckCircle2 size={16} /> Save & Send to Delivery Boy
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
