import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Menu, LogOut, User, Shield, Truck, Sun, Moon, Monitor, Check, ChevronDown } from 'lucide-react';

export default function Navbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const { theme, resolvedTheme, isDark, setTheme } = useTheme();
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const themeMenuRef = useRef(null);

  // Close theme menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target)) {
        setShowThemeMenu(false);
      }
    }
    if (showThemeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showThemeMenu]);

  const themeOptions = [
    {
      id: 'light',
      label: 'Light theme',
      desc: 'Crisp daytime view',
      icon: Sun,
      iconColor: '#f59e0b'
    },
    {
      id: 'dark',
      label: 'Dark theme',
      desc: 'Obsidian YouTube style',
      icon: Moon,
      iconColor: '#3ea6ff'
    },
    {
      id: 'system',
      label: 'System default',
      desc: 'Matches device setting',
      icon: Monitor,
      iconColor: '#10b981'
    }
  ];

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
        {/* 3-Option Theme Selector (Light, Dark, System Default) */}
        <div style={{ position: 'relative' }} ref={themeMenuRef}>
          <button
            onClick={() => setShowThemeMenu((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              height: '36px'
            }}
            title="Appearance settings: Light, Dark, System default"
            aria-label="Change theme appearance"
            aria-expanded={showThemeMenu}
          >
            {theme === 'system' ? (
              <Monitor size={17} color="#10b981" />
            ) : isDark ? (
              <Moon size={17} color="#3ea6ff" />
            ) : (
              <Sun size={17} color="#f59e0b" />
            )}
            <span className="hide-mobile" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
              {theme === 'system' ? 'System' : (theme === 'dark' ? 'Dark' : 'Light')}
            </span>
            <ChevronDown size={14} color="var(--text-muted)" />
          </button>

          {/* Floating Dropdown Menu */}
          {showThemeMenu && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                width: '230px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
                padding: '6px',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
              }}
            >
              <div style={{
                padding: '8px 12px 6px',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid var(--border-color)',
                marginBottom: '4px'
              }}>
                Appearance Setting
              </div>

              {themeOptions.map((opt) => {
                const Icon = opt.icon;
                const isSelected = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setTheme(opt.id);
                      setShowThemeMenu(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: 'none',
                      background: isSelected ? 'var(--primary-light)' : 'transparent',
                      color: isSelected ? 'var(--primary)' : 'var(--text-primary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--bg-surface)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--bg-surface)',
                        color: opt.iconColor
                      }}>
                        <Icon size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.825rem', fontWeight: isSelected ? 700 : 500, color: 'var(--text-primary)' }}>
                          {opt.label}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {opt.desc}
                        </div>
                      </div>
                    </div>
                    {isSelected && <Check size={16} color="var(--primary)" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

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
