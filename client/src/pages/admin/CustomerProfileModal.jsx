import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import BillInvoiceModal from './BillInvoiceModal';
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
  CheckCircle2
} from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';

export default function CustomerProfileModal({ customerId, isOpen, onClose, onRefreshList }) {
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'subscriptions' | 'deliveries' | 'bills' | 'payments' | 'ledger'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      end_date: sub.end_date || ''
    });
    setSubError('');
    setShowAddSub(true);
  };

  const handleSaveSubscription = async (e) => {
    e.preventDefault();
    try {
      setSubLoading(true);
      setSubError('');
      if (editingSubId) {
        await api.put(`/customers/${customerId}/subscriptions/${editingSubId}`, subForm);
      } else {
        const payload = subItems.length > 1
          ? {
              items: subItems.map(it => ({
                product_id: it.product_id,
                quantity: it.quantity,
                start_date: subForm.start_date,
                frequency: 'DAILY'
              }))
            }
          : {
              product_id: subItems[0]?.product_id || subForm.product_id,
              quantity: subItems[0]?.quantity || subForm.quantity,
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
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <h4 style={{ fontSize: '0.9rem', margin: 0 }}>Active Delivery Subscriptions</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                    Subscriptions evaluate day-by-day. Changing start date to 1st of month bills for the entire month.
                  </p>
                </div>
                <button onClick={handleOpenAddSub} className="btn btn-primary btn-sm">
                  <PlusCircle size={15} /> Add Subscription
                </button>
              </div>

              {showAddSub && (
                <form onSubmit={handleSaveSubscription} className="card" style={{ marginBottom: '16px', background: '#f8fafc', padding: '16px', border: '1px solid var(--primary-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h5 style={{ fontSize: '0.875rem', margin: 0, fontWeight: '700', color: 'var(--primary)' }}>
                      {editingSubId ? 'Edit Delivery Subscription' : 'New Delivery Subscription'}
                    </h5>
                    {!editingSubId && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Select one or more products for daily delivery
                      </span>
                    )}
                  </div>
                  {subError && <div style={{ color: 'var(--accent-red)', fontSize: '0.8rem', marginBottom: '8px' }}>{subError}</div>}

                  {editingSubId ? (
                    /* Edit Single Subscription */
                    <div className="form-row">
                      <div className="form-group" style={{ flex: 1.5 }}>
                        <label className="form-label">Product</label>
                        <select
                          className="form-select"
                          value={subForm.product_id}
                          onChange={(e) => setSubForm({ ...subForm, product_id: e.target.value })}
                          required
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.name} ({p.variant_label}) - ₹{p.selling_price}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group" style={{ flex: 0.8 }}>
                        <label className="form-label">Quantity / Day</label>
                        <input
                          type="number"
                          min="1"
                          className="form-input"
                          value={subForm.quantity}
                          onChange={(e) => setSubForm({ ...subForm, quantity: parseInt(e.target.value) || 1 })}
                          required
                        />
                      </div>
                    </div>
                  ) : (
                    /* Multi-Product Subscription Creation */
                    <div>
                      {subItems.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '10px' }}>
                          <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.75rem' }}>
                              {idx === 0 ? 'Product / Milk 1' : `Additional Product / Milk ${idx + 1}`}
                            </label>
                            <select
                              className="form-select"
                              value={item.product_id}
                              onChange={(e) => handleSubItemChange(idx, 'product_id', e.target.value)}
                              required
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} ({p.variant_label}) - ₹{p.selling_price}</option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group" style={{ flex: 0.8, marginBottom: 0 }}>
                            <label className="form-label" style={{ fontSize: '0.75rem' }}>Qty / Day</label>
                            <input
                              type="number"
                              min="1"
                              className="form-input"
                              value={item.quantity}
                              onChange={(e) => handleSubItemChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                              required
                            />
                          </div>

                          {subItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSubItem(idx)}
                              className="btn btn-outline btn-sm"
                              style={{ color: 'var(--accent-red)', borderColor: '#fca5a5', height: '36px', padding: '0 8px' }}
                              title="Remove product"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}

                      <div style={{ marginTop: '6px', marginBottom: '14px' }}>
                        <button
                          type="button"
                          onClick={handleAddSubItem}
                          className="btn btn-outline btn-sm"
                          style={{ fontSize: '0.813rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <PlusCircle size={15} /> Add Additional Product (e.g. Shubham Milk + Toned Milk)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Start Date row */}
                  <div className="form-row" style={{ marginTop: '8px' }}>
                    <div className="form-group" style={{ flex: 1.2 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="form-label" style={{ marginBottom: 0 }}>Delivery Start Date</label>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ fontSize: '0.68rem', padding: '1px 6px', height: 'auto' }}
                            onClick={() => setSubForm({ ...subForm, start_date: currentMonthFirstDay })}
                          >
                            1st of Month
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ fontSize: '0.68rem', padding: '1px 6px', height: 'auto' }}
                            onClick={() => setSubForm({ ...subForm, start_date: todayStr })}
                          >
                            Today
                          </button>
                        </div>
                      </div>
                      <input
                        type="date"
                        className="form-input"
                        style={{ marginTop: '4px' }}
                        value={subForm.start_date}
                        onChange={(e) => setSubForm({ ...subForm, start_date: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '8px 12px', fontSize: '0.78rem', color: '#065f46', marginBottom: '12px' }}>
                    🥛 <strong>Combined Milk Rule:</strong> When delivering multiple milk types (e.g. Shubham + Toned), total milk volume is combined for delivery charge (1L = ₹3, 500ml = ₹2).
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                    <button type="button" onClick={() => { setShowAddSub(false); setEditingSubId(null); }} className="btn btn-outline btn-sm">Cancel</button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={subLoading}>
                      {subLoading ? 'Saving...' : editingSubId ? 'Update & Save Subscription' : subItems.length > 1 ? `Save ${subItems.length} Subscriptions` : 'Save Subscription'}
                    </button>
                  </div>
                </form>
              )}

              {profile.subscriptions?.length === 0 ? (
                <EmptyState title="No active subscriptions" description="Click Add Subscription to setup daily milk or curd delivery." />
              ) : (
                <div className="table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Variant</th>
                        <th>Qty/Day</th>
                        <th>Unit Price</th>
                        <th>Start Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.subscriptions.map((s) => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: '700' }}>{s.product_name}</td>
                          <td>{s.variant_label}</td>
                          <td style={{ fontWeight: '800', color: 'var(--primary)' }}>{s.quantity}</td>
                          <td>₹{s.selling_price}</td>
                          <td>
                            <span style={{ fontWeight: '600' }}>{s.start_date}</span>
                            {s.start_date === currentMonthFirstDay && (
                              <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: '#16a34a', fontWeight: '700' }}>(1st of Month)</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={() => handleOpenEditSub(s)}
                                className="btn btn-outline btn-sm"
                                style={{ padding: '4px 8px' }}
                                title="Edit subscription start date / quantity"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteSubscription(s.id)}
                                className="btn btn-outline btn-sm"
                                style={{ color: 'var(--accent-red)', padding: '4px 8px' }}
                                title="Delete subscription"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {profile.subscriptions?.length > 0 && customer.billing_type === 'PREPAID' && (
                <div style={{ marginTop: '16px', padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                <div className="table-container">
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
                <div className="table-container">
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
              )}
            </div>
          )}

          {/* TAB: PAYMENTS */}
          {activeTab === 'payments' && (
            <div>
              {profile.payments?.length === 0 ? (
                <EmptyState title="No payments recorded" description="Payment transactions recorded will appear here." />
              ) : (
                <div className="table-container">
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
              )}
            </div>
          )}

          {/* TAB: LEDGER */}
          {activeTab === 'ledger' && (
            <div>
              {profile.ledger?.length === 0 ? (
                <EmptyState title="No ledger records yet" description="Ledger entries are created automatically on each transaction." />
              ) : (
                <div className="table-container">
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
