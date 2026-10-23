import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import Modal from '../common/Modal';
import EmptyState from '../common/EmptyState';
import ProductPacketImage from '../ProductPacketImage';
import DeliveryCorrectionModal from './DeliveryCorrectionModal';
import SkipConfirmModal from './SkipConfirmModal';
import {
  Truck,
  CheckCircle2,
  Clock,
  XCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
  Building2,
  Phone,
  Edit3,
  RotateCcw,
  PlusCircle,
  Plus,
  Minus,
  ShoppingBag,
  Sparkles,
  MapPin,
  ArrowLeft,
  ArrowRight,
  Filter,
  Check,
  AlertCircle,
  FileText,
  Layers,
  Home,
  CheckCheck,
  UserPlus,
  Trash2,
  RefreshCw,
  Route as RouteIcon
} from 'lucide-react';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';

// Architectural SVG thumbnails for zone types
function ZoneBuildingThumbnail({ name = '', index = 0 }) {
  const lower = name.toLowerCase();
  const colors = [
    { bg: '#eff6ff', stroke: '#2563eb', accent: '#3b82f6', fill: '#dbeafe' },
    { bg: '#fef3c7', stroke: '#d97706', accent: '#f59e0b', fill: '#fef9c3' },
    { bg: '#f0fdf4', stroke: '#16a34a', accent: '#22c55e', fill: '#dcfce7' },
    { bg: '#faf5ff', stroke: '#7c3aed', accent: '#8b5cf6', fill: '#f3e8ff' },
    { bg: '#fff1f2', stroke: '#e11d48', accent: '#f43f5e', fill: '#ffe4e6' },
    { bg: '#f0fdfa', stroke: '#0d9488', accent: '#14b8a6', fill: '#ccfbf1' }
  ];
  const color = colors[index % colors.length];

  if (lower.includes('villa') || lower.includes('green view')) {
    return (
      <div style={{ width: '64px', height: '64px', borderRadius: '10px', background: color.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${color.fill}` }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M6 22L20 8L34 22H30V32H10V22H6Z" fill={color.fill} stroke={color.stroke} strokeWidth="2" strokeLinejoin="round"/>
          <rect x="16" y="24" width="8" height="8" rx="1" fill={color.stroke}/>
          <rect x="12" y="16" width="4" height="4" rx="0.5" fill={color.accent}/>
          <rect x="24" y="16" width="4" height="4" rx="0.5" fill={color.accent}/>
        </svg>
      </div>
    );
  }

  if (lower.includes('house') || lower.includes('independent')) {
    return (
      <div style={{ width: '64px', height: '64px', borderRadius: '10px', background: color.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${color.fill}` }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M8 20L20 10L32 20V32H8V20Z" fill={color.fill} stroke={color.stroke} strokeWidth="2" strokeLinejoin="round"/>
          <path d="M17 32V22H23V32" fill={color.stroke}/>
          <circle cx="20" cy="16" r="2" fill={color.accent}/>
        </svg>
      </div>
    );
  }

  // Apartment High-Rise Default
  return (
    <div style={{ width: '64px', height: '64px', borderRadius: '10px', background: color.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${color.fill}` }}>
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
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

export default function ZoneBasedDailyDeliveries({ userRole = 'ADMIN', currentUserId = null }) {
  // Core state
  const [deliveries, setDeliveries] = useState([]);
  const [zones, setZones] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // Zone selection & filtering state (persisted in localStorage across page reloads)
  const [selectedZoneKey, setSelectedZoneKey] = useState(() => {
    try {
      return localStorage.getItem('nandini_selected_zone_key') || null;
    } catch {
      return null;
    }
  });
  // Level 3: Individual Customer Selection state
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [zoneSearchQuery, setZoneSearchQuery] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [routeSortOrder, setRouteSortOrder] = useState('ROUTE_ORDER'); // 'ROUTE_ORDER' | 'NAME' | 'PENDING'
  const [selectedRouteFilter, setSelectedRouteFilter] = useState('ALL');
  const [customerStatusFilter, setCustomerStatusFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'DELIVERED' | 'SPECIAL' | 'SKIPPED'
  const [customerCategoryTab, setCustomerCategoryTab] = useState('ALL'); // 'ALL' | 'HOUSE' | 'BULK'
  const [dboyFilter, setDboyFilter] = useState('');

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState(null);
  const [editForm, setEditForm] = useState({ product_id: '', quantity: 1, reason: '' });
  const [editError, setEditError] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Extra product modal
  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);
  const [selectedExtraCustomer, setSelectedExtraCustomer] = useState(null);
  const [extraForm, setExtraForm] = useState({ customer_id: '', product_id: '', quantity: 1, delivery_date: getLocalDateString(), notes: '' });
  const [extraError, setExtraError] = useState('');
  const [submittingExtra, setSubmittingExtra] = useState(false);

  // Correction modal
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);
  const [selectedCorrectionDelivery, setSelectedCorrectionDelivery] = useState(null);

  // Skip modal
  const [isSkipOpen, setIsSkipOpen] = useState(false);
  const [selectedSkipTarget, setSelectedSkipTarget] = useState(null);

  // Bulk modal
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkModalCustomer, setBulkModalCustomer] = useState(null);
  const [bulkItems, setBulkItems] = useState([]);
  const [newBulkProductId, setNewBulkProductId] = useState('');
  const [newBulkQuantity, setNewBulkQuantity] = useState(10);
  const [bulkModalError, setBulkModalError] = useState('');
  const [submittingBulk, setSubmittingBulk] = useState(false);

  // Add Zone modal state
  const [showAddZoneModal, setShowAddZoneModal] = useState(false);
  const [showManageZonesModal, setShowManageZonesModal] = useState(false);
  const [newZoneData, setNewZoneData] = useState({ name: '', address: '', route_order: '' });
  const [zoneSubmitting, setZoneSubmitting] = useState(false);

  // Edit Zone modal state
  const [showEditZoneModal, setShowEditZoneModal] = useState(false);
  const [editingZoneData, setEditingZoneData] = useState({ id: null, name: '', address: '', route_order: '' });
  const [editZoneSubmitting, setEditZoneSubmitting] = useState(false);

  // Assign Customer to Zone modal state
  const [showAssignCustomerModal, setShowAssignCustomerModal] = useState(false);
  const [assignCustomerData, setAssignCustomerData] = useState({ customer_id: '', flat_no: '' });
  const [allCustomersList, setAllCustomersList] = useState([]);
  const [assigningCustomer, setAssigningCustomer] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Helper to change active selected zone and store in localStorage
  const handleSelectZone = (key) => {
    setSelectedZoneKey(key);
    setSelectedCustomerId(null);
    try {
      if (key) {
        localStorage.setItem('nandini_selected_zone_key', String(key));
      } else {
        localStorage.removeItem('nandini_selected_zone_key');
      }
    } catch {
      // Ignore storage errors
    }
  };

  const handleCreateZone = async (e) => {
    e.preventDefault();
    if (!newZoneData.name.trim()) return;
    try {
      setZoneSubmitting(true);
      const created = await api.post('/zones', {
        name: newZoneData.name.trim(),
        address: newZoneData.address?.trim() || '',
        route_order: parseInt(newZoneData.route_order) || 0
      });
      const freshZones = await api.get('/zones');
      setZones(freshZones || []);
      const newKey = `zone_${created.id}`;
      handleSelectZone(newKey);
      setShowAddZoneModal(false);
      setNewZoneData({ name: '', address: '', route_order: '' });
      showToast(`Zone "${created.name}" created and saved successfully!`);
    } catch (err) {
      alert(err.message || 'Failed to create zone');
    } finally {
      setZoneSubmitting(false);
    }
  };

  const handleDeleteZone = async (zoneId, zoneName, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete zone "${zoneName}"?\nCustomers in this zone will be safely unassigned.`)) {
      return;
    }
    try {
      await api.delete(`/zones/${zoneId}`);
      const freshZones = await api.get('/zones');
      setZones(freshZones || []);
      if (selectedZoneKey === `zone_${zoneId}` || String(selectedZoneKey) === String(zoneId)) {
        handleSelectZone(null);
      }
      showToast(`Zone "${zoneName}" deleted successfully.`);
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to delete zone');
    }
  };

  const handleOpenEditZone = (zone, e) => {
    if (e) e.stopPropagation();
    setEditingZoneData({
      id: zone.id,
      name: zone.name || '',
      address: zone.address || '',
      route_order: zone.route_order !== undefined && zone.route_order !== null ? zone.route_order : ''
    });
    setShowEditZoneModal(true);
  };

  const handleUpdateZone = async (e) => {
    e.preventDefault();
    if (!editingZoneData.name.trim()) return;
    try {
      setEditZoneSubmitting(true);
      const updated = await api.put(`/zones/${editingZoneData.id}`, {
        name: editingZoneData.name.trim(),
        address: editingZoneData.address?.trim() || '',
        route_order: parseInt(editingZoneData.route_order, 10) || 0
      });
      const freshZones = await api.get('/zones');
      setZones(freshZones || []);
      setShowEditZoneModal(false);
      showToast(`Zone "${updated.name}" updated successfully!`);
      await fetchData();
    } catch (err) {
      alert(err.message || 'Failed to update zone');
    } finally {
      setEditZoneSubmitting(false);
    }
  };

  const handleOpenAssignCustomerModal = async () => {
    try {
      const res = await api.get('/customers');
      setAllCustomersList(res || []);
      setAssignCustomerData({ customer_id: res?.[0]?.id || '', flat_no: '' });
      setShowAssignCustomerModal(true);
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  const handleAssignCustomerToZone = async (e) => {
    e.preventDefault();
    if (!assignCustomerData.customer_id || !activeZone?.id) return;
    try {
      setAssigningCustomer(true);
      await api.put(`/customers/${assignCustomerData.customer_id}`, {
        zone_id: activeZone.id,
        flat_no: assignCustomerData.flat_no.trim() || null
      });
      setShowAssignCustomerModal(false);
      setAssignCustomerData({ customer_id: '', flat_no: '' });
      await fetchData();
      showToast('Customer assigned to zone successfully!');
    } catch (err) {
      alert(err.message || 'Failed to assign customer to zone');
    } finally {
      setAssigningCustomer(false);
    }
  };

  // ----------------------------------------------------
  // DATA FETCHING (optimized for speed & silent background sync)
  // ----------------------------------------------------
  const refreshDeliveriesOnly = async () => {
    try {
      const params = { date: selectedDate };
      if (userRole === 'DELIVERY_BOY' && currentUserId) {
        params.delivery_boy_id = currentUserId;
      } else if (dboyFilter) {
        params.delivery_boy_id = dboyFilter;
      }
      const dels = await api.get('/deliveries', { params });
      if (Array.isArray(dels)) {
        setDeliveries(dels);
      }
    } catch (err) {
      console.error('Silent deliveries refresh notice:', err);
    }
  };

  const fetchData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError('');

      const params = { date: selectedDate };
      if (userRole === 'DELIVERY_BOY' && currentUserId) {
        params.delivery_boy_id = currentUserId;
      } else if (dboyFilter) {
        params.delivery_boy_id = dboyFilter;
      }

      // If master collections (zones, products, customers) are already loaded in memory,
      // only re-fetch deliveries on background updates to avoid redundant network roundtrips.
      const hasMasterData = zones.length > 0 && products.length > 0 && customers.length > 0;

      if (hasMasterData && silent) {
        const dels = await api.get('/deliveries', { params }).catch((err) => {
          console.error('Deliveries fetch notice:', err);
          return [];
        });
        setDeliveries(dels || []);
      } else {
        const [dels, zoneList, prods, custs, dboys, routeList] = await Promise.all([
          api.get('/deliveries', { params }).catch((err) => {
            console.error('Deliveries fetch notice:', err);
            return [];
          }),
          api.get('/zones').catch(() => []),
          api.get('/products').catch(() => []),
          api.get('/customers').catch(() => []),
          userRole === 'ADMIN' ? api.get('/delivery-boys').catch(() => []) : Promise.resolve([]),
          api.get('/routes').catch(() => [])
        ]);

        setDeliveries(dels || []);
        setZones(zoneList || []);
        setProducts(prods || []);
        setCustomers(custs || []);
        setDeliveryBoys(dboys || []);
        setRoutes(routeList || []);

        if (userRole === 'DELIVERY_BOY') {
          if (routeList && routeList.length > 0) {
            setSelectedRouteId(prev => {
              if (prev === 'ALL' || prev === 'NONE' || !routeList.some(r => String(r.id) === String(prev))) {
                return String(routeList[0].id);
              }
              return prev;
            });
          } else {
            setSelectedRouteId('NONE');
          }
        }
      }
    } catch (err) {
      console.error('Error fetching zone delivery data:', err);
      setError(err.message || 'Failed to load daily deliveries');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate, dboyFilter]);

  useEffect(() => {
    if (userRole === 'DELIVERY_BOY' && selectedDate > getLocalDateString()) {
      setSelectedDate(getLocalDateString());
    }
  }, [userRole, selectedDate]);

  // Date controls
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const today = getLocalDateString();
    if (userRole === 'DELIVERY_BOY' && selectedDate >= today) return;
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setSelectedDate(getLocalDateString());
  };

  // ----------------------------------------------------
  // ZONE GROUPING & AGGREGATION LOGIC
  // ----------------------------------------------------
  const zoneGroups = useMemo(() => {
    // Filter target zones based on active route in hierarchy
    let targetZones = zones;
    if (userRole === 'DELIVERY_BOY') {
      if (routes.length === 0) return [];
      const activeR = routes.find(r => String(r.id) === String(selectedRouteId)) || routes[0];
      if (!activeR) return [];
      targetZones = zones.filter(z => z.route_id === activeR.id);
    } else if (selectedRouteId !== 'ALL' && selectedRouteId !== '') {
      const rId = parseInt(selectedRouteId, 10);
      targetZones = zones.filter(z => z.route_id === rId);
    }

    // Map of zone key -> zone data + delivery items
    const map = new Map();

    // 1. Initialize known database zones
    for (const z of targetZones) {
      map.set(`zone_${z.id}`, {
        key: `zone_${z.id}`,
        id: z.id,
        name: z.name,
        address: z.address || 'Bangalore',
        route_order: z.route_order || 0,
        image_url: z.image_url,
        route_id: z.route_id,
        type: 'ZONE',
        deliveries: []
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
      deliveries: []
    };

    // 2. Distribute deliveries into their zones
    for (const del of deliveries) {
      if (del.zone_id && map.has(`zone_${del.zone_id}`)) {
        map.get(`zone_${del.zone_id}`).deliveries.push(del);
      } else if (del.zone_name) {
        // Match by zone_name if zone_id didn't match directly
        let found = false;
        for (const [k, zObj] of map.entries()) {
          if (zObj.name.toLowerCase() === del.zone_name.toLowerCase()) {
            zObj.deliveries.push(del);
            found = true;
            break;
          }
        }
        if (!found) {
          unassignedGroup.deliveries.push(del);
        }
      } else {
        unassignedGroup.deliveries.push(del);
      }
    }

    const allGroups = Array.from(map.values());
    if (unassignedGroup.deliveries.length > 0) {
      allGroups.push(unassignedGroup);
    }

    // 3. Compute stats for each zone
    return allGroups.map((g) => {
      // Find mapped customers from customer database
      const mappedCustomers = customers.filter((c) => {
        if (g.type === 'UNASSIGNED') return !c.zone_id;
        return String(c.zone_id) === String(g.id) || (c.zone_name && g.name && c.zone_name.toLowerCase() === g.name.toLowerCase());
      });
      const assignedCustomersCount = mappedCustomers.length;

      // Group items by customer to count customer stops accurately
      const custMap = new Map();
      for (const d of g.deliveries) {
        if (!custMap.has(d.customer_id)) {
          custMap.set(d.customer_id, []);
        }
        custMap.get(d.customer_id).push(d);
      }

      let totalStops = custMap.size;
      let deliveredStops = 0;
      let skippedStops = 0;
      let pendingStops = 0;

      for (const [custId, items] of custMap.entries()) {
        const isBulk = items[0]?.customer_category === 'BULK_HOTEL';
        if (isBulk && items[0]?.id?.toString().startsWith('bulk_empty_')) {
          pendingStops++;
        } else if (items.every((it) => it.status === 'DELIVERED')) {
          deliveredStops++;
        } else if (items.every((it) => it.status === 'SKIPPED')) {
          skippedStops++;
        } else {
          pendingStops++;
        }
      }

      const totalItems = g.deliveries.length;
      const deliveredItems = g.deliveries.filter((d) => d.status === 'DELIVERED').length;
      const skippedItems = g.deliveries.filter((d) => d.status === 'SKIPPED').length;
      const pendingItems = totalItems - deliveredItems - skippedItems;
      const progressPercent = totalStops > 0 ? Math.round((deliveredStops / totalStops) * 100) : 0;
      const isCompleted = totalStops > 0 && (deliveredStops + skippedStops) === totalStops;

      return {
        ...g,
        totalStops,
        assignedCustomersCount,
        mappedCustomers,
        deliveredStops,
        skippedStops,
        pendingStops,
        totalItems,
        deliveredItems,
        skippedItems,
        pendingItems,
        progressPercent,
        isCompleted,
        customerGroups: Array.from(custMap.entries()).map(([cid, items]) => {
          const first = items[0] || {};
          return {
            customer_id: cid,
            customer_name: first.customer_name,
            customer_phone: first.customer_phone,
            customer_address: first.customer_address,
            customer_category: first.customer_category,
            customer_route: first.customer_route,
            customer_serial_no: first.customer_serial_no || first.serial_no || 0,
            flat_no: first.flat_no || '',
            items: items.filter((it) => !it.id?.toString().startsWith('bulk_empty_')),
            rawItems: items,
            hasSpecialInstructions: items.some((it) => it.requirement_reason || (it.requirement_type && it.requirement_type !== 'NORMAL')),
            specialInstructions: items.find((it) => it.requirement_reason)?.requirement_reason || '',
            status: items.every((it) => it.status === 'DELIVERED') ? 'DELIVERED' : items.every((it) => it.status === 'SKIPPED') ? 'SKIPPED' : 'PENDING'
          };
        })
      };
    });
  }, [zones, deliveries, customers, selectedRouteId, userRole, routes]);

  // Overall route summary metrics
  const routeSummary = useMemo(() => {
    let totalScheduled = 0;
    let deliveredCount = 0;
    let pendingCount = 0;
    let skippedCount = 0;
    let totalZones = zoneGroups.length;
    let completedZones = 0;

    for (const g of zoneGroups) {
      totalScheduled += g.totalStops;
      deliveredCount += g.deliveredStops;
      pendingCount += g.pendingStops;
      skippedCount += g.skippedStops;
      if (g.isCompleted && g.totalStops > 0) {
        completedZones++;
      }
    }

    const overallPercent = totalScheduled > 0 ? Math.round((deliveredCount / totalScheduled) * 100) : 0;
    return {
      totalScheduled,
      deliveredCount,
      pendingCount,
      skippedCount,
      totalZones,
      completedZones,
      overallPercent
    };
  }, [zoneGroups]);

  // Filtered & Sorted Zone Cards
  const displayedZones = useMemo(() => {
    let list = [...zoneGroups];

    if (zoneSearchQuery.trim()) {
      const q = zoneSearchQuery.toLowerCase();
      list = list.filter((z) => z.name.toLowerCase().includes(q) || z.address.toLowerCase().includes(q));
    }

    if (routeSortOrder === 'ROUTE_ORDER') {
      list.sort((a, b) => (a.route_order || 0) - (b.route_order || 0));
    } else if (routeSortOrder === 'NAME') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (routeSortOrder === 'PENDING') {
      list.sort((a, b) => b.pendingStops - a.pendingStops);
    }

    return list;
  }, [zoneGroups, zoneSearchQuery, routeSortOrder]);

  // Active Selected Zone (Level 2)
  const activeZone = useMemo(() => {
    if (selectedZoneKey) {
      const match = zoneGroups.find((z) => z.key === selectedZoneKey || String(z.id) === String(selectedZoneKey));
      if (match) return match;
    }
    return null;
  }, [selectedZoneKey, zoneGroups]);

  // Active Selected Customer (Level 3)
  const activeCustomer = useMemo(() => {
    if (!activeZone || !selectedCustomerId) return null;
    return activeZone.customerGroups.find((c) => String(c.customer_id) === String(selectedCustomerId)) || null;
  }, [activeZone, selectedCustomerId]);

  const houseCount = useMemo(() => {
    if (!activeZone) return 0;
    return activeZone.customerGroups.filter((c) => c.customer_category !== 'BULK_HOTEL').length;
  }, [activeZone]);

  const bulkCount = useMemo(() => {
    if (!activeZone) return 0;
    return activeZone.customerGroups.filter((c) => c.customer_category === 'BULK_HOTEL').length;
  }, [activeZone]);

  // Customers in the active zone filtered by search, category, and status
  const activeZoneCustomers = useMemo(() => {
    if (!activeZone) return [];
    let list = [...activeZone.customerGroups];

    // Customer Category Filtering (House vs Bulk)
    if (customerCategoryTab === 'HOUSE') {
      list = list.filter((c) => c.customer_category !== 'BULK_HOTEL');
    } else if (customerCategoryTab === 'BULK') {
      list = list.filter((c) => c.customer_category === 'BULK_HOTEL');
    }

    // Status filtering
    if (customerStatusFilter === 'PENDING') {
      list = list.filter((c) => c.status === 'PENDING');
    } else if (customerStatusFilter === 'DELIVERED') {
      list = list.filter((c) => c.status === 'DELIVERED');
    } else if (customerStatusFilter === 'SKIPPED') {
      list = list.filter((c) => c.status === 'SKIPPED');
    } else if (customerStatusFilter === 'SPECIAL') {
      list = list.filter((c) => c.hasSpecialInstructions);
    }

    // Search query by name, flat_no, phone, or address
    if (customerSearchQuery.trim()) {
      const q = customerSearchQuery.toLowerCase().trim();
      list = list.filter((c) =>
        c.customer_name?.toLowerCase().includes(q) ||
        c.flat_no?.toLowerCase().includes(q) ||
        c.customer_phone?.includes(q) ||
        c.customer_address?.toLowerCase().includes(q)
      );
    }

    // Sort by flat number / serial number
    list.sort((a, b) => {
      if (a.customer_serial_no && b.customer_serial_no && a.customer_serial_no !== b.customer_serial_no) {
        return a.customer_serial_no - b.customer_serial_no;
      }
      return (a.flat_no || '').localeCompare(b.flat_no || '', undefined, { numeric: true });
    });

    return list;
  }, [activeZone, customerCategoryTab, customerStatusFilter, customerSearchQuery]);

  // ----------------------------------------------------
  // ACTION HANDLERS (with instant optimistic UI updates)
  // ----------------------------------------------------
  // Mark delivery DELIVERED
  const handleMarkDelivered = async (deliveryId) => {
    // 1. Instant optimistic update (0ms UI latency)
    setDeliveries((prev) =>
      prev.map((d) =>
        d.id === deliveryId
          ? { ...d, status: 'DELIVERED', delivered_at: new Date().toISOString() }
          : d
      )
    );

    try {
      await api.put(`/deliveries/${deliveryId}/status`, { status: 'DELIVERED' });
      showToast('Delivery marked as DELIVERED!');
      refreshDeliveriesOnly();
    } catch (err) {
      // Revert on error
      setDeliveries((prev) =>
        prev.map((d) =>
          d.id === deliveryId ? { ...d, status: 'PENDING', delivered_at: null } : d
        )
      );
      alert(err.message || 'Failed to update delivery');
    }
  };

  // Revert delivery to PENDING
  const handleRevertPending = async (deliveryId) => {
    // 1. Instant optimistic update
    setDeliveries((prev) =>
      prev.map((d) =>
        d.id === deliveryId ? { ...d, status: 'PENDING', delivered_at: null } : d
      )
    );

    try {
      await api.put(`/deliveries/${deliveryId}/status`, { status: 'PENDING' });
      showToast('Delivery reverted to Pending.');
      refreshDeliveriesOnly();
    } catch (err) {
      setDeliveries((prev) =>
        prev.map((d) =>
          d.id === deliveryId
            ? { ...d, status: 'DELIVERED', delivered_at: new Date().toISOString() }
            : d
        )
      );
      alert(err.message || 'Failed to revert delivery');
    }
  };

  // Group delivery handler (for multi-product stops)
  const handleDeliverCustomerGroup = async (group) => {
    if (group.customer_category === 'BULK_HOTEL') {
      handleDeliverBulkGroup(group);
      return;
    }
    const pendingItems = group.items.filter((it) => it.status !== 'DELIVERED');
    if (pendingItems.length === 0) return;

    const pendingIds = new Set(pendingItems.map((it) => it.id));
    // 1. Instant optimistic update for all items in group
    setDeliveries((prev) =>
      prev.map((d) =>
        pendingIds.has(d.id)
          ? { ...d, status: 'DELIVERED', delivered_at: new Date().toISOString() }
          : d
      )
    );

    try {
      // Single bulk call instead of multiple parallel calls
      await api.post('/deliveries/bulk-status', {
        deliveryIds: pendingItems.map((it) => it.id),
        status: 'DELIVERED'
      });
      showToast(`Delivered to ${group.customer_name} (${group.flat_no || ''})!`);
      refreshDeliveriesOnly();
    } catch (err) {
      // Revert on error
      setDeliveries((prev) =>
        prev.map((d) =>
          pendingIds.has(d.id) ? { ...d, status: 'PENDING', delivered_at: null } : d
        )
      );
      alert(err.message || 'Failed to mark group delivered');
    }
  };

  // Single item delivery handler
  const handleDeliverSingleItem = async (item, customerName) => {
    // 1. Instant optimistic update
    setDeliveries((prev) =>
      prev.map((d) =>
        d.id === item.id
          ? { ...d, status: 'DELIVERED', delivered_at: new Date().toISOString() }
          : d
      )
    );

    try {
      await api.put(`/deliveries/${item.id}/status`, { status: 'DELIVERED' });
      showToast(`Marked ${item.product_name_snapshot} delivered to ${customerName}!`);
      refreshDeliveriesOnly();
    } catch (err) {
      setDeliveries((prev) =>
        prev.map((d) => (d.id === item.id ? { ...d, status: 'PENDING', delivered_at: null } : d))
      );
      alert(err.message || 'Failed to mark item delivered');
    }
  };

  // Open Edit Quantity Modal
  const handleOpenEdit = (item) => {
    setEditError('');
    setEditingDelivery(item);
    const initialQty = item.status === 'SKIPPED' ? 0 : (item.quantity ?? 1);
    const rawReason = item.requirement_reason || item.notes || '';
    const cleanReason = rawReason.replace(/^(Temporary (Change|Skip)|Customer Requirement|Requirement):\s*/i, '').trim();
    setEditForm({
      product_id: item.product_id,
      quantity: initialQty,
      reason: cleanReason
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingDelivery) return;
    const targetQty = parseInt(editForm.quantity, 10);
    if (isNaN(targetQty) || targetQty < 0) {
      setEditError('Quantity must be 0 (to skip) or a positive number.');
      return;
    }

    try {
      setSubmittingEdit(true);
      setEditError('');
      const baseProductId = editingDelivery.subscription_product_id || editingDelivery.req_base_product_id || editingDelivery.product_id;
      const payload = {
        delivery_id: editingDelivery.id,
        customer_id: editingDelivery.customer_id,
        product_id: baseProductId,
        target_product_id: editForm.product_id,
        delivery_date: selectedDate,
        quantity: targetQty,
        reason: editForm.reason
      };

      const res = await api.post('/deliveries/temporary-change', payload);
      setIsEditModalOpen(false);
      showToast(res.message || "Today's delivery updated successfully!");
      refreshDeliveriesOnly();
    } catch (err) {
      setEditError(err.message || "Failed to update today's delivery.");
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Open Extra Product Modal
  const handleOpenExtra = (target = null) => {
    setExtraError('');
    if (target) {
      const custId = target.customer_id || target.id;
      const matchedCust = customers.find((c) => c.id === custId) || {
        id: custId,
        name: target.customer_name || target.name,
        address: target.customer_address || target.address,
        flat_no: target.flat_no || ''
      };
      setSelectedExtraCustomer(matchedCust);
      setExtraForm({
        customer_id: custId ? custId.toString() : '',
        product_id: products.length > 0 ? products[0].id.toString() : '',
        delivery_date: selectedDate,
        quantity: 1,
        status: 'DELIVERED',
        notes: 'Customer requested extra item'
      });
    } else {
      setSelectedExtraCustomer(null);
      setExtraForm({
        customer_id: customers.length > 0 ? customers[0].id.toString() : '',
        product_id: products.length > 0 ? products[0].id.toString() : '',
        delivery_date: selectedDate,
        quantity: 1,
        status: 'DELIVERED',
        notes: 'Customer requested extra item'
      });
    }
    setIsExtraModalOpen(true);
  };

  const handleSaveExtra = async (e) => {
    if (e) e.preventDefault();
    if (!extraForm.customer_id || !extraForm.product_id) {
      setExtraError('Please select both a customer and a product.');
      return;
    }
    const q = parseInt(extraForm.quantity, 10);
    if (isNaN(q) || q <= 0) {
      setExtraError('Quantity must be at least 1.');
      return;
    }

    try {
      setSubmittingExtra(true);
      setExtraError('');
      const payload = {
        customer_id: parseInt(extraForm.customer_id, 10),
        product_id: parseInt(extraForm.product_id, 10),
        quantity: q,
        delivery_date: extraForm.delivery_date || selectedDate,
        status: 'DELIVERED',
        notes: extraForm.notes || 'Customer requested extra item'
      };

      const res = await api.post('/deliveries/extra', payload);
      setIsExtraModalOpen(false);
      showToast(res.message || 'Extra product added successfully!');
      refreshDeliveriesOnly();
    } catch (err) {
      setExtraError(err.message || 'Failed to add extra product.');
    } finally {
      setSubmittingExtra(false);
    }
  };

  // Skip Modal Confirmation
  const handleOpenSkip = (target) => {
    setSelectedSkipTarget(target);
    setIsSkipOpen(true);
  };

  const handleConfirmSkip = async ({ reason, applyToRemainingMonth }) => {
    if (!selectedSkipTarget) return;
    const itemsToSkip = selectedSkipTarget.items ? selectedSkipTarget.items : [selectedSkipTarget];
    const itemIds = new Set(itemsToSkip.map((it) => it.id));

    // 1. Instant optimistic update
    setDeliveries((prev) =>
      prev.map((d) =>
        itemIds.has(d.id)
          ? { ...d, status: 'SKIPPED', notes: reason || 'Customer requested skip' }
          : d
      )
    );
    setIsSkipOpen(false);

    try {
      await api.post('/deliveries/bulk-status', {
        deliveryIds: itemsToSkip.map((it) => it.id),
        status: 'SKIPPED',
        notes: reason || 'Customer requested skip'
      });
      showToast(`Marked delivery as SKIPPED for ${selectedSkipTarget.customer_name || 'customer'}.`);
      refreshDeliveriesOnly();
    } catch (err) {
      refreshDeliveriesOnly();
      alert(err.message || 'Failed to skip delivery');
    }
  };

  // Correction Modal
  const handleOpenCorrection = (del) => {
    setSelectedCorrectionDelivery(del);
    setIsCorrectionOpen(true);
  };

  // Bulk Order Management
  const handleOpenBulkModal = (bulkGroup) => {
    setBulkModalError('');
    setBulkModalCustomer(bulkGroup);
    const initialItems = (bulkGroup.items || []).map((it) => ({
      product_id: it.product_id,
      product_name: it.product_name_snapshot,
      variant_label: it.variant_snapshot,
      selling_price: it.unit_price_snapshot,
      quantity: it.quantity
    }));
    setBulkItems(initialItems);
    setNewBulkProductId(products.length > 0 ? products[0].id.toString() : '');
    setNewBulkQuantity(10);
    setIsBulkModalOpen(true);
  };

  const handleAddProductToBulkList = () => {
    if (!newBulkProductId) {
      setBulkModalError('Please select a product.');
      return;
    }
    const pid = parseInt(newBulkProductId, 10);
    const qty = parseInt(newBulkQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setBulkModalError('Please enter a valid quantity.');
      return;
    }
    const prodObj = products.find((p) => p.id === pid);
    if (!prodObj) return;

    setBulkItems((prev) => {
      const idx = prev.findIndex((it) => it.product_id === pid);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + qty };
        return updated;
      }
      return [...prev, { product_id: pid, product_name: prodObj.name, variant_label: prodObj.variant_label, selling_price: prodObj.selling_price, quantity: qty }];
    });
    setBulkModalError('');
  };

  const handleSaveBulkProducts = async () => {
    if (!bulkModalCustomer) return;
    try {
      setSubmittingBulk(true);
      setBulkModalError('');
      const payload = {
        customer_id: bulkModalCustomer.customer_id,
        delivery_date: selectedDate,
        items: bulkItems.map((it) => ({ product_id: it.product_id, quantity: it.quantity })),
        notes: 'Bulk Daily Order'
      };
      await api.post('/deliveries/bulk-manage', payload);
      setIsBulkModalOpen(false);
      showToast(`Today's products saved for ${bulkModalCustomer.customer_name}.`);
      refreshDeliveriesOnly();
    } catch (err) {
      setBulkModalError(err.message || 'Failed to save bulk products.');
    } finally {
      setSubmittingBulk(false);
    }
  };

  const handleDeliverBulkGroup = async (group) => {
    if (!group.items || group.items.length === 0) {
      handleOpenBulkModal(group);
      return;
    }
    try {
      await api.post('/deliveries/bulk-deliver', {
        customer_id: group.customer_id,
        delivery_date: selectedDate
      });
      showToast(`Bulk delivery for ${group.customer_name} marked as DELIVERED.`);
      refreshDeliveriesOnly();
    } catch (err) {
      alert(err.message || 'Failed to mark bulk delivery as delivered.');
    }
  };

  // Helper formatting for timestamps
  const formatTime = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="zone-delivery-container" style={{ padding: '20px 24px 96px 24px', maxWidth: '1440px', margin: '0 auto', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          background: '#1e293b',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          fontSize: '0.9rem',
          fontWeight: '700',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={18} color="#22c55e" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* HEADER: Title, Date, Route Selector & Delivery Boy Filter */}
      {/* ========================================================================= */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
              <Truck size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                Daily Delivery Route
              </h1>
              <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>
                {formatDisplayDate(selectedDate)}
              </div>
            </div>
          </div>
        </div>

        {/* Date Stepper Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '6px 10px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <button
            onClick={handlePrevDay}
            className="btn btn-outline btn-sm"
            style={{ padding: '6px 8px', borderRadius: '6px', border: 'none', background: '#f1f5f9' }}
            title="Previous Day"
          >
            <ChevronLeft size={16} />
          </button>

          <input
            type="date"
            value={selectedDate}
            max={userRole === 'DELIVERY_BOY' ? getLocalDateString() : undefined}
            onChange={(e) => {
              const val = e.target.value;
              if (userRole === 'DELIVERY_BOY' && val > getLocalDateString()) return;
              setSelectedDate(val);
            }}
            style={{ border: 'none', fontWeight: '800', fontSize: '0.9rem', color: '#1e293b', outline: 'none', background: 'transparent', cursor: 'pointer' }}
          />

          {/* Next Day button: hidden for Delivery Boy when on today or future */}
          {(userRole !== 'DELIVERY_BOY' || selectedDate < getLocalDateString()) && (
            <button
              onClick={handleNextDay}
              className="btn btn-outline btn-sm"
              style={{ padding: '6px 8px', borderRadius: '6px', border: 'none', background: '#f1f5f9' }}
              title="Next Day"
            >
              <ChevronRight size={16} />
            </button>
          )}

          {selectedDate !== getLocalDateString() && (
            <button
              onClick={handleToday}
              className="btn btn-sm"
              style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: '700', padding: '4px 10px', fontSize: '0.78rem', borderRadius: '6px' }}
            >
              Today
            </button>
          )}
        </div>

        {/* Admin Delivery Boy filter */}
        {userRole === 'ADMIN' && deliveryBoys.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#64748b' }}>Delivery Boy:</span>
            <select
              className="form-select"
              value={dboyFilter}
              onChange={(e) => setDboyFilter(e.target.value)}
              style={{ padding: '6px 12px', fontSize: '0.85rem', fontWeight: '700', borderRadius: '8px', border: '1px solid #cbd5e1' }}
            >
              <option value="">All Delivery Boys</option>
              {deliveryBoys.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.phone})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Route Hierarchy Bar (Routes -> Zones -> Customers -> Daily Deliveries) */}
      {!activeZone && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          marginBottom: '16px',
          padding: '10px 16px',
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', fontSize: '0.825rem', color: '#1e293b' }}>
            <RouteIcon size={18} color="#2563eb" />
            <span>{userRole === 'DELIVERY_BOY' ? 'Assigned Route:' : 'Route:'}</span>
          </div>

          {userRole === 'DELIVERY_BOY' ? (
            routes.length === 0 ? (
              <span style={{ fontSize: '0.85rem', color: '#dc2626', fontWeight: '700' }}>
                No route assigned. Please contact your Admin.
              </span>
            ) : (
              routes.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSelectedRouteId(String(r.id));
                    handleSelectZone(null);
                  }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '999px',
                    fontSize: '0.825rem',
                    fontWeight: '700',
                    border: String(selectedRouteId) === String(r.id) ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: String(selectedRouteId) === String(r.id) ? '#eff6ff' : '#f8fafc',
                    color: String(selectedRouteId) === String(r.id) ? '#1d4ed8' : '#475569',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>{r.name}</span>
                  <span style={{ fontSize: '0.725rem', background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '999px' }}>
                    {r.zone_count || 0} zones
                  </span>
                </button>
              ))
            )
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelectedRouteId('ALL');
                  handleSelectZone(null);
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: '999px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  border: selectedRouteId === 'ALL' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                  background: selectedRouteId === 'ALL' ? '#eff6ff' : '#f8fafc',
                  color: selectedRouteId === 'ALL' ? '#1d4ed8' : '#475569',
                  cursor: 'pointer'
                }}
              >
                All Routes ({routes.length})
              </button>
              {routes.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSelectedRouteId(String(r.id));
                    handleSelectZone(null);
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '999px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    border: String(selectedRouteId) === String(r.id) ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    background: String(selectedRouteId) === String(r.id) ? '#eff6ff' : '#f8fafc',
                    color: String(selectedRouteId) === String(r.id) ? '#1d4ed8' : '#475569',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>{r.name}</span>
                  <span style={{ fontSize: '0.725rem', background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '999px' }}>
                    {r.zone_count || 0}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUMMARY BANNER: Zone progress + 4 KPI Stat Counters (Level 1 Zones Screen ONLY) */}
      {/* ========================================================================= */}
      {!activeZone && (
        <div style={{
          background: 'white',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          padding: '16px 20px',
          marginBottom: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          alignItems: 'center'
        }}>
          {/* Left: Overall Zones Completion */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderRight: '1px solid #f1f5f9', paddingRight: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: '800', fontSize: '0.95rem', color: '#0f172a' }}>
                {routeSummary.completedZones} of {routeSummary.totalZones} zones completed
              </span>
              <span style={{ fontWeight: '900', color: '#2563eb', fontSize: '0.95rem' }}>
                {routeSummary.overallPercent}%
              </span>
            </div>
            <div style={{ width: '100%', height: '10px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${routeSummary.overallPercent}%`,
                  height: '100%',
                  background: routeSummary.overallPercent === 100 ? '#10b981' : '#2563eb',
                  borderRadius: '999px',
                  transition: 'width 0.4s ease'
                }}
              />
            </div>
          </div>

          {/* Right: 4 Metric Badges */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            {/* Total Scheduled */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 120px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                <ShoppingBag size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Total</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0f172a' }}>{routeSummary.totalScheduled}</div>
              </div>
            </div>

            {/* Delivered */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 120px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                <CheckCircle2 size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Delivered</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#15803d' }}>{routeSummary.deliveredCount}</div>
              </div>
            </div>

            {/* Pending */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 120px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
                <Clock size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Pending</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#b45309' }}>{routeSummary.pendingCount}</div>
              </div>
            </div>

            {/* Skipped */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 120px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                <XCircle size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Skipped</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#b91c1c' }}>{routeSummary.skippedCount}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MAIN VIEW: EITHER APARTMENT ZONES LIST OR ACTIVE OPEN ZONE CUSTOMERS       */}
      {/* ========================================================================= */}
      {!activeZone ? (
        /* ---------------------------------------------------- */
        /* VIEW 1: APARTMENT / VILLA ZONES OVERVIEW LIST        */
        /* ---------------------------------------------------- */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          {/* Header & Controls */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563eb',
                flexShrink: 0
              }}>
                <MapPin size={18} />
              </div>
              <h2 style={{
                fontSize: '1.1rem',
                fontWeight: '900',
                color: '#0f172a',
                margin: 0,
                whiteSpace: 'nowrap'
              }}>
                Apartment / Villa Zones
              </h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginLeft: 'auto' }}>
              {userRole !== 'DELIVERY_BOY' && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAddZoneModal(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#2563eb',
                      color: 'white',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                    title="Create a new apartment or villa community zone"
                  >
                    <PlusCircle size={14} /> Add Zone
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowManageZonesModal(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid #fecaca',
                      background: '#fef2f2',
                      color: '#dc2626',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                    title="Delete or manage unneeded zones"
                  >
                    <Trash2 size={14} /> Delete Zones
                  </button>
                </>
              )}

              <select
                value={routeSortOrder}
                onChange={(e) => setRouteSortOrder(e.target.value)}
                style={{
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: 'white',
                  cursor: 'pointer',
                  outline: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                <option value="ROUTE_ORDER">⇅ Route Order</option>
                <option value="NAME">Name (A-Z)</option>
                <option value="PENDING">Most Pending</option>
              </select>
            </div>
          </div>

          {/* Search Zones */}
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search apartment, villa, zone..."
              value={zoneSearchQuery}
              onChange={(e) => setZoneSearchQuery(e.target.value)}
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

          {/* Zones Card Stack */}
          {displayedZones.length === 0 ? (
            userRole === 'DELIVERY_BOY' && routes.length === 0 ? (
              <div style={{
                background: 'white',
                padding: '48px 24px',
                textAlign: 'center',
                borderRadius: '16px',
                border: '1.5px dashed #cbd5e1',
                color: '#64748b'
              }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px'
                }}>
                  <RouteIcon size={28} />
                </div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>
                  No route assigned. Please contact your Admin.
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  Once your Parlour Admin assigns you to a route, your assigned zones and daily customer deliveries will appear here.
                </p>
              </div>
            ) : userRole === 'DELIVERY_BOY' ? (
              <div style={{
                background: 'white',
                padding: '40px 24px',
                textAlign: 'center',
                borderRadius: '16px',
                border: '1.5px dashed #cbd5e1',
                color: '#64748b'
              }}>
                <Building2 size={36} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                  No zones in this route yet
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  Your assigned route does not contain any zones yet. Please contact your Admin.
                </p>
              </div>
            ) : (
              <div style={{ background: 'white', padding: '30px', textAlign: 'center', borderRadius: '12px', border: '1px solid #e2e8f0', color: '#64748b' }}>
                {zoneSearchQuery ? `No zones found matching "${zoneSearchQuery}".` : 'No zones found for this route.'}
              </div>
            )
          ) : (
            displayedZones.map((zone, idx) => {
              const isSelected = activeZone?.key === zone.key;
              return (
                <div
                  key={zone.key}
                  onClick={() => handleSelectZone(zone.key)}
                  style={{
                    background: 'white',
                    borderRadius: '14px',
                    border: isSelected ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                    boxShadow: isSelected ? '0 4px 16px rgba(245, 158, 11, 0.15)' : '0 1px 4px rgba(0,0,0,0.03)',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  {/* Top: Building Thumbnail + Full-Width Zone Info */}
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', width: '100%' }}>
                    {/* Building Thumbnail */}
                    <ZoneBuildingThumbnail name={zone.name} index={idx} />

                    {/* Zone Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                        <span style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '999px',
                          background: isSelected ? '#f59e0b' : '#2563eb',
                          color: 'white',
                          fontSize: '0.72rem',
                          fontWeight: '900',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {zone.route_order || (idx + 1)}
                        </span>
                        <h3 style={{
                          fontSize: '1.05rem',
                          fontWeight: '800',
                          color: '#0f172a',
                          margin: 0,
                          lineHeight: 1.3
                        }}>
                          {zone.name}
                        </h3>
                      </div>

                      <div style={{
                        fontSize: '0.78rem',
                        color: '#64748b',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: '2px'
                      }}>
                        {zone.address || 'General delivery area'}
                      </div>

                      <div style={{
                        fontSize: '0.78rem',
                        color: '#475569',
                        fontWeight: '700',
                        marginTop: '5px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap'
                      }}>
                        {zone.totalStops > 0 ? (
                          <>
                            <span>{zone.totalStops} deliveries</span>
                            {zone.assignedCustomersCount > 0 && (
                              <span style={{ color: '#64748b' }}>({zone.assignedCustomersCount} cust)</span>
                            )}
                            <span style={{ color: '#cbd5e1' }}>•</span>
                            <span style={{ color: '#16a34a' }}>{zone.deliveredStops} delivered</span>
                            <span style={{ color: '#cbd5e1' }}>•</span>
                            <span style={{ color: '#d97706' }}>{zone.pendingStops} pending</span>
                          </>
                        ) : zone.assignedCustomersCount > 0 ? (
                          <>
                            <span style={{ color: '#0f172a', fontWeight: '800' }}>{zone.assignedCustomersCount} customer{zone.assignedCustomersCount !== 1 ? 's' : ''} assigned</span>
                            <span style={{ color: '#cbd5e1' }}>•</span>
                            <span style={{ color: '#64748b' }}>0 deliveries for this date</span>
                          </>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>0 customers assigned • 0 deliveries</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom: Progress Bar + Action Buttons */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    paddingTop: '10px',
                    borderTop: '1px solid #f1f5f9',
                    flexWrap: 'wrap'
                  }}>
                    {/* Progress Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 120px' }}>
                      <div style={{ flex: 1, height: '6px', background: '#f1f5f9', borderRadius: '999px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${zone.progressPercent}%`,
                            height: '100%',
                            background: zone.progressPercent === 100 ? '#10b981' : isSelected ? '#f59e0b' : '#3b82f6',
                            borderRadius: '999px',
                            transition: 'width 0.3s ease'
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748b', minWidth: '32px' }}>
                        {zone.progressPercent}%
                      </span>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexShrink: 0 }}>
                      {userRole !== 'DELIVERY_BOY' && zone.id && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => handleOpenEditZone(zone, e)}
                            style={{
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1px solid #bfdbfe',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              fontSize: '0.78rem',
                              fontWeight: '700',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer'
                            }}
                            title={`Edit Zone "${zone.name}"`}
                          >
                            <Edit3 size={13} />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleDeleteZone(zone.id, zone.name, e)}
                            style={{
                              background: '#fef2f2',
                              color: '#dc2626',
                              border: '1px solid #fecaca',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              fontSize: '0.78rem',
                              fontWeight: '700',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer'
                            }}
                            title={`Delete Zone "${zone.name}"`}
                          >
                            <Trash2 size={13} />
                            <span>Delete</span>
                          </button>
                        </>
                      )}

                      {zone.isCompleted && zone.totalStops > 0 ? (
                        <div style={{
                          background: '#dcfce7',
                          color: '#15803d',
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontSize: '0.78rem',
                          fontWeight: '800',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          whiteSpace: 'nowrap'
                        }}>
                          <Check size={14} /> Completed
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{
                            background: isSelected ? '#d97706' : '#2563eb',
                            borderColor: isSelected ? '#b45309' : '#1d4ed8',
                            fontSize: '0.78rem',
                            fontWeight: '800',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <span>Open Zone</span>
                          <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : !activeCustomer ? (
        /* ------------------------------------------------------------------------- */
        /* LEVEL 2: DEDICATED CUSTOMER-ONLY LIST INSIDE SELECTED ZONE                */
        /* (Strict Rule: NO product details, images, rows, or delivery controls)     */
        /* ------------------------------------------------------------------------- */
        <div style={{
          background: 'white',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box'
        }}>
          {/* Top Bar inside Active Zone */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <button
              type="button"
              onClick={() => handleSelectZone(null)}
              style={{
                background: '#eff6ff',
                border: '1.5px solid #bfdbfe',
                borderRadius: '8px',
                cursor: 'pointer',
                color: '#1d4ed8',
                fontWeight: '800',
                fontSize: '0.88rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px'
              }}
            >
              <ArrowLeft size={16} />
              <span>Back to All Zones</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {userRole !== 'DELIVERY_BOY' && activeZone?.id && (
                <button
                  type="button"
                  onClick={handleOpenAssignCustomerModal}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    border: '1px solid #93c5fd',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    cursor: 'pointer'
                  }}
                  title="Assign a customer to this apartment/zone"
                >
                  <UserPlus size={13} /> Assign Customer
                </button>
              )}

              {userRole !== 'DELIVERY_BOY' && activeZone?.id && (
                <button
                  type="button"
                  onClick={(e) => handleDeleteZone(activeZone.id, activeZone.name, e)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    padding: '5px 8px',
                    borderRadius: '6px',
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#dc2626',
                    cursor: 'pointer'
                  }}
                  title={`Delete Zone "${activeZone.name}"`}
                >
                  <Trash2 size={13} /> Delete Zone
                </button>
              )}

              <span style={{
                background: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                padding: '3px 10px',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: '800'
              }}>
                Route #{activeZone.route_order || 1}
              </span>
            </div>
          </div>

          {/* Zone Title & Location */}
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0f172a', margin: '0 0 4px 0', wordBreak: 'break-word' }}>
              {activeZone.name}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.82rem' }}>
              <MapPin size={13} color="#94a3b8" />
              <span>{activeZone.address}</span>
            </div>
          </div>

          {/* Compact Zone-Specific Completion Progress Bar & Counts */}
          <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', fontWeight: '800', marginBottom: '8px' }}>
              <span style={{ color: '#334155' }}>
                {activeZone.deliveredStops} of {activeZone.totalStops} deliveries completed
              </span>
              <span style={{ color: '#2563eb' }}>{activeZone.progressPercent}%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', marginBottom: '10px' }}>
              <div
                style={{
                  width: `${activeZone.progressPercent}%`,
                  height: '100%',
                  background: activeZone.progressPercent === 100 ? '#10b981' : '#2563eb',
                  borderRadius: '999px',
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.75rem', fontWeight: '700', color: '#64748b' }}>
              <span>Total: <strong style={{ color: '#0f172a' }}>{activeZone.totalStops}</strong></span>
              <span>• Delivered: <strong style={{ color: '#16a34a' }}>{activeZone.deliveredStops}</strong></span>
              <span>• Pending: <strong style={{ color: '#d97706' }}>{activeZone.pendingStops}</strong></span>
              {activeZone.skippedStops > 0 && <span>• Skipped: <strong style={{ color: '#dc2626' }}>{activeZone.skippedStops}</strong></span>}
            </div>
          </div>

          {/* Category Tabs: All, House Customers, Bulk Customers */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #f1f5f9', paddingBottom: '4px', overflowX: 'auto' }}>
            <button
              type="button"
              onClick={() => setCustomerCategoryTab('ALL')}
              style={{
                background: 'none',
                border: 'none',
                fontWeight: 800,
                fontSize: '0.88rem',
                color: customerCategoryTab === 'ALL' ? '#2563eb' : '#64748b',
                borderBottom: customerCategoryTab === 'ALL' ? '2.5px solid #2563eb' : '2.5px solid transparent',
                padding: '4px 10px 8px 10px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              All Customers ({activeZone.totalStops})
            </button>
            <button
              type="button"
              onClick={() => setCustomerCategoryTab('HOUSE')}
              style={{
                background: 'none',
                border: 'none',
                fontWeight: 800,
                fontSize: '0.88rem',
                color: customerCategoryTab === 'HOUSE' ? '#2563eb' : '#64748b',
                borderBottom: customerCategoryTab === 'HOUSE' ? '2.5px solid #2563eb' : '2.5px solid transparent',
                padding: '4px 10px 8px 10px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              House Customers ({houseCount})
            </button>
            {bulkCount > 0 && (
              <button
                type="button"
                onClick={() => setCustomerCategoryTab('BULK')}
                style={{
                  background: 'none',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  color: customerCategoryTab === 'BULK' ? '#7c3aed' : '#64748b',
                  borderBottom: customerCategoryTab === 'BULK' ? '2.5px solid #7c3aed' : '2.5px solid transparent',
                  padding: '4px 10px 8px 10px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Bulk Customers ({bulkCount})
              </button>
            )}
          </div>

          {/* Search Customers in this Zone */}
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search customer, flat no, or phone..."
              value={customerSearchQuery}
              onChange={(e) => setCustomerSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px 10px 38px',
                borderRadius: '10px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.88rem',
                fontWeight: '600',
                outline: 'none',
                background: '#f8fafc'
              }}
            />
          </div>

          {/* Filter Tabs / Pills */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            <button
              onClick={() => setCustomerStatusFilter('ALL')}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '0.8rem',
                fontWeight: '800',
                border: 'none',
                cursor: 'pointer',
                background: customerStatusFilter === 'ALL' ? '#1e293b' : '#f1f5f9',
                color: customerStatusFilter === 'ALL' ? 'white' : '#475569',
                whiteSpace: 'nowrap'
              }}
            >
              All ({activeZone.totalStops})
            </button>
            <button
              onClick={() => setCustomerStatusFilter('PENDING')}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '0.8rem',
                fontWeight: '800',
                border: 'none',
                cursor: 'pointer',
                background: customerStatusFilter === 'PENDING' ? '#f59e0b' : '#fef3c7',
                color: customerStatusFilter === 'PENDING' ? 'white' : '#b45309',
                whiteSpace: 'nowrap'
              }}
            >
              Pending ({activeZone.pendingStops})
            </button>
            <button
              onClick={() => setCustomerStatusFilter('DELIVERED')}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '0.8rem',
                fontWeight: '800',
                border: 'none',
                cursor: 'pointer',
                background: customerStatusFilter === 'DELIVERED' ? '#16a34a' : '#dcfce7',
                color: customerStatusFilter === 'DELIVERED' ? 'white' : '#15803d',
                whiteSpace: 'nowrap'
              }}
            >
              Delivered ({activeZone.deliveredStops})
            </button>
            {activeZone.customerGroups.some((c) => c.hasSpecialInstructions) && (
              <button
                onClick={() => setCustomerStatusFilter('SPECIAL')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '999px',
                  fontSize: '0.8rem',
                  fontWeight: '800',
                  border: 'none',
                  cursor: 'pointer',
                  background: customerStatusFilter === 'SPECIAL' ? '#7c3aed' : '#f3e8ff',
                  color: customerStatusFilter === 'SPECIAL' ? 'white' : '#6b21a8',
                  whiteSpace: 'nowrap'
                }}
              >
                Special Instructions
              </button>
            )}
            {activeZone.skippedStops > 0 && (
              <button
                onClick={() => setCustomerStatusFilter('SKIPPED')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '999px',
                  fontSize: '0.8rem',
                  fontWeight: '800',
                  border: 'none',
                  cursor: 'pointer',
                  background: customerStatusFilter === 'SKIPPED' ? '#dc2626' : '#fee2e2',
                  color: customerStatusFilter === 'SKIPPED' ? 'white' : '#b91c1c',
                  whiteSpace: 'nowrap'
                }}
              >
                Skipped ({activeZone.skippedStops})
              </button>
            )}
          </div>

          {/* Customer Cards List (Level 2: NO PRODUCT DETAILS) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeZone.customerGroups.length === 0 ? (
              activeZone.assignedCustomersCount > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '10px 0' }}>
                  <div style={{
                    padding: '18px 22px',
                    background: '#eff6ff',
                    borderRadius: '14px',
                    border: '1.5px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Building2 size={20} />
                        {activeZone.assignedCustomersCount} Resident{activeZone.assignedCustomersCount !== 1 ? 's' : ''} Assigned to {activeZone.name}
                      </div>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#3b82f6', fontWeight: '600' }}>
                        0 delivery records found for selected date ({formatDisplayDate(selectedDate)}). You can sync daily deliveries below.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => fetchData(false)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          background: '#2563eb',
                          color: 'white',
                          border: 'none',
                          fontWeight: '800',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <RefreshCw size={15} /> Refresh / Sync Deliveries
                      </button>
                      {userRole !== 'DELIVERY_BOY' && (
                        <button
                          type="button"
                          onClick={handleOpenAssignCustomerModal}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            background: 'white',
                            color: '#1e40af',
                            border: '1px solid #93c5fd',
                            fontWeight: '800',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <UserPlus size={15} /> Add Another Resident
                        </button>
                      )}
                    </div>
                  </div>

                  {/* List of Assigned Customers */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                    {(activeZone.mappedCustomers || []).map((c) => (
                      <div
                        key={c.id}
                        style={{
                          background: 'white',
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            {c.flat_no && (
                              <span style={{
                                display: 'inline-block',
                                background: '#f1f5f9',
                                color: '#0f172a',
                                fontWeight: '900',
                                fontSize: '0.75rem',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                marginBottom: '4px'
                              }}>
                                Flat/Villa #{c.flat_no}
                              </span>
                            )}
                            <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '800', color: '#0f172a' }}>
                              {c.name}
                            </h4>
                          </div>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: '800',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: c.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
                            color: c.status === 'ACTIVE' ? '#15803d' : '#b91c1c'
                          }}>
                            {c.status || 'ACTIVE'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Phone size={13} color="#94a3b8" />
                          <span>{c.phone || 'No phone'}</span>
                        </div>
                        {c.address && (
                          <div style={{ fontSize: '0.78rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.address}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  borderRadius: '16px',
                  border: '2px dashed #cbd5e1',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                  margin: '10px 0'
                }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                    <Building2 size={30} />
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#0f172a' }}>
                    "{activeZone.name}" is Saved & Ready!
                  </div>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748b', maxWidth: '440px', lineHeight: 1.5 }}>
                    This apartment or villa community is saved in your database. No customers are currently assigned to it. Assign flats or villas to view deliveries here.
                  </p>
                  {userRole !== 'DELIVERY_BOY' && (
                    <button
                      type="button"
                      onClick={handleOpenAssignCustomerModal}
                      style={{
                        marginTop: '6px',
                        padding: '8px 18px',
                        borderRadius: '8px',
                        background: '#2563eb',
                        color: 'white',
                        border: 'none',
                        fontWeight: '800',
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 8px rgba(37,99,235,0.25)'
                      }}
                    >
                      <UserPlus size={16} /> Assign Customer to {activeZone.name}
                    </button>
                  )}
                </div>
              )
            ) : activeZoneCustomers.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', color: '#64748b' }}>
                No customer deliveries match the selected filters.
              </div>
            ) : (
              activeZoneCustomers.map((cust) => {
                const isDelivered = cust.status === 'DELIVERED';
                const isSkipped = cust.status === 'SKIPPED';
                const isBulk = cust.customer_category === 'BULK_HOTEL';

                return (
                  <div
                    key={cust.customer_id}
                    onClick={() => setSelectedCustomerId(cust.customer_id)}
                    style={{
                      background: 'white',
                      border: isDelivered ? '1.5px solid #bbf7d0' : isSkipped ? '1.5px solid #fecaca' : '1.5px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '16px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {/* Top Row: Prominent Flat / House Badge + Customer Name + Category + Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {/* Prominent Flat / House Badge */}
                        <span style={{
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1.5px solid #bfdbfe',
                          fontSize: '0.88rem',
                          fontWeight: '900',
                          padding: '3px 10px',
                          borderRadius: '8px',
                          letterSpacing: '0.02em'
                        }}>
                          {cust.flat_no ? `${cust.flat_no.toLowerCase().includes('flat') || cust.flat_no.toLowerCase().includes('villa') ? '' : 'Flat '}${cust.flat_no}` : (cust.customer_address ? cust.customer_address.split(',')[0] : 'House')}
                        </span>

                        <h3 style={{ fontSize: '1.08rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>
                          {cust.customer_name}
                        </h3>

                        {isBulk && (
                          <span style={{ background: '#f3e8ff', color: '#7c3aed', fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>
                            Bulk Hotel
                          </span>
                        )}
                      </div>

                      {/* Status Badge */}
                      <div>
                        {isDelivered ? (
                          <span style={{
                            background: '#dcfce7',
                            color: '#15803d',
                            padding: '4px 12px',
                            borderRadius: '999px',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}>
                            <Check size={14} /> Delivered
                          </span>
                        ) : isSkipped ? (
                          <span style={{
                            background: '#fee2e2',
                            color: '#b91c1c',
                            padding: '4px 12px',
                            borderRadius: '999px',
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}>
                            <XCircle size={14} /> Skipped
                          </span>
                        ) : (
                          <span style={{
                            background: '#fef3c7',
                            color: '#b45309',
                            padding: '4px 12px',
                            borderRadius: '999px',
                            fontSize: '0.8rem',
                            fontWeight: 800
                          }}>
                            Pending
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Address */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#64748b' }}>
                      <MapPin size={13} color="#94a3b8" style={{ flexShrink: 0 }} />
                      <span style={{ wordBreak: 'break-word' }}>{cust.customer_address}</span>
                    </div>

                    {/* Special Instruction alert pill on Level 2 (if any) */}
                    {cust.hasSpecialInstructions && (
                      <div style={{
                        background: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: '8px',
                        padding: '6px 10px',
                        fontSize: '0.78rem',
                        color: '#b45309',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <span>📝 {cust.specialInstructions || 'Special delivery instructions for today'}</span>
                      </div>
                    )}

                    {/* Bottom Row: Products count badge + Call button + Open Customer Button */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          background: '#f1f5f9',
                          color: '#475569',
                          fontSize: '0.76rem',
                          fontWeight: '700',
                          padding: '3px 8px',
                          borderRadius: '6px'
                        }}>
                          {cust.items.length} {cust.items.length === 1 ? 'product' : 'products'} scheduled
                        </span>
                        {cust.customer_phone && (
                          <a
                            href={`tel:${cust.customer_phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="btn btn-outline btn-sm"
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              textDecoration: 'none',
                              color: '#2563eb',
                              borderColor: '#bfdbfe',
                              fontWeight: 700,
                              fontSize: '0.78rem'
                            }}
                          >
                            <Phone size={13} />
                            <span>Call</span>
                          </a>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCustomerId(cust.customer_id);
                        }}
                        className="btn btn-primary btn-sm"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: '800',
                          fontSize: '0.82rem',
                          padding: '6px 14px',
                          borderRadius: '8px',
                          background: isDelivered ? '#15803d' : '#2563eb',
                          borderColor: isDelivered ? '#166534' : '#1d4ed8'
                        }}
                      >
                        <span>{isDelivered ? 'View Deliveries' : 'Open Customer'}</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* ------------------------------------------------------------------------- */
        /* LEVEL 3: INDIVIDUAL CUSTOMER DELIVERY SCREEN                              */
        /* (Shows dedicated customer view with products, quantities & actions)       */
        /* ------------------------------------------------------------------------- */
        <div style={{
          background: 'white',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box'
        }}>
          {/* Top Bar inside Customer Screen */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <button
              type="button"
              onClick={() => setSelectedCustomerId(null)}
              style={{
                background: '#eff6ff',
                border: '1.5px solid #bfdbfe',
                borderRadius: '8px',
                cursor: 'pointer',
                color: '#1d4ed8',
                fontWeight: '800',
                fontSize: '0.88rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px'
              }}
            >
              <ArrowLeft size={16} />
              <span>Back to Customers</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{
                background: '#f8fafc',
                color: '#475569',
                border: '1px solid #e2e8f0',
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: '700'
              }}>
                {activeZone.name} • Route #{activeZone.route_order || 1}
              </span>
              <span style={{
                background: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '0.78rem',
                fontWeight: '800'
              }}>
                📅 {formatDisplayDate(selectedDate)}
              </span>
            </div>
          </div>

          {/* Customer Profile Header Card */}
          <div style={{
            background: '#f8fafc',
            border: '1.5px solid #e2e8f0',
            borderRadius: '14px',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {activeCustomer.flat_no && (
                    <span style={{
                      background: '#2563eb',
                      color: 'white',
                      fontSize: '0.85rem',
                      fontWeight: 900,
                      padding: '3px 10px',
                      borderRadius: '6px',
                      letterSpacing: '0.02em'
                    }}>
                      {activeCustomer.flat_no.toLowerCase().includes('flat') || activeCustomer.flat_no.toLowerCase().includes('villa') ? '' : 'Flat '}{activeCustomer.flat_no}
                    </span>
                  )}
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', margin: 0, wordBreak: 'break-word' }}>
                    {activeCustomer.customer_name}
                  </h2>
                  {activeCustomer.customer_category === 'BULK_HOTEL' && (
                    <span style={{ background: '#f3e8ff', color: '#7c3aed', fontSize: '0.74rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px' }}>
                      Bulk Hotel
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>
                  <MapPin size={14} color="#94a3b8" />
                  <span>{activeCustomer.customer_address}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {activeCustomer.customer_phone && (
                  <a
                    href={`tel:${activeCustomer.customer_phone}`}
                    className="btn btn-outline btn-sm"
                    style={{
                      padding: '6px 12px',
                      borderRadius: '8px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      textDecoration: 'none',
                      color: '#2563eb',
                      borderColor: '#bfdbfe',
                      fontWeight: 700,
                      fontSize: '0.82rem'
                    }}
                  >
                    <Phone size={14} />
                    <span>Call Customer</span>
                  </a>
                )}

                <div>
                  {activeCustomer.status === 'DELIVERED' ? (
                    <span style={{
                      background: '#dcfce7',
                      color: '#15803d',
                      padding: '6px 14px',
                      borderRadius: '999px',
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <Check size={16} /> Delivered
                    </span>
                  ) : activeCustomer.status === 'SKIPPED' ? (
                    <span style={{
                      background: '#fee2e2',
                      color: '#b91c1c',
                      padding: '6px 14px',
                      borderRadius: '999px',
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <XCircle size={16} /> Skipped
                    </span>
                  ) : (
                    <span style={{
                      background: '#fef3c7',
                      color: '#b45309',
                      padding: '6px 14px',
                      borderRadius: '999px',
                      fontSize: '0.85rem',
                      fontWeight: 800
                    }}>
                      Pending Delivery
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Special Instructions Callout */}
            {activeCustomer.hasSpecialInstructions && activeCustomer.specialInstructions && (
              <div style={{
                background: '#fffbeb',
                border: '1.5px solid #fde68a',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '0.85rem',
                color: '#b45309',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={18} color="#d97706" style={{ flexShrink: 0 }} />
                <span><strong>Special Delivery Instruction:</strong> {activeCustomer.specialInstructions}</span>
              </div>
            )}
          </div>

          {/* Products Heading */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShoppingBag size={18} color="#2563eb" />
              <span>Scheduled Products for Today ({activeCustomer.items.length})</span>
            </h3>
          </div>

          {/* Product Items List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeCustomer.items.length === 0 ? (
              <div style={{
                padding: '32px 20px',
                textAlign: 'center',
                background: '#f8fafc',
                borderRadius: '12px',
                border: '1px dashed #cbd5e1',
                color: '#64748b'
              }}>
                <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: 600 }}>
                  No products scheduled for today yet. Use <strong>Extra Product</strong> or <strong>Manage Products</strong> to add items.
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenExtra(activeCustomer)}
                  className="btn btn-primary btn-sm"
                  style={{ fontWeight: 800 }}
                >
                  <PlusCircle size={14} /> Add Extra Product
                </button>
              </div>
            ) : (
              activeCustomer.items.map((item) => {
                const itemDelivered = item.status === 'DELIVERED';
                const itemSkipped = item.status === 'SKIPPED';
                const itemPending = !itemDelivered && !itemSkipped;

                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      padding: '14px 18px',
                      background: '#f8fafc',
                      borderRadius: '12px',
                      border: itemDelivered ? '1.5px solid #bbf7d0' : itemSkipped ? '1.5px solid #fecaca' : '1px solid #e2e8f0',
                      flexWrap: 'wrap'
                    }}
                  >
                    {/* Left: Product Image & Details */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '220px', flex: '1 1 220px' }}>
                      <ProductPacketImage
                        category={item.category_snapshot}
                        productName={item.product_name_snapshot}
                        imageUrl={item.product_image_url}
                        size={52}
                      />
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>
                          {item.product_name_snapshot} {item.variant_snapshot && `(${item.variant_snapshot})`}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '3px' }}>
                          Subscription: <strong>{item.subscription_quantity || item.quantity} {(item.subscription_quantity || item.quantity) === 1 ? 'packet' : 'packets'}/day</strong>
                        </div>
                      </div>
                    </div>

                    {/* Right: Quantity & Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      {itemPending ? (
                        <>
                          {/* Today's Qty Stepper / Display with Edit button */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>
                              Today's Qty
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1.5px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                              <span style={{ padding: '4px 12px', fontWeight: 900, fontSize: '1rem', color: '#0f172a', minWidth: '36px', textAlign: 'center' }}>
                                {item.quantity}
                              </span>
                              {activeCustomer.customer_category !== 'BULK_HOTEL' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(item)}
                                  style={{
                                    padding: '6px 8px',
                                    background: '#f8fafc',
                                    border: 'none',
                                    borderLeft: '1px solid #e2e8f0',
                                    cursor: 'pointer',
                                    color: '#0284c7',
                                    display: 'flex',
                                    alignItems: 'center'
                                  }}
                                  title="Edit quantity before delivering (temporary for today only)"
                                >
                                  <Edit3 size={14} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons: Mark Delivered & Skip */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                            <button
                              type="button"
                              onClick={() => handleDeliverSingleItem(item, activeCustomer.customer_name)}
                              style={{
                                background: '#16a34a',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: 800,
                                fontSize: '0.85rem',
                                padding: '8px 16px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer',
                                boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)'
                              }}
                            >
                              <CheckCircle2 size={16} />
                              <span>Mark Delivered</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenSkip({ ...activeCustomer, items: [item] })}
                              style={{
                                background: '#ffedd5',
                                color: '#c2410c',
                                border: '1.5px solid #fed7aa',
                                borderRadius: '8px',
                                fontWeight: 800,
                                fontSize: '0.85rem',
                                padding: '8px 14px',
                                cursor: 'pointer'
                              }}
                            >
                              Skip
                            </button>
                          </div>
                        </>
                      ) : itemDelivered ? (
                        <>
                          {/* Delivered Qty */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>
                              Delivered Qty
                            </span>
                            <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#15803d' }}>
                              {item.quantity}
                            </span>
                          </div>

                          {/* Edit / Correct Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenCorrection(item)}
                            style={{
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1.5px solid #bfdbfe',
                              borderRadius: '8px',
                              fontWeight: 800,
                              fontSize: '0.82rem',
                              padding: '7px 14px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            <Edit3 size={14} />
                            <span>Edit / Correct</span>
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Skipped */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', marginBottom: '2px' }}>
                              Skipped
                            </span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#64748b' }}>
                              --
                            </span>
                          </div>

                          {/* Edit / Correct Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenCorrection(item)}
                            style={{
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1.5px solid #bfdbfe',
                              borderRadius: '8px',
                              fontWeight: 800,
                              fontSize: '0.82rem',
                              padding: '7px 14px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              cursor: 'pointer'
                            }}
                          >
                            <Edit3 size={14} />
                            <span>Edit / Correct</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Customer Delivery Footer Actions Toolbar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            borderTop: '1.5px solid #f1f5f9',
            paddingTop: '14px'
          }}>
            <button
              type="button"
              onClick={() => setSelectedCustomerId(null)}
              className="btn btn-outline btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}
            >
              <ArrowLeft size={15} />
              <span>Back to Customers</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Deliver All Items button if multiple products and some are still pending */}
              {activeCustomer.status !== 'DELIVERED' && activeCustomer.status !== 'SKIPPED' && activeCustomer.items.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleDeliverCustomerGroup(activeCustomer)}
                  style={{
                    background: '#15803d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(21, 128, 61, 0.25)'
                  }}
                >
                  <CheckCircle2 size={16} /> Mark All Delivered
                </button>
              )}

              {/* Extra Product */}
              <button
                type="button"
                onClick={() => handleOpenExtra(activeCustomer.items[0] || activeCustomer)}
                style={{
                  background: '#fffbeb',
                  color: '#b45309',
                  border: '1.5px solid #fde68a',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer'
                }}
              >
                <PlusCircle size={15} color="#d97706" />
                <span>Extra Product</span>
              </button>

              {/* Bulk Manage Products */}
              {activeCustomer.customer_category === 'BULK_HOTEL' && (
                <button
                  type="button"
                  onClick={() => handleOpenBulkModal(activeCustomer)}
                  style={{
                    background: '#f3e8ff',
                    color: '#7c3aed',
                    border: '1.5px solid #d8b4fe',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Manage Products
                </button>
              )}

              {/* Revert if delivered */}
              {activeCustomer.status === 'DELIVERED' && (
                <button
                  type="button"
                  onClick={() => handleRevertPending(activeCustomer.items[0]?.id)}
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: '0.82rem', padding: '7px 12px', borderRadius: '8px' }}
                  title="Undo delivery status"
                >
                  Revert
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EDIT TODAY'S DELIVERY MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => !submittingEdit && setIsEditModalOpen(false)}
        title="Edit Today's Quantity"
        maxWidth="480px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {editError && (
            <div style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', fontWeight: '600' }}>
              {editError}
            </div>
          )}

          {/* Customer info (Image 2 style) */}
          <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
            <div style={{ fontWeight: '900', fontSize: '1.1rem', color: '#0f172a' }}>
              {editingDelivery?.customer_name} {editingDelivery?.flat_no && `(${editingDelivery?.flat_no})`}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
              {editingDelivery?.customer_address || 'Customer'}
            </div>
          </div>

          {/* Product row with image and normal subscription info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
            <ProductPacketImage
              category={editingDelivery?.category_snapshot}
              productName={editingDelivery?.product_name_snapshot}
              imageUrl={editingDelivery?.product_image_url}
              size={48}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '800', fontSize: '0.98rem', color: '#0f172a' }}>
                {editingDelivery?.product_name_snapshot}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                {editingDelivery?.variant_snapshot}
              </div>
            </div>
          </div>

          {/* Normal Subscription Display */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '0.9rem' }}>
            <span style={{ color: '#475569', fontWeight: '600' }}>Normal Subscription</span>
            <span style={{ fontWeight: '800', color: '#0f172a' }}>
              {editingDelivery?.subscription_quantity || 1} {(editingDelivery?.subscription_quantity || 1) === 1 ? 'packet/day' : 'packets/day'}
            </span>
          </div>

          {/* Product for Today (allows changing product variant if customer requested alternate for today) */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontWeight: '700', fontSize: '0.82rem', color: '#475569' }}>
              Selected Product for Today
            </label>
            <select
              className="form-input"
              value={editForm.product_id || ''}
              onChange={(e) => setEditForm((prev) => ({ ...prev, product_id: parseInt(e.target.value, 10) }))}
              style={{ fontWeight: '700', fontSize: '0.875rem', padding: '9px 12px' }}
            >
              {products.map((p) => {
                const regularPid = editingDelivery?.subscription_product_id || editingDelivery?.product_id;
                const isRegular = p.id === regularPid;
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.variant_label}) — ₹{p.selling_price.toFixed(2)}{isRegular ? ' ★ Regular Subscription' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Quantity Controls matching Image 2 */}
          <div className="form-group" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="form-label" style={{ fontWeight: '800', fontSize: '0.875rem', margin: 0 }}>
                Today's Quantity
              </label>
              <span style={{ color: parseInt(editForm.quantity, 10) === 0 ? '#ef4444' : '#2563eb', fontWeight: '800', fontSize: '0.82rem' }}>
                {parseInt(editForm.quantity, 10) === 0 ? '⚠ Skip for Today' : `${editForm.quantity} packet(s)`}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', margin: '8px 0' }}>
              <button
                type="button"
                onClick={() => setEditForm((prev) => ({ ...prev, quantity: Math.max(0, (parseInt(prev.quantity, 10) || 0) - 1) }))}
                style={{ width: '44px', height: '44px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: '800' }}
              >
                <Minus size={18} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', border: '1.5px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: 'white' }}>
                <input
                  type="number"
                  min="0"
                  max="99"
                  className="form-input"
                  value={editForm.quantity}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, quantity: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                  style={{ textAlign: 'center', fontSize: '1.3rem', fontWeight: '900', width: '70px', height: '42px', border: 'none', outline: 'none' }}
                />
                <span style={{ paddingRight: '12px', fontSize: '0.85rem', color: '#64748b', fontWeight: '700' }}>
                  packets
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditForm((prev) => ({ ...prev, quantity: (parseInt(prev.quantity, 10) || 0) + 1 }))}
                style={{ width: '44px', height: '44px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: '800' }}
              >
                <Plus size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setEditForm((prev) => ({ ...prev, quantity: 0, reason: prev.reason || 'Customer requested skip' }))}
                style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #fca5a5', background: parseInt(editForm.quantity, 10) === 0 ? '#ef4444' : '#fff5f5', color: parseInt(editForm.quantity, 10) === 0 ? 'white' : '#b91c1c', fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer' }}
              >
                0 (Skip Today)
              </button>
              {[1, 2, 3, 4, 5].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setEditForm((prev) => ({ ...prev, quantity: q }))}
                  style={{ padding: '4px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', background: parseInt(editForm.quantity, 10) === q ? '#2563eb' : 'white', color: parseInt(editForm.quantity, 10) === q ? 'white' : '#334155', fontSize: '0.78rem', fontWeight: '800', cursor: 'pointer' }}
                >
                  {q} pkt
                </button>
              ))}
            </div>
          </div>

          {/* Reason (optional) */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontWeight: '700', fontSize: '0.85rem' }}>
              Reason (optional)
            </label>
            <textarea
              className="form-input"
              rows="2"
              placeholder="e.g. Customer out of town, only 1 packet required today."
              value={editForm.reason}
              onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
              style={{ fontSize: '0.85rem', resize: 'vertical' }}
            />
          </div>

          {/* Explanatory rules note matching Image 2 */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
            <div>• Shows normal subscription ({editingDelivery?.subscription_quantity || 1} packets/day)</div>
            <div>• Does not change permanent subscription</div>
            <div>• Only applies to selected date ({formatDisplayDate(selectedDate)})</div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
            <button
              type="button"
              onClick={() => {
                const target = editingDelivery;
                setIsEditModalOpen(false);
                handleOpenExtra(target);
              }}
              className="btn btn-sm"
              style={{ background: '#fffbeb', color: '#b45309', border: '1.5px solid #fde68a', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <PlusCircle size={14} color="#d97706" />
              <span>Add Extra Product</span>
            </button>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="btn btn-outline" disabled={submittingEdit}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="btn btn-primary"
                style={{ fontWeight: '800', minWidth: '120px', background: '#2563eb', borderColor: '#1d4ed8' }}
                disabled={submittingEdit}
              >
                {submittingEdit ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* EXTRA PRODUCT MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isExtraModalOpen}
        onClose={() => !submittingExtra && setIsExtraModalOpen(false)}
        title="Add Extra Product to Customer"
        maxWidth="520px"
      >
        <form onSubmit={handleSaveExtra} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {extraError && (
            <div style={{ background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600' }}>
              {extraError}
            </div>
          )}

          {selectedExtraCustomer ? (
            <div style={{ background: '#f1f5f9', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: '800', fontSize: '1rem', color: '#0f172a' }}>
                  {selectedExtraCustomer.name} {selectedExtraCustomer.flat_no && `(${selectedExtraCustomer.flat_no})`}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={12} />
                  <span>{selectedExtraCustomer.address || 'Customer'}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExtraCustomer(null)}
                style={{ fontSize: '0.75rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Change
              </button>
            </div>
          ) : (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: '700' }}>Select Customer *</label>
              <select
                className="form-select"
                value={extraForm.customer_id}
                onChange={(e) => {
                  const cust = customers.find((c) => c.id === parseInt(e.target.value, 10));
                  setSelectedExtraCustomer(cust || null);
                  setExtraForm((prev) => ({ ...prev, customer_id: e.target.value }));
                }}
                required
              >
                <option value="">-- Choose Customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.flat_no ? `(${c.flat_no})` : ''} - {c.address}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontWeight: '700', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Choose Product to Add *</span>
              {(() => {
                const sel = products.find((p) => p.id === parseInt(extraForm.product_id, 10));
                return sel ? (
                  <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#1e40af' }}>
                    ₹{sel.selling_price.toFixed(2)}/unit
                  </span>
                ) : null;
              })()}
            </label>
            <select
              className="form-select"
              value={extraForm.product_id}
              onChange={(e) => setExtraForm((prev) => ({ ...prev, product_id: e.target.value }))}
              required
              style={{ fontWeight: '700', padding: '9px 12px' }}
            >
              <option value="">-- Choose Product --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.variant_label}) — ₹{p.selling_price.toFixed(2)}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontWeight: '700', display: 'flex', justifyContent: 'space-between' }}>
              <span>Quantity</span>
              <span style={{ color: '#2563eb', fontWeight: '800' }}>{extraForm.quantity} Packet(s)</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', margin: '8px 0' }}>
              <button
                type="button"
                onClick={() => setExtraForm((prev) => ({ ...prev, quantity: Math.max(1, (parseInt(prev.quantity, 10) || 1) - 1) }))}
                style={{ width: '42px', height: '42px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Minus size={18} />
              </button>
              <input
                type="number"
                min="1"
                className="form-input"
                value={extraForm.quantity}
                onChange={(e) => setExtraForm((prev) => ({ ...prev, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                style={{ textAlign: 'center', fontSize: '1.25rem', fontWeight: '900', width: '80px', height: '42px' }}
                required
              />
              <button
                type="button"
                onClick={() => setExtraForm((prev) => ({ ...prev, quantity: (parseInt(prev.quantity, 10) || 1) + 1 }))}
                style={{ width: '42px', height: '42px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Plus size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
              {[1, 2, 3, 4, 5].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setExtraForm((prev) => ({ ...prev, quantity: q }))}
                  style={{
                    padding: '3px 12px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: parseInt(extraForm.quantity, 10) === q ? '#2563eb' : 'white',
                    color: parseInt(extraForm.quantity, 10) === q ? 'white' : '#334155',
                    fontSize: '0.78rem',
                    fontWeight: '800',
                    cursor: 'pointer'
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontWeight: '700', fontSize: '0.85rem' }}>Notes / Remarks (Optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Customer requested extra curd packet"
              value={extraForm.notes}
              onChange={(e) => setExtraForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
            <button type="button" onClick={() => setIsExtraModalOpen(false)} className="btn btn-outline" disabled={submittingExtra}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}
              disabled={submittingExtra}
            >
              <PlusCircle size={16} />
              <span>{submittingExtra ? 'Adding...' : 'Add Extra Product to Delivery'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* BULK ORDER PRODUCT EDITOR MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isBulkModalOpen}
        onClose={() => !submittingBulk && setIsBulkModalOpen(false)}
        title={`Manage Bulk Products — ${bulkModalCustomer?.customer_name || 'Bulk Order'}`}
        maxWidth="560px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {bulkModalError && (
            <div style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #f87171', color: '#991b1b', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600' }}>
              {bulkModalError}
            </div>
          )}

          <div style={{ background: '#faf5ff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
            <div style={{ fontWeight: '800', color: '#6d28d9', fontSize: '0.95rem' }}>
              {bulkModalCustomer?.customer_name} (Bulk Customer)
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
              📍 {bulkModalCustomer?.customer_address} • Delivery Date: {formatDisplayDate(selectedDate)}
            </div>
          </div>

          <div>
            <label className="form-label" style={{ fontWeight: '800', fontSize: '0.85rem', color: '#4c1d95', textTransform: 'uppercase' }}>
              Current Delivery Products ({bulkItems.length})
            </label>
            {bulkItems.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', color: '#64748b', fontSize: '0.85rem' }}>
                No products added yet for today. Use the form below to add daily products.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {bulkItems.map((it) => (
                  <div
                    key={it.product_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#f8fafc',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>{it.product_name} ({it.variant_label})</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>₹{it.selling_price} × {it.quantity} = ₹{(it.selling_price * it.quantity).toFixed(2)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBulkItems((prev) => prev.filter((x) => x.product_id !== it.product_id))}
                      className="btn btn-outline btn-sm"
                      style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '3px 8px', fontSize: '0.75rem' }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: '#f5f3ff', border: '1.5px solid #ddd6fe', borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#5b21b6', marginBottom: '8px' }}>
              Add Product to Today's Order
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                className="form-select"
                style={{ flex: 1, fontSize: '0.85rem' }}
                value={newBulkProductId}
                onChange={(e) => setNewBulkProductId(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.variant_label}) - ₹{p.selling_price}</option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                className="form-input"
                style={{ width: '80px', fontSize: '0.85rem', textAlign: 'center' }}
                value={newBulkQuantity}
                onChange={(e) => setNewBulkQuantity(parseInt(e.target.value, 10) || 1)}
              />
              <button
                type="button"
                onClick={handleAddProductToBulkList}
                className="btn btn-sm"
                style={{ background: '#7c3aed', color: 'white', fontWeight: '800' }}
              >
                Add
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#faf5ff', padding: '10px 14px', borderRadius: '8px' }}>
            <span style={{ fontWeight: '700', color: '#4c1d95', fontSize: '0.9rem' }}>
              Total: ₹{bulkItems.reduce((acc, it) => acc + (it.selling_price * it.quantity), 0).toFixed(2)}
            </span>
            <span style={{ color: '#059669', fontSize: '0.75rem', fontWeight: '700' }}>
              Delivery Charge: ₹0.00
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button type="button" onClick={() => setIsBulkModalOpen(false)} className="btn btn-outline" disabled={submittingBulk}>
              Cancel
            </button>
            <button type="button" onClick={handleSaveBulkProducts} className="btn btn-primary" style={{ background: '#7c3aed', borderColor: '#6d28d9', fontWeight: '800', minWidth: '150px' }} disabled={submittingBulk}>
              {submittingBulk ? 'Saving...' : 'Save Products'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* DELIVERY CORRECTION MODAL */}
      {/* ========================================================================= */}
      <DeliveryCorrectionModal
        isOpen={isCorrectionOpen}
        onClose={() => setIsCorrectionOpen(false)}
        delivery={selectedCorrectionDelivery}
        onSaveSuccess={(res) => {
          showToast(res.message || 'Delivery corrected successfully!');
          refreshDeliveriesOnly();
        }}
      />

      {/* ========================================================================= */}
      {/* SKIP CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      <SkipConfirmModal
        isOpen={isSkipOpen}
        onClose={() => setIsSkipOpen(false)}
        target={selectedSkipTarget}
        onConfirm={handleConfirmSkip}
      />

      {/* ========================================================================= */}
      {/* ADD NEW ZONE MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={showAddZoneModal}
        onClose={() => setShowAddZoneModal(false)}
        title="Add New Apartment / Villa Zone"
      >
        <form onSubmit={handleCreateZone}>
          <div className="form-group">
            <label className="form-label">Apartment / Community Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Prestige Lakeside or Chaitanya Apartments"
              value={newZoneData.name}
              onChange={(e) => setNewZoneData({ ...newZoneData, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Address / Landmark</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Varthur Main Road, Bangalore"
              value={newZoneData.address}
              onChange={(e) => setNewZoneData({ ...newZoneData, address: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Route Sequence Order</label>
            <input
              type="number"
              className="form-input"
              placeholder="e.g. 1, 2, 3..."
              value={newZoneData.route_order}
              onChange={(e) => setNewZoneData({ ...newZoneData, route_order: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setShowAddZoneModal(false)}
              className="btn btn-outline btn-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={zoneSubmitting}
            >
              {zoneSubmitting ? 'Creating...' : 'Create Zone'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* EDIT ZONE MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={showEditZoneModal}
        onClose={() => setShowEditZoneModal(false)}
        title="Edit Apartment / Villa Zone"
      >
        <form onSubmit={handleUpdateZone}>
          <div className="form-group">
            <label className="form-label">Apartment / Community Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Prestige Lakeside or Chaitanya Apartments"
              value={editingZoneData.name}
              onChange={(e) => setEditingZoneData({ ...editingZoneData, name: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Address / Landmark</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Varthur Main Road, Bangalore"
              value={editingZoneData.address}
              onChange={(e) => setEditingZoneData({ ...editingZoneData, address: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Route Sequence Order</label>
            <input
              type="number"
              className="form-input"
              placeholder="e.g. 1, 2, 3..."
              value={editingZoneData.route_order}
              onChange={(e) => setEditingZoneData({ ...editingZoneData, route_order: e.target.value })}
            />
            <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '4px' }}>
              Determines stop order (1st stop, 2nd stop...) on delivery lists and daily route screens.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setShowEditZoneModal(false)}
              className="btn btn-outline btn-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={editZoneSubmitting}
            >
              {editZoneSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MANAGE & DELETE ZONES MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={showManageZonesModal}
        onClose={() => setShowManageZonesModal(false)}
        title="Manage & Delete Zones"
        maxWidth="600px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '10px', padding: '12px 14px', fontSize: '0.82rem', color: '#991b1b', lineHeight: 1.45 }}>
            <strong style={{ display: 'block', marginBottom: '2px' }}>⚠️ Safe Zone Deletion Policy:</strong>
            Deleting an apartment or villa community zone will remove the zone and safely unassign its customers (moving them to Unassigned). No customer profiles, subscriptions, or delivery records will be deleted.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px', overflowY: 'auto' }}>
            {zones.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
                No registered apartment or villa zones found.
              </div>
            ) : (
              zones.map((z) => (
                <div
                  key={z.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '12px 14px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px'
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: '800'
                      }}>
                        Route #{z.route_order || 1}
                      </span>
                      <span style={{ fontWeight: '800', fontSize: '0.95rem', color: '#0f172a' }}>
                        {z.name}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '3px' }}>
                      {z.address || 'Bangalore'} • <strong>{z.customer_count || 0} active customers</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        setShowManageZonesModal(false);
                        handleOpenEditZone(z, e);
                      }}
                      className="btn btn-outline btn-sm"
                      style={{
                        color: '#1d4ed8',
                        borderColor: '#bfdbfe',
                        background: '#eff6ff',
                        fontWeight: '800',
                        fontSize: '0.78rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        whiteSpace: 'nowrap'
                      }}
                      title={`Edit details of "${z.name}"`}
                    >
                      <Edit3 size={14} />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={async (e) => {
                        await handleDeleteZone(z.id, z.name, e);
                      }}
                      className="btn btn-outline btn-sm"
                      style={{
                        color: '#dc2626',
                        borderColor: '#fca5a5',
                        background: '#fee2e2',
                        fontWeight: '800',
                        fontSize: '0.78rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <Trash2 size={14} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={() => setShowManageZonesModal(false)}
              className="btn btn-primary btn-sm"
              style={{ fontWeight: '800' }}
            >
              Done
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* ASSIGN CUSTOMER TO ZONE MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={showAssignCustomerModal}
        onClose={() => setShowAssignCustomerModal(false)}
        title={`Assign Customer to ${activeZone?.name || 'Zone'}`}
      >
        <form onSubmit={handleAssignCustomerToZone}>
          <div className="form-group">
            <label className="form-label">Select Customer *</label>
            <select
              className="form-select"
              value={assignCustomerData.customer_id}
              onChange={(e) => setAssignCustomerData({ ...assignCustomerData, customer_id: e.target.value })}
              required
            >
              <option value="">-- Choose Customer --</option>
              {allCustomersList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone}) {c.flat_no ? `[Flat ${c.flat_no}]` : ''} {c.zone_name ? `— current: ${c.zone_name}` : '— (No Zone)'}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Flat / House / Villa Number</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. A-102, Villa 36, Flat 405"
              value={assignCustomerData.flat_no}
              onChange={(e) => setAssignCustomerData({ ...assignCustomerData, flat_no: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setShowAssignCustomerModal(false)}
              className="btn btn-outline btn-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={assigningCustomer || !assignCustomerData.customer_id}
            >
              {assigningCustomer ? 'Assigning...' : 'Assign to Zone'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
