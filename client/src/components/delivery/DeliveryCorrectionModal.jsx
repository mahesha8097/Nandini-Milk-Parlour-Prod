import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import ProductPacketImage from '../ProductPacketImage';
import { api } from '../../api/client';
import { formatDisplayDate } from '../../utils/dateUtils';
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Minus,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  XCircle
} from 'lucide-react';

export default function DeliveryCorrectionModal({ isOpen, onClose, delivery, onSaveSuccess }) {
  const [correctedQty, setCorrectedQty] = useState(1);
  const [newStatus, setNewStatus] = useState('DELIVERED');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkingSafety, setCheckingSafety] = useState(false);
  const [safetyInfo, setSafetyInfo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && delivery) {
      const initQty = delivery.quantity ?? 1;
      setCorrectedQty(initQty);
      setNewStatus(delivery.status === 'SKIPPED' || initQty === 0 ? 'SKIPPED' : 'DELIVERED');
      setReason('');
      setError('');
      setSafetyInfo(null);
      checkSafety(delivery.id);
    }
  }, [isOpen, delivery]);

  const checkSafety = async (deliveryId) => {
    try {
      setCheckingSafety(true);
      const res = await api.get(`/deliveries/${deliveryId}/safety`);
      setSafetyInfo(res);
    } catch (err) {
      console.warn('Safety check warning:', err.message);
      setSafetyInfo({ isSafe: true, isLocked: false });
    } finally {
      setCheckingSafety(false);
    }
  };

  if (!isOpen || !delivery) return null;

  const plannedQuantity = delivery.subscription_quantity || delivery.req_normal_quantity || delivery.quantity || 1;
  const previousQuantity = delivery.quantity || 0;
  const isLocked = safetyInfo?.isLocked;

  const handleStatusChange = (status) => {
    setNewStatus(status);
    if (status === 'SKIPPED') {
      setCorrectedQty(0);
      if (!reason) setReason('Marked as Skipped');
    } else if (correctedQty === 0) {
      setCorrectedQty(1);
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (isLocked) {
      setError(safetyInfo?.reason || 'Cannot correct delivery: bill has already received payments.');
      return;
    }

    const qty = parseInt(correctedQty, 10);
    if (isNaN(qty) || qty < 0) {
      setError('Please enter a valid non-negative quantity (0 to skip).');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const targetStatus = newStatus === 'SKIPPED' || qty === 0 ? 'SKIPPED' : 'DELIVERED';
      const payload = {
        corrected_quantity: targetStatus === 'SKIPPED' ? 0 : qty,
        status: targetStatus,
        reason: reason.trim() || (targetStatus === 'SKIPPED' ? 'Corrected: Marked as Skipped' : `Corrected quantity to ${qty}`)
      };

      const res = await api.post(`/deliveries/${delivery.id}/correct`, payload);
      if (onSaveSuccess) {
        onSaveSuccess(res);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save delivery correction.');
    } finally {
      setSubmitting(false);
    }
  };

  const quickReasons = [
    'Mistakenly entered wrong quantity',
    'Customer took 1 packet only',
    'Customer took extra packet on delivery',
    'Did not deliver (Change to Skipped)',
    'Wrong customer marked by mistake'
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !submitting && onClose()}
      title="Correct Delivery"
      maxWidth="500px"
    >
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && (
          <div
            style={{
              padding: '12px 14px',
              background: '#fee2e2',
              border: '1.5px solid #ef4444',
              color: '#991b1b',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px'
            }}
          >
            <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>{error}</div>
          </div>
        )}

        {/* Financial Lock Warning Banner */}
        {isLocked && (
          <div
            style={{
              padding: '14px 16px',
              background: '#fff1f2',
              border: '2px solid #f43f5e',
              color: '#9f1239',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              lineHeight: 1.45
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800', marginBottom: '4px' }}>
              <Lock size={18} color="#e11d48" />
              <span>Finalized Invoice Protected</span>
            </div>
            <p style={{ margin: 0 }}>
              {safetyInfo?.reason || 'This delivery belongs to an invoice with recorded payments. Cannot silently rewrite historical accounting records.'}
            </p>
          </div>
        )}

        {/* Customer & Product Card Summary */}
        <div
          style={{
            background: '#f8fafc',
            border: '1.5px solid #e2e8f0',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {delivery.customer_serial_no > 0 && (
                  <span
                    style={{
                      background: '#0054a6',
                      color: '#fff',
                      fontWeight: '800',
                      fontSize: '0.72rem',
                      padding: '1px 6px',
                      borderRadius: '4px'
                    }}
                  >
                    #{delivery.customer_serial_no}
                  </span>
                )}
                <span style={{ fontWeight: '800', fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                  {delivery.customer_name}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Route: {delivery.customer_route || 'N/A'} • {delivery.customer_address}
              </div>
            </div>

            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: '800',
                background: '#e0f2fe',
                color: '#0369a1',
                padding: '3px 8px',
                borderRadius: '4px'
              }}
            >
              {formatDisplayDate(delivery.delivery_date)}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              borderTop: '1px dashed #cbd5e1',
              paddingTop: '10px'
            }}
          >
            <ProductPacketImage product={delivery} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: '700', fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {delivery.product_name_snapshot}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Variant: {delivery.variant_snapshot || 'Standard'} • ₹{delivery.unit_price_snapshot?.toFixed(2)}/unit
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Originally Planned</div>
              <div style={{ fontWeight: '800', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {plannedQuantity} pkt(s)
              </div>
            </div>
          </div>

          {/* Previous Delivery Snapshot Info */}
          <div
            style={{
              background: '#f1f5f9',
              borderRadius: '6px',
              padding: '8px 12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.8rem'
            }}
          >
            <span>Previously Recorded Delivered:</span>
            <span style={{ fontWeight: '800', color: '#b45309' }}>
              {previousQuantity} pkt{previousQuantity !== 1 ? 's' : ''} (₹{delivery.total_amount?.toFixed(2)})
            </span>
          </div>
        </div>

        {/* Quantity Editor Section */}
        <div className="form-group" style={{ margin: 0 }}>
          <label
            className="form-label"
            style={{ fontWeight: '800', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between' }}
          >
            <span>Corrected Actual Quantity *</span>
            <span style={{ color: parseInt(correctedQty, 10) === 0 ? '#dc2626' : 'var(--primary)', fontWeight: '800' }}>
              {parseInt(correctedQty, 10) === 0 ? '⚠ Change to SKIPPED (0 packets)' : `${correctedQty} Packet(s)`}
            </span>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', margin: '8px 0' }}>
            <button
              type="button"
              disabled={isLocked || submitting}
              onClick={() => setCorrectedQty(Math.max(0, (parseInt(correctedQty, 10) || 0) - 1))}
              style={{
                width: '46px',
                height: '46px',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid #cbd5e1',
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                fontWeight: '800'
              }}
              title="Decrease Quantity"
            >
              <Minus size={20} />
            </button>

            <input
              type="number"
              min="0"
              max="99"
              disabled={isLocked || submitting}
              className="form-input"
              value={correctedQty}
              onChange={(e) => {
                const val = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0);
                setCorrectedQty(val);
              }}
              style={{
                textAlign: 'center',
                fontSize: '1.35rem',
                fontWeight: '900',
                width: '90px',
                height: '46px',
                borderColor: parseInt(correctedQty, 10) === 0 ? '#ef4444' : 'var(--primary)',
                color: parseInt(correctedQty, 10) === 0 ? '#dc2626' : 'var(--primary-dark)'
              }}
              required
            />

            <button
              type="button"
              disabled={isLocked || submitting}
              onClick={() => setCorrectedQty((parseInt(correctedQty, 10) || 0) + 1)}
              style={{
                width: '46px',
                height: '46px',
                borderRadius: 'var(--radius-md)',
                border: '1.5px solid #cbd5e1',
                background: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.2rem',
                fontWeight: '800'
              }}
              title="Increase Quantity"
            >
              <Plus size={20} />
            </button>
          </div>

          {/* Quick Shortcuts */}
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
            <button
              type="button"
              disabled={isLocked || submitting}
              onClick={() => {
                setCorrectedQty(0);
                if (!reason) setReason('Marked delivered by mistake (Change to Skipped)');
              }}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                border: '1px solid #fca5a5',
                background: parseInt(correctedQty, 10) === 0 ? '#ef4444' : '#fff5f5',
                color: parseInt(correctedQty, 10) === 0 ? 'white' : '#b91c1c',
                fontSize: '0.75rem',
                fontWeight: '800',
                cursor: 'pointer'
              }}
            >
              0 (Skip Today)
            </button>
            {[1, 2, 3, 4, 5].map((q) => (
              <button
                key={q}
                type="button"
                disabled={isLocked || submitting}
                onClick={() => setCorrectedQty(q)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  background: parseInt(correctedQty, 10) === q ? 'var(--primary)' : 'white',
                  color: parseInt(correctedQty, 10) === q ? 'white' : '#334155',
                  fontSize: '0.78rem',
                  fontWeight: '800',
                  cursor: 'pointer'
                }}
              >
                {q} pkt
              </button>
            ))}
          </div>
        </div>

        {/* New Status Selection (Delivered or Skipped) */}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontWeight: '800', fontSize: '0.85rem' }}>
            New Status *
          </label>
          <select
            className="form-input"
            value={newStatus}
            disabled={isLocked || submitting}
            onChange={(e) => handleStatusChange(e.target.value)}
            style={{ fontWeight: '700', padding: '9px 12px' }}
          >
            <option value="DELIVERED">Delivered (Record as completed)</option>
            <option value="SKIPPED">Skipped (Customer did not take milk today)</option>
          </select>
        </div>

        {/* Reason / Note */}
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontWeight: '700', fontSize: '0.85rem' }}>
            Reason for Correction *
          </label>
          <textarea
            className="form-input"
            rows="2"
            disabled={isLocked || submitting}
            placeholder="e.g. Incorrectly marked 2 packets. Actually delivered only 1."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            style={{ resize: 'vertical' }}
          />

          {/* Quick Reason Suggestions */}
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '6px' }}>
            {quickReasons.map((sug) => (
              <button
                key={sug}
                type="button"
                disabled={isLocked || submitting}
                onClick={() => setReason(sug)}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '0.72rem',
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                + {sug}
              </button>
            ))}
          </div>
        </div>

        {/* Safety & Accounting Note */}
        {!isLocked && (
          <div
            style={{
              padding: '8px 12px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '6px',
              fontSize: '0.76rem',
              color: '#166534',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Sparkles size={14} color="#16a34a" />
            <span>
              Safely updates delivery record, recalculates eligible billing subtotals, and preserves complete audit history.
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-outline"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{
              fontWeight: '800',
              minWidth: '170px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
            disabled={isLocked || submitting || checkingSafety}
          >
            {submitting ? (
              <span>Saving Correction...</span>
            ) : (
              <>
                <CheckCircle2 size={16} /> Save Correction
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
