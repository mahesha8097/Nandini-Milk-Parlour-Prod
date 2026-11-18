import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, ChevronRight, ChevronDown, Download, Printer, 
  CheckCircle2, Clock, AlertCircle, Calendar, CreditCard, 
  Smartphone, Share2, Milk, MapPin, Phone
} from 'lucide-react';
import html2canvas from 'html2canvas';

export default function CustomerStatementView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedDates, setExpandedDates] = useState({});
  const [capturing, setCapturing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [activeTab, setActiveTab] = useState('history'); // 'history' | 'upcoming'
  const invoiceRef = useRef(null);
  const cleanInvoiceRef = useRef(null);

  // Parse URL hash or query params
  // E.g. #statement?c=12&m=2026-10 or #orders?c=12&m=2026-10
  const getParams = () => {
    let hash = window.location.hash || '';
    if (hash.includes('?')) {
      hash = hash.split('?')[1];
    } else {
      hash = window.location.search ? window.location.search.slice(1) : '';
    }
    const params = new URLSearchParams(hash);
    return {
      customerId: params.get('c') || params.get('customer_id') || '',
      month: params.get('m') || params.get('month') || '',
      billId: params.get('b') || params.get('bill_id') || ''
    };
  };

  const fetchStatement = async (cId, mStr, bId) => {
    try {
      setLoading(true);
      setError(null);
      const url = `/api/public/statement?c=${encodeURIComponent(cId || '')}&m=${encodeURIComponent(mStr || '')}&b=${encodeURIComponent(bId || '')}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to load delivery statement');
      }
      setData(json);
      setSelectedMonth(json.month);
    } catch (err) {
      console.error('Fetch statement error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const { customerId, month, billId } = getParams();
    if (!customerId && !billId) {
      setError('Invalid or incomplete statement link. Please use the link provided on WhatsApp.');
      setLoading(false);
      return;
    }
    fetchStatement(customerId, month, billId);
  }, []);

  const handleMonthChange = (e) => {
    const newMonth = e.target.value;
    setSelectedMonth(newMonth);
    const { customerId } = getParams();
    fetchStatement(customerId, newMonth, '');
  };

  const toggleDate = (dateStr) => {
    setExpandedDates(prev => ({
      ...prev,
      [dateStr]: !prev[dateStr]
    }));
  };

  const handleDownloadInvoice = async () => {
    const targetElement = cleanInvoiceRef.current || invoiceRef.current;
    if (!targetElement) return;
    try {
      setCapturing(true);
      const canvas = await html2canvas(targetElement, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        onclone: (clonedDoc) => {
          const cleanEl = clonedDoc.getElementById('clean-printable-invoice');
          if (cleanEl) {
            cleanEl.style.position = 'static';
            cleanEl.style.left = 'auto';
            cleanEl.style.top = 'auto';
            cleanEl.style.opacity = '1';
            cleanEl.style.display = 'block';
            cleanEl.style.width = '800px';
          }
          const webView = clonedDoc.querySelector('.statement-web-preview');
          if (webView) {
            webView.style.display = 'none';
          }
        }
      });
      const customerClean = (customer?.name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
      const periodClean = (data?.periodLabel || bill?.billingMonth || selectedMonth || 'statement').replace(/[^a-zA-Z0-9]/g, '_');
      const link = document.createElement('a');
      link.download = `Invoice_${customerClean}_${periodClean}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Download error:', err);
      alert('Could not download invoice: ' + err.message);
    } finally {
      setCapturing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#000000',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid #334155',
          borderTopColor: '#38bdf8',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <div style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0' }}>
          Loading your milk delivery statement...
        </div>
        <style>{`
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#000000',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: '#1f1315',
          border: '1px solid #ef4444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px'
        }}>
          <AlertCircle size={32} color="#ef4444" />
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px', color: '#ffffff' }}>
          Delivery Statement Unavailable
        </h2>
        <p style={{ color: '#94a3b8', maxWidth: '400px', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '24px' }}>
          {error || 'Unable to find delivery records for this link.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            backgroundColor: '#0284c7',
            color: '#ffffff',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  const { customer, parlour, bill, summary, days, availableBills, payments, subscriptions } = data;
  const isPrepaid = (data.billingType === 'PREPAID' || (summary && summary.billingType === 'PREPAID'));
  const isWeekly = Boolean(data.isWeekly || (bill && bill.billingType === 'WEEKLY') || customer?.billingType === 'WEEKLY');
  const monthBillValue = (bill ? Number(bill.grossAmount) : Number(summary.monthBillGross || summary.totalDeliveryAmount || 0));
  const advanceSettledValue = (bill ? Number(bill.advanceAdjusted) : Number(summary.advanceAdjusted || 0));
  const netPayableValue = (bill ? Number(bill.netPayable) : (summary.netPayable !== undefined ? Number(summary.netPayable) : Math.max(0, monthBillValue - advanceSettledValue)));
  const isPaid = (bill && (bill.status === 'PAID' || bill.status === 'ADVANCE_PAID')) ||
                 (bill && bill.status !== 'PENDING' && netPayableValue === 0) ||
                 (!bill && netPayableValue === 0 && Number(customer?.pendingBalance || 0) === 0);

  const upiLink = parlour.upiId
    ? `upi://pay?pa=${encodeURIComponent(parlour.upiId)}&pn=${encodeURIComponent(parlour.businessName)}&am=${encodeURIComponent(netPayableValue || 0)}&cu=INR`
    : null;

  const todayStr = data.todayStr || (new Date().toISOString().slice(0, 10));
  const yDate = new Date(todayStr + 'T12:00:00Z');
  yDate.setUTCDate(yDate.getUTCDate() - 1);
  const yesterdayStr = yDate.toISOString().slice(0, 10);

  // Group days into Live / History (today and past) and Upcoming (future)
  const historyDays = (days || []).filter(d => d.date <= todayStr);
  // Sort history days descending so TODAY is first at index 0, YESTERDAY is index 1
  historyDays.sort((a, b) => b.date.localeCompare(a.date));

  const upcomingDays = (days || []).filter(d => d.date > todayStr);
  // Sort upcoming days ascending so tomorrow is first
  upcomingDays.sort((a, b) => a.date.localeCompare(b.date));

  // For the printable / downloadable invoice, show all days in natural chronological order (Day 1 to Day 30)
  const printableDays = [...(days || [])].sort((a, b) => a.date.localeCompare(b.date));

  // Select days to display in current tab
  const displayDays = (activeTab === 'upcoming' && upcomingDays.length > 0) ? upcomingDays : historyDays;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#000000',
      color: '#ffffff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      paddingBottom: '60px'
    }}>
      <style>{`
        @media print {
          body, html {
            background-color: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          header, .no-print, .no-download, .statement-web-preview {
            display: none !important;
          }
          .printable-clean-invoice {
            display: block !important;
            position: static !important;
            left: auto !important;
            top: auto !important;
            opacity: 1 !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 8px 12px !important;
            margin: 0 auto !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            color: #0f172a !important;
          }
          .printable-clean-invoice table {
            page-break-inside: auto;
          }
          .printable-clean-invoice tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          @page {
            size: portrait;
            margin: 8mm 10mm;
          }
        }
        @media screen {
          .printable-clean-invoice {
            position: fixed;
            left: -9999px;
            top: 0;
            width: 800px;
            min-width: 800px;
            background: #ffffff;
            opacity: 0;
            pointer-events: none;
            z-index: -9999;
          }
        }
      `}</style>

      {/* Online Web Preview for Customer (Retained exactly as before) */}
      <div className="statement-web-preview">
      {/* Top Mobile Bar matching user's screenshot */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: '#000000',
        borderBottom: '1px solid #1e293b',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button 
            onClick={() => window.history.back()}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              padding: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Back"
          >
            <ArrowLeft size={22} color="#ffffff" />
          </button>
          <h1 style={{
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: '#ffffff'
          }}>
            My Orders
          </h1>
        </div>

        {/* Invoice / Month Filter Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {availableBills && availableBills.length > 1 ? (
            <select
              value={bill ? bill.id : ''}
              onChange={(e) => {
                const bId = e.target.value;
                const chosen = availableBills.find(x => String(x.id) === String(bId));
                if (chosen) {
                  fetchStatement(customer.id, chosen.period || chosen.billingMonth, chosen.id);
                }
              }}
              style={{
                backgroundColor: '#0f172a',
                color: '#38bdf8',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                maxWidth: '220px'
              }}
            >
              {availableBills.map(b => (
                <option key={b.id} value={b.id}>
                  {b.period || b.billNumber} ({b.status === 'PAID' ? '✓ Paid' : `₹${b.netPayable}`})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="month"
              value={selectedMonth}
              onChange={handleMonthChange}
              style={{
                backgroundColor: '#0f172a',
                color: '#38bdf8',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            />
          )}
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '16px' }}>
        
        {/* Available Invoices / Weeks Pill Bar (if multiple bills available) */}
        {availableBills && availableBills.length > 1 && (
          <div style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '12px',
            marginBottom: '8px',
            scrollbarWidth: 'none'
          }}>
            {availableBills.map(b => {
              const isActive = bill && bill.id === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => fetchStatement(customer.id, b.period || b.billingMonth, b.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    border: `1px solid ${isActive ? '#38bdf8' : '#334155'}`,
                    backgroundColor: isActive ? 'rgba(56, 189, 248, 0.18)' : '#0f172a',
                    color: isActive ? '#38bdf8' : '#94a3b8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>{b.period || b.billNumber}</span>
                  <span style={{
                    fontSize: '0.68rem',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    backgroundColor: b.status === 'PAID' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                    color: b.status === 'PAID' ? '#4ade80' : '#facc15'
                  }}>
                    {b.status === 'PAID' ? '✓ PAID' : `₹${b.netPayable}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        
        {/* Printable/Savable Statement Summary Card with Date-Wise Delivered Products */}
        <div 
          id="full-customer-invoice"
          ref={invoiceRef}
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #1e293b',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '20px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
          }}
        >
          {/* Parlour & Customer Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '1px solid #1e293b',
            paddingBottom: '16px',
            marginBottom: '16px'
          }}>
            <div>
              <div style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#38bdf8',
                fontWeight: 800,
                marginBottom: '4px'
              }}>
                {parlour.businessName}
              </div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>
                {customer.name}
              </h2>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={13} color="#64748b" />
                <span>{customer.flatNo ? `Flat ${customer.flatNo}, ` : ''}{customer.address || customer.route || 'Bangalore'}</span>
              </div>
              {(data.periodLabel || isWeekly) && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  color: '#38bdf8',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  marginTop: '8px'
                }}>
                  <Calendar size={12} color="#38bdf8" />
                  <span>{data.periodLabel || bill?.billingMonth}{isWeekly ? ' (Weekly Invoice)' : ''}</span>
                </div>
              )}
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{
                display: 'inline-block',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
                backgroundColor: isPaid ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                color: isPaid ? '#4ade80' : '#facc15',
                border: `1px solid ${isPaid ? '#22c55e' : '#eab308'}`
              }}>
                {isPaid ? 'PAID ✓' : (bill ? 'PAYMENT DUE' : (isPrepaid ? 'PREPAID PLAN' : 'DELIVERIES STATEMENT'))}
              </span>
              {bill && (
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>
                  Inv #{bill.billNumber}
                </div>
              )}
            </div>
          </div>

          {/* Key Figures Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            backgroundColor: '#141414',
            borderRadius: '10px',
            padding: '14px',
            border: '1px solid #262626',
            marginBottom: '16px'
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                {isPrepaid ? 'Scheduled Days' : 'Delivered Days'}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                {isPrepaid ? (summary.totalScheduledDays || summary.totalDeliveredDays || 0) : (summary.totalDeliveredDays || 0)}{' '}
                <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>days</span>
              </div>
              {isPrepaid && summary.totalDeliveredDays > 0 && (
                <div style={{ fontSize: '0.68rem', color: '#4ade80', marginTop: '2px', fontWeight: 600 }}>
                  {summary.totalDeliveredDays} delivered so far
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                {isPrepaid ? 'Scheduled Items' : 'Total Items'}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                {isPrepaid ? (summary.totalScheduledItems || summary.totalItemsCount || 0) : (summary.totalDeliveredItems || summary.totalItemsCount || 0)}{' '}
                <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b' }}>pkts</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                {isWeekly ? 'Weekly Bill' : (isPrepaid ? 'Month Bill (Advance)' : 'Month Bill')}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
                ₹{monthBillValue.toFixed(2)}
              </div>
              {summary.deliveryChargesTotal > 0 && (
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '2px', fontWeight: 600 }}>
                  Includes ₹{summary.deliveryChargesTotal.toFixed(2)} delivery
                </div>
              )}
            </div>
          </div>

          {/* Advance & Net Payable Breakdown */}
          {(advanceSettledValue > 0 || netPayableValue !== undefined) && (
            <div style={{
              backgroundColor: '#000000',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '12px 14px',
              marginBottom: '16px',
              fontSize: '0.85rem'
            }}>
              {advanceSettledValue > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4ade80', marginBottom: '6px', fontWeight: 700 }}>
                  <span>Advance Settled:</span>
                  <span>- ₹{advanceSettledValue.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '0.95rem', color: '#ffffff' }}>
                <span>Net Payable:</span>
                <span style={{ color: netPayableValue === 0 ? '#4ade80' : '#38bdf8' }}>
                  ₹{netPayableValue.toFixed(2)} {netPayableValue === 0 ? '(All Clear ✓)' : ''}
                </span>
              </div>
            </div>
          )}

          {/* Scheduled Deliveries Summary (Clean, concise subscription info) */}
          {((subscriptions && subscriptions.length > 0) || (bill && bill.items && bill.items.length > 0)) && (
            <div style={{
              backgroundColor: '#141414',
              border: '1px solid #262626',
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '16px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
                borderBottom: '1px solid #262626',
                paddingBottom: '8px'
              }}>
                <div style={{
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#38bdf8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <Calendar size={15} color="#38bdf8" />
                  <span>Scheduled Deliveries</span>
                </div>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: '#4ade80',
                  backgroundColor: 'rgba(34, 197, 94, 0.12)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  padding: '2px 8px',
                  borderRadius: '4px'
                }}>
                  {isPrepaid ? 'Monthly Plan' : 'Active Subscription'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(subscriptions && subscriptions.length > 0 ? subscriptions : (bill?.items || [])).map((sub, sIdx) => {
                  const qty = sub.quantity || sub.quantityPerDay || 1;
                  const name = sub.productName || sub.name;
                  const variant = sub.variantLabel || sub.variant;
                  const price = sub.unitPrice || sub.sellingPrice;
                  const freq = sub.frequency === 'DAILY' || !sub.frequency ? 'Daily' : sub.frequency;

                  return (
                    <div key={sIdx} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.85rem',
                      color: '#ffffff'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1rem' }}>🥛</span>
                        <div>
                          <span style={{ fontWeight: 700 }}>{qty}x {name}</span>
                          {variant && (
                            <span style={{ fontSize: '0.74rem', color: '#94a3b8', marginLeft: '6px' }}>
                              ({variant})
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, textAlign: 'right' }}>
                        <span>{freq}</span>
                        {price ? <span style={{ color: '#cbd5e1', marginLeft: '4px' }}>• ₹{Number(price).toFixed(2)}</span> : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Buttons (Excluded from downloaded PNG and printed paper) */}
          <div className="no-print no-download" data-html2canvas-ignore="true" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
            <button
              onClick={handleDownloadInvoice}
              disabled={capturing}
              style={{
                flex: '1 1 140px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 14px',
                backgroundColor: '#1e293b',
                color: '#ffffff',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              <Download size={16} color="#38bdf8" />
              <span>{capturing ? 'Saving...' : 'Download Invoice'}</span>
            </button>

            <button
              onClick={handlePrint}
              style={{
                flex: '1 1 120px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 14px',
                backgroundColor: '#1e293b',
                color: '#ffffff',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              <Printer size={16} color="#94a3b8" />
              <span>Print</span>
            </button>

            {upiLink && !isPaid && (
              <a
                href={upiLink}
                style={{
                  flex: '2 1 200px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  textDecoration: 'none',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                <Smartphone size={16} color="#ffffff" />
                <span>Pay via UPI (GPay/PhonePe)</span>
              </a>
            )}
          </div>

          {/* Payment Records Section (Inside printable/downloadable invoice) */}
          {payments && payments.length > 0 && (
            <div style={{
              backgroundColor: '#141414',
              border: '1px solid #1e293b',
              borderRadius: '12px',
              padding: '12px 16px',
              marginTop: '16px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px'
              }}>
                <div style={{
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#4ade80',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <CheckCircle2 size={15} color="#4ade80" />
                  <span>Payment Records ({payments.length})</span>
                </div>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                  Official Receipts
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {payments.map(p => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: '#0a0a0a',
                      border: '1px solid #262626',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '0.82rem'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, color: '#ffffff' }}>
                        {p.receiptNumber}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        {p.paymentDate} • Paid via {p.paymentMethod}{p.referenceNumber ? ` • Ref: ${p.referenceNumber}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: '#4ade80' }}>
                        ₹{Number(p.amount).toFixed(2)}
                      </div>
                      <span style={{
                        display: 'inline-block',
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        color: '#22c55e'
                      }}>
                        RECEIVED ✓
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parlour Support & Contact Footer (Inside printable/downloadable invoice) */}
          <div style={{
            marginTop: '20px',
            paddingTop: '12px',
            borderTop: '1px solid #1e293b',
            textAlign: 'center',
            fontSize: '0.76rem',
            color: '#94a3b8'
          }}>
            <div style={{ fontWeight: 800, color: '#ffffff' }}>
              {parlour.businessName}
            </div>
            <div>For delivery queries or updates, contact {parlour.phone || '7022754524'}</div>
            <div style={{ marginTop: '2px', color: '#64748b' }}>
              {parlour.invoiceFooter || 'Thank you for choosing Nandini Milk! Pure & Fresh.'}
            </div>
          </div>
        </div>

        {/* Section Heading & View Selector */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          padding: '0 4px',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '0.82rem',
                fontWeight: 800,
                border: activeTab === 'history' ? '1.5px solid #38bdf8' : '1px solid #334155',
                backgroundColor: activeTab === 'history' ? 'rgba(56, 189, 248, 0.16)' : '#0f172a',
                color: activeTab === 'history' ? '#38bdf8' : '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🚚 Live Deliveries & History</span>
              <span style={{
                fontSize: '0.7rem',
                padding: '1px 6px',
                borderRadius: '10px',
                backgroundColor: activeTab === 'history' ? '#38bdf8' : '#334155',
                color: activeTab === 'history' ? '#000000' : '#ffffff',
                fontWeight: 800
              }}>
                {historyDays.length}
              </span>
            </button>

            {upcomingDays.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('upcoming')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  border: activeTab === 'upcoming' ? '1.5px solid #38bdf8' : '1px solid #334155',
                  backgroundColor: activeTab === 'upcoming' ? 'rgba(56, 189, 248, 0.16)' : '#0f172a',
                  color: activeTab === 'upcoming' ? '#38bdf8' : '#94a3b8',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🗓️ Upcoming</span>
                <span style={{
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  backgroundColor: activeTab === 'upcoming' ? '#38bdf8' : '#334155',
                  color: activeTab === 'upcoming' ? '#000000' : '#ffffff',
                  fontWeight: 800
                }}>
                  {upcomingDays.length}
                </span>
              </button>
            )}
          </div>

          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Tap any date to view items & timing
          </span>
        </div>

        {/* Daily Deliveries List — Exact Visual Match to User Screenshot */}
        <div style={{
          backgroundColor: '#000000',
          border: '1px solid #141414',
          borderRadius: '12px',
          overflow: 'hidden'
        }}>
          {displayDays.length === 0 ? (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '0.9rem'
            }}>
              {activeTab === 'upcoming' ? 'No upcoming scheduled deliveries for the rest of this month.' : 'No delivery records found for this month.'}
            </div>
          ) : (
            displayDays.map((day, idx) => {
              const isExpanded = !!expandedDates[day.date];
              const isDelivered = day.status === 'DELIVERED';
              const isSkipped = day.status === 'SKIPPED';
              const isScheduled = day.status === 'SCHEDULED';
              const isToday = day.date === todayStr;
              const isYesterday = day.date === yesterdayStr;

              if (isSkipped) {
                return (
                  <div 
                    key={day.date}
                    style={{
                      borderBottom: idx === displayDays.length - 1 ? 'none' : '1px solid #1a1a1a',
                      padding: '12px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: isToday ? 'rgba(239, 68, 68, 0.06)' : '#050505',
                      opacity: isToday ? 1 : 0.75,
                      borderLeft: isToday ? '3px solid #ef4444' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {isToday && (
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 900,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          backgroundColor: '#ef4444',
                          color: '#ffffff',
                          letterSpacing: '0.04em'
                        }}>
                          TODAY
                        </span>
                      )}
                      {isYesterday && (
                        <span style={{
                          fontSize: '0.65rem',
                          fontWeight: 800,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: '#1e293b',
                          color: '#94a3b8'
                        }}>
                          YESTERDAY
                        </span>
                      )}
                      <span style={{ fontSize: '0.92rem', fontWeight: 600, color: '#94a3b8' }}>
                        {day.formattedDate || day.date}
                      </span>
                      <span style={{
                        fontSize: '0.65rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: '#27272a',
                        color: '#a1a1aa',
                        fontWeight: 800,
                        letterSpacing: '0.04em'
                      }}>
                        PAUSED / SKIP
                      </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                      No delivery
                    </span>
                  </div>
                );
              }

              return (
                <div 
                  key={day.date}
                  style={{
                    borderBottom: idx === displayDays.length - 1 ? 'none' : '1px solid #1a1a1a',
                    borderLeft: isToday ? '3px solid #38bdf8' : (isYesterday ? '3px solid #334155' : 'none'),
                    backgroundColor: isToday ? 'rgba(56, 189, 248, 0.04)' : 'transparent',
                    transition: 'background-color 0.15s ease'
                  }}
                >
                  <div
                    onClick={() => toggleDate(day.date)}
                    style={{
                      padding: '14px 18px',
                      cursor: 'pointer',
                      userSelect: 'none',
                      backgroundColor: isExpanded ? '#0a0a0a' : 'transparent'
                    }}
                  >
                    {/* Date label & timing */}
                    <div style={{
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {isToday && (
                          <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 900,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: '#0284c7',
                            color: '#ffffff',
                            letterSpacing: '0.05em'
                          }}>
                            TODAY
                          </span>
                        )}
                        {isYesterday && (
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: '#1e293b',
                            color: '#38bdf8',
                            border: '1px solid #334155'
                          }}>
                            YESTERDAY
                          </span>
                        )}
                        <span>{day.formattedDate || day.date}</span>
                        {isScheduled && !isToday && (
                          <span style={{
                            fontSize: '0.65rem',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(56, 189, 248, 0.15)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            fontWeight: 700
                          }}>
                            SCHEDULED
                          </span>
                        )}
                      </div>

                      {/* Delivered time of milk or Pending */}
                      {isDelivered ? (
                        <div style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: '#4ade80',
                          backgroundColor: 'rgba(34, 197, 94, 0.12)',
                          border: '1px solid rgba(34, 197, 94, 0.25)',
                          padding: '3px 9px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          <Clock size={12} color="#4ade80" />
                          <span>{day.deliveredTime ? `Delivered at ${day.deliveredTime}` : 'Delivered ✓'}</span>
                        </div>
                      ) : (
                        isToday ? (
                          <div style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: '#facc15',
                            backgroundColor: 'rgba(234, 179, 8, 0.12)',
                            border: '1px solid rgba(234, 179, 8, 0.25)',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}>
                            <Clock size={11} color="#facc15" />
                            <span>⏳ Pending Delivery</span>
                          </div>
                        ) : null
                      )}
                    </div>

                    {/* Subline: Product badges & Total Amount */}
                    <div style={{
                      marginTop: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {day.items && day.items.map((it, itmIdx) => (
                          <span
                            key={itmIdx}
                            style={{
                              background: 'rgba(56, 189, 248, 0.08)',
                              border: '1px solid rgba(56, 189, 248, 0.2)',
                              color: '#93c5fd',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '4px'
                            }}
                          >
                            🥛 {it.quantity}x {it.productName} {it.variantLabel ? `(${it.variantLabel})` : ''}
                          </span>
                        ))}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ color: '#ffffff', fontWeight: 800, fontSize: '0.92rem' }}>
                            ₹{day.totalAmount.toFixed(2)}
                          </span>
                          {day.deliveryCharge > 0 && (
                            <span style={{ fontSize: '0.68rem', color: '#64748b', marginLeft: '4px' }}>
                              (incl. ₹{day.deliveryCharge.toFixed(2)} del.)
                            </span>
                          )}
                        </div>
                        <div style={{ color: '#0284c7' }}>
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Item Breakdown */}
                  {isExpanded && day.items && day.items.length > 0 && (
                    <div style={{
                      backgroundColor: '#0a0a0a',
                      padding: '12px 18px 16px 18px',
                      borderTop: '1px solid #1f1f1f'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {day.items.map((item, itemIdx) => (
                          <div 
                            key={item.id || itemIdx}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '10px 12px',
                              backgroundColor: '#141414',
                              borderRadius: '8px',
                              border: '1px solid #262626'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '8px',
                                backgroundColor: '#1e293b',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                <Milk size={18} color="#38bdf8" />
                              </div>
                              <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ffffff' }}>
                                  {item.productName}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                                  {item.variantLabel} • Qty: <strong style={{ color: '#ffffff' }}>{item.quantity}</strong> × ₹{Number(item.unitPrice || 0).toFixed(2)}
                                  {item.deliveryCharge > 0 ? ` (+₹${Number(item.deliveryCharge).toFixed(2)} delivery)` : ''}
                                </div>
                                {(item.deliveredTime || day.deliveredTime) && (
                                  <div style={{ fontSize: '0.72rem', color: '#4ade80', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                    <Clock size={11} color="#4ade80" />
                                    <span>Delivered at {item.deliveredTime || day.deliveredTime}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff' }}>
                                ₹{Number(item.totalAmount || (item.quantity * item.unitPrice)).toFixed(2)}
                              </div>
                              <span style={{
                                display: 'inline-block',
                                marginTop: '4px',
                                fontSize: '0.65rem',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: item.status === 'DELIVERED' ? 'rgba(34, 197, 94, 0.15)' : (item.status === 'SCHEDULED' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(234, 179, 8, 0.15)'),
                                color: item.status === 'DELIVERED' ? '#4ade80' : (item.status === 'SCHEDULED' ? '#38bdf8' : '#facc15')
                              }}>
                                {item.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Parlour Contact & Help Footer */}
        <div style={{
          marginTop: '30px',
          padding: '16px',
          backgroundColor: '#0a0a0a',
          borderRadius: '12px',
          border: '1px solid #1a1a1a',
          textAlign: 'center',
          fontSize: '0.8rem',
          color: '#94a3b8'
        }}>
          <div style={{ fontWeight: 700, color: '#ffffff', marginBottom: '4px' }}>
            {parlour.businessName}
          </div>
          <div>For delivery queries or updates, contact {parlour.phone}</div>
          <div style={{ marginTop: '4px', color: '#64748b' }}>
            {parlour.invoiceFooter}
          </div>
        </div>

      </main>
      </div> {/* End statement-web-preview */}

      {/* ========================================================================= */}
      {/* CLEAN PROFESSIONAL WHITE INVOICE TEMPLATE (FOR DOWNLOAD PNG & PRINTING)   */}
      {/* Matches the Bill Generation Invoice Template with Date-Wise Delivery rows  */}
      {/* ========================================================================= */}
      <div
        ref={cleanInvoiceRef}
        id="clean-printable-invoice"
        className="printable-clean-invoice"
        style={{
          width: '800px',
          minWidth: '800px',
          maxWidth: '800px',
          background: '#ffffff',
          color: '#1e293b',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '0.813rem',
          lineHeight: '1.4',
          padding: '24px 28px',
          boxSizing: 'border-box',
          margin: '0 auto',
          border: '1px solid #cbd5e1',
          borderRadius: '8px'
        }}
      >
        {/* Top Heading */}
        <div style={{ textAlign: 'center', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
          <span style={{ fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.12em', color: '#0054a6', textTransform: 'uppercase' }}>
            INVOICE
          </span>
        </div>

        {/* Business Header & Invoice Meta */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '12px', borderBottom: '2px solid #0054a6', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {parlour.logo && (
              <div style={{
                width: '56px',
                height: '56px',
                background: 'white',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '3px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <img
                  src={parlour.logo}
                  alt="Business Logo"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            )}
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0054a6', margin: 0, textTransform: 'uppercase' }}>
                {parlour.businessName || 'SS AGENCY [NANDINI MILK PARLOUR]'}
              </h1>
              <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '3px', maxWidth: '440px' }}>
                {parlour.address && `${parlour.address}, `}{parlour.state || 'Karnataka'} {parlour.pincode && `- ${parlour.pincode}`}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                {parlour.phone && `Phone: ${parlour.phone}`} {parlour.email && ` | Email: ${parlour.email}`}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>
              Invoice No: <span style={{ color: '#0054a6' }}>{bill?.billNumber || `NB-${(bill?.billingMonth || selectedMonth || '202611').replace('-', '')}-${String(customer.id).padStart(4, '0')}`}</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
              Date: <strong>{bill?.billDate || (selectedMonth ? `${selectedMonth}-01` : '2026-11-01')}</strong>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
              Month: <strong>{bill?.billingMonth || selectedMonth}</strong>
            </div>
            <div style={{ marginTop: '4px' }}>
              <span style={{
                display: 'inline-block',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '0.7rem',
                fontWeight: 800,
                background: isPaid ? '#dcfce7' : '#fee2e2',
                color: isPaid ? '#15803d' : '#b91c1c',
                border: `1px solid ${isPaid ? '#86efac' : '#fca5a5'}`
              }}>
                {isPaid ? 'PAID' : 'PENDING'}
              </span>
            </div>
          </div>
        </div>

        {/* Customer & Delivery Information */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>BILL TO:</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>{customer.name}</div>
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>Contact: {customer.phone}</div>
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>Address: {customer.flatNo ? `Flat ${customer.flatNo}, ` : ''}{customer.address || customer.route || 'Bangalore'}</div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>DELIVERY DETAILS:</div>
            <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
              Route: <strong>{customer.route || 'Route 2'}</strong>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
              Category: <strong>{customer.category === 'BULK_HOTEL' ? 'Bulk / Commercial' : 'Household'}</strong>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
              Plan: <strong>{isPrepaid ? 'Prepaid (Advance)' : (isWeekly ? 'Weekly' : 'Postpaid')}</strong>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
              Schedule: <strong style={{ color: '#0054a6' }}>{summary.totalScheduledDays || summary.totalDeliveredDays || days.length} Scheduled Days</strong>
              {summary.totalDeliveredDays > 0 ? ` (Delivered ${summary.totalDeliveredDays} days)` : ''}
            </div>
          </div>
        </div>

        {/* Date-Wise Delivered Products Schedule Table */}
        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0054a6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              DATE-WISE DELIVERED PRODUCTS SCHEDULE
            </div>
            <span style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 800, background: '#eff6ff', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
              {summary.totalDeliveredDays || days.filter(d => d.status === 'DELIVERED').length} Delivered Days
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '6px 8px', textAlign: 'center', width: '30px' }}>#</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', width: '150px' }}>DATE</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>PRODUCT DELIVERED</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', width: '70px' }}>QUANTITY</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', width: '75px' }}>RATE (₹)</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', width: '85px' }}>AMOUNT (₹)</th>
              </tr>
            </thead>
            <tbody>
              {printableDays.map((day, idx) => {
                const isSkipped = day.status === 'SKIPPED';
                const isDelivered = day.status === 'DELIVERED';
                const hasItems = day.items && day.items.length > 0;

                if (!hasItems || (isSkipped && day.totalItems === 0)) {
                  return (
                    <tr key={day.date} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', color: '#94a3b8' }}>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ padding: '4px 8px', fontWeight: 600 }}>{day.formattedDate || day.date}</td>
                      <td style={{ padding: '4px 8px', fontStyle: 'italic', color: '#94a3b8' }}>Delivery Paused / Skipped</td>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>0 pkts</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>—</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>0.00</td>
                    </tr>
                  );
                }

                return day.items.map((it, itIdx) => (
                  <tr key={`${day.date}-${itIdx}`} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ padding: '4px 8px', textAlign: 'center', color: '#64748b' }}>{itIdx === 0 ? idx + 1 : ''}</td>
                    <td style={{ padding: '4px 8px', fontWeight: 700, color: '#0f172a' }}>
                      {itIdx === 0 ? (
                        <div>
                          <span>{day.formattedDate || day.date}</span>
                          {day.deliveredTime && (
                            <span style={{ fontSize: '0.65rem', color: '#16a34a', fontWeight: 700, marginLeft: '4px' }}>
                              ✓ {day.deliveredTime}
                            </span>
                          )}
                        </div>
                      ) : ''}
                    </td>
                    <td style={{ padding: '4px 8px', fontWeight: 700, color: '#0f172a' }}>
                      {it.productName} {it.variantLabel ? `(${it.variantLabel})` : ''}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 800, color: '#0284c7' }}>
                      {it.quantity} {it.quantity === 1 ? 'pkt' : 'pkts'}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', color: '#475569' }}>
                      {Number(it.unitPrice || 0).toFixed(2)}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                      {Number(it.totalAmount || (it.quantity * it.unitPrice)).toFixed(2)}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 800 }}>
                <td colSpan={3} style={{ padding: '8px', color: '#0f172a' }}>
                  TOTAL DELIVERED
                </td>
                <td style={{ padding: '8px', textAlign: 'center', color: '#0284c7', fontSize: '0.82rem' }}>
                  {summary.totalDeliveredItems || days.filter(d => d.status === 'DELIVERED').reduce((acc, d) => acc + (d.totalItems || 0), 0)} pkts
                </td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#64748b', fontSize: '0.72rem' }}>
                  Net Total:
                </td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#16a34a', fontSize: '0.85rem' }}>
                  ₹{Number(netPayableValue !== undefined ? netPayableValue : monthBillValue || 0).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Delivery Schedule Bar */}
        <div style={{
          padding: '6px 10px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '4px',
          fontSize: '0.74rem',
          color: '#334155',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px'
        }}>
          <div>
            🗓️ <strong>Delivery Schedule:</strong> {summary.totalScheduledDays || summary.totalDeliveredDays || days.length} Scheduled Days for <strong>{bill?.billingMonth || selectedMonth}</strong>
          </div>
          <div style={{ color: '#0054a6', fontWeight: 700 }}>
            Total Delivered: {summary.totalDeliveredItems || days.filter(d => d.status === 'DELIVERED').reduce((acc, d) => acc + (d.totalItems || 0), 0)} pkts
          </div>
        </div>

        {/* Bill Summary Breakdown (Matches image 4 exactly) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
          <div style={{ width: '310px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '3px' }}>
              <span style={{ color: '#64748b' }}>
                {isPrepaid ? 'Sub Total (Scheduled Days):' : 'Sub Total (Delivered Milk):'}
              </span>
              <span style={{ fontWeight: 600 }}>₹{monthBillValue.toFixed(2)}</span>
            </div>

            {isPrepaid && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '4px 8px', margin: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#0369a1', fontWeight: 700 }}>
                  <span>Advance Deposited / Paid:</span>
                  <span>₹{Number(customer.advanceBalance || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#dc2626', fontWeight: 700, marginTop: '2px' }}>
                  <span>Advance Settled / Deducted:</span>
                  <span>- ₹{advanceSettledValue.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#15803d', fontWeight: 800, borderTop: '1px dashed #86efac', paddingTop: '2px', marginTop: '2px' }}>
                  <span>Remaining Advance Balance:</span>
                  <span>₹{Math.max(0, Number(customer.advanceBalance || 0) - advanceSettledValue).toFixed(2)}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '3px' }}>
              <span style={{ color: '#64748b' }}>Round Off:</span>
              <span style={{ fontWeight: 600 }}>₹0.00</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', fontWeight: 800, borderTop: '1px solid #cbd5e1', paddingTop: '4px', marginBottom: '3px', color: '#0f172a' }}>
              <span>Total Bill:</span>
              <span>₹{monthBillValue.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#16a34a', marginBottom: '3px' }}>
              <span>Received / Adjusted:</span>
              <span style={{ fontWeight: 700 }}>₹{Number(bill?.paidAmount || 0).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: netPayableValue > 0 ? '#dc2626' : '#16a34a', marginBottom: '3px' }}>
              <span>Net Due (Payable):</span>
              <span style={{ fontWeight: 700 }}>₹{netPayableValue.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 800, borderTop: '1px solid #e2e8f0', paddingTop: '4px', marginTop: '3px', color: netPayableValue > 0 ? '#dc2626' : '#15803d' }}>
              <span>Pending Due:</span>
              <span>₹{netPayableValue.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Payment Details & Authorized Signatory Section */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          padding: '12px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          marginBottom: '12px',
          alignItems: 'center'
        }}>
          {/* Left: Payment Info */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              PAYMENT DETAILS
            </div>
            <div style={{ fontSize: '0.78rem', marginTop: '3px', color: '#0f172a' }}>
              Gpay / PhonePe / Paytm: <strong style={{ color: '#0054a6' }}>{parlour.upiPhone || parlour.phone || '7022754524'}</strong>
            </div>
            {parlour.upiId && (
              <div style={{ fontSize: '0.78rem', marginTop: '2px' }}>
                UPI ID: <strong style={{ color: '#0054a6' }}>{parlour.upiId}</strong>
              </div>
            )}
            {parlour.upiQr ? (
              <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <img
                    src={parlour.upiQr}
                    alt="UPI QR Code"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                  <strong style={{ display: 'block', color: '#0f172a' }}>Scan to Pay</strong>
                  <span>Accepted: UPI • Cash • Bank</span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '3px' }}>
                Accepted: UPI • Cash • Bank Transfer
              </div>
            )}
          </div>

          {/* Right: Authorized Signature */}
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
            {parlour.signature ? (
              <div style={{ height: '44px', marginBottom: '2px', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                <img
                  src={parlour.signature}
                  alt="Signature"
                  style={{ maxHeight: '44px', maxWidth: '140px', objectFit: 'contain' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            ) : (
              <div style={{ height: '24px' }}></div>
            )}
            <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '3px', minWidth: '150px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a' }}>Authorized Signatory</div>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{parlour.businessName || 'SS Agency [Nandini Milk Parlour]'}</div>
            </div>
          </div>
        </div>

        {/* Bottom Customer-Friendly Quote */}
        <div style={{ textAlign: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
          <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b', fontStyle: 'italic' }}>
            "Thank you for choosing Nandini Milk Parlour — Freshness delivered with care."
          </p>
        </div>
      </div>
    </div>
  );
}
