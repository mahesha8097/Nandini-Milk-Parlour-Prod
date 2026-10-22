import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Store, User, Lock, Phone, Mail, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function RegisterAdmin({ onGoToLogin }) {
  const { registerAdmin } = useAuth();
  const [formData, setFormData] = useState({
    parlour_name: '',
    name: '',
    username: '',
    password: '',
    confirmPassword: '',
    phone: '',
    email: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.username || !formData.password) {
      setError('Please fill in all required fields (Name, Username, Password).');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setError('');
      setLoading(true);
      await registerAdmin({
        parlour_name: formData.parlour_name.trim(),
        name: formData.name.trim(),
        username: formData.username.trim(),
        password: formData.password,
        phone: formData.phone.trim(),
        email: formData.email.trim()
      });
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      padding: '20px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '520px',
        background: 'white',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          background: 'var(--primary-gradient)',
          padding: '28px 24px',
          textAlign: 'center',
          color: 'white'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            background: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            boxShadow: '0 8px 16px rgba(0,0,0,0.2)'
          }}>
            <Store size={32} color="var(--primary)" />
          </div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: '800', color: 'white' }}>
            New Agent / Parlour Registration
          </h1>
          <p style={{ fontSize: '0.813rem', opacity: 0.9, marginTop: '4px' }}>
            Create your private & isolated parlour workspace
          </p>
        </div>

        {/* Form Body */}
        <div style={{ padding: '24px 28px' }}>
          {/* Isolation Guarantee Banner */}
          <div style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px'
          }}>
            <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.78rem', color: '#166534', lineHeight: '1.4' }}>
              <strong>100% Data Isolation:</strong> Your customers, delivery routes, bills, and accounting are completely separate and invisible to other agents.
            </div>
          </div>

          {error && (
            <div style={{
              background: 'var(--accent-red-light)',
              border: '1px solid #fecaca',
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: '#991b1b',
              fontSize: '0.875rem'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="parlour-name">Parlour / Outlet Name</label>
              <input
                id="parlour-name"
                name="parlour_name"
                type="text"
                className="form-input"
                placeholder="e.g. Nandini Milk Parlour - Indiranagar"
                value={formData.parlour_name}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="admin-name">Agent / Owner Full Name *</label>
              <input
                id="admin-name"
                name="name"
                type="text"
                className="form-input"
                placeholder="e.g. Ramesh Kumar"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="admin-username">Login Username *</label>
              <input
                id="admin-username"
                name="username"
                type="text"
                className="form-input"
                placeholder="e.g. ramesh_parlour"
                value={formData.username}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="admin-password">Password (min 6 chars) *</label>
                <input
                  id="admin-password"
                  name="password"
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="admin-confirm-password">Confirm Password *</label>
                <input
                  id="admin-confirm-password"
                  name="confirmPassword"
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="admin-phone">Mobile Phone</label>
                <input
                  id="admin-phone"
                  name="phone"
                  type="tel"
                  className="form-input"
                  placeholder="9876543210"
                  value={formData.phone}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="admin-email">Email Address</label>
                <input
                  id="admin-email"
                  name="email"
                  type="email"
                  className="form-input"
                  placeholder="owner@example.com"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '20px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              disabled={loading}
            >
              <span>{loading ? 'Setting up Parlour Workspace...' : 'Complete Registration & Launch Parlour'}</span>
              <ArrowRight size={18} />
            </button>
          </form>

          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <button
              onClick={onGoToLogin}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontSize: '0.813rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Already have an account? Sign in here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
