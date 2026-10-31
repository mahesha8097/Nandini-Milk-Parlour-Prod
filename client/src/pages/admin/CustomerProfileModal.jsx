import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import BillInvoiceModal from './BillInvoiceModal';
import ProductPacketImage from '../../components/ProductPacketImage';
import CustomerSubscriptionsManager from '../../components/subscription/CustomerSubscriptionsManager';
import MonthlyBillGeneratePage from './MonthlyBillGeneratePage';
import {
  User,
  Phone,
  MapPin,
  Truck,
  PlusCircle,
  Calendar,
  CreditCard,
  Receipt,
  FileText,
  Clock,
  Trash2,
  Edit2,
  RotateCcw,
  Eye,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Minus,
  Plus,
  Play,
  Pause,
  Sliders,
  Ticket,
  Info
} from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';

export default function CustomerProfileModal({
  customerId,
  isOpen,
  onClose,
  onRefreshList,
  initialTab = 'overview',
  onEditCustomer
}) {
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab || 'overview'); // 'overview' | 'subscriptions' | 'coupons' | 'deliveries' | 'bills' | 'payments' | 'ledger'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || 'overview');
    }
  }, [isOpen, initialTab]);

  // Default start date to 1st of current month
  const todayStr = getLocalDateString();
  const currentMonthFirstDay = `${todayStr.slice(0, 7)}-01`;

  // Subscription modal state
  const [showAddSub, setShowAddSub] = useState(false);
  const [editingSubId, setEditingSubId] = useState(null);
  const [products, setProducts] = useState([]);
  const [subItems, setSubItems] = useState([{ product_id: '', quantity: 1 }]);
  const [subForm, setSubForm] = useState({
    product_id: '',
    quantity: 1,
    frequency: 'DAILY',
    start_date: currentMonthFirstDay,
    end_date: ''
  });
  const [subError, setSubError] = useState('');
  const [subLoading, setSubLoading] = useState(false);

  // Bill management in profile
  const [selectedBillId, setSelectedBillId] = useState(null);
  const [billLoading, setBillLoading] = useState(false);
  const [billSuccessMsg, setBillSuccessMsg] = useState('');
  const [showBillGeneratorModal, setShowBillGeneratorModal] = useState(false);

  // Coupon Book Management in Profile
  const [showIssueBook, setShowIssueBook] = useState(false);
  const [couponForm, setCouponForm] = useState({
    book_number: '',
    total_coupons: 30,
    price_paid: '',
    payment_method: 'CASH',
    issue_date: getLocalDateString(),
    notes: ''
  });
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');

  const handleIssueBook = async (e) => {
    e.preventDefault();
    try {
      setCouponLoading(true);
      setCouponError('');
      await api.post('/coupons/issue', {
        customer_id: customerId,
        book_number: couponForm.book_number.trim() || undefined,
        total_coupons: parseInt(couponForm.total_coupons, 10),
        price_paid: parseFloat(couponForm.price_paid || 0),
        payment_method: couponForm.payment_method,
        issue_date: couponForm.issue_date,
        notes: couponForm.notes
      });
      setShowIssueBook(false);
      setCouponForm({
        book_number: '',
        total_coupons: 30,
        price_paid: '',
        payment_method: 'CASH',
        issue_date: getLocalDateString(),
        notes: ''
      });
      await fetchCustomerProfile();
      onRefreshList?.();
    } catch (err) {
      setCouponError(err.message || 'Failed to issue coupon book');
    } finally {
      setCouponLoading(false);
    }
  };

  const fetchCustomerProfile = async () => {
    if (!customerId) return;
    try {
      setLoading(true);
      setError('');
      const data = await api.get(`/customers/${customerId}`);
      setProfile(data);
    } catch (err) {
      setError(err.message || 'Unable to load customer profile.');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products');
      setProducts(res);
      if (res.length > 0) {
        if (!subForm.product_id) {
          setSubForm((prev) => ({ ...prev, product_id: res[0].id }));
        }
        setSubItems((prev) => prev.map(item => ({
          ...item,
          product_id: item.product_id || res[0].id
        })));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isOpen && customerId) {
      fetchCustomerProfile();
      fetchProducts();
    }
  }, [isOpen, customerId]);

  const handleOpenAddSub = () => {
    setEditingSubId(null);
    const defaultPid = products.length > 0 ? products[0].id : '';
    setSubItems([{ product_id: defaultPid, quantity: 1 }]);
    setSubForm({
      product_id: defaultPid,
      quantity: 1,
      frequency: 'DAILY',
      start_date: currentMonthFirstDay,
      end_date: ''
    });
    setSubError('');
    setShowAddSub(true);
  };

  const handleAddSubItem = () => {
    const defaultPid = products.length > 0 ? products[0].id : '';
    setSubItems([...subItems, { product_id: defaultPid, quantity: 1 }]);
  };

  const handleRemoveSubItem = (index) => {
    if (subItems.length <= 1) return;
    setSubItems(subItems.filter((_, i) => i !== index));
  };

  const handleSubItemChange = (index, field, value) => {
    const updated = [...subItems];
    updated[index] = { ...updated[index], [field]: value };
    setSubItems(updated);
  };

  const handleOpenEditSub = (sub) => {
    setEditingSubId(sub.id);
    setSubForm({
      product_id: sub.product_id,
      quantity: sub.quantity,
      frequency: sub.frequency || 'DAILY',
      start_date: sub.start_date || currentMonthFirstDay,
      end_date: sub.end_date || '',
      is_active: sub.is_active !== undefined ? sub.is_active : 1,
      product_name: sub.product_name,
      variant_label: sub.variant_label,
      selling_price: sub.selling_price,
      category: sub.category,
      image_url: sub.image_url
    });
    setSubError('');
    setShowAddSub(true);
  };

  const handleTogglePauseSubscription = async (sub) => {
    try {
      setSubLoading(true);
      await api.put(`/customers/${customerId}/subscriptions/${sub.id}`, {
        is_active: (sub.is_active === 1 || sub.is_active === true) ? 0 : 1
      });
      await fetchCustomerProfile();
      onRefreshList?.();
    } catch (err) {
      alert(err.message || 'Failed to update subscription status');
    } finally {
      setSubLoading(false);
    }
  };

  const handleSaveSubscription = async (e) => {
    e.preventDefault();
    try {
      setSubLoading(true);
      setSubError('');
      if (editingSubId) {
        await api.put(`/customers/${customerId}/subscriptions/${editingSubId}`, {
          product_id: subForm.product_id,
          quantity: parseInt(subForm.quantity) || 1,
          frequency: subForm.frequency || 'DAILY',
          start_date: subForm.start_date,
          end_date: subForm.end_date || null,
          is_active: subForm.is_active !== undefined ? subForm.is_active : 1
        });
      } else {
        const payload = subItems.length > 1
          ? {
              items: subItems.map(it => ({
                product_id: it.product_id,
                quantity: parseInt(it.quantity) || 1,
                start_date: subForm.start_date,
                frequency: 'DAILY'
              }))
            }
          : {
              product_id: subItems[0]?.product_id || subForm.product_id,
              quantity: parseInt(subItems[0]?.quantity || subForm.quantity) || 1,
              frequency: 'DAILY',
              start_date: subForm.start_date
            };
        await api.post(`/customers/${customerId}/subscriptions`, payload);
      }
      setShowAddSub(false);
      setEditingSubId(null);
      await fetchCustomerProfile();
      onRefreshList?.();
    } catch (err) {
      setSubError(err.message || 'Failed to save subscription');
    } finally {
      setSubLoading(false);
    }
  };

  const handleDeleteSubscription = async (subId) => {
    if (!window.confirm('Are you sure you want to remove this subscription? Past deliveries will remain intact.')) return;
    try {
      await api.delete(`/customers/${customerId}/subscriptions/${subId}`);
      fetchCustomerProfile();
      onRefreshList?.();
    } catch (err) {
      alert(err.message || 'Failed to remove subscription');
    }
  };

  const handleGenerateOrRecalculateBill = async (targetMonth = null, basis = 'AUTO') => {
    if (billLoading) return;
    const monthToUse = targetMonth || new Date().toISOString().slice(0, 7);
    try {
      setBillLoading(true);
      setBillSuccessMsg('');
      const res = await api.post('/bills/generate-single', {
        customer_id: customerId,
        month: monthToUse,
        billingBasis: basis,
        forceRegenerate: true
      });
      const basisDesc = basis === 'DELIVERIES' ? 'for delivered milk' : (basis === 'SUBSCRIPTION' ? 'as full month advance' : '');
      setBillSuccessMsg(`Bill #${res.bill_number || res.id} calculated successfully ${basisDesc} for ${monthToUse}!`);
      await fetchCustomerProfile();
      onRefreshList?.();
      setTimeout(() => setBillSuccessMsg(''), 4000);
    } catch (err) {
      alert(err.message || 'Failed to generate/recalculate bill');
    } finally {
      setBillLoading(false);
    }
  };

  const handleRecalculateSpecificBill = async (billId, basis = 'AUTO') => {
    if (billLoading) return;
    try {
      setBillLoading(true);
      const res = await api.post(`/bills/${billId}/regenerate`, { billingBasis: basis });
      alert(res.message || 'Bill recalculated successfully!');
      await fetchCustomerProfile();
      onRefreshList?.();
    } catch (err) {
      alert(err.message || 'Failed to recalculate bill');
    } finally {
      setBillLoading(false);
    }
  };

  if (!isOpen) return null;

  const customer = profile?.customer || {};

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={customer.name ? `${customer.name} - Customer Profile` : 'Customer Profile'}
      maxWidth="850px"
    >
      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center' }}>Loading customer details...</div>
      ) : error ? (
        <div style={{ color: 'var(--accent-red)', padding: '20px' }}>{error}</div>
      ) : (
        <div>
          {/* Header Card with Quick Details */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            marginBottom: '20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>CATEGORY & BILLING</div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                <span className={`badge ${customer.customer_category === 'HOUSE' ? 'badge-info' : 'badge-indigo'}`}>
                  {customer.customer_category === 'HOUSE' ? 'House' : 'Bulk / Hotel'}
                </span>
                {customer.billing_type === 'COUPON' ? (
                  <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Ticket size={11} /> Coupon
                  </span>
                ) : customer.billing_type === 'WEEKLY' ? (
                  <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe' }}>
                    Weekly (Actual)
                  </span>
                ) : customer.billing_type === 'DAILY' ? (
                  <span className="badge" style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }}>
                    Daily Payment
                  </span>
                ) : (
                  <span className={`badge ${customer.billing_type === 'PREPAID' ? 'badge-success' : 'badge-warning'}`}>
                    {customer.billing_type === 'PREPAID' ? 'Prepaid (Advance)' : 'Postpaid'}
                  </span>
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>CONTACT & ROUTE</div>
              <div style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)', marginTop: '4px' }}>
                {customer.phone}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Route: {customer.route || 'Not assigned'}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>ADVANCE BALANCE</div>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#16a34a', marginTop: '2px' }}>
                ₹{customer.advance_balance?.toFixed(2) || '0.00'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>PENDING AMOUNT</div>
              <div style={{ fontSize: '1.25rem', fontWeight: '800', color: customer.pending_balance > 0 ? '#dc2626' : 'var(--text-primary)', marginTop: '2px' }}>
                ₹{customer.pending_balance?.toFixed(2) || '0.00'}
              </div>
            </div>

            {(customer.billing_type === 'COUPON' || (customer.coupon_balance !== undefined && customer.coupon_balance > 0)) && (
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#92400e' }}>COUPONS REMAINING</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#d97706', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Ticket size={18} /> {customer.coupon_balance || 0}
                </div>
              </div>
            )}
          </div>

          {/* Quick Action Bar */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '16px',
            padding: '10px 14px',
            background: '#f1f5f9',
            borderRadius: 'var(--radius-md)',
            alignItems: 'center'
          }}>
            <button
              type="button"
              onClick={() => setShowBillGeneratorModal(true)}
              className="btn btn-primary btn-sm"
              style={{
                fontSize: '0.8rem',
                fontWeight: '800',
                background: 'linear-gradient(135deg, #1e40af, #2563eb)',
                borderColor: '#1d4ed8',
                color: '#ffffff',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)'
              }}
              title="Open monthly delivery calendar bill generator with day-of-week selection, combined delivery charges, and WhatsApp sharing"
            >
              <Receipt size={14} /> 🧾 Generate Monthly Bill (Calendar)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('subscriptions')}
              className={`btn btn-sm ${activeTab === 'subscriptions' ? 'btn-primary' : 'btn-outline'}`}
              style={{ fontSize: '0.8rem', fontWeight: '700' }}
            >
              <Calendar size={14} /> View Subscription ({profile.subscriptions?.length || 0})
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('subscriptions');
                handleOpenAddSub();
              }}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.8rem', fontWeight: '700', color: '#166534', borderColor: '#bbf7d0', background: '#dcfce7' }}
            >
              <PlusCircle size={14} /> Modify / Add Subscription
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('coupons');
                setShowIssueBook(true);
              }}
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.8rem', fontWeight: '700', color: '#92400e', borderColor: '#fde68a', background: '#fef3c7' }}
            >
              <Ticket size={14} /> + Issue Coupon Book
            </button>

            {onEditCustomer && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditCustomer(customer);
                }}
                className="btn btn-outline btn-sm"
                style={{ fontSize: '0.8rem', fontWeight: '700', marginLeft: 'auto' }}
              >
                <Edit2 size={14} /> Edit Customer Details
              </button>
            )}
          </div>

          {/* Navigation Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '8px', marginBottom: '16px', overflowX: 'auto' }}>
            {[
              { id: 'overview', label: 'Overview', icon: User },
              { id: 'subscriptions', label: `Subscriptions (${profile.subscriptions?.length || 0})`, icon: Calendar },
              { id: 'coupons', label: `Coupons (${profile.coupon_books?.length || 0})`, icon: Ticket },
              { id: 'deliveries', label: `Deliveries (${profile.deliveries?.length || 0})`, icon: Truck },
              { id: 'bills', label: `Monthly Bills (${profile.bills?.length || 0})`, icon: Receipt },
              { id: 'payments', label: `Payments (${profile.payments?.length || 0})`, icon: CreditCard },
              { id: 'ledger', label: 'Ledger History', icon: FileText }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    border: 'none',
                    background: 'transparent',
                    borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                    color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: isActive ? '700' : '500',
                    fontSize: '0.813rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Icon size={15} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="card" style={{ padding: '16px' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Delivery Address</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{customer.address}</p>
              </div>
              <div className="card" style={{ padding: '16px' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Assigned Delivery Boy</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {customer.delivery_boy_name ? `${customer.delivery_boy_name} (${customer.delivery_boy_phone || 'No phone'})` : 'None assigned'}
                </p>
              </div>
              {customer.notes && (
                <div className="card" style={{ padding: '16px' }}>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Customer Notes</h4>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{customer.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* TAB: SUBSCRIPTIONS */}
          {activeTab === 'subscriptions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <CustomerSubscriptionsManager
                customerId={customerId}
                customerName={customer.name}
                subscriptions={profile.subscriptions || []}
                products={products}
                onOpenMonthlyBill={() => setShowBillGeneratorModal(true)}
                onRefresh={async () => {
                  await fetchCustomerProfile();
                  onRefreshList?.();
                }}
              />

              {profile.subscriptions?.length > 0 && customer.billing_type === 'PREPAID' && (
                <div style={{ marginTop: '8px', padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#166534' }}>
                    <strong>Monthly Bill Sync:</strong> Changed subscription start date to 1st of month? Recalculate bill to apply full month.
                  </div>
                  <button
                    onClick={() => handleGenerateOrRecalculateBill()}
                    className="btn btn-primary btn-sm"
                    disabled={billLoading}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    <RotateCcw size={14} />
                    {billLoading ? 'Recalculating...' : 'Recalculate Monthly Bill'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB: COUPONS */}
          {activeTab === 'coupons' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Legacy physical coupons banner */}
              {(profile.coupon_books || []).length === 0 && customer.billing_type === 'COUPON' && (
                <div style={{
                  padding: '12px 16px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.82rem',
                  color: '#1e40af',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px'
                }}>
                  <Info size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#2563eb' }} />
                  <div>
                    <strong>Pre-issued Physical Coupons (Active):</strong>
                    <div style={{ margin: '4px 0 0 0', lineHeight: '1.4' }}>
                      This customer has already taken physical coupons offline. Their daily milk requirement will continue to be delivered normally through the website without billing or payment deductions. Payment calculation and digital coupon tracking will begin when their <strong>next coupon book</strong> is issued below.
                    </div>
                  </div>
                </div>
              )}

              {/* Top Overview Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '12px'
              }}>
                <div className="card" style={{ padding: '14px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#92400e', textTransform: 'uppercase' }}>Active Leftover Coupons</div>
                  <div style={{ fontSize: (profile.coupon_books || []).length === 0 && !customer.coupon_balance ? '1.1rem' : '1.6rem', fontWeight: '800', color: '#b45309', marginTop: '4px' }}>
                    {(profile.coupon_books || []).length === 0 && !customer.coupon_balance ? 'Physical Coupons' : (customer.coupon_balance || 0)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#78350f', marginTop: '2px' }}>
                    {(profile.coupon_books || []).length === 0 && !customer.coupon_balance ? 'Delivered without deduction until next book' : 'Coupons ready for milk packets'}
                  </div>
                </div>

                <div className="card" style={{ padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active Books</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: '800', color: 'var(--primary)', marginTop: '4px' }}>
                    {(profile.coupon_books || []).filter(b => b.status === 'ACTIVE').length}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>Currently in use</div>
                </div>

                <div className="card" style={{ padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Books Issued</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#475569', marginTop: '4px' }}>
                    {(profile.coupon_books || []).length}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>All-time books given</div>
                </div>
              </div>

              {/* Action Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '0.92rem', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Ticket size={16} color="#d97706" />
                  Coupon Books Given to Customer
                </h4>
                <button
                  type="button"
                  onClick={() => setShowIssueBook(!showIssueBook)}
                  className="btn btn-primary btn-sm"
                  style={{ background: '#d97706', borderColor: '#b45309' }}
                >
                  <PlusCircle size={14} /> {showIssueBook ? 'Close Form' : '+ Issue New Coupon Book'}
                </button>
              </div>

              {/* Issue New Coupon Book Form */}
              {showIssueBook && (
                <div className="card" style={{ padding: '16px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <h4 style={{ fontSize: '0.9rem', color: '#92400e', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <PlusCircle size={16} /> Issue New Coupon Book (Advance Payment)
                  </h4>

                  {couponError && (
                    <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '12px' }}>
                      {couponError}
                    </div>
                  )}

                  <form onSubmit={handleIssueBook}>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Book Number / Serial (Optional)</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. BK-2026-001"
                          value={couponForm.book_number}
                          onChange={(e) => setCouponForm({ ...couponForm, book_number: e.target.value })}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Total Coupons in Book *</label>
                        <input
                          type="number"
                          min="1"
                          required
                          className="form-input"
                          placeholder="e.g. 30 or 60"
                          value={couponForm.total_coupons}
                          onChange={(e) => setCouponForm({ ...couponForm, total_coupons: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Advance Price Paid (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className="form-input"
                          placeholder="0.00"
                          value={couponForm.price_paid}
                          onChange={(e) => setCouponForm({ ...couponForm, price_paid: e.target.value })}
                        />
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Recorded automatically in customer payments & ledger
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Payment Method</label>
                        <select
                          className="form-select"
                          value={couponForm.payment_method}
                          onChange={(e) => setCouponForm({ ...couponForm, payment_method: e.target.value })}
                        >
                          <option value="CASH">Cash</option>
                          <option value="UPI">UPI / GPay / PhonePe</option>
                          <option value="BANK_TRANSFER">Bank Transfer</option>
                          <option value="ONLINE">Online</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Issue Date *</label>
                        <input
                          type="date"
                          required
                          className="form-input"
                          value={couponForm.issue_date}
                          onChange={(e) => setCouponForm({ ...couponForm, issue_date: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Notes (Optional)</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Any remarks about this coupon book..."
                        value={couponForm.notes}
                        onChange={(e) => setCouponForm({ ...couponForm, notes: e.target.value })}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                      <button
                        type="button"
                        onClick={() => setShowIssueBook(false)}
                        className="btn btn-outline btn-sm"
                        disabled={couponLoading}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        style={{ background: '#d97706', borderColor: '#b45309' }}
                        disabled={couponLoading}
                      >
                        {couponLoading ? 'Issuing...' : 'Issue Book & Add Coupons'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Coupon Books List */}
              {(!profile.coupon_books || profile.coupon_books.length === 0) ? (
                <EmptyState
                  icon={Ticket}
                  title="No coupon books issued yet"
                  description="When customer takes a new coupon book, click '+ Issue New Coupon Book' to credit coupons and record the advance payment."
                  action={
                    <button
                      type="button"
                      onClick={() => setShowIssueBook(true)}
                      className="btn btn-primary btn-sm"
                      style={{ background: '#d97706', borderColor: '#b45309' }}
                    >
                      <PlusCircle size={14} /> Issue First Coupon Book
                    </button>
                  }
                />
              ) : (
                <>
                  <div className="table-container desktop-only">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Book #</th>
                          <th>Issue Date</th>
                          <th>Total Coupons</th>
                          <th>Used</th>
                          <th>Remaining</th>
                          <th>Price Paid</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.coupon_books.map((b) => (
                          <tr key={b.id}>
                            <td style={{ fontWeight: '700', color: 'var(--primary)' }}>{b.book_number}</td>
                            <td>{b.issue_date}</td>
                            <td><span style={{ fontWeight: '700' }}>{b.total_coupons}</span></td>
                            <td style={{ color: '#dc2626', fontWeight: '700' }}>{b.used_coupons}</td>
                            <td>
                              <span style={{
                                fontWeight: '800',
                                color: b.remaining_coupons > 0 ? '#16a34a' : 'var(--text-muted)',
                                background: b.remaining_coupons > 0 ? '#f0fdf4' : '#f1f5f9',
                                padding: '2px 8px',
                                borderRadius: '6px'
                              }}>
                                {b.remaining_coupons} left
                              </span>
                            </td>
                            <td style={{ fontWeight: '700' }}>₹{(b.price_paid || 0).toFixed(2)}</td>
                            <td>
                              <span className={`badge ${b.status === 'ACTIVE' ? 'badge-success' : 'badge-gray'}`}>
                                {b.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mobile-only mobile-card-list">
                    {profile.coupon_books.map((b) => (
                      <div key={b.id} className="mobile-data-card" style={{ padding: '12px' }}>
                        <div className="mobile-card-header">
                          <div>
                            <span style={{ fontWeight: '800', color: 'var(--primary)', fontFamily: 'monospace', fontSize: '0.82rem' }}>{b.book_number}</span>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Issued: {b.issue_date}</div>
                          </div>
                          <span className={`badge ${b.status === 'ACTIVE' ? 'badge-success' : 'badge-gray'}`}>
                            {b.status}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.8rem', marginTop: '6px' }}>
                          <div>Total: <strong>{b.total_coupons}</strong></div>
                          <div style={{ color: '#dc2626' }}>Used: <strong>{b.used_coupons}</strong></div>
                          <div style={{ color: '#16a34a' }}>Left: <strong>{b.remaining_coupons}</strong></div>
                          <div>Paid: <strong>₹{(b.price_paid || 0).toFixed(2)}</strong></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Coupon Usage / Deduction History */}
              {profile.coupon_transactions && profile.coupon_transactions.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <h4 style={{ fontSize: '0.88rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                    Recent Coupon Transactions & Delivery Deductions
                  </h4>
                  <div className="table-container desktop-only">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Date / Time</th>
                          <th>Type</th>
                          <th>Coupons</th>
                          <th>Balance After</th>
                          <th>Book #</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.coupon_transactions.map((tx) => (
                          <tr key={tx.id}>
                            <td style={{ fontSize: '0.78rem' }}>{(tx.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                            <td>
                              <span className={`badge ${tx.transaction_type === 'ISSUE_BOOK' ? 'badge-success' : tx.transaction_type === 'DELIVERY_DEDUCTION' ? 'badge-warning' : 'badge-info'}`}>
                                {tx.transaction_type.replace('_', ' ')}
                              </span>
                            </td>
                            <td style={{ fontWeight: '800', color: tx.coupons_count > 0 ? '#16a34a' : '#dc2626' }}>
                              {tx.coupons_count > 0 ? `+${tx.coupons_count}` : tx.coupons_count}
                            </td>
                            <td style={{ fontWeight: '700' }}>{tx.balance_after}</td>
                            <td>{tx.book_number || '-'}</td>
                            <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{tx.notes || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mobile-only mobile-card-list">
                    {profile.coupon_transactions.slice(0, 15).map((tx) => (
                      <div key={tx.id} className="mobile-data-card" style={{ padding: '10px' }}>
                        <div className="mobile-card-header">
                          <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                            {(tx.created_at || '').slice(0, 16).replace('T', ' ')}
                          </span>
                          <span style={{ fontWeight: '800', color: tx.coupons_count > 0 ? '#16a34a' : '#dc2626' }}>
                            {tx.coupons_count > 0 ? `+${tx.coupons_count}` : tx.coupons_count}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                          <span>{tx.transaction_type.replace('_', ' ')}</span>
                          <span>Balance: <strong>{tx.balance_after}</strong></span>
                        </div>
                        {tx.notes && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{tx.notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: DELIVERIES */}
          {activeTab === 'deliveries' && (
            <div>
              {profile.deliveries?.length === 0 ? (
                <EmptyState title="No delivery records found" description="Deliveries recorded by delivery boy will appear here." />
              ) : (
                <>
                  <div className="table-container desktop-only">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Product</th>
                          <th>Qty</th>
                          <th>Product Amount</th>
                          <th>Del Charge</th>
                          <th>Total</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.deliveries.map((d) => (
                          <tr key={d.id}>
                            <td style={{ fontWeight: '600' }}>{d.delivery_date}</td>
                            <td>{d.product_name_snapshot} ({d.variant_snapshot})</td>
                            <td>{d.quantity}</td>
                            <td>₹{d.total_product_amount?.toFixed(2)}</td>
                            <td>₹{d.delivery_charge_snapshot?.toFixed(2)}</td>
                            <td style={{ fontWeight: '700' }}>₹{d.total_amount?.toFixed(2)}</td>
                            <td>
                              <span className={`badge ${d.status === 'DELIVERED' ? 'badge-success' : d.status === 'SKIPPED' ? 'badge-warning' : 'badge-info'}`}>
                                {d.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mobile-only mobile-card-list">
                    {profile.deliveries.map((d) => (
                      <div key={d.id} className="mobile-data-card" style={{ padding: '12px' }}>
                        <div className="mobile-card-header">
                          <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>{d.delivery_date}</span>
                          <span className={`badge ${d.status === 'DELIVERED' ? 'badge-success' : d.status === 'SKIPPED' ? 'badge-warning' : 'badge-info'}`}>
                            {d.status}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.813rem', color: 'var(--text-secondary)' }}>
                          {d.product_name_snapshot} ({d.variant_snapshot}) × {d.quantity} pkt
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px dashed #e2e8f0', paddingTop: '6px' }}>
                          <span>Product: ₹{d.total_product_amount?.toFixed(2)}</span>
                          <span>Del: ₹{d.delivery_charge_snapshot?.toFixed(2)}</span>
                          <span style={{ fontWeight: '800', color: 'var(--text-primary)' }}>Total: ₹{d.total_amount?.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB: BILLS */}
          {activeTab === 'bills' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ fontSize: '0.9rem', margin: 0 }}>Monthly Invoices & Bills</h4>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setShowBillGeneratorModal(true)}
                    className="btn btn-primary btn-sm"
                    style={{
                      background: 'linear-gradient(135deg, #1e40af, #2563eb)',
                      borderColor: '#1d4ed8',
                      fontWeight: '800',
                      boxShadow: '0 2px 4px rgba(37, 99, 235, 0.25)'
                    }}
                    title="Interactive calendar bill generator with custom days, WhatsApp & 1-Sheet print"
                  >
                    <Receipt size={14} />
                    🧾 Interactive Calendar Bill Generator
                  </button>
                  <button
                    onClick={() => handleGenerateOrRecalculateBill(null, 'DELIVERIES')}
                    className="btn btn-outline btn-sm"
                    disabled={billLoading}
                    style={{ color: '#16a34a', borderColor: '#bbf7d0', fontWeight: '700' }}
                    title="Generate bill based on milk actually DELIVERED till today and deduct from advance"
                  >
                    <Truck size={14} />
                    {billLoading ? 'Processing...' : 'Bill Delivered Milk (Till Today)'}
                  </button>
                  <button
                    onClick={() => handleGenerateOrRecalculateBill(null, 'SUBSCRIPTION')}
                    className="btn btn-outline btn-sm"
                    disabled={billLoading}
                    style={{ fontSize: '0.8rem', fontWeight: '700' }}
                    title="Generate bill for all scheduled days of the full month in advance"
                  >
                    <Calendar size={14} />
                    Full Month Advance Bill
                  </button>
                </div>
              </div>

              {billSuccessMsg && (
                <div style={{ padding: '8px 12px', background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: '6px', fontSize: '0.813rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} /> {billSuccessMsg}
                </div>
              )}

              {profile.bills?.length === 0 ? (
                <EmptyState
                  title="No monthly bills generated"
                  description="Click 'Bill Delivered Milk (Till Today)' to calculate delivered milk against customer advance, or 'Full Month Advance Bill' for scheduled days."
                  action={
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setShowBillGeneratorModal(true)}
                        className="btn btn-primary btn-sm"
                        style={{ background: 'linear-gradient(135deg, #1e40af, #2563eb)', borderColor: '#1d4ed8', fontWeight: '800' }}
                      >
                        <Receipt size={14} /> 🧾 Interactive Calendar Bill Generator
                      </button>
                      <button onClick={() => handleGenerateOrRecalculateBill(null, 'DELIVERIES')} className="btn btn-outline btn-sm" disabled={billLoading} style={{ color: '#16a34a', borderColor: '#bbf7d0' }}>
                        <Truck size={14} /> Bill Delivered Milk (Till Today)
                      </button>
                      <button onClick={() => handleGenerateOrRecalculateBill(null, 'SUBSCRIPTION')} className="btn btn-outline btn-sm" disabled={billLoading}>
                        <Calendar size={14} /> Full Month Advance
                      </button>
                    </div>
                  }
                />
              ) : (
                <>
                  <div className="table-container desktop-only">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Bill #</th>
                          <th>Month</th>
                          <th>Type</th>
                          <th>Gross</th>
                          <th>Adv Used</th>
                          <th>Net Payable</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.bills.map((b) => (
                          <tr key={b.id}>
                            <td style={{ fontWeight: '700', color: 'var(--primary)' }}>{b.bill_number}</td>
                            <td>{b.billing_month}</td>
                            <td>
                              {b.notes?.includes('Delivered Milk') || (b.total_deliveries_count > 0 && b.total_deliveries_count < 28) ? (
                                <span className="badge" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  <Truck size={11} /> Delivered ({b.total_deliveries_count || 'Actual'} pkts)
                                </span>
                              ) : b.billing_type === 'WEEKLY' ? (
                                <span className="badge" style={{ background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe' }}>
                                  Weekly ({b.start_date && b.end_date ? `${b.start_date.slice(5)} to ${b.end_date.slice(5)}` : 'Actual'})
                                </span>
                              ) : b.billing_type === 'COUPON' ? (
                                <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                                  Coupon
                                </span>
                              ) : (
                                <span className="badge badge-gray">{b.billing_type === 'PREPAID' ? 'Full Month Advance' : b.billing_type}</span>
                              )}
                            </td>
                            <td>₹{b.gross_amount?.toFixed(2)}</td>
                            <td style={{ color: '#16a34a' }}>₹{b.advance_adjusted?.toFixed(2)}</td>
                            <td style={{ fontWeight: '800' }}>₹{b.net_payable?.toFixed(2)}</td>
                            <td>
                              <span className={`badge ${b.status === 'PAID' || b.status === 'ADVANCE_PAID' ? 'badge-success' : b.status === 'PARTIALLY_PAID' ? 'badge-warning' : 'badge-danger'}`}>
                                {b.status}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  onClick={() => setSelectedBillId(b.id)}
                                  className="btn btn-outline btn-sm"
                                  style={{ padding: '4px 8px' }}
                                  title="View & Print Invoice"
                                >
                                  <Eye size={13} />
                                </button>
                                <button
                                  onClick={() => handleRecalculateSpecificBill(b.id, 'DELIVERIES')}
                                  className="btn btn-outline btn-sm"
                                  style={{ padding: '4px 8px', color: '#16a34a', borderColor: '#bbf7d0' }}
                                  title="Recalculate as Delivered Milk Till Today (deduct delivered milk from advance)"
                                  disabled={billLoading}
                                >
                                  <Truck size={13} />
                                </button>
                                <button
                                  onClick={() => handleRecalculateSpecificBill(b.id, 'SUBSCRIPTION')}
                                  className="btn btn-outline btn-sm"
                                  style={{ padding: '4px 8px' }}
                                  title="Recalculate as Full Month Advance Bill"
                                  disabled={billLoading}
                                >
                                  <RotateCcw size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mobile-only mobile-card-list">
                    {profile.bills.map((b) => (
                      <div key={b.id} className="mobile-data-card" style={{ padding: '12px' }}>
                        <div className="mobile-card-header">
                          <div>
                            <span style={{ fontWeight: '800', color: 'var(--primary)', fontFamily: 'monospace', fontSize: '0.78rem' }}>{b.bill_number}</span>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {b.billing_type === 'WEEKLY' ? `Weekly: ${b.start_date || ''} - ${b.end_date || ''}` : `Month: ${b.billing_month}`}
                            </div>
                          </div>
                          <span className={`badge ${b.status === 'PAID' || b.status === 'ADVANCE_PAID' ? 'badge-success' : b.status === 'PARTIALLY_PAID' ? 'badge-warning' : 'badge-danger'}`}>
                            {b.status}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.8rem' }}>
                          <div>Gross: <strong>₹{b.gross_amount?.toFixed(2)}</strong></div>
                          <div style={{ color: '#16a34a' }}>Adv: <strong>₹{b.advance_adjusted?.toFixed(2)}</strong></div>
                          <div style={{ color: b.net_payable > 0 ? '#dc2626' : '#16a34a' }}>Net: <strong>₹{b.net_payable?.toFixed(2)}</strong></div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedBillId(b.id)}
                            className="btn btn-primary btn-sm"
                            style={{ flex: 1, minHeight: '34px', fontSize: '0.78rem' }}
                          >
                            <Eye size={13} /> View Invoice
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRecalculateSpecificBill(b.id, 'DELIVERIES')}
                            className="btn btn-outline btn-sm"
                            style={{ minHeight: '34px', padding: '4px 10px', color: '#16a34a', borderColor: '#bbf7d0', fontWeight: '700' }}
                            title="Recalculate as Delivered Milk Till Today"
                            disabled={billLoading}
                          >
                            <Truck size={13} /> Till Today
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB: PAYMENTS */}
          {activeTab === 'payments' && (
            <div>
              {profile.payments?.length === 0 ? (
                <EmptyState title="No payments recorded" description="Payment transactions recorded will appear here." />
              ) : (
                <>
                  <div className="table-container desktop-only">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Receipt #</th>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Method</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.payments.map((p) => (
                          <tr key={p.id}>
                            <td style={{ fontWeight: '700', color: 'var(--primary)' }}>{p.receipt_number}</td>
                            <td>{p.payment_date}</td>
                            <td>{p.payment_type === 'ADVANCE_PAYMENT' ? 'Advance' : 'Postpaid'}</td>
                            <td><span className="badge badge-gray">{p.payment_method}</span></td>
                            <td style={{ fontWeight: '800', color: '#16a34a' }}>₹{p.amount?.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mobile-only mobile-card-list">
                    {profile.payments.map((p) => (
                      <div key={p.id} className="mobile-data-card" style={{ padding: '12px' }}>
                        <div className="mobile-card-header">
                          <div>
                            <span style={{ fontWeight: '800', color: 'var(--primary)', fontFamily: 'monospace', fontSize: '0.78rem' }}>{p.receipt_number}</span>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.payment_date} • {p.payment_method}</div>
                          </div>
                          <span style={{ fontWeight: '800', fontSize: '1.05rem', color: '#16a34a' }}>₹{p.amount?.toFixed(2)}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Type: {p.payment_type === 'ADVANCE_PAYMENT' ? 'Advance Payment' : 'Postpaid Settlement'}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB: LEDGER */}
          {activeTab === 'ledger' && (
            <div>
              {profile.ledger?.length === 0 ? (
                <EmptyState title="No ledger records yet" description="Ledger entries are created automatically on each transaction." />
              ) : (
                <>
                  <div className="table-container desktop-only">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Transaction</th>
                          <th>Debit (+)</th>
                          <th>Credit (-)</th>
                          <th>Adv Balance</th>
                          <th>Pending Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.ledger.map((l) => (
                          <tr key={l.id}>
                            <td>{l.transaction_date}</td>
                            <td>
                              <div style={{ fontWeight: '600', fontSize: '0.813rem' }}>{l.transaction_type}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{l.description}</div>
                            </td>
                            <td style={{ color: l.debit > 0 ? '#dc2626' : 'inherit', fontWeight: l.debit > 0 ? '700' : 'normal' }}>
                              {l.debit > 0 ? `₹${l.debit?.toFixed(2)}` : '-'}
                            </td>
                            <td style={{ color: l.credit > 0 ? '#16a34a' : 'inherit', fontWeight: l.credit > 0 ? '700' : 'normal' }}>
                              {l.credit > 0 ? `₹${l.credit?.toFixed(2)}` : '-'}
                            </td>
                            <td style={{ fontWeight: '700', color: '#16a34a' }}>₹{l.advance_balance_after?.toFixed(2)}</td>
                            <td style={{ fontWeight: '700', color: l.pending_balance_after > 0 ? '#dc2626' : 'inherit' }}>
                              ₹{l.pending_balance_after?.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mobile-only mobile-card-list">
                    {profile.ledger.map((l) => (
                      <div key={l.id} className="mobile-data-card" style={{ padding: '12px' }}>
                        <div className="mobile-card-header">
                          <div>
                            <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>{l.transaction_type}</span>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{l.transaction_date}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {l.debit > 0 && <span style={{ color: '#dc2626', fontWeight: '800' }}>+₹{l.debit?.toFixed(2)}</span>}
                            {l.credit > 0 && <span style={{ color: '#16a34a', fontWeight: '800' }}>-₹{l.credit?.toFixed(2)}</span>}
                          </div>
                        </div>
                        {l.description && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{l.description}</div>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', borderTop: '1px dashed #e2e8f0', paddingTop: '6px', marginTop: '2px' }}>
                          <span>Adv Bal: <strong style={{ color: '#16a34a' }}>₹{l.advance_balance_after?.toFixed(2)}</strong></span>
                          <span>Pending: <strong style={{ color: l.pending_balance_after > 0 ? '#dc2626' : 'var(--text-primary)' }}>₹{l.pending_balance_after?.toFixed(2)}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Bill Invoice Modal */}
          {selectedBillId && (
            <BillInvoiceModal
              billId={selectedBillId}
              isOpen={Boolean(selectedBillId)}
              onClose={() => setSelectedBillId(null)}
              onRecalculate={fetchCustomerProfile}
            />
          )}

          {/* Interactive Monthly Bill Generator Modal */}
          {showBillGeneratorModal && (
            <Modal
              isOpen={showBillGeneratorModal}
              onClose={() => {
                setShowBillGeneratorModal(false);
                fetchCustomerProfile();
                onRefreshList?.();
              }}
              title={`🧾 Monthly Bill Generator — ${customer.name || 'Customer'}`}
              maxWidth="1100px"
            >
              <MonthlyBillGeneratePage
                initialCustomerId={customerId}
                onClose={() => {
                  setShowBillGeneratorModal(false);
                  fetchCustomerProfile();
                  onRefreshList?.();
                }}
                isModal={true}
              />
            </Modal>
          )}
        </div>
      )}
    </Modal>
  );
}
