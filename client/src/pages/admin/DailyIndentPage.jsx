import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import {
  TrendingUp,
  ShoppingBag,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Save,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Package,
  RotateCcw,
  FileText,
  DollarSign,
  Truck,
  Info,
  RefreshCw,
  Search,
  Filter,
  Layers,
  Clock,
  Coins,
  ArrowUpRight,
  Check,
  X,
  Edit2,
  Download,
  Printer,
  ChevronDown,
  Sparkles,
  AlertTriangle,
  MinusCircle,
  ShoppingCart,
  Boxes
} from 'lucide-react';

// Single clean currency formatter (guarantees NO duplicate ₹₹ symbols)
const formatINR = (val) => {
  const num = Number(val || 0);
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatUnits = (val) => {
  const num = Number(val || 0);
  return num.toLocaleString('en-IN');
};

// Product image helper
const getProductImage = (name = '') => {
  const n = String(name).toLowerCase();
  if (n.includes('curd') || n.includes('dahi')) return '/images/products/curd-dahi.jpg';
  if (n.includes('shubam') || n.includes('shubham') || n.includes('orange')) return '/images/products/orange-shubham.jpg';
  if (n.includes('samruddhi') || n.includes('samruddi')) return '/images/products/samruddhi-red.jpg';
  if (n.includes('special')) return '/images/products/special-green.jpg';
  if (n.includes('toned') || n.includes('blue')) return '/images/products/toned-blue.jpg';
  if (n.includes('cow')) return '/images/products/toned-blue.jpg';
  return null;
};

export default function DailyIndentPage() {
  const [currentDate, setCurrentDate] = useState(getLocalDateString());
  // Steps: 'INDENT' (Daily Indent Management) | 'CLOSING' (Stock & Closing Reconciliation) | 'ANALYTICS' (Summary & Profit)
  const [activeStep, setActiveStep] = useState('INDENT');
  const [mobileSubTab, setMobileSubTab] = useState('ENTRY'); // 'ENTRY' | 'SUMMARY'

  // Indent metadata
  const [invoiceNo, setInvoiceNo] = useState('');
  const [supplierName, setSupplierName] = useState('KMF / Nandini Dairy');
  const [parlourName, setParlourName] = useState('Seegehalli Parlour');
  const [crateDeposit, setCrateDeposit] = useState('0');
  const [otherCharges, setOtherCharges] = useState('0');
  const [status, setStatus] = useState('OPEN');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [indentExists, setIndentExists] = useState(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState('09:30 AM');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [productFilter, setProductFilter] = useState('ALL'); // 'ALL' | 'ORDERED'
  const [showZeroStock, setShowZeroStock] = useState(true);

  // Modals & Forms
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [modalForm, setModalForm] = useState({
    product_name: '',
    item_code: '',
    category: 'Milk',
    unit_label: '500 ml',
    inward_qty: 1,
    purchase_price: 30.0,
    selling_price: 32.0
  });

  // Inline adder row state
  const [inlineProduct, setInlineProduct] = useState('');
  const [inlineQty, setInlineQty] = useState(10);
  const [inlineUnitCost, setInlineUnitCost] = useState('25.65');

  // Catalogs & Summaries
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  // Helper date stepper
  const changeDateBy = (days) => {
    const d = new Date(currentDate + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    setCurrentDate(d.toISOString().split('T')[0]);
  };

  // Load catalog products for dropdown
  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const prods = await api.get('/products');
        if (Array.isArray(prods)) {
          setCatalogProducts(prods);
        }
      } catch (err) {
        // Fallback silently
      }
    };
    loadCatalog();
  }, []);

  // Fetch Indent and Profit Summary for currentDate
  const fetchData = async (targetDate = currentDate) => {
    try {
      setLoading(true);
      const [indentRes, summaryRes] = await Promise.all([
        api.get(`/indents?date=${targetDate}`),
        api.get(`/indents/summary?date=${targetDate}`)
      ]);

      setSummary(summaryRes || null);

      if (indentRes) {
        setIndentExists(indentRes.exists || false);
        const ind = indentRes.indent || {};
        setInvoiceNo(ind.invoice_no || '');
        setSupplierName(ind.supplier_name || 'KMF / Nandini Dairy');
        setCrateDeposit(String(ind.crate_deposit_amount || 0));
        setOtherCharges(String(ind.other_charges || 0));
        setStatus(ind.status || 'OPEN');
        setNotes(ind.notes || '');

        if (ind.updated_at) {
          const dt = new Date(ind.updated_at);
          setLastUpdatedTime(
            dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
          );
        } else {
          setLastUpdatedTime('09:30 AM');
        }

        const rawItems = indentRes.items || [];
        setItems(
          rawItems.map((it) => ({
            product_id: it.product_id || null,
            product_name: it.product_name || '',
            item_code: it.item_code || '',
            category: it.category || 'Milk',
            unit_label: it.unit_label || '500 ml',
            opening_stock: Number(it.opening_stock ?? 0),
            inward_qty: Number(it.inward_qty ?? 0),
            purchase_price: Number(it.purchase_price ?? 0),
            selling_price: Number(it.selling_price ?? 0),
            closing_stock: Number(it.closing_stock ?? 0),
            damaged_qty: Number(it.damaged_qty ?? 0),
            missing_qty: Number(it.missing_qty ?? 0),
            notes: it.notes || ''
          }))
        );
      }
    } catch (err) {
      console.error('Fetch indent error:', err);
      showToast(err.message || 'Error loading indent data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(currentDate);
  }, [currentDate]);

  // Load Nandini KMF Template
  const handleLoadTemplate = async () => {
    try {
      const template = await api.get('/indents/template');
      if (Array.isArray(template)) {
        setItems(
          template.map((t) => ({
            ...t,
            opening_stock: 0,
            inward_qty: 0,
            closing_stock: 0,
            damaged_qty: 0,
            missing_qty: 0,
            notes: ''
          }))
        );
        showToast('Standard Nandini KMF product template loaded!');
      }
    } catch (err) {
      showToast('Failed to load template');
    }
  };

  // Stepper handlers
  const handleUpdateItem = (index, field, value) => {
    setItems((prev) => {
      const updated = [...prev];
      const numVal = Math.max(0, isNaN(value) ? 0 : Number(value));
      updated[index] = { ...updated[index], [field]: numVal };
      return updated;
    });
  };

  const handleAdjustQty = (index, field, delta) => {
    setItems((prev) => {
      const updated = [...prev];
      const cur = Number(updated[index][field] || 0);
      const nextVal = Math.max(0, cur + delta);
      updated[index] = { ...updated[index], [field]: nextVal };
      return updated;
    });
  };

  const handleRemoveItem = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
    showToast('Product removed from indent');
  };

  // Open modal for editing or adding
  const handleOpenAddModal = (index = null) => {
    if (index !== null && items[index]) {
      setEditingIndex(index);
      const target = items[index];
      setModalForm({
        product_name: target.product_name,
        item_code: target.item_code,
        category: target.category,
        unit_label: target.unit_label,
        inward_qty: target.inward_qty,
        purchase_price: target.purchase_price,
        selling_price: target.selling_price
      });
    } else {
      setEditingIndex(null);
      setModalForm({
        product_name: catalogProducts[0]?.name || 'Toned Milk',
        item_code: '',
        category: 'Milk',
        unit_label: '500 ml',
        inward_qty: 10,
        purchase_price: 25.65,
        selling_price: 27.0
      });
    }
    setShowAddModal(true);
  };

  const handleSaveModalProduct = () => {
    if (!modalForm.product_name) {
      showToast('Please specify a product name');
      return;
    }

    if (editingIndex !== null) {
      setItems((prev) => {
        const updated = [...prev];
        updated[editingIndex] = {
          ...updated[editingIndex],
          ...modalForm,
          inward_qty: Number(modalForm.inward_qty || 0),
          purchase_price: Number(modalForm.purchase_price || 0),
          selling_price: Number(modalForm.selling_price || 0)
        };
        return updated;
      });
      showToast('Product updated');
    } else {
      setItems((prev) => [
        ...prev,
        {
          ...modalForm,
          opening_stock: 0,
          inward_qty: Number(modalForm.inward_qty || 0),
          purchase_price: Number(modalForm.purchase_price || 0),
          selling_price: Number(modalForm.selling_price || 0),
          closing_stock: 0,
          damaged_qty: 0,
          missing_qty: 0,
          notes: ''
        }
      ]);
      showToast('Product added to indent');
    }
    setShowAddModal(false);
  };

  // Inline Add Handler (Desktop)
  const handleInlineAdd = () => {
    if (!inlineProduct) {
      showToast('Please select a product');
      return;
    }
    const matched = catalogProducts.find((p) => p.name === inlineProduct);
    const unitLabel = matched?.variant_label || '500 ml';
    const category = matched?.category || 'Milk';
    const sellPrice = matched?.selling_price || Number(inlineUnitCost) * 1.08;

    setItems((prev) => [
      ...prev,
      {
        product_name: inlineProduct,
        item_code: '',
        category,
        unit_label: unitLabel,
        opening_stock: 0,
        inward_qty: Number(inlineQty || 0),
        purchase_price: Number(inlineUnitCost || 0),
        selling_price: Number(sellPrice || 0),
        closing_stock: 0,
        damaged_qty: 0,
        missing_qty: 0,
        notes: ''
      }
    ]);
    setInlineProduct('');
    setInlineQty(10);
    showToast(`Added ${inlineProduct} to indent!`);
  };

  // Save Indent (Optionally mark CLOSED)
  const handleSaveIndent = async (statusOverride = null) => {
    try {
      setSaving(true);
      const finalStatus = statusOverride || status;
      await api.post('/indents', {
        indent_date: currentDate,
        invoice_no: invoiceNo,
        supplier_name: supplierName,
        crate_deposit_amount: parseFloat(crateDeposit) || 0,
        other_charges: parseFloat(otherCharges) || 0,
        status: finalStatus,
        notes,
        items
      });
      setStatus(finalStatus);
      showToast(
        finalStatus === 'CLOSED'
          ? 'Day closed and indent reconciled successfully!'
          : 'Indent saved successfully!'
      );
      fetchData(currentDate);
    } catch (err) {
      showToast(err.message || 'Failed to save indent');
    } finally {
      setSaving(false);
    }
  };

  // Close Day & Carry Forward to Tomorrow
  const handleCloseDayAndCarryForward = async () => {
    const nextDate = (() => {
      const d = new Date(currentDate + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().split('T')[0];
    })();

    const confirmed = window.confirm(
      `Confirm Day Close for ${formatDisplayDate(currentDate)}?\n\n` +
        `Closing stock will be carried forward as opening stock for ${formatDisplayDate(nextDate)}.`
    );
    if (!confirmed) return;

    try {
      setPushing(true);
      // 1. Save indent with status CLOSED
      await api.post('/indents', {
        indent_date: currentDate,
        invoice_no: invoiceNo,
        supplier_name: supplierName,
        crate_deposit_amount: parseFloat(crateDeposit) || 0,
        other_charges: parseFloat(otherCharges) || 0,
        status: 'CLOSED',
        notes,
        items
      });
      // 2. Push leftovers
      const res = await api.post('/indents/push-leftover', { date: currentDate });
      showToast(`Day successfully closed! Stock carried forward to ${formatDisplayDate(nextDate)}`);
      setStatus('CLOSED');
      fetchData(currentDate);
    } catch (err) {
      showToast(err.message || 'Failed to close day and carry forward');
    } finally {
      setPushing(false);
    }
  };

  // Export to CSV
  const handleExport = () => {
    if (items.length === 0) {
      showToast('No indent items to export');
      return;
    }
    const headers = [
      '#',
      'Product',
      'Pack Size',
      'Opening Stock',
      'Qty Ordered (Inward)',
      'Available',
      'Sold Qty',
      'Damage Qty',
      'Missing Qty',
      'Closing Stock',
      'Unit Cost (Rs)',
      'Selling Price (Rs)',
      'Total Cost (Rs)',
      'Sales Revenue (Rs)',
      'Profit (Rs)'
    ];

    const rows = items.map((it, idx) => {
      const avail = (Number(it.opening_stock) || 0) + (Number(it.inward_qty) || 0);
      const closing = Number(it.closing_stock) || 0;
      const damage = Number(it.damaged_qty) || 0;
      const missing = Number(it.missing_qty) || 0;
      const sold = Math.max(0, avail - (closing + damage + missing));
      const totalCost = (Number(it.inward_qty) || 0) * (Number(it.purchase_price) || 0);
      const salesRev = sold * (Number(it.selling_price) || 0);
      const profit = salesRev - sold * (Number(it.purchase_price) || 0) - damage * it.purchase_price - missing * it.purchase_price;

      return [
        idx + 1,
        `"${it.product_name}"`,
        `"${it.unit_label}"`,
        it.opening_stock,
        it.inward_qty,
        avail,
        sold,
        damage,
        missing,
        closing,
        it.purchase_price,
        it.selling_price,
        totalCost.toFixed(2),
        salesRev.toFixed(2),
        profit.toFixed(2)
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Daily_Indent_${currentDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Indent exported as CSV');
  };

  // Print function
  const handlePrint = () => {
    window.print();
  };

  // Next Date calculation for carry forward badge
  const nextDateDisplay = useMemo(() => {
    const d = new Date(currentDate + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    const nextStr = d.toISOString().split('T')[0];
    return formatDisplayDate(nextStr);
  }, [currentDate]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = it.product_name.toLowerCase().includes(q);
        const matchCat = it.category.toLowerCase().includes(q);
        const matchCode = (it.item_code || '').toLowerCase().includes(q);
        if (!matchName && !matchCat && !matchCode) return false;
      }
      if (categoryFilter !== 'ALL' && it.category !== categoryFilter) {
        return false;
      }
      if (productFilter === 'ORDERED' && Number(it.inward_qty || 0) <= 0) {
        return false;
      }
      if (!showZeroStock && Number(it.closing_stock || 0) === 0 && Number(it.inward_qty || 0) === 0) {
        return false;
      }
      return true;
    });
  }, [items, searchQuery, categoryFilter, productFilter, showZeroStock]);

  // Live Computed Totals
  const totals = useMemo(() => {
    return items.reduce(
      (acc, it) => {
        const opening = Number(it.opening_stock || 0);
        const inward = Number(it.inward_qty || 0);
        const avail = opening + inward;
        const closing = Number(it.closing_stock || 0);
        const damage = Number(it.damaged_qty || 0);
        const missing = Number(it.missing_qty || 0);
        const sold = Math.max(0, avail - (closing + damage + missing));

        const pPrice = Number(it.purchase_price || 0);
        const sPrice = Number(it.selling_price || 0);

        const inwardCost = inward * pPrice;
        const salesRev = sold * sPrice;
        const cogs = sold * pPrice;
        const grossMargin = salesRev - cogs;
        const damageVal = damage * pPrice;
        const missingVal = missing * pPrice;
        const netProfit = grossMargin - damageVal - missingVal;

        if (inward > 0) acc.orderedProductsCount += 1;
        acc.totalInwardQty += inward;
        acc.totalOpeningQty += opening;
        acc.totalAvailQty += avail;
        acc.totalSoldQty += sold;
        acc.totalDamageQty += damage;
        acc.totalMissingQty += missing;
        acc.totalClosingQty += closing;

        acc.totalInwardCost += inwardCost;
        acc.totalSalesRev += salesRev;
        acc.totalCOGS += cogs;
        acc.totalGrossMargin += grossMargin;
        acc.totalDamageLoss += damageVal;
        acc.totalMissingLoss += missingVal;
        acc.totalNetProfit += netProfit;
        acc.totalClosingValue += closing * pPrice;

        return acc;
      },
      {
        orderedProductsCount: 0,
        totalInwardQty: 0,
        totalOpeningQty: 0,
        totalAvailQty: 0,
        totalSoldQty: 0,
        totalDamageQty: 0,
        totalMissingQty: 0,
        totalClosingQty: 0,
        totalInwardCost: 0,
        totalSalesRev: 0,
        totalCOGS: 0,
        totalGrossMargin: 0,
        totalDamageLoss: 0,
        totalMissingLoss: 0,
        totalNetProfit: -(parseFloat(otherCharges) || 0),
        totalClosingValue: 0
      }
    );
  }, [items, otherCharges]);

  return (
    <div className="indent-container">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: '#0f172a',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.9rem',
            fontWeight: 700
          }}
        >
          <Sparkles size={18} color="#38bdf8" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* TOP HEADER & CONTROLS */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
              {activeStep === 'INDENT'
                ? 'Nandini Dairy – Daily Indent Management'
                : activeStep === 'CLOSING'
                ? 'Daily Operations – Day Close & Stock'
                : 'Daily Operations & Profit Analytics'}
            </h1>
            <span
              style={{
                background: status === 'CLOSED' ? '#dcfce7' : '#eff6ff',
                color: status === 'CLOSED' ? '#15803d' : '#1d4ed8',
                border: `1px solid ${status === 'CLOSED' ? '#86efac' : '#bfdbfe'}`,
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 800
              }}
            >
              {status === 'CLOSED' ? '✓ Day Closed' : '⏳ Open Indent'}
            </span>
          </div>
          <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            {activeStep === 'INDENT'
              ? 'Record daily quantities ordered from the dairy to track purchase cost, sales, wastage and profit.'
              : activeStep === 'CLOSING'
              ? 'Enter end-of-day stock, record damaged/expired items and shortages. Closing stock will be carried forward to next day.'
              : 'Detailed breakdown of daily margins, gross profit, wastage loss, and monthly trends.'}
          </p>
        </div>

        {/* Top Controls Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Date Picker with Prev / Next Steppers */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'var(--bg-card)',
              padding: '4px 8px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <button
              type="button"
              onClick={() => changeDateBy(-1)}
              className="indent-stepper-btn"
              title="Previous Day"
              style={{ width: '28px', height: '28px' }}
            >
              <ChevronLeft size={16} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 4px' }}>
              <Calendar size={16} color="var(--primary)" />
              <input
                type="date"
                value={currentDate}
                onChange={(e) => setCurrentDate(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => changeDateBy(1)}
              className="indent-stepper-btn"
              title="Next Day"
              style={{ width: '28px', height: '28px' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Supplier / Branch Dropdown */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-card)',
              padding: '6px 12px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <Truck size={16} color="var(--text-muted)" />
            <select
              value={activeStep === 'INDENT' ? supplierName : parlourName}
              onChange={(e) =>
                activeStep === 'INDENT' ? setSupplierName(e.target.value) : setParlourName(e.target.value)
              }
              style={{
                border: 'none',
                background: 'transparent',
                fontWeight: 700,
                fontSize: '0.85rem',
                color: 'var(--text-primary)',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {activeStep === 'INDENT' ? (
                <>
                  <option value="KMF / Nandini Dairy">Supplier: KMF / Nandini Dairy</option>
                  <option value="Mother Dairy">Supplier: Mother Dairy</option>
                  <option value="Bangalore Milk Union (BAMUL)">Supplier: BAMUL</option>
                </>
              ) : (
                <>
                  <option value="Seegehalli Parlour">Seegehalli Parlour</option>
                  <option value="Main Branch">Main Branch</option>
                </>
              )}
            </select>
          </div>

          {/* Quick Action Button */}
          {activeStep === 'INDENT' && (
            <button
              type="button"
              onClick={() => handleOpenAddModal(null)}
              className="btn btn-primary"
              style={{
                borderRadius: '12px',
                padding: '8px 16px',
                fontWeight: 800,
                fontSize: '0.88rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Plus size={16} />
              <span>Add Indent</span>
            </button>
          )}
        </div>
      </div>

      {/* WORKFLOW STEPPER BAR & SEGMENTED TABS */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
          background: 'var(--bg-card)',
          padding: '8px 14px',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        {/* Step Navigation Pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveStep('INDENT')}
            style={{
              background: activeStep === 'INDENT' ? 'var(--primary)' : 'transparent',
              color: activeStep === 'INDENT' ? 'white' : 'var(--text-secondary)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '0.88rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <ShoppingCart size={16} />
            <span>Daily Indent</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStep('CLOSING')}
            style={{
              background: activeStep === 'CLOSING' ? 'var(--primary)' : 'transparent',
              color: activeStep === 'CLOSING' ? 'white' : 'var(--text-secondary)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '0.88rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <Boxes size={16} />
            <span>Stock & Closing</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStep('ANALYTICS')}
            style={{
              background: activeStep === 'ANALYTICS' ? 'var(--primary)' : 'transparent',
              color: activeStep === 'ANALYTICS' ? 'white' : 'var(--text-secondary)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '0.88rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <TrendingUp size={16} />
            <span>Day Summary & Profit</span>
          </button>
        </div>

        {/* 3-Step Process Stepper */}
        <div className="indent-stepper">
          <button
            type="button"
            onClick={() => setActiveStep('INDENT')}
            className={`indent-step-item ${activeStep === 'INDENT' ? 'active' : ''} ${
              totals.totalInwardQty > 0 ? 'completed' : ''
            }`}
          >
            <span className="indent-step-badge">
              {totals.totalInwardQty > 0 ? <Check size={14} /> : '1'}
            </span>
            <span>Indent (Purchase)</span>
          </button>

          <div className="indent-step-divider" />

          <button
            type="button"
            onClick={() => setActiveStep('CLOSING')}
            className={`indent-step-item ${activeStep === 'CLOSING' ? 'active' : ''} ${
              status === 'CLOSED' ? 'completed' : ''
            }`}
          >
            <span className="indent-step-badge">
              {status === 'CLOSED' ? <Check size={14} /> : '2'}
            </span>
            <span>Closing Stock</span>
          </button>

          <div className="indent-step-divider" />

          <button
            type="button"
            onClick={() => setActiveStep('ANALYTICS')}
            className={`indent-step-item ${activeStep === 'ANALYTICS' ? 'active' : ''}`}
          >
            <span className="indent-step-badge">3</span>
            <span>Next Day Carry</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: DAILY INDENT MANAGEMENT                                           */}
      {/* ========================================================================= */}
      {activeStep === 'INDENT' && (
        <>
          {/* 4 Stat Cards */}
          <div className="indent-stat-grid-4">
            <div className="indent-stat-card">
              <div className="indent-stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}>
                <Package size={22} />
              </div>
              <div>
                <div className="indent-stat-label">Total Products</div>
                <div className="indent-stat-value">{items.length}</div>
              </div>
            </div>

            <div className="indent-stat-card">
              <div className="indent-stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
                <Boxes size={22} />
              </div>
              <div>
                <div className="indent-stat-label">Total Quantity</div>
                <div className="indent-stat-value">{formatUnits(totals.totalInwardQty)} units</div>
              </div>
            </div>

            <div className="indent-stat-card">
              <div className="indent-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
                <Coins size={22} />
              </div>
              <div>
                <div className="indent-stat-label">Indent Cost</div>
                <div className="indent-stat-value" style={{ color: '#d97706' }}>
                  {formatINR(totals.totalInwardCost)}
                </div>
              </div>
            </div>

            <div className="indent-stat-card">
              <div className="indent-stat-icon" style={{ background: '#f3e8ff', color: '#9333ea' }}>
                <Clock size={22} />
              </div>
              <div>
                <div className="indent-stat-label">Last Updated</div>
                <div className="indent-stat-value" style={{ fontSize: '1.15rem' }}>
                  {lastUpdatedTime}
                </div>
              </div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="indent-filter-bar">
            <div className="indent-search-input">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search products (e.g., Curd, Milk...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">All Categories</option>
                <option value="Milk">Milk</option>
                <option value="Curd">Curd</option>
                <option value="Buttermilk">Buttermilk</option>
              </select>

              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="ALL">All Products</option>
                <option value="ORDERED">Ordered &gt; 0</option>
              </select>

              <button
                type="button"
                onClick={() => fetchData(currentDate)}
                className="indent-stepper-btn"
                title="Refresh Indent"
                style={{ border: '1px solid var(--border-color)', width: '36px', height: '36px' }}
              >
                <RefreshCw size={16} />
              </button>

              <button
                type="button"
                onClick={handleLoadTemplate}
                style={{
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                  borderRadius: '10px',
                  padding: '8px 14px',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                title="Populate standard 11 Nandini KMF products"
              >
                <Sparkles size={15} />
                <span>Load Template</span>
              </button>
            </div>
          </div>

          {/* DESKTOP TABLE: Daily Indent Products */}
          <div className="indent-table-container">
            <table className="indent-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>Product</th>
                  <th>Pack Size</th>
                  <th style={{ textAlign: 'center' }}>Qty Ordered</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost (₹)</th>
                  <th style={{ textAlign: 'right' }}>Total (₹)</th>
                  <th style={{ textAlign: 'center', width: '90px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No indent products found. Click <strong>Load Template</strong> or <strong>+ Add Product</strong>.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((it, idx) => {
                    const lineTotal = (Number(it.inward_qty) || 0) * (Number(it.purchase_price) || 0);
                    const originalIndex = items.findIndex(
                      (item) => item.product_name === it.product_name && item.unit_label === it.unit_label
                    );

                    return (
                      <tr key={`${it.product_name}-${idx}`}>
                        <td style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{idx + 1}</td>
                        <td style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                          {it.product_name}
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{it.unit_label}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="indent-stepper-control">
                            <button
                              type="button"
                              className="indent-stepper-btn"
                              onClick={() => handleAdjustQty(originalIndex, 'inward_qty', -10)}
                              disabled={Number(it.inward_qty || 0) <= 0}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={it.inward_qty}
                              onChange={(e) =>
                                handleUpdateItem(originalIndex, 'inward_qty', e.target.value)
                              }
                              className="indent-stepper-val"
                              style={{ width: '50px' }}
                            />
                            <button
                              type="button"
                              className="indent-stepper-btn"
                              onClick={() => handleAdjustQty(originalIndex, 'inward_qty', 10)}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                          <input
                            type="number"
                            step="0.05"
                            value={it.purchase_price}
                            onChange={(e) =>
                              handleUpdateItem(originalIndex, 'purchase_price', e.target.value)
                            }
                            style={{
                              width: '80px',
                              textAlign: 'right',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-surface)',
                              color: 'var(--text-primary)',
                              fontWeight: 700
                            }}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 900, color: 'var(--text-primary)' }}>
                          {lineTotal.toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleOpenAddModal(originalIndex)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#2563eb',
                                cursor: 'pointer',
                                padding: '4px'
                              }}
                              title="Edit product"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(originalIndex)}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#ef4444',
                                cursor: 'pointer',
                                padding: '4px'
                              }}
                              title="Delete product"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* INLINE ADD ROW CARD (DESKTOP) */}
          <div className="indent-add-row-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <Plus size={16} color="var(--primary)" />
              <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                Add product to indent
              </strong>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.5fr 1fr auto',
                gap: '12px',
                alignItems: 'center'
              }}
            >
              <div>
                <select
                  value={inlineProduct}
                  onChange={(e) => {
                    setInlineProduct(e.target.value);
                    const matched = catalogProducts.find((p) => p.name === e.target.value);
                    if (matched) {
                      setInlineUnitCost(String(matched.selling_price ? (matched.selling_price * 0.92).toFixed(2) : '30.00'));
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.88rem'
                  }}
                >
                  <option value="">Search / Select Product</option>
                  {catalogProducts.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name} ({p.variant_label || p.category})
                    </option>
                  ))}
                  <option value="Curd 1000gm">Curd 1000gm (1 kg)</option>
                  <option value="Curd 500gm">Curd 500gm (500 g)</option>
                  <option value="Butter Milk 200ml">Butter Milk 200ml</option>
                  <option value="Toned Milk 500ml">Toned Milk 500ml</option>
                  <option value="Shubham Milk 500ml">Shubham Milk 500ml</option>
                  <option value="Special Milk 500ml">Special Milk 500ml</option>
                </select>
              </div>

              <div>
                <div className="indent-stepper-control" style={{ width: '100%', justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    className="indent-stepper-btn"
                    onClick={() => setInlineQty((q) => Math.max(0, q - 10))}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={inlineQty}
                    onChange={(e) => setInlineQty(Math.max(0, Number(e.target.value)))}
                    className="indent-stepper-val"
                  />
                  <button
                    type="button"
                    className="indent-stepper-btn"
                    onClick={() => setInlineQty((q) => q + 10)}
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <input
                  type="number"
                  step="0.05"
                  placeholder="Unit Cost (₹)"
                  value={inlineUnitCost}
                  onChange={(e) => setInlineUnitCost(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleInlineAdd}
                  className="btn btn-primary"
                  style={{
                    borderRadius: '10px',
                    padding: '8px 18px',
                    fontWeight: 800,
                    whiteSpace: 'nowrap'
                  }}
                >
                  + Add to Indent
                </button>
              </div>
            </div>
          </div>

          {/* MOBILE LIST: Daily Indent Products */}
          <div className="indent-mobile-list">
            <button
              type="button"
              onClick={() => handleOpenAddModal(null)}
              style={{
                width: '100%',
                background: '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: '14px',
                padding: '12px',
                fontWeight: 800,
                fontSize: '0.95rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
              }}
            >
              <Plus size={18} />
              <span>+ Add Product</span>
            </button>

            {filteredItems.map((it, idx) => {
              const lineTotal = (Number(it.inward_qty) || 0) * (Number(it.purchase_price) || 0);
              const originalIndex = items.findIndex(
                (item) => item.product_name === it.product_name && item.unit_label === it.unit_label
              );
              const imgSrc = getProductImage(it.product_name);

              return (
                <div
                  key={`mob-indent-${idx}`}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '16px',
                    padding: '14px',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={it.product_name}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: '10px',
                            objectFit: 'cover'
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: '10px',
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Package size={22} />
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                          {it.product_name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Pack: {it.unit_label}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenAddModal(originalIndex)}
                        style={{
                          border: 'none',
                          background: '#eff6ff',
                          color: '#2563eb',
                          borderRadius: '8px',
                          padding: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(originalIndex)}
                        style={{
                          border: 'none',
                          background: '#fef2f2',
                          color: '#ef4444',
                          borderRadius: '8px',
                          padding: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      background: 'var(--bg-surface)',
                      padding: '10px',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color)',
                      textAlign: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                        QTY
                      </div>
                      <div style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--text-primary)' }}>
                        {it.inward_qty}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                        UNIT COST
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        {formatINR(it.purchase_price)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                        TOTAL
                      </div>
                      <div style={{ fontWeight: 900, fontSize: '1rem', color: '#16a34a' }}>
                        {formatINR(lineTotal)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* BOTTOM BAR: GRAND TOTAL & SAVE (DESKTOP) */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginTop: '10px',
              padding: '14px 18px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  background: '#dcfce7',
                  border: '1px solid #86efac',
                  padding: '8px 18px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <Coins size={20} color="#15803d" />
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#166534' }}>
                  Grand Total
                </span>
                <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#15803d' }}>
                  {formatINR(totals.totalInwardCost)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={handleSaveIndent}
                disabled={saving}
                style={{
                  background: '#16a34a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '10px 22px',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                }}
              >
                <Save size={18} />
                <span>{saving ? 'Saving...' : 'Save Indent'}</span>
              </button>

              <button
                type="button"
                onClick={handleExport}
                className="btn btn-outline"
                style={{
                  borderRadius: '12px',
                  padding: '10px 18px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Download size={16} />
                <span>Export</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: CLOSING STOCK & RECONCILIATION                                    */}
      {/* ========================================================================= */}
      {activeStep === 'CLOSING' && (
        <>
          {/* 6 Stat Cards Row */}
          <div className="indent-stat-grid-6">
            <div className="indent-stat-card">
              <div className="indent-stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}>
                <Package size={20} />
              </div>
              <div>
                <div className="indent-stat-label">Opening Stock</div>
                <div className="indent-stat-value">{totals.totalOpeningQty}</div>
              </div>
            </div>

            <div className="indent-stat-card">
              <div className="indent-stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
                <ShoppingCart size={20} />
              </div>
              <div>
                <div className="indent-stat-label">Indent Qty</div>
                <div className="indent-stat-value">{totals.totalInwardQty}</div>
              </div>
            </div>

            <div className="indent-stat-card">
              <div className="indent-stat-icon" style={{ background: '#f3e8ff', color: '#9333ea' }}>
                <Boxes size={20} />
              </div>
              <div>
                <div className="indent-stat-label">Sold Qty</div>
                <div className="indent-stat-value">{totals.totalSoldQty}</div>
              </div>
            </div>

            <div className="indent-stat-card" style={{ borderLeft: '3px solid #f59e0b' }}>
              <div className="indent-stat-icon" style={{ background: '#fffbeb', color: '#f59e0b' }}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <div className="indent-stat-label">Damage</div>
                <div className="indent-stat-value" style={{ color: '#d97706' }}>
                  {totals.totalDamageQty}
                </div>
              </div>
            </div>

            <div className="indent-stat-card" style={{ borderLeft: '3px solid #ef4444' }}>
              <div className="indent-stat-icon" style={{ background: '#fef2f2', color: '#ef4444' }}>
                <MinusCircle size={20} />
              </div>
              <div>
                <div className="indent-stat-label">Missing</div>
                <div className="indent-stat-value" style={{ color: '#ef4444' }}>
                  {totals.totalMissingQty}
                </div>
              </div>
            </div>

            <div className="indent-stat-card" style={{ borderLeft: '3px solid #3b82f6' }}>
              <div className="indent-stat-icon" style={{ background: '#eff6ff', color: '#3b82f6' }}>
                <Package size={20} />
              </div>
              <div>
                <div className="indent-stat-label">Closing Stock</div>
                <div className="indent-stat-value" style={{ color: '#2563eb' }}>
                  {totals.totalClosingQty}
                </div>
              </div>
            </div>
          </div>

          {/* DESKTOP TABLE: Product Stock Reconciliation */}
          <div className="indent-table-container">
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px'
              }}
            >
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Product Stock Reconciliation – {formatDisplayDate(currentDate)}
                </h3>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showZeroStock}
                    onChange={(e) => setShowZeroStock(e.target.checked)}
                  />
                  <span>Show zero stock</span>
                </label>
              </div>
            </div>

            <table className="indent-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>Product</th>
                  <th>Pack Size</th>
                  <th style={{ textAlign: 'center' }}>Opening</th>
                  <th style={{ textAlign: 'center' }}>Indent</th>
                  <th style={{ textAlign: 'center' }}>Available</th>
                  <th style={{ textAlign: 'center' }}>Sold</th>
                  <th style={{ textAlign: 'center', color: '#d97706' }}>Damage</th>
                  <th style={{ textAlign: 'center', color: '#ef4444' }}>Missing</th>
                  <th style={{ textAlign: 'center', color: '#2563eb' }}>Closing</th>
                  <th style={{ textAlign: 'center' }}>Carry Forward</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((it, idx) => {
                  const originalIndex = items.findIndex(
                    (item) => item.product_name === it.product_name && item.unit_label === it.unit_label
                  );
                  const avail = (Number(it.opening_stock) || 0) + (Number(it.inward_qty) || 0);
                  const closing = Number(it.closing_stock) || 0;
                  const damage = Number(it.damaged_qty) || 0;
                  const missing = Number(it.missing_qty) || 0;
                  const sold = Math.max(0, avail - (closing + damage + missing));

                  return (
                    <tr key={`reconcile-${idx}`}>
                      <td style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                        {it.product_name}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{it.unit_label}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{it.opening_stock}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{it.inward_qty}</td>
                      <td style={{ textAlign: 'center', fontWeight: 800, color: '#2563eb' }}>
                        {avail}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 800 }}>{sold}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="indent-stepper-control">
                          <button
                            type="button"
                            className="indent-stepper-btn"
                            onClick={() => handleAdjustQty(originalIndex, 'damaged_qty', -1)}
                            disabled={damage <= 0}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={it.damaged_qty}
                            onChange={(e) =>
                              handleUpdateItem(originalIndex, 'damaged_qty', e.target.value)
                            }
                            className="indent-stepper-val"
                            style={{ color: '#d97706' }}
                          />
                          <button
                            type="button"
                            className="indent-stepper-btn"
                            onClick={() => handleAdjustQty(originalIndex, 'damaged_qty', 1)}
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="indent-stepper-control">
                          <button
                            type="button"
                            className="indent-stepper-btn"
                            onClick={() => handleAdjustQty(originalIndex, 'missing_qty', -1)}
                            disabled={missing <= 0}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={it.missing_qty}
                            onChange={(e) =>
                              handleUpdateItem(originalIndex, 'missing_qty', e.target.value)
                            }
                            className="indent-stepper-val"
                            style={{ color: '#ef4444' }}
                          />
                          <button
                            type="button"
                            className="indent-stepper-btn"
                            onClick={() => handleAdjustQty(originalIndex, 'missing_qty', 1)}
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="indent-stepper-control">
                          <button
                            type="button"
                            className="indent-stepper-btn"
                            onClick={() => handleAdjustQty(originalIndex, 'closing_stock', -1)}
                            disabled={closing <= 0}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={it.closing_stock}
                            onChange={(e) =>
                              handleUpdateItem(originalIndex, 'closing_stock', e.target.value)
                            }
                            className="indent-stepper-val"
                            style={{ color: '#2563eb' }}
                          />
                          <button
                            type="button"
                            className="indent-stepper-btn"
                            onClick={() => handleAdjustQty(originalIndex, 'closing_stock', 1)}
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            background: '#dcfce7',
                            color: '#15803d',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Check size={12} />
                          <span>Carry to {nextDateDisplay}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg-surface)', fontWeight: 900 }}>
                  <td colSpan={3} style={{ padding: '12px 14px' }}>
                    Total Units
                  </td>
                  <td style={{ textAlign: 'center' }}>{totals.totalOpeningQty}</td>
                  <td style={{ textAlign: 'center' }}>{totals.totalInwardQty}</td>
                  <td style={{ textAlign: 'center', color: '#2563eb' }}>{totals.totalAvailQty}</td>
                  <td style={{ textAlign: 'center' }}>{totals.totalSoldQty}</td>
                  <td style={{ textAlign: 'center', color: '#d97706' }}>{totals.totalDamageQty}</td>
                  <td style={{ textAlign: 'center', color: '#ef4444' }}>{totals.totalMissingQty}</td>
                  <td style={{ textAlign: 'center', color: '#2563eb' }}>{totals.totalClosingQty}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ color: '#15803d' }}>{totals.totalClosingQty} pkts</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* MOBILE LIST: Closing Stock Cards */}
          <div className="indent-mobile-list">
            <div
              style={{
                display: 'flex',
                background: 'var(--bg-surface)',
                padding: '4px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                marginBottom: '8px'
              }}
            >
              <button
                type="button"
                onClick={() => setMobileSubTab('ENTRY')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  border: 'none',
                  background: mobileSubTab === 'ENTRY' ? 'var(--primary)' : 'transparent',
                  color: mobileSubTab === 'ENTRY' ? 'white' : 'var(--text-secondary)',
                  fontWeight: 800,
                  fontSize: '0.85rem'
                }}
              >
                Stock Entry
              </button>
              <button
                type="button"
                onClick={() => setMobileSubTab('SUMMARY')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '8px',
                  border: 'none',
                  background: mobileSubTab === 'SUMMARY' ? 'var(--primary)' : 'transparent',
                  color: mobileSubTab === 'SUMMARY' ? 'white' : 'var(--text-secondary)',
                  fontWeight: 800,
                  fontSize: '0.85rem'
                }}
              >
                Summary
              </button>
            </div>

            {mobileSubTab === 'ENTRY' && (
              <>
                <div style={{ padding: '6px 4px' }}>
                  <h4 style={{ fontSize: '0.92rem', fontWeight: 800, margin: '0 0 2px' }}>
                    Closing Stock (Left at Shop)
                  </h4>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                    Enter remaining quantity when shop closes. It will be carried forward to next day.
                  </p>
                </div>

                {filteredItems.map((it, idx) => {
                  const originalIndex = items.findIndex(
                    (item) => item.product_name === it.product_name && item.unit_label === it.unit_label
                  );
                  const avail = (Number(it.opening_stock) || 0) + (Number(it.inward_qty) || 0);
                  const closing = Number(it.closing_stock) || 0;
                  const damage = Number(it.damaged_qty) || 0;
                  const missing = Number(it.missing_qty) || 0;
                  const sold = Math.max(0, avail - (closing + damage + missing));
                  const imgSrc = getProductImage(it.product_name);

                  return (
                    <div
                      key={`mob-closing-${idx}`}
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '16px',
                        padding: '12px 14px',
                        boxShadow: 'var(--shadow-sm)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {imgSrc ? (
                            <img
                              src={imgSrc}
                              alt={it.product_name}
                              style={{ width: 38, height: 38, borderRadius: '8px', objectFit: 'cover' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius: '8px',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <Package size={18} />
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                              {it.product_name}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              Avail: {avail} | Sold: {sold}
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2563eb' }}>
                            Closing: {closing}
                          </span>
                        </div>
                      </div>

                      {/* Steppers in card */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: '6px',
                          background: 'var(--bg-surface)',
                          padding: '8px',
                          borderRadius: '12px',
                          border: '1px solid var(--border-color)'
                        }}
                      >
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#d97706', marginBottom: '2px' }}>
                            Damage
                          </div>
                          <div className="indent-stepper-control" style={{ width: '100%', justifyContent: 'space-between' }}>
                            <button
                              type="button"
                              className="indent-stepper-btn"
                              onClick={() => handleAdjustQty(originalIndex, 'damaged_qty', -1)}
                              disabled={damage <= 0}
                              style={{ width: '26px', height: '26px' }}
                            >
                              -
                            </button>
                            <span style={{ fontWeight: 900, fontSize: '0.88rem', color: '#d97706' }}>
                              {damage}
                            </span>
                            <button
                              type="button"
                              className="indent-stepper-btn"
                              onClick={() => handleAdjustQty(originalIndex, 'damaged_qty', 1)}
                              style={{ width: '26px', height: '26px' }}
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#ef4444', marginBottom: '2px' }}>
                            Missing
                          </div>
                          <div className="indent-stepper-control" style={{ width: '100%', justifyContent: 'space-between' }}>
                            <button
                              type="button"
                              className="indent-stepper-btn"
                              onClick={() => handleAdjustQty(originalIndex, 'missing_qty', -1)}
                              disabled={missing <= 0}
                              style={{ width: '26px', height: '26px' }}
                            >
                              -
                            </button>
                            <span style={{ fontWeight: 900, fontSize: '0.88rem', color: '#ef4444' }}>
                              {missing}
                            </span>
                            <button
                              type="button"
                              className="indent-stepper-btn"
                              onClick={() => handleAdjustQty(originalIndex, 'missing_qty', 1)}
                              style={{ width: '26px', height: '26px' }}
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#2563eb', marginBottom: '2px' }}>
                            Closing
                          </div>
                          <div className="indent-stepper-control" style={{ width: '100%', justifyContent: 'space-between' }}>
                            <button
                              type="button"
                              className="indent-stepper-btn"
                              onClick={() => handleAdjustQty(originalIndex, 'closing_stock', -1)}
                              disabled={closing <= 0}
                              style={{ width: '26px', height: '26px' }}
                            >
                              -
                            </button>
                            <span style={{ fontWeight: 900, fontSize: '0.88rem', color: '#2563eb' }}>
                              {closing}
                            </span>
                            <button
                              type="button"
                              className="indent-stepper-btn"
                              onClick={() => handleAdjustQty(originalIndex, 'closing_stock', 1)}
                              style={{ width: '26px', height: '26px' }}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Adjustments Pill Banner */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    margin: '6px 0'
                  }}
                >
                  <div
                    style={{
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      borderRadius: '12px',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#b45309' }}>
                      Damage ({totals.totalDamageQty})
                    </span>
                    <strong style={{ fontSize: '0.88rem', color: '#b45309' }}>
                      {formatINR(totals.totalDamageLoss)}
                    </strong>
                  </div>

                  <div
                    style={{
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '12px',
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#b91c1c' }}>
                      Missing ({totals.totalMissingQty})
                    </span>
                    <strong style={{ fontSize: '0.88rem', color: '#b91c1c' }}>
                      {formatINR(totals.totalMissingLoss)}
                    </strong>
                  </div>
                </div>

                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#166534',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <CheckCircle2 size={16} color="#16a34a" />
                  <span>These quantities will be carried forward as opening stock for {nextDateDisplay}.</span>
                </div>
              </>
            )}

            {mobileSubTab === 'SUMMARY' && (
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '16px',
                  padding: '16px',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 12px', color: 'var(--text-primary)' }}>
                  Day Summary – {formatDisplayDate(currentDate)}
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Indent Cost (Purchase)</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{formatINR(totals.totalInwardCost)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Sales Amount</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{formatINR(totals.totalSalesRev)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: '#d97706' }}>
                    <span>Damage Loss</span>
                    <strong>-{formatINR(totals.totalDamageLoss)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: '#ef4444' }}>
                    <span>Missing Shortage</span>
                    <strong>-{formatINR(totals.totalMissingLoss)}</strong>
                  </div>

                  <div
                    style={{
                      borderTop: '1px dashed var(--border-color)',
                      paddingTop: '10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                      Net Profit (Today)
                    </span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#16a34a' }}>
                      {formatINR(totals.totalNetProfit)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SIDE-BY-SIDE SUMMARY WIDGETS (DESKTOP) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '16px',
              marginBottom: '20px'
            }}
          >
            {/* Stock Flow (Units) */}
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '16px',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 12px', color: 'var(--text-primary)' }}>
                Stock Flow (Units)
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Opening Stock (from previous day)
                  </span>
                  <span
                    style={{
                      background: '#dbeafe',
                      color: '#1d4ed8',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '0.82rem'
                    }}
                  >
                    {totals.totalOpeningQty}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    + Indent (Today)
                  </span>
                  <span
                    style={{
                      background: '#dcfce7',
                      color: '#15803d',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '0.82rem'
                    }}
                  >
                    {totals.totalInwardQty}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    = Total Available
                  </span>
                  <span
                    style={{
                      background: '#e0e7ff',
                      color: '#4338ca',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '0.82rem'
                    }}
                  >
                    {totals.totalAvailQty}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    - Sold / Delivered
                  </span>
                  <span
                    style={{
                      background: '#fee2e2',
                      color: '#b91c1c',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '0.82rem'
                    }}
                  >
                    {totals.totalSoldQty}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px dashed var(--border-color)',
                    paddingTop: '6px'
                  }}
                >
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    = Closing Stock (Left at Shop)
                  </span>
                  <span
                    style={{
                      background: '#f3e8ff',
                      color: '#7e22ce',
                      fontWeight: 900,
                      padding: '3px 10px',
                      borderRadius: '8px',
                      fontSize: '0.9rem'
                    }}
                  >
                    {totals.totalClosingQty}
                  </span>
                </div>

                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  Closing stock will be carried forward as opening stock for {nextDateDisplay}.
                </p>
              </div>
            </div>

            {/* Adjustments & Notes */}
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '16px',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 12px', color: 'var(--text-primary)' }}>
                Adjustments & Notes
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    padding: '8px 12px',
                    borderRadius: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={18} color="#d97706" />
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#b45309' }}>
                        Damage ({totals.totalDamageQty})
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#92400e' }}>
                        Spoiled / Expired / Leakage / Returned
                      </div>
                    </div>
                  </div>
                  <strong style={{ fontSize: '0.95rem', color: '#b45309' }}>
                    {formatINR(totals.totalDamageLoss)}
                  </strong>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    padding: '8px 12px',
                    borderRadius: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MinusCircle size={18} color="#ef4444" />
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#b91c1c' }}>
                        Missing ({totals.totalMissingQty})
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#991b1b' }}>
                        Shortage / Theft / Not accounted
                      </div>
                    </div>
                  </div>
                  <strong style={{ fontSize: '0.95rem', color: '#b91c1c' }}>
                    {formatINR(totals.totalMissingLoss)}
                  </strong>
                </div>

                <div>
                  <input
                    type="text"
                    placeholder="Optional day close remarks..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Day Summary */}
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '16px',
                padding: '16px',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 12px', color: 'var(--text-primary)' }}>
                Day Summary – {formatDisplayDate(currentDate)}
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Indent Cost (Purchase)</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{formatINR(totals.totalInwardCost)}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Sales Amount</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{formatINR(totals.totalSalesRev)}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#d97706' }}>
                  <span>Damage Value</span>
                  <strong>-{formatINR(totals.totalDamageLoss)}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#ef4444' }}>
                  <span>Missing Value</span>
                  <strong>-{formatINR(totals.totalMissingLoss)}</strong>
                </div>

                <div
                  style={{
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    marginTop: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#047857' }}>
                      NET PROFIT (TODAY)
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#059669' }}>
                      {formatINR(totals.totalNetProfit)}
                    </div>
                  </div>
                  <TrendingUp size={28} color="#059669" />
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM ACTION BAR (CLOSING) */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '14px 18px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => changeDateBy(-1)}
                className="btn btn-outline"
                style={{
                  borderRadius: '10px',
                  padding: '8px 14px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Calendar size={15} />
                <span>View Previous Day</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="btn btn-outline"
                style={{
                  borderRadius: '10px',
                  padding: '8px 14px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Printer size={15} />
                <span>Print / Export</span>
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => handleSaveIndent('OPEN')}
                disabled={saving}
                className="btn btn-outline"
                style={{
                  borderRadius: '12px',
                  padding: '10px 18px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Save size={16} />
                <span>Save as Draft</span>
              </button>

              <button
                type="button"
                onClick={handleCloseDayAndCarryForward}
                disabled={pushing || items.length === 0}
                style={{
                  background: '#16a34a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '10px 22px',
                  fontWeight: 900,
                  fontSize: '0.92rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)'
                }}
              >
                <Check size={18} />
                <span>{pushing ? 'Closing Day...' : 'Close Day & Carry Forward'}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: DAY SUMMARY & PROFIT ANALYTICS                                    */}
      {/* ========================================================================= */}
      {activeStep === 'ANALYTICS' && (
        <>
          <div className="indent-stat-grid-4">
            <div className="indent-stat-card" style={{ borderLeft: '4px solid #16a34a' }}>
              <div className="indent-stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
                <TrendingUp size={22} />
              </div>
              <div>
                <div className="indent-stat-label">Today's Realized Profit</div>
                <div className="indent-stat-value" style={{ color: '#16a34a' }}>
                  {formatINR(totals.totalNetProfit)}
                </div>
              </div>
            </div>

            <div className="indent-stat-card" style={{ borderLeft: '4px solid #2563eb' }}>
              <div className="indent-stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}>
                <DollarSign size={22} />
              </div>
              <div>
                <div className="indent-stat-label">Today's Total Sales</div>
                <div className="indent-stat-value" style={{ color: '#2563eb' }}>
                  {formatINR(totals.totalSalesRev)}
                </div>
              </div>
            </div>

            <div className="indent-stat-card" style={{ borderLeft: '4px solid #9333ea' }}>
              <div className="indent-stat-icon" style={{ background: '#f3e8ff', color: '#9333ea' }}>
                <Calendar size={22} />
              </div>
              <div>
                <div className="indent-stat-label">This Week's Net Profit</div>
                <div className="indent-stat-value" style={{ color: '#9333ea' }}>
                  {formatINR(summary?.weekly?.netProfit || totals.totalNetProfit)}
                </div>
              </div>
            </div>

            <div className="indent-stat-card" style={{ borderLeft: '4px solid #0891b2' }}>
              <div className="indent-stat-icon" style={{ background: '#cffafe', color: '#0891b2' }}>
                <ShoppingBag size={22} />
              </div>
              <div>
                <div className="indent-stat-label">This Month's Net Profit</div>
                <div className="indent-stat-value" style={{ color: '#0891b2' }}>
                  {formatINR(summary?.monthly?.netProfit || totals.totalNetProfit)}
                </div>
              </div>
            </div>
          </div>

          {/* Margins breakdown table */}
          <div className="indent-table-container">
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Product Margin Breakdown & Packet Profitability
              </h3>
            </div>

            <table className="indent-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>Product</th>
                  <th>Pack Size</th>
                  <th style={{ textAlign: 'right' }}>Cost Price (₹)</th>
                  <th style={{ textAlign: 'right' }}>Selling Price (₹)</th>
                  <th style={{ textAlign: 'right', color: '#16a34a' }}>Margin / Packet (₹)</th>
                  <th style={{ textAlign: 'center' }}>Sold Units</th>
                  <th style={{ textAlign: 'right', color: '#16a34a' }}>Realized Profit (₹)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const avail = (Number(it.opening_stock) || 0) + (Number(it.inward_qty) || 0);
                  const closing = Number(it.closing_stock) || 0;
                  const damage = Number(it.damaged_qty) || 0;
                  const missing = Number(it.missing_qty) || 0;
                  const sold = Math.max(0, avail - (closing + damage + missing));
                  const marginPerUnit = (Number(it.selling_price) || 0) - (Number(it.purchase_price) || 0);
                  const netEarned =
                    sold * marginPerUnit - damage * (Number(it.purchase_price) || 0) - missing * (Number(it.purchase_price) || 0);

                  return (
                    <tr key={`margin-${idx}`}>
                      <td style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                        {it.product_name}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{it.unit_label}</td>
                      <td style={{ textAlign: 'right' }}>{it.purchase_price.toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{it.selling_price.toFixed(2)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>
                        +{marginPerUnit.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{sold}</td>
                      <td style={{ textAlign: 'right', fontWeight: 900, color: '#16a34a' }}>
                        {formatINR(netEarned)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* ADD / EDIT PRODUCT BOTTOM SHEET MODAL (MOBILE & DESKTOP)                  */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="indent-sheet-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="indent-sheet-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="indent-sheet-handle" />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
              }}
            >
              <h3 style={{ fontSize: '1.1rem', fontWeight: 900, margin: 0, color: 'var(--text-primary)' }}>
                {editingIndex !== null ? 'Edit Product' : 'Add / Edit Product'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Product *
                </label>
                <select
                  value={modalForm.product_name}
                  onChange={(e) => {
                    const sel = e.target.value;
                    const matched = catalogProducts.find((p) => p.name === sel);
                    setModalForm((prev) => ({
                      ...prev,
                      product_name: sel,
                      unit_label: matched?.variant_label || prev.unit_label,
                      category: matched?.category || prev.category,
                      selling_price: matched?.selling_price || prev.selling_price,
                      purchase_price: matched?.selling_price ? Number((matched.selling_price * 0.92).toFixed(2)) : prev.purchase_price
                    }));
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.92rem'
                  }}
                >
                  <option value="">Search / Select Product</option>
                  {catalogProducts.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name} ({p.variant_label || p.category})
                    </option>
                  ))}
                  <option value="Curd 1000gm">Curd 1000gm (1 kg)</option>
                  <option value="Curd 500gm">Curd 500gm (500 g)</option>
                  <option value="Butter Milk 200ml">Butter Milk 200ml</option>
                  <option value="Toned Milk 500ml">Toned Milk 500ml</option>
                  <option value="Shubham Milk 500ml">Shubham Milk 500ml</option>
                  <option value="Special Milk 500ml">Special Milk 500ml</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Quantity (Units) *
                </label>
                <div className="indent-stepper-control" style={{ width: '100%', justifyContent: 'space-between', padding: '4px' }}>
                  <button
                    type="button"
                    className="indent-stepper-btn"
                    onClick={() => setModalForm((prev) => ({ ...prev, inward_qty: Math.max(0, prev.inward_qty - 5) }))}
                    style={{ width: '38px', height: '38px' }}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={modalForm.inward_qty}
                    onChange={(e) =>
                      setModalForm((prev) => ({ ...prev, inward_qty: Math.max(0, Number(e.target.value)) }))
                    }
                    className="indent-stepper-val"
                    style={{ fontSize: '1.1rem' }}
                  />
                  <button
                    type="button"
                    className="indent-stepper-btn"
                    onClick={() => setModalForm((prev) => ({ ...prev, inward_qty: prev.inward_qty + 5 }))}
                    style={{ width: '38px', height: '38px' }}
                  >
                    +
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Unit Cost (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={modalForm.purchase_price}
                    onChange={(e) =>
                      setModalForm((prev) => ({ ...prev, purchase_price: Number(e.target.value) }))
                    }
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontWeight: 700,
                      fontSize: '0.92rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Selling Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={modalForm.selling_price}
                    onChange={(e) =>
                      setModalForm((prev) => ({ ...prev, selling_price: Number(e.target.value) }))
                    }
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontWeight: 700,
                      fontSize: '0.92rem'
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg-surface)',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  marginTop: '4px'
                }}
              >
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                  Line Total
                </span>
                <span style={{ fontWeight: 900, fontSize: '1.25rem', color: '#16a34a' }}>
                  {formatINR(Number(modalForm.inward_qty || 0) * Number(modalForm.purchase_price || 0))}
                </span>
              </div>

              <button
                type="button"
                onClick={handleSaveModalProduct}
                style={{
                  background: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '12px',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  marginTop: '8px',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
                }}
              >
                <Save size={18} />
                <span>Save Product</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MOBILE STICKY BOTTOM BAR                                                  */}
      {/* ========================================================================= */}
      <div className="indent-sticky-footer">
        {activeStep === 'INDENT' ? (
          <>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                Total Indent
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                {formatINR(totals.totalInwardCost)}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveIndent}
              disabled={saving}
              style={{
                background: '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                padding: '10px 24px',
                fontWeight: 900,
                fontSize: '0.92rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)'
              }}
            >
              <Save size={16} />
              <span>{saving ? 'Saving...' : 'Save'}</span>
            </button>
          </>
        ) : (
          <>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                Closing Stock: {totals.totalClosingQty} pkts
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#16a34a' }}>
                Profit: {formatINR(totals.totalNetProfit)}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCloseDayAndCarryForward}
              disabled={pushing || items.length === 0}
              style={{
                background: '#16a34a',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                padding: '10px 18px',
                fontWeight: 900,
                fontSize: '0.88rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)'
              }}
            >
              <Check size={16} />
              <span>{pushing ? 'Closing...' : 'Close & Carry'}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
