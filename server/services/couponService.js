const db = require('../config/db');

/**
 * Helper to generate sequential coupon receipt numbers
 */
async function generateCouponReceiptNumber() {
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `REC-CPN-${todayStr}-`;
  try {
    const maxRow = await db.prepare('SELECT receipt_number FROM payments WHERE receipt_number LIKE ? ORDER BY id DESC LIMIT 1').get(`${prefix}%`);
    let nextSeq = 1;
    if (maxRow && maxRow.receipt_number) {
      const parts = maxRow.receipt_number.split('-');
      const last = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(last)) nextSeq = last + 1;
    }
    return `${prefix}${nextSeq.toString().padStart(4, '0')}`;
  } catch (e) {
    return `${prefix}${Date.now().toString().slice(-4)}`;
  }
}

/**
 * Issue a new coupon book to a customer
 */
async function issueCouponBook({
  customerId,
  bookNumber,
  totalCoupons,
  pricePaid = 0,
  paymentMethod = 'CASH',
  issueDate,
  notes = '',
  agentId = 1,
  recordedByUserId = null
}) {
  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) {
    throw new Error('Customer not found');
  }

  const couponsCount = parseInt(totalCoupons, 10);
  if (isNaN(couponsCount) || couponsCount <= 0) {
    throw new Error('Total coupons must be a positive integer');
  }

  const finalBookNumber = bookNumber && bookNumber.trim()
    ? bookNumber.trim()
    : `BK-${customerId}-${Date.now().toString().slice(-4)}`;

  const finalIssueDate = issueDate || new Date().toISOString().slice(0, 10);
  const amountPaid = parseFloat(pricePaid || 0);

  // 1. Insert coupon book
  const insertBook = await db.prepare(`
    INSERT INTO coupon_books (
      customer_id, book_number, total_coupons, used_coupons, remaining_coupons,
      price_paid, payment_method, issue_date, status, notes, agent_id,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, 0, ?,
      ?, ?, ?, 'ACTIVE', ?, ?,
      datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run(
    customerId,
    finalBookNumber,
    couponsCount,
    couponsCount,
    amountPaid,
    paymentMethod,
    finalIssueDate,
    notes,
    agentId || customer.agent_id || 1
  );

  const bookId = insertBook.lastInsertRowid;

  // 2. Increase customer coupon_balance
  const currentCouponBal = parseInt(customer.coupon_balance, 10) || 0;
  const newCouponBal = currentCouponBal + couponsCount;

  await db.prepare(`
    UPDATE customers
    SET coupon_balance = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(newCouponBal, customerId);

  // 3. Log in coupon_transactions
  await db.prepare(`
    INSERT INTO coupon_transactions (
      customer_id, coupon_book_id, delivery_id, change_amount, balance_after,
      transaction_type, transaction_date, notes, agent_id, created_at
    ) VALUES (
      ?, ?, NULL, ?, ?,
      'BOOK_PURCHASE', ?, ?, ?, datetime('now', 'localtime')
    )
  `).run(
    customerId,
    bookId,
    couponsCount,
    newCouponBal,
    finalIssueDate,
    `Purchased Coupon Book #${finalBookNumber} (${couponsCount} coupons)${notes ? ` - ${notes}` : ''}`,
    agentId || customer.agent_id || 1
  );

  // 4. If advance payment was made, record receipt in payments and customer_ledger
  if (amountPaid > 0) {
    const receiptNum = await generateCouponReceiptNumber();
    await db.prepare(`
      INSERT INTO payments (
        receipt_number, customer_id, bill_id, payment_type, amount, payment_date,
        payment_method, reference_number, notes, created_at, recorded_by_user_id, agent_id
      ) VALUES (
        ?, ?, NULL, 'ADVANCE_PAYMENT', ?, ?,
        ?, ?, ?, datetime('now', 'localtime'), ?, ?
      )
    `).run(
      receiptNum,
      customerId,
      amountPaid,
      finalIssueDate,
      paymentMethod,
      finalBookNumber,
      `Coupon Book #${finalBookNumber} payment (${couponsCount} coupons)`,
      recordedByUserId,
      agentId || customer.agent_id || 1
    );

    // Record in ledger
    await db.prepare(`
      INSERT INTO customer_ledger (
        customer_id, transaction_date, transaction_type, reference_id, debit, credit,
        advance_balance_after, pending_balance_after, description, created_at
      ) VALUES (
        ?, ?, 'PAYMENT_RECEIVED', ?, 0, ?,
        ?, ?, ?, datetime('now', 'localtime')
      )
    `).run(
      customerId,
      finalIssueDate,
      receiptNum,
      amountPaid,
      customer.advance_balance || 0,
      customer.pending_balance || 0,
      `Payment received for Coupon Book #${finalBookNumber} (${couponsCount} coupons, ₹${amountPaid})`
    );
  }

  const createdBook = await db.prepare('SELECT * FROM coupon_books WHERE id = ?').get(bookId);
  return {
    book: createdBook,
    newCouponBalance: newCouponBal
  };
}

/**
 * Deduct coupons for a delivery when marked DELIVERED
 */
async function deductCouponsForDelivery(delivery) {
  if (!delivery || !delivery.customer_id) return null;

  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(delivery.customer_id);
  if (!customer) return null;

  // Deduct coupons if customer is COUPON billing type OR has active coupon books/balance
  const isCouponBilling = customer.billing_type === 'COUPON';
  const hasCoupons = (parseInt(customer.coupon_balance, 10) || 0) > 0;

  if (!isCouponBilling && !hasCoupons) {
    return null; // Not using coupons
  }

  // Check if this delivery already had coupons deducted
  const existingTx = await db.prepare(`
    SELECT * FROM coupon_transactions
    WHERE delivery_id = ? AND transaction_type = 'DELIVERY_USAGE'
  `).get(delivery.id);

  if (existingTx) {
    return null; // Already deducted
  }

  const qty = parseInt(delivery.quantity, 10) || 1;
  if (qty <= 0) return null;

  // Find active coupon books for this customer (oldest first - FIFO)
  const activeBooks = await db.prepare(`
    SELECT * FROM coupon_books
    WHERE customer_id = ? AND status = 'ACTIVE' AND remaining_coupons > 0
    ORDER BY issue_date ASC, id ASC
  `).all(customer.id);

  let bookToLink = null;
  let remainingToDeductFromBooks = qty;

  for (const book of activeBooks) {
    if (remainingToDeductFromBooks <= 0) break;
    bookToLink = book.id;
    const canDeduct = Math.min(book.remaining_coupons, remainingToDeductFromBooks);
    const newUsed = book.used_coupons + canDeduct;
    const newRemaining = book.remaining_coupons - canDeduct;
    const newStatus = newRemaining === 0 ? 'EXHAUSTED' : 'ACTIVE';

    await db.prepare(`
      UPDATE coupon_books
      SET used_coupons = ?, remaining_coupons = ?, status = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(newUsed, newRemaining, newStatus, book.id);

    remainingToDeductFromBooks -= canDeduct;
  }

  const hasActiveBooks = activeBooks.length > 0;
  const currentBal = parseInt(customer.coupon_balance, 10) || 0;
  // If active registered books exist, deduct from book & balance.
  // If customer has no registered books yet (legacy physical coupons given offline),
  // they are delivering milk normally; payment calculation starts when they take their next book.
  const actualDeducted = hasActiveBooks ? (qty - remainingToDeductFromBooks) : 0;
  const newBal = Math.max(0, currentBal - actualDeducted);

  if (hasActiveBooks) {
    await db.prepare(`
      UPDATE customers
      SET coupon_balance = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(newBal, customer.id);
  }

  // Record transaction log
  const txDate = delivery.delivery_date || new Date().toISOString().slice(0, 10);
  const noteText = hasActiveBooks
    ? `Delivered ${qty}x ${delivery.product_name_snapshot || 'Milk'} (${txDate})`
    : `Delivered ${qty}x ${delivery.product_name_snapshot || 'Milk'} (Using pre-issued physical coupon - payment tracked from next book purchase)`;

  await db.prepare(`
    INSERT INTO coupon_transactions (
      customer_id, coupon_book_id, delivery_id, change_amount, balance_after,
      transaction_type, transaction_date, notes, agent_id, created_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      'DELIVERY_USAGE', ?, ?, ?, datetime('now', 'localtime')
    )
  `).run(
    customer.id,
    bookToLink,
    delivery.id,
    -actualDeducted,
    newBal,
    txDate,
    noteText,
    delivery.agent_id || customer.agent_id || 1
  );

  return { deducted: actualDeducted, balanceAfter: newBal, legacyCouponDelivery: !hasActiveBooks };
}

/**
 * Revert coupons if a delivery is un-delivered / skipped / missed / deleted
 */
async function revertCouponsForDelivery(deliveryId) {
  if (!deliveryId) return null;

  const existingTx = await db.prepare(`
    SELECT * FROM coupon_transactions
    WHERE delivery_id = ? AND transaction_type = 'DELIVERY_USAGE'
  `).get(deliveryId);

  if (!existingTx) return null; // No coupon deduction was made

  const refundQty = Math.abs(existingTx.change_amount);
  const customerId = existingTx.customer_id;
  const bookId = existingTx.coupon_book_id;

  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) return null;

  const currentBal = parseInt(customer.coupon_balance, 10) || 0;
  const newBal = refundQty > 0 ? currentBal + refundQty : currentBal;

  if (refundQty > 0) {
    // Restore coupon to book if linked
    if (bookId) {
      const book = await db.prepare('SELECT * FROM coupon_books WHERE id = ?').get(bookId);
      if (book) {
        const restoredRemaining = book.remaining_coupons + refundQty;
        const restoredUsed = Math.max(0, book.used_coupons - refundQty);
        await db.prepare(`
          UPDATE coupon_books
          SET remaining_coupons = ?, used_coupons = ?, status = 'ACTIVE', updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(restoredRemaining, restoredUsed, bookId);
      }
    }

    // Restore customer coupon balance
    await db.prepare(`
      UPDATE customers
      SET coupon_balance = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(newBal, customerId);
  }

  // Record revert transaction
  const todayStr = new Date().toISOString().slice(0, 10);
  await db.prepare(`
    INSERT INTO coupon_transactions (
      customer_id, coupon_book_id, delivery_id, change_amount, balance_after,
      transaction_type, transaction_date, notes, agent_id, created_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      'DELIVERY_REVERTED', ?, ?, ?, datetime('now', 'localtime')
    )
  `).run(
    customerId,
    bookId,
    deliveryId,
    refundQty,
    newBal,
    todayStr,
    `Delivery #${deliveryId} cancelled/reverted (+${refundQty} coupons restored)`,
    customer.agent_id || 1
  );

  return { restored: refundQty, balanceAfter: newBal };
}

/**
 * Manual coupon balance adjustment
 */
async function adjustCouponBalance({ customerId, changeAmount, reason = '', agentId = 1 }) {
  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) throw new Error('Customer not found');

  const diff = parseInt(changeAmount, 10);
  if (isNaN(diff) || diff === 0) throw new Error('Change amount must be a non-zero integer');

  const currentBal = parseInt(customer.coupon_balance, 10) || 0;
  const newBal = Math.max(0, currentBal + diff);

  await db.prepare(`
    UPDATE customers
    SET coupon_balance = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(newBal, customerId);

  const todayStr = new Date().toISOString().slice(0, 10);
  await db.prepare(`
    INSERT INTO coupon_transactions (
      customer_id, coupon_book_id, delivery_id, change_amount, balance_after,
      transaction_type, transaction_date, notes, agent_id, created_at
    ) VALUES (
      ?, NULL, NULL, ?, ?,
      'MANUAL_ADJUSTMENT', ?, ?, ?, datetime('now', 'localtime')
    )
  `).run(
    customerId,
    diff,
    newBal,
    todayStr,
    `Manual adjustment: ${diff > 0 ? `+${diff}` : diff} coupons (${reason || 'Admin adjustment'})`,
    agentId || customer.agent_id || 1
  );

  return { newCouponBalance: newBal };
}

/**
 * Get comprehensive coupon details for a customer
 */
async function getCustomerCouponDetails(customerId) {
  const customer = await db.prepare(`
    SELECT c.id, c.name, c.phone, c.address, c.customer_category, c.billing_type,
           c.coupon_balance, c.advance_balance, c.pending_balance, z.name as zone_name
    FROM customers c
    LEFT JOIN zones z ON c.zone_id = z.id
    WHERE c.id = ?
  `).get(customerId);

  if (!customer) return null;

  const books = await db.prepare(`
    SELECT * FROM coupon_books
    WHERE customer_id = ?
    ORDER BY issue_date DESC, id DESC
  `).all(customerId);

  const transactions = await db.prepare(`
    SELECT ct.*, cb.book_number
    FROM coupon_transactions ct
    LEFT JOIN coupon_books cb ON ct.coupon_book_id = cb.id
    WHERE ct.customer_id = ?
    ORDER BY ct.id DESC
    LIMIT 50
  `).all(customerId);

  // Summary statistics
  const totalIssued = books.reduce((sum, b) => sum + (parseInt(b.total_coupons, 10) || 0), 0);
  const totalUsed = books.reduce((sum, b) => sum + (parseInt(b.used_coupons, 10) || 0), 0);

  return {
    customer,
    books,
    transactions,
    summary: {
      totalBooks: books.length,
      totalCouponsIssued: totalIssued,
      totalCouponsUsed: totalUsed,
      remainingCoupons: parseInt(customer.coupon_balance, 10) || 0
    }
  };
}

/**
 * Month-End or Anytime Coupon Summary Report
 */
async function getCouponMonthEndSummary(agentId = 1, month = null) {
  const targetMonth = month || new Date().toISOString().slice(0, 7);

  // Get all customers who either:
  // 1. Have billing_type = 'COUPON'
  // 2. OR have coupon_balance > 0
  // 3. OR have any coupon book issued
  const customers = await db.prepare(`
    SELECT c.id, c.name, c.phone, c.flat_no, c.address, c.billing_type, c.coupon_balance,
           c.advance_balance, c.pending_balance, z.name as zone_name, r.name as route_name
    FROM customers c
    LEFT JOIN zones z ON c.zone_id = z.id
    LEFT JOIN routes r ON z.route_id = r.id
    WHERE (c.agent_id = ? OR c.agent_id IS NULL)
      AND (c.billing_type = 'COUPON' OR c.coupon_balance > 0 OR EXISTS (
        SELECT 1 FROM coupon_books cb WHERE cb.customer_id = c.id
      ))
    ORDER BY c.name ASC
  `).all(agentId);

  const report = [];

  for (const cust of customers) {
    const books = await db.prepare(`
      SELECT COUNT(*) as book_count, COALESCE(SUM(total_coupons), 0) as total_issued,
             COALESCE(SUM(price_paid), 0) as total_paid
      FROM coupon_books WHERE customer_id = ?
    `).get(cust.id);

    // Coupons used in this specific month
    const monthUsage = await db.prepare(`
      SELECT COALESCE(SUM(ABS(change_amount)), 0) as used_in_month
      FROM coupon_transactions
      WHERE customer_id = ? AND transaction_type = 'DELIVERY_USAGE'
        AND transaction_date LIKE ?
    `).get(cust.id, `${targetMonth}%`);

    // All time coupons used
    const allTimeUsage = await db.prepare(`
      SELECT COALESCE(SUM(ABS(change_amount)), 0) as total_used
      FROM coupon_transactions
      WHERE customer_id = ? AND transaction_type = 'DELIVERY_USAGE'
    `).get(cust.id);

    const remaining = parseInt(cust.coupon_balance, 10) || 0;
    const totalBooks = parseInt(books.book_count, 10) || 0;
    let balanceStatus = 'ACTIVE';
    if (totalBooks === 0 && cust.billing_type === 'COUPON') balanceStatus = 'PRE_SYSTEM_COUPONS';
    else if (remaining <= 0) balanceStatus = 'EXHAUSTED';
    else if (remaining <= 5) balanceStatus = 'LOW';

    report.push({
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone,
      flatNo: cust.flat_no,
      zoneName: cust.zone_name || 'Unassigned',
      routeName: cust.route_name || '',
      billingType: cust.billing_type,
      totalBooks: parseInt(books.book_count, 10) || 0,
      totalCouponsIssued: parseInt(books.total_issued, 10) || 0,
      totalAmountPaid: parseFloat(books.total_paid) || 0,
      usedThisMonth: parseInt(monthUsage.used_in_month, 10) || 0,
      totalCouponsUsed: parseInt(allTimeUsage.total_used, 10) || 0,
      remainingCoupons: remaining,
      status: balanceStatus
    });
  }

  return {
    targetMonth,
    totalCouponCustomers: report.length,
    totalRemainingCoupons: report.reduce((sum, r) => sum + r.remainingCoupons, 0),
    totalUsedThisMonth: report.reduce((sum, r) => sum + r.usedThisMonth, 0),
    report
  };
}

module.exports = {
  issueCouponBook,
  deductCouponsForDelivery,
  revertCouponsForDelivery,
  adjustCouponBalance,
  getCustomerCouponDetails,
  getCouponMonthEndSummary
};
