import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { UserCheck, Lock, CheckCircle2, AlertCircle } from 'lucide-react';

export default function DeliveryBoyProfile() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');
      await api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword
      });
      setSuccess('Password updated successfully.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-wrapper" style={{ maxWidth: '600px' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <UserCheck size={28} color="var(--primary)" />
            My Profile
          </h1>
          <p className="page-subtitle">Agent account details & password security</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: '800', marginBottom: '14px' }}>Agent Information</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem' }}>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Full Name: </span>
            <span style={{ fontWeight: '700' }}>{user?.name}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Login Username: </span>
            <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--primary)' }}>{user?.username}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Assigned Route: </span>
            <span style={{ fontWeight: '700' }}>{user?.assigned_route || 'All Routes'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Phone: </span>
            <span>{user?.phone || 'N/A'}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Lock size={18} color="var(--primary)" />
          <h3 style={{ fontSize: '1.05rem', fontWeight: '800' }}>Change Password</h3>
        </div>

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

        <form onSubmit={handleChangePassword}>
          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">New Password (min 6 characters)</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }} disabled={saving}>
            <Lock size={16} />
            {saving ? 'Updating Password...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
