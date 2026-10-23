import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import { Settings, Shield, Database, Save, CheckCircle2, AlertCircle, Sun, Moon, Monitor, Palette } from 'lucide-react';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
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

  const themeOptions = [
    {
      id: 'light',
      label: 'Light Theme',
      description: 'Clean, crisp daytime appearance with bright white cards & Nandini blue',
      icon: Sun,
      color: '#0054a6',
      bgPreview: '#ffffff',
      borderPreview: '#cbd5e1'
    },
    {
      id: 'dark',
      label: 'Dark Theme',
      description: 'Obsidian dark mode with reduced glare and comfortable night-time contrast',
      icon: Moon,
      color: '#38bdf8',
      bgPreview: '#131b2e',
      borderPreview: '#334155'
    },
    {
      id: 'system',
      label: 'System Auto',
      description: 'Automatically follows your operating system / device appearance preference',
      icon: Monitor,
      color: '#10b981',
      bgPreview: 'linear-gradient(135deg, #ffffff 50%, #131b2e 50%)',
      borderPreview: '#64748b'
    }
  ];

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Settings size={28} color="var(--primary)" />
            System & Business Configuration
          </h1>
          <p className="page-subtitle">Server-side business rules, theme appearance, and operational switches</p>
        </div>
      </div>

      {/* Theme & Appearance Configuration Card */}
      <div className="card" style={{ maxWidth: '700px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <Palette size={22} color="var(--primary)" />
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
              Theme & Appearance
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              Choose your preferred visual theme for day or night delivery operations
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const isSelected = theme === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => setTheme(opt.id)}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                  background: isSelected ? 'var(--primary-light)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: opt.bgPreview,
                    border: `1px solid ${opt.borderPreview}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}>
                    <Icon size={18} color={opt.color} />
                  </div>
                  {isSelected && (
                    <div style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ffffff' }} />
                    </div>
                  )}
                </div>

                <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                  {opt.description}
                </div>
              </div>
            );
          })}
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
