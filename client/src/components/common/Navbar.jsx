import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Menu, LogOut, User, Shield, Truck, Sun, Moon } from 'lucide-react';

export default function Navbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  return (
    <header style={{
      height: '64px',
      background: 'var(--bg-header, var(--bg-card))',
      borderBottom: '1px solid var(--border-color)',
      padding: '0 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 40,
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <button
          onClick={onToggleSidebar}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '8px',
            cursor: 'pointer',
            flexShrink: 0
          }}
          aria-label="Toggle menu"
        >
          <Menu size={20} color="var(--text-secondary)" />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <div style={{
            width: '36px',
            height: '28px',
            borderRadius: '6px',
            background: '#ffffff',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            flexShrink: 0
          }}>
            <img
              src="/nandini-logo.png"
              alt="Nandini Logo"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', overflow: 'hidden' }}>
            <span style={{ fontWeight: '800', fontSize: '0.95rem', color: 'var(--primary)', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>NANDINI</span>
            <span className="hide-mobile" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600', whiteSpace: 'nowrap' }}>MILK PARLOUR</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {/* Quick Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-surface)',
            color: isDark ? '#fbbf24' : '#0054a6',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            padding: 0
          }}
          title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          aria-label="Toggle theme"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: 'var(--radius-full)',
              background: user.role === 'ADMIN' ? 'var(--primary-light)' : 'var(--secondary-light)',
              border: '1px solid var(--border-color)'
            }}>
              {user.role === 'ADMIN' ? (
                <Shield size={14} color="var(--primary)" />
              ) : (
                <Truck size={14} color="var(--secondary)" />
              )}
              <span style={{
                fontSize: '0.78rem',
                fontWeight: '700',
                color: user.role === 'ADMIN' ? 'var(--primary-dark, var(--primary))' : 'var(--secondary)',
                whiteSpace: 'nowrap'
              }}>
                {user.name} <span className="hide-mobile">({user.role === 'ADMIN' ? 'Admin' : 'Delivery Boy'})</span>
              </span>
            </div>

            <button
              onClick={logout}
              className="btn btn-outline btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px' }}
              title="Logout"
            >
              <LogOut size={15} />
              <span className="hide-mobile">Logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
