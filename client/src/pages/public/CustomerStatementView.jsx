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
  const invoiceRef = useRef(null);

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
    const { customerId, billId } = getParams();
    fetchStatement(customerId, newMonth, billId);
  };

  const toggleDate = (dateStr) => {
    setExpandedDates(prev => ({
      ...prev,
      [dateStr]: !prev[dateStr]
    }));
  };

  const handleDownloadInvoice = async () => {
    if (!invoiceRef.current) return;
    try {
      setCapturing(true);
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2,
        backgroundColor: '#0a0a0a',
        useCORS: true
      });
      const link = document.createElement('a');
      link.download = `Nandini_Delivery_Invoice_${selectedMonth || 'statement'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Download error:', err);
      alert('Could not download image: ' + err.message);
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

  const { customer, parlour, bill, summary, days } = data;
  const isPrepaid = (data.billingType === 'PREPAID' || (summary && summary.billingType === 'PREPAID'));
  const monthBillValue = (bill ? bill.grossAmount : (summary.monthBillGross || summary.totalDeliveryAmount || 0));
  const advanceSettledValue = (bill ? bill.advanceAdjusted : (summary.advanceAdjusted || 0));
  const netPayableValue = (bill ? bill.netPayable : (summary.netPayable !== undefined ? summary.netPayable : Math.max(0, monthBillValue - advanceSettledValue)));
  const isPaid = (bill && (bill.status === 'PAID' || bill.status === 'ADVANCE_PAID' || bill.netPayable === 0)) || netPayableValue === 0;

  const upiLink = parlour.upiId
    ? `upi://pay?pa=${encodeURIComponent(parlour.upiId)}&pn=${encodeURIComponent(parlour.businessName)}&am=${encodeURIComponent(netPayableValue || 0)}&cu=INR`
    : null;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#000000',
      color: '#ffffff',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      paddingBottom: '60px'
    }}>
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

        {/* Month Filter Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '16px' }}>
        
        {/* Printable/Savable Statement Summary Card */}
        <div 
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
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#ffffff' }}>
                {customer.name}
              </h2>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={13} color="#64748b" />
                <span>{customer.flatNo ? `Flat ${customer.flatNo}, ` : ''}{customer.address || customer.route || 'Bangalore'}</span>
              </div>
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
                {isPrepaid ? 'Month Bill (Advance)' : 'Month Bill'}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
                ₹ {monthBillValue.toFixed(2)}
              </div>
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
                  <span>- ₹ {advanceSettledValue.toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '0.95rem', color: '#ffffff' }}>
                <span>Net Payable:</span>
                <span style={{ color: netPayableValue === 0 ? '#4ade80' : '#38bdf8' }}>
                  ₹ {netPayableValue.toFixed(2)} {netPayableValue === 0 ? '(All Clear ✓)' : ''}
                </span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
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
        </div>

        {/* Section Heading */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          padding: '0 4px'
        }}>
          <h2 style={{
            fontSize: '0.95rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#94a3b8',
            margin: 0
          }}>
            Daily Delivery History
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
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
          {days.length === 0 ? (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '0.9rem'
            }}>
              No delivery records found for this month.
            </div>
          ) : (
            days.map((day, idx) => {
              const isExpanded = !!expandedDates[day.date];
              const isDelivered = day.status === 'DELIVERED';
              const isSkipped = day.status === 'SKIPPED';
              const isScheduled = day.status === 'SCHEDULED';

              return (
                <div 
                  key={day.date}
                  style={{
                    borderBottom: idx === days.length - 1 ? 'none' : '1px solid #1a1a1a',
                    transition: 'background-color 0.15s ease'
                  }}
                >
                  <div
                    onClick={() => toggleDate(day.date)}
                    style={{
                      padding: '16px 18px',
                      cursor: 'pointer',
                      userSelect: 'none',
                      backgroundColor: isExpanded ? '#0a0a0a' : 'transparent'
                    }}
                  >
                    {/* Date label & timing */}
                    <div style={{
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: isSkipped ? '#94a3b8' : '#ffffff',
                      marginBottom: '10px',
                      letterSpacing: '-0.01em',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{day.formattedDate}</span>
                        {isSkipped && (
                          <span style={{
                            fontSize: '0.65rem',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: '#27272a',
                            color: '#a1a1aa',
                            fontWeight: 700
                          }}>
                            PAUSED / SKIP
                          </span>
                        )}
                        {isScheduled && (
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

                      {/* Time to time indicator */}
                      {day.deliveredTime && (
                        <div style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: '#4ade80',
                          backgroundColor: 'rgba(34, 197, 94, 0.12)',
                          border: '1px solid rgba(34, 197, 94, 0.25)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Clock size={12} color="#4ade80" />
                          <span>Delivered at {day.deliveredTime}</span>
                        </div>
                      )}
                    </div>

                    {/* Subline: Total Items & Total Amount */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '40px',
                        fontSize: '0.85rem'
                      }}>
                        <div>
                          <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 500, marginBottom: '2px' }}>
                            Total Items
                          </div>
                          <div style={{ color: '#ffffff', fontWeight: 700, fontSize: '0.95rem' }}>
                            {day.totalItems}
                          </div>
                        </div>

                        <div>
                          <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 500, marginBottom: '2px' }}>
                            Total Amount
                          </div>
                          <div style={{ color: '#ffffff', fontWeight: 700, fontSize: '0.95rem' }}>
                            ₹ {day.totalAmount.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Right Chevron > */}
                      <div style={{ color: '#0284c7', display: 'flex', alignItems: 'center' }}>
                        {isExpanded ? (
                          <ChevronDown size={18} color="#0284c7" />
                        ) : (
                          <ChevronRight size={18} color="#0284c7" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Item Breakdown */}
                  {isExpanded && (
                    <div style={{
                      backgroundColor: '#0a0a0a',
                      padding: '12px 18px 16px 18px',
                      borderTop: '1px solid #1f1f1f'
                    }}>
                      {day.items.length === 0 || (isSkipped && day.totalItems === 0) ? (
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic', padding: '6px 0' }}>
                          Delivery paused / No milk taken on this day.
                        </div>
                      ) : (
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
                                    {item.variantLabel} • Qty: <strong style={{ color: '#ffffff' }}>{item.quantity}</strong> × ₹{item.unitPrice.toFixed(2)}
                                    {item.deliveryCharge > 0 ? ` (+₹${item.deliveryCharge.toFixed(2)} delivery)` : ''}
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
                                  ₹ {item.totalAmount.toFixed(2)}
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
                      )}
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
    </div>
  );
}
