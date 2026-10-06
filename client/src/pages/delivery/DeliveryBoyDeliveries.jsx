import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import {
  PackageCheck,
  CheckCircle2,
  XCircle,
  Phone,
  MapPin,
  RefreshCw,
  Search,
  RotateCcw,
  PlusCircle,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Edit3,
  Sparkles,
  Building2,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';

export default function DeliveryBoyDeliveries() {
  const [deliveries, setDeliveries] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'PENDING' | 'DELIVERED' | 'SKIPPED' | 'SPECIAL'
  const [currentDate, setCurrentDate] = useState(getLocalDateString());
  const [toastMessage, setToastMessage] = useState('');

  // ----------------------------------------------------
  // BULK ORDER MODAL STATES
  // ----------------------------------------------------
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkModalCustomer, setBulkModalCustomer] = useState(null);
  const [bulkItems, setBulkItems] = useState([]); // [{ product_id, product_name, variant_label, selling_price, unit_volume_litres, quantity }]
  const [newBulkProductId, setNewBulkProductId] = useState('');
  const [newBulkQuantity, setNewBulkQuantity] = useState(10);
  const [submittingBulk, setSubmittingBulk] = useState(false);
  const [bulkModalError, setBulkModalError] = useState('');

  // Bulk Confirmation Modal
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [bulkConfirmCustomer, setBulkConfirmCustomer] = useState(null);
  const [bulkConfirmItems, setBulkConfirmItems] = useState([]);
  const [confirmingBulk, setConfirmingBulk] = useState(false);

  // ----------------------------------------------------
  // HOUSE CUSTOMER TEMPORARY EDIT QUANTITY MODAL STATES
  // ----------------------------------------------------
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState(null);
  const [editForm, setEditForm] = useState({
    quantity: 1,
    reason: ''
  });
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // ----------------------------------------------------
  // HOUSE CUSTOMER EXTRA PRODUCT MODAL STATES
  // ----------------------------------------------------
  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [extraForm, setExtraForm] = useState({
    customer_id: '',
    product_id: '',
    quantity: 1,
    notes: 'Customer requested on the spot',
    status: 'DELIVERED'
  });
  const [submittingExtra, setSubmittingExtra] = useState(false);
  const [extraError, setExtraError] = useState('');

  // Fetch Deliveries
  const fetchDeliveries = async (targetDate = currentDate) => {
    try {
      setLoading(true);
      setError('');
      const dateToFetch = targetDate || getLocalDateString();
      const res = await api.get(`/deliveries?date=${dateToFetch}`);
      setDeliveries(res || []);
    } catch (err) {
      setError(err.message || "Unable to load today's deliveries.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch Dependency Data
  const fetchDependencies = async () => {
    try {
      const [prods, custs] = await Promise.all([
        api.get('/products'),
        api.get('/customers')
      ]);
      setProducts(prods || []);
      setCustomers(custs || []);
      if (prods && prods.length > 0) {
        setExtraForm((prev) => ({ ...prev, product_id: prods[0].id }));
        setNewBulkProductId(prods[0].id.toString());
      }
    } catch (e) {
      console.error('Failed to load products/customers:', e);
    }
  };

  useEffect(() => {
    fetchDeliveries(currentDate);
    fetchDependencies();

    // Auto-detect midnight rollover every 30s
    const interval = setInterval(() => {
      const freshToday = getLocalDateString();
      if (freshToday !== currentDate) {
        setCurrentDate(freshToday);
      }
    }, 30000);

    const handleFocus = () => {
      const freshToday = getLocalDateString();
      if (freshToday !== currentDate) {
        setCurrentDate(freshToday);
      } else {
        fetchDeliveries(freshToday);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentDate]);

  // Toast Notification Helper
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // ----------------------------------------------------
  // HOUSE CUSTOMER HANDLERS
  // ----------------------------------------------------
  const handleOpenEditModal = (del) => {
    setEditError('');
    setEditingDelivery(del);
    const initialQty = del.status === 'SKIPPED' ? 0 : (del.quantity ?? (del.subscription_quantity || 1));
    const rawReason = del.requirement_reason || del.notes || '';
    const cleanReason = rawReason.replace(/^(Temporary (Change|Skip)|Customer Requirement|Requirement):\s*/i, '').trim();
    setEditForm({
      quantity: initialQty,
      reason: cleanReason
    });
    setIsEditModalOpen(true);
  };

  const handleSaveTemporaryChange = async (overrideQty = null) => {
    if (!editingDelivery) return;
    const targetQty = overrideQty !== null ? overrideQty : parseInt(editForm.quantity, 10);
    if (isNaN(targetQty) || targetQty < 0) {
      setEditError('Quantity must be 0 (to skip) or a positive number.');
      return;
    }

    try {
      setSubmittingEdit(true);
      setEditError('');
      const payload = {
        customer_id: editingDelivery.customer_id,
        product_id: editingDelivery.product_id,
        delivery_date: currentDate,
        quantity: targetQty,
        reason: editForm.reason
      };

      const res = await api.post('/deliveries/temporary-change', payload);
      setIsEditModalOpen(false);
      showToast(res.message || "Today's delivery updated successfully!");
      fetchDeliveries(currentDate);
    } catch (err) {
      setEditError(err.message || "Failed to update today's delivery.");
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleMarkStatus = async (id, status, customNotes = null) => {
    try {
      setDeliveries((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status, notes: customNotes !== null ? customNotes : d.notes } : d))
      );
      await api.put(`/deliveries/${id}/status`, {
        status,
        notes: customNotes !== null ? customNotes : undefined
      });
    } catch (err) {
      alert(err.message || 'Failed to update delivery status');
      fetchDeliveries();
    }
  };

  const handleOpenExtraModal = (del = null) => {
    setExtraError('');
    if (del) {
      setSelectedCustomer({
        id: del.customer_id,
        name: del.customer_name,
        address: del.customer_address,
        route: del.customer_route,
        category: del.customer_category
      });
      setExtraForm({
        customer_id: del.customer_id,
        product_id: products.length > 0 ? products[0].id : '',
        quantity: 1,
        notes: 'Customer requested extra item',
        status: 'DELIVERED'
      });
    } else {
      const firstCust = customers.length > 0 ? customers[0] : null;
      setSelectedCustomer(firstCust);
      setExtraForm({
        customer_id: firstCust ? firstCust.id : '',
        product_id: products.length > 0 ? products[0].id : '',
        quantity: 1,
        notes: 'Customer requested extra item',
        status: 'DELIVERED'
      });
    }
    setIsExtraModalOpen(true);
  };

  const handleSubmitExtraProduct = async (e) => {
    if (e) e.preventDefault();
    if (!extraForm.customer_id || !extraForm.product_id) {
      setExtraError('Please select both a customer and a product.');
      return;
    }
    if (extraForm.quantity <= 0) {
      setExtraError('Quantity must be at least 1.');
      return;
    }

    try {
      setSubmittingExtra(true);
      setExtraError('');
      const payload = {
        customer_id: parseInt(extraForm.customer_id, 10),
        product_id: parseInt(extraForm.product_id, 10),
        quantity: parseInt(extraForm.quantity, 10),
        delivery_date: currentDate,
        status: extraForm.status || 'DELIVERED',
        notes: extraForm.notes
      };

      const res = await api.post('/deliveries/extra', payload);
      setIsExtraModalOpen(false);
      showToast(res.message || 'Extra product added to bill successfully!');
      fetchDeliveries(currentDate);
    } catch (err) {
      setExtraError(err.message || 'Failed to add extra product.');
    } finally {
      setSubmittingExtra(false);
    }
  };

  // ----------------------------------------------------
  // BULK ORDER HANDLERS (MANUAL DAILY PRODUCTS & QUANTITIES)
  // ----------------------------------------------------
  const handleOpenBulkModal = (bulkGroup) => {
    setBulkModalError('');
    setBulkModalCustomer(bulkGroup);
    // Clone existing items
    const initialItems = (bulkGroup.items || []).map((it) => ({
      product_id: it.product_id,
      product_name: it.product_name_snapshot,
      variant_label: it.variant_snapshot,
      category: it.category_snapshot,
      selling_price: it.unit_price_snapshot,
      unit_volume_litres: it.unit_volume_litres_snapshot,
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
    const prodIdNum = parseInt(newBulkProductId, 10);
    const qtyNum = parseInt(newBulkQuantity, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setBulkModalError('Please enter a valid quantity greater than 0.');
      return;
    }

    const prodObj = products.find((p) => p.id === prodIdNum);
    if (!prodObj) return;

    setBulkItems((prev) => {
      const existingIdx = prev.findIndex((it) => it.product_id === prodIdNum);
      if (existingIdx >= 0) {
        // Update quantity of existing product
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + qtyNum
        };
        return updated;
      } else {
        // Append new product
        return [
          ...prev,
          {
            product_id: prodObj.id,
            product_name: prodObj.name,
            variant_label: prodObj.variant_label,
            category: prodObj.category,
            selling_price: prodObj.selling_price,
            unit_volume_litres: prodObj.unit_volume_litres || 1,
            quantity: qtyNum
          }
        ];
      }
    });

    setBulkModalError('');
  };

  const handleUpdateBulkItemQuantity = (productId, newQty) => {
    const parsedQty = Math.max(1, parseInt(newQty, 10) || 1);
    setBulkItems((prev) =>
      prev.map((it) => (it.product_id === productId ? { ...it, quantity: parsedQty } : it))
    );
  };

  const handleRemoveBulkItem = (productId) => {
    setBulkItems((prev) => prev.filter((it) => it.product_id !== productId));
  };

  const handleSaveBulkProducts = async () => {
    if (!bulkModalCustomer) return;
    try {
      setSubmittingBulk(true);
      setBulkModalError('');

      const payload = {
        customer_id: bulkModalCustomer.customer_id,
        delivery_date: currentDate,
        items: bulkItems.map((it) => ({
          product_id: it.product_id,
          quantity: it.quantity
        })),
        notes: 'Bulk Daily Order'
      };

      await api.post('/deliveries/bulk-manage', payload);
      setIsBulkModalOpen(false);
      showToast(`Today's products saved for ${bulkModalCustomer.customer_name}.`);
      fetchDeliveries(currentDate);
    } catch (err) {
      setBulkModalError(err.message || 'Failed to save bulk products.');
    } finally {
      setSubmittingBulk(false);
    }
  };

  // Open Bulk Delivery Confirmation Modal
  const handleOpenBulkConfirm = (bulkGroup) => {
    if (!bulkGroup.items || bulkGroup.items.length === 0) {
      handleOpenBulkModal(bulkGroup);
      return;
    }
    setBulkConfirmCustomer(bulkGroup);
    setBulkConfirmItems(bulkGroup.items);
    setIsBulkConfirmOpen(true);
  };

  const handleConfirmBulkDelivery = async () => {
    if (!bulkConfirmCustomer) return;
    try {
      setConfirmingBulk(true);
      await api.post('/deliveries/bulk-deliver', {
        customer_id: bulkConfirmCustomer.customer_id,
        delivery_date: currentDate
      });
      setIsBulkConfirmOpen(false);
      showToast(`Bulk delivery for ${bulkConfirmCustomer.customer_name} marked as DELIVERED.`);
      fetchDeliveries(currentDate);
    } catch (err) {
      alert(err.message || 'Failed to mark delivery as delivered.');
    } finally {
      setConfirmingBulk(false);
    }
  };

  // ----------------------------------------------------
  // DATA GROUPING & FILTERING
  // ----------------------------------------------------
  // 1. Separate House Deliveries vs Bulk Customers
  const houseDeliveries = [];
  const bulkCustomerMap = new Map();

  for (const del of deliveries) {
    if (del.customer_category === 'BULK_HOTEL') {
      if (!bulkCustomerMap.has(del.customer_id)) {
        bulkCustomerMap.set(del.customer_id, {
          customer_id: del.customer_id,
          customer_name: del.customer_name,
          customer_phone: del.customer_phone,
          customer_address: del.customer_address,
          customer_route: del.customer_route,
          customer_category: del.customer_category,
          delivery_boy_id: del.delivery_boy_id,
          delivery_boy_name: del.delivery_boy_name,
          items: []
        });
      }
      if (del.product_id && del.quantity > 0) {
        bulkCustomerMap.get(del.customer_id).items.push(del);
      }
    } else {
      houseDeliveries.push(del);
    }
  }

  const bulkCustomerGroups = Array.from(bulkCustomerMap.values()).map((bGroup) => {
    const hasProducts = bGroup.items.length > 0;
    const isDelivered = hasProducts && bGroup.items.every((it) => it.status === 'DELIVERED');
    const totalAmount = bGroup.items.reduce((acc, it) => acc + (it.total_amount || 0), 0);
    const totalQuantity = bGroup.items.reduce((acc, it) => acc + (it.quantity || 0), 0);

    return {
      ...bGroup,
      hasProducts,
      isDelivered,
      status: isDelivered ? 'DELIVERED' : 'PENDING',
      totalAmount,
      totalQuantity
    };
  });

  // Filter House Deliveries
  const filteredHouseDeliveries = houseDeliveries.filter((del) => {
    const isSpecial = del.requirement_type && del.requirement_type !== 'NORMAL';
    const matchesSearch =
      del.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      del.customer_address?.toLowerCase().includes(search.toLowerCase()) ||
      del.customer_route?.toLowerCase().includes(search.toLowerCase()) ||
      del.product_name_snapshot?.toLowerCase().includes(search.toLowerCase());

    let matchesStatus = true;
    if (filterStatus === 'SPECIAL') {
      matchesStatus = isSpecial;
    } else if (filterStatus !== 'ALL') {
      matchesStatus = del.status === filterStatus;
    }

    return matchesSearch && matchesStatus;
  });

  // Filter Bulk Groups
  const filteredBulkGroups = bulkCustomerGroups.filter((bGroup) => {
    const matchesSearch =
      bGroup.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      bGroup.customer_address?.toLowerCase().includes(search.toLowerCase()) ||
      bGroup.customer_route?.toLowerCase().includes(search.toLowerCase()) ||
      bGroup.items.some((it) => it.product_name_snapshot?.toLowerCase().includes(search.toLowerCase()));

    let matchesStatus = true;
    if (filterStatus === 'SPECIAL') {
      matchesStatus = false; // Bulk customers don't have house subscription special requirements
    } else if (filterStatus === 'DELIVERED') {
      matchesStatus = bGroup.isDelivered;
    } else if (filterStatus === 'PENDING') {
      matchesStatus = !bGroup.isDelivered;
    } else if (filterStatus === 'SKIPPED') {
      matchesStatus = false;
    }

    return matchesSearch && matchesStatus;
  });

  // Counts
  const totalHousePending = houseDeliveries.filter((d) => d.status === 'PENDING').length;
  const totalHouseDelivered = houseDeliveries.filter((d) => d.status === 'DELIVERED').length;
  const totalHouseSkipped = houseDeliveries.filter((d) => d.status === 'SKIPPED').length;
  const totalSpecial = houseDeliveries.filter((d) => d.requirement_type && d.requirement_type !== 'NORMAL').length;

  const totalBulkPending = bulkCustomerGroups.filter((b) => !b.isDelivered).length;
  const totalBulkDelivered = bulkCustomerGroups.filter((b) => b.isDelivered).length;

  const totalAllPending = totalHousePending + totalBulkPending;
  const totalAllDelivered = totalHouseDelivered + totalBulkDelivered;

  return (
    <div className="page-wrapper">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            background: '#065f46',
            color: 'white',
            padding: '12px 20px',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: '700',
            fontSize: '0.9rem',
            animation: 'fadeIn 0.2s ease-in-out'
          }}
        >
          <CheckCircle2 size={20} color="#34d399" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div
        className="page-header"
        style={{
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}
      >
        <div>
          <h1 className="page-title" style={{ fontSize: '1.25rem' }}>
            <PackageCheck size={24} color="var(--primary)" />
            Today's Deliveries ({formatDisplayDate(currentDate)})
          </h1>
          <p className="page-subtitle">
            {totalAllPending} Pending • {totalAllDelivered} Delivered • {bulkCustomerGroups.length} Bulk Orders
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => handleOpenExtraModal()}
            className="btn btn-warning btn-sm"
            style={{
              fontWeight: '800',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(245,158,11,0.25)'
            }}
          >
            <PlusCircle size={16} /> + Extra Product
          </button>
          <button onClick={() => fetchDeliveries(currentDate)} className="btn btn-outline btn-sm">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search customer, address, route, or product..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '38px', borderRadius: 'var(--radius-full)' }}
          />
          <Search
            size={16}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
          />
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          {[
            { id: 'ALL', label: `All (${houseDeliveries.length + bulkCustomerGroups.length})` },
            { id: 'PENDING', label: `Pending (${totalAllPending})` },
            { id: 'DELIVERED', label: `Delivered (${totalAllDelivered})` },
            { id: 'SPECIAL', label: `Special Instructions (${totalSpecial})` },
            { id: 'SKIPPED', label: `Skipped (${totalHouseSkipped})` }
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setFilterStatus(pill.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid',
                borderColor: filterStatus === pill.id ? 'var(--primary)' : 'var(--border-color)',
                background: filterStatus === pill.id ? 'var(--primary-gradient)' : 'white',
                color: filterStatus === pill.id ? 'white' : 'var(--text-secondary)',
                fontWeight: '700',
                fontSize: '0.75rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Delivery Queue */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading delivery queue...</div>
      ) : error ? (
        <div className="card" style={{ color: 'var(--accent-red)', padding: '20px' }}>
          {error}
        </div>
      ) : filteredHouseDeliveries.length === 0 && filteredBulkGroups.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="No deliveries found"
          description="No items match your filter criteria."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* ========================================================================= */}
          {/* SECTION 1: BULK ORDERS (MANUAL DAILY PRODUCTS & QUANTITIES) */}
          {/* ========================================================================= */}
          {filteredBulkGroups.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredBulkGroups.map((bGroup) => (
                <div
                  key={`bulk_group_${bGroup.customer_id}`}
                  className="card"
                  style={{
                    padding: '16px',
                    borderLeft: `6px solid ${bGroup.isDelivered ? '#10b981' : '#7c3aed'}`,
                    background: bGroup.isDelivered ? '#f0fdf4' : '#faf5ff',
                    boxShadow: '0 4px 16px rgba(124, 58, 237, 0.10)'
                  }}
                >
                  {/* Card Header */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '10px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h2
                          style={{
                            fontSize: '1.15rem',
                            fontWeight: '800',
                            color: 'var(--text-primary)',
                            margin: 0
                          }}
                        >
                          {bGroup.customer_name}
                        </h2>
                        <span
                          className="badge"
                          style={{
                            background: '#7c3aed',
                            color: 'white',
                            fontWeight: '800',
                            fontSize: '0.72rem',
                            letterSpacing: '0.04em'
                          }}
                        >
                          🏨 BULK ORDER
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.78rem',
                          color: 'var(--text-muted)',
                          marginTop: '4px'
                        }}
                      >
                        <MapPin size={14} color="#7c3aed" />
                        <span style={{ fontWeight: '500' }}>{bGroup.customer_address}</span>
                        {bGroup.customer_route && (
                          <span
                            style={{
                              background: '#ede9fe',
                              color: '#6d28d9',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: '700'
                            }}
                          >
                            {bGroup.customer_route}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span
                        className={`badge ${bGroup.isDelivered ? 'badge-success' : 'badge-info'}`}
                        style={{ fontSize: '0.8rem', fontWeight: '800', padding: '4px 10px' }}
                      >
                        {bGroup.isDelivered ? '✓ DELIVERED' : 'PENDING ENTRY'}
                      </span>
                    </div>
                  </div>

                  {/* TODAY'S PRODUCTS SECTION */}
                  <div
                    style={{
                      background: 'white',
                      border: '1.5px solid #e9d5ff',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px',
                      marginBottom: '14px'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                        borderBottom: '1px solid #f3e8ff',
                        paddingBottom: '6px'
                      }}
                    >
                      <span
                        style={{
                          fontWeight: '800',
                          fontSize: '0.8rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: '#6d28d9'
                        }}
                      >
                        TODAY'S PRODUCTS
                      </span>
                      {bGroup.hasProducts && (
                        <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: '600' }}>
                          Delivery Charge: <strong style={{ color: '#059669' }}>₹0 (Bulk Rule)</strong>
                        </span>
                      )}
                    </div>

                    {bGroup.hasProducts ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {bGroup.items.map((it) => {
                          const unitLabel =
                            it.variant_snapshot?.toLowerCase().includes('l')
                              ? 'L'
                              : it.variant_snapshot?.toLowerCase().includes('kg')
                              ? 'kg'
                              : 'L';
                          return (
                            <div
                              key={it.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '6px 8px',
                                background: '#fcfaff',
                                borderRadius: '4px'
                              }}
                            >
                              <div>
                                <span style={{ fontWeight: '800', fontSize: '0.98rem', color: '#1e1b4b' }}>
                                  {it.product_name_snapshot} — {it.quantity} {unitLabel}
                                </span>
                                <span style={{ fontSize: '0.78rem', color: '#64748b', marginLeft: '6px' }}>
                                  (@ ₹{it.unit_price_snapshot?.toFixed(2)} / {unitLabel})
                                </span>
                              </div>
                              <span style={{ fontWeight: '800', fontSize: '0.92rem', color: '#4338ca' }}>
                                ₹{it.total_amount?.toFixed(2)}
                              </span>
                            </div>
                          );
                        })}

                        {/* Subtotal summary */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderTop: '1px dashed #d8b4fe',
                            paddingTop: '8px',
                            marginTop: '4px',
                            fontWeight: '800',
                            fontSize: '0.95rem'
                          }}
                        >
                          <span style={{ color: '#4c1d95' }}>Total Delivery Amount:</span>
                          <span style={{ color: '#6d28d9', fontSize: '1.05rem' }}>
                            ₹{bGroup.totalAmount.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '12px',
                          color: '#7c3aed',
                          background: '#faf5ff',
                          borderRadius: '6px',
                          border: '1px dashed #c4b5fd',
                          fontSize: '0.85rem',
                          fontWeight: '600'
                        }}
                      >
                        <div>No products added for today yet. (Starts empty every day)</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
                          Click <strong>+ Products</strong> below to enter today's items & quantities.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Action Buttons (Simple, Mobile Friendly) */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Call Button */}
                    {bGroup.customer_phone && (
                      <a
                        href={`tel:${bGroup.customer_phone}`}
                        className="btn btn-outline btn-sm"
                        style={{ flex: '1 1 auto', textDecoration: 'none', borderColor: '#c4b5fd', color: '#6d28d9' }}
                      >
                        <Phone size={15} color="#7c3aed" />
                        <span>Call</span>
                      </a>
                    )}

                    {/* Products / Edit Products Button */}
                    <button
                      onClick={() => handleOpenBulkModal(bGroup)}
                      className="btn btn-sm"
                      style={{
                        flex: '1.5 1 auto',
                        background: '#f3e8ff',
                        color: '#6d28d9',
                        border: '1.5px solid #d8b4fe',
                        fontWeight: '800',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <ShoppingBag size={15} color="#7c3aed" />
                      <span>{bGroup.hasProducts ? 'Edit Products' : '+ Products'}</span>
                    </button>

                    {/* Mark Delivered Button */}
                    {!bGroup.isDelivered ? (
                      <button
                        onClick={() => handleOpenBulkConfirm(bGroup)}
                        className="btn btn-success btn-sm"
                        disabled={!bGroup.hasProducts}
                        style={{
                          flex: '2 1 auto',
                          padding: '10px 16px',
                          fontSize: '0.875rem',
                          fontWeight: '800',
                          opacity: !bGroup.hasProducts ? 0.5 : 1
                        }}
                        title={!bGroup.hasProducts ? 'Add products first' : 'Mark Delivered'}
                      >
                        <CheckCircle2 size={16} /> Mark Delivered
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          // Undo bulk deliveries to pending
                          bGroup.items.forEach((it) => handleMarkStatus(it.id, 'PENDING'));
                        }}
                        className="btn btn-outline btn-sm"
                        style={{ flex: '1 1 auto' }}
                        title="Undo Delivered Status"
                      >
                        <RotateCcw size={14} /> Undo Delivered
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION 2: HOUSE CUSTOMERS (SUBSCRIPTION-BASED WORKFLOW - 100% UNCHANGED) */}
          {/* ========================================================================= */}
          {filteredHouseDeliveries.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredHouseDeliveries.map((del) => {
                const reqType = del.requirement_type || 'NORMAL';
                const isSkippedReq = reqType === 'SKIP_DELIVERY';
                const isQtyChangeReq = reqType === 'CHANGE_QUANTITY';
                const isExtraReq = reqType === 'ADD_EXTRA_QUANTITY';
                const hasSpecialReq = isSkippedReq || isQtyChangeReq || isExtraReq;
                const hasExtraNote =
                  del.notes &&
                  (del.notes.includes('Extra') || del.notes.includes('Adhoc') || del.notes.includes('+'));

                return (
                  <div
                    key={del.id}
                    className="card"
                    style={{
                      padding: '16px',
                      borderLeft: `5px solid ${
                        isSkippedReq
                          ? '#ef4444'
                          : del.status === 'DELIVERED'
                          ? '#10b981'
                          : del.status === 'SKIPPED'
                          ? '#f59e0b'
                          : hasSpecialReq
                          ? '#0284c7'
                          : '#0054a6'
                      }`,
                      background: isSkippedReq
                        ? '#fff5f5'
                        : del.status === 'DELIVERED'
                        ? '#f0fdf4'
                        : 'white',
                      boxShadow: hasSpecialReq ? '0 4px 14px rgba(0,0,0,0.08)' : 'var(--shadow-sm)'
                    }}
                  >
                    {/* Customer Header */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '8px'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <h3
                            style={{
                              fontSize: '1.05rem',
                              fontWeight: '800',
                              color: 'var(--text-primary)',
                              margin: 0
                            }}
                          >
                            {del.customer_name}
                          </h3>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            marginTop: '2px'
                          }}
                        >
                          <MapPin size={13} />
                          <span>{del.customer_address}</span>
                          {del.customer_route && (
                            <span
                              style={{
                                background: '#f1f5f9',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: '600'
                              }}
                            >
                              {del.customer_route}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {hasExtraNote && (
                          <span
                            className="badge"
                            style={{
                              background: '#fef3c7',
                              color: '#92400e',
                              border: '1px solid #fde68a',
                              fontWeight: '800',
                              fontSize: '0.7rem'
                            }}
                          >
                            ⭐ Extra Added
                          </span>
                        )}
                        <span
                          className={`badge ${
                            del.status === 'DELIVERED'
                              ? 'badge-success'
                              : del.status === 'SKIPPED'
                              ? 'badge-warning'
                              : 'badge-info'
                          }`}
                        >
                          {del.status}
                        </span>
                      </div>
                    </div>

                    {/* Requirement Warning Banners */}
                    {isSkippedReq && (
                      <div
                        style={{
                          background: '#fee2e2',
                          border: '1.5px solid #ef4444',
                          borderRadius: 'var(--radius-md)',
                          padding: '10px 14px',
                          marginBottom: '12px',
                          color: '#991b1b'
                        }}
                      >
                        <div
                          style={{
                            fontWeight: '800',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <XCircle size={16} color="#dc2626" />
                          ⚠ DO NOT DELIVER TODAY — CUSTOMER SKIP REQUIREMENT
                        </div>
                        <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                          Product: <strong>{del.product_name_snapshot} ({del.variant_snapshot})</strong>
                        </div>
                        {del.requirement_reason && (
                          <div style={{ fontSize: '0.78rem', marginTop: '3px', fontStyle: 'italic' }}>
                            Reason: {del.requirement_reason}
                          </div>
                        )}
                      </div>
                    )}

                    {isQtyChangeReq && (
                      <div
                        style={{
                          background: '#e0f2fe',
                          border: '1.5px solid #0284c7',
                          borderRadius: 'var(--radius-md)',
                          padding: '10px 14px',
                          marginBottom: '12px',
                          color: '#0369a1'
                        }}
                      >
                        <div
                          style={{
                            fontWeight: '800',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <TrendingUp size={16} color="#0284c7" />
                          ✏ TEMPORARY QUANTITY CHANGE
                        </div>
                        <div style={{ fontSize: '0.813rem', marginTop: '4px', fontWeight: '700' }}>
                          Deliver Today: {del.quantity} pkt (Normal: {del.subscription_quantity || del.req_normal_quantity || 1} pkt)
                        </div>
                        {del.requirement_reason && (
                          <div style={{ fontSize: '0.78rem', marginTop: '3px', fontStyle: 'italic' }}>
                            Reason: {del.requirement_reason}
                          </div>
                        )}
                      </div>
                    )}

                    {isExtraReq && (
                      <div
                        style={{
                          background: '#ecfdf5',
                          border: '1.5px solid #10b981',
                          borderRadius: 'var(--radius-md)',
                          padding: '10px 14px',
                          marginBottom: '12px',
                          color: '#065f46'
                        }}
                      >
                        <div
                          style={{
                            fontWeight: '800',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <PlusCircle size={16} color="#10b981" />
                          ⚠ EXTRA QUANTITY INSTRUCTION
                        </div>
                        <div style={{ fontSize: '0.813rem', marginTop: '4px', fontWeight: '700' }}>
                          Normal: {del.subscription_quantity || del.req_normal_quantity || 1} + Extra: {del.req_additional_quantity || 1} = Today's Total: {del.quantity} pkt
                        </div>
                        {del.requirement_reason && (
                          <div style={{ fontSize: '0.78rem', marginTop: '3px', fontStyle: 'italic' }}>
                            Reason: {del.requirement_reason}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Product Info Banner */}
                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 12px',
                        marginBottom: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--primary-dark)' }}>
                          {del.quantity} × {del.product_name_snapshot}
                        </span>
                        <span style={{ fontSize: '0.813rem', color: 'var(--text-secondary)', marginLeft: '6px' }}>
                          ({del.variant_snapshot})
                        </span>
                        {((del.subscription_quantity && del.quantity !== del.subscription_quantity) || isQtyChangeReq) && del.status !== 'SKIPPED' && (
                          <span
                            className="badge"
                            style={{
                              background: '#dbeafe',
                              color: '#1e40af',
                              border: '1px solid #bfdbfe',
                              fontWeight: '800',
                              fontSize: '0.72rem',
                              marginLeft: '8px'
                            }}
                          >
                            ✏ Today: {del.quantity} (Normal: {del.subscription_quantity || del.req_normal_quantity || 1})
                          </span>
                        )}
                        {del.notes && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', fontStyle: 'italic' }}>
                            📝 {del.notes}
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                          ₹{del.total_amount?.toFixed(2)}
                        </div>
                        {del.delivery_charge_snapshot > 0 && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            Incl. ₹{del.delivery_charge_snapshot} delivery
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions: Call, Edit Quantity, Add Extra Product, Deliver / Undo / Skip */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {del.customer_phone && (
                        <a
                          href={`tel:${del.customer_phone}`}
                          className="btn btn-outline btn-sm"
                          style={{ flex: '1 1 auto', textDecoration: 'none' }}
                        >
                          <Phone size={14} color="var(--primary)" />
                          <span>Call ({del.customer_phone})</span>
                        </a>
                      )}

                      {/* Edit Today's Quantity Button */}
                      <button
                        onClick={() => handleOpenEditModal(del)}
                        className="btn btn-sm"
                        style={{
                          flex: '1 1 auto',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1.5px solid #bfdbfe',
                          fontWeight: '800',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                        title="Edit today's delivery quantity"
                      >
                        <Edit3 size={15} color="#2563eb" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => handleOpenExtraModal(del)}
                        className="btn btn-sm"
                        style={{
                          flex: '1 1 auto',
                          background: '#fffbeb',
                          color: '#b45309',
                          border: '1.5px solid #fde68a',
                          fontWeight: '800',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <PlusCircle size={15} color="#d97706" />
                        <span>+ Extra Product</span>
                      </button>

                      {isSkippedReq ? (
                        del.status !== 'SKIPPED' ? (
                          <button
                            onClick={() =>
                              handleMarkStatus(
                                del.id,
                                'SKIPPED',
                                del.requirement_reason
                                    ? `Customer Requirement: ${del.requirement_reason}`
                                    : 'Customer Requirement: Skip Delivery'
                              )
                            }
                            className="btn btn-danger btn-sm"
                            style={{
                              flex: '2 1 auto',
                              padding: '10px 16px',
                              fontSize: '0.875rem',
                              fontWeight: '800',
                              background: '#dc2626',
                              borderColor: '#b91c1c'
                            }}
                          >
                            <XCircle size={16} /> Confirm Skip
                          </button>
                        ) : (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: '#166534',
                              fontWeight: '700',
                              fontSize: '0.85rem'
                            }}
                          >
                            <CheckCircle2 size={16} /> Skip Confirmed
                          </div>
                        )
                      ) : del.status !== 'DELIVERED' ? (
                        <button
                          onClick={() => handleMarkStatus(del.id, 'DELIVERED')}
                          className="btn btn-success btn-sm"
                          style={{
                            flex: '2 1 auto',
                            padding: '10px 16px',
                            fontSize: '0.875rem',
                            fontWeight: '800'
                          }}
                        >
                          <CheckCircle2 size={16} />
                          {isQtyChangeReq
                            ? `Deliver ${del.quantity} pkt`
                            : isExtraReq
                            ? `Deliver ${del.quantity} pkt (Extra)`
                            : 'Mark Delivered'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleMarkStatus(del.id, 'PENDING')}
                          className="btn btn-outline btn-sm"
                          style={{ flex: '1 1 auto' }}
                          title="Undo Delivery"
                        >
                          <RotateCcw size={14} /> Undo
                        </button>
                      )}

                      {!isSkippedReq && del.status !== 'SKIPPED' && (
                        <button
                          onClick={() => handleMarkStatus(del.id, 'SKIPPED')}
                          className="btn btn-outline btn-sm"
                          style={{ color: 'var(--accent-amber)', borderColor: '#fde68a' }}
                        >
                          <XCircle size={14} /> Skip
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
            <div
              style={{
                padding: '10px 14px',
                background: '#fee2e2',
                border: '1px solid #f87171',
                color: '#991b1b',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
                fontWeight: '600'
              }}
            >
              {bulkModalError}
            </div>
          )}

          {/* Customer Address Banner */}
          <div
            style={{
              background: '#faf5ff',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid #e9d5ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <div style={{ fontWeight: '800', color: '#6d28d9', fontSize: '0.95rem' }}>
                {bulkModalCustomer?.customer_name} (Bulk Customer)
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
                📍 {bulkModalCustomer?.customer_address}
              </div>
            </div>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: '800',
                background: '#ede9fe',
                color: '#6d28d9',
                padding: '4px 8px',
                borderRadius: '4px'
              }}
            >
              {formatDisplayDate(currentDate)}
            </span>
          </div>

          {/* CURRENT PRODUCT LIST */}
          <div>
            <label
              className="form-label"
              style={{
                fontWeight: '800',
                fontSize: '0.85rem',
                color: '#4c1d95',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              Today's Selected Products ({bulkItems.length})
            </label>

            {bulkItems.length === 0 ? (
              <div
                style={{
                  padding: '16px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  border: '1px dashed #cbd5e1',
                  borderRadius: 'var(--radius-md)',
                  color: '#64748b',
                  fontSize: '0.85rem'
                }}
              >
                No products added yet. Select a product below and click <strong>+ Add Product</strong>.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {bulkItems.map((item) => {
                  const unitLabel =
                    item.variant_label?.toLowerCase().includes('l')
                      ? 'L'
                      : item.variant_label?.toLowerCase().includes('kg')
                      ? 'kg'
                      : 'L';
                  const itemSubtotal = (item.selling_price * item.quantity).toFixed(2);

                  return (
                    <div
                      key={item.product_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        background: '#fcfaff',
                        border: '1px solid #e9d5ff',
                        borderRadius: 'var(--radius-md)',
                        gap: '10px'
                      }}
                    >
                      <div style={{ flex: '1 1 auto' }}>
                        <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#1e1b4b' }}>
                          {item.product_name} ({item.variant_label})
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          ₹{item.selling_price?.toFixed(2)} per {unitLabel} • Subtotal: <strong>₹{itemSubtotal}</strong>
                        </div>
                      </div>

                      {/* Quantity Modifier */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleUpdateBulkItemQuantity(item.product_id, item.quantity - 5)}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '4px',
                            border: '1px solid #cbd5e1',
                            background: 'white',
                            cursor: 'pointer',
                            fontWeight: '800',
                            fontSize: '0.9rem'
                          }}
                          title="-5"
                        >
                          -5
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="9999"
                          value={item.quantity}
                          onChange={(e) => handleUpdateBulkItemQuantity(item.product_id, e.target.value)}
                          style={{
                            width: '60px',
                            height: '32px',
                            textAlign: 'center',
                            fontWeight: '800',
                            fontSize: '0.95rem',
                            border: '1.5px solid #7c3aed',
                            borderRadius: '4px'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdateBulkItemQuantity(item.product_id, item.quantity + 5)}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '4px',
                            border: '1px solid #cbd5e1',
                            background: 'white',
                            cursor: 'pointer',
                            fontWeight: '800',
                            fontSize: '0.9rem'
                          }}
                          title="+5"
                        >
                          +5
                        </button>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#4c1d95', minWidth: '18px' }}>
                          {unitLabel}
                        </span>
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveBulkItem(item.product_id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#dc2626',
                          cursor: 'pointer',
                          padding: '6px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Remove product"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ADD PRODUCT FORM */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '14px'
            }}
          >
            <div style={{ fontWeight: '800', fontSize: '0.85rem', marginBottom: '10px', color: '#334155' }}>
              + Add Product for Today's Bulk Delivery
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: '2 1 200px' }}>
                <select
                  className="form-input"
                  value={newBulkProductId}
                  onChange={(e) => setNewBulkProductId(e.target.value)}
                  style={{ fontWeight: '600' }}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.category}] {p.name} ({p.variant_label}) — ₹{p.selling_price.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 120px' }}>
                <input
                  type="number"
                  min="1"
                  max="9999"
                  className="form-input"
                  value={newBulkQuantity}
                  onChange={(e) => setNewBulkQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={{ textAlign: 'center', fontWeight: '800' }}
                  placeholder="Qty"
                />
                <button
                  type="button"
                  onClick={handleAddProductToBulkList}
                  className="btn btn-primary"
                  style={{ fontWeight: '800', whiteSpace: 'nowrap', padding: '8px 14px' }}
                >
                  <Plus size={16} /> Add
                </button>
              </div>
            </div>

            {/* Quick Quantity Shortcuts */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700' }}>Quick Qty:</span>
              {[5, 10, 15, 20, 30, 50].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setNewBulkQuantity(q)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: newBulkQuantity === q ? '#7c3aed' : 'white',
                    color: newBulkQuantity === q ? 'white' : '#475569',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* TOTAL SUMMARY CARD */}
          <div
            style={{
              background: '#faf5ff',
              border: '1.5px solid #d8b4fe',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#4c1d95' }}>
              <span>Total Bulk Items:</span>
              <strong>{bulkItems.reduce((acc, it) => acc + it.quantity, 0)} Units ({bulkItems.length} Products)</strong>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '1.05rem',
                fontWeight: '800',
                color: '#6d28d9',
                marginTop: '6px',
                borderTop: '1px dashed #d8b4fe',
                paddingTop: '6px'
              }}
            >
              <span>Estimated Delivery Total:</span>
              <span>
                ₹{bulkItems.reduce((acc, it) => acc + it.selling_price * it.quantity, 0).toFixed(2)}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '700', marginTop: '4px' }}>
              ✓ Delivery Charge: ₹0.00 (Bulk Customer Standard Rule)
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button
              type="button"
              onClick={() => setIsBulkModalOpen(false)}
              className="btn btn-outline"
              disabled={submittingBulk}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveBulkProducts}
              className="btn btn-primary"
              style={{
                fontWeight: '800',
                background: '#7c3aed',
                borderColor: '#6d28d9',
                minWidth: '180px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
              disabled={submittingBulk}
            >
              {submittingBulk ? (
                <span>Saving...</span>
              ) : (
                <>
                  <CheckCircle2 size={16} /> Save Products
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* CONFIRM BULK DELIVERY MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isBulkConfirmOpen}
        onClose={() => !confirmingBulk && setIsBulkConfirmOpen(false)}
        title="Confirm Bulk Delivery"
        maxWidth="480px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '14px'
            }}
          >
            <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-primary)' }}>
              {bulkConfirmCustomer?.customer_name}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              📍 {bulkConfirmCustomer?.customer_address}
            </div>
          </div>

          <div>
            <div
              style={{
                fontWeight: '800',
                fontSize: '0.85rem',
                color: '#6d28d9',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '8px'
              }}
            >
              Today's Products:
            </div>
            <div
              style={{
                background: '#faf5ff',
                border: '1px solid #e9d5ff',
                borderRadius: 'var(--radius-md)',
                padding: '12px'
              }}
            >
              {bulkConfirmItems.map((it) => {
                const unitLabel =
                  it.variant_snapshot?.toLowerCase().includes('l')
                    ? 'L'
                    : it.variant_snapshot?.toLowerCase().includes('kg')
                    ? 'kg'
                    : 'L';
                return (
                  <div
                    key={it.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                      borderBottom: '1px solid #f3e8ff',
                      fontWeight: '700',
                      fontSize: '0.95rem'
                    }}
                  >
                    <span>
                      {it.product_name_snapshot} — {it.quantity} {unitLabel}
                    </span>
                    <span style={{ color: '#6d28d9' }}>₹{it.total_amount?.toFixed(2)}</span>
                  </div>
                );
              })}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: '10px',
                  marginTop: '6px',
                  fontWeight: '800',
                  fontSize: '1rem',
                  color: '#4c1d95'
                }}
              >
                <span>Total Amount:</span>
                <span>
                  ₹{bulkConfirmItems.reduce((acc, it) => acc + (it.total_amount || 0), 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '10px 14px',
              background: '#fef3c7',
              border: '1px solid #fde68a',
              borderRadius: 'var(--radius-md)',
              color: '#92400e',
              fontSize: '0.85rem',
              fontWeight: '700',
              textAlign: 'center'
            }}
          >
            Are these products and quantities correct for today's delivery?
          </div>

          {/* Modal Actions */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button
              type="button"
              onClick={() => setIsBulkConfirmOpen(false)}
              className="btn btn-outline"
              disabled={confirmingBulk}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmBulkDelivery}
              className="btn btn-success"
              style={{
                fontWeight: '800',
                minWidth: '160px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
              disabled={confirmingBulk}
            >
              {confirmingBulk ? (
                <span>Confirming...</span>
              ) : (
                <>
                  <CheckCircle2 size={16} /> Confirm Delivery
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* HOUSE CUSTOMER EXTRA PRODUCT MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isExtraModalOpen}
        onClose={() => !submittingExtra && setIsExtraModalOpen(false)}
        title="Add Extra Product to Customer"
        maxWidth="540px"
      >
        <form onSubmit={handleSubmitExtraProduct} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {extraError && (
            <div
              style={{
                padding: '10px 14px',
                background: '#fee2e2',
                border: '1px solid #f87171',
                color: '#991b1b',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
                fontWeight: '600'
              }}
            >
              {extraError}
            </div>
          )}

          {selectedCustomer ? (
            <div
              style={{
                background: '#f1f5f9',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--text-primary)' }}>
                  {selectedCustomer.name}
                </div>
                <div
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--text-muted)',
                    marginTop: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <MapPin size={12} />
                  <span>{selectedCustomer.address}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--primary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: '700' }}>
                Select Customer *
              </label>
              <select
                className="form-input"
                value={extraForm.customer_id}
                onChange={(e) => {
                  const cust = customers.find((c) => c.id === parseInt(e.target.value, 10));
                  setSelectedCustomer(cust || null);
                  setExtraForm((prev) => ({ ...prev, customer_id: e.target.value }));
                }}
                required
              >
                <option value="">-- Choose Customer on Route --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.route || 'No Route'} - {c.address})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Product Selection */}
          <div className="form-group">
            <label
              className="form-label"
              style={{ fontWeight: '700', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>Choose Product to Add *</span>
            </label>
            <select
              className="form-input"
              value={extraForm.product_id}
              onChange={(e) => setExtraForm({ ...extraForm, product_id: e.target.value })}
              required
              style={{ fontSize: '0.95rem', fontWeight: '600' }}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.category}] {p.name} ({p.variant_label}) — ₹{p.selling_price.toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity Selector */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: '700' }}>
              Quantity (Packets / Units)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setExtraForm((prev) => ({ ...prev, quantity: Math.max(1, prev.quantity - 1) }))}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  background: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem',
                  fontWeight: '800'
                }}
              >
                <Minus size={18} />
              </button>

              <input
                type="number"
                min="1"
                max="100"
                className="form-input"
                value={extraForm.quantity}
                onChange={(e) =>
                  setExtraForm({ ...extraForm, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })
                }
                style={{ textAlign: 'center', fontSize: '1.2rem', fontWeight: '800', width: '80px' }}
                required
              />

              <button
                type="button"
                onClick={() => setExtraForm((prev) => ({ ...prev, quantity: prev.quantity + 1 }))}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  background: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem',
                  fontWeight: '800'
                }}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: '700' }}>
              Note / Reason (Optional)
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Customer requested on the spot"
              value={extraForm.notes}
              onChange={(e) => setExtraForm({ ...extraForm, notes: e.target.value })}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => setIsExtraModalOpen(false)}
              className="btn btn-outline"
              disabled={submittingExtra}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                fontWeight: '800',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                minWidth: '180px',
                justifyContent: 'center'
              }}
              disabled={submittingExtra}
            >
              {submittingExtra ? (
                <span>Adding to Bill...</span>
              ) : (
                <>
                  <CheckCircle2 size={16} /> Confirm & Add to Bill
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* HOUSE CUSTOMER EDIT TODAY'S DELIVERY QUANTITY MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => !submittingEdit && setIsEditModalOpen(false)}
        title="Edit Today's Delivery"
        maxWidth="500px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {editError && (
            <div
              style={{
                padding: '10px 14px',
                background: '#fee2e2',
                border: '1px solid #f87171',
                color: '#991b1b',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
                fontWeight: '600'
              }}
            >
              {editError}
            </div>
          )}

          {/* Customer & Product Banner */}
          <div
            style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: '800', fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  {editingDelivery?.customer_name}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={13} color="var(--primary)" />
                  <span>{editingDelivery?.customer_address}</span>
                  {editingDelivery?.customer_route && <span>• Route: {editingDelivery?.customer_route}</span>}
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: '800',
                  background: '#e0f2fe',
                  color: '#0369a1',
                  padding: '3px 8px',
                  borderRadius: '4px'
                }}
              >
                {formatDisplayDate(currentDate)}
              </span>
            </div>

            <div
              style={{
                marginTop: '10px',
                paddingTop: '8px',
                borderTop: '1px dashed #cbd5e1',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <span style={{ fontWeight: '800', color: 'var(--primary-dark)', fontSize: '0.95rem' }}>
                  {editingDelivery?.product_name_snapshot} ({editingDelivery?.variant_snapshot})
                </span>
                <span style={{ fontSize: '0.78rem', color: '#64748b', marginLeft: '6px' }}>
                  @ ₹{editingDelivery?.unit_price_snapshot?.toFixed(2)}/unit
                </span>
              </div>
            </div>

            {/* Permanent Subscription Note */}
            <div
              style={{
                marginTop: '8px',
                padding: '6px 10px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '6px',
                fontSize: '0.78rem',
                color: '#166534',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Sparkles size={14} color="#16a34a" />
              <span>
                Permanent Subscription: <strong>{editingDelivery?.subscription_quantity || editingDelivery?.req_normal_quantity || editingDelivery?.quantity || 1} packet(s)/day</strong> (Unchanged)
              </span>
            </div>
          </div>

          {/* Today's Quantity Input */}
          <div className="form-group">
            <label
              className="form-label"
              style={{ fontWeight: '800', fontSize: '0.875rem', display: 'flex', justifyContent: 'space-between' }}
            >
              <span>Today's Quantity for {formatDisplayDate(currentDate)}</span>
              <span style={{ color: '#64748b', fontWeight: '600', fontSize: '0.78rem' }}>
                {parseInt(editForm.quantity, 10) === 0 ? '⚠ Skip Today' : `${editForm.quantity} Packet(s)`}
              </span>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', margin: '8px 0' }}>
              <button
                type="button"
                onClick={() => setEditForm((prev) => ({ ...prev, quantity: Math.max(0, parseInt(prev.quantity, 10) - 1) }))}
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid #cbd5e1',
                  background: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem',
                  fontWeight: '800',
                  color: 'var(--text-primary)'
                }}
                title="Decrease"
              >
                <Minus size={20} />
              </button>

              <input
                type="number"
                min="0"
                max="99"
                className="form-input"
                value={editForm.quantity}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0);
                  setEditForm((prev) => ({ ...prev, quantity: val }));
                }}
                style={{
                  textAlign: 'center',
                  fontSize: '1.35rem',
                  fontWeight: '900',
                  width: '90px',
                  height: '46px',
                  borderColor: parseInt(editForm.quantity, 10) === 0 ? '#ef4444' : 'var(--primary)',
                  color: parseInt(editForm.quantity, 10) === 0 ? '#dc2626' : 'var(--primary-dark)'
                }}
              />

              <button
                type="button"
                onClick={() => setEditForm((prev) => ({ ...prev, quantity: (parseInt(prev.quantity, 10) || 0) + 1 }))}
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: 'var(--radius-md)',
                  border: '1.5px solid #cbd5e1',
                  background: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem',
                  fontWeight: '800',
                  color: 'var(--text-primary)'
                }}
                title="Increase"
              >
                <Plus size={20} />
              </button>
            </div>

            {/* Quick Quantity Shortcuts */}
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setEditForm((prev) => ({ ...prev, quantity: 0, reason: prev.reason || 'Customer requested no milk today' }))}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: '1px solid #fca5a5',
                  background: parseInt(editForm.quantity, 10) === 0 ? '#ef4444' : '#fff5f5',
                  color: parseInt(editForm.quantity, 10) === 0 ? 'white' : '#b91c1c',
                  fontSize: '0.75rem',
                  fontWeight: '800',
                  cursor: 'pointer'
                }}
              >
                0 (Skip Today)
              </button>
              {[1, 2, 3, 4, 5].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setEditForm((prev) => ({ ...prev, quantity: q }))}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                    background: parseInt(editForm.quantity, 10) === q ? 'var(--primary)' : 'white',
                    color: parseInt(editForm.quantity, 10) === q ? 'white' : '#334155',
                    fontSize: '0.78rem',
                    fontWeight: '800',
                    cursor: 'pointer'
                  }}
                >
                  {q} pkt
                </button>
              ))}
            </div>
          </div>

          {/* Reason / Note Input */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: '700', fontSize: '0.85rem' }}>
              Reason / Note (Optional)
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Customer requested 1 packet today"
              value={editForm.reason}
              onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
            />
            {/* Quick Reason Suggestions */}
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '6px' }}>
              {[
                'Customer called to reduce',
                'Customer requested extra',
                'Customer out for the day (Skip)',
                'Customer requested 1 packet today'
              ].map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setEditForm((prev) => ({ ...prev, reason: sug }))}
                  style={{
                    padding: '2px 8px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          {/* Temporary notice indicator */}
          <div
            style={{
              padding: '8px 12px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              fontSize: '0.78rem',
              color: '#1e40af',
              lineHeight: '1.4'
            }}
          >
            ℹ <strong>Date-Specific Override:</strong> This change applies only to today's delivery. Tomorrow will automatically return to the customer's permanent subscription.
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="btn btn-outline"
              disabled={submittingEdit}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSaveTemporaryChange()}
              className="btn btn-primary"
              style={{
                fontWeight: '800',
                minWidth: '170px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
              disabled={submittingEdit}
            >
              {submittingEdit ? (
                <span>Saving...</span>
              ) : (
                <>
                  <CheckCircle2 size={16} /> Save Today's Change
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
