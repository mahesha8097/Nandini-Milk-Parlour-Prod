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
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 40
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
            cursor: 'pointer'
          }}
          aria-label="Toggle menu"
        >
          <Menu size={20} color="#475569" />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '42px',
            height: '32px',
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
          <div>
            <span style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--primary-dark)', letterSpacing: '0.02em' }}>NANDINI</span>
            <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '6px', fontWeight: '600' }}>MILK PARLOUR</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-full)',
              background: user.role === 'ADMIN' ? 'var(--primary-light)' : '#ecfdf5',
              border: '1px solid #cbd5e1'
            }}>
              {user.role === 'ADMIN' ? (
                <Shield size={16} color="var(--primary)" />
              ) : (
                <Truck size={16} color="var(--secondary)" />
              )}
              <span style={{
                fontSize: '0.813rem',
                fontWeight: '700',
                color: user.role === 'ADMIN' ? 'var(--primary-dark)' : '#065f46'
              }}>
                {user.name} ({user.role === 'ADMIN' ? 'Admin' : 'Delivery Boy'})
              </span>
            </div>

            <button
              onClick={logout}
              className="btn btn-outline btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Logout"
            >
              <LogOut size={16} />
              <span className="hide-mobile">Logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
