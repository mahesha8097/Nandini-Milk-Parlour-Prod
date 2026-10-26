import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import EmptyState from '../../components/common/EmptyState';
import {
  FileBarChart,
  Download,
  Calendar,
  Filter,
  RefreshCw,
  TrendingUp,
  CreditCard,
  Users,
  ShoppingBag,
  Wallet,
  Mail,
  Send,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Clock,
  X,
  ExternalLink,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Info,
  Sliders,
  Building,
  AlertCircle
} from 'lucide-react';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';

export default function ReportsPage() {
  // Main view tab: 'STANDARD' or 'EMAIL_REPORTS'
  const [activeTab, setActiveTab] = useState('STANDARD');

  // =========================================================================
  // 1. STANDARD TABULAR AUDIT REPORTS STATE
  // =========================================================================
  const [standardReportType, setStandardReportType] = useState('DAILY_SALES');
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [standardStartDate, setStandardStartDate] = useState(getLocalDateString(firstOfMonth));
  const [standardEndDate, setStandardEndDate] = useState(getLocalDateString(now));
  const [standardReportData, setStandardReportData] = useState(null);
  const [standardLoading, setStandardLoading] = useState(true);
  const [standardError, setStandardError] = useState('');
  const [exporting, setExporting] = useState(false);

  // =========================================================================
  // 2. EMAIL REPORTS SYSTEM STATE
  // =========================================================================
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailLoading, setEmailLoading] = useState(false);

  // On-Demand Report Generator Form State
  const [selectedReportType, setSelectedReportType] = useState('DAILY_DELIVERY');
  const [periodMode, setPeriodMode] = useState('PRESET'); // 'PRESET' | 'SPECIFIC_DATE' | 'MONTH' | 'CUSTOM_RANGE'
  const [activePreset, setActivePreset] = useState('TODAY'); // 'TODAY' | 'YESTERDAY' | 'CURRENT_MONTH' | 'PREVIOUS_MONTH'
  
  const [reportStartDate, setReportStartDate] = useState(getLocalDateString(now));
  const [reportEndDate, setReportEndDate] = useState(getLocalDateString(now));
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [recipientEmail, setRecipientEmail] = useState('');
  
  // Execution & Action Results
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailActionResult, setEmailActionResult] = useState(null);

  // Advanced / Diagnostics Accordion State (Collapsed by default)
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [forceResend, setForceResend] = useState(false);

  // Preview Modal State
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewPeriodText, setPreviewPeriodText] = useState('');

  // Log Details Modal State
  const [logDetailsModalOpen, setLogDetailsModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  // =========================================================================
  // DATE RANGE CALCULATIONS & PRESET HANDLERS
  // =========================================================================
  const applyPreset = (preset) => {
    setActivePreset(preset);
    const currentDate = new Date();
    
    if (preset === 'TODAY') {
      const todayStr = getLocalDateString(currentDate);
      setReportStartDate(todayStr);
      setReportEndDate(todayStr);
    } else if (preset === 'YESTERDAY') {
      const yest = new Date(currentDate);
      yest.setDate(yest.getDate() - 1);
      const yestStr = getLocalDateString(yest);
      setReportStartDate(yestStr);
      setReportEndDate(yestStr);
    } else if (preset === 'CURRENT_MONTH') {
      const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      setReportStartDate(getLocalDateString(firstDay));
      setReportEndDate(getLocalDateString(currentDate));
      setSelectedMonth(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`);
    } else if (preset === 'PREVIOUS_MONTH') {
      let prevYear = currentDate.getFullYear();
      let prevMonth = currentDate.getMonth(); // 0-indexed: previous month index
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
      }
      const firstDayPrev = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
      const lastDayNum = new Date(prevYear, prevMonth, 0).getDate();
      const lastDayPrev = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
      setReportStartDate(firstDayPrev);
      setReportEndDate(lastDayPrev);
      setSelectedMonth(`${prevYear}-${String(prevMonth).padStart(2, '0')}`);
    }
  };

  const handleMonthChange = (monthStr) => {
    setSelectedMonth(monthStr);
    if (!monthStr || !monthStr.includes('-')) return;
    const [y, m] = monthStr.split('-');
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const startDate = `${monthStr}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
    setReportStartDate(startDate);
    setReportEndDate(endDate);
  };

  // Synchronize initial report type defaults
  useEffect(() => {
    if (selectedReportType === 'DAILY_DELIVERY') {
      applyPreset('TODAY');
    } else if (selectedReportType === 'MONTHLY_BUSINESS') {
      applyPreset('PREVIOUS_MONTH');
    }
  }, [selectedReportType]);

  // Date Range Validation Check
  const dateRangeValidation = useMemo(() => {
    if (!reportStartDate || !reportEndDate) {
      return { isValid: false, message: 'Start date and End date must both be selected.' };
    }
    if (reportStartDate > reportEndDate) {
      return { isValid: false, message: `Start date (${reportStartDate}) cannot be after End date (${reportEndDate}).` };
    }
    return { isValid: true, message: '' };
  }, [reportStartDate, reportEndDate]);

  // =========================================================================
  // API CALLS: STANDARD REPORT
  // =========================================================================
  const fetchStandardReport = async () => {
    try {
      setStandardLoading(true);
      setStandardError('');
      const params = new URLSearchParams();
      params.append('type', standardReportType);
      params.append('startDate', standardStartDate);
      params.append('endDate', standardEndDate);

      const res = await api.get(`/reports?${params.toString()}`);
      setStandardReportData(res);
    } catch (err) {
      setStandardError(err.message || 'Unable to load report data.');
    } finally {
      setStandardLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'STANDARD') {
      fetchStandardReport();
    }
  }, [standardReportType, standardStartDate, standardEndDate, activeTab]);

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams();
      params.append('type', standardReportType);
      params.append('startDate', standardStartDate);
      params.append('endDate', standardEndDate);
      params.append('format', 'excel');

      const blob = await api.getBlob(`/reports?${params.toString()}`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${standardReportType}_Report_${getLocalDateString()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Failed to export Excel file');
    } finally {
      setExporting(false);
    }
  };

  // =========================================================================
  // API CALLS: EMAIL STATUS & LOGS
  // =========================================================================
  const fetchEmailStatus = async () => {
    try {
      setEmailLoading(true);
      const res = await api.get('/reports/daily-email/status');
      setEmailStatus(res);
      if (res?.recipientEmail && !recipientEmail) {
        setRecipientEmail(res.recipientEmail);
      }
    } catch (err) {
      console.warn('Failed to load email reports status:', err.message);
    } finally {
      setEmailLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'EMAIL_REPORTS') {
      fetchEmailStatus();
    }
  }, [activeTab]);

  // =========================================================================
  // ACTIONS: PREVIEW & SEND ON-DEMAND EMAIL REPORT
  // =========================================================================
  const handleOpenPreview = async () => {
    if (!dateRangeValidation.isValid) return;

    try {
      setPreviewLoading(true);
      setPreviewError('');
      setPreviewModalOpen(true);

      const params = new URLSearchParams();
      params.append('type', selectedReportType);
      params.append('startDate', reportStartDate);
      params.append('endDate', reportEndDate);
      params.append('date', reportStartDate);
      if (selectedMonth) params.append('month', selectedMonth);

      const res = await api.get(`/reports/preview?${params.toString()}`);
      setPreviewHtml(res.html || '');
      setPreviewData(res.data || null);
      setPreviewTitle(res.title || 'Email Report Preview');
      setPreviewPeriodText(res.periodText || `${reportStartDate} to ${reportEndDate}`);
    } catch (err) {
      console.error('Email report preview failed:', err);
      setPreviewError(err.message || 'Failed to generate email report preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSendEmailReport = async () => {
    if (!dateRangeValidation.isValid) return;

    try {
      setSendingEmail(true);
      setEmailActionResult(null);

      const payload = {
        type: selectedReportType,
        startDate: reportStartDate,
        endDate: reportEndDate,
        date: reportStartDate,
        month: selectedMonth,
        recipientEmail: recipientEmail ? recipientEmail.trim() : undefined
      };

      const res = await api.post('/reports/send-email', payload);
      setEmailActionResult(res);
      fetchEmailStatus();
    } catch (err) {
      setEmailActionResult({
        success: false,
        message: err.message || 'Failed to send email report'
      });
    } finally {
      setSendingEmail(false);
    }
  };

  // Supported Report Types Directory
  const reportTypeOptions = [
    {
      group: 'Core Operational Reports',
      reports: [
        { id: 'DAILY_DELIVERY', label: '🥛 Daily Delivery Operations Report', desc: 'Consolidated daily milk, curd, route/zone, payments & ledger breakdown' },
        { id: 'MISSED_DELIVERIES', label: '⚠️ Missed & Incomplete Deliveries', desc: 'Audit list of missed, skipped, and incomplete deliveries with recorded reasons' }
      ]
    },
    {
      group: 'Financial & Executive Reports',
      reports: [
        { id: 'MONTHLY_BUSINESS', label: '📊 Monthly Business & Profit Report', desc: 'Comprehensive monthly sales, milk volume, collections, expenses & net profit' },
        { id: 'COLLECTIONS', label: '💳 Payment Collections & Receipts', desc: 'Itemized receipts by cash, UPI, bank transfer, and reference numbers' },
        { id: 'PENDING_PAYMENTS', label: '⏳ Pending Payments & Outstanding Dues', desc: 'Active customers with outstanding unpaid balances and phone numbers' },
        { id: 'ADVANCE_BALANCES', label: '💰 Customer Advance Balances Held', desc: 'Active customers holding advance wallet credits' },
        { id: 'EXPENSES', label: '📉 Business Expenses Report', desc: 'Operating expenses itemized by category (Rent, Salary, Petrol, Maintenance)' }
      ]
    },
    {
      group: 'Sales & Customer Analytics',
      reports: [
        { id: 'DAILY_SALES', label: '📈 Daily Sales & Revenue Breakdown', desc: 'Day-by-day order counts, delivery charges & billed product totals' },
        { id: 'MONTHLY_SALES', label: '📅 Monthly Sales Summary', desc: 'Multi-month overview of completed deliveries and total revenue' },
        { id: 'PRODUCT_SALES', label: '📦 Product-wise Sales & Volume', desc: 'Litres delivered, packet counts, and sales revenue per product variant' },
        { id: 'CUSTOMER_SALES', label: '👥 Customer-wise Sales & Statements', desc: 'Order counts, billed totals, and advance/pending balances per customer' },
        { id: 'HOTEL_BULK_SALES', label: '🏨 Hotel & Commercial Bulk Orders', desc: 'Commercial customer delivery quantities and revenue summaries' }
      ]
    }
  ];

  const standardReportTypes = [
    { id: 'DAILY_SALES', label: 'Daily Sales Report', icon: TrendingUp },
    { id: 'MONTHLY_SALES', label: 'Monthly Sales Summary', icon: Calendar },
    { id: 'PRODUCT_SALES', label: 'Product-wise Sales', icon: ShoppingBag },
    { id: 'CUSTOMER_SALES', label: 'Customer-wise Sales', icon: Users },
    { id: 'COLLECTIONS', label: 'Payment Collections', icon: CreditCard },
    { id: 'PENDING_PAYMENTS', label: 'Pending Payments Report', icon: CreditCard },
    { id: 'ADVANCE_BALANCES', label: 'Customer Advance Balances', icon: Wallet },
    { id: 'EXPENSES', label: 'Expenses Report', icon: Wallet }
  ];

  const standardRows = standardReportData?.data || [];

  return (
    <div className="page-wrapper">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <FileBarChart size={28} color="var(--primary)" />
            Business Reports & Analytics
          </h1>
          <p className="page-subtitle">Real-time business audit reports, Excel export & automated email dispatches</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {activeTab === 'STANDARD' ? (
            <>
              <button onClick={fetchStandardReport} className="btn btn-outline btn-sm">
                <RefreshCw size={16} /> Refresh
              </button>
              <button onClick={handleExportExcel} className="btn btn-success btn-sm" disabled={exporting || standardRows.length === 0}>
                <Download size={16} />
                {exporting ? 'Generating Excel...' : 'Export Excel (.xlsx)'}
              </button>
            </>
          ) : (
            <button onClick={fetchEmailStatus} className="btn btn-outline btn-sm" disabled={emailLoading}>
              <RefreshCw size={16} className={emailLoading ? 'spin' : ''} /> Refresh Status & Logs
            </button>
          )}
        </div>
      </div>

      {/* Main Mode Toggle Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
        <button
          onClick={() => setActiveTab('STANDARD')}
          className={`btn btn-sm ${activeTab === 'STANDARD' ? 'btn-primary' : 'btn-outline'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <FileBarChart size={16} />
          Standard Audit Reports
        </button>
        <button
          onClick={() => setActiveTab('EMAIL_REPORTS')}
          className={`btn btn-sm ${activeTab === 'EMAIL_REPORTS' ? 'btn-primary' : 'btn-outline'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Mail size={16} />
          Automated & On-Demand Email Reports
          {emailStatus?.isConfigured && (
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
          )}
        </button>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: STANDARD AUDIT REPORTS                                       */}
      {/* =================================================================== */}
      {activeTab === 'STANDARD' && (
        <>
          <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontWeight: '700', fontSize: '0.875rem' }}>Report Type:</span>
                <select
                  className="form-select"
                  style={{ width: 'auto', fontSize: '0.875rem', fontWeight: '600' }}
                  value={standardReportType}
                  onChange={(e) => setStandardReportType(e.target.value)}
                >
                  {standardReportTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              {!['MONTHLY_SALES', 'PENDING_PAYMENTS', 'ADVANCE_BALANCES'].includes(standardReportType) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.813rem', color: 'var(--text-secondary)' }}>From:</span>
                    <input
                      type="date"
                      className="form-input"
                      style={{ width: 'auto', padding: '6px 12px' }}
                      value={standardStartDate}
                      onChange={(e) => setStandardStartDate(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.813rem', color: 'var(--text-secondary)' }}>To:</span>
                    <input
                      type="date"
                      className="form-input"
                      style={{ width: 'auto', padding: '6px 12px' }}
                      value={standardEndDate}
                      onChange={(e) => setStandardEndDate(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {standardLoading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>Generating report from live records...</div>
          ) : standardError ? (
            <div className="card" style={{ color: 'var(--accent-red)', padding: '24px', textAlign: 'center' }}>{standardError}</div>
          ) : standardRows.length === 0 ? (
            <EmptyState
              icon={FileBarChart}
              title="No data found for this report period"
              description="Try selecting a different date range or category."
            />
          ) : (
            <>
              <div className="table-container desktop-only">
                <table className="custom-table">
                  <thead>
                    <tr>
                      {Object.keys(standardRows[0]).map((key) => (
                        <th key={key} style={{ textTransform: 'capitalize' }}>
                          {key.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {standardRows.map((row, idx) => (
                      <tr key={idx}>
                        {Object.entries(row).map(([key, val], cellIdx) => (
                          <td key={cellIdx}>
                            {typeof val === 'number' && (val % 1 !== 0 || key.toLowerCase().includes('amount') || key.toLowerCase().includes('price') || key.toLowerCase().includes('total') || key.toLowerCase().includes('balance'))
                              ? `₹${val.toFixed(2)}`
                              : (val ?? '-')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mobile-only">
                {standardRows.map((row, idx) => {
                  const entries = Object.entries(row);
                  const [firstKey, firstVal] = entries[0] || ['', ''];
                  const remainingEntries = entries.slice(1);

                  return (
                    <div key={idx} className="mobile-data-card">
                      <div className="mobile-card-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                        <div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>
                            {firstKey.replace(/_/g, ' ')}
                          </span>
                          <h3 className="mobile-card-title" style={{ marginTop: '2px' }}>
                            {typeof firstVal === 'number' && firstVal % 1 !== 0 ? `₹${firstVal.toFixed(2)}` : (firstVal || '-')}
                          </h3>
                        </div>
                        <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>
                          #{idx + 1}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {remainingEntries.map(([k, val], vIdx) => {
                          const isAmount = typeof val === 'number' && (val % 1 !== 0 || k.toLowerCase().includes('amount') || k.toLowerCase().includes('price') || k.toLowerCase().includes('total') || k.toLowerCase().includes('balance'));
                          return (
                            <div key={vIdx} className="mobile-card-row">
                              <span className="mobile-card-row-label">{k.replace(/_/g, ' ')}</span>
                              <span
                                className="mobile-card-row-value"
                                style={{
                                  color: isAmount ? 'var(--primary-dark)' : 'var(--text-primary)',
                                  fontSize: isAmount ? '0.9rem' : '0.813rem'
                                }}
                              >
                                {typeof val === 'number' ? (
                                  val % 1 !== 0 ? `₹${val.toFixed(2)}` : isAmount ? `₹${val}` : val
                                ) : (
                                  val || '-'
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* =================================================================== */}
      {/* TAB 2: AUTOMATED & ON-DEMAND EMAIL REPORTS                          */}
      {/* =================================================================== */}
      {activeTab === 'EMAIL_REPORTS' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Section 1: Compact Status & Automated Schedule Bar */}
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '14px' }}>
              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Mail size={18} color="var(--primary)" />
                  Automated Schedules & Email System Status
                </h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Active Resend email infrastructure with Vercel Cron background automation
                </span>
              </div>

              <div>
                {emailStatus?.isConfigured ? (
                  <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', fontSize: '0.78rem' }}>
                    <CheckCircle2 size={13} /> Resend Ready
                  </span>
                ) : (
                  <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', fontSize: '0.78rem' }}>
                    <AlertTriangle size={13} /> Action Required: Set RESEND_API_KEY
                  </span>
                )}
              </div>
            </div>

            {/* Compact 4-Spec Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              <div style={{ background: 'var(--bg-main, #f8fafc)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700' }}>Configured Recipient</span>
                <div style={{ fontWeight: '600', fontSize: '0.85rem', marginTop: '2px', wordBreak: 'break-all' }}>
                  {emailStatus?.recipientEmail || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>ADMIN_REPORT_EMAIL not set</span>}
                </div>
              </div>

              <div style={{ background: 'var(--bg-main, #f8fafc)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700' }}>Sender Address</span>
                <div style={{ fontWeight: '600', fontSize: '0.85rem', marginTop: '2px', wordBreak: 'break-all' }}>
                  {emailStatus?.senderEmail || 'onboarding@resend.dev'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-main, #f8fafc)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700' }}>Daily Automatic Schedule</span>
                <div style={{ fontWeight: '600', fontSize: '0.85rem', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} color="var(--primary)" />
                  10:00 AM IST (Daily)
                </div>
              </div>

              <div style={{ background: 'var(--bg-main, #f8fafc)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700' }}>Monthly Automatic Schedule</span>
                <div style={{ fontWeight: '600', fontSize: '0.85rem', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} color="var(--primary)" />
                  1st of Month (IST)
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: On-Demand Manual Report Generator & Preview */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Send size={18} color="var(--primary)" />
                On-Demand Email Report Generator
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
                Choose any business report, select the reporting period, preview the rendered HTML layout, or send directly to email.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Step A: Select Report Type */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  1. Select Report Type:
                </label>
                <select
                  className="form-select"
                  value={selectedReportType}
                  onChange={(e) => setSelectedReportType(e.target.value)}
                  style={{ width: '100%', maxWidth: '520px', fontWeight: '600', fontSize: '0.9rem' }}
                >
                  {reportTypeOptions.map((grp) => (
                    <optgroup key={grp.group} label={grp.group}>
                      {grp.reports.map((r) => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Step B: Select Reporting Period */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  2. Select Reporting Period:
                </label>

                {/* Preset Quick Buttons */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <button
                    type="button"
                    onClick={() => { setPeriodMode('PRESET'); applyPreset('TODAY'); }}
                    className={`btn btn-sm ${periodMode === 'PRESET' && activePreset === 'TODAY' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPeriodMode('PRESET'); applyPreset('YESTERDAY'); }}
                    className={`btn btn-sm ${periodMode === 'PRESET' && activePreset === 'YESTERDAY' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPeriodMode('PRESET'); applyPreset('CURRENT_MONTH'); }}
                    className={`btn btn-sm ${periodMode === 'PRESET' && activePreset === 'CURRENT_MONTH' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    Current Month
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPeriodMode('PRESET'); applyPreset('PREVIOUS_MONTH'); }}
                    className={`btn btn-sm ${periodMode === 'PRESET' && activePreset === 'PREVIOUS_MONTH' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    Previous Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodMode('SPECIFIC_DATE')}
                    className={`btn btn-sm ${periodMode === 'SPECIFIC_DATE' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    Specific Date
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodMode('MONTH')}
                    className={`btn btn-sm ${periodMode === 'MONTH' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    Monthly Date Range
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodMode('CUSTOM_RANGE')}
                    className={`btn btn-sm ${periodMode === 'CUSTOM_RANGE' ? 'btn-primary' : 'btn-outline'}`}
                  >
                    Custom Date Range
                  </button>
                </div>

                {/* Conditional Date Pickers based on Period Mode */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                  {periodMode === 'SPECIFIC_DATE' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Target Date:</span>
                      <input
                        type="date"
                        className="form-input"
                        value={reportStartDate}
                        onChange={(e) => {
                          setReportStartDate(e.target.value);
                          setReportEndDate(e.target.value);
                        }}
                        style={{ width: 'auto', padding: '6px 12px' }}
                      />
                    </div>
                  )}

                  {periodMode === 'MONTH' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Select Month:</span>
                      <input
                        type="month"
                        className="form-input"
                        value={selectedMonth}
                        onChange={(e) => handleMonthChange(e.target.value)}
                        style={{ width: 'auto', padding: '6px 12px' }}
                      />
                    </div>
                  )}

                  {periodMode === 'CUSTOM_RANGE' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>From:</span>
                        <input
                          type="date"
                          className="form-input"
                          value={reportStartDate}
                          onChange={(e) => setReportStartDate(e.target.value)}
                          style={{ width: 'auto', padding: '6px 12px' }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>To:</span>
                        <input
                          type="date"
                          className="form-input"
                          value={reportEndDate}
                          onChange={(e) => setReportEndDate(e.target.value)}
                          style={{ width: 'auto', padding: '6px 12px' }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Active Period Confirmation Badge */}
                  <div style={{
                    fontSize: '0.8rem',
                    background: dateRangeValidation.isValid ? 'var(--primary-light, #eff6ff)' : '#fef2f2',
                    color: dateRangeValidation.isValid ? 'var(--primary-dark, #1e40af)' : '#b91c1c',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: `1px solid ${dateRangeValidation.isValid ? '#bfdbfe' : '#fecaca'}`,
                    fontWeight: '600'
                  }}>
                    📅 Reporting Period: {formatDisplayDate(reportStartDate)} {reportStartDate !== reportEndDate ? `to ${formatDisplayDate(reportEndDate)}` : ''} (Asia/Kolkata)
                  </div>
                </div>

                {!dateRangeValidation.isValid && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--accent-red)', marginTop: '6px' }}>
                    ⚠️ {dateRangeValidation.message}
                  </div>
                )}
              </div>

              {/* Step C: Recipient Email Input */}
              <div style={{ maxWidth: '520px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  3. Recipient Email Address:
                </label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="e.g. business-owner@gmail.com"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Defaults to configured recipient. In Resend test mode, delivery is permitted only to your registered account address.
                </span>
              </div>

              {/* Action Buttons: Preview & Send Email */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
                <button
                  type="button"
                  onClick={handleOpenPreview}
                  className="btn btn-outline"
                  disabled={previewLoading || !dateRangeValidation.isValid}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Eye size={16} />
                  {previewLoading ? 'Compiling Preview...' : 'Preview Report'}
                </button>

                <button
                  type="button"
                  onClick={handleSendEmailReport}
                  className="btn btn-primary"
                  disabled={sendingEmail || !dateRangeValidation.isValid || !emailStatus?.isConfigured}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Send size={16} className={sendingEmail ? 'spin' : ''} />
                  {sendingEmail ? 'Sending Email Report...' : 'Send Email Report'}
                </button>
              </div>

              {/* Action Result Notification Banner */}
              {emailActionResult && (
                <div style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  border: `1px solid ${emailActionResult.success ? '#86efac' : '#fca5a5'}`,
                  background: emailActionResult.success ? '#f0fdf4' : '#fef2f2',
                  color: emailActionResult.success ? '#15803d' : '#b91c1c'
                }}>
                  <div style={{ fontWeight: '700', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {emailActionResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    {emailActionResult.success ? 'Email Report Sent Successfully' : 'Email Send Result'}
                  </div>
                  <div>{emailActionResult.message}</div>
                  {emailActionResult.messageId && (
                    <div style={{ fontSize: '0.75rem', marginTop: '4px', color: '#166534', fontFamily: 'monospace' }}>
                      Resend Message ID: {emailActionResult.messageId}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Collapsed Advanced Settings & Diagnostics */}
          <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              style={{
                width: '100%',
                padding: '14px 20px',
                background: 'var(--bg-main, #f8fafc)',
                border: 'none',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.875rem',
                color: 'var(--text-secondary)'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sliders size={16} />
                Advanced Settings & Diagnostics (Click to {advancedOpen ? 'collapse' : 'expand'})
              </span>
              {advancedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>

            {advancedOpen && (
              <div style={{ padding: '18px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  Diagnostics controls for Vercel Cron webhooks and manual overrides.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                  <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Daily Cron Endpoint</span>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', marginTop: '2px' }}>
                      {emailStatus?.cronPath || '/api/cron/daily-delivery-report'}
                    </div>
                  </div>

                  <div style={{ background: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '12px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Monthly Cron Endpoint</span>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', marginTop: '2px' }}>
                      {emailStatus?.monthlyCronPath || '/api/cron/monthly-business-report'}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Authentication: Protected by CRON_SECRET token via Authorization header or ?secret= parameter.
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Email Delivery Audit Logs Table */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700' }}>Email Report Delivery History</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Complete audit trail of automated Vercel Cron runs and manual on-demand dispatches
                </span>
              </div>
              <button onClick={fetchEmailStatus} className="btn btn-outline btn-sm" disabled={emailLoading}>
                <RefreshCw size={14} className={emailLoading ? 'spin' : ''} /> Refresh
              </button>
            </div>

            {(!emailStatus?.recentLogs || emailStatus.recentLogs.length === 0) ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                No email reports have been recorded in audit history yet.
              </div>
            ) : (
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Report Type</th>
                      <th>Period Covered</th>
                      <th>Recipient</th>
                      <th>Trigger</th>
                      <th>Status</th>
                      <th>Logged At (IST)</th>
                      <th>Result / Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailStatus.recentLogs.map((log) => {
                      let statusBadge = 'badge-gray';
                      let statusText = log.status;
                      if (log.status === 'SENT') {
                        statusBadge = 'badge-success';
                        statusText = 'Sent';
                      } else if (log.status === 'FAILED') {
                        statusBadge = 'badge-danger';
                        statusText = 'Failed';
                      } else if (log.status === 'SKIPPED_DUPLICATE') {
                        statusBadge = 'badge-warning';
                        statusText = 'Skipped (Duplicate)';
                      }

                      return (
                        <tr key={log.id}>
                          <td style={{ fontWeight: '600', fontSize: '0.82rem' }}>
                            {log.report_type?.replace(/_/g, ' ') || 'Daily Delivery'}
                          </td>
                          <td style={{ fontSize: '0.82rem' }}>
                            {log.report_date}
                          </td>
                          <td style={{ fontSize: '0.82rem' }}>
                            {log.recipient_email}
                          </td>
                          <td>
                            <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                              {log.trigger_type}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${statusBadge}`} style={{ fontSize: '0.72rem' }}>
                              {statusText}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {log.created_at}
                          </td>
                          <td>
                            <button
                              onClick={() => {
                                setSelectedLog(log);
                                setLogDetailsModalOpen(true);
                              }}
                              className="btn btn-outline btn-sm"
                              style={{ padding: '3px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Info size={13} /> View Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 1: REPORT HTML PREVIEW MODAL                                  */}
      {/* =================================================================== */}
      {previewModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1050,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '760px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-secondary, #f8fafc)'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Eye size={18} color="var(--primary)" />
                  {previewTitle}
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Period: {previewPeriodText} • Real-time preview as rendered in email clients
                </span>
              </div>
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="btn btn-outline btn-sm"
                style={{ padding: '4px 8px' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body: Responsive HTML Iframe */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px', background: '#e2e8f0' }}>
              {previewLoading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#475569' }}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px auto', display: 'block' }} />
                  Compiling live email preview from database...
                </div>
              ) : previewError ? (
                <div style={{
                  padding: '30px 20px',
                  margin: '20px auto',
                  maxWidth: '520px',
                  borderRadius: '10px',
                  background: '#ffffff',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  textAlign: 'center'
                }}>
                  <AlertTriangle size={32} color="#dc2626" style={{ margin: '0 auto 10px auto', display: 'block' }} />
                  <div style={{ fontWeight: '700', fontSize: '1rem' }}>Failed to generate email report preview</div>
                  <div style={{ fontSize: '0.85rem', marginTop: '6px' }}>{previewError}</div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button onClick={handleOpenPreview} className="btn btn-primary btn-sm">
                      <RefreshCw size={14} /> Retry
                    </button>
                    <button onClick={() => setPreviewModalOpen(false)} className="btn btn-outline btn-sm">
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <iframe
                  title="Email Report Preview"
                  srcDoc={previewHtml}
                  style={{
                    width: '100%',
                    height: '560px',
                    border: 'none',
                    borderRadius: '8px',
                    background: '#ffffff',
                    display: 'block'
                  }}
                />
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              background: 'var(--bg-secondary, #f8fafc)'
            }}>
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="btn btn-outline btn-sm"
              >
                Close Preview
              </button>
              <button
                onClick={() => {
                  setPreviewModalOpen(false);
                  handleSendEmailReport();
                }}
                className="btn btn-primary btn-sm"
                disabled={sendingEmail}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Send size={14} /> Send Email Report Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: LOG ENTRY FULL DETAILS MODAL                               */}
      {/* =================================================================== */}
      {logDetailsModalOpen && selectedLog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1060,
          padding: '16px'
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '620px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-secondary, #f8fafc)'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700' }}>
                  Email Delivery Audit Record (#{selectedLog.id})
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Logged at {selectedLog.created_at}
                </span>
              </div>
              <button
                onClick={() => setLogDetailsModalOpen(false)}
                className="btn btn-outline btn-sm"
                style={{ padding: '4px 8px' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>Report Type</div>
                  <div style={{ fontWeight: '600', fontSize: '0.88rem', marginTop: '2px' }}>{selectedLog.report_type}</div>
                </div>

                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>Period Covered</div>
                  <div style={{ fontWeight: '600', fontSize: '0.88rem', marginTop: '2px' }}>{selectedLog.report_date}</div>
                </div>

                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>Trigger Type</div>
                  <div style={{ fontWeight: '600', fontSize: '0.88rem', marginTop: '2px' }}>{selectedLog.trigger_type}</div>
                </div>

                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>Delivery Status</div>
                  <div style={{ fontWeight: '600', fontSize: '0.88rem', marginTop: '2px' }}>{selectedLog.status}</div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>Recipient Email</div>
                <div style={{ fontWeight: '600', fontSize: '0.88rem', marginTop: '2px' }}>{selectedLog.recipient_email}</div>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', marginTop: '8px' }}>Sender Email</div>
                <div style={{ fontWeight: '600', fontSize: '0.88rem', marginTop: '2px' }}>{selectedLog.sender_email}</div>
              </div>

              {selectedLog.resend_id && (
                <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#166534', fontWeight: '700' }}>Resend Provider Message ID</div>
                  <div style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.88rem', marginTop: '2px', color: '#15803d' }}>
                    {selectedLog.resend_id}
                  </div>
                </div>
              )}

              {selectedLog.error_message && (
                <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '6px', border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#991b1b', fontWeight: '700' }}>Error Details / Status Message</div>
                  <div style={{ fontSize: '0.85rem', marginTop: '4px', color: '#b91c1c', lineHeight: '1.4' }}>
                    {selectedLog.error_message}
                  </div>
                </div>
              )}

              {selectedLog.report_summary_json && (
                <div>
                  <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', marginBottom: '4px' }}>
                    Report Summary Payload (JSON)
                  </div>
                  <pre style={{
                    background: '#1e293b',
                    color: '#f8fafc',
                    padding: '12px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    overflowX: 'auto',
                    margin: 0
                  }}>
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(selectedLog.report_summary_json), null, 2);
                      } catch (e) {
                        return selectedLog.report_summary_json;
                      }
                    })()}
                  </pre>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', background: 'var(--bg-secondary, #f8fafc)' }}>
              <button onClick={() => setLogDetailsModalOpen(false)} className="btn btn-outline btn-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
