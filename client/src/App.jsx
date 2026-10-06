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

// Delivery Boy Pages
import DeliveryBoyDashboard from './pages/delivery/DeliveryBoyDashboard';
import DeliveryBoyDeliveries from './pages/delivery/DeliveryBoyDeliveries';
import DeliveryBoyCustomers from './pages/delivery/DeliveryBoyCustomers';
import DeliveryBoyHistory from './pages/delivery/DeliveryBoyHistory';
import DeliveryBoyProfile from './pages/delivery/DeliveryBoyProfile';

import {
  LayoutDashboard,
  Users,
  PackageCheck,
  Receipt,
  UserCheck,
  RefreshCw
} from 'lucide-react';

function MainApplication() {
  const { user, loading, hasAdmin } = useAuth();
  const [authView, setAuthView] = useState('LOGIN'); // 'LOGIN' | 'REGISTER_ADMIN'
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navParams, setNavParams] = useState({});

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <RefreshCw size={36} className="spin" color="var(--primary)" />
          <span style={{ fontWeight: '700', color: 'var(--text-secondary)' }}>Connecting to Nandini Live Database...</span>
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

  const handleNavigate = (tabId, params = {}) => {
    setCurrentTab(tabId);
    setNavParams(params);
  };

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
      case 'daily-requirements':
        return <DailyRequirementsPage />;
      case 'bills':
        return <BillsPage />;
      case 'monthly-bill-generate':
        return <MonthlyBillGeneratePage />;
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
        setCurrentTab={setCurrentTab}
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
                onClick={() => setCurrentTab('dashboard')}
              >
                <LayoutDashboard size={20} />
                <span>Dashboard</span>
              </button>
              <button
                className={`mobile-nav-item ${currentTab === 'deliveries' ? 'active' : ''}`}
                onClick={() => setCurrentTab('deliveries')}
              >
                <PackageCheck size={20} />
                <span>Deliveries</span>
              </button>
              <button
                className={`mobile-nav-item ${currentTab === 'customers' ? 'active' : ''}`}
                onClick={() => setCurrentTab('customers')}
              >
                <Users size={20} />
                <span>Customers</span>
              </button>
              <button
                className={`mobile-nav-item ${currentTab === 'bills' ? 'active' : ''}`}
                onClick={() => setCurrentTab('bills')}
              >
                <Receipt size={20} />
                <span>Bills</span>
              </button>
              <button
                className={`mobile-nav-item ${currentTab === 'profile' ? 'active' : ''}`}
                onClick={() => setCurrentTab('profile')}
              >
                <UserCheck size={20} />
                <span>Profile</span>
              </button>
            </>
          ) : (
            <>
              <button
                className={`mobile-nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setCurrentTab('dashboard')}
              >
                <LayoutDashboard size={20} />
                <span>Home</span>
              </button>
              <button
                className={`mobile-nav-item ${currentTab === 'deliveries' ? 'active' : ''}`}
                onClick={() => setCurrentTab('deliveries')}
              >
                <PackageCheck size={20} />
                <span>Deliveries</span>
              </button>
              <button
                className={`mobile-nav-item ${currentTab === 'customers' ? 'active' : ''}`}
                onClick={() => setCurrentTab('customers')}
              >
                <Users size={20} />
                <span>Customers</span>
              </button>
              <button
                className={`mobile-nav-item ${currentTab === 'profile' ? 'active' : ''}`}
                onClick={() => setCurrentTab('profile')}
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
