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
  Wallet
} from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';

export default function ReportsPage() {
  const [reportType, setReportType] = useState('DAILY_SALES');
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [startDate, setStartDate] = useState(getLocalDateString(firstOfMonth));
  const [endDate, setEndDate] = useState(getLocalDateString(now));
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

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
    fetchReport();
  }, [reportType, startDate, endDate]);

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
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <FileBarChart size={28} color="var(--primary)" />
            Business Reports & Analytics
          </h1>
          <p className="page-subtitle">Real-time business audit reports with Excel workbook export</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchReport} className="btn btn-outline btn-sm">
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={handleExportExcel} className="btn btn-success btn-sm" disabled={exporting || rows.length === 0}>
            <Download size={16} />
            {exporting ? 'Generating Excel...' : 'Export Excel (.xlsx)'}
          </button>
        </div>
      </div>

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
        <div className="table-container">
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
                  {Object.values(row).map((val, vIdx) => (
                    <td key={vIdx}>
                      {typeof val === 'number' ? (
                        val % 1 !== 0 ? `₹${val.toFixed(2)}` : val
                      ) : (
                        val || '-'
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
