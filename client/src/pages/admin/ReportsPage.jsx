import React, { useState, useEffect } from 'react';
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
  ShieldCheck
} from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';

export default function ReportsPage() {
  // Main view tab: 'STANDARD' or 'EMAIL_REPORT'
  const [activeTab, setActiveTab] = useState('STANDARD');

  // Standard report state
  const [reportType, setReportType] = useState('DAILY_SALES');
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [startDate, setStartDate] = useState(getLocalDateString(firstOfMonth));
  const [endDate, setEndDate] = useState(getLocalDateString(now));
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  // Automated Email Report state
  const [emailStatus, setEmailStatus] = useState(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [testDate, setTestDate] = useState(getLocalDateString(now));
  const [testRecipient, setTestRecipient] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailActionResult, setEmailActionResult] = useState(null);

  // Preview Modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewData, setPreviewData] = useState(null);

  // 1. Fetch Standard Tabular Report
  const fetchReport = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      params.append('type', reportType);
      params.append('startDate', startDate);
      params.append('endDate', endDate);

      const res = await api.get(`/reports?${params.toString()}`);
      setReportData(res);
    } catch (err) {
      setError(err.message || 'Unable to load report data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'STANDARD') {
      fetchReport();
    }
  }, [reportType, startDate, endDate, activeTab]);

  // 2. Fetch Email Status & Logs
  const fetchEmailStatus = async () => {
    try {
      setEmailLoading(true);
      const res = await api.get('/reports/daily-email/status');
      setEmailStatus(res);
      if (res?.recipientEmail && !testRecipient) {
        setTestRecipient(res.recipientEmail);
      }
    } catch (err) {
      console.warn('Failed to load email status:', err.message);
    } finally {
      setEmailLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'EMAIL_REPORT') {
      fetchEmailStatus();
    }
  }, [activeTab]);

  // Handle Export Excel for standard report
  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams();
      params.append('type', reportType);
      params.append('startDate', startDate);
      params.append('endDate', endDate);
      params.append('format', 'excel');

      const blob = await api.getBlob(`/reports?${params.toString()}`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}_Report_${getLocalDateString()}.xlsx`;
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

  // 3. Open Preview Modal
  const handleOpenPreview = async () => {
    try {
      setPreviewLoading(true);
      setPreviewError('');
      setPreviewModalOpen(true);
      const res = await api.get(`/reports/daily-email/preview?date=${testDate}`);
      setPreviewHtml(res.html || '');
      setPreviewData(res.data || null);
    } catch (err) {
      console.error('Email report preview failed:', err);
      setPreviewError(err.message || 'Failed to generate email report preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  // 4. Send Test Email
  const handleSendTestEmail = async () => {
    try {
      setSendingEmail(true);
      setEmailActionResult(null);
      const res = await api.post('/reports/daily-email/test', {
        date: testDate,
        recipientEmail: testRecipient.trim()
      });
      setEmailActionResult(res);
      fetchEmailStatus();
    } catch (err) {
      setEmailActionResult({
        success: false,
        message: err.message || 'Failed to send test email'
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const reportTypes = [
    { id: 'DAILY_SALES', label: 'Daily Sales Report', icon: TrendingUp },
    { id: 'MONTHLY_SALES', label: 'Monthly Sales Summary', icon: Calendar },
    { id: 'PRODUCT_SALES', label: 'Product-wise Sales', icon: ShoppingBag },
    { id: 'CUSTOMER_SALES', label: 'Customer-wise Sales', icon: Users },
    { id: 'COLLECTIONS', label: 'Payment Collections', icon: CreditCard },
    { id: 'PENDING_PAYMENTS', label: 'Pending Payments Report', icon: CreditCard },
    { id: 'ADVANCE_BALANCES', label: 'Customer Advance Balances', icon: Wallet },
    { id: 'EXPENSES', label: 'Expenses Report', icon: Wallet }
  ];

  const rows = reportData?.data || [];

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
              <button onClick={fetchReport} className="btn btn-outline btn-sm">
                <RefreshCw size={16} /> Refresh
              </button>
              <button onClick={handleExportExcel} className="btn btn-success btn-sm" disabled={exporting || rows.length === 0}>
                <Download size={16} />
                {exporting ? 'Generating Excel...' : 'Export Excel (.xlsx)'}
              </button>
            </>
          ) : (
            <button onClick={fetchEmailStatus} className="btn btn-outline btn-sm" disabled={emailLoading}>
              <RefreshCw size={16} className={emailLoading ? 'spin' : ''} /> Refresh Logs
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
          onClick={() => setActiveTab('EMAIL_REPORT')}
          className={`btn btn-sm ${activeTab === 'EMAIL_REPORT' ? 'btn-primary' : 'btn-outline'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Mail size={16} />
          Daily Email Reports (Resend + Vercel Cron)
          {emailStatus?.isConfigured && (
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
          )}
        </button>
      </div>

      {/* TAB 1: STANDARD AUDIT REPORTS */}
      {activeTab === 'STANDARD' && (
        <>
          {/* Report Selection & Date Controls */}
          <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontWeight: '700', fontSize: '0.875rem' }}>Report Type:</span>
                <select
                  className="form-select"
                  style={{ width: 'auto', fontSize: '0.875rem', fontWeight: '600' }}
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                >
                  {reportTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              {!['MONTHLY_SALES', 'PENDING_PAYMENTS', 'ADVANCE_BALANCES'].includes(reportType) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.813rem', color: 'var(--text-secondary)' }}>From:</span>
                    <input
                      type="date"
                      className="form-input"
                      style={{ width: 'auto', padding: '6px 12px' }}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.813rem', color: 'var(--text-secondary)' }}>To:</span>
                    <input
                      type="date"
                      className="form-input"
                      style={{ width: 'auto', padding: '6px 12px' }}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Report Results View */}
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>Generating report from live records...</div>
          ) : error ? (
            <div className="card" style={{ color: 'var(--accent-red)', padding: '24px', textAlign: 'center' }}>{error}</div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={FileBarChart}
              title="No data found for this report period"
              description="Try selecting a different date range or category."
            />
          ) : (
            <>
              {/* Desktop Table */}
              <div className="table-container desktop-only">
                <table className="custom-table">
                  <thead>
                    <tr>
                      {Object.keys(rows[0]).map((key) => (
                        <th key={key} style={{ textTransform: 'capitalize' }}>
                          {key.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
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

              {/* Mobile View */}
              <div className="mobile-only">
                {rows.map((row, idx) => {
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

      {/* TAB 2: AUTOMATED DAILY EMAIL REPORT (RESEND + VERCEL CRON) */}
      {activeTab === 'EMAIL_REPORT' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Status & Configuration Overview Card */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Mail size={22} color="var(--primary)" />
                  <h2 style={{ fontSize: '1.15rem', fontWeight: '700', margin: 0 }}>Automated Daily Delivery Email Reports</h2>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Sends a consolidated daily delivery digest containing Milk (Litres), Curd (kg/L), Route/Zone summaries, incomplete deliveries, payments & customer balances.
                </p>
              </div>

              <div>
                {emailStatus?.isConfigured ? (
                  <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.8rem' }}>
                    <CheckCircle2 size={14} /> Resend API Ready
                  </span>
                ) : (
                  <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.8rem' }}>
                    <AlertTriangle size={14} /> Action Required: Set RESEND_API_KEY
                  </span>
                )}
              </div>
            </div>

            {/* Config Specs Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '18px' }}>
              <div style={{ background: 'var(--bg-tertiary, #f8fafc)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700' }}>Configured Recipient</span>
                <div style={{ fontWeight: '600', fontSize: '0.9rem', marginTop: '2px', wordBreak: 'break-all' }}>
                  {emailStatus?.recipientEmail || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>ADMIN_REPORT_EMAIL not set</span>}
                </div>
              </div>

              <div style={{ background: 'var(--bg-tertiary, #f8fafc)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700' }}>Sender Address</span>
                <div style={{ fontWeight: '600', fontSize: '0.9rem', marginTop: '2px', wordBreak: 'break-all' }}>
                  {emailStatus?.senderEmail || 'Nandini Milk Parlour <onboarding@resend.dev>'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-tertiary, #f8fafc)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700' }}>Scheduled Time</span>
                <div style={{ fontWeight: '600', fontSize: '0.9rem', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={15} color="var(--primary)" />
                  {emailStatus?.scheduleTimeIst || '10:00 AM IST (04:30 UTC)'}
                </div>
              </div>

              <div style={{ background: 'var(--bg-tertiary, #f8fafc)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700' }}>Vercel Cron Path</span>
                <div style={{ fontWeight: '600', fontSize: '0.82rem', marginTop: '2px', fontFamily: 'monospace' }}>
                  {emailStatus?.cronPath || '/api/cron/daily-delivery-report'}
                </div>
              </div>
            </div>

            {/* Important Resend Test Mode Note */}
            <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px', padding: '12px 16px', fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '18px' }}>
              <div style={{ fontWeight: '700', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <ShieldCheck size={16} /> Resend Sandbox & Custom Domain Guidance:
              </div>
              <ul style={{ margin: '4px 0 0 0', paddingLeft: '18px', lineHeight: '1.5' }}>
                <li>
                  <strong>Free Testing Mode:</strong> If using <code>onboarding@resend.dev</code> without a verified custom domain, Resend strictly allows sending test emails to the <strong>email address you used to register your Resend account</strong>.
                </li>
                <li>
                  <strong>Production Business Email:</strong> To deliver reports directly to any external business email address, add and verify your custom domain in Resend Dashboard (<code>Domains</code> → Add DNS records).
                </li>
              </ul>
            </div>

            {/* Test Action Controls */}
            <div style={{ background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', marginTop: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Send size={16} /> Admin Test Action & Live HTML Preview
              </h3>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Business Date for Report:
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={testDate}
                    onChange={(e) => setTestDate(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ flex: '2 1 260px' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Test Recipient Email (must be your Resend-registered email in test mode):
                  </label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="e.g. your-resend-account@gmail.com"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleOpenPreview}
                    className="btn btn-outline"
                    disabled={previewLoading}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Eye size={16} />
                    {previewLoading ? 'Loading Preview...' : 'Preview Email HTML'}
                  </button>

                  <button
                    onClick={handleSendTestEmail}
                    className="btn btn-primary"
                    disabled={sendingEmail}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Send size={16} className={sendingEmail ? 'spin' : ''} />
                    {sendingEmail ? 'Sending Test...' : 'Send Test Email Now'}
                  </button>
                </div>
              </div>

              {/* Action Result Notification Banner */}
              {emailActionResult && (
                <div style={{
                  marginTop: '16px',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  border: `1px solid ${emailActionResult.success ? '#86efac' : '#fca5a5'}`,
                  background: emailActionResult.success ? '#f0fdf4' : '#fef2f2',
                  color: emailActionResult.success ? '#15803d' : '#b91c1c'
                }}>
                  <div style={{ fontWeight: '700', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {emailActionResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    {emailActionResult.success ? 'Email Sent Successfully' : 'Email Send Result'}
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

          {/* Email Delivery Audit Logs Table */}
          <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700' }}>Recent Email Report Delivery Logs</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Audit trail of automated Vercel Cron jobs and Admin manual test runs
                </span>
              </div>
              <button onClick={fetchEmailStatus} className="btn btn-outline btn-sm" disabled={emailLoading}>
                <RefreshCw size={14} className={emailLoading ? 'spin' : ''} /> Refresh
              </button>
            </div>

            {(!emailStatus?.recentLogs || emailStatus.recentLogs.length === 0) ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                No email reports have been sent or logged yet. Send a test email above or wait for the scheduled morning cron.
              </div>
            ) : (
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Report Date</th>
                      <th>Trigger</th>
                      <th>Recipient</th>
                      <th>Status</th>
                      <th>Message ID / Detail</th>
                      <th>Logged At (IST)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailStatus.recentLogs.map((log) => {
                      let statusBadge = 'badge-gray';
                      if (log.status === 'SENT') statusBadge = 'badge-success';
                      else if (log.status === 'FAILED') statusBadge = 'badge-danger';
                      else if (log.status === 'SKIPPED_DUPLICATE') statusBadge = 'badge-warning';

                      return (
                        <tr key={log.id}>
                          <td style={{ fontWeight: '600' }}>{log.report_date}</td>
                          <td>
                            <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                              {log.trigger_type}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.82rem' }}>{log.recipient_email}</td>
                          <td>
                            <span className={`badge ${statusBadge}`} style={{ fontSize: '0.75rem' }}>
                              {log.status}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.78rem', maxWidth: '280px', wordBreak: 'break-all' }}>
                            {log.resend_id ? (
                              <span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>{log.resend_id}</span>
                            ) : (
                              <span style={{ color: 'var(--accent-red)' }}>{log.error_message || '-'}</span>
                            )}
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {log.created_at}
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

      {/* Interactive Email HTML Preview Modal */}
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
            maxWidth: '740px',
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
                  Email Report HTML Preview — {testDate}
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Visual preview as rendered inside desktop & mobile email clients
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

            {/* Quick Metrics Bar if loaded */}
            {previewData && (
              <div style={{
                display: 'flex',
                gap: '12px',
                padding: '10px 20px',
                background: 'var(--bg-tertiary, #f1f5f9)',
                borderBottom: '1px solid var(--border-color)',
                fontSize: '0.78rem',
                flexWrap: 'wrap'
              }}>
                <span>🥛 Milk: <strong>{previewData.milk?.totalLitres || 0} L</strong></span>
                <span>🥣 Curd: <strong>{previewData.curd?.totalKgLitres || 0} kg/L</strong></span>
                <span>👥 Customers: <strong>{previewData.overview?.customersServed || 0}</strong></span>
                <span>💰 Payments: <strong>₹{previewData.payments?.totalReceived || 0}</strong></span>
              </div>
            )}

            {/* Modal Body: Responsive HTML Iframe */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px', background: '#e2e8f0' }}>
              {previewLoading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#475569' }}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px auto', display: 'block' }} />
                  Rendering live email preview...
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
                  textAlign: 'center',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.08)'
                }}>
                  <AlertTriangle size={32} color="#dc2626" style={{ margin: '0 auto 10px auto', display: 'block' }} />
                  <div style={{ fontWeight: '700', fontSize: '1rem', color: '#991b1b' }}>
                    Failed to generate email report preview
                  </div>
                  <div style={{ fontSize: '0.85rem', marginTop: '6px', color: '#b91c1c' }}>
                    {previewError}
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button
                      onClick={handleOpenPreview}
                      className="btn btn-primary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <RefreshCw size={14} /> Retry Preview
                    </button>
                    <button
                      onClick={() => setPreviewModalOpen(false)}
                      className="btn btn-outline btn-sm"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                <iframe
                  title="Daily Email Preview"
                  srcDoc={previewHtml}
                  style={{
                    width: '100%',
                    height: '540px',
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
                  handleSendTestEmail();
                }}
                className="btn btn-primary btn-sm"
                disabled={sendingEmail}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Send size={14} /> Send Email Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
