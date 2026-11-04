import React, { useState, useEffect } from 'react';
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
  PackageCheck,
  RotateCcw,
  FileText,
  DollarSign,
  Truck,
  Info,
  RefreshCw,
  Sliders,
  Sparkles
} from 'lucide-react';

// Safe currency formatter without duplicate symbols
const formatINR = (val) => {
  const num = Number(val || 0);
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function DailyIndentPage() {
  const [currentDate, setCurrentDate] = useState(getLocalDateString());
  const [activeTab, setActiveTab] = useState('INDENT'); // 'INDENT' | 'ANALYTICS'

  // Indent state
  const [invoiceNo, setInvoiceNo] = useState('');
  const [supplierName, setSupplierName] = useState('KMF / Nandini Mother Dairy');
  const [crateDeposit, setCrateDeposit] = useState('0');
  const [otherCharges, setOtherCharges] = useState('0');
  const [status, setStatus] = useState('OPEN');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [indentExists, setIndentExists] = useState(false);

  // Summary KPIs & Analytics
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 4000);
  };

  // Fetch indent & summary for currentDate
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
        setSupplierName(ind.supplier_name || 'KMF / Nandini Mother Dairy');
        setCrateDeposit(String(ind.crate_deposit_amount || 0));
        setOtherCharges(String(ind.other_charges || 0));
        setStatus(ind.status || 'OPEN');
        setNotes(ind.notes || '');

        const rawItems = indentRes.items || [];
        setItems(
          rawItems.map((it) => ({
            product_id: it.product_id || null,
            product_name: it.product_name || '',
            item_code: it.item_code || '',
            category: it.category || 'Milk',
            unit_label: it.unit_label || '500 ml',
            opening_stock: it.opening_stock ?? 0,
            inward_qty: it.inward_qty ?? 0,
            purchase_price: it.purchase_price ?? 0,
            selling_price: it.selling_price ?? 0,
            closing_stock: it.closing_stock ?? 0,
            damaged_qty: it.damaged_qty ?? 0,
            missing_qty: it.missing_qty ?? 0,
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

  // Stepper helper
  const changeDateBy = (days) => {
    const d = new Date(currentDate + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    setCurrentDate(d.toISOString().split('T')[0]);
  };

  // 1-Click Load Default Nandini KMF Template
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
        showToast('Loaded standard Nandini KMF product template!');
      }
    } catch (err) {
      showToast('Failed to load template');
    }
  };

  // Update item field
  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Add custom product row
  const handleAddCustomItem = () => {
    setItems((prev) => [
      ...prev,
      {
        product_name: '',
        item_code: '',
        category: 'Milk',
        unit_label: '500 ml',
        opening_stock: 0,
        inward_qty: 0,
        purchase_price: 0,
        selling_price: 0,
        closing_stock: 0,
        damaged_qty: 0,
        missing_qty: 0,
        notes: ''
      }
    ]);
  };

  // Remove product row
  const handleRemoveItem = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Save Indent
  const handleSaveIndent = async () => {
    try {
      setSaving(true);
      await api.post('/indents', {
        indent_date: currentDate,
        invoice_no: invoiceNo,
        supplier_name: supplierName,
        crate_deposit_amount: parseFloat(crateDeposit) || 0,
        other_charges: parseFloat(otherCharges) || 0,
        status,
        notes,
        items
      });
      showToast('Indent & profit calculation saved successfully!');
      fetchData(currentDate);
    } catch (err) {
      showToast(err.message || 'Failed to save indent');
    } finally {
      setSaving(false);
    }
  };

  // Push Leftovers to Tomorrow
  const handlePushLeftovers = async () => {
    if (!window.confirm(`Push unsold leftover packets from ${currentDate} as tomorrow's opening stock?`)) {
      return;
    }
    try {
      setPushing(true);
      const res = await api.post('/indents/push-leftover', { date: currentDate });
      showToast(`Leftovers successfully pushed to ${res.indent?.indent_date || 'next day'}!`);
      // Optionally advance date to view next day
      changeDateBy(1);
    } catch (err) {
      showToast(err.message || 'Failed to push leftovers');
    } finally {
      setPushing(false);
    }
  };

  // Compute live totals for the active form
  const computedTotals = items.reduce(
    (acc, it) => {
      const openStock = Math.max(0, parseFloat(it.opening_stock) || 0);
      const inwardQty = Math.max(0, parseFloat(it.inward_qty) || 0);
      const totalAvail = openStock + inwardQty;
      const pPrice = Math.max(0, parseFloat(it.purchase_price) || 0);
      const sPrice = Math.max(0, parseFloat(it.selling_price) || 0);
      const closingStock = Math.max(0, parseFloat(it.closing_stock) || 0);
      const damagedQty = Math.max(0, parseFloat(it.damaged_qty) || 0);
      const missingQty = Math.max(0, parseFloat(it.missing_qty) || 0);

      const soldQty = Math.max(0, totalAvail - (closingStock + damagedQty + missingQty));
      const inwardCost = inwardQty * pPrice;
      const salesRev = soldQty * sPrice;
      const cogs = soldQty * pPrice;
      const grossMargin = salesRev - cogs;
      const damageLoss = damagedQty * pPrice;
      const missingLoss = missingQty * pPrice;
      const netProfit = grossMargin - damageLoss - missingLoss;

      acc.totalInward += inwardCost;
      acc.totalSales += salesRev;
      acc.totalCOGS += cogs;
      acc.totalMargin += grossMargin;
      acc.totalDamagedLoss += damageLoss;
      acc.totalMissingLoss += missingLoss;
      acc.totalNetProfit += netProfit;
      acc.totalSoldPackets += soldQty;
      acc.totalInwardPackets += inwardQty;
      acc.totalLeftoverPackets += closingStock;
      acc.totalDamagedPackets += damagedQty;
      acc.totalMissingPackets += missingQty;
      return acc;
    },
    {
      totalInward: (parseFloat(crateDeposit) || 0) + (parseFloat(otherCharges) || 0),
      totalSales: 0,
      totalCOGS: 0,
      totalMargin: 0,
      totalDamagedLoss: 0,
      totalMissingLoss: 0,
      totalNetProfit: -(parseFloat(otherCharges) || 0),
      totalSoldPackets: 0,
      totalInwardPackets: 0,
      totalLeftoverPackets: 0,
      totalDamagedPackets: 0,
      totalMissingPackets: 0
    }
  );

  return (
    <div className="page-wrapper" style={{ paddingBottom: '80px' }}>
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
            boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.9rem',
            fontWeight: 600
          }}
        >
          <Sparkles size={18} color="#38bdf8" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Page Title & Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
              Daily Milk Indent & Shop Profit
            </h1>
            <span
              style={{
                background: status === 'CLOSED' ? '#dcfce7' : '#eff6ff',
                color: status === 'CLOSED' ? '#15803d' : '#1d4ed8',
                border: `1px solid ${status === 'CLOSED' ? '#86efac' : '#bfdbfe'}`,
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 800
              }}
            >
              {status === 'CLOSED' ? '✓ Day Closed' : '⏳ Open Indent'}
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Record morning KMF milk inward, calculate packet margins, track closing stock & damages, and compute daily/weekly/monthly profit.
          </p>
        </div>

        {/* Date Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card)', padding: '6px 10px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => changeDateBy(-1)}
            className="btn btn-outline"
            style={{ padding: '6px 10px', borderRadius: '8px' }}
            title="Previous Day"
          >
            <ChevronLeft size={16} />
          </button>

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

          <button
            type="button"
            onClick={() => changeDateBy(1)}
            className="btn btn-outline"
            style={{ padding: '6px 10px', borderRadius: '8px' }}
            title="Next Day"
          >
            <ChevronRight size={16} />
          </button>

          <button
            type="button"
            onClick={() => setCurrentDate(getLocalDateString())}
            style={{
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              border: 'none',
              padding: '6px 10px',
              borderRadius: '8px',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Today
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('INDENT')}
          style={{
            background: activeTab === 'INDENT' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'INDENT' ? 'white' : 'var(--text-secondary)',
            border: 'none',
            borderRadius: '10px',
            padding: '8px 16px',
            fontSize: '0.88rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <FileText size={16} />
          <span>Daily Indent Entry & Day Closing</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ANALYTICS')}
          style={{
            background: activeTab === 'ANALYTICS' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'ANALYTICS' ? 'white' : 'var(--text-secondary)',
            border: 'none',
            borderRadius: '10px',
            padding: '8px 16px',
            fontSize: '0.88rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <TrendingUp size={16} />
          <span>Weekly & Monthly Profit Analytics</span>
        </button>
      </div>

      {/* TOP KPI CARDS */}
      <div className="stat-grid" style={{ marginBottom: '24px' }}>
        {/* Today's Net Profit */}
        <div className="stat-card" style={{ borderLeft: '4px solid #16a34a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-label">Today's Net Profit</span>
            <div className="stat-icon-wrapper" style={{ background: '#dcfce7', color: '#16a34a' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="stat-value" style={{ color: '#16a34a', marginTop: '6px' }}>
            {formatINR(computedTotals.totalNetProfit)}
          </div>
          <div className="stat-sub">
            Gross Margin: {formatINR(computedTotals.totalMargin)}
          </div>
        </div>

        {/* Today's Revenue / Sales */}
        <div className="stat-card" style={{ borderLeft: '4px solid #2563eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-label">Today's Sales Revenue</span>
            <div className="stat-icon-wrapper" style={{ background: '#dbeafe', color: '#2563eb' }}>
              <DollarSign size={18} />
            </div>
          </div>
          <div className="stat-value" style={{ color: '#2563eb', marginTop: '6px' }}>
            {formatINR(computedTotals.totalSales)}
          </div>
          <div className="stat-sub">
            {computedTotals.totalSoldPackets} pkts sold today
          </div>
        </div>

        {/* Today's Indent Procurement Cost */}
        <div className="stat-card" style={{ borderLeft: '4px solid #d97706' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-label">Today's Inward Indent</span>
            <div className="stat-icon-wrapper" style={{ background: '#fef3c7', color: '#d97706' }}>
              <Truck size={18} />
            </div>
          </div>
          <div className="stat-value" style={{ color: '#d97706', marginTop: '6px' }}>
            {formatINR(computedTotals.totalInward)}
          </div>
          <div className="stat-sub">
            {computedTotals.totalInwardPackets} pkts received from truck
          </div>
        </div>

        {/* Weekly & Monthly Profit */}
        <div className="stat-card" style={{ borderLeft: '4px solid #9333ea' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="stat-label">This Week's Net Profit</span>
            <div className="stat-icon-wrapper" style={{ background: '#f3e8ff', color: '#9333ea' }}>
              <ShoppingBag size={18} />
            </div>
          </div>
          <div className="stat-value" style={{ color: '#9333ea', marginTop: '6px' }}>
            {formatINR(summary?.weekly?.netProfit || 0)}
          </div>
          <div className="stat-sub">
            Month to date: <strong>{formatINR(summary?.monthly?.netProfit || 0)}</strong>
          </div>
        </div>
      </div>

      {activeTab === 'INDENT' ? (
        <>
          {/* Action Toolbar */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '14px 16px',
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px'
            }}
          >
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleLoadTemplate}
                className="btn btn-outline"
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderColor: '#93c5fd',
                  color: '#1d4ed8',
                  background: '#eff6ff'
                }}
              >
                <Sparkles size={15} />
                Load Nandini KMF Template
              </button>

              <button
                type="button"
                onClick={handlePushLeftovers}
                disabled={pushing || items.length === 0}
                className="btn btn-outline"
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderColor: '#bbf7d0',
                  color: '#15803d',
                  background: '#f0fdf4'
                }}
                title="Automatically sets unsold closing packets as opening stock for tomorrow"
              >
                <ArrowRight size={15} />
                Push Leftovers to Next Day
              </button>

              <button
                type="button"
                onClick={handleAddCustomItem}
                className="btn btn-outline"
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Plus size={15} />
                Add Product
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleSaveIndent}
                disabled={saving}
                className="btn btn-primary"
                style={{
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 18px',
                  borderRadius: '10px'
                }}
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Indent & Calculate Profit'}
              </button>
            </div>
          </div>

          {/* Indent Invoice Details Header */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '16px 20px',
              marginBottom: '20px'
            }}
          >
            <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 12px', color: 'var(--text-primary)' }}>
              Procurement Invoice Details
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px'
              }}
            >
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  INVOICE / INDENT NO
                </label>
                <input
                  type="text"
                  placeholder="e.g. 4648247"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  SUPPLIER / UNION
                </label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  CRATE / SEC DEPOSIT
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={crateDeposit}
                  onChange={(e) => setCrateDeposit(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  OTHER CHARGES / EXPENSES
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={otherCharges}
                  onChange={(e) => setOtherCharges(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  DAY RECONCILIATION STATUS
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.88rem'
                  }}
                >
                  <option value="OPEN">OPEN (Selling Active)</option>
                  <option value="CLOSED">CLOSED (Night Reconciled)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Product Items Table (Desktop) & Cards (Mobile) */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              overflow: 'hidden',
              marginBottom: '24px'
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Product Stock, Margins & Daily Reconciliation
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Enter Inward from KMF Invoice, then at night record Leftover, Damages & Missing to calculate net profit.
                </span>
              </div>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {items.length} Products
              </span>
            </div>

            {items.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <ShoppingBag size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <p style={{ fontWeight: 700, fontSize: '0.95rem', margin: 0 }}>No items in today's indent yet</p>
                <button
                  type="button"
                  onClick={handleLoadTemplate}
                  className="btn btn-primary"
                  style={{ marginTop: '12px', fontSize: '0.85rem' }}
                >
                  Load Nandini KMF Template
                </button>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="desktop-only" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-surface)', borderBottom: '1.5px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '10px 14px' }}>Product</th>
                        <th style={{ padding: '10px 10px', textAlign: 'center' }}>Opening</th>
                        <th style={{ padding: '10px 10px', textAlign: 'center' }}>Inward</th>
                        <th style={{ padding: '10px 10px', textAlign: 'center' }}>Available</th>
                        <th style={{ padding: '10px 10px', textAlign: 'center' }}>P/U (Cost)</th>
                        <th style={{ padding: '10px 10px', textAlign: 'center' }}>MRP (Sell)</th>
                        <th style={{ padding: '10px 10px', textAlign: 'center' }}>Margin/Pkt</th>
                        <th style={{ padding: '10px 10px', textAlign: 'center', background: '#fffbeb' }}>Leftover</th>
                        <th style={{ padding: '10px 10px', textAlign: 'center', background: '#fef2f2' }}>Damaged</th>
                        <th style={{ padding: '10px 10px', textAlign: 'center', background: '#fef2f2' }}>Missing</th>
                        <th style={{ padding: '10px 10px', textAlign: 'center', background: '#f0fdf4' }}>Sold Pkts</th>
                        <th style={{ padding: '10px 10px', textAlign: 'right' }}>Net Profit</th>
                        <th style={{ padding: '10px 10px', textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => {
                        const openStock = Math.max(0, parseFloat(it.opening_stock) || 0);
                        const inwardQty = Math.max(0, parseFloat(it.inward_qty) || 0);
                        const totalAvail = openStock + inwardQty;
                        const pPrice = Math.max(0, parseFloat(it.purchase_price) || 0);
                        const sPrice = Math.max(0, parseFloat(it.selling_price) || 0);
                        const marginPerPkt = Number((sPrice - pPrice).toFixed(2));
                        const closingStock = Math.max(0, parseFloat(it.closing_stock) || 0);
                        const damagedQty = Math.max(0, parseFloat(it.damaged_qty) || 0);
                        const missingQty = Math.max(0, parseFloat(it.missing_qty) || 0);

                        const soldQty = Math.max(0, totalAvail - (closingStock + damagedQty + missingQty));
                        const salesRev = soldQty * sPrice;
                        const cogs = soldQty * pPrice;
                        const damageLoss = (damagedQty + missingQty) * pPrice;
                        const profit = (salesRev - cogs) - damageLoss;

                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}>
                            <td style={{ padding: '8px 14px' }}>
                              <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                                {it.product_name || 'Item'}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {it.item_code} • {it.category}
                              </div>
                            </td>

                            {/* Opening Stock */}
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <input
                                type="number"
                                min="0"
                                value={it.opening_stock}
                                onChange={(e) => handleItemChange(idx, 'opening_stock', e.target.value)}
                                style={{
                                  width: '55px',
                                  padding: '4px 6px',
                                  textAlign: 'center',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border-color)',
                                  background: 'var(--bg-surface)',
                                  fontWeight: 700
                                }}
                              />
                            </td>

                            {/* Inward Qty */}
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <input
                                type="number"
                                min="0"
                                value={it.inward_qty}
                                onChange={(e) => handleItemChange(idx, 'inward_qty', e.target.value)}
                                style={{
                                  width: '60px',
                                  padding: '4px 6px',
                                  textAlign: 'center',
                                  borderRadius: '6px',
                                  border: '1.5px solid #93c5fd',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  fontWeight: 800
                                }}
                              />
                            </td>

                            {/* Total Available */}
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>
                              {totalAvail}
                            </td>

                            {/* Purchase Price (P/U) */}
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={it.purchase_price}
                                onChange={(e) => handleItemChange(idx, 'purchase_price', e.target.value)}
                                style={{
                                  width: '65px',
                                  padding: '4px 6px',
                                  textAlign: 'center',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border-color)',
                                  background: 'var(--bg-surface)',
                                  fontWeight: 700
                                }}
                              />
                            </td>

                            {/* Selling Price (MRP) */}
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={it.selling_price}
                                onChange={(e) => handleItemChange(idx, 'selling_price', e.target.value)}
                                style={{
                                  width: '65px',
                                  padding: '4px 6px',
                                  textAlign: 'center',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border-color)',
                                  background: 'var(--bg-surface)',
                                  fontWeight: 700
                                }}
                              />
                            </td>

                            {/* Margin / Pkt */}
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <span style={{ fontWeight: 800, color: marginPerPkt > 0 ? '#16a34a' : '#dc2626' }}>
                                {formatINR(marginPerPkt)}
                              </span>
                            </td>

                            {/* Closing Stock (Leftover) */}
                            <td style={{ padding: '8px 10px', textAlign: 'center', background: '#fffbeb' }}>
                              <input
                                type="number"
                                min="0"
                                value={it.closing_stock}
                                onChange={(e) => handleItemChange(idx, 'closing_stock', e.target.value)}
                                style={{
                                  width: '55px',
                                  padding: '4px 6px',
                                  textAlign: 'center',
                                  borderRadius: '6px',
                                  border: '1.5px solid #fde68a',
                                  background: '#fffbeb',
                                  fontWeight: 800,
                                  color: '#b45309'
                                }}
                              />
                            </td>

                            {/* Damaged */}
                            <td style={{ padding: '8px 10px', textAlign: 'center', background: '#fef2f2' }}>
                              <input
                                type="number"
                                min="0"
                                value={it.damaged_qty}
                                onChange={(e) => handleItemChange(idx, 'damaged_qty', e.target.value)}
                                style={{
                                  width: '50px',
                                  padding: '4px 6px',
                                  textAlign: 'center',
                                  borderRadius: '6px',
                                  border: '1px solid #fca5a5',
                                  background: '#fef2f2',
                                  fontWeight: 700,
                                  color: '#dc2626'
                                }}
                              />
                            </td>

                            {/* Missing */}
                            <td style={{ padding: '8px 10px', textAlign: 'center', background: '#fef2f2' }}>
                              <input
                                type="number"
                                min="0"
                                value={it.missing_qty}
                                onChange={(e) => handleItemChange(idx, 'missing_qty', e.target.value)}
                                style={{
                                  width: '50px',
                                  padding: '4px 6px',
                                  textAlign: 'center',
                                  borderRadius: '6px',
                                  border: '1px solid #fca5a5',
                                  background: '#fef2f2',
                                  fontWeight: 700,
                                  color: '#dc2626'
                                }}
                              />
                            </td>

                            {/* Sold Packets */}
                            <td style={{ padding: '8px 10px', textAlign: 'center', background: '#f0fdf4', fontWeight: 900, color: '#15803d' }}>
                              {soldQty}
                            </td>

                            {/* Net Profit */}
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 900, color: profit >= 0 ? '#16a34a' : '#dc2626' }}>
                              {formatINR(profit)}
                            </td>

                            {/* Delete */}
                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                  padding: '4px'
                                }}
                                title="Remove item"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Responsive Card List */}
                <div className="mobile-only" style={{ padding: '12px' }}>
                  {items.map((it, idx) => {
                    const openStock = Math.max(0, parseFloat(it.opening_stock) || 0);
                    const inwardQty = Math.max(0, parseFloat(it.inward_qty) || 0);
                    const totalAvail = openStock + inwardQty;
                    const pPrice = Math.max(0, parseFloat(it.purchase_price) || 0);
                    const sPrice = Math.max(0, parseFloat(it.selling_price) || 0);
                    const marginPerPkt = Number((sPrice - pPrice).toFixed(2));
                    const closingStock = Math.max(0, parseFloat(it.closing_stock) || 0);
                    const damagedQty = Math.max(0, parseFloat(it.damaged_qty) || 0);
                    const missingQty = Math.max(0, parseFloat(it.missing_qty) || 0);

                    const soldQty = Math.max(0, totalAvail - (closingStock + damagedQty + missingQty));
                    const salesRev = soldQty * sPrice;
                    const cogs = soldQty * pPrice;
                    const damageLoss = (damagedQty + missingQty) * pPrice;
                    const profit = (salesRev - cogs) - damageLoss;

                    return (
                      <div
                        key={idx}
                        style={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '12px',
                          padding: '12px',
                          marginBottom: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                              {it.product_name}
                            </div>
                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                              {it.item_code} • P/U: {formatINR(pPrice)} • MRP: {formatINR(sPrice)} • Margin: {formatINR(marginPerPkt)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            style={{ background: 'transparent', border: 'none', color: '#ef4444', padding: '4px' }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        {/* Mobile Inputs Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '0.75rem' }}>
                          <div>
                            <label style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 700 }}>Inward</label>
                            <input
                              type="number"
                              min="0"
                              value={it.inward_qty}
                              onChange={(e) => handleItemChange(idx, 'inward_qty', e.target.value)}
                              style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1.5px solid #93c5fd', background: '#eff6ff', fontWeight: 800, textAlign: 'center' }}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', color: '#b45309', fontWeight: 700 }}>Leftover</label>
                            <input
                              type="number"
                              min="0"
                              value={it.closing_stock}
                              onChange={(e) => handleItemChange(idx, 'closing_stock', e.target.value)}
                              style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1.5px solid #fde68a', background: '#fffbeb', fontWeight: 800, textAlign: 'center' }}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', color: '#dc2626', fontWeight: 700 }}>Damaged</label>
                            <input
                              type="number"
                              min="0"
                              value={it.damaged_qty}
                              onChange={(e) => handleItemChange(idx, 'damaged_qty', e.target.value)}
                              style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #fca5a5', background: '#fef2f2', fontWeight: 700, textAlign: 'center' }}
                            />
                          </div>
                        </div>

                        {/* Mobile Item Footer */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)', fontSize: '0.82rem' }}>
                          <span>Sold: <strong>{soldQty} pkts</strong></span>
                          <span>Net Profit: <strong style={{ color: profit >= 0 ? '#16a34a' : '#dc2626' }}>{formatINR(profit)}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* End of Day Summary Sheet */}
          <div
            style={{
              background: 'linear-gradient(135deg, #1e293b, #0f172a)',
              color: 'white',
              borderRadius: '16px',
              padding: '20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px'
            }}
          >
            <div>
              <span style={{ fontSize: '0.75rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Inward Cost (KMF Bill)
              </span>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: '4px', color: '#fbbf24' }}>
                {formatINR(computedTotals.totalInward)}
              </div>
              <span style={{ fontSize: '0.76rem', opacity: 0.8 }}>
                Includes {formatINR(crateDeposit)} crate deposit
              </span>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Sales Revenue
              </span>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: '4px', color: '#38bdf8' }}>
                {formatINR(computedTotals.totalSales)}
              </div>
              <span style={{ fontSize: '0.76rem', opacity: 0.8 }}>
                From {computedTotals.totalSoldPackets} sold packets
              </span>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Damages & Shortage Loss
              </span>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: '4px', color: '#f87171' }}>
                {formatINR(computedTotals.totalDamagedLoss + computedTotals.totalMissingLoss)}
              </div>
              <span style={{ fontSize: '0.76rem', opacity: 0.8 }}>
                {computedTotals.totalDamagedPackets + computedTotals.totalMissingPackets} leaked/missing packets
              </span>
            </div>

            <div>
              <span style={{ fontSize: '0.75rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Net Realized Profit
              </span>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: '4px', color: '#4ade80' }}>
                {formatINR(computedTotals.totalNetProfit)}
              </div>
              <span style={{ fontSize: '0.76rem', opacity: 0.8 }}>
                Margin: {computedTotals.totalSales > 0 ? ((computedTotals.totalNetProfit / computedTotals.totalSales) * 100).toFixed(1) : '0.0'}%
              </span>
            </div>
          </div>
        </>
      ) : (
        /* ANALYTICS TAB: Weekly & Monthly Performance History */
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 16px' }}>
            Past 30 Days Sales & Profit Performance
          </h3>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface)', borderBottom: '1.5px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px' }}>Date</th>
                  <th style={{ padding: '10px 14px' }}>Invoice No</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Inward Cost</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Sales Revenue</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Damages/Loss</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Net Profit</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {summary?.trend && summary.trend.length > 0 ? (
                  summary.trend.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {formatDisplayDate(row.indent_date)}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                        {row.invoice_no || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>
                        {formatINR(row.total_inward_amount)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#2563eb' }}>
                        {formatINR(row.total_sales_amount)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>
                        {formatINR(row.total_damage_loss + row.total_missing_loss)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 900, color: row.net_daily_profit >= 0 ? '#16a34a' : '#dc2626' }}>
                        {formatINR(row.net_daily_profit)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <span
                          style={{
                            background: row.status === 'CLOSED' ? '#dcfce7' : '#eff6ff',
                            color: row.status === 'CLOSED' ? '#15803d' : '#1d4ed8',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 800
                          }}
                        >
                          {row.status === 'CLOSED' ? 'Closed' : 'Open'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentDate(row.indent_date);
                            setActiveTab('INDENT');
                          }}
                          className="btn btn-outline"
                          style={{ padding: '4px 10px', fontSize: '0.78rem', fontWeight: 700 }}
                        >
                          View / Edit
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No indent history recorded yet. Start by recording today's indent above!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

