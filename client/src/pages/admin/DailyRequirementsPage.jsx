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
  Layers
} from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';

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

  // Filter & Search state
  const [search, setSearch] = useState('');
  const [selectedDeliveryBoy, setSelectedDeliveryBoy] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedReqFilter, setSelectedReqFilter] = useState('ALL'); // 'ALL' | 'SPECIAL' | 'NORMAL' | 'SKIP_DELIVERY' | 'CHANGE_QUANTITY' | 'ADD_EXTRA_QUANTITY'
  const [selectedZoneFilter, setSelectedZoneFilter] = useState('ALL'); // 'ALL' | zoneId | 'BULK' | 'UNASSIGNED'
  const [collapsedZones, setCollapsedZones] = useState({}); // { [zoneKey]: boolean }

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

  // Accordion collapse helpers
  const toggleZoneCollapse = (zoneKey) => {
    setCollapsedZones((prev) => ({ ...prev, [zoneKey]: !prev[zoneKey] }));
  };

  const expandAllZones = () => setCollapsedZones({});
  
  const collapseAllZones = () => {
    const allKeys = {};
    zoneGroups.forEach((g) => { allKeys[g.key] = true; });
    setCollapsedZones(allKeys);
  };

  // Group items by Apartment / Villa Zone
  const zoneGroups = useMemo(() => {
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

    const bulkGroup = {
      key: 'bulk',
      id: 'bulk',
      name: 'Bulk & Commercial Daily Accounts',
      address: 'Hotels, Restaurants & Commercial Accounts',
      route_order: 1000,
      type: 'BULK',
      items: []
    };

    // 2. Filter items and place into appropriate zone group
    for (const it of items) {
      const key = `${it.customer_id}_${it.product_id}`;
      const draft = drafts[key] || {};
      const effectiveType = draft.requirement_type || it.requirement_type || 'NORMAL';

      const matchesSearch =
        it.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        it.customer_phone?.includes(search) ||
        it.customer_address?.toLowerCase().includes(search.toLowerCase()) ||
        it.flat_no?.toLowerCase().includes(search.toLowerCase()) ||
        it.zone_name?.toLowerCase().includes(search.toLowerCase()) ||
        it.product_name?.toLowerCase().includes(search.toLowerCase()) ||
        it.target_product_name?.toLowerCase().includes(search.toLowerCase());

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

      if (!matchesSearch || !matchesDboy || !matchesRoute || !matchesType) {
        continue;
      }

      // Filter by selectedZoneFilter
      if (selectedZoneFilter !== 'ALL') {
        if (selectedZoneFilter === 'BULK') {
          if (it.customer_category !== 'BULK_HOTEL') continue;
        } else if (selectedZoneFilter === 'UNASSIGNED') {
          if (it.customer_category === 'BULK_HOTEL' || it.zone_id) continue;
        } else {
          if (String(it.zone_id) !== String(selectedZoneFilter)) continue;
        }
      }

      // Distribute item into zone group
      if (it.customer_category === 'BULK_HOTEL') {
        bulkGroup.items.push(it);
      } else if (it.zone_id && map.has(`zone_${it.zone_id}`)) {
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
    if (unassignedGroup.items.length > 0 || selectedZoneFilter === 'UNASSIGNED') {
      allGroups.push(unassignedGroup);
    }
    if (bulkGroup.items.length > 0 || selectedZoneFilter === 'BULK') {
      allGroups.push(bulkGroup);
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
  }, [zones, items, drafts, search, selectedDeliveryBoy, selectedRoute, selectedReqFilter, selectedZoneFilter]);

  // Visible groups with items, or the explicitly selected zone
  const visibleZoneGroups = useMemo(() => {
    if (selectedZoneFilter !== 'ALL') {
      return zoneGroups.filter((g) => {
        if (selectedZoneFilter === 'BULK') return g.type === 'BULK';
        if (selectedZoneFilter === 'UNASSIGNED') return g.type === 'UNASSIGNED';
        return String(g.id) === String(selectedZoneFilter);
      });
    }
    return zoneGroups.filter((g) => g.items.length > 0);
  }, [zoneGroups, selectedZoneFilter]);

  const totalMatchingItems = useMemo(() => {
    return visibleZoneGroups.reduce((acc, g) => acc + g.items.length, 0);
  }, [visibleZoneGroups]);

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

      {/* Search & Filter Toolbar */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'center' }}>
          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Search customer, phone, or product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          </div>

          {/* Delivery Boy Filter */}
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

          {/* Route Filter */}
          <div>
            <select
              className="form-input"
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
            >
              <option value="">All Routes</option>
              {availableRoutes.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Requirement Type Filter */}
          <div>
            <select
              className="form-input"
              value={selectedReqFilter}
              onChange={(e) => setSelectedReqFilter(e.target.value)}
              style={{ fontWeight: '600' }}
            >
              <option value="ALL">All Requirements ({items.length})</option>
              <option value="SPECIAL">Special Requirements Only ({summary.specialRequirements || 0})</option>
              <option value="NORMAL">Normal Subscription Only</option>
              <option value="SKIP_DELIVERY">Skip Deliveries ({summary.skipDeliveries || 0})</option>
              <option value="CHANGE_QUANTITY">Quantity Changes ({summary.quantityChanges || 0})</option>
              <option value="ADD_EXTRA_QUANTITY">Extra Quantity ({summary.extraQuantity || 0})</option>
            </select>
          </div>

          {/* Zone Filter Dropdown */}
          <div>
            <select
              className="form-input"
              value={selectedZoneFilter}
              onChange={(e) => setSelectedZoneFilter(e.target.value)}
              style={{ fontWeight: '700', color: '#1e293b' }}
            >
              <option value="ALL">🏢 All Zones ({zones.length + 2})</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} {z.address ? `(${z.address})` : ''}
                </option>
              ))}
              <option value="BULK">🍽️ Bulk & Commercial Accounts</option>
              <option value="UNASSIGNED">🏠 Independent Houses / Unassigned</option>
            </select>
          </div>
        </div>
      </div>

      {/* Zone Quick Switcher Tabs & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '4px', maxWidth: '100%' }}>
          <button
            type="button"
            onClick={() => setSelectedZoneFilter('ALL')}
            style={{
              padding: '6px 14px',
              borderRadius: '999px',
              fontSize: '0.8rem',
              fontWeight: '800',
              border: selectedZoneFilter === 'ALL' ? '2px solid #2563eb' : '1px solid #cbd5e1',
              background: selectedZoneFilter === 'ALL' ? '#eff6ff' : 'white',
              color: selectedZoneFilter === 'ALL' ? '#1d4ed8' : '#475569',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Layers size={14} /> All Zones ({zoneGroups.filter((g) => g.items.length > 0).length})
          </button>

          {zoneGroups.filter((g) => g.items.length > 0).map((g) => {
            const isSelected = selectedZoneFilter === (g.id ? String(g.id) : g.type === 'BULK' ? 'BULK' : 'UNASSIGNED');
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => setSelectedZoneFilter(isSelected ? 'ALL' : (g.id ? String(g.id) : g.type === 'BULK' ? 'BULK' : 'UNASSIGNED'))}
                style={{
                  padding: '6px 14px',
                  borderRadius: '999px',
                  fontSize: '0.8rem',
                  fontWeight: '800',
                  border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                  background: isSelected ? '#eff6ff' : 'white',
                  color: isSelected ? '#1d4ed8' : '#475569',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {g.type === 'BULK' ? <ShoppingBag size={13} color="#d97706" /> : g.type === 'UNASSIGNED' ? <Home size={13} color="#64748b" /> : <Building2 size={13} color="#2563eb" />}
                <span>{g.name}</span>
                <span style={{
                  background: isSelected ? '#2563eb' : '#f1f5f9',
                  color: isSelected ? 'white' : '#64748b',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  fontSize: '0.7rem'
                }}>
                  {g.totalCustomers}
                </span>
                {g.specialCount > 0 && (
                  <span style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: '#f59e0b',
                    display: 'inline-block'
                  }} title={`${g.specialCount} special requirements`} />
                )}
              </button>
            );
          })}
        </div>

        {/* Expand / Collapse All Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={expandAllZones}
            style={{
              padding: '5px 12px',
              fontSize: '0.78rem',
              fontWeight: '700',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: 'white',
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            Expand All
          </button>
          <button
            type="button"
            onClick={collapseAllZones}
            style={{
              padding: '5px 12px',
              fontSize: '0.78rem',
              fontWeight: '700',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: 'white',
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Customer Delivery Requirements by Zone */}
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
      ) : visibleZoneGroups.length === 0 || totalMatchingItems === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={`No customers found for ${selectedDate}`}
          description={
            search || selectedReqFilter !== 'ALL' || selectedZoneFilter !== 'ALL'
              ? 'No customer requirements match your active search and filter criteria.'
              : 'No active subscriptions scheduled for this date.'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {visibleZoneGroups.map((group) => {
            const isCollapsed = Boolean(collapsedZones[group.key]);

            return (
              <div
                key={group.key}
                style={{
                  background: 'white',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                  overflow: 'hidden'
                }}
              >
                {/* Zone Section Header Banner */}
                <div
                  onClick={() => toggleZoneCollapse(group.key)}
                  style={{
                    padding: '14px 20px',
                    background: isCollapsed ? '#ffffff' : '#f8fafc',
                    borderBottom: isCollapsed ? 'none' : '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Zone Badge / Thumbnail */}
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      background: group.type === 'BULK' ? '#fef3c7' : group.type === 'UNASSIGNED' ? '#f1f5f9' : '#eff6ff',
                      color: group.type === 'BULK' ? '#d97706' : group.type === 'UNASSIGNED' ? '#64748b' : '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {group.type === 'BULK' ? <ShoppingBag size={22} /> : group.type === 'UNASSIGNED' ? <Home size={22} /> : <Building2 size={22} />}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {group.type === 'ZONE' && (
                          <span style={{
                            background: '#2563eb',
                            color: 'white',
                            fontSize: '0.72rem',
                            fontWeight: '900',
                            padding: '2px 8px',
                            borderRadius: '999px'
                          }}>
                            Route #{group.route_order || 1}
                          </span>
                        )}
                        <h2 style={{ fontSize: '1.15rem', fontWeight: '900', color: '#0f172a', margin: 0 }}>
                          {group.name}
                        </h2>
                      </div>
                      {group.address && (
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <MapPin size={13} color="#94a3b8" />
                          <span>{group.address}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Zone Statistics & Collapse Arrow */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      background: '#f1f5f9',
                      color: '#334155',
                      fontSize: '0.8rem',
                      fontWeight: '800',
                      padding: '4px 12px',
                      borderRadius: '8px'
                    }}>
                      {group.totalCustomers} Customer{group.totalCustomers !== 1 ? 's' : ''} • {group.totalItems} Scheduled
                    </span>

                    {group.specialCount > 0 && (
                      <span style={{
                        background: '#fef3c7',
                        color: '#b45309',
                        border: '1px solid #fde68a',
                        fontSize: '0.76rem',
                        fontWeight: '800',
                        padding: '3px 10px',
                        borderRadius: '8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}>
                        <Sparkles size={13} color="#d97706" />
                        {group.specialCount} Special Change{group.specialCount !== 1 ? 's' : ''}
                      </span>
                    )}

                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '6px',
                      background: '#f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#64748b'
                    }}>
                      {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                    </div>
                  </div>
                </div>

                {/* Respected Customers inside this Zone */}
                {!isCollapsed && (
                  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc' }}>
                    {group.items.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', background: 'white', borderRadius: '10px', color: '#64748b', border: '1px dashed #cbd5e1' }}>
                        No deliveries scheduled for <strong>{group.name}</strong> on {selectedDate}.
                      </div>
                    ) : (
                      group.items.map((item) => {
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

                                  <span className={`badge ${item.billing_type === 'PREPAID' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.68rem' }}>
                                    {item.billing_type === 'PREPAID' ? 'Prepaid (Advance)' : 'Postpaid'}
                                  </span>
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
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
