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
  Boxes,
  Bell,
  Phone,
  SlidersHorizontal,
  Home,
  Tag,
  User,
  CreditCard,
  ChevronRight as ChevronRightIcon
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
  
  // Active Navigation View:
  // 'KMF_HOME'           : The KMF Daily Orders dashboard (Images 1 & 2)
  // 'KMF_CHANGE_SUBSCRI' : The KMF Indent Entry screen (Image 4)
  // 'PROFIT_ANALYSIS'    : Comprehensive Shop Profit & Margins analysis
  // 'CLOSING_STOCK'      : Day close & stock carry forward
  const [activeView, setActiveView] = useState('KMF_HOME');
  
  // Subscriptions Modal Sheet State (Image 3)
  const [showSubscriptionsModal, setShowSubscriptionsModal] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);

  // Indent metadata
  const [invoiceNo, setInvoiceNo] = useState('');
  const [supplierName, setSupplierName] = useState('KMF / Nandini Dairy');
  const [parlourName, setParlourName] = useState('SUBRAMANI');
  const [routeCode, setRouteCode] = useState('151(16240)');
  const [customerId, setCustomerId] = useState('S575');
  const [supplierPhone, setSupplierPhone] = useState('7022754524');
  const [securityDeposit, setSecurityDeposit] = useState(100000.0);
  const [totalBalanceDues, setTotalBalanceDues] = useState(35829.79);
  const [crateDeposit, setCrateDeposit] = useState('0');
  const [otherCharges, setOtherCharges] = useState('0');
  const [status, setStatus] = useState('OPEN');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [indentExists, setIndentExists] = useState(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState('09:30 AM');

  // Search & Filter in Change Subscription
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
          // If no items exist yet for today, load the standard KMF template
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
        supplier_name: supplierName,
        crate_deposit_amount: parseFloat(crateDeposit) || 0,
        other_charges: parseFloat(otherCharges) || 0,
        status: 'CLOSED',
        notes,
        items
      });
      await api.post('/indents/push-leftover', { date: currentDate });
      showToast(`Day successfully closed! Stock carried forward to ${formatDisplayDate(nextDate)}`);
      setStatus('CLOSED');
      fetchData(currentDate);
    } catch (err) {
      showToast(err.message || 'Failed to close day and carry forward');
    } finally {
      setPushing(false);
    }
  };

  // Calculated Real-Time Totals
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
        const salesRev = sold * sPrice;
        const potentialFullSales = inward * sPrice;
        const cogs = sold * pPrice;
        const grossMargin = salesRev - cogs;
        const potentialProfit = potentialFullSales - inwardCost;
        const damageVal = damage * pPrice;
        const missingVal = missing * pPrice;
        const netProfit = grossMargin - damageVal - missingVal;

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
        acc.totalSalesRev += salesRev;
        acc.totalPotentialSales += potentialFullSales;
        acc.totalCOGS += cogs;
        acc.totalGrossMargin += grossMargin;
        acc.totalPotentialProfit += potentialProfit;
        acc.totalDamageLoss += damageVal;
        acc.totalMissingLoss += missingVal;
        acc.totalNetProfit += netProfit;

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
        totalPotentialSales: 0,
        totalCOGS: 0,
        totalGrossMargin: 0,
        totalPotentialProfit: 0,
        totalDamageLoss: 0,
        totalMissingLoss: 0,
        totalNetProfit: -(parseFloat(otherCharges) || 0)
      }
    );
  }, [items, otherCharges]);

  // Filtered Items for Change Subscri...
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

  // Format month label for Subscriptions modal (e.g. NOV 2026)
  const monthYearLabel = useMemo(() => {
    try {
      const dt = new Date(currentDate + 'T12:00:00Z');
      return dt.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase();
    } catch {
      return 'NOV 2026';
    }
  }, [currentDate]);

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', paddingBottom: '90px' }}>
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

      {/* Top Application Mode Selector Pill Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: '#ffffff',
        borderRadius: '14px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        marginBottom: '12px',
        gap: '8px',
        overflowX: 'auto',
        scrollbarWidth: 'none'
      }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setActiveView('KMF_HOME')}
            style={{
              padding: '8px 14px',
              borderRadius: '999px',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: 'pointer',
              border: 'none',
              background: activeView === 'KMF_HOME' ? '#ea580c' : '#f1f5f9',
              color: activeView === 'KMF_HOME' ? '#ffffff' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <Home size={15} />
            <span>KMF Daily Orders</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('KMF_CHANGE_SUBSCRI')}
            style={{
              padding: '8px 14px',
              borderRadius: '999px',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: 'pointer',
              border: 'none',
              background: activeView === 'KMF_CHANGE_SUBSCRI' ? '#ea580c' : '#f1f5f9',
              color: activeView === 'KMF_CHANGE_SUBSCRI' ? '#ffffff' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <ShoppingCart size={15} />
            <span>Indent Entry</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('PROFIT_ANALYSIS')}
            style={{
              padding: '8px 14px',
              borderRadius: '999px',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: 'pointer',
              border: 'none',
              background: activeView === 'PROFIT_ANALYSIS' ? '#16a34a' : '#f1f5f9',
              color: activeView === 'PROFIT_ANALYSIS' ? '#ffffff' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <TrendingUp size={15} />
            <span>💰 Shop Profit ({formatINR(totals.totalPotentialProfit)})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('CLOSING_STOCK')}
            style={{
              padding: '8px 14px',
              borderRadius: '999px',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: 'pointer',
              border: 'none',
              background: activeView === 'CLOSING_STOCK' ? '#0284c7' : '#f1f5f9',
              color: activeView === 'CLOSING_STOCK' ? '#ffffff' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <Boxes size={15} />
            <span>Day Close</span>
          </button>
        </div>

        {/* Date Selector in Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => changeDateBy(-1)}
            style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer' }}
          >
            <ChevronLeft size={16} color="#64748b" />
          </button>
          <input
            type="date"
            value={currentDate}
            onChange={(e) => setCurrentDate(e.target.value)}
            style={{
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#334155'
            }}
          />
          <button
            type="button"
            onClick={() => changeDateBy(1)}
            style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer' }}
          >
            <ChevronRight size={16} color="#64748b" />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: KMF DAILY ORDERS DASHBOARD (Images 1 & 2)                          */}
      {/* ========================================================================= */}
      {activeView === 'KMF_HOME' && (
        <div style={{ background: '#f8fafc', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          {/* Authentic KMF Orange Header Bar */}
          <div style={{
            background: '#ea580c',
            color: 'white',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 10px rgba(234, 88, 12, 0.3)'
          }}>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, letterSpacing: '-0.01em', color: '#ffffff' }}>
              Daily Orders
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <div style={{ position: 'relative', cursor: 'pointer' }}>
                <Bell size={22} color="#ffffff" />
                <span style={{
                  position: 'absolute',
                  top: '-3px',
                  right: '-3px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#ef4444',
                  border: '1.5px solid white'
                }} />
              </div>
              <button
                type="button"
                onClick={() => fetchData(currentDate)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ffffff', display: 'flex', alignItems: 'center' }}
                title="Refresh"
              >
                <RefreshCw size={22} className={loading ? 'spin' : ''} />
              </button>
            </div>
          </div>

          <div style={{ padding: '16px' }}>
            {/* Kolar Chikkaballapura Milk Union Welcome Banner */}
            <div style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              borderRadius: '16px',
              padding: '18px 20px',
              color: 'white',
              position: 'relative',
              overflow: 'hidden',
              marginBottom: '16px',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)'
            }}>
              {/* Nandini Brand Badge */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{
                    background: '#ffffff',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '10px'
                  }}>
                    <span style={{ fontWeight: 900, color: '#0369a1', fontSize: '0.85rem' }}>Nandini</span>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>A MILK BRAND</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', opacity: 0.9, fontWeight: 600 }}>Welcome to</div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 900, lineHeight: 1.3, maxWidth: '340px' }}>
                    KOLAR CHIKKABALLAPURA DISTRICT CO-OPERATIVE MILK PRODUCERS SOCIETIES UNION LTD.
                  </div>
                  <div style={{ marginTop: '12px', fontSize: '0.72rem', opacity: 0.85, lineHeight: 1.4, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '8px' }}>
                    <strong>Address:</strong> Kolar Dairy Premises, NH-75, Huthur Post, KOLAR-563102
                  </div>
                </div>

                {/* Decorative Packets Montage */}
                <div style={{
                  width: '95px',
                  height: '95px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Package size={52} color="#ffffff" style={{ opacity: 0.9 }} />
                </div>
              </div>
            </div>

            {/* Profile Card */}
            <div style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
              marginBottom: '14px',
              border: '1px solid #f1f5f9'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: '#f1f5f9',
                  border: '2px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ea580c',
                  flexShrink: 0
                }}>
                  <User size={32} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e293b', margin: '0 0 2px 0' }}>
                    {parlourName}
                  </h2>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                    Customer ID: <strong style={{ color: '#334155' }}>{customerId}</strong>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                    Route: <strong style={{ color: '#334155' }}>{routeCode}</strong>
                  </div>
                </div>
              </div>

              <a
                href={`tel:${supplierPhone}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#ea580c',
                  textDecoration: 'none',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  background: '#fff7ed',
                  border: '1px solid #ffedd5'
                }}
              >
                <Phone size={22} />
                <span style={{ fontSize: '0.72rem', fontWeight: 800 }}>Call Supplier</span>
              </a>
            </div>

            {/* Security Deposit Card */}
            <div style={{
              background: '#ffffff',
              borderRadius: '14px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
              marginBottom: '12px',
              border: '1px solid #f1f5f9'
            }}>
              <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#475569' }}>
                Security Deposit:
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b' }}>
                {formatINR(securityDeposit)}
              </div>
            </div>

            {/* Total Balance (Dues) Card */}
            <div style={{
              background: '#ffffff',
              borderRadius: '14px',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
              marginBottom: '20px',
              border: '1px solid #f1f5f9'
            }}>
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#475569' }}>
                  Total balance(Dues)
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#1e293b', marginTop: '2px' }}>
                  {formatINR(totalBalanceDues)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPayModalOpen(true)}
                style={{
                  background: '#ea580c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 24px',
                  fontSize: '0.92rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(234, 88, 12, 0.35)',
                  letterSpacing: '0.04em'
                }}
              >
                PAY
              </button>
            </div>

            {/* Active Indents Section Header */}
            <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#475569', margin: 0 }}>
                Active Indents
              </h3>
              <span style={{ fontSize: '0.78rem', color: '#ea580c', fontWeight: 700 }}>
                Tap card to view subscriptions
              </span>
            </div>

            {/* Active Indents Card (Opens Subscriptions Modal on Click) */}
            <div
              onClick={() => setShowSubscriptionsModal(true)}
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '18px 20px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
                border: '1.5px solid #fed7aa',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>
                    Delivery Point: <strong style={{ color: '#0f172a' }}>{parlourName}</strong>
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155', marginTop: '4px' }}>
                    Route: <strong style={{ color: '#0f172a' }}>151</strong>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '8px', fontSize: '0.82rem', color: '#64748b' }}>
                    <span>Type: <strong style={{ color: '#334155' }}>AM(TRIP1_DEFAULT)</strong></span>
                    <span>Date: <strong style={{ color: '#334155' }}>{formatDisplayDate(currentDate)}</strong></span>
                  </div>

                  {/* Summary of items in active indent */}
                  <div style={{
                    marginTop: '12px',
                    padding: '8px 12px',
                    background: '#fff7ed',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem'
                  }}>
                    <span style={{ fontWeight: 700, color: '#c2410c' }}>
                      {totals.orderedProductsCount} Products • {formatUnits(totals.totalInwardQty)} Pkts
                    </span>
                    <span style={{ fontWeight: 900, color: '#ea580c', fontSize: '0.95rem' }}>
                      {formatINR(totals.totalInwardCost)}
                    </span>
                  </div>
                </div>

                <div style={{ color: '#ea580c', paddingLeft: '14px' }}>
                  <ChevronRightIcon size={28} />
                </div>
              </div>
            </div>

            {/* Quick Action Button: Edit Subscription / Indent */}
            <div style={{ marginTop: '18px', display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setActiveView('KMF_CHANGE_SUBSCRI')}
                style={{
                  flex: 1,
                  background: '#ea580c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '14px',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(234, 88, 12, 0.3)'
                }}
              >
                <Edit2 size={18} />
                <span>Change Subscription / Enter Indent</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveView('PROFIT_ANALYSIS')}
                style={{
                  flex: 1,
                  background: '#16a34a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '14px',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(22, 163, 74, 0.3)'
                }}
              >
                <TrendingUp size={18} />
                <span>View Shop Profit</span>
              </button>
            </div>
          </div>

          {/* KMF Bottom Navigation Bar */}
          <div style={{
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            marginTop: '16px'
          }}>
            <button
              type="button"
              onClick={() => setActiveView('KMF_HOME')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: activeView === 'KMF_HOME' ? '#ea580c' : '#64748b'
              }}
            >
              <Home size={22} />
              <span style={{ fontSize: '0.72rem', fontWeight: 800 }}>Home</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('KMF_CHANGE_SUBSCRI')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: activeView === 'KMF_CHANGE_SUBSCRI' ? '#ea580c' : '#64748b'
              }}
            >
              <ShoppingCart size={22} />
              <span style={{ fontSize: '0.72rem', fontWeight: 800 }}>Indent</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('PROFIT_ANALYSIS')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: activeView === 'PROFIT_ANALYSIS' ? '#16a34a' : '#64748b'
              }}
            >
              <TrendingUp size={22} />
              <span style={{ fontSize: '0.72rem', fontWeight: 800 }}>Profit</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('CLOSING_STOCK')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: activeView === 'CLOSING_STOCK' ? '#0284c7' : '#64748b'
              }}
            >
              <Boxes size={22} />
              <span style={{ fontSize: '0.72rem', fontWeight: 800 }}>Closing</span>
            </button>

            <button
              type="button"
              onClick={() => showToast(`Agency: ${parlourName} • ID: ${customerId} • Route: ${routeCode}`)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#64748b'
              }}
            >
              <User size={22} />
              <span style={{ fontSize: '0.72rem', fontWeight: 800 }}>My Account</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: KMF "Change Subscri..." INDENT ENTRY SCREEN (Image 4)              */}
      {/* ========================================================================= */}
      {activeView === 'KMF_CHANGE_SUBSCRI' && (
        <div style={{ background: '#ffffff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          {/* Authentic KMF Orange Header Bar */}
          <div style={{
            background: '#ea580c',
            color: 'white',
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 2px 10px rgba(234, 88, 12, 0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button
                type="button"
                onClick={() => setActiveView('KMF_HOME')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ffffff', padding: 0, display: 'flex', alignItems: 'center' }}
              >
                <ChevronLeft size={26} />
              </button>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                Change Subscri...
              </h1>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button
                type="button"
                onClick={() => {
                  const q = prompt('Search product name:', searchQuery);
                  if (q !== null) setSearchQuery(q);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ffffff' }}
                title="Search Product"
              >
                <Search size={22} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextCat = categoryFilter === 'ALL' ? 'MILK' : categoryFilter === 'MILK' ? 'CURD' : 'ALL';
                  setCategoryFilter(nextCat);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ffffff' }}
                title="Filter Category"
              >
                <SlidersHorizontal size={22} />
              </button>
            </div>
          </div>

          {/* Sub-Header Banner */}
          <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                background: '#ffffff',
                border: '1.5px solid #ea580c',
                borderRadius: '999px',
                padding: '2px 8px',
                fontSize: '0.68rem',
                fontWeight: 900,
                color: '#ea580c'
              }}>
                Nandini
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#c2410c' }}>
                {formatDisplayDate(currentDate)} {parlourName}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>
                Route Name : <strong>151</strong>
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155' }}>
                Shift : <strong>AM</strong>
              </div>
            </div>

            {/* Live Total Amount Highlight */}
            <div style={{
              marginTop: '10px',
              fontSize: '1.25rem',
              fontWeight: 900,
              color: '#ea580c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>Total Amount : {formatINR(totals.totalInwardCost)}</span>
              <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 700 }}>
                {formatUnits(totals.totalInwardQty)} Pkts
              </span>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 18px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            overflowX: 'auto',
            scrollbarWidth: 'none'
          }}>
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

          {/* Table Header Row (Matching Image 4) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 2.4fr 1.6fr',
            padding: '10px 18px',
            background: '#e2e8f0',
            fontWeight: 800,
            fontSize: '0.82rem',
            color: '#475569',
            textTransform: 'uppercase',
            letterSpacing: '0.04em'
          }}>
            <div>Category</div>
            <div>Product</div>
            <div style={{ textAlign: 'right' }}>Quantity UOM</div>
          </div>

          {/* Product Items List (Matching Image 4) */}
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {filteredItems.map((it, idx) => {
              const inwardQty = Number(it.inward_qty) || 0;
              const unitPrice = Number(it.purchase_price) || 0;
              const lineTotal = inwardQty * unitPrice;

              return (
                <div
                  key={it.item_code || it.product_name || idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.1fr 2.4fr 1.6fr',
                    padding: '14px 18px',
                    borderBottom: '1px solid #f1f5f9',
                    alignItems: 'center',
                    background: inwardQty > 0 ? '#fffaf5' : '#ffffff'
                  }}
                >
                  {/* Category Column */}
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#64748b' }}>
                    {(it.category || 'MILK').toUpperCase()}
                  </div>

                  {/* Product Column */}
                  <div style={{ paddingRight: '8px' }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.25 }}>
                      {it.product_name} {it.item_code}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px', fontWeight: 600 }}>
                      Unit Price(GST Incl.): <strong style={{ color: '#334155' }}>₹{unitPrice.toFixed(2)}</strong>
                    </div>
                  </div>

                  {/* Quantity UOM & Amount Column (Direct Keyboard + Steppers) */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => handleAdjustItemQty(idx, -1)}
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          color: '#475569',
                          fontWeight: 900,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.85rem'
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
                          fontSize: '1rem',
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
                          width: '26px',
                          height: '26px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          background: '#f8fafc',
                          color: '#475569',
                          fontWeight: 900,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.85rem'
                        }}
                      >
                        +
                      </button>
                    </div>

                    {/* Calculated Line Amount */}
                    <div style={{ fontSize: '0.74rem', color: '#ea580c', fontWeight: 800, marginTop: '4px' }}>
                      Amount: {formatINR(lineTotal)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Docked Solid Orange Submit Button (Matching Image 4) */}
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
                boxShadow: '0 4px 16px rgba(234, 88, 12, 0.4)',
                letterSpacing: '0.04em'
              }}
            >
              {saving ? 'Submitting Indent...' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: SHOP PROFIT & MARGINS ANALYSIS (Owner's primary goal)             */}
      {/* ========================================================================= */}
      {activeView === 'PROFIT_ANALYSIS' && (
        <div style={{ background: '#ffffff', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>
                Shop Profit & Margins Analysis
              </h2>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 0' }}>
                Comparing KMF Inward Procurement Cost vs. Shop Retail Selling Price (MRP)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('KMF_HOME')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Back to Orders
            </button>
          </div>

          {/* Today's 3 Key Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            <div style={{ background: '#fff7ed', borderRadius: '14px', padding: '16px', border: '1px solid #fed7aa' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#c2410c', textTransform: 'uppercase' }}>
                1. KMF Inward Indent Cost
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#ea580c', marginTop: '4px' }}>
                {formatINR(totals.totalInwardCost)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9a3412', marginTop: '4px' }}>
                {formatUnits(totals.totalInwardQty)} packets ordered from KMF
              </div>
            </div>

            <div style={{ background: '#f0fdf4', borderRadius: '14px', padding: '16px', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>
                2. Shop Retail Sales Value (MRP)
              </div>
              <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#16a34a', marginTop: '4px' }}>
                {formatINR(totals.totalPotentialSales)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#15803d', marginTop: '4px' }}>
                Full value when sold in shop / deliveries
              </div>
            </div>

            <div style={{ background: '#eff6ff', borderRadius: '14px', padding: '16px', border: '1.5px solid #93c5fd' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase' }}>
                3. Net Shop Profit Expected
              </div>
              <div style={{ fontSize: '1.55rem', fontWeight: 900, color: '#2563eb', marginTop: '4px' }}>
                +{formatINR(totals.totalPotentialProfit)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#1d4ed8', marginTop: '4px', fontWeight: 700 }}>
                Gross Margin: {totals.totalPotentialSales > 0 ? ((totals.totalPotentialProfit / totals.totalPotentialSales) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>

          {/* Weekly & Monthly Performance (From Backend API) */}
          {summary && (
            <div style={{
              background: '#f8fafc',
              borderRadius: '14px',
              padding: '16px',
              marginBottom: '20px',
              border: '1px solid #e2e8f0'
            }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#334155', margin: '0 0 12px 0' }}>
                Performance Summary (Past 7 Days & Month to Date)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#ffffff', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>LAST 7 DAYS PROFIT</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#16a34a', marginTop: '2px' }}>
                    {formatINR(summary.weekly?.net_weekly_profit || 0)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    {summary.weekly?.total_days_recorded || 0} days recorded
                  </div>
                </div>

                <div style={{ background: '#ffffff', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>THIS MONTH'S TOTAL PROFIT</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0284c7', marginTop: '2px' }}>
                    {formatINR(summary.monthly?.net_monthly_profit || 0)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    {summary.monthly?.total_days_recorded || 0} days recorded in {summary.month}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Item-by-Item Margin Breakdown Table */}
          <div style={{ marginTop: '16px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#334155', marginBottom: '10px' }}>
              Product Margin Breakdown (Ordered Items)
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Product</th>
                    <th style={{ padding: '8px 10px' }}>Inward Cost</th>
                    <th style={{ padding: '8px 10px' }}>Shop MRP</th>
                    <th style={{ padding: '8px 10px' }}>Margin / Pkt</th>
                    <th style={{ padding: '8px 10px' }}>Qty (Pkts)</th>
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
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 4: DAY CLOSE & STOCK RECONCILIATION                                   */}
      {/* ========================================================================= */}
      {activeView === 'CLOSING_STOCK' && (
        <div style={{ background: '#ffffff', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>
                Day Close & Stock Reconciliation
              </h2>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 0' }}>
                Count closing stock & push remaining packets as tomorrow's opening stock
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('KMF_HOME')}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Back to Orders
            </button>
          </div>

          <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px' }}>Product</th>
                  <th style={{ padding: '8px 10px' }}>Opening</th>
                  <th style={{ padding: '8px 10px' }}>Inward</th>
                  <th style={{ padding: '8px 10px' }}>Closing Leftover</th>
                  <th style={{ padding: '8px 10px' }}>Damaged / Leak</th>
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

      {/* ========================================================================= */}
      {/* POPUP MODAL: KMF SUBSCRIPTIONS SUMMARY SHEET (Image 3)                     */}
      {/* ========================================================================= */}
      {showSubscriptionsModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '460px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            animation: 'modalFadeIn 0.2s ease-out'
          }}>
            {/* Modal Month Header */}
            <div style={{
              background: '#f8fafc',
              padding: '14px 20px',
              borderBottom: '1px solid #e2e8f0',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#c2410c', fontWeight: 800 }}>
                Subscriptions
              </div>
              <div style={{
                fontSize: '1.15rem',
                fontWeight: 900,
                color: '#1e293b',
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px'
              }}>
                <button
                  type="button"
                  onClick={() => changeDateBy(-30)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>{monthYearLabel}</span>
                <button
                  type="button"
                  onClick={() => changeDateBy(30)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Subscriptions Content Area */}
            <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569' }}>Route Name : <strong>151</strong></span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569' }}><strong>AM</strong></span>
              </div>

              {/* Table Column Headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2.5fr 1.3fr 1.4fr',
                padding: '8px 0',
                borderBottom: '1px solid #e2e8f0',
                fontSize: '0.8rem',
                fontWeight: 800,
                color: '#64748b'
              }}>
                <div>Product</div>
                <div style={{ textAlign: 'center' }}>Qty UOM</div>
                <div style={{ textAlign: 'right' }}>Total</div>
              </div>

              {/* Total Amount Subheader */}
              <div style={{
                padding: '10px 0',
                fontSize: '1.05rem',
                fontWeight: 900,
                color: '#ea580c',
                borderBottom: '1px solid #f1f5f9'
              }}>
                Total Amount : {formatINR(totals.totalInwardCost)}
              </div>

              {/* Ordered Products Rows (Image 3) */}
              <div style={{ maxHeight: '42vh', overflowY: 'auto' }}>
                {items
                  .filter(it => (Number(it.inward_qty) || 0) > 0)
                  .map((it, idx) => {
                    const qty = Number(it.inward_qty) || 0;
                    const price = Number(it.purchase_price) || 0;
                    const total = qty * price;

                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '2.5fr 1.3fr 1.4fr',
                          padding: '10px 0',
                          borderBottom: '1px solid #f1f5f9',
                          alignItems: 'center',
                          fontSize: '0.85rem'
                        }}
                      >
                        <div style={{ fontWeight: 700, color: '#334155', lineHeight: 1.25 }}>
                          {it.product_name} {it.item_code}
                        </div>
                        <div style={{ textAlign: 'center', color: '#ea580c', fontWeight: 800 }}>
                          {qty} Pkts
                        </div>
                        <div style={{ textAlign: 'right', fontWeight: 700, color: '#334155' }}>
                          ₹{total.toFixed(2)}
                        </div>
                      </div>
                    );
                  })}

                {totals.orderedProductsCount === 0 && (
                  <div style={{ padding: '30px 10px', textAlign: 'center', color: '#94a3b8' }}>
                    No products ordered for {formatDisplayDate(currentDate)}.
                    <div style={{ marginTop: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSubscriptionsModal(false);
                          setActiveView('KMF_CHANGE_SUBSCRI');
                        }}
                        style={{
                          background: '#ea580c',
                          color: 'white',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Enter Indent
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Bottom Buttons (Close & Edit - Matching Image 3) */}
            <div style={{
              display: 'flex',
              gap: '12px',
              padding: '16px 20px',
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0'
            }}>
              <button
                type="button"
                onClick={() => setShowSubscriptionsModal(false)}
                style={{
                  flex: 1,
                  background: '#ffffff',
                  border: '1.5px solid #ea580c',
                  color: '#ea580c',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '0.92rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSubscriptionsModal(false);
                  setActiveView('KMF_CHANGE_SUBSCRI');
                }}
                style={{
                  flex: 1,
                  background: '#ea580c',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '0.92rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(234, 88, 12, 0.3)'
                }}
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK PAY MODAL */}
      {payModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '420px',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            textAlign: 'center'
          }}>
            <CreditCard size={42} color="#ea580c" style={{ marginBottom: '10px' }} />
            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', margin: '0 0 6px 0' }}>
              Pay Supplier Dues
            </h3>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ea580c', margin: '10px 0' }}>
              {formatINR(totalBalanceDues)}
            </div>
            <p style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.4, margin: '0 0 20px 0' }}>
              Transfer directly to KMF Kolar Chikkaballapura District Co-operative Milk Producers Union.
              UPI / Bank transfer details will be generated.
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setPayModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayModalOpen(false);
                  showToast('Payment initiated via UPI/Bank!');
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#ea580c',
                  color: 'white',
                  fontWeight: 900,
                  cursor: 'pointer'
                }}
              >
                Proceed to Pay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
