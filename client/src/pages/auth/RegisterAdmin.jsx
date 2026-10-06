import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, User, Lock, Phone, Mail, AlertCircle, ArrowRight } from 'lucide-react';

export default function RegisterAdmin({ onGoToLogin }) {
  const { registerAdmin } = useAuth();
  const [formData, setFormData] = useState({
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
      setError('Please fill in all required fields.');
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
        name: formData.name,
        username: formData.username,
        password: formData.password,
        phone: formData.phone,
        email: formData.email
      });
    } catch (err) {
      setError(err.message || 'Registration failed.');
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
          padding: '30px',
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
            margin: '0 auto 12px'
          }}>
            <ShieldCheck size={32} color="var(--primary)" />
          </div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: '800', color: 'white' }}>
            Admin Setup & Registration
          </h1>
          <p style={{ fontSize: '0.813rem', opacity: 0.9, marginTop: '4px' }}>
            Create the primary administrator account for Nandini Parlour
          </p>
        </div>

        {/* Form Body */}
        <div style={{ padding: '28px' }}>
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
              <label className="form-label" htmlFor="admin-name">Admin / Owner Full Name *</label>
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
                placeholder="e.g. admin_ramesh"
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
              style={{ width: '100%', marginTop: '20px', padding: '12px' }}
              disabled={loading}
            >
              {loading ? 'Creating Admin Account...' : 'Complete Registration & Login'}
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
