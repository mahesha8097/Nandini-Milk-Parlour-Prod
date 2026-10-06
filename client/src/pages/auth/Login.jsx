import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Lock, User, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';

export default function Login({ onGoToRegister }) {
  const { login, hasAdmin } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }

    try {
      setError('');
      setLoading(true);
      await login(username, password);
    } catch (err) {
      setError(err.message || 'Login failed. Please verify credentials.');
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
        maxWidth: '440px',
        background: 'white',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden'
      }}>
        {/* Top Header with Nandini Branding */}
        <div style={{
          background: 'var(--primary-gradient)',
          padding: '36px 32px',
          textAlign: 'center',
          color: 'white'
        }}>
          <div style={{
            width: '90px',
            height: '64px',
            borderRadius: '12px',
            background: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            padding: '4px',
            boxShadow: '0 10px 20px -3px rgba(0,0,0,0.3)'
          }}>
            <img
              src="/nandini-logo.png"
              alt="Nandini Logo"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'white', letterSpacing: '0.02em' }}>
            Nandini Milk Parlour
          </h1>
          <p style={{ fontSize: '0.875rem', opacity: 0.9, marginTop: '4px' }}>
            Central Business & Delivery Portal
          </p>
        </div>

        {/* Form Body */}
        <div style={{ padding: '32px' }}>
          {!hasAdmin && (
            <div style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#1e40af' }}>Initial Setup Needed</div>
                <div style={{ fontSize: '0.75rem', color: '#3b82f6' }}>No admin account exists yet.</div>
              </div>
              <button
                onClick={onGoToRegister}
                className="btn btn-primary btn-sm"
              >
                Register Admin
              </button>
            </div>
          )}

          {error && (
            <div style={{
              background: 'var(--accent-red-light)',
              border: '1px solid #fecaca',
              padding: '12px 16px',
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
              <label className="form-label" htmlFor="login-username">Username</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-username"
                  type="text"
                  className="form-input"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={{ paddingLeft: '40px' }}
                  required
                />
                <User size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '16px' }}>
              <label className="form-label" htmlFor="login-password">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password"
                  type="password"
                  className="form-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingLeft: '40px' }}
                  required
                />
                <Lock size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '24px', padding: '12px', fontSize: '1rem' }}
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign In'}
              <ArrowRight size={18} />
            </button>
          </form>

          <div style={{
            marginTop: '24px',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            borderTop: '1px solid var(--border-color)',
            paddingTop: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <ShieldCheck size={14} color="var(--secondary)" />
              <span>Secure Role-Based Central Database Login</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
