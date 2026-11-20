/**
 * WhatsApp Billing & Payment Message Helper
 * Generates professional, concise WhatsApp invoice and payment messages for Nandini Milk Parlour.
 * Supports all 5 billing schemes:
 *  A. PREPAID (Monthly Advance)
 *  B. POSTPAID (Monthly actual deliveries)
 *  C. WEEKLY (Weekly actual deliveries)
 *  D. DAILY (Spot / Daily Payment on delivery)
 *  E. COUPON (Pre-purchased coupon book system)
 */

export function formatMonthName(ym) {
  if (!ym || typeof ym !== 'string') return '';
  const parts = ym.slice(0, 7).split('-');
  if (parts.length < 2) return ym;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const m = parseInt(parts[1], 10);
  if (m >= 1 && m <= 12) return `${months[m - 1]} ${parts[0]}`;
  return ym;
}

export function formatShortDate(dStr) {
  if (!dStr) return '';
  const d = new Date(dStr + (dStr.length === 10 ? 'T12:00:00Z' : ''));
  if (isNaN(d.getTime())) return dStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatCustomerFlat(customer) {
  if (!customer) return 'Valued Customer';
  const name = customer.name || customer.customer_name || 'Customer';
  const flat = customer.flat_no || customer.customer_flat_no || '';
  const address = customer.address || customer.customer_address || '';
  if (flat) {
    const flatClean = flat.toLowerCase().startsWith('flat') || flat.toLowerCase().startsWith('villa')
      ? flat
      : `Flat ${flat}`;
    return `${name} / ${flatClean}`;
  }
  if (address) {
    return `${name} / ${address}`;
  }
  return name;
}

/**
 * Builds the professional WhatsApp message based on the customer's billing scheme.
 */
export function buildWhatsAppBillingMessage({
  billingScheme = '',
  customer = {},
  bill = null,
  payment = null,
  coupon = null,
  profile = {},
  statementUrl = '',
  cloudImageUrl = ''
}) {
  const normScheme = (billingScheme || bill?.billing_type || customer?.billing_type || 'POSTPAID').toUpperCase();
  const customerFlat = formatCustomerFlat(customer);
  const upiPhone = profile.upi_phone || profile.phone || '7022754524';
  const upiId = profile.upi_id || '';

  let msg = '';

  // =========================================================================
  // SCHEME A: PREPAID / MONTHLY ADVANCE (Auto-generated monthly)
  // Display: Invoice Amount, Advance Paid / Advance Adjusted, Remaining Advance Balance
  // Note: Remaining advance is NEVER shown as an outstanding amount!
  // =========================================================================
  if (normScheme === 'PREPAID') {
    const period = formatMonthName(bill?.billing_month) || bill?.billing_month || 'Monthly';
    const invoiceNo = bill?.bill_number || `NB-${(bill?.billing_month || '').replace('-', '')}-${String(customer.id || '').padStart(4, '0')}`;
    const invoiceAmount = Number(bill?.gross_amount || 0);
    const advanceAdjusted = Number(bill?.advance_adjusted || 0);

    let remainingAdvance = 0;
    if (customer.remaining_advance !== undefined) {
      remainingAdvance = Number(customer.remaining_advance || 0);
    } else if (bill?.remaining_advance !== undefined) {
      remainingAdvance = Number(bill.remaining_advance || 0);
    } else if (customer.total_advance_paid !== undefined) {
      remainingAdvance = Math.max(0, Number(customer.total_advance_paid) - advanceAdjusted);
    } else {
      remainingAdvance = Number(customer.advance_balance || 0);
    }

    const netPayable = bill?.net_payable !== undefined ? Number(bill.net_payable) : Math.max(0, invoiceAmount - advanceAdjusted);

    msg += `Dear Valued Customer,\n\n`;
    msg += `Your ${period} invoice/bill has been generated.\n\n`;
    msg += `*Invoice No:* ${invoiceNo}\n`;
    msg += `*Customer / Flat:* ${customerFlat}\n`;
    msg += `*Billing Scheme:* Prepaid (Monthly Advance)\n`;
    msg += `*Invoice Amount:* ₹${invoiceAmount.toFixed(2)}\n`;
    if (customer.total_advance_paid !== undefined && Number(customer.total_advance_paid) > 0) {
      msg += `*Advance Paid:* ₹${Number(customer.total_advance_paid).toFixed(2)}\n`;
    }
    msg += `*Advance Adjusted:* ₹${advanceAdjusted.toFixed(2)}\n`;
    msg += `*Remaining Advance Balance:* ₹${remainingAdvance.toFixed(2)}\n`;

    if (netPayable > 0) {
      msg += `*Net Payable:* ₹${netPayable.toFixed(2)}\n`;
      msg += `\n*Payment Details:*\n`;
      msg += `*GPay / PhonePe / Paytm:* ${upiPhone}\n`;
      if (upiId) msg += `*UPI ID:* ${upiId}\n`;
    } else {
      msg += `*Net Payable:* ₹0.00 (All Clear ✓)\n`;
    }

  // =========================================================================
  // SCHEME B: POSTPAID (Monthly based on actual deliveries)
  // Display: Invoice Amount, Amount Paid, Outstanding Balance
  // =========================================================================
  } else if (normScheme === 'POSTPAID') {
    const period = formatMonthName(bill?.billing_month) || bill?.billing_month || 'Monthly';
    const invoiceNo = bill?.bill_number || `NB-${(bill?.billing_month || '').replace('-', '')}-${String(customer.id || '').padStart(4, '0')}`;
    const invoiceAmount = Number(bill?.gross_amount || 0);
    const amountPaid = Number(bill?.paid_amount || 0);
    const outstanding = bill?.net_payable !== undefined ? Number(bill.net_payable) : Math.max(0, invoiceAmount - amountPaid);

    msg += `Dear Valued Customer,\n\n`;
    msg += `Your ${period} invoice/bill has been generated.\n\n`;
    msg += `*Invoice No:* ${invoiceNo}\n`;
    msg += `*Customer / Flat:* ${customerFlat}\n`;
    msg += `*Billing Scheme:* Postpaid\n`;
    msg += `*Invoice Amount:* ₹${invoiceAmount.toFixed(2)}\n`;
    msg += `*Amount Paid:* ₹${amountPaid.toFixed(2)}\n`;
    if (outstanding > 0) {
      msg += `*Outstanding Balance:* ₹${outstanding.toFixed(2)}\n`;
      msg += `\n*Payment Details:*\n`;
      msg += `*GPay / PhonePe / Paytm:* ${upiPhone}\n`;
      if (upiId) msg += `*UPI ID:* ${upiId}\n`;
    } else {
      msg += `*Outstanding Balance:* ₹0.00 (All Clear ✓)\n`;
    }

  // =========================================================================
  // SCHEME C: WEEKLY BILL (Weekly actual deliveries)
  // Display: Billing Period (From Date – To Date), Invoice Amount, Amount Paid, Outstanding Balance
  // =========================================================================
  } else if (normScheme === 'WEEKLY') {
    let periodRange = '';
    if (bill?.start_date && bill?.end_date) {
      periodRange = `${formatShortDate(bill.start_date)} – ${formatShortDate(bill.end_date)}`;
    } else {
      periodRange = bill?.billing_month || 'Weekly';
    }
    const invoiceNo = bill?.bill_number || `WB-${String(bill?.id || '').padStart(4, '0')}`;
    const invoiceAmount = Number(bill?.gross_amount || 0);
    const amountPaid = Number(bill?.paid_amount || 0);
    const outstanding = bill?.net_payable !== undefined ? Number(bill.net_payable) : Math.max(0, invoiceAmount - amountPaid);

    msg += `Dear Valued Customer,\n\n`;
    msg += `Your ${periodRange} invoice/bill has been generated.\n\n`;
    msg += `*Invoice No:* ${invoiceNo}\n`;
    msg += `*Customer / Flat:* ${customerFlat}\n`;
    msg += `*Billing Scheme:* Weekly Bill\n`;
    msg += `*Billing Period:* ${periodRange}\n`;
    msg += `*Invoice Amount:* ₹${invoiceAmount.toFixed(2)}\n`;
    msg += `*Amount Paid:* ₹${amountPaid.toFixed(2)}\n`;
    if (outstanding > 0) {
      msg += `*Outstanding Balance:* ₹${outstanding.toFixed(2)}\n`;
      msg += `\n*Payment Details:*\n`;
      msg += `*GPay / PhonePe / Paytm:* ${upiPhone}\n`;
      if (upiId) msg += `*UPI ID:* ${upiId}\n`;
    } else {
      msg += `*Outstanding Balance:* ₹0.00 (All Clear ✓)\n`;
    }

  // =========================================================================
  // SCHEME D: DAILY PAYMENT (Pay daily on delivery / cash / UPI)
  // Generate short daily payment receipt: Delivery Date, Customer/Flat,
  // Delivery Amount, Payment Received, Payment Status, Payment Mode
  // =========================================================================
  } else if (normScheme === 'DAILY') {
    const rawDate = payment?.payment_date || bill?.bill_date || (new Date().toISOString().slice(0, 10));
    const deliveryDate = formatShortDate(rawDate);
    const receiptNo = payment?.receipt_number || bill?.bill_number || `REC-${rawDate.replace(/-/g, '')}-${String(customer.id || '').padStart(3, '0')}`;
    const deliveryAmount = Number(payment?.delivery_amount || bill?.gross_amount || payment?.amount || 0);
    const paymentReceived = Number(payment?.amount || payment?.paid_amount || bill?.paid_amount || 0);
    const isPaid = paymentReceived >= deliveryAmount && deliveryAmount > 0;
    const paymentStatus = payment?.status || (isPaid ? 'Paid ✓' : (paymentReceived > 0 ? `Partial (₹${paymentReceived.toFixed(2)})` : 'Pending'));
    const paymentMode = payment?.payment_method || payment?.payment_mode || 'Cash';

    msg += `Dear Valued Customer,\n\n`;
    msg += `Your ${deliveryDate} daily payment receipt has been generated.\n\n`;
    msg += `*Receipt No:* ${receiptNo}\n`;
    msg += `*Customer / Flat:* ${customerFlat}\n`;
    msg += `*Billing Scheme:* Daily Payment\n`;
    msg += `*Delivery Date:* ${deliveryDate}\n`;
    msg += `*Delivery Amount:* ₹${deliveryAmount.toFixed(2)}\n`;
    msg += `*Payment Received:* ₹${paymentReceived.toFixed(2)}\n`;
    msg += `*Payment Status:* ${paymentStatus}\n`;
    msg += `*Payment Mode:* ${paymentMode}\n`;

    if (!isPaid && deliveryAmount > paymentReceived) {
      const due = deliveryAmount - paymentReceived;
      msg += `*Balance Due:* ₹${due.toFixed(2)}\n`;
      msg += `\n*Payment Details:*\n`;
      msg += `*GPay / PhonePe / Paytm:* ${upiPhone}\n`;
      if (upiId) msg += `*UPI ID:* ${upiId}\n`;
    }

  // =========================================================================
  // SCHEME E: COUPON SYSTEM (Pre-purchased coupon book)
  // Display: Coupons Purchased, Coupons Used, Remaining Coupons, Statement Period
  // Only displays recorded coupon data.
  // =========================================================================
  } else if (normScheme === 'COUPON') {
    const period = coupon?.period || formatMonthName(bill?.billing_month) || 'Current Period';
    const invoiceNo = bill?.bill_number || coupon?.book_number || `CB-${String(customer.id || '').padStart(4, '0')}`;
    const couponsPurchased = coupon?.total_coupons !== undefined ? Number(coupon.total_coupons) : (coupon?.purchased || 0);
    const couponsUsed = coupon?.used_coupons !== undefined ? Number(coupon.used_coupons) : (coupon?.used || 0);
    const remainingCoupons = coupon?.remaining_coupons !== undefined ? Number(coupon.remaining_coupons) : (customer?.coupon_balance || 0);

    msg += `Dear Valued Customer,\n\n`;
    msg += `Your ${period} coupon statement/bill has been generated.\n\n`;
    msg += `*Invoice No:* ${invoiceNo}\n`;
    msg += `*Customer / Flat:* ${customerFlat}\n`;
    msg += `*Billing Scheme:* Coupon System\n`;
    if (period) {
      msg += `*Coupon Statement Period:* ${period}\n`;
    }
    if (coupon?.book_number) {
      msg += `*Coupon Book:* #${coupon.book_number}\n`;
    }
    msg += `*Coupons Purchased:* ${couponsPurchased}\n`;
    msg += `*Coupons Used:* ${couponsUsed}\n`;
    msg += `*Remaining Coupons:* ${remainingCoupons}\n`;

    if (bill && Number(bill.gross_amount) > 0) {
      msg += `*Book Amount:* ₹${Number(bill.gross_amount).toFixed(2)}\n`;
      if (Number(bill.net_payable) > 0) {
        msg += `*Net Payable:* ₹${Number(bill.net_payable).toFixed(2)}\n`;
        msg += `\n*Payment Details:*\n`;
        msg += `*GPay / PhonePe / Paytm:* ${upiPhone}\n`;
        if (upiId) msg += `*UPI ID:* ${upiId}\n`;
      }
    }
  }

  // Online Statement / Invoice Link (where attachment is not supported or for online verification)
  if (statementUrl) {
    msg += `\n📱 *View Online Invoice & Deliveries:* \n${statementUrl}\n`;
  }
  if (cloudImageUrl) {
    msg += `\n📸 *View / Download Invoice Picture:* \n${cloudImageUrl}\n`;
  }

  // Common Professional Closing Message
  msg += `\nKindly refer to the attached invoice/receipt for complete details.\n\n`;
  msg += `We sincerely appreciate your continued trust and support.\n\n`;
  msg += `*Thank you for choosing Nandini Milk Parlour.* 🙏`;

  return msg;
}

/**
 * Helper to build the direct WhatsApp click URL (e.g. for desktop or wa.me redirection).
 */
export function buildWhatsAppUrl(phone, message) {
  let cleanPhone = String(phone || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
  if (cleanPhone.length === 10) {
    cleanPhone = `91${cleanPhone}`;
  }
  return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
}
