import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import html2canvas from 'html2canvas';
import Modal from '../../components/common/Modal';
import {
  Printer,
  RotateCcw,
  CheckCircle2,
  MessageCircle,
  Download
} from 'lucide-react';

export default function BillInvoiceModal({ billId, isOpen, onClose, onRecalculate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recalculating, setRecalculating] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const fetchBill = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/bills/${billId}`);
      setData(res);
    } catch (err) {
      setError(err.message || 'Unable to load invoice.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && billId) {
      fetchBill();
    }
  }, [isOpen, billId]);

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      setSuccessMsg('');
      const res = await api.post(`/bills/${billId}/regenerate`);
      setSuccessMsg('Invoice recalculated successfully with latest subscription start/end dates!');
      await fetchBill();
      onRecalculate?.();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      alert(err.message || 'Failed to recalculate bill');
    } finally {
      setRecalculating(false);
    }
  };

  if (!isOpen) return null;

  const handlePrint = () => {
    const printElement = document.getElementById('printable-invoice-content');
    if (!printElement) {
      window.print();
      return;
    }

    // Create an isolated hidden iframe for clean, instant, single-sheet printing
    let printIframe = document.getElementById('print-invoice-iframe');
    if (printIframe) {
      printIframe.remove();
    }

    printIframe = document.createElement('iframe');
    printIframe.id = 'print-invoice-iframe';
    printIframe.style.position = 'fixed';
    printIframe.style.right = '0';
    printIframe.style.bottom = '0';
    printIframe.style.width = '0';
    printIframe.style.height = '0';
    printIframe.style.border = '0';
    document.body.appendChild(printIframe);

    const doc = printIframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${bill.bill_number || ''}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm 10mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
              font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              background: #ffffff;
              color: #1e293b;
              padding: 0;
              margin: 0;
              font-size: 0.813rem;
              line-height: 1.4;
            }
            .invoice-sheet {
              width: 100%;
              border: 1px solid #94a3b8;
              border-radius: 4px;
              padding: 20px 24px;
              background: #ffffff;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            .badge {
              display: inline-block;
              padding: 2px 8px;
              border-radius: 4px;
              font-weight: 700;
              font-size: 0.7rem;
            }
            .badge-success { background: #ecfdf5; color: #065f46; }
            .badge-danger { background: #fef2f2; color: #991b1b; }
            .no-print { display: none !important; }
          </style>
        </head>
        <body>
          <div class="invoice-sheet">
            ${printElement.innerHTML}
          </div>
        </body>
      </html>
    `);
    doc.close();

    // Wait for images and fonts to load, then trigger print
    setTimeout(() => {
      printIframe.contentWindow.focus();
      printIframe.contentWindow.print();
    }, 350);
  };

  const handleDownloadImage = async () => {
    const invoiceElement = document.getElementById('printable-invoice-content');
    if (!invoiceElement) return;

    try {
      setCapturing(true);
      const canvas = await html2canvas(invoiceElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      const fileName = `Invoice_${bill.bill_number || 'bill'}.png`;
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
      alert('Could not download image: ' + err.message);
    } finally {
      setCapturing(false);
    }
  };

  const handleShareWhatsApp = async () => {
    const phone = bill.customer_phone || '';
    if (!phone) {
      alert('Customer does not have a phone number');
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const phoneFormatted = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    let msg = `*${profile.invoice_business_name || profile.business_name || 'NANDINI MILK PARLOUR'} — INVOICE*\n`;
    msg += `*Invoice No:* ${bill.bill_number}\n`;
    msg += `*Month:* ${bill.billing_month}\n`;
    msg += `*Customer:* ${bill.customer_name}\n\n`;
    
    if (items && items.length > 0) {
      const itemsList = items.map(it => `• ${it.product_name || it.product_name_snapshot} (${it.variant_label || it.variant_snapshot || 'Pkt'}) × ${it.total_quantity || it.quantity || 1} = ₹${(it.total_line_amount || it.total_amount || 0).toFixed(2)}`).join('\n');
      msg += `*Item Details:* \n${itemsList}\n\n`;
    }

    msg += `*Gross Bill:* ₹${grossAmount.toFixed(2)}\n`;
    if (advanceAdjusted > 0) {
      msg += `*Advance Settled:* -₹${advanceAdjusted.toFixed(2)}\n`;
    }
    if (totalReceived > 0) {
      msg += `*Amount Received:* ₹${totalReceived.toFixed(2)}\n`;
    }
    msg += `*Net Payable:* ₹${netPayable.toFixed(2)}\n`;
    if (remainingAdvance > 0) {
      msg += `*Remaining Advance Balance:* ₹${remainingAdvance.toFixed(2)}\n`;
    }
    msg += `\n*Payment Details:*\n`;
    msg += `*Gpay / PhonePe / Paytm:* ${profile.upi_phone || '7022754524'}\n`;
    if (profile.upi_id) {
      msg += `*UPI ID:* ${profile.upi_id}\n`;
    }
    msg += `\nThank you for choosing Nandini Milk Parlour! 🙏`;

    const invoiceElement = document.getElementById('printable-invoice-content');
    if (!invoiceElement) {
      window.open(`https://api.whatsapp.com/send?phone=${phoneFormatted}&text=${encodeURIComponent(msg)}`, '_blank');
      return;
    }

    try {
      setCapturing(true);
      const canvas = await html2canvas(invoiceElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
          window.open(`https://api.whatsapp.com/send?phone=${phoneFormatted}&text=${encodeURIComponent(msg)}`, '_blank');
          setCapturing(false);
          return;
        }

        const fileName = `Invoice_${bill.bill_number || 'bill'}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        // 1. Mobile / Web Share API with File
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: `Invoice ${bill.bill_number}`,
              text: msg,
              files: [file]
            });
            setCapturing(false);
            return;
          } catch (shareErr) {
            console.log('Native share canceled, using fallback:', shareErr);
          }
        }

        // 2. Desktop Fallback: Copy Image to Clipboard + Auto Download + Open WhatsApp
        try {
          if (navigator.clipboard && navigator.clipboard.write) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
          }
        } catch (clipErr) {
          console.log('Clipboard write note:', clipErr);
        }

        // Trigger automatic image download
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

        setToastMsg('📸 Invoice picture copied to clipboard & downloaded! Simply press Ctrl+V in WhatsApp to send the invoice picture.');
        setTimeout(() => setToastMsg(''), 9000);

        // Open WhatsApp Web
        window.open(`https://api.whatsapp.com/send?phone=${phoneFormatted}&text=${encodeURIComponent(msg)}`, '_blank');
        setCapturing(false);
      }, 'image/png');
    } catch (err) {
      console.error('Invoice capture error:', err);
      window.open(`https://api.whatsapp.com/send?phone=${phoneFormatted}&text=${encodeURIComponent(msg)}`, '_blank');
      setCapturing(false);
    }
  };

  const bill = data?.bill || {};
  const profile = data?.businessProfile || {};
  const items = data?.items || [];

  // Summary calculations
  const grossAmount = bill.gross_amount || 0;
  const advanceAdjusted = bill.advance_adjusted || 0;
  const paidAmount = bill.paid_amount || 0;
  const totalReceived = Math.max(advanceAdjusted, paidAmount);
  const netPayable = bill.net_payable !== undefined ? bill.net_payable : Math.max(0, grossAmount - advanceAdjusted);
  const previousDue = bill.previous_due || 0;
  
  // Advance balance breakdown
  const remainingAdvance = bill.customer_advance_balance !== undefined ? Number(bill.customer_advance_balance) : 0;
  const totalAdvancePaid = parseFloat((remainingAdvance + advanceAdjusted).toFixed(2));
  const hasAdvance = totalAdvancePaid > 0 || advanceAdjusted > 0 || bill.billing_type === 'PREPAID';
  const currentPending = bill.customer_pending_balance !== undefined ? Number(bill.customer_pending_balance) : (previousDue + netPayable);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Invoice - ${bill.bill_number || ''}`}
      maxWidth="780px"
    >
      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center' }}>Loading invoice...</div>
      ) : error ? (
        <div style={{ color: 'var(--accent-red)', padding: '20px' }}>{error}</div>
      ) : (
        <div id="printable-invoice">
          {/* Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }} className="no-print">
            <div>
              {successMsg && (
                <span style={{ fontSize: '0.8rem', color: '#166534', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={16} /> {successMsg}
                </span>
              )}
              {toastMsg && (
                <span style={{ fontSize: '0.8rem', color: '#0369a1', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px', background: '#e0f2fe', padding: '4px 8px', borderRadius: '4px' }}>
                  {toastMsg}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={handleRecalculate}
                className="btn btn-outline btn-sm"
                disabled={recalculating || capturing}
                title="Recalculate invoice based on latest subscription start and end dates"
              >
                <RotateCcw size={15} />
                {recalculating ? 'Recalculating...' : 'Recalculate Invoice'}
              </button>
              <button
                onClick={handleDownloadImage}
                className="btn btn-outline btn-sm"
                disabled={capturing}
                title="Download invoice as a high-res image picture"
              >
                <Download size={15} />
                {capturing ? 'Capturing...' : 'Download Picture'}
              </button>
              <button
                onClick={handleShareWhatsApp}
                className="btn btn-success btn-sm"
                disabled={capturing}
                style={{ background: '#25D366', color: 'white', borderColor: '#22c55e', fontWeight: '700' }}
                title="Send invoice picture and details to customer WhatsApp"
              >
                <MessageCircle size={15} />
                {capturing ? 'Preparing Picture...' : 'Send on WhatsApp'}
              </button>
              <button onClick={handlePrint} className="btn btn-primary btn-sm" disabled={capturing}>
                <Printer size={15} /> Print (1 Sheet)
              </button>
            </div>
          </div>

          {/* Single-Sheet Professional Invoice Sheet */}
          <div id="printable-invoice-content" className="invoice-sheet" style={{
            background: 'white',
            border: '1px solid #cbd5e1',
            borderRadius: 'var(--radius-md)',
            padding: '24px 28px',
            color: '#1e293b',
            fontSize: '0.813rem',
            lineHeight: '1.4'
          }}>
            {/* Top Heading */}
            <div style={{ textAlign: 'center', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
              <span style={{ fontSize: '1.15rem', fontWeight: '800', letterSpacing: '0.12em', color: '#0054a6', textTransform: 'uppercase' }}>
                INVOICE
              </span>
            </div>

            {/* Business Header & Invoice Meta */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '12px', borderBottom: '2px solid #0054a6', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {(profile.business_logo || profile.invoice_logo) && (
                  <div style={{
                    width: '56px',
                    height: '56px',
                    background: 'white',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <img
                      src={profile.business_logo || profile.invoice_logo}
                      alt="Business Logo"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                )}
                <div>
                  <h1 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0054a6', margin: 0, textTransform: 'uppercase' }}>
                    {profile.invoice_business_name || profile.business_name || 'NANDINI MILK PARLOUR'}
                  </h1>
                  <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '3px' }}>
                    {profile.address && `${profile.address}, `}{profile.state || 'Karnataka'} {profile.pincode && `- ${profile.pincode}`}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                    {profile.phone && `Phone: ${profile.phone}`} {profile.email && ` | Email: ${profile.email}`}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a' }}>
                  Invoice No: <span style={{ color: '#0054a6' }}>{bill.bill_number}</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
                  Date: <strong>{bill.bill_date}</strong>
                </div>
                {bill.created_at && (
                  <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                    Time: <strong>{new Date(bill.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                  </div>
                )}
                <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                  Month: <strong>{bill.billing_month}</strong>
                </div>
                <div style={{ marginTop: '4px' }}>
                  <span className={`badge ${bill.status === 'PAID' || bill.status === 'ADVANCE_PAID' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem', padding: '3px 8px' }}>
                    {bill.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer & Delivery Information */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>BILL TO:</div>
                <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{bill.customer_name}</div>
                <div style={{ fontSize: '0.78rem', color: '#475569' }}>Contact: {bill.customer_phone}</div>
                <div style={{ fontSize: '0.78rem', color: '#475569' }}>Address: {bill.customer_address}</div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>DELIVERY DETAILS:</div>
                <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
                  Route: <strong>{bill.route || 'General Delivery'}</strong>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                  Category: <strong>{bill.customer_category === 'BULK_HOTEL' ? 'Bulk / Commercial' : 'Household'}</strong>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                  Plan: <strong>{bill.billing_type === 'PREPAID' ? 'Prepaid (Advance)' : 'Postpaid'}</strong>
                </div>
              </div>
            </div>

            {/* Product Item Table (NO GST, Includes MRP & Effective PRICE) */}
            <div style={{ marginBottom: '14px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'center', width: '36px' }}>#</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>ITEM NAME</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', width: '70px' }}>QUANTITY</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', width: '65px' }}>UNIT</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', width: '75px' }}>MRP (₹)</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', width: '80px' }}>PRICE (₹)</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', width: '90px' }}>AMOUNT (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const itemName = item.product_name || item.product_name_snapshot;
                    const qty = item.total_quantity || item.quantity || 1;
                    const unitLabel = item.variant_label || item.variant_snapshot || 'Pkt';
                    const baseMrp = item.unit_price || item.unit_price_snapshot || 0;
                    const lineAmount = item.total_line_amount || item.total_amount || (baseMrp * qty);
                    const effectivePrice = qty > 0 ? (lineAmount / qty) : baseMrp;

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '6px 8px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ padding: '6px 8px', fontWeight: '600' }}>{itemName}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700' }}>{qty}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', color: '#64748b' }}>{unitLabel}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{baseMrp.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600' }}>{effectivePrice.toFixed(2)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '700' }}>{lineAmount.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bill Summary Breakdown */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
              <div style={{ width: '310px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                  <span style={{ color: '#64748b' }}>Sub Total (Delivered Milk):</span>
                  <span style={{ fontWeight: '600' }}>₹{grossAmount.toFixed(2)}</span>
                </div>
                
                {hasAdvance && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '6px 8px', margin: '6px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#0369a1', marginBottom: '3px', fontWeight: '700' }}>
                      <span>Advance Deposited / Paid:</span>
                      <span>₹{totalAdvancePaid.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#dc2626', marginBottom: '3px', fontWeight: '700' }}>
                      <span>Delivered Milk Deducted:</span>
                      <span>- ₹{advanceAdjusted.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#15803d', fontWeight: '800', borderTop: '1px dashed #86efac', paddingTop: '3px' }}>
                      <span>Remaining Advance Balance:</span>
                      <span>₹{remainingAdvance.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '3px' }}>
                  <span style={{ color: '#64748b' }}>Round Off:</span>
                  <span style={{ fontWeight: '600' }}>₹0.00</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: '800', borderTop: '1px solid #cbd5e1', paddingTop: '4px', marginBottom: '4px', color: '#0f172a' }}>
                  <span>Total Bill:</span>
                  <span>₹{grossAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#16a34a', marginBottom: '3px' }}>
                  <span>Received / Adjusted:</span>
                  <span style={{ fontWeight: '700' }}>₹{totalReceived.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: netPayable > 0 ? '#dc2626' : '#16a34a', marginBottom: '3px' }}>
                  <span>Net Due (Payable):</span>
                  <span style={{ fontWeight: '700' }}>₹{netPayable.toFixed(2)}</span>
                </div>
                {previousDue > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                    <span>Previous Due:</span>
                    <span>₹{previousDue.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: '800', borderTop: '1px solid #e2e8f0', paddingTop: '4px', marginTop: '3px', color: remainingAdvance > 0 ? '#15803d' : (currentPending > 0 ? '#dc2626' : '#0054a6') }}>
                  <span>{remainingAdvance > 0 ? 'Remaining Advance Balance:' : 'Pending Due:'}</span>
                  <span>₹{(remainingAdvance > 0 ? remainingAdvance : currentPending).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Advance Deduction Banner if applicable */}
            {advanceAdjusted > 0 && (
              <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '4px', fontSize: '0.75rem', color: '#065f46', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>✓ <strong>Advance Settled:</strong> ₹{advanceAdjusted.toFixed(2)} for delivered milk has been deducted from advance deposit.</span>
                <span>Customer Remaining Advance: <strong>₹{remainingAdvance.toFixed(2)}</strong></span>
              </div>
            )}

            {/* Payment Details & Authorized Signatory Section */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              padding: '12px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              marginBottom: '14px',
              alignItems: 'center'
            }}>
              {/* Left: Payment Info */}
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  PAYMENT DETAILS
                </div>
                <div style={{ fontSize: '0.78rem', marginTop: '3px', color: '#0f172a' }}>
                  Gpay / PhonePe / Paytm: <strong style={{ color: '#0054a6' }}>{profile.upi_phone || '7022754524'}</strong>
                </div>
                {profile.upi_id && (
                  <div style={{ fontSize: '0.78rem', marginTop: '2px' }}>
                    UPI ID: <strong style={{ color: '#0054a6' }}>{profile.upi_id}</strong>
                  </div>
                )}
                {profile.upi_qr && (
                  <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '64px',
                      height: '64px',
                      background: 'white',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <img
                        src={profile.upi_qr}
                        alt="UPI QR Code"
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                      <strong style={{ display: 'block', color: '#0f172a' }}>Scan to Pay</strong>
                      <span>Accepted: UPI • Cash • Bank</span>
                    </div>
                  </div>
                )}
                {!profile.upi_qr && (
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '3px' }}>
                    Accepted: UPI • Cash • Bank Transfer
                  </div>
                )}
              </div>

              {/* Right: Authorized Signature */}
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                {profile.signature ? (
                  <div style={{ height: '44px', marginBottom: '2px', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                    <img
                      src={profile.signature}
                      alt="Signature"
                      style={{ maxHeight: '44px', maxWidth: '140px', objectFit: 'contain' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                ) : (
                  <div style={{ height: '24px' }}></div>
                )}
                <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '3px', minWidth: '150px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0f172a' }}>Authorized Signatory</div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{profile.invoice_business_name || profile.business_name || 'Nandini Milk Parlour'}</div>
                </div>
              </div>
            </div>

            {/* Bottom Customer-Friendly Quote */}
            <div style={{ textAlign: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                "Thank you for choosing Nandini Milk Parlour — Freshness delivered with care."
              </p>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
