import React from 'react';
import { PackageOpen } from 'lucide-react';

export default function EmptyState({
  icon: Icon = PackageOpen,
  title = 'No data available',
  description = 'There are no records found for this section.',
  action = null
}) {
  return (
    <div className="empty-state">
      <Icon className="empty-icon" />
      <div className="empty-title">{title}</div>
      <div className="empty-desc">{description}</div>
      {action && <div style={{ marginTop: '12px' }}>{action}</div>}
    </div>
  );
}
