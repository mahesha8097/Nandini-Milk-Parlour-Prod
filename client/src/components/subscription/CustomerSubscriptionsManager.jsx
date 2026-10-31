import React, { useState } from 'react';
import ProductPacketImage from '../ProductPacketImage';
import Modal from '../common/Modal';
import { api } from '../../api/client';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import {
  Calendar,
  Clock,
  Trash2,
  Edit3,
  Check,
  CheckCircle2,
  Pause,
  Play,
  Plus,
  Minus,
  X,
  AlertTriangle,
  Sparkles,
  Sliders,
  PlusCircle,
  HelpCircle
} from 'lucide-react';

export default function CustomerSubscriptionsManager({
  customerId,
  customerName = 'Customer',
  subscriptions = [],
  products = [],
  onRefresh,
  onOpenMonthlyBill,
  readOnly = false
}) {
  const todayStr = getLocalDateString();
  const currentMonthFirstDay = `${todayStr.slice(0, 7)}-01`;

  // State for Modify Modal / Bottom Sheet
  const [isModifyModalOpen, setIsModifyModalOpen] = useState(false);
  const [isAddMode, setIsAddMode] = useState(false);
  const [selectedSub, setSelectedSub] = useState(null);
  const [subForm, setSubForm] = useState({
    product_id: '',
    quantity: 1,
    frequency: 'DAILY',
    custom_days: '',
    start_date: currentMonthFirstDay,
    end_date: '',
    is_active: 1
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [successToast, setSuccessToast] = useState('');

  // State for Cancel Confirmation Modal
  const [cancelTargetSub, setCancelTargetSub] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  // Open Modify modal for an existing subscription
  const handleOpenModify = (sub) => {
    setSelectedSub(sub);
    setIsAddMode(false);
    setSubForm({
      product_id: sub.product_id,
      quantity: sub.quantity || 1,
      frequency: sub.frequency || 'DAILY',
      custom_days: sub.custom_days || '',
      start_date: sub.start_date || currentMonthFirstDay,
      end_date: sub.end_date || '',
      is_active: sub.is_active !== undefined ? (sub.is_active ? 1 : 0) : 1
    });
    setFormError('');
    setIsModifyModalOpen(true);
  };

  // Open Add Subscription modal
  const handleOpenAdd = () => {
    setSelectedSub(null);
    setIsAddMode(true);
    const defaultPid = products.length > 0 ? products[0].id : '';
    setSubForm({
      product_id: defaultPid,
      quantity: 1,
      frequency: 'DAILY',
      custom_days: '',
      start_date: currentMonthFirstDay,
      end_date: '',
      is_active: 1
    });
    setFormError('');
    setIsModifyModalOpen(true);
  };

  // Handle Save / Submit of subscription changes
  const handleSaveSubscription = async (e, returnSuccess = false) => {
    if (e) e.preventDefault();
    const qty = parseInt(subForm.quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setFormError('Subscription quantity must be at least 1 packet.');
      return false;
    }
    if (!subForm.start_date) {
      setFormError('Please select a valid start date for this subscription.');
      return false;
    }
    if (!subForm.product_id) {
      setFormError('Please select a valid product.');
      return false;
    }

    try {
      setSubmitting(true);
      setFormError('');

      if (isAddMode) {
        // Add new recurring subscription
        await api.post(`/customers/${customerId}/subscriptions`, {
          product_id: parseInt(subForm.product_id, 10),
          quantity: qty,
          frequency: subForm.frequency,
          custom_days: subForm.frequency === 'CUSTOM' ? subForm.custom_days : null,
          start_date: subForm.start_date,
          end_date: subForm.end_date || null
        });
        setSuccessToast('New subscription added successfully!');
      } else if (selectedSub) {
        // Modify existing subscription
        await api.put(`/customers/${customerId}/subscriptions/${selectedSub.id}`, {
          product_id: parseInt(subForm.product_id, 10),
          quantity: qty,
          frequency: subForm.frequency,
          custom_days: subForm.frequency === 'CUSTOM' ? subForm.custom_days : null,
          start_date: subForm.start_date,
          end_date: subForm.end_date || null,
          is_active: subForm.is_active
        });
        setSuccessToast('Subscription modified successfully!');
      }

      setIsModifyModalOpen(false);
      setSelectedSub(null);
      if (onRefresh) await onRefresh();
      setTimeout(() => setSuccessToast(''), 4000);
      return true;
    } catch (err) {
      console.error('Subscription save error:', err);
      setFormError(err.message || 'Failed to save subscription changes.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Cancel prompt
  const handlePromptCancel = (sub) => {
    setCancelTargetSub(sub);
    setCancelError('');
  };

  // Confirm and execute cancellation
  const handleConfirmCancel = async () => {
    if (!cancelTargetSub) return;
    try {
      setCancelling(true);
      setCancelError('');
      await api.delete(`/customers/${customerId}/subscriptions/${cancelTargetSub.id}`);
      setSuccessToast(`Subscription for ${cancelTargetSub.product_name} cancelled. Past deliveries remain intact.`);
      setCancelTargetSub(null);
      if (onRefresh) await onRefresh();
      setTimeout(() => setSuccessToast(''), 4000);
    } catch (err) {
      console.error('Cancel subscription error:', err);
      setCancelError(err.message || 'Failed to cancel subscription.');
    } finally {
      setCancelling(false);
    }
  };

  // Find active product details for selected modal form
  const selectedProductObj = products.find(
    (p) => p.id === parseInt(subForm.product_id, 10)
  ) || selectedSub || {
    name: 'Selected Product',
    variant_label: '500 ml',
    selling_price: 27
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Toast Notification */}
      {successToast && (
        <div
          style={{
            background: '#ecfdf5',
            border: '1.5px solid #6ee7b7',
            color: '#065f46',
            padding: '10px 16px',
            borderRadius: '10px',
            fontWeight: 700,
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <CheckCircle2 size={16} color="#10b981" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Header Banner: My Daily Products */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>
            My Daily Products
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0 0' }}>
            Manage your regular delivery and recurring subscription items
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {onOpenMonthlyBill && (
            <button
              type="button"
              onClick={() => onOpenMonthlyBill(customerId)}
              style={{
                background: '#0054a6',
                color: 'white',
                border: 'none',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(0, 84, 166, 0.25)'
              }}
              title="Generate Monthly Bill & Advance Invoice with Calendar & WhatsApp Share"
            >
              <Calendar size={15} />
              <span>Generate Monthly Bill</span>
            </button>
          )}

          {!readOnly && (
            <button
              type="button"
              onClick={handleOpenAdd}
              style={{
                background: '#16a34a',
                color: 'white',
                border: 'none',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 6px rgba(22, 163, 74, 0.2)'
              }}
            >
              <PlusCircle size={15} />
              <span>Add Subscription</span>
            </button>
          )}
        </div>
      </div>

      {onOpenMonthlyBill && subscriptions.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(0, 84, 166, 0.05) 0%, rgba(16, 185, 129, 0.08) 100%)',
          border: '1.5px solid #93c5fd',
          borderRadius: '12px',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🧾 Ready to Calculate & Generate Bill for {customerName}?</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
              Includes interactive delivery calendar (select Tue/Thu/Sat), advance calculation, 1-sheet print, and WhatsApp sharing!
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenMonthlyBill(customerId)}
            className="btn btn-sm"
            style={{
              background: '#0054a6',
              color: 'white',
              fontWeight: 800,
              padding: '6px 14px',
              border: 'none',
              borderRadius: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Calendar size={14} /> Open Bill Generator
          </button>
        </div>
      )}

      {/* Product Subscription Cards List */}
      {subscriptions.length === 0 ? (
        <div
          style={{
            padding: '36px 20px',
            textAlign: 'center',
            background: '#ffffff',
            borderRadius: '16px',
            border: '1.5px dashed #cbd5e1'
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🥛</div>
          <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>
            No regular delivery subscriptions
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
            Set up daily milk, curd, or fresh dairy products for {customerName}.
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={handleOpenAdd}
              style={{
                marginTop: '14px',
                background: '#16a34a',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <PlusCircle size={15} />
              <span>Setup First Daily Product</span>
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {subscriptions.map((sub) => {
            const isActive = sub.is_active === 1 || sub.is_active === true || sub.is_active === undefined;
            const price = Number(sub.selling_price || 0);

            // Format frequency label
            let freqLabel = '1 qty every day';
            if (sub.frequency === 'ALTERNATE_DAYS') {
              freqLabel = `${sub.quantity} qty every 2 days (Alternate)`;
            } else if (sub.frequency === 'CUSTOM') {
              if (sub.custom_days) {
                freqLabel = `${sub.quantity} qty on ${sub.custom_days.replace(/,/g, ', ')}`;
              } else {
                freqLabel = `${sub.quantity} qty on custom schedule`;
              }
            } else {
              freqLabel = `${sub.quantity} qty every day`;
            }

            return (
              <div
                key={sub.id}
                style={{
                  background: '#ffffff',
                  borderRadius: '18px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Product Info Row: Image Left, Details Right */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                  {/* Packet Image */}
                  <div
                    style={{
                      width: '76px',
                      height: '76px',
                      borderRadius: '12px',
                      background: '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      border: '1px solid #f1f5f9'
                    }}
                  >
                    <ProductPacketImage
                      product={{
                        name: sub.product_name,
                        category: sub.category,
                        variant_label: sub.variant_label,
                        image_url: sub.image_url
                      }}
                      size={68}
                    />
                  </div>

                  {/* Product Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top Row: Name + Active / Paused Pill */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <h4
                        style={{
                          margin: 0,
                          fontSize: '1.05rem',
                          fontWeight: 800,
                          color: '#0f172a',
                          lineHeight: 1.25
                        }}
                      >
                        {sub.product_name}
                      </h4>

                      {/* Status Badge */}
                      {isActive ? (
                        <span
                          style={{
                            background: '#dcfce7',
                            color: '#15803d',
                            borderRadius: '999px',
                            padding: '3px 10px',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            flexShrink: 0
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: '#22c55e',
                              display: 'inline-block'
                            }}
                          />
                          Active
                        </span>
                      ) : (
                        <span
                          style={{
                            background: '#fef3c7',
                            color: '#b45309',
                            borderRadius: '999px',
                            padding: '3px 10px',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            flexShrink: 0
                          }}
                        >
                          <Pause size={10} />
                          Paused
                        </span>
                      )}
                    </div>

                    {/* Size / Volume • Price */}
                    <div
                      style={{
                        fontSize: '0.86rem',
                        color: '#64748b',
                        marginTop: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 600
                      }}
                    >
                      <span>{sub.variant_label || 'Standard Packet'}</span>
                      <span>•</span>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>
                        ₹{price.toFixed(2)}
                      </span>
                    </div>

                    {/* Frequency info */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.81rem',
                        color: '#475569',
                        marginTop: '6px',
                        fontWeight: 600
                      }}
                    >
                      <Calendar size={13} color="#64748b" />
                      <span>
                        Frequency: <strong>{freqLabel}</strong>
                      </span>
                    </div>

                    {/* Delivery Time */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.81rem',
                        color: '#475569',
                        marginTop: '3px',
                        fontWeight: 600
                      }}
                    >
                      <Clock size={13} color="#64748b" />
                      <span>
                        Delivery Time: <strong>4:00 – 6:45 AM</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Horizontal divider line spanning card width */}
                <div style={{ borderTop: '1px solid #f1f5f9', margin: '14px -18px 0 -18px' }} />

                {/* Actions: Cancel (Red) & Modify (Green) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-around',
                    paddingTop: '10px'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handlePromptCancel(sub)}
                    disabled={readOnly}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      cursor: readOnly ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 16px',
                      opacity: readOnly ? 0.5 : 1
                    }}
                    title="Cancel subscription (past records preserved)"
                  >
                    <Trash2 size={15} color="#ef4444" />
                    <span>Cancel</span>
                  </button>

                  {/* Vertical separator */}
                  <div style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />

                  <button
                    type="button"
                    onClick={() => handleOpenModify(sub)}
                    disabled={readOnly}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#16a34a',
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      cursor: readOnly ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 16px',
                      opacity: readOnly ? 0.5 : 1
                    }}
                    title="Modify quantity, frequency, or schedule"
                  >
                    <Edit3 size={15} color="#16a34a" />
                    <span>Modify</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODIFY PRODUCT RESPONSIVE MODAL / BOTTOM SHEET */}
      {/* ========================================================================= */}
      {isModifyModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-end', // Bottom sheet on mobile
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(3px)',
            padding: 0
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) {
              setIsModifyModalOpen(false);
            }
          }}
        >
          {/* Modal Card / Bottom Sheet Container */}
          <div
            style={{
              background: '#ffffff',
              width: '100%',
              maxWidth: '480px',
              borderTopLeftRadius: '24px',
              borderTopRightRadius: '24px',
              padding: '24px 20px 28px 20px',
              boxShadow: '0 -10px 30px rgba(0, 0, 0, 0.15)',
              maxHeight: '90vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              margin: 'auto'
            }}
          >
            {/* Grab Handle (Mobile Style) */}
            <div
              style={{
                width: '44px',
                height: '4px',
                background: '#cbd5e1',
                borderRadius: '999px',
                margin: '0 auto 8px auto',
                flexShrink: 0
              }}
            />

            {/* Header: Title + Close Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>
                {isAddMode ? 'Add Daily Product' : 'Modify Product'}
              </h3>
              <button
                type="button"
                onClick={() => !submitting && setIsModifyModalOpen(false)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Error Message */}
            {formError && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <AlertTriangle size={15} color="#dc2626" />
                <span>{formError}</span>
              </div>
            )}

            {/* Selected Product Snippet Card */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '10px',
                  background: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  border: '1px solid #e2e8f0'
                }}
              >
                <ProductPacketImage
                  product={{
                    name: selectedProductObj.name || selectedProductObj.product_name,
                    category: selectedProductObj.category,
                    variant_label: selectedProductObj.variant_label,
                    image_url: selectedProductObj.image_url
                  }}
                  size={48}
                />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.98rem', color: '#0f172a' }}>
                    {selectedProductObj.name || selectedProductObj.product_name}
                  </div>
                  <span
                    style={{
                      background: subForm.is_active ? '#dcfce7' : '#fef3c7',
                      color: subForm.is_active ? '#15803d' : '#b45309',
                      borderRadius: '999px',
                      padding: '2px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: subForm.is_active ? '#22c55e' : '#f59e0b'
                      }}
                    />
                    {subForm.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>

                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '3px', fontWeight: 600 }}>
                  <span>{selectedProductObj.variant_label || '500 ml'}</span>
                  <span style={{ margin: '0 6px' }}>•</span>
                  <span style={{ fontWeight: 800, color: '#0f172a' }}>
                    ₹{Number(selectedProductObj.selling_price || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Product Switcher (When adding or changing product) */}
            {isAddMode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#334155' }}>
                  Select Product / Dairy Item
                </label>
                <select
                  className="form-input"
                  value={subForm.product_id}
                  onChange={(e) => setSubForm((prev) => ({ ...prev, product_id: e.target.value }))}
                  style={{ fontWeight: 700, padding: '10px 12px', borderRadius: '10px' }}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.variant_label}) — ₹{Number(p.selling_price).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Daily Quantity Stepper */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>
                Daily quantity
              </label>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#f8fafc',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '12px',
                  overflow: 'hidden'
                }}
              >
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() =>
                    setSubForm((prev) => ({
                      ...prev,
                      quantity: Math.max(1, (parseInt(prev.quantity, 10) || 1) - 1)
                    }))
                  }
                  style={{
                    width: '52px',
                    height: '46px',
                    background: '#f1f5f9',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#334155'
                  }}
                  title="Decrease Quantity"
                >
                  <Minus size={18} />
                </button>

                <input
                  type="number"
                  min="1"
                  max="99"
                  value={subForm.quantity}
                  disabled={submitting}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1);
                    setSubForm((prev) => ({ ...prev, quantity: val }));
                  }}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    textAlign: 'center',
                    fontWeight: 900,
                    fontSize: '1.3rem',
                    color: '#0f172a',
                    outline: 'none'
                  }}
                />

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() =>
                    setSubForm((prev) => ({
                      ...prev,
                      quantity: (parseInt(prev.quantity, 10) || 1) + 1
                    }))
                  }
                  style={{
                    width: '52px',
                    height: '46px',
                    background: '#f1f5f9',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#334155'
                  }}
                  title="Increase Quantity"
                >
                  <Plus size={18} />
                </button>
              </div>

              {/* Quick Stepper Chips */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setSubForm((prev) => ({ ...prev, quantity: q }))}
                    style={{
                      padding: '4px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: parseInt(subForm.quantity, 10) === q ? '1.5px solid #16a34a' : '1px solid #cbd5e1',
                      background: parseInt(subForm.quantity, 10) === q ? '#ecfdf5' : '#ffffff',
                      color: parseInt(subForm.quantity, 10) === q ? '#15803d' : '#475569'
                    }}
                  >
                    {q} pkt
                  </button>
                ))}
              </div>
            </div>

            {/* Delivery Frequency */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>
                Delivery frequency
              </label>
              <select
                className="form-input"
                value={subForm.frequency}
                onChange={(e) => {
                  const val = e.target.value;
                  setSubForm((prev) => ({
                    ...prev,
                    frequency: val,
                    custom_days: val === 'CUSTOM' && !prev.custom_days ? 'TUE,THU,SAT' : prev.custom_days
                  }));
                }}
                style={{
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  padding: '11px 14px',
                  borderRadius: '12px',
                  background: '#f8fafc',
                  border: '1.5px solid #cbd5e1'
                }}
              >
                <option value="DAILY">Every day (Daily)</option>
                <option value="ALTERNATE_DAYS">Alternate days (Every 2 days)</option>
                <option value="CUSTOM">Custom days (e.g. Tue, Thu, Sat)</option>
              </select>
            </div>

            {/* Custom Day of Week Selector */}
            {subForm.frequency === 'CUSTOM' && (
              <div style={{
                background: '#f0fdf4',
                border: '1.5px solid #86efac',
                borderRadius: '12px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#166534' }}>
                    Select Days of Week for Milk Delivery:
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#047857', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>
                    {subForm.custom_days ? subForm.custom_days.replace(/,/g, ', ') : 'None selected'}
                  </span>
                </div>

                {/* Quick Presets */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setSubForm(prev => ({ ...prev, custom_days: 'TUE,THU,SAT' }))}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: '#dcfce7',
                      border: '1px solid #16a34a',
                      color: '#15803d',
                      cursor: 'pointer'
                    }}
                  >
                    🥛 Tue, Thu, Sat
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubForm(prev => ({ ...prev, custom_days: 'MON,WED,FRI' }))}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: '#eff6ff',
                      border: '1px solid #3b82f6',
                      color: '#1d4ed8',
                      cursor: 'pointer'
                    }}
                  >
                    🥛 Mon, Wed, Fri
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubForm(prev => ({ ...prev, custom_days: 'MON,TUE,WED,THU,FRI,SAT' }))}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#334155',
                      cursor: 'pointer'
                    }}
                  >
                    Mon – Sat
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubForm(prev => ({ ...prev, custom_days: 'SAT,SUN' }))}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#334155',
                      cursor: 'pointer'
                    }}
                  >
                    Weekends
                  </button>
                </div>

                {/* Day of Week Toggle Chips */}
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '2px' }}>
                  {[
                    { id: 'SUN', label: 'Sun' },
                    { id: 'MON', label: 'Mon' },
                    { id: 'TUE', label: 'Tue' },
                    { id: 'WED', label: 'Wed' },
                    { id: 'THU', label: 'Thu' },
                    { id: 'FRI', label: 'Fri' },
                    { id: 'SAT', label: 'Sat' }
                  ].map(d => {
                    const activeDays = (subForm.custom_days || '').split(',').map(s => s.trim().toUpperCase());
                    const isSelected = activeDays.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          let nextDays;
                          if (isSelected) {
                            nextDays = activeDays.filter(x => x !== d.id);
                          } else {
                            nextDays = [...activeDays.filter(Boolean), d.id];
                          }
                          setSubForm(prev => ({ ...prev, custom_days: nextDays.join(',') }));
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          border: isSelected ? '1.5px solid #059669' : '1px solid #cbd5e1',
                          background: isSelected ? '#10b981' : '#ffffff',
                          color: isSelected ? '#ffffff' : '#334155'
                        }}
                      >
                        {isSelected ? '✓ ' : ''}{d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Start Date */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Start date
                </label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setSubForm((prev) => ({ ...prev, start_date: currentMonthFirstDay }))}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid #86efac',
                      background: '#f0fdf4',
                      color: '#166534',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    1st of Month
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubForm((prev) => ({ ...prev, start_date: todayStr }))}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#475569',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Today
                  </button>
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  type="date"
                  className="form-input"
                  value={subForm.start_date}
                  onChange={(e) => setSubForm((prev) => ({ ...prev, start_date: e.target.value }))}
                  required
                  style={{
                    paddingLeft: '38px',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    padding: '11px 14px 11px 38px',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    background: '#f8fafc',
                    width: '100%'
                  }}
                />
                <Calendar
                  size={16}
                  color="#64748b"
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                />
              </div>
            </div>

            {/* Active / Paused Selector */}
            {!isAddMode && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#334155' }}>
                  Subscription Status
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setSubForm((prev) => ({ ...prev, is_active: 1 }))}
                    style={{
                      padding: '9px 12px',
                      borderRadius: '10px',
                      border: subForm.is_active === 1 ? '2px solid #16a34a' : '1px solid #cbd5e1',
                      background: subForm.is_active === 1 ? '#ecfdf5' : '#ffffff',
                      color: subForm.is_active === 1 ? '#15803d' : '#475569',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Check size={14} /> Active Delivery
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubForm((prev) => ({ ...prev, is_active: 0 }))}
                    style={{
                      padding: '9px 12px',
                      borderRadius: '10px',
                      border: subForm.is_active === 0 ? '2px solid #f59e0b' : '1px solid #cbd5e1',
                      background: subForm.is_active === 0 ? '#fef3c7' : '#ffffff',
                      color: subForm.is_active === 0 ? '#b45309' : '#475569',
                      fontWeight: 800,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Pause size={14} /> Paused
                  </button>
                </div>
              </div>
            )}

            {/* Business Rules Callout */}
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '10px',
                padding: '8px 12px',
                fontSize: '0.75rem',
                color: '#166534',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Sparkles size={14} color="#16a34a" style={{ flexShrink: 0 }} />
              <span>
                Changes apply to future deliveries. Historical deliveries and past invoices are safely preserved.
              </span>
            </div>

            {/* Save Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
              {onOpenMonthlyBill && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={async (e) => {
                    const saved = await handleSaveSubscription(e, true);
                    if (saved) {
                      onOpenMonthlyBill(customerId);
                    }
                  }}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #0054a6, #2563eb)',
                    color: 'white',
                    fontWeight: 900,
                    fontSize: '0.96rem',
                    padding: '13px 16px',
                    borderRadius: '12px',
                    border: 'none',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(0, 84, 166, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Calendar size={18} />
                  <span>{submitting ? 'Saving...' : 'Save & Send Advance Bill on WhatsApp ➔'}</span>
                </button>
              )}

              <button
                type="button"
                disabled={submitting}
                onClick={handleSaveSubscription}
                style={{
                  width: '100%',
                  background: onOpenMonthlyBill ? '#f8fafc' : '#16a34a',
                  color: onOpenMonthlyBill ? '#334155' : 'white',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  padding: onOpenMonthlyBill ? '10px 14px' : '14px',
                  borderRadius: '12px',
                  border: onOpenMonthlyBill ? '1.5px solid #cbd5e1' : 'none',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {submitting ? 'Saving...' : (isAddMode ? 'Save Subscription Only' : 'Save Changes Only')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CANCEL CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {cancelTargetSub && (
        <Modal
          isOpen={Boolean(cancelTargetSub)}
          onClose={() => !cancelling && setCancelTargetSub(null)}
          title="Cancel Subscription"
          maxWidth="440px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {cancelError && (
              <div
                style={{
                  background: '#fee2e2',
                  border: '1px solid #f87171',
                  color: '#991b1b',
                  padding: '10px',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 600
                }}
              >
                {cancelError}
              </div>
            )}

            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div
                style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '50%',
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px auto'
                }}
              >
                <Trash2 size={26} />
              </div>

              <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                Cancel {cancelTargetSub.product_name}?
              </h4>

              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0, lineHeight: 1.45 }}>
                Are you sure you want to stop recurring deliveries of{' '}
                <strong>{cancelTargetSub.product_name} ({cancelTargetSub.variant_label || 'Packet'})</strong> for{' '}
                <strong>{customerName}</strong>?
              </p>
            </div>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '0.78rem',
                color: '#475569'
              }}
            >
              🛡️ <strong>History Protection:</strong> Past completed deliveries, generated bills, and payment records
              remain intact.
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                type="button"
                className="btn btn-outline"
                disabled={cancelling}
                onClick={() => setCancelTargetSub(null)}
              >
                Keep Subscription
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleConfirmCancel}
                style={{
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: cancelling ? 'not-allowed' : 'pointer'
                }}
              >
                {cancelling ? 'Cancelling...' : 'Yes, Cancel Subscription'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
