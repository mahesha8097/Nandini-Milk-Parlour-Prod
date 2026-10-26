import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import CustomerSearchSelect from '../../components/common/CustomerSearchSelect';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertCircle,
  Bell,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Download,
  Trash2,
  Search,
  Filter,
  MapPin,
  Phone,
  User,
  Clock,
  Sparkles,
  RefreshCw,
  Info
} from 'lucide-react';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import {
  addDays,
  generateGoogleCalendarPauseUrl,
  generateGoogleCalendarResumeUrl,
  downloadIcsFile
} from '../../utils/calendarUtils';

export default function DeliveryCalendarPage() {
  const todayStr = getLocalDateString();
  const [selectedMonth, setSelectedMonth] = useState(() => todayStr.slice(0, 7)); // YYYY-MM
  const [selectedDateFilter, setSelectedDateFilter] = useState(null); // specific day clicked in month
  const [viewMode, setViewMode] = useState('GRID'); // 'GRID' | 'LIST'
  const [searchQuery, setSearchQuery] = useState('');
  const [routeFilter, setRouteFilter] = useState('ALL');

  // Server data
  const [vacations, setVacations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [notifications, setNotifications] = useState({ pausedToday: [], resumingTomorrow: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Schedule Vacation Modal state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleMode, setScheduleMode] = useState('RANGE'); // 'RANGE' | 'CUSTOM_DATES'
  const [selectedCustomDates, setSelectedCustomDates] = useState([]); // array of 'YYYY-MM-DD'
  const [customPickerMonth, setCustomPickerMonth] = useState(() => todayStr.slice(0, 7)); // 'YYYY-MM'
  const [scheduleForm, setScheduleForm] = useState({
    customer_id: '',
    start_date: todayStr,
    end_date: todayStr,
    reason: 'Out of town / Vacation',
    custom_reason: '',
    syncGoogle: true
  });
  const [submittingSchedule, setSubmittingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState('');

  // Event Detail Modal state
  const [selectedEvent, setSelectedEvent] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4500);
  };

  // ----------------------------------------------------
  // CUSTOM DATES PICKER HELPERS
  // ----------------------------------------------------
  const toggleCustomDate = (dateStr) => {
    setSelectedCustomDates(prev => {
      if (prev.includes(dateStr)) {
        return prev.filter(d => d !== dateStr);
      } else {
        return [...prev, dateStr].sort();
      }
    });
  };

  const handlePrevPickerMonth = () => {
    const [y, m] = customPickerMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const pad = (n) => String(n).padStart(2, '0');
    setCustomPickerMonth(`${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`);
  };

  const handleNextPickerMonth = () => {
    const [y, m] = customPickerMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    const pad = (n) => String(n).padStart(2, '0');
    setCustomPickerMonth(`${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}`);
  };

  const handleSelectSundays = () => {
    const [y, m] = customPickerMonth.split('-').map(Number);
    const totalDays = new Date(y, m, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');
    const sundays = [];
    for (let d = 1; d <= totalDays; d++) {
      const dayOfWeek = new Date(y, m - 1, d).getDay();
      if (dayOfWeek === 0) {
        sundays.push(`${customPickerMonth}-${pad(d)}`);
      }
    }
    setSelectedCustomDates(prev => [...new Set([...prev, ...sundays])].sort());
  };

  const handleSelectWeekends = () => {
    const [y, m] = customPickerMonth.split('-').map(Number);
    const totalDays = new Date(y, m, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');
    const weekends = [];
    for (let d = 1; d <= totalDays; d++) {
      const dayOfWeek = new Date(y, m - 1, d).getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekends.push(`${customPickerMonth}-${pad(d)}`);
      }
    }
    setSelectedCustomDates(prev => [...new Set([...prev, ...weekends])].sort());
  };

  const handleClearCustomDates = () => {
    setSelectedCustomDates([]);
  };

  // Custom calendar picker grid data
  const customCalendarGridData = useMemo(() => {
    const [year, month] = customPickerMonth.split('-').map(Number);
    const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 = Sun
    const totalDays = new Date(year, month, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');

    const cells = [];
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push({ blank: true, key: `picker-blank-${i}` });
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${customPickerMonth}-${pad(d)}`;
      const dayOfWeek = new Date(year, month - 1, d).getDay();
      const isSelected = selectedCustomDates.includes(dateStr);
      const isToday = dateStr === todayStr;

      cells.push({
        blank: false,
        dayNumber: d,
        dateStr,
        dayOfWeek,
        isSelected,
        isToday,
        key: `picker-day-${dateStr}`
      });
    }

    return cells;
  }, [customPickerMonth, selectedCustomDates, todayStr]);

  // ----------------------------------------------------
  // DATA FETCHING
  // ----------------------------------------------------
  const fetchCalendarData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const [eventsRes, notifsRes, custsRes, routesRes] = await Promise.all([
        api.get('/calendar/events', { params: { month: selectedMonth } }).catch(() => ({ vacations: [] })),
        api.get('/calendar/notifications', { params: { date: todayStr } }).catch(() => ({ pausedToday: [], resumingTomorrow: [] })),
        api.get('/customers').catch(() => []),
        api.get('/routes').catch(() => [])
      ]);

      setVacations(eventsRes?.vacations || []);
      setNotifications(notifsRes || { pausedToday: [], resumingTomorrow: [] });
      setCustomers(custsRes || []);
      setRoutes(routesRes || []);

      if (custsRes && custsRes.length > 0 && !scheduleForm.customer_id) {
        setScheduleForm(prev => ({ ...prev, customer_id: String(custsRes[0].id) }));
      }
    } catch (err) {
      console.error('Failed to load calendar events:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCalendarData();
  }, [selectedMonth]);

  // ----------------------------------------------------
  // MONTH & DATE NAVIGATION
  // ----------------------------------------------------
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const pad = (n) => String(n).padStart(2, '0');
    setSelectedMonth(`${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`);
    setSelectedDateFilter(null);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    const pad = (n) => String(n).padStart(2, '0');
    setSelectedMonth(`${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}`);
    setSelectedDateFilter(null);
  };

  const handleCurrentMonth = () => {
    setSelectedMonth(todayStr.slice(0, 7));
    setSelectedDateFilter(null);
  };

  // ----------------------------------------------------
  // SCHEDULE VACATION HANDLER
  // ----------------------------------------------------
  const handleOpenScheduleModal = (presetDate = null, defaultMode = 'RANGE') => {
    setScheduleError('');
    setScheduleMode(defaultMode);
    if (presetDate) {
      setSelectedCustomDates([presetDate]);
      setCustomPickerMonth(presetDate.slice(0, 7));
    } else {
      setSelectedCustomDates([]);
      setCustomPickerMonth(selectedMonth || todayStr.slice(0, 7));
    }
    setScheduleForm({
      customer_id: '',
      start_date: presetDate || todayStr,
      end_date: presetDate || todayStr,
      reason: 'Out of town / Vacation',
      custom_reason: '',
      syncGoogle: true
    });
    setIsScheduleModalOpen(true);
  };

  const handleSubmitSchedule = async (e) => {
    e.preventDefault();
    setScheduleError('');

    if (!scheduleForm.customer_id) {
      setScheduleError('Please select a customer');
      return;
    }

    if (scheduleMode === 'CUSTOM_DATES') {
      if (!selectedCustomDates || selectedCustomDates.length === 0) {
        setScheduleError('Please click and select at least one date on the calendar where no milk is required.');
        return;
      }
    } else {
      if (!scheduleForm.start_date || !scheduleForm.end_date) {
        setScheduleError('Start date and end date are required');
        return;
      }
      if (scheduleForm.start_date > scheduleForm.end_date) {
        setScheduleError('Start date cannot be after end date');
        return;
      }
    }

    const effectiveReason = scheduleForm.reason === 'Other'
      ? (scheduleForm.custom_reason.trim() || 'Customer requested pause')
      : scheduleForm.reason;

    try {
      setSubmittingSchedule(true);
      const payload = {
        customer_id: parseInt(scheduleForm.customer_id, 10),
        reason: effectiveReason
      };

      if (scheduleMode === 'CUSTOM_DATES') {
        payload.dates = selectedCustomDates;
      } else {
        payload.start_date = scheduleForm.start_date;
        payload.end_date = scheduleForm.end_date;
      }

      const res = await api.post('/calendar/vacations', payload);

      setIsScheduleModalOpen(false);
      showToast(`✅ ${res.message || 'Milk pause scheduled successfully!'}`);

      // Open Google Calendar in new tab if requested
      if (scheduleForm.syncGoogle && res.vacation?.google_calendar_url) {
        window.open(res.vacation.google_calendar_url, '_blank');
      }

      await fetchCalendarData(true);
    } catch (err) {
      setScheduleError(err.message || 'Failed to schedule vacation');
    } finally {
      setSubmittingSchedule(false);
    }
  };

  const handleCancelVacation = async (vacationId, customerName = '') => {
    const nameStr = customerName ? ` for ${customerName}` : '';
    if (!window.confirm(`Cancel this milk pause${nameStr} and restore normal deliveries?`)) {
      return;
    }
    try {
      await api.delete(`/calendar/vacations/${vacationId}`);
      showToast(`✅ Milk pause cancelled${nameStr}. Normal deliveries restored.`);
      setSelectedEvent(null);
      await fetchCalendarData(true);
    } catch (err) {
      alert(err.message || 'Failed to cancel vacation');
    }
  };

  // ----------------------------------------------------
  // CALENDAR GRID COMPUTATION
  // ----------------------------------------------------
  const calendarGridData = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 = Sun
    const totalDays = new Date(year, month, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');

    const days = [];
    // Leading blanks
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ blank: true, key: `blank-${i}` });
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${selectedMonth}-${pad(d)}`;
      const isToday = dateStr === todayStr;

      // Filter active vacations covering this date
      const rawDayVacations = vacations.filter(v => {
        const matchesDate = v.start_date <= dateStr && v.end_date >= dateStr;
        const matchesSearch = !searchQuery || 
          v.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.flat_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.zone_name?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRoute = routeFilter === 'ALL' || String(v.customer_route) === String(routeFilter);
        return matchesDate && matchesSearch && matchesRoute;
      });

      // Deduplicate so a customer NEVER appears twice on the same day cell!
      const uniqueCustMap = new Map();
      for (const v of rawDayVacations) {
        if (!uniqueCustMap.has(v.customer_id)) {
          uniqueCustMap.set(v.customer_id, v);
        }
      }
      const dayVacations = Array.from(uniqueCustMap.values());

      // Filter vacations resuming tomorrow (1-day prior alert on this date)
      // Exclude customers who are already shown as paused on this cell to avoid duplicate/contradictory badges
      const resumingVacations = vacations.filter(v => {
        const isPriorDay = v.end_date === dateStr || v.notify_agent_date === dateStr;
        const matchesSearch = !searchQuery || 
          v.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.flat_no?.toLowerCase().includes(searchQuery.toLowerCase());
        const alreadyPausedHere = uniqueCustMap.has(v.customer_id);
        return isPriorDay && matchesSearch && !alreadyPausedHere;
      });

      days.push({
        dayNumber: d,
        dateStr,
        isToday,
        vacations: dayVacations,
        resuming: resumingVacations,
        key: dateStr
      });
    }

    return days;
  }, [selectedMonth, vacations, searchQuery, routeFilter, todayStr]);

  // Filtered List of all vacations for List View
  const filteredVacationsList = useMemo(() => {
    return vacations.filter(v => {
      const matchesSearch = !searchQuery ||
        v.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.flat_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.zone_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.reason?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRoute = routeFilter === 'ALL' || String(v.customer_route) === String(routeFilter);
      const matchesSelectedDate = !selectedDateFilter || (v.start_date <= selectedDateFilter && v.end_date >= selectedDateFilter);
      return matchesSearch && matchesRoute && matchesSelectedDate;
    });
  }, [vacations, searchQuery, routeFilter, selectedDateFilter]);

  // Selected Customer for form helper
  const formCustomer = customers.find(c => String(c.id) === String(scheduleForm.customer_id));
  const calculatedResumeDate = scheduleForm.end_date ? addDays(scheduleForm.end_date, 1) : '';
  const calculatedAlertDate = scheduleForm.end_date || '';

  return (
    <div className="page-wrapper" style={{ paddingBottom: '60px' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          background: '#0f172a',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '10px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
          zIndex: 9999,
          fontWeight: 700,
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <Sparkles size={18} color="#60a5fa" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '20px'
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calendar size={28} color="var(--primary)" />
            <span>Customer Delivery Calendar</span>
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem', fontWeight: 500 }}>
            Schedule milk pauses & vacations, notify delivery boys, get prior resume reminders, and sync to Google Calendar.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => handleOpenScheduleModal(null, 'CUSTOM_DATES')}
            className="btn btn-outline"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 800,
              padding: '10px 16px',
              color: '#b91c1c',
              borderColor: '#fca5a5',
              background: '#fef2f2',
              boxShadow: '0 2px 8px rgba(220,38,38,0.1)'
            }}
            title="Mark specific dates when customer requests no milk"
          >
            <Calendar size={18} color="#dc2626" />
            <span>Mark "No Milk" Dates</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenScheduleModal(null, 'RANGE')}
            className="btn btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 800,
              padding: '10px 18px',
              boxShadow: '0 4px 14px rgba(0,84,166,0.25)'
            }}
          >
            <Plus size={18} />
            <span>Schedule Milk Pause</span>
          </button>

          <button
            type="button"
            onClick={() => fetchCalendarData(true)}
            className="btn btn-outline"
            style={{ padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Refresh Calendar"
            disabled={refreshing}
          >
            <RefreshCw size={18} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Real-time Today & Tomorrow Alert Banners */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px', marginBottom: '22px' }}>
        {/* Banner 1: Paused Today (Delivery Boy Do Not Deliver Warning) */}
        <div style={{
          background: notifications.pausedCount > 0 ? 'var(--accent-red-light)' : 'var(--bg-card)',
          border: `1.5px solid ${notifications.pausedCount > 0 ? 'var(--accent-red)' : 'var(--border-color)'}`,
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px'
        }}>
          <div style={{
            background: notifications.pausedCount > 0 ? 'var(--accent-red-light)' : 'var(--bg-surface)',
            color: notifications.pausedCount > 0 ? 'var(--accent-red)' : 'var(--text-secondary)',
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <XCircle size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: notifications.pausedCount > 0 ? 'var(--accent-red)' : 'var(--text-secondary)', textTransform: 'uppercase' }}>
                Today's Paused Deliveries ({notifications.pausedCount})
              </span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                {formatDisplayDate(todayStr)}
              </span>
            </div>
            {notifications.pausedCount > 0 ? (
              <div style={{ marginTop: '4px' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-red)' }}>
                  ⛔ DO NOT DELIVER: {notifications.pausedCount} customer{notifications.pausedCount > 1 ? 's' : ''} requested milk stop today.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {notifications.pausedToday.slice(0, 3).map((p, i) => (
                    <span key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                      {p.flat_no ? `${p.flat_no} - ` : ''}{p.customer_name}
                    </span>
                  ))}
                  {notifications.pausedCount > 3 && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-red)' }}>
                      +{notifications.pausedCount - 3} more
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                No active delivery pauses today. Normal route delivery in progress.
              </p>
            )}
          </div>
        </div>

        {/* Banner 2: 1-Day Prior Resume Reminder (Agent Procurement Notice) */}
        <div style={{
          background: notifications.resumingCount > 0 ? 'var(--primary-light)' : 'var(--bg-card)',
          border: `1.5px solid ${notifications.resumingCount > 0 ? 'var(--primary)' : 'var(--border-color)'}`,
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px'
        }}>
          <div style={{
            background: notifications.resumingCount > 0 ? 'var(--primary-light)' : 'var(--bg-surface)',
            color: notifications.resumingCount > 0 ? 'var(--primary)' : 'var(--text-secondary)',
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Bell size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: notifications.resumingCount > 0 ? 'var(--primary)' : 'var(--text-secondary)', textTransform: 'uppercase' }}>
                🔔 1-Day Prior Alert: Resumes Tomorrow ({notifications.resumingCount})
              </span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                Tomorrow: {formatDisplayDate(notifications.tomorrow || addDays(todayStr, 1))}
              </span>
            </div>
            {notifications.resumingCount > 0 ? (
              <div style={{ marginTop: '4px' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary)' }}>
                  Procure milk today: {notifications.resumingCount} customer{notifications.resumingCount > 1 ? 's' : ''} resume milk tomorrow!
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                  {notifications.resumingTomorrow.map((r, i) => (
                    <span key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--primary)', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                      {r.flat_no ? `${r.flat_no} - ` : ''}{r.customer_name} ({r.products_summary || 'Milk'})
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                No customer delivery pauses are scheduled to resume tomorrow.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main Filter & Navigation Controls Card */}
      <div className="card" style={{ padding: '16px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          {/* Month Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button type="button" onClick={handlePrevMonth} className="btn btn-outline btn-sm" title="Previous Month">
              <ChevronLeft size={16} />
            </button>
            <input
              type="month"
              className="form-input"
              style={{ fontWeight: 800, fontSize: '0.9rem', width: '160px', padding: '6px 10px' }}
              value={selectedMonth}
              onChange={(e) => {
                setSelectedMonth(e.target.value);
                setSelectedDateFilter(null);
              }}
            />
            <button type="button" onClick={handleNextMonth} className="btn btn-outline btn-sm" title="Next Month">
              <ChevronRight size={16} />
            </button>
            <button type="button" onClick={handleCurrentMonth} className="btn btn-outline btn-sm" style={{ fontWeight: 700 }}>
              Current Month
            </button>
          </div>

          {/* Search & Route Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '200px' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search customer / flat..."
                className="form-input"
                style={{ paddingLeft: '32px', fontSize: '0.85rem' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className="form-select"
              style={{ fontSize: '0.85rem', fontWeight: 700, width: '150px' }}
              value={routeFilter}
              onChange={(e) => setRouteFilter(e.target.value)}
            >
              <option value="ALL">All Routes</option>
              {routes.map(r => (
                <option key={r.id} value={r.name}>{r.name}</option>
              ))}
            </select>

            {/* View Switcher */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
              <button
                type="button"
                onClick={() => setViewMode('GRID')}
                style={{
                  background: viewMode === 'GRID' ? 'white' : 'transparent',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  color: viewMode === 'GRID' ? '#0054a6' : '#64748b',
                  cursor: 'pointer',
                  boxShadow: viewMode === 'GRID' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                Month Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('LIST')}
                style={{
                  background: viewMode === 'LIST' ? 'white' : 'transparent',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  color: viewMode === 'LIST' ? '#0054a6' : '#64748b',
                  cursor: 'pointer',
                  boxShadow: viewMode === 'LIST' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                List View ({filteredVacationsList.length})
              </button>
            </div>
          </div>
        </div>

        {selectedDateFilter && (
          <div style={{
            marginTop: '12px',
            padding: '12px 16px',
            background: '#f8fafc',
            border: '1.5px solid #e2e8f0',
            borderRadius: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={16} color="#2563eb" />
                <span>Selected Date: <strong>{formatDisplayDate(selectedDateFilter)}</strong></span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedDateFilter(null)}
                className="btn btn-outline btn-sm"
                style={{ fontSize: '0.74rem', padding: '2px 8px' }}
              >
                Clear Day Filter
              </button>
            </div>

            {/* List of paused customers on this selected day with instant cancel button! */}
            {(() => {
              const pausedOnThisDate = vacations.filter(v => v.start_date <= selectedDateFilter && v.end_date >= selectedDateFilter);
              const uniqueOnDate = Array.from(new Map(pausedOnThisDate.map(v => [v.customer_id, v])).values());
              if (uniqueOnDate.length === 0) {
                return (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', color: '#64748b', padding: '4px 0', flexWrap: 'wrap', gap: '8px' }}>
                    <span>✅ No milk pauses scheduled for this date. Regular deliveries will happen normally.</span>
                    <button
                      type="button"
                      onClick={() => handleOpenScheduleModal(selectedDateFilter, 'CUSTOM_DATES')}
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: '0.74rem', padding: '3px 8px', color: '#b91c1c', borderColor: '#fca5a5', fontWeight: 700 }}
                    >
                      + Mark No Milk on {selectedDateFilter.slice(8)}th
                    </button>
                  </div>
                );
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#b91c1c' }}>
                    ⛔ {uniqueOnDate.length} customer(s) have milk delivery PAUSED on this date:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {uniqueOnDate.map(v => (
                      <div
                        key={v.id}
                        style={{
                          background: '#fee2e2',
                          border: '1px solid #fca5a5',
                          borderRadius: '8px',
                          padding: '6px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          fontSize: '0.84rem'
                        }}
                      >
                        <div>
                          <strong style={{ color: '#0f172a' }}>{v.flat_no ? `[${v.flat_no}] ` : ''}{v.customer_name}</strong>
                          <span style={{ color: '#b91c1c', marginLeft: '6px', fontSize: '0.75rem', fontWeight: 600 }}>({v.reason || 'No Milk'})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCancelVacation(v.id, v.customer_name)}
                          className="btn btn-sm"
                          style={{
                            background: '#dc2626',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontWeight: 800,
                            fontSize: '0.72rem',
                            padding: '3px 8px',
                            cursor: 'pointer'
                          }}
                          title="Cancel pause and resume deliveries for this customer"
                        >
                          ✕ Cancel Pause & Resume Milk
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* VIEW MODE: MONTH GRID */}
      {viewMode === 'GRID' ? (
        <div className="card" style={{ padding: '16px' }}>
          {/* Day of Week Labels */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', textAlign: 'center', marginBottom: '8px' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dw, i) => (
              <div key={dw} style={{
                fontSize: '0.78rem',
                fontWeight: 900,
                color: i === 0 ? '#ef4444' : 'var(--text-primary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                {dw}
              </div>
            ))}
          </div>

          {/* Calendar Grid Cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
            {calendarGridData.map((cell) => {
              if (cell.blank) {
                return (
                  <div
                    key={cell.key}
                    style={{
                      minHeight: '105px',
                      background: 'var(--bg-surface)',
                      borderRadius: '8px',
                      border: '1px dashed var(--border-color)',
                      opacity: 0.5
                    }}
                  />
                );
              }

              const isFiltered = selectedDateFilter === cell.dateStr;
              const hasEvents = cell.vacations.length > 0 || cell.resuming.length > 0;

              return (
                <div
                  key={cell.key}
                  onClick={() => {
                    if (selectedDateFilter === cell.dateStr) {
                      setSelectedDateFilter(null);
                    } else {
                      setSelectedDateFilter(cell.dateStr);
                    }
                  }}
                  style={{
                    minHeight: '105px',
                    background: cell.isToday ? 'var(--secondary-light)' : (isFiltered ? 'var(--primary-light)' : 'var(--bg-card)'),
                    borderRadius: '10px',
                    border: `1.5px solid ${cell.isToday ? 'var(--secondary)' : (isFiltered ? 'var(--primary)' : 'var(--border-color)')}`,
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isFiltered ? '0 4px 12px rgba(37,99,235,0.15)' : 'none',
                    position: 'relative'
                  }}
                >
                  {/* Cell Header: Day Number & Today indicator */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '0.88rem',
                      fontWeight: cell.isToday ? 900 : 700,
                      color: cell.isToday ? 'var(--secondary)' : 'var(--text-primary)'
                    }}>
                      {cell.dayNumber}
                    </span>
                    {cell.isToday && (
                      <span style={{
                        background: '#22c55e',
                        color: 'white',
                        fontSize: '0.65rem',
                        fontWeight: 900,
                        padding: '1px 6px',
                        borderRadius: '999px',
                        letterSpacing: '0.02em'
                      }}>
                        TODAY
                      </span>
                    )}
                  </div>

                  {/* Paused Customers Badges (Do Not Deliver) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
                    {cell.vacations.slice(0, 2).map((v) => (
                      <div
                        key={v.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(v);
                        }}
                        style={{
                          background: '#fee2e2',
                          border: '1px solid #fca5a5',
                          borderRadius: '4px',
                          padding: '2px 5px',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          color: '#b91c1c',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '3px',
                          cursor: 'pointer'
                        }}
                        title={`🚫 Milk Paused: ${v.customer_name} (${v.start_date} to ${v.end_date}) — Click to view details or ✕ to cancel`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#dc2626', flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.flat_no ? `${v.flat_no} ` : ''}{v.customer_name}</span>
                        </div>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelVacation(v.id, v.customer_name);
                          }}
                          style={{
                            color: '#b91c1c',
                            fontWeight: 900,
                            fontSize: '0.75rem',
                            padding: '0 3px',
                            borderRadius: '3px',
                            background: '#fecaca',
                            lineHeight: 1,
                            flexShrink: 0
                          }}
                          title={`Cancel pause and resume deliveries for ${v.customer_name}`}
                        >
                          ✕
                        </span>
                      </div>
                    ))}

                    {cell.vacations.length > 2 && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#dc2626', paddingLeft: '2px' }}>
                        +{cell.vacations.length - 2} more paused
                      </span>
                    )}

                    {/* Resumes Tomorrow Badges (Prior Alert) */}
                    {cell.resuming.slice(0, 1).map((r) => (
                      <div
                        key={`res-${r.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(r);
                        }}
                        style={{
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          borderRadius: '4px',
                          padding: '2px 5px',
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          color: '#1d4ed8',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                        title={`🔔 Prior Reminder: ${r.customer_name} resumes milk tomorrow`}
                      >
                        <Bell size={10} color="#1d4ed8" style={{ flexShrink: 0 }} />
                        <span>Resumes: {r.customer_name}</span>
                      </div>
                    ))}
                  </div>

                  {/* Empty Cell Quick Add on Hover */}
                  {!hasEvents && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: '4px' }}>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenScheduleModal(cell.dateStr, 'CUSTOM_DATES');
                        }}
                        style={{
                          fontSize: '0.68rem',
                          color: '#b91c1c',
                          fontWeight: 800,
                          padding: '2px 5px',
                          borderRadius: '4px',
                          background: '#fef2f2',
                          border: '1px solid #fecaca',
                          cursor: 'pointer'
                        }}
                        title="Click to mark this day as No Milk for a customer"
                      >
                        + No Milk
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* VIEW MODE: LIST VIEW */
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>
              Scheduled Milk Pauses ({filteredVacationsList.length})
            </h3>
          </div>

          {filteredVacationsList.length === 0 ? (
            <EmptyState
              icon={Calendar}
              title="No Delivery Pauses Scheduled"
              description="No customers are currently paused in this period. Customers who request leave will appear here."
              actionLabel="Schedule Pause"
              onAction={() => handleOpenScheduleModal()}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredVacationsList.map((v) => {
                const isActive = v.start_date <= todayStr && v.end_date >= todayStr;
                const isUpcoming = v.start_date > todayStr;
                const isEnded = v.end_date < todayStr;

                return (
                  <div
                    key={v.id}
                    style={{
                      background: isActive ? '#fef2f2' : '#f8fafc',
                      border: `1.5px solid ${isActive ? '#fca5a5' : '#e2e8f0'}`,
                      borderRadius: '10px',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {v.flat_no && (
                          <span style={{ background: '#2563eb', color: 'white', fontWeight: 900, fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px' }}>
                            {v.flat_no}
                          </span>
                        )}
                        <span style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>
                          {v.customer_name}
                        </span>
                        {isActive && (
                          <span style={{ background: '#dc2626', color: 'white', fontWeight: 800, fontSize: '0.68rem', padding: '2px 7px', borderRadius: '4px' }}>
                            PAUSED TODAY
                          </span>
                        )}
                        {isUpcoming && (
                          <span style={{ background: '#eff6ff', color: '#1d4ed8', fontWeight: 800, fontSize: '0.68rem', padding: '2px 7px', borderRadius: '4px' }}>
                            UPCOMING
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.82rem', color: '#64748b', marginTop: '4px', flexWrap: 'wrap' }}>
                        <span>📅 <strong>{v.start_date}</strong> to <strong>{v.end_date}</strong></span>
                        <span>• Resumes: <strong style={{ color: '#15803d' }}>{v.resume_date}</strong></span>
                        <span>• Reason: <em>{v.reason || 'Vacation'}</em></span>
                        {v.zone_name && <span>• Zone: {v.zone_name}</span>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Google Calendar Link */}
                      <a
                        href={v.google_calendar_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-outline btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#1d4ed8', borderColor: '#bfdbfe', background: '#eff6ff', fontWeight: 700 }}
                        title="Add pause reminder to Google Calendar"
                      >
                        <Calendar size={13} color="#2563eb" />
                        <span>Google Cal</span>
                        <ExternalLink size={11} />
                      </a>

                      {/* Download .ics */}
                      <button
                        type="button"
                        onClick={() => downloadIcsFile({
                          title: `🚫 Milk Paused: ${v.customer_name}`,
                          startDate: v.start_date,
                          endDate: v.end_date,
                          description: `Customer ${v.customer_name} milk delivery is paused (${v.start_date} to ${v.end_date}). Resumes ${v.resume_date}. Reason: ${v.reason}`,
                          location: v.customer_address
                        })}
                        className="btn btn-outline btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}
                        title="Download .ics file for Apple Calendar or Outlook"
                      >
                        <Download size={13} />
                        <span>.ics</span>
                      </button>

                      {/* Cancel / Resume Delivery */}
                      <button
                        type="button"
                        onClick={() => handleCancelVacation(v.id)}
                        className="btn btn-outline btn-sm"
                        style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2', fontWeight: 700 }}
                        title="Cancel pause and restore normal deliveries"
                      >
                        <Trash2 size={13} />
                        <span>Cancel</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------------- */}
      {/* MODAL 1: SCHEDULE MILK PAUSE / CUSTOM "NO MILK" DAYS                       */}
      {/* ------------------------------------------------------------------------- */}
      {isScheduleModalOpen && (
        <Modal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          title="Schedule Customer Milk Pause / Vacation"
          maxWidth="660px"
        >
          <form onSubmit={handleSubmitSchedule} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {scheduleError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', color: '#dc2626', fontSize: '0.85rem', fontWeight: 700 }}>
                {scheduleError}
              </div>
            )}

            {/* Select Customer */}
            <div>
              <label className="form-label" style={{ fontWeight: 800, marginBottom: '6px' }}>Select Customer *</label>
              <CustomerSearchSelect
                customers={customers}
                value={scheduleForm.customer_id}
                onChange={(id) => setScheduleForm(prev => ({ ...prev, customer_id: id ? String(id) : '' }))}
                placeholder="Type to search customer, flat, phone, route..."
                required
              />
            </div>

            {/* Selection Mode Switcher: Continuous Range vs Custom Dates */}
            <div style={{
              display: 'flex',
              background: '#f1f5f9',
              padding: '4px',
              borderRadius: '10px',
              gap: '4px'
            }}>
              <button
                type="button"
                onClick={() => setScheduleMode('RANGE')}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: scheduleMode === 'RANGE' ? '#ffffff' : 'transparent',
                  color: scheduleMode === 'RANGE' ? '#0054a6' : '#64748b',
                  fontWeight: scheduleMode === 'RANGE' ? 900 : 700,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  boxShadow: scheduleMode === 'RANGE' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <Calendar size={15} />
                <span>Continuous Date Range</span>
              </button>
              <button
                type="button"
                onClick={() => setScheduleMode('CUSTOM_DATES')}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: scheduleMode === 'CUSTOM_DATES' ? '#ffffff' : 'transparent',
                  color: scheduleMode === 'CUSTOM_DATES' ? '#dc2626' : '#64748b',
                  fontWeight: scheduleMode === 'CUSTOM_DATES' ? 900 : 700,
                  fontSize: '0.86rem',
                  cursor: 'pointer',
                  boxShadow: scheduleMode === 'CUSTOM_DATES' ? '0 2px 6px rgba(220,38,38,0.12)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>🗓️ Pick Specific "No Milk" Days</span>
                {selectedCustomDates.length > 0 && (
                  <span style={{
                    background: '#dc2626',
                    color: 'white',
                    fontSize: '0.72rem',
                    fontWeight: 900,
                    padding: '1px 7px',
                    borderRadius: '999px'
                  }}>
                    {selectedCustomDates.length}
                  </span>
                )}
              </button>
            </div>

            {/* MODE 1: CONTINUOUS DATE RANGE */}
            {scheduleMode === 'RANGE' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 800 }}>Stop Delivery From:</label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ fontWeight: 700 }}
                    value={scheduleForm.start_date}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, start_date: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 800 }}>Stop Delivery Until (Inclusive):</label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ fontWeight: 700 }}
                    value={scheduleForm.end_date}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, end_date: e.target.value }))}
                    required
                  />
                </div>
              </div>
            )}

            {/* MODE 2: CUSTOM SPECIFIC DATES (INTERACTIVE CALENDAR GRID) */}
            {scheduleMode === 'CUSTOM_DATES' && (
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #e2e8f0',
                borderRadius: '12px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                {/* Header: Month Navigator + Quick Presets */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={handlePrevPickerMonth}
                      className="btn btn-outline btn-sm"
                      style={{ padding: '4px 8px' }}
                      title="Previous Month"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span style={{ fontWeight: 900, fontSize: '0.92rem', color: '#0f172a', minWidth: '120px', textAlign: 'center' }}>
                      {new Date(parseInt(customPickerMonth.split('-')[0], 10), parseInt(customPickerMonth.split('-')[1], 10) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                      type="button"
                      onClick={handleNextPickerMonth}
                      className="btn btn-outline btn-sm"
                      style={{ padding: '4px 8px' }}
                      title="Next Month"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleSelectSundays}
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: '0.74rem', padding: '3px 8px', fontWeight: 700 }}
                      title="Mark all Sundays of this month as No Milk"
                    >
                      + Sundays
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectWeekends}
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: '0.74rem', padding: '3px 8px', fontWeight: 700 }}
                      title="Mark all Saturdays & Sundays as No Milk"
                    >
                      + Weekends
                    </button>
                    {selectedCustomDates.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearCustomDates}
                        className="btn btn-outline btn-sm"
                        style={{ fontSize: '0.74rem', padding: '3px 8px', fontWeight: 700, color: '#dc2626', borderColor: '#fca5a5' }}
                      >
                        Clear ({selectedCustomDates.length})
                      </button>
                    )}
                  </div>
                </div>

                {/* Day of Week Labels */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dw, i) => (
                    <div key={dw} style={{
                      fontSize: '0.72rem',
                      fontWeight: 900,
                      color: i === 0 ? '#dc2626' : '#64748b',
                      textTransform: 'uppercase'
                    }}>
                      {dw}
                    </div>
                  ))}
                </div>

                {/* Interactive Day Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                  {customCalendarGridData.map((cell) => {
                    if (cell.blank) {
                      return <div key={cell.key} style={{ height: '44px', background: 'transparent' }} />;
                    }

                    return (
                      <button
                        key={cell.key}
                        type="button"
                        onClick={() => toggleCustomDate(cell.dateStr)}
                        style={{
                          height: '46px',
                          background: cell.isSelected ? '#dc2626' : (cell.isToday ? 'var(--secondary-light)' : 'var(--bg-surface)'),
                          color: cell.isSelected ? '#ffffff' : (cell.isToday ? 'var(--secondary)' : 'var(--text-primary)'),
                          border: cell.isSelected
                            ? '2px solid #b91c1c'
                            : (cell.isToday ? '1.5px solid var(--secondary)' : '1px solid var(--border-color)'),
                          borderRadius: '8px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: '2px',
                          boxShadow: cell.isSelected ? '0 2px 6px rgba(220,38,38,0.35)' : 'none',
                          transition: 'all 0.12s ease',
                          position: 'relative'
                        }}
                        title={cell.isSelected ? `Click to unmark ${cell.dateStr}` : `Click to mark ${cell.dateStr} as No Milk`}
                      >
                        <span style={{ fontSize: '0.86rem', fontWeight: cell.isSelected || cell.isToday ? 900 : 700 }}>
                          {cell.dayNumber}
                        </span>
                        {cell.isSelected ? (
                          <span style={{ fontSize: '0.58rem', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1 }}>
                            🚫 No Milk
                          </span>
                        ) : cell.isToday ? (
                          <span style={{ fontSize: '0.55rem', fontWeight: 800, color: '#15803d', lineHeight: 1 }}>
                            Today
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {/* Selected Dates Summary Tray */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155' }}>
                      Selected Dates ({selectedCustomDates.length}):
                    </span>
                    {selectedCustomDates.length > 0 && (
                      <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                        Click any date above or chip below to remove
                      </span>
                    )}
                  </div>

                  {selectedCustomDates.length === 0 ? (
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontStyle: 'italic', padding: '4px 0' }}>
                      No dates marked yet. Click any day on the calendar above to mark it as "No Milk".
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxHeight: '90px', overflowY: 'auto' }}>
                      {selectedCustomDates.map(dStr => (
                        <span
                          key={dStr}
                          onClick={() => toggleCustomDate(dStr)}
                          style={{
                            background: '#fee2e2',
                            border: '1px solid #fca5a5',
                            borderRadius: '6px',
                            color: '#b91c1c',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer'
                          }}
                          title={`Click to remove ${dStr}`}
                        >
                          <span>{formatDisplayDate(dStr)}</span>
                          <span style={{ fontWeight: 900, fontSize: '0.85rem' }}>×</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dynamic Summary Box */}
            <div style={{
              background: '#eff6ff',
              border: '1.5px solid #bfdbfe',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '0.82rem',
              color: '#1e40af',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              {scheduleMode === 'CUSTOM_DATES' ? (
                <>
                  <div><strong>⛔ Delivery Status:</strong> <strong>{selectedCustomDates.length} selected day(s)</strong> will be marked <strong>SKIPPED (₹0 billed)</strong>.</div>
                  <div><strong>🔔 Delivery Boy Alert:</strong> Daily delivery screen will show <strong>"DO NOT DELIVER"</strong> on each selected date.</div>
                  <div><strong>📢 Procurement Alert:</strong> Agent gets prior reminders 1 day before normal deliveries resume.</div>
                </>
              ) : (
                <>
                  <div><strong>⛔ Delivery Status:</strong> Will be marked <strong>SKIPPED (₹0 billed)</strong> from {scheduleForm.start_date} to {scheduleForm.end_date}.</div>
                  <div><strong>✅ Deliveries Resume On:</strong> <strong style={{ color: '#15803d' }}>{calculatedResumeDate}</strong></div>
                  <div><strong>🔔 Prior Notification for Agent:</strong> Alert triggers on <strong>{calculatedAlertDate} (1 day before)</strong> so milk is procured on time!</div>
                </>
              )}
            </div>

            {/* Reason Selector */}
            <div>
              <label className="form-label" style={{ fontWeight: 800 }}>Reason for Pause:</label>
              <select
                className="form-select"
                style={{ fontWeight: 700 }}
                value={scheduleForm.reason}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, reason: e.target.value }))}
              >
                <option value="Out of town / Vacation">Out of town / Vacation</option>
                <option value="Religious fast / Puja">Religious fast / Puja</option>
                <option value="Excess milk from yesterday">Excess milk from yesterday</option>
                <option value="Customer phone request">Customer phone request</option>
                <option value="Other">Other (Enter custom reason)</option>
              </select>
            </div>

            {scheduleForm.reason === 'Other' && (
              <div>
                <input
                  type="text"
                  placeholder="Enter specific reason..."
                  className="form-input"
                  value={scheduleForm.custom_reason}
                  onChange={(e) => setScheduleForm(prev => ({ ...prev, custom_reason: e.target.value }))}
                  required
                />
              </div>
            )}

            {/* Google Calendar Auto-Sync Option */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
              <input
                type="checkbox"
                checked={scheduleForm.syncGoogle}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, syncGoogle: e.target.checked }))}
                style={{ width: '16px', height: '16px', accentColor: '#2563eb' }}
              />
              <span>Open Google Calendar after saving (to set phone push notification reminder)</span>
            </label>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                className="btn btn-outline"
                disabled={submittingSchedule}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ fontWeight: 800, padding: '8px 20px' }}
                disabled={submittingSchedule || (scheduleMode === 'CUSTOM_DATES' && selectedCustomDates.length === 0)}
              >
                {submittingSchedule
                  ? 'Saving Pause...'
                  : (scheduleMode === 'CUSTOM_DATES'
                      ? (selectedCustomDates.length > 0 ? `Confirm ${selectedCustomDates.length} Days "No Milk" (₹0 Billed)` : 'Select Dates on Calendar')
                      : 'Confirm Milk Pause')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ------------------------------------------------------------------------- */}
      {/* MODAL 2: EVENT DETAILS & ACTIONS MODAL                                     */}
      {/* ------------------------------------------------------------------------- */}
      {selectedEvent && (
        <Modal
          isOpen={Boolean(selectedEvent)}
          onClose={() => setSelectedEvent(null)}
          title={`Delivery Event: ${selectedEvent.customer_name}`}
          maxWidth="500px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>
                {selectedEvent.flat_no ? `[${selectedEvent.flat_no}] ` : ''}{selectedEvent.customer_name}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px' }}>
                {selectedEvent.customer_address}
              </div>
              {selectedEvent.customer_phone && (
                <div style={{ fontSize: '0.85rem', color: '#2563eb', fontWeight: 700, marginTop: '2px' }}>
                  📞 {selectedEvent.customer_phone}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.88rem' }}>
              <div><strong>⛔ Pause Duration:</strong> {selectedEvent.start_date} to {selectedEvent.end_date}</div>
              <div><strong>✅ Deliveries Resume:</strong> <span style={{ color: '#15803d', fontWeight: 800 }}>{selectedEvent.resume_date}</span></div>
              <div><strong>🔔 1-Day Prior Alert Date:</strong> {selectedEvent.notify_agent_date}</div>
              <div><strong>📝 Reason:</strong> {selectedEvent.reason || 'Vacation'}</div>
              {selectedEvent.zone_name && <div><strong>🏢 Zone:</strong> {selectedEvent.zone_name}</div>}
              {selectedEvent.customer_route && <div><strong>🚚 Route:</strong> {selectedEvent.customer_route}</div>}
            </div>

            {/* Quick Action Buttons */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Google Calendar Pause Link */}
              <a
                href={selectedEvent.google_calendar_url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontWeight: 800,
                  color: '#1d4ed8',
                  borderColor: '#bfdbfe',
                  background: '#eff6ff'
                }}
              >
                <Calendar size={16} />
                <span>Add Pause Event to Google Calendar</span>
                <ExternalLink size={13} />
              </a>

              {/* Google Calendar Resume Reminder Link */}
              <a
                href={selectedEvent.google_calendar_resume_url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontWeight: 800,
                  color: '#b45309',
                  borderColor: '#fde68a',
                  background: '#fffbeb'
                }}
              >
                <Bell size={16} />
                <span>Add "Resume Tomorrow" Alert to Google Calendar</span>
                <ExternalLink size={13} />
              </a>

              {/* Universal .ics Download */}
              <button
                type="button"
                onClick={() => downloadIcsFile({
                  title: `🚫 Milk Paused: ${selectedEvent.customer_name}`,
                  startDate: selectedEvent.start_date,
                  endDate: selectedEvent.end_date,
                  description: `Customer ${selectedEvent.customer_name} milk delivery paused (${selectedEvent.start_date} to ${selectedEvent.end_date}). Resumes on ${selectedEvent.resume_date}. Reason: ${selectedEvent.reason}`,
                  location: selectedEvent.customer_address
                })}
                className="btn btn-outline"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 700 }}
              >
                <Download size={16} />
                <span>Download .ics File (Apple Calendar / Outlook)</span>
              </button>

              {/* Cancel Pause */}
              <button
                type="button"
                onClick={() => handleCancelVacation(selectedEvent.id)}
                className="btn btn-outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  color: '#dc2626',
                  borderColor: '#fecaca',
                  background: '#fef2f2',
                  fontWeight: 800,
                  marginTop: '4px'
                }}
              >
                <Trash2 size={16} />
                <span>Cancel Pause & Resume Normal Deliveries</span>
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
