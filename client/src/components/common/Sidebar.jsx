import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  Truck,
  PackageCheck,
  ClipboardList,
  Receipt,
  CalendarDays,
  CreditCard,
  Wallet,
  ShoppingBag,
  FileBarChart,
  UserCheck,
  Settings,
  LogOut,
  X
} from 'lucide-react';

export default function Sidebar({ currentTab, setCurrentTab, isOpen, onClose }) {
  const { user, logout } = useAuth();

  if (!user) return null;

  const adminNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'delivery-boys', label: 'Delivery Boys', icon: Truck },
    { id: 'deliveries', label: 'Deliveries', icon: PackageCheck },
    { id: 'daily-requirements', label: 'Daily Requirements', icon: ClipboardList },
    { id: 'bills', label: 'Bills', icon: Receipt },
    { id: 'monthly-bill-generate', label: 'Monthly Bill Generate', icon: CalendarDays },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'expenses', label: 'Expenses', icon: Wallet },
    { id: 'products', label: 'Products', icon: ShoppingBag },
    { id: 'reports', label: 'Reports', icon: FileBarChart },
    { id: 'profile', label: 'Profile', icon: UserCheck },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  const deliveryNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'deliveries', label: 'My Deliveries', icon: PackageCheck },
    { id: 'customers', label: 'My Customers', icon: Users },
    { id: 'history', label: 'Delivery History', icon: FileBarChart },
    { id: 'profile', label: 'Profile', icon: UserCheck }
  ];

  const navItems = user.role === 'ADMIN' ? adminNavItems : deliveryNavItems;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 49,
            display: 'block'
          }}
        />
      )}

      <aside
        style={{
          width: '260px',
          background: 'var(--bg-sidebar)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: isOpen ? 0 : '-260px',
          transition: 'left 0.25s ease-in-out',
          zIndex: 50,
          boxShadow: '4px 0 12px rgba(0,0,0,0.1)'
        }}
      >
        {/* Sidebar Header */}
        <div style={{
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              flexShrink: 0
            }}>
              <img
                src="/nandini-logo.png"
                alt="Nandini Logo"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div>
              <div style={{ fontWeight: '800', fontSize: '1rem', letterSpacing: '0.02em', color: '#ffffff' }}>NANDINI</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Milk Management</div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>
          <div style={{
            fontSize: '0.688rem',
            fontWeight: '700',
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '8px 12px 12px'
          }}>
            {user.role === 'ADMIN' ? 'Admin Navigation' : 'Delivery Navigation'}
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentTab(item.id);
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '11px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: 'none',
                    background: isActive ? 'var(--primary-gradient)' : 'transparent',
                    color: isActive ? '#ffffff' : '#cbd5e1',
                    fontWeight: isActive ? '700' : '500',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'background 0.15s ease'
                  }}
                >
                  <Icon size={18} color={isActive ? '#ffffff' : '#94a3b8'} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div style={{
          padding: '16px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(0,0,0,0.2)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
            padding: '0 4px'
          }}>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#f8fafc', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {user.name}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                {user.role === 'ADMIN' ? 'Owner / Admin' : `Route: ${user.assigned_route || 'Unassigned'}`}
              </div>
            </div>
          </div>

          <button
            onClick={logout}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              padding: '9px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#fca5a5',
              fontSize: '0.813rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
