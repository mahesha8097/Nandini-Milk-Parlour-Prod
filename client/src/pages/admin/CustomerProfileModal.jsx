import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import BillInvoiceModal from './BillInvoiceModal';
import ProductPacketImage from '../../components/ProductPacketImage';
import CustomerSubscriptionsManager from '../../components/subscription/CustomerSubscriptionsManager';
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
  Sliders
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
  const [activeTab, setActiveTab] = useState(initialTab || 'overview'); // 'overview' | 'subscriptions' | 'deliveries' | 'bills' | 'payments' | 'ledger'
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

  const handleGenerateOrRecalculateBill = async (targetMonth = null) => {
    if (billLoading) return;
    const monthToUse = targetMonth || new Date().toISOString().slice(0, 7);
    try {
      setBillLoading(true);
      setBillSuccessMsg('');
      const res = await api.post('/bills/generate-single', {
        customer_id: customerId,
        month: monthToUse,
        forceRegenerate: true
      });
      setBillSuccessMsg(`Bill #${res.bill_number || res.id} calculated successfully for ${monthToUse}!`);
      await fetchCustomerProfile();
      onRefreshList?.();
      setTimeout(() => setBillSuccessMsg(''), 4000);
    } catch (err) {
      alert(err.message || 'Failed to generate/recalculate bill');
    } finally {
      setBillLoading(false);
    }
  };

  const handleRecalculateSpecificBill = async (billId) => {
    if (billLoading) return;
    try {
      setBillLoading(true);
      const res = await api.post(`/bills/${billId}/regenerate`);
      alert(res.message || 'Bill recalculated successfully with latest subscription dates!');
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
                <span className={`badge ${customer.billing_type === 'PREPAID' ? 'badge-success' : 'badge-warning'}`}>
                  {customer.billing_type === 'PREPAID' ? 'Prepaid (Advance)' : 'Postpaid'}
                </span>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ fontSize: '0.9rem', margin: 0 }}>Monthly Invoices & Bills</h4>
                <button
                  onClick={() => handleGenerateOrRecalculateBill()}
                  className="btn btn-primary btn-sm"
                  disabled={billLoading}
                >
                  <RotateCcw size={14} />
                  {billLoading ? 'Processing...' : 'Recalculate / Generate Bill'}
                </button>
              </div>

              {billSuccessMsg && (
                <div style={{ padding: '8px 12px', background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: '6px', fontSize: '0.813rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} /> {billSuccessMsg}
                </div>
              )}

              {profile.bills?.length === 0 ? (
                <EmptyState
                  title="No monthly bills generated"
                  description="Click 'Recalculate / Generate Bill' to generate the advance or postpaid bill for this customer."
                  action={
                    <button onClick={() => handleGenerateOrRecalculateBill()} className="btn btn-primary btn-sm" disabled={billLoading}>
                      <RotateCcw size={14} /> Generate Bill Now
                    </button>
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
                            <td><span className="badge badge-gray">{b.billing_type}</span></td>
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
                                  onClick={() => handleRecalculateSpecificBill(b.id)}
                                  className="btn btn-outline btn-sm"
                                  style={{ padding: '4px 8px' }}
                                  title="Recalculate Bill (apply updated subscription dates)"
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
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Month: {b.billing_month}</div>
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
                        <div style={{ display: 'flex', gap: '6px' }}>
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
                            onClick={() => handleRecalculateSpecificBill(b.id)}
                            className="btn btn-outline btn-sm"
                            style={{ minHeight: '34px', padding: '4px 10px' }}
                            title="Recalculate"
                            disabled={billLoading}
                          >
                            <RotateCcw size={13} />
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
        </div>
      )}
    </Modal>
  );
}
