import React from 'react';
import ZoneBasedDailyDeliveries from '../../components/delivery/ZoneBasedDailyDeliveries';
import { useAuth } from '../../context/AuthContext';

export default function DeliveryBoyDeliveries() {
  const { user } = useAuth();
  return <ZoneBasedDailyDeliveries userRole="DELIVERY_BOY" currentUserId={user?.id} />;
}
