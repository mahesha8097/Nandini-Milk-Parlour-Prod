import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import {
  TrendingUp,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Package,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  ShoppingCart,
  Boxes,
  DollarSign,
  Download,
  Printer,
  ArrowRight
} from 'lucide-react';

// Currency formatter
const formatINR = (val) => {
  const num = Number(val || 0);
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatUnits = (val) => {
  const num = Number(val || 0);
  return num.toLocaleString('en-IN');
};

export default function DailyIndentPage() {
  const [currentDate, setCurrentDate] = useState(getLocalDateString());
  // Tabs: 'ENTRY' (Indent Entry) | 'PROFIT' (Shop Profit & Margins) | 'CLOSING' (Stock Reconciliation)
  const [activeTab, setActiveTab] = useState('ENTRY');

  // Indent metadata
  const [invoiceNo, setInvoiceNo] = useState('');
  const [status, setStatus] = useState('OPEN');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [indentExists, setIndentExists] = useState(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState('09:30 AM');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

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

  // Load catalog products for reference
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
        api.get(`/indents?date=${targetDate}`).catch(() => null),
        api.get(`/indents/summary?date=${targetDate}`).catch(() => null)
      ]);

      if (summaryRes) {
        setSummary(summaryRes);
      }

      if (indentRes) {
        setIndentExists(indentRes.exists || false);
        const ind = indentRes.indent || {};
        setInvoiceNo(ind.invoice_no || '');
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
        if (rawItems.length > 0) {
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
        } else {
          handleLoadTemplate(false);
        }
      } else {
        handleLoadTemplate(false);
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
  const handleLoadTemplate = async (showNotification = true) => {
    try {
      const template = await api.get('/indents/template');
      if (Array.isArray(template) && template.length > 0) {
        setItems(
          template.map((t) => ({
            ...t,
            opening_stock: 0,
            inward_qty: Number(t.inward_qty || 0),
            closing_stock: 0,
            damaged_qty: 0,
            missing_qty: 0,
            notes: ''
          }))
        );
        if (showNotification) {
          showToast('Standard Nandini KMF product template loaded!');
        }
      }
    } catch (err) {
      if (showNotification) showToast('Failed to load template');
    }
  };

  // Quantity modification handlers
  const handleUpdateItemQty = (index, val) => {
    setItems((prev) => {
      const updated = [...prev];
      const numVal = Math.max(0, isNaN(val) ? 0 : Number(val));
      updated[index] = { ...updated[index], inward_qty: numVal };
      return updated;
    });
  };

  const handleAdjustItemQty = (index, delta) => {
    setItems((prev) => {
      const updated = [...prev];
      const cur = Number(updated[index].inward_qty || 0);
      const nextVal = Math.max(0, cur + delta);
      updated[index] = { ...updated[index], inward_qty: nextVal };
      return updated;
    });
  };

  const handleUpdateStockField = (index, field, val) => {
    setItems((prev) => {
      const updated = [...prev];
      const numVal = Math.max(0, isNaN(val) ? 0 : Number(val));
      updated[index] = { ...updated[index], [field]: numVal };
      return updated;
    });
  };

  // Save Indent
  const handleSaveIndent = async (statusOverride = null) => {
    try {
      setSaving(true);
      const finalStatus = statusOverride || status;
      await api.post('/indents', {
        indent_date: currentDate,
        invoice_no: invoiceNo,
        supplier_name: 'KMF / Nandini Mother Dairy',
        crate_deposit_amount: 0,
        other_charges: 0,
        status: finalStatus,
        notes,
        items
      });
      setStatus(finalStatus);
      showToast(
        finalStatus === 'CLOSED'
          ? 'Day closed and indent reconciled successfully!'
          : 'Indent submitted and saved successfully!'
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
      await api.post('/indents', {
        indent_date: currentDate,
        invoice_no: invoiceNo,
        supplier_name: 'KMF / Nandini Mother Dairy',
        crate_deposit_amount: 0,
        other_charges: 0,
        status: 'CLOSED',
        notes,
        items
      });
      await api.post('/indents/push-leftover', { date: currentDate });
      showToast(`Day closed! Stock carried forward to ${formatDisplayDate(nextDate)}`);
      setStatus('CLOSED');
      fetchData(currentDate);
    } catch (err) {
      showToast(err.message || 'Failed to close day and carry forward');
    } finally {
      setPushing(false);
    }
  };

  // Calculated Real-Time Totals & Profit
  const totals = useMemo(() => {
    return items.reduce(
      (acc, it) => {
        const inward = Number(it.inward_qty) || 0;
        const pPrice = Number(it.purchase_price) || 0;
        const sPrice = Number(it.selling_price) || 0;
        const open = Number(it.opening_stock) || 0;
        const closing = Number(it.closing_stock) || 0;
        const damage = Number(it.damaged_qty) || 0;
        const missing = Number(it.missing_qty) || 0;

        const totalAvail = open + inward;
        const sold = Math.max(0, totalAvail - (closing + damage + missing));

        const inwardCost = inward * pPrice;
        const potentialFullSales = inward * sPrice;
        const potentialProfit = potentialFullSales - inwardCost;

        const actualSalesRev = sold * sPrice;
        const cogs = sold * pPrice;
        const grossMargin = actualSalesRev - cogs;
        const damageVal = damage * pPrice;
        const missingVal = missing * pPrice;
        const actualProfit = grossMargin - damageVal - missingVal;

        if (inward > 0) {
          acc.orderedProductsCount += 1;
        }

        acc.totalInwardQty += inward;
        acc.totalOpeningQty += open;
        acc.totalAvailQty += totalAvail;
        acc.totalSoldQty += sold;
        acc.totalDamageQty += damage;
        acc.totalMissingQty += missing;
        acc.totalClosingQty += closing;

        acc.totalInwardCost += inwardCost;
        acc.totalPotentialSales += potentialFullSales;
        acc.totalPotentialProfit += potentialProfit;
        acc.totalActualSalesRev += actualSalesRev;
        acc.totalActualProfit += actualProfit;

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
        totalPotentialSales: 0,
        totalPotentialProfit: 0,
        totalActualSalesRev: 0,
        totalActualProfit: 0
      }
    );
  }, [items]);

  // Filtered Items for Indent Entry
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (it.product_name || '').toLowerCase().includes(q);
        const matchesCode = (it.item_code || '').toLowerCase().includes(q);
        const matchesCat = (it.category || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesCat) return false;
      }
      if (categoryFilter !== 'ALL') {
        const itCat = (it.category || '').toUpperCase();
        if (categoryFilter === 'MILK' && !itCat.includes('MILK')) return false;
        if (categoryFilter === 'CURD' && !itCat.includes('CURD')) return false;
        if (categoryFilter === 'BUTTERMILK' && !itCat.includes('BUTTER')) return false;
      }
      return true;
    });
  }, [items, searchQuery, categoryFilter]);

  return (
    <div className="page-wrapper" style={{ maxWidth: '820px', margin: '0 auto', paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 20px))' }}>
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
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.9rem',
            fontWeight: 700
          }}
        >
          <Sparkles size={18} color="#f97316" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Clean Top Date & Action Header */}
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        padding: '14px 18px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        marginBottom: '14px',
        border: '1px solid #f1f5f9'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShoppingCart size={24} color="#ea580c" />
              <span>Daily Indent & Shop Profit</span>
            </h1>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '2px 0 0' }}>
              Enter daily KMF procurement indent and calculate exact shop profit
            </p>
          </div>

          {/* Date Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => changeDateBy(-1)}
              style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 8px', cursor: 'pointer' }}
              title="Previous Day"
            >
              <ChevronLeft size={16} color="#475569" />
            </button>
            <input
              type="date"
              value={currentDate}
              onChange={(e) => setCurrentDate(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.84rem',
                fontWeight: 800,
                color: '#1e293b'
              }}
            />
            <button
              type="button"
              onClick={() => changeDateBy(1)}
              style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 8px', cursor: 'pointer' }}
              title="Next Day"
            >
              <ChevronRight size={16} color="#475569" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentDate(getLocalDateString())}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #fed7aa',
                background: '#fff7ed',
                color: '#ea580c',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Today
            </button>
          </div>
        </div>

        {/* 2 Primary Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('ENTRY')}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '0.9rem',
              fontWeight: 800,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'ENTRY' ? '#ea580c' : '#f8fafc',
              color: activeTab === 'ENTRY' ? '#ffffff' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: activeTab === 'ENTRY' ? '0 4px 12px rgba(234, 88, 12, 0.25)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <ShoppingCart size={17} />
            <span>Indent Entry ({formatUnits(totals.totalInwardQty)} Pkts)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PROFIT')}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '0.9rem',
              fontWeight: 800,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'PROFIT' ? '#16a34a' : '#f8fafc',
              color: activeTab === 'PROFIT' ? '#ffffff' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: activeTab === 'PROFIT' ? '0 4px 12px rgba(22, 163, 74, 0.25)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <TrendingUp size={17} />
            <span>Shop Profit (+{formatINR(totals.totalPotentialProfit)})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CLOSING')}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '0.85rem',
              fontWeight: 800,
              cursor: 'pointer',
              border: 'none',
              background: activeTab === 'CLOSING' ? '#0284c7' : '#f8fafc',
              color: activeTab === 'CLOSING' ? '#ffffff' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
            title="End of day stock closing & leftover carry forward"
          >
            <Boxes size={17} />
            <span>Day Close</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: INDENT ENTRY (Clean matching Image 4)                               */}
      {/* ========================================================================= */}
      {activeTab === 'ENTRY' && (
        <div style={{ background: '#ffffff', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
          {/* Top Live Summary Bar */}
          <div style={{
            background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
            borderBottom: '1.5px solid #fed7aa',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div>
              <div style={{ fontSize: '0.74rem', color: '#c2410c', fontWeight: 800, textTransform: 'uppercase' }}>
                Indent for {formatDisplayDate(currentDate)}
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#ea580c', marginTop: '2px' }}>
                Total Indent Cost: {formatINR(totals.totalInwardCost)}
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.74rem', color: '#166534', fontWeight: 800, textTransform: 'uppercase' }}>
                Expected Shop Profit
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#16a34a', marginTop: '2px' }}>
                +{formatINR(totals.totalPotentialProfit)}
              </div>
            </div>
          </div>

          {/* Quick Filter Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 18px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            gap: '8px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none' }}>
              {[
                { key: 'ALL', label: 'All Items' },
                { key: 'MILK', label: '🥛 Milk' },
                { key: 'CURD', label: '🥣 Curd' },
                { key: 'BUTTERMILK', label: '🧈 Buttermilk' }
              ].map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setCategoryFilter(cat.key)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '999px',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    border: categoryFilter === cat.key ? '1px solid #ea580c' : '1px solid #cbd5e1',
                    background: categoryFilter === cat.key ? '#fff7ed' : '#ffffff',
                    color: categoryFilter === cat.key ? '#ea580c' : '#64748b'
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleLoadTemplate(true)}
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#0284c7',
                background: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '8px',
                padding: '4px 10px',
                cursor: 'pointer'
              }}
            >
              Reset to Standard KMF Items
            </button>
          </div>

          {/* Table Header Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2.4fr 1.6fr',
            padding: '10px 18px',
            background: '#f1f5f9',
            fontWeight: 800,
            fontSize: '0.8rem',
            color: '#475569',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            borderBottom: '1px solid #e2e8f0'
          }}>
            <div>Category</div>
            <div>Product</div>
            <div style={{ textAlign: 'right' }}>Quantity (Pkts)</div>
          </div>

          {/* Product Items List (Image 4 Clean Style) */}
          <div style={{ maxHeight: '62vh', overflowY: 'auto' }}>
            {filteredItems.map((it, idx) => {
              const inwardQty = Number(it.inward_qty) || 0;
              const unitCost = Number(it.purchase_price) || 0;
              const unitMRP = Number(it.selling_price) || 0;
              const lineTotal = inwardQty * unitCost;
              const unitMargin = unitMRP - unitCost;

              return (
                <div
                  key={it.item_code || it.product_name || idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 2.4fr 1.6fr',
                    padding: '12px 18px',
                    borderBottom: '1px solid #f1f5f9',
                    alignItems: 'center',
                    background: inwardQty > 0 ? '#fffaf5' : '#ffffff'
                  }}
                >
                  {/* Category Column */}
                  <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#64748b' }}>
                    {(it.category || 'MILK').toUpperCase()}
                  </div>

                  {/* Product Column */}
                  <div style={{ paddingRight: '8px' }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.25 }}>
                      {it.product_name} {it.item_code}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '3px', fontWeight: 600 }}>
                      Cost: <strong>₹{unitCost.toFixed(2)}</strong> • MRP: <strong>₹{unitMRP.toFixed(2)}</strong>
                      <span style={{ color: '#16a34a', marginLeft: '6px', fontWeight: 800 }}>
                        (+₹{unitMargin.toFixed(2)} profit/pkt)
                      </span>
                    </div>
                  </div>

                  {/* Quantity UOM & Amount Column (Direct Keyboard + Steppers) */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => handleAdjustItemQty(idx, -1)}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          color: '#475569',
                          fontWeight: 900,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.9rem'
                        }}
                      >
                        -
                      </button>

                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={it.inward_qty === 0 ? '' : it.inward_qty}
                        placeholder="0"
                        onChange={(e) => handleUpdateItemQty(idx, e.target.value)}
                        style={{
                          width: '56px',
                          textAlign: 'center',
                          fontWeight: 900,
                          fontSize: '1.05rem',
                          color: '#ea580c',
                          border: 'none',
                          borderBottom: '2px solid #ea580c',
                          background: 'transparent',
                          padding: '2px 0',
                          outline: 'none'
                        }}
                      />

                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569' }}>
                        Pkts
                      </span>

                      <button
                        type="button"
                        onClick={() => handleAdjustItemQty(idx, 1)}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          color: '#475569',
                          fontWeight: 900,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.9rem'
                        }}
                      >
                        +
                      </button>
                    </div>

                    {/* Calculated Line Cost */}
                    <div style={{ fontSize: '0.74rem', color: '#ea580c', fontWeight: 800, marginTop: '3px' }}>
                      Cost: {formatINR(lineTotal)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Submit Bar */}
          <div style={{ padding: '16px 18px', background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={() => handleSaveIndent()}
              disabled={saving}
              style={{
                width: '100%',
                background: '#ea580c',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                padding: '16px',
                fontSize: '1.05rem',
                fontWeight: 900,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(234, 88, 12, 0.35)',
                letterSpacing: '0.04em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <Save size={20} />
              <span>{saving ? 'Submitting Indent...' : `Submit & Save Indent (${formatINR(totals.totalInwardCost)})`}</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SHOP PROFIT & MARGINS (Owner's Primary Financial Goal)            */}
      {/* ========================================================================= */}
      {activeTab === 'PROFIT' && (
        <div style={{ background: '#ffffff', borderRadius: '18px', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>
              Shop Profit from Indent
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '3px 0 0' }}>
              Calculated by subtracting KMF Inward Indent Procurement Cost from Shop Retail Selling Price (MRP)
            </p>
          </div>

          {/* 3 Core Profit Metrics Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: '#fff7ed', borderRadius: '14px', padding: '16px', border: '1px solid #fed7aa' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#c2410c', textTransform: 'uppercase' }}>
                1. KMF Inward Indent Cost
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ea580c', marginTop: '4px' }}>
                {formatINR(totals.totalInwardCost)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9a3412', marginTop: '4px' }}>
                {formatUnits(totals.totalInwardQty)} packets purchased from dairy
              </div>
            </div>

            <div style={{ background: '#f0fdf4', borderRadius: '14px', padding: '16px', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>
                2. Shop Retail Value (MRP)
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#16a34a', marginTop: '4px' }}>
                {formatINR(totals.totalPotentialSales)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#15803d', marginTop: '4px' }}>
                Full retail selling price of indent
              </div>
            </div>

            <div style={{ background: '#eff6ff', borderRadius: '14px', padding: '16px', border: '1.5px solid #93c5fd' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase' }}>
                3. Net Shop Profit Expected
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#2563eb', marginTop: '4px' }}>
                +{formatINR(totals.totalPotentialProfit)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#1d4ed8', marginTop: '4px', fontWeight: 800 }}>
                Margin: {totals.totalPotentialSales > 0 ? ((totals.totalPotentialProfit / totals.totalPotentialSales) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>

          {/* Past 7 Days & Monthly Profit Breakdown */}
          {summary && (
            <div style={{
              background: '#f8fafc',
              borderRadius: '14px',
              padding: '16px',
              marginBottom: '20px',
              border: '1px solid #e2e8f0'
            }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#334155', margin: '0 0 10px 0' }}>
                Historical Parlour Profit Summary
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 800 }}>LAST 7 DAYS NET PROFIT</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#16a34a', marginTop: '2px' }}>
                    {formatINR(summary.weekly?.net_weekly_profit || 0)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                    {summary.weekly?.total_days_recorded || 0} days recorded
                  </div>
                </div>

                <div style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 800 }}>THIS MONTH'S TOTAL PROFIT</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0284c7', marginTop: '2px' }}>
                    {formatINR(summary.monthly?.net_monthly_profit || 0)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                    Recorded in {summary.month}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Product Margin Table */}
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#334155', marginBottom: '10px' }}>
              Item-by-Item Profit Breakdown
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Product</th>
                    <th style={{ padding: '8px 10px' }}>Inward Cost</th>
                    <th style={{ padding: '8px 10px' }}>Shop MRP</th>
                    <th style={{ padding: '8px 10px' }}>Profit / Pkt</th>
                    <th style={{ padding: '8px 10px' }}>Ordered Qty</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {items.filter(it => (Number(it.inward_qty) || 0) > 0).map((it, idx) => {
                    const qty = Number(it.inward_qty) || 0;
                    const pPrice = Number(it.purchase_price) || 0;
                    const sPrice = Number(it.selling_price) || 0;
                    const margin = sPrice - pPrice;
                    const marginPct = sPrice > 0 ? ((margin / sPrice) * 100).toFixed(1) : 0;
                    const totalProfit = qty * margin;

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 10px', fontWeight: 700, color: '#1e293b' }}>
                          {it.product_name} {it.item_code}
                        </td>
                        <td style={{ padding: '10px 10px', color: '#64748b' }}>₹{pPrice.toFixed(2)}</td>
                        <td style={{ padding: '10px 10px', fontWeight: 700, color: '#334155' }}>₹{sPrice.toFixed(2)}</td>
                        <td style={{ padding: '10px 10px' }}>
                          <span style={{ color: '#16a34a', fontWeight: 800 }}>+₹{margin.toFixed(2)}</span>
                          <span style={{ fontSize: '0.7rem', color: '#15803d', marginLeft: '4px' }}>({marginPct}%)</span>
                        </td>
                        <td style={{ padding: '10px 10px', fontWeight: 800, color: '#ea580c' }}>{qty} Pkts</td>
                        <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 900, color: '#16a34a' }}>
                          +{formatINR(totalProfit)}
                        </td>
                      </tr>
                    );
                  })}

                  {totals.orderedProductsCount === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                        No items entered in today's indent yet. Enter quantities in the Indent Entry tab to see profit!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: DAY CLOSE & STOCK RECONCILIATION                                   */}
      {/* ========================================================================= */}
      {activeTab === 'CLOSING' && (
        <div style={{ background: '#ffffff', borderRadius: '18px', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>
              Day Close & Stock Reconciliation
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '3px 0 0' }}>
              Count closing stock & carry forward unsold packets as tomorrow's opening stock
            </p>
          </div>

          <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px' }}>Product</th>
                  <th style={{ padding: '8px 10px' }}>Opening</th>
                  <th style={{ padding: '8px 10px' }}>Inward</th>
                  <th style={{ padding: '8px 10px' }}>Closing Leftover</th>
                  <th style={{ padding: '8px 10px' }}>Damage/Leak</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Actual Sold</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const avail = (Number(it.opening_stock) || 0) + (Number(it.inward_qty) || 0);
                  const closing = Number(it.closing_stock) || 0;
                  const damage = Number(it.damaged_qty) || 0;
                  const missing = Number(it.missing_qty) || 0;
                  const sold = Math.max(0, avail - (closing + damage + missing));

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 10px', fontWeight: 700, color: '#1e293b' }}>
                        {it.product_name}
                      </td>
                      <td style={{ padding: '10px 10px', color: '#64748b' }}>{it.opening_stock}</td>
                      <td style={{ padding: '10px 10px', fontWeight: 800, color: '#ea580c' }}>{it.inward_qty}</td>
                      <td style={{ padding: '10px 10px' }}>
                        <input
                          type="number"
                          min="0"
                          value={it.closing_stock === 0 ? '' : it.closing_stock}
                          placeholder="0"
                          onChange={(e) => handleUpdateStockField(idx, 'closing_stock', e.target.value)}
                          style={{
                            width: '60px',
                            padding: '4px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            fontWeight: 700,
                            textAlign: 'center'
                          }}
                        />
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <input
                          type="number"
                          min="0"
                          value={it.damaged_qty === 0 ? '' : it.damaged_qty}
                          placeholder="0"
                          onChange={(e) => handleUpdateStockField(idx, 'damaged_qty', e.target.value)}
                          style={{
                            width: '50px',
                            padding: '4px',
                            border: '1px solid #fca5a5',
                            borderRadius: '6px',
                            fontWeight: 700,
                            textAlign: 'center',
                            color: '#dc2626'
                          }}
                        />
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 900, color: '#16a34a' }}>
                        {sold} Pkts
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={() => handleSaveIndent()}
              disabled={saving}
              style={{
                flex: 1,
                padding: '14px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                fontWeight: 800,
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
            >
              Save Stock Numbers
            </button>

            <button
              type="button"
              onClick={handleCloseDayAndCarryForward}
              disabled={pushing}
              style={{
                flex: 1.5,
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                background: '#0284c7',
                color: 'white',
                fontWeight: 900,
                fontSize: '0.9rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)'
              }}
            >
              {pushing ? 'Closing Day...' : 'Close Day & Carry Forward to Tomorrow'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
