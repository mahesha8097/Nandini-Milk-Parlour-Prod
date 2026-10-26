import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Check, User, ChevronDown } from 'lucide-react';

/**
 * CustomerSearchSelect
 * High-reliability searchable customer dropdown component.
 * Fixes cursor selection bugs across all browsers and devices.
 * Supports:
 * - Instant cursor selection on mousedown & click (no blur race conditions)
 * - Search by customer name, phone number, flat number, route, and zone
 * - Selected customer summary badge with quick 'Change' button
 * - Keyboard navigation (Enter to select, Escape to close)
 * - Dark mode and responsive styling matching the design system
 */
export default function CustomerSearchSelect({
  customers = [],
  value = '',
  onChange,
  placeholder = 'Search customer by name, phone, flat...',
  required = false,
  disabled = false,
  allOptionLabel = null,
  id = 'customer-search-select'
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Find currently selected customer
  const selectedCustomer = useMemo(() => {
    if (!value && value !== 0) return null;
    return customers.find((c) => String(c.id) === String(value)) || null;
  }, [customers, value]);

  // Filtered customer list based on query
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter((c) => {
      const name = (c.name || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      const flat = (c.flat_no || '').toLowerCase();
      const route = (c.route || '').toLowerCase();
      const zone = (c.zone_name || '').toLowerCase();
      const addr = (c.address || '').toLowerCase();
      return (
        name.includes(q) ||
        phone.includes(q) ||
        flat.includes(q) ||
        route.includes(q) ||
        zone.includes(q) ||
        addr.includes(q)
      );
    });
  }, [customers, searchQuery]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectCustomer = (cust) => {
    if (!cust) return;
    if (onChange) {
      onChange(cust.id, cust);
    }
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleOpenSearch = () => {
    if (disabled) return;
    setIsOpen(true);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 50);
  };

  const handleClearSelected = (e) => {
    e.stopPropagation();
    if (onChange) {
      onChange('', null);
    }
    setSearchQuery('');
    setIsOpen(true);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 50);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Hidden input for HTML form validation */}
      <input
        type="text"
        id={id}
        name={id}
        value={value || ''}
        required={required}
        onChange={() => {}}
        style={{
          position: 'absolute',
          opacity: 0,
          pointerEvents: 'none',
          height: 0,
          width: 0,
          margin: 0,
          padding: 0,
          border: 'none'
        }}
        tabIndex={-1}
      />

      {/* Selected Customer View (when selected or allOptionLabel and dropdown is closed) */}
      {(selectedCustomer || (allOptionLabel && !value)) && !isOpen ? (
        <div
          onClick={handleOpenSearch}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border-color)',
            borderRadius: '8px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'border-color 0.15s, box-shadow 0.15s'
          }}
          title="Click to change customer"
        >
          {selectedCustomer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'var(--primary-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <User size={14} color="var(--primary)" />
              </div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{selectedCustomer.name}</span>
                  {selectedCustomer.flat_no && (
                    <span style={{ fontSize: '0.72rem', background: '#2563eb', color: 'white', padding: '1px 6px', borderRadius: '4px', fontWeight: '800' }}>
                      Flat {selectedCustomer.flat_no}
                    </span>
                  )}
                  {selectedCustomer.customer_category === 'BULK_HOTEL' && (
                    <span style={{ fontSize: '0.68rem', background: 'rgba(168, 85, 247, 0.2)', color: '#a855f7', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                      Bulk
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {selectedCustomer.phone ? `📞 ${selectedCustomer.phone}` : 'No phone'}
                  {selectedCustomer.route ? ` • Route: ${selectedCustomer.route}` : ''}
                  {selectedCustomer.zone_name ? ` • Zone: ${selectedCustomer.zone_name}` : ''}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: '800', color: 'var(--primary)' }}>
                {allOptionLabel}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={handleOpenSearch}
              style={{
                background: 'var(--primary-light)',
                border: '1px solid var(--border-color)',
                color: 'var(--primary)',
                fontSize: '0.75rem',
                fontWeight: '700',
                padding: '4px 10px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Change
            </button>
            <ChevronDown size={16} color="var(--text-muted)" />
          </div>
        </div>
      ) : (
        /* Search Input when searching or no customer is selected */
        <div style={{ position: 'relative' }}>
          <Search
            size={15}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <input
            ref={inputRef}
            type="text"
            className="form-input"
            placeholder={selectedCustomer ? `Change: ${selectedCustomer.name}...` : placeholder}
            value={searchQuery}
            disabled={disabled}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (filteredCustomers.length > 0) {
                  handleSelectCustomer(filteredCustomers[0]);
                }
              } else if (e.key === 'Escape') {
                setIsOpen(false);
              }
            }}
            style={{
              paddingLeft: '34px',
              paddingRight: (searchQuery || selectedCustomer) ? '60px' : '30px',
              fontSize: '0.85rem',
              fontWeight: '600',
              borderColor: isOpen ? 'var(--primary)' : 'var(--border-color)'
            }}
          />

          <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex'
                }}
                title="Clear query"
              >
                <X size={14} />
              </button>
            )}
            {selectedCustomer && (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  padding: '2px 4px'
                }}
                title="Keep selected"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Dropdown Results */}
      {isOpen && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 1100,
            background: 'var(--bg-card)',
            borderRadius: '10px',
            border: '1.5px solid var(--border-color)',
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.25)',
            maxHeight: '300px',
            overflowY: 'auto'
          }}
        >
          {/* Header count info */}
          <div
            style={{
              padding: '6px 12px',
              background: 'var(--bg-surface)',
              borderBottom: '1px solid var(--border-color)',
              fontSize: '0.72rem',
              fontWeight: '800',
              color: 'var(--text-secondary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span>
              Found {filteredCustomers.length} of {customers.length} customers
            </span>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setIsOpen(false);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '0.75rem'
              }}
            >
              Close ✕
            </button>
          </div>

          {/* All Option (if provided) */}
          {allOptionLabel && (!searchQuery || allOptionLabel.toLowerCase().includes(searchQuery.toLowerCase())) && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                if (onChange) onChange('', null);
                setSearchQuery('');
                setIsOpen(false);
              }}
              onClick={(e) => {
                e.preventDefault();
                if (onChange) onChange('', null);
                setSearchQuery('');
                setIsOpen(false);
              }}
              style={{
                padding: '9px 12px',
                borderBottom: '1.5px solid var(--border-color)',
                cursor: 'pointer',
                userSelect: 'none',
                background: !value ? 'var(--primary-light)' : 'var(--bg-card)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
              onMouseEnter={(e) => {
                if (value) e.currentTarget.style.background = 'var(--bg-table-hover)';
              }}
              onMouseLeave={(e) => {
                if (value) e.currentTarget.style.background = 'var(--bg-card)';
              }}
            >
              <span style={{ fontWeight: '800', fontSize: '0.88rem', color: 'var(--primary)' }}>
                {allOptionLabel}
              </span>
              {!value && (
                <span style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Check size={14} /> Selected
                </span>
              )}
            </div>
          )}

          {/* List items */}
          {filteredCustomers.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No customers found matching "{searchQuery}"
            </div>
          ) : (
            filteredCustomers.map((c) => {
              const isSelected = String(c.id) === String(value);
              return (
                <div
                  key={c.id}
                  // Handle BOTH onMouseDown (stops blur race conditions) AND onClick
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectCustomer(c);
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSelectCustomer(c);
                  }}
                  style={{
                    padding: '9px 12px',
                    borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: isSelected ? 'var(--primary-light)' : 'var(--bg-card)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--bg-table-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--bg-card)';
                  }}
                >
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {c.flat_no && (
                        <span
                          style={{
                            background: '#2563eb',
                            color: 'white',
                            fontSize: '0.7rem',
                            fontWeight: '900',
                            padding: '1px 5px',
                            borderRadius: '4px'
                          }}
                        >
                          Flat {c.flat_no}
                        </span>
                      )}
                      <span style={{ fontWeight: '800', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                        {c.name}
                      </span>
                      {c.customer_category === 'BULK_HOTEL' && (
                        <span
                          style={{
                            background: 'rgba(168, 85, 247, 0.2)',
                            color: '#a855f7',
                            fontSize: '0.68rem',
                            fontWeight: '800',
                            padding: '1px 5px',
                            borderRadius: '4px'
                          }}
                        >
                          Bulk
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      📞 {c.phone || 'No phone'}
                      {c.route ? ` • Route: ${c.route}` : ''}
                      {c.zone_name ? ` • Zone: ${c.zone_name}` : ''}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {isSelected ? (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--primary)',
                          fontWeight: '900',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                      >
                        <Check size={14} /> Selected
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: '700',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: c.billing_type === 'PREPAID' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: c.billing_type === 'PREPAID' ? '#10b981' : '#f59e0b'
                        }}
                      >
                        {c.billing_type || 'POSTPAID'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
