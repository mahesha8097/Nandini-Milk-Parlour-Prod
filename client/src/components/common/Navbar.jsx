import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Menu, LogOut, User, Shield, Truck } from 'lucide-react';

export default function Navbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();

  return (
    <header style={{
      height: '64px',
      background: 'white',
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
            background: '#f1f5f9',
            border: 'none',
            borderRadius: '8px',
            padding: '8px',
            cursor: 'pointer',
            flexShrink: 0
          }}
          aria-label="Toggle menu"
        >
          <Menu size={20} color="#475569" />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <div style={{
            width: '36px',
            height: '28px',
            borderRadius: '6px',
            background: 'white',
            border: '1px solid #e2e8f0',
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
            <span style={{ fontWeight: '800', fontSize: '0.95rem', color: 'var(--primary-dark)', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>NANDINI</span>
            <span className="hide-mobile" style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', whiteSpace: 'nowrap' }}>MILK PARLOUR</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: 'var(--radius-full)',
              background: user.role === 'ADMIN' ? 'var(--primary-light)' : '#ecfdf5',
              border: '1px solid #cbd5e1'
            }}>
              {user.role === 'ADMIN' ? (
                <Shield size={14} color="var(--primary)" />
              ) : (
                <Truck size={14} color="var(--secondary)" />
              )}
              <span style={{
                fontSize: '0.78rem',
                fontWeight: '700',
                color: user.role === 'ADMIN' ? 'var(--primary-dark)' : '#065f46',
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
