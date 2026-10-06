import React from 'react';

export default function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  color = 'var(--primary)',
  bgLight = 'var(--primary-light)'
}) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="stat-label">{label}</span>
        {Icon && (
          <div className="stat-icon-wrapper" style={{ background: bgLight }}>
            <Icon size={22} color={color} />
          </div>
        )}
      </div>
      <div>
        <div className="stat-value">{value}</div>
        {subtext && <div className="stat-sub" style={{ marginTop: '4px' }}>{subtext}</div>}
      </div>
    </div>
  );
}
