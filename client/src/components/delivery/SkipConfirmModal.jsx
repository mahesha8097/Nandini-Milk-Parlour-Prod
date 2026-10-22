import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { formatDisplayDate } from '../../utils/dateUtils';
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

export default function SkipConfirmModal({ isOpen, onClose, target, onConfirm }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen || !target) return null;

  const handleConfirm = async () => {
    try {
      setSubmitting(true);
      await onConfirm(target, reason.trim() || 'Skipped for today');
      onClose();
    } catch (e) {
      console.error('Skip confirm error:', e);
    } finally {
      setSubmitting(false);
    }
  };

  const customerName = target.customer_name || 'Customer';
  const deliveryDate = target.delivery_date || target.date;
  const itemsText = target.items && target.items.length > 0
    ? `${target.items.length} product(s)`
    : target.product_name_snapshot || 'Today\'s delivery';

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !submitting && onClose()}
      title="Skip Delivery Confirmation"
      maxWidth="480px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            background: '#fffbeb',
            border: '1.5px solid #fde68a',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px'
          }}
        >
          <AlertCircle size={22} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '0.875rem', color: '#92400e' }}>
            <div style={{ fontWeight: '800', marginBottom: '4px', fontSize: '0.95rem' }}>
              Skip delivery for {customerName}?
            </div>
            <div>
              Date: <strong>{formatDisplayDate(deliveryDate)}</strong> • Item(s): {itemsText}
            </div>
            <ul style={{ margin: '8px 0 0 16px', padding: 0, fontSize: '0.8rem', lineHeight: 1.5 }}>
              <li>Recorded as <strong>SKIPPED</strong> for today.</li>
              <li><strong>₹0.00</strong> will be billed (No product or delivery charges).</li>
              <li>Permanent subscription remains <strong>100% untouched</strong> for tomorrow.</li>
            </ul>
          </div>
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontWeight: '700', fontSize: '0.85rem' }}>
            Reason for Skipping (Optional)
          </label>
          <input
            type="text"
            className="form-input"
            disabled={submitting}
            placeholder="e.g. Customer out of town, Door locked, Requested skip"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '6px' }}>
            {['Customer out of station', 'Door locked / not answering', 'Customer called to skip', 'Milk not required today'].map((sug) => (
              <button
                key={sug}
                type="button"
                disabled={submitting}
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
            type="button"
            onClick={handleConfirm}
            className="btn btn-warning"
            style={{
              fontWeight: '800',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              minWidth: '140px',
              justifyContent: 'center'
            }}
            disabled={submitting}
          >
            {submitting ? (
              <span>Skipping...</span>
            ) : (
              <>
                <XCircle size={16} /> Confirm Skip
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
