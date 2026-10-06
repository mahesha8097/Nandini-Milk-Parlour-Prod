import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { Settings, Shield, Database, Save, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    auto_advance_bill_generation: 'true',
    default_delivery_due_days: '5',
    allow_delivery_boy_adhoc: 'false',
    sms_alerts_enabled: 'false'
  });
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const res = await api.get('/settings');
        if (res) {
          setSettings((prev) => ({ ...prev, ...res }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      await api.post('/settings', settings);
      setSuccess('Settings saved successfully in central database.');
    } catch (err) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Settings size={28} color="var(--primary)" />
            System & Business Configuration
          </h1>
          <p className="page-subtitle">Server-side business rules, automation policies, and operational switches</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: '700px' }}>
        {success && (
          <div style={{ background: 'var(--secondary-light)', color: '#065f46', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
            <CheckCircle2 size={16} />
            <span>{success}</span>
          </div>
        )}

        {error && (
          <div style={{ background: 'var(--accent-red-light)', color: '#991b1b', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label">Automatic Monthly Advance Generation</label>
            <select
              className="form-select"
              value={settings.auto_advance_bill_generation}
              onChange={(e) => setSettings({ ...settings, auto_advance_bill_generation: e.target.value })}
            >
              <option value="true">Enabled (Automatically generate at start of month)</option>
              <option value="false">Disabled (Manual trigger only)</option>
            </select>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Generates advance bills for active prepaid subscribers when the new month starts.
            </span>
          </div>

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label className="form-label">Default Invoice Payment Grace Period (Days)</label>
            <input
              type="number"
              min="1"
              max="30"
              className="form-input"
              value={settings.default_delivery_due_days}
              onChange={(e) => setSettings({ ...settings, default_delivery_due_days: e.target.value })}
            />
          </div>

          <div className="form-group" style={{ marginTop: '16px' }}>
            <label className="form-label">Database & Concurrency Mode</label>
            <input
              type="text"
              className="form-input"
              value="SQLite WAL (Write-Ahead Logging) Single Source of Truth"
              disabled
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: '20px' }} disabled={saving}>
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </form>
      </div>
    </div>
  );
}
