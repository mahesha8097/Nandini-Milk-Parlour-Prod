import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/common/Navbar';
import Sidebar from './components/common/Sidebar';

// Auth Pages
import Login from './pages/auth/Login';
import RegisterAdmin from './pages/auth/RegisterAdmin';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import CustomersPage from './pages/admin/CustomersPage';
import DeliveryBoysPage from './pages/admin/DeliveryBoysPage';
import DeliveriesPage from './pages/admin/DeliveriesPage';
import DailyRequirementsPage from './pages/admin/DailyRequirementsPage';
import BillsPage from './pages/admin/BillsPage';
import MonthlyBillGeneratePage from './pages/admin/MonthlyBillGeneratePage';
import PaymentsPage from './pages/admin/PaymentsPage';
import ExpensesPage from './pages/admin/ExpensesPage';
import ProductsPage from './pages/admin/ProductsPage';
import ReportsPage from './pages/admin/ReportsPage';
import AdminProfilePage from './pages/admin/AdminProfilePage';
import SettingsPage from './pages/admin/SettingsPage';
import ZonesPage from './pages/admin/ZonesPage';
import RoutesPage from './pages/admin/RoutesPage';
import CouponsPage from './pages/admin/CouponsPage';
import DeliveryCalendarPage from './pages/admin/DeliveryCalendarPage';

// Delivery Boy Pages
import DeliveryBoyDashboard from './pages/delivery/DeliveryBoyDashboard';
import DeliveryBoyDeliveries from './pages/delivery/DeliveryBoyDeliveries';
import DeliveryBoyCustomers from './pages/delivery/DeliveryBoyCustomers';
import DeliveryBoyHistory from './pages/delivery/DeliveryBoyHistory';
import DeliveryBoyProfile from './pages/delivery/DeliveryBoyProfile';

// Public Customer Delivery & Statement View
import CustomerStatementView from './pages/public/CustomerStatementView';

import {
  LayoutDashboard,
  Users,
  PackageCheck,
  Receipt,
  UserCheck,
  RefreshCw,
  Ticket
} from 'lucide-react';

const VALID_ADMIN_TABS = [
  'dashboard', 'customers', 'delivery-boys', 'deliveries', 'calendar', 'routes', 'zones',
  'daily-requirements', 'bills', 'monthly-bill-generate', 'coupons', 'payments',
  'expenses', 'products', 'reports', 'profile', 'settings'
];

const VALID_DELIVERY_TABS = [
  'dashboard', 'deliveries', 'calendar', 'zones', 'customers', 'history', 'profile'
];

function getStoredTab(role) {
  try {
    const hash = window.location.hash.replace(/^#\/?/, '').trim();
    const saved = localStorage.getItem('nandini_current_tab');
    const candidate = hash || saved;
    if (candidate) {
      if (role === 'DELIVERY_BOY' && VALID_DELIVERY_TABS.includes(candidate)) {
        return candidate;
      }
      if (role === 'ADMIN' && VALID_ADMIN_TABS.includes(candidate)) {
        return candidate;
      }
      if (!role && (VALID_ADMIN_TABS.includes(candidate) || VALID_DELIVERY_TABS.includes(candidate))) {
        return candidate;
      }
    }
  } catch {
    // Ignore storage errors
  }
  return 'dashboard';
}

function MainApplication() {
  const { user, loading, hasAdmin } = useAuth();
  const [authView, setAuthView] = useState('LOGIN'); // 'LOGIN' | 'REGISTER_ADMIN'
  const [currentTab, setCurrentTab] = useState(() => getStoredTab());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navParams, setNavParams] = useState({});

  const handleNavigate = (tabId, params = {}) => {
    setCurrentTab(tabId);
    setNavParams(params);
    try {
      localStorage.setItem('nandini_current_tab', tabId);
      if (window.location.hash !== `#${tabId}`) {
        window.history.replaceState(null, '', `#${tabId}`);
      }
    } catch {
      // Ignore storage errors
    }
  };

  // Synchronize on browser back/forward buttons or hash change
  React.useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').trim();
      if (hash && hash !== currentTab) {
        setCurrentTab(hash);
        try {
          localStorage.setItem('nandini_current_tab', hash);
        } catch {}
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentTab]);

  // Validate active tab on user load and synchronize address bar
  React.useEffect(() => {
    if (user && currentTab) {
      if (user.role === 'DELIVERY_BOY' && !VALID_DELIVERY_TABS.includes(currentTab)) {
        handleNavigate('dashboard');
        return;
      }
      if (window.location.hash !== `#${currentTab}`) {
        window.history.replaceState(null, '', `#${currentTab}`);
      }
      try {
        localStorage.setItem('nandini_current_tab', currentTab);
      } catch {}
    }
  }, [user]);

  // Check if current URL is a public customer orders/statement link from WhatsApp
  const isPublicStatementRoute = () => {
    const hash = (window.location.hash || '').toLowerCase();
    const path = (window.location.pathname || '').toLowerCase();
    return (
      hash.startsWith('#statement') ||
      hash.startsWith('#orders') ||
      hash.startsWith('#my-orders') ||
      path.startsWith('/statement') ||
      path.startsWith('/orders') ||
      path.startsWith('/my-orders')
    );
  };

  const [isPublicRoute, setIsPublicRoute] = useState(() => isPublicStatementRoute());

  React.useEffect(() => {
    const onLocationChange = () => {
      setIsPublicRoute(isPublicStatementRoute());
    };
    window.addEventListener('hashchange', onLocationChange);
    window.addEventListener('popstate', onLocationChange);
    return () => {
      window.removeEventListener('hashchange', onLocationChange);
      window.removeEventListener('popstate', onLocationChange);
    };
  }, []);

  // Direct public access for customers viewing their delivery orders from WhatsApp
  if (isPublicRoute) {
    return <CustomerStatementView />;
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000000', color: '#ffffff' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <RefreshCw size={36} className="spin" color="var(--primary)" />
          <span style={{ fontWeight: '700', color: '#94a3b8' }}>Connecting to Nandini Live Database...</span>
        </div>
      </div>
    );
  }

  // If not logged in
  if (!user) {
    if (!hasAdmin || authView === 'REGISTER_ADMIN') {
      return <RegisterAdmin onGoToLogin={() => setAuthView('LOGIN')} />;
    }
    return <Login onGoToRegister={() => setAuthView('REGISTER_ADMIN')} />;
  }

  // Render Admin View
  const renderAdminContent = () => {
    switch (currentTab) {
      case 'dashboard':
        return <AdminDashboard onNavigate={handleNavigate} />;
      case 'customers':
        return <CustomersPage initialOpenAdd={navParams.openAdd} />;
      case 'delivery-boys':
        return <DeliveryBoysPage initialOpenAdd={navParams.openAdd} />;
      case 'deliveries':
        return <DeliveriesPage />;
      case 'calendar':
        return <DeliveryCalendarPage />;
      case 'routes':
        return <RoutesPage onNavigate={handleNavigate} />;
      case 'zones':
        return <ZonesPage onNavigate={handleNavigate} />;
      case 'daily-requirements':
        return <DailyRequirementsPage />;
      case 'bills':
        return <BillsPage />;
      case 'monthly-bill-generate':
        return <MonthlyBillGeneratePage initialCustomerId={navParams.customerId} onNavigate={handleNavigate} />;
      case 'coupons':
        return <CouponsPage onNavigate={handleNavigate} initialCustomerId={navParams.customerId} />;
      case 'payments':
        return <PaymentsPage initialOpenAdd={navParams.openAdd} />;
      case 'expenses':
        return <ExpensesPage initialOpenAdd={navParams.openAdd} />;
      case 'products':
        return <ProductsPage initialOpenAdd={navParams.openAdd} />;
      case 'reports':
        return <ReportsPage />;
      case 'profile':
        return <AdminProfilePage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <AdminDashboard onNavigate={handleNavigate} />;
    }
  };

  // Render Delivery Boy View
  const renderDeliveryContent = () => {
    switch (currentTab) {
      case 'dashboard':
        return <DeliveryBoyDashboard onNavigate={handleNavigate} />;
      case 'deliveries':
        return <DeliveryBoyDeliveries />;
      case 'calendar':
        return <DeliveryCalendarPage />;
      case 'zones':
        return <ZonesPage onNavigate={handleNavigate} />;
      case 'customers':
        return <DeliveryBoyCustomers />;
      case 'history':
        return <DeliveryBoyHistory />;
      case 'profile':
        return <DeliveryBoyProfile />;
      default:
        return <DeliveryBoyDashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar (Desktop & Mobile Drawer) */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={handleNavigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Screen Wrapper */}
      <div className="main-content">
        <Navbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        <main style={{ flex: 1 }}>
          {user.role === 'ADMIN' ? renderAdminContent() : renderDeliveryContent()}
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <div className="mobile-nav">
          {user.role === 'ADMIN' ? (
            <>
              <button
                className={`mobile-nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => handleNavigate('dashboard')}
              >
                <LayoutDashboard size={20} />
                <span>Dashboard</span>
              </button>
              <button
                className={`mobile-nav-item ${currentTab === 'deliveries' ? 'active' : ''}`}
                onClick={() => handleNavigate('deliveries')}
              >
                <PackageCheck size={20} />
                <span>Deliveries</span>
              </button>
              <button
                className={`mobile-nav-item ${currentTab === 'customers' ? 'active' : ''}`}
                onClick={() => handleNavigate('customers')}
              >
                <Users size={20} />
                <span>Customers</span>
              </button>
              <button
                className={`mobile-nav-item ${currentTab === 'bills' ? 'active' : ''}`}
                onClick={() => handleNavigate('bills')}
              >
                <Receipt size={20} />
                <span>Bills</span>
              </button>
              <button
                className={`mobile-nav-item ${currentTab === 'profile' ? 'active' : ''}`}
                onClick={() => handleNavigate('profile')}
              >
                <UserCheck size={20} />
                <span>Profile</span>
              </button>
            </>
          ) : (
            <>
              <button
                className={`mobile-nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => handleNavigate('dashboard')}
              >
                <LayoutDashboard size={20} />
                <span>Home</span>
              </button>
              <button
                className={`mobile-nav-item ${currentTab === 'deliveries' ? 'active' : ''}`}
                onClick={() => handleNavigate('deliveries')}
              >
                <PackageCheck size={20} />
                <span>Deliveries</span>
              </button>
              <button
                className={`mobile-nav-item ${currentTab === 'customers' ? 'active' : ''}`}
                onClick={() => handleNavigate('customers')}
              >
                <Users size={20} />
                <span>Customers</span>
              </button>
              <button
                className={`mobile-nav-item ${currentTab === 'profile' ? 'active' : ''}`}
                onClick={() => handleNavigate('profile')}
              >
                <UserCheck size={20} />
                <span>Profile</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApplication />
    </AuthProvider>
  );
}
