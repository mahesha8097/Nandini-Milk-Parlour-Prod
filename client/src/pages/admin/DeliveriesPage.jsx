import React from 'react';
import ZoneBasedDailyDeliveries from '../../components/delivery/ZoneBasedDailyDeliveries';
import { useAuth } from '../../context/AuthContext';

export default function DeliveriesPage() {
  const { user } = useAuth();
  return <ZoneBasedDailyDeliveries userRole={user?.role || 'ADMIN'} currentUserId={user?.id} />;
}
