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
 * Helper to calculate standard delivery charge per unit/packet for the Coupon System
 * Coupon books represent bulk milk volume in litres (e.g., 100 coupons of 500ml = 50 Litres).
 * The delivery charge uses the ₹3.00/Litre rate:
 * - 500ml packet (0.5L) = 0.5 L × ₹3.00/L = ₹1.50 per coupon
 * - 1000ml / 1L packet (1.0L) = 1.0 L × ₹3.00/L = ₹3.00 per coupon
 * - Bulk customers: ₹0
 */
function getStandardDeliveryChargePerUnit(product, customerCategory = 'HOUSE') {
  if (customerCategory === 'BULK_HOTEL') return 0;
  if (!product) return 1.5; // Standard 500ml milk packet delivery charge in coupon system (0.5L × ₹3 = ₹1.50)

  const chargeType = product.delivery_charge_type;
  if (chargeType === 'NONE') return 0;
  if (chargeType === 'FIXED_PER_UNIT') {
    return parseFloat(product.fixed_delivery_charge || 0);
  }

  // Coupon System Delivery Rule:
  // Coupon books represent bulk volume in litres.
  // Delivery charge uses the ₹3.00/Litre rate: vol × ₹3.00
  let vol = product.unit_volume_litres;
  if (!vol || vol <= 0) {
    if (product.variant_label && product.variant_label.toLowerCase().includes('500')) vol = 0.5;
    else if (product.variant_label && product.variant_label.toLowerCase().includes('1')) vol = 1.0;
    else vol = 0.5;
  }

  return parseFloat((vol * 3.0).toFixed(2));
}

/**
 * Issue a new coupon book to a customer
 */
async function issueCouponBook({
  customerId,
  productId = null,
  bookNumber,
  totalCoupons,
  pricePaid = null,
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

  const finalProductId = productId ? parseInt(productId, 10) : null;
  let product = null;
  if (finalProductId) {
    product = await db.prepare('SELECT id, name, category, variant_label, selling_price, unit_volume_litres, delivery_charge_type, fixed_delivery_charge, is_coupon_eligible FROM products WHERE id = ?').get(finalProductId);
    if (!product) {
      throw new Error(`Product not found (ID: ${finalProductId})`);
    }
    const isEligible = product.is_coupon_eligible === 1 || product.category === 'Milk' || product.category === 'MILK';
    if (!isEligible) {
      throw new Error(`Product "${product.name}" (${product.category}) is not eligible for coupon books. Coupon books can only be issued for coupon-eligible milk products.`);
    }
  }

  const finalBookNumber = bookNumber && bookNumber.trim()
    ? bookNumber.trim()
    : `BK-${customerId}-${Date.now().toString().slice(-4)}`;

  const finalIssueDate = issueDate || new Date().toISOString().slice(0, 10);
  let amountPaid = pricePaid !== null && pricePaid !== undefined ? parseFloat(pricePaid) : NaN;
  if (isNaN(amountPaid)) {
    const unitPrice = product ? parseFloat(product.selling_price || 25) : 25;
    const delCharge = getStandardDeliveryChargePerUnit(product, customer.customer_category);
    amountPaid = parseFloat((couponsCount * (unitPrice + delCharge)).toFixed(2));
  }

  // 1. Insert coupon book
  const insertBook = await db.prepare(`
    INSERT INTO coupon_books (
      customer_id, product_id, book_number, total_coupons, used_coupons, remaining_coupons,
      price_paid, payment_method, issue_date, status, notes, agent_id,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, 0, ?,
      ?, ?, ?, 'ACTIVE', ?, ?,
      datetime('now', 'localtime'), datetime('now', 'localtime')
    )
  `).run(
    customerId,
    finalProductId,
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
  const productLabel = product ? `${product.name} (${product.variant_label || ''})` : 'Universal Milk';
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
    `Purchased Coupon Book #${finalBookNumber} (${couponsCount} coupons for ${productLabel})${notes ? ` - ${notes}` : ''}`,
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
 * Synchronize coupon deduction for a delivery to match its current status & quantity.
 * Fully idempotent and self-healing:
 * - If delivery is DELIVERED with quantity Q, exactly Q coupons will be deducted.
 * - If delivery is SKIPPED / PENDING / MISSED, exactly 0 coupons will be deducted.
 * - If quantity was increased (e.g. 2 -> 4 or 5 pkts), the extra difference is deducted.
 * - If quantity was decreased (e.g. 5 -> 4 pkts), the difference is restored.
 */
async function syncCouponsForDelivery(deliveryId, options = {}) {
  if (!deliveryId) return null;

  const delivery = await db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId);
  if (!delivery || !delivery.customer_id) return null;

  const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(delivery.customer_id);
  if (!customer) return null;

  const hasBooks = await db.prepare('SELECT 1 FROM coupon_books WHERE customer_id = ? LIMIT 1').get(customer.id);
  const hasCoupons = (parseInt(customer.coupon_balance, 10) || 0) > 0;

  if (!hasBooks && !hasCoupons) {
    return null; // Not a coupon customer or no books issued
  }

  // Check if delivery product is coupon-eligible (Milk products only; Curd/Ghee/etc are non-coupon billed items)
  let isCouponEligible = false;
  if (delivery.product_id) {
    const prod = await db.prepare('SELECT id, name, category, is_coupon_eligible FROM products WHERE id = ?').get(delivery.product_id);
    if (prod) {
      isCouponEligible = prod.is_coupon_eligible === 1 || prod.category === 'Milk' || prod.category === 'MILK';
    } else {
      isCouponEligible = (delivery.category_snapshot === 'Milk' || delivery.category_snapshot === 'MILK');
    }
  } else if (delivery.category_snapshot) {
    isCouponEligible = (delivery.category_snapshot === 'Milk' || delivery.category_snapshot === 'MILK');
  } else if (delivery.product_name_snapshot) {
    const nameLower = delivery.product_name_snapshot.toLowerCase();
    isCouponEligible = nameLower.includes('milk') && !nameLower.includes('curd');
  }

  // 1. Determine target coupons to deduct for this delivery
  let targetCoupons;
  if (!isCouponEligible) {
    // Non-coupon products (Curd, Ghee, Sweets, etc.) NEVER consume coupons!
    targetCoupons = 0;
  } else if (options.forceTarget !== undefined) {
    targetCoupons = Math.max(0, parseInt(options.forceTarget, 10) || 0);
  } else {
    const isDelivered = delivery.status === 'DELIVERED';
    targetCoupons = isDelivered ? Math.max(0, parseInt(delivery.quantity, 10) || 0) : 0;
  }

  // 2. Determine current net coupons deducted in coupon_transactions for this delivery
  const currentCheck = await db.prepare(`
    SELECT COALESCE(SUM(
      CASE 
        WHEN transaction_type = 'DELIVERY_USAGE' THEN ABS(change_amount)
        WHEN transaction_type = 'DELIVERY_REVERTED' THEN -ABS(change_amount)
        ELSE 0
      END
    ), 0) as net_deducted
    FROM coupon_transactions
    WHERE delivery_id = ?
  `).get(delivery.id);

  const currentNetDeducted = parseInt(currentCheck?.net_deducted, 10) || 0;
  const diff = targetCoupons - currentNetDeducted;

  const currentBal = parseInt(customer.coupon_balance, 10) || 0;

  if (diff === 0) {
    return { inSync: true, netDeducted: currentNetDeducted, balanceAfter: currentBal, deducted: 0, restored: 0 };
  }

  const txDate = delivery.delivery_date || new Date().toISOString().slice(0, 10);
  const prodId = delivery.product_id ? parseInt(delivery.product_id, 10) : null;

  if (diff > 0) {
    // Need to deduct `diff` more coupons
    const qtyToDeduct = diff;
    let activeBooks = [];

    if (prodId) {
      activeBooks = await db.prepare(`
        SELECT * FROM coupon_books
        WHERE customer_id = ? AND status = 'ACTIVE' AND remaining_coupons > 0
          AND (product_id = ? OR product_id IS NULL)
        ORDER BY (CASE WHEN product_id = ? THEN 0 ELSE 1 END), issue_date ASC, id ASC
      `).all(customer.id, prodId, prodId);
    } else {
      activeBooks = await db.prepare(`
        SELECT * FROM coupon_books
        WHERE customer_id = ? AND status = 'ACTIVE' AND remaining_coupons > 0
        ORDER BY (CASE WHEN product_id IS NULL THEN 0 ELSE 1 END), issue_date ASC, id ASC
      `).all(customer.id);
    }

    if (activeBooks.length === 0) {
      return { inSync: true, netDeducted: currentNetDeducted, balanceAfter: currentBal, deducted: 0, restored: 0 };
    }

    let remainingToDeduct = qtyToDeduct;
    let bookToLink = null;

    for (const book of activeBooks) {
      if (remainingToDeduct <= 0) break;
      const canDeduct = Math.min(book.remaining_coupons, remainingToDeduct);
      if (canDeduct <= 0) continue;
      bookToLink = book.id;
      const newUsed = book.used_coupons + canDeduct;
      const newRemaining = Math.max(0, book.total_coupons - newUsed);
      const newStatus = newRemaining === 0 ? 'EXHAUSTED' : 'ACTIVE';

      await db.prepare(`
        UPDATE coupon_books
        SET used_coupons = ?, remaining_coupons = ?, status = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(newUsed, newRemaining, newStatus, book.id);

      remainingToDeduct -= canDeduct;
    }

    const actualDeducted = qtyToDeduct - remainingToDeduct;
    if (actualDeducted <= 0) {
      return { inSync: true, netDeducted: currentNetDeducted, balanceAfter: currentBal, deducted: 0, restored: 0 };
    }

    const sumRow = await db.prepare(`
      SELECT COALESCE(SUM(remaining_coupons), 0) as total_remaining
      FROM coupon_books
      WHERE customer_id = ? AND status = 'ACTIVE'
    `).get(customer.id);

    const newBal = parseInt(sumRow?.total_remaining, 10) || 0;

    await db.prepare(`
      UPDATE customers
      SET coupon_balance = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(newBal, customer.id);

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
      `Delivered ${delivery.quantity}x ${delivery.product_name_snapshot || 'Milk'} (${txDate}) [Net: ${targetCoupons} coupons]`,
      delivery.agent_id || customer.agent_id || 1
    );

    return { deducted: actualDeducted, restored: 0, balanceAfter: newBal, netDeducted: currentNetDeducted + actualDeducted };
  } else {
    // diff < 0: Need to restore `Math.abs(diff)` coupons back
    const restoreQty = Math.abs(diff);
    if (restoreQty <= 0) {
      return { inSync: true, netDeducted: currentNetDeducted, balanceAfter: currentBal, deducted: 0, restored: 0 };
    }

    const lastUsageTx = await db.prepare(`
      SELECT coupon_book_id FROM coupon_transactions
      WHERE delivery_id = ? AND transaction_type = 'DELIVERY_USAGE' AND coupon_book_id IS NOT NULL
      ORDER BY id DESC LIMIT 1
    `).get(delivery.id);

    const bookId = lastUsageTx?.coupon_book_id;
    if (bookId) {
      const book = await db.prepare('SELECT * FROM coupon_books WHERE id = ?').get(bookId);
      if (book) {
        const restoredUsed = Math.max(0, book.used_coupons - restoreQty);
        const restoredRemaining = Math.min(book.total_coupons, book.total_coupons - restoredUsed);
        const restoredStatus = restoredRemaining > 0 ? 'ACTIVE' : 'EXHAUSTED';
        await db.prepare(`
          UPDATE coupon_books
          SET remaining_coupons = ?, used_coupons = ?, status = ?, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(restoredRemaining, restoredUsed, restoredStatus, bookId);
      }
    }

    const sumRow = await db.prepare(`
      SELECT COALESCE(SUM(remaining_coupons), 0) as total_remaining
      FROM coupon_books
      WHERE customer_id = ? AND status = 'ACTIVE'
    `).get(customer.id);
    const newBal = sumRow ? (parseInt(sumRow.total_remaining, 10) || 0) : (currentBal + restoreQty);

    await db.prepare(`
      UPDATE customers
      SET coupon_balance = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(newBal, customer.id);

    await db.prepare(`
      INSERT INTO coupon_transactions (
        customer_id, coupon_book_id, delivery_id, change_amount, balance_after,
        transaction_type, transaction_date, notes, agent_id, created_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        'DELIVERY_REVERTED', ?, ?, ?, datetime('now', 'localtime')
      )
    `).run(
      customer.id,
      bookId || null,
      delivery.id,
      restoreQty,
      newBal,
      txDate,
      `Delivery #${delivery.id} adjusted (+${restoreQty} coupons restored) [Net: ${targetCoupons} coupons]`,
      customer.agent_id || 1
    );

    return { deducted: 0, restored: restoreQty, balanceAfter: newBal, netDeducted: currentNetDeducted - restoreQty };
  }
}

/**
 * Deduct coupons for a delivery when marked DELIVERED (delegates to syncCouponsForDelivery)
 */
async function deductCouponsForDelivery(delivery) {
  if (!delivery) return null;
  const dId = delivery.id || delivery;
  const opts = {};
  if (delivery.quantity !== undefined && (delivery.status === 'DELIVERED' || delivery.status === undefined)) {
    opts.forceTarget = delivery.quantity;
  }
  return await syncCouponsForDelivery(dId, opts);
}

/**
 * Revert coupons if a delivery is un-delivered / skipped / missed / deleted (delegates to syncCouponsForDelivery)
 */
async function revertCouponsForDelivery(deliveryId) {
  if (!deliveryId) return null;
  const res = await syncCouponsForDelivery(deliveryId, { forceTarget: 0 });
  await db.prepare("UPDATE deliveries SET status = 'SKIPPED', updated_at = datetime('now', 'localtime') WHERE id = ? AND status = 'DELIVERED'").run(deliveryId);
  return res;
}

/**
 * Reconcile all customer deliveries for an agent to guarantee 100% coupon balance accuracy
 */
async function reconcileAllCustomerCoupons(agentId = 1) {
  try {
    const deliveries = await db.prepare(`
      SELECT d.id
      FROM deliveries d
      JOIN customers c ON d.customer_id = c.id
      WHERE (c.agent_id = ? OR c.agent_id IS NULL)
        AND (c.billing_type = 'COUPON' OR EXISTS (SELECT 1 FROM coupon_books cb WHERE cb.customer_id = c.id))
      ORDER BY d.delivery_date ASC, d.id ASC
    `).all(agentId);

    for (const del of deliveries) {
      await syncCouponsForDelivery(del.id);
    }
  } catch (err) {
    console.warn('reconcileAllCustomerCoupons warning:', err.message);
  }
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
 * Update / Edit / Modify an existing coupon book
 */
async function updateCouponBook({
  bookId,
  bookNumber,
  productId,
  totalCoupons,
  usedCoupons,
  remainingCoupons,
  pricePaid,
  paymentMethod,
  issueDate,
  status,
  notes,
  agentId = 1
}) {
  const book = await db.prepare('SELECT * FROM coupon_books WHERE id = ?').get(bookId);
  if (!book) {
    throw new Error('Coupon book not found');
  }

  const newBookNumber = bookNumber !== undefined ? (bookNumber?.trim() || book.book_number) : book.book_number;

  let newProductId = book.product_id;
  if (productId !== undefined) {
    if (productId === '' || productId === null || productId === 'ALL') {
      newProductId = null;
    } else {
      newProductId = parseInt(productId, 10) || null;
    }
  }

  let newTotal = totalCoupons !== undefined ? parseInt(totalCoupons, 10) : book.total_coupons;
  if (isNaN(newTotal) || newTotal <= 0) newTotal = book.total_coupons;

  let newRemaining = remainingCoupons !== undefined ? parseInt(remainingCoupons, 10) : book.remaining_coupons;
  if (isNaN(newRemaining) || newRemaining < 0) newRemaining = 0;

  let newUsed = usedCoupons !== undefined ? parseInt(usedCoupons, 10) : book.used_coupons;
  if (isNaN(newUsed) || newUsed < 0) {
    newUsed = Math.max(0, newTotal - newRemaining);
  }

  let newStatus = status || book.status;
  if (!status) {
    if (newRemaining === 0) newStatus = 'EXHAUSTED';
    else if (newStatus === 'EXHAUSTED' && newRemaining > 0) newStatus = 'ACTIVE';
  }

  const newPricePaid = pricePaid !== undefined ? parseFloat(pricePaid) : book.price_paid;
  const newPaymentMethod = paymentMethod || book.payment_method;
  const newIssueDate = issueDate || book.issue_date;
  const newNotes = notes !== undefined ? notes : book.notes;

  await db.prepare(`
    UPDATE coupon_books
    SET book_number = ?, product_id = ?, total_coupons = ?, used_coupons = ?,
        remaining_coupons = ?, price_paid = ?, payment_method = ?,
        issue_date = ?, status = ?, notes = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    newBookNumber,
    newProductId,
    newTotal,
    newUsed,
    newRemaining,
    newPricePaid,
    newPaymentMethod,
    newIssueDate,
    newStatus,
    newNotes,
    bookId
  );

  // Recalculate customer aggregate active coupon balance
  const sumRow = await db.prepare(`
    SELECT COALESCE(SUM(remaining_coupons), 0) as total_remaining
    FROM coupon_books
    WHERE customer_id = ? AND status = 'ACTIVE'
  `).get(book.customer_id);

  const updatedBalance = parseInt(sumRow?.total_remaining, 10) || 0;

  await db.prepare(`
    UPDATE customers
    SET coupon_balance = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(updatedBalance, book.customer_id);

  const updatedBook = await db.prepare(`
    SELECT cb.*, p.name as product_name, p.variant_label as product_variant
    FROM coupon_books cb
    LEFT JOIN products p ON cb.product_id = p.id
    WHERE cb.id = ?
  `).get(bookId);

  return {
    book: updatedBook,
    newCouponBalance: updatedBalance
  };
}

/**
 * Get comprehensive coupon details for a customer
 */
async function getCustomerCouponDetails(customerId) {
  if (!customerId) return null;

  const customer = await db.prepare(`
    SELECT c.id, c.name, c.phone, c.address, c.customer_category, c.billing_type,
           c.coupon_balance, c.advance_balance, c.pending_balance, z.name as zone_name
    FROM customers c
    LEFT JOIN zones z ON c.zone_id = z.id
    WHERE c.id = ?
  `).get(customerId);

  if (!customer) return null;

  const books = await db.prepare(`
    SELECT cb.*, p.name as product_name, p.variant_label as product_variant,
           p.selling_price as product_price
    FROM coupon_books cb
    LEFT JOIN products p ON cb.product_id = p.id
    WHERE cb.customer_id = ?
    ORDER BY cb.issue_date DESC, cb.id DESC
  `).all(customerId);

  const transactions = await db.prepare(`
    SELECT ct.*, cb.book_number
    FROM coupon_transactions ct
    LEFT JOIN coupon_books cb ON ct.coupon_book_id = cb.id
    WHERE ct.customer_id = ?
    ORDER BY ct.id DESC
    LIMIT 50
  `).all(customerId);

  // Summary statistics & product balances
  const totalIssued = books.reduce((sum, b) => sum + (parseInt(b.total_coupons, 10) || 0), 0);
  const totalUsed = books.reduce((sum, b) => sum + (parseInt(b.used_coupons, 10) || 0), 0);

  const productBalancesMap = {};
  for (const b of books) {
    if (b.status === 'ACTIVE' && b.remaining_coupons > 0) {
      const key = b.product_id || 'UNIVERSAL';
      if (!productBalancesMap[key]) {
        productBalancesMap[key] = {
          productId: b.product_id || null,
          productName: b.product_name ? `${b.product_name} (${b.product_variant || ''})` : 'Universal / All Milk',
          remainingCoupons: 0,
          totalCoupons: 0
        };
      }
      productBalancesMap[key].remainingCoupons += b.remaining_coupons;
      productBalancesMap[key].totalCoupons += b.total_coupons;
    }
  }

  const productBalances = Object.values(productBalancesMap);

  return {
    customer,
    books,
    transactions,
    productBalances,
    summary: {
      totalBooks: books.length,
      totalCouponsIssued: totalIssued,
      totalCouponsUsed: totalUsed,
      remainingCoupons: parseInt(customer.coupon_balance, 10) || 0,
      productBalances
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

    const hasBooks = (parseInt(books?.book_count, 10) || 0) > 0;

    // Coupons used in this specific month (net of any delivery reverts, tied to valid books)
    const monthUsage = hasBooks ? await db.prepare(`
      SELECT COALESCE(SUM(
        CASE 
          WHEN ct.transaction_type = 'DELIVERY_USAGE' THEN ABS(ct.change_amount)
          WHEN ct.transaction_type = 'DELIVERY_REVERTED' THEN -ABS(ct.change_amount)
          ELSE 0
        END
      ), 0) as used_in_month
      FROM coupon_transactions ct
      JOIN coupon_books cb ON ct.coupon_book_id = cb.id
      WHERE ct.customer_id = ? 
        AND ct.transaction_type IN ('DELIVERY_USAGE', 'DELIVERY_REVERTED')
        AND ct.transaction_date LIKE ?
    `).get(cust.id, `${targetMonth}%`) : { used_in_month: 0 };

    // All time coupons used (net of any delivery reverts, tied to valid books)
    const allTimeUsage = hasBooks ? await db.prepare(`
      SELECT COALESCE(SUM(
        CASE 
          WHEN ct.transaction_type = 'DELIVERY_USAGE' THEN ABS(ct.change_amount)
          WHEN ct.transaction_type = 'DELIVERY_REVERTED' THEN -ABS(ct.change_amount)
          ELSE 0
        END
      ), 0) as total_used
      FROM coupon_transactions ct
      JOIN coupon_books cb ON ct.coupon_book_id = cb.id
      WHERE ct.customer_id = ? 
        AND ct.transaction_type IN ('DELIVERY_USAGE', 'DELIVERY_REVERTED')
    `).get(cust.id) : { total_used: 0 };

    // Active product coupon breakdown
    const activeProductRows = await db.prepare(`
      SELECT cb.product_id, p.name as product_name, p.variant_label as product_variant,
             SUM(cb.remaining_coupons) as remaining
      FROM coupon_books cb
      LEFT JOIN products p ON cb.product_id = p.id
      WHERE cb.customer_id = ? AND cb.status = 'ACTIVE' AND cb.remaining_coupons > 0
      GROUP BY cb.product_id, p.name, p.variant_label
    `).all(cust.id);

    const productBreakdown = activeProductRows.map(pr => ({
      productId: pr.product_id,
      productName: pr.product_name ? `${pr.product_name} (${pr.product_variant || ''})` : 'Universal / All Milk',
      remaining: parseInt(pr.remaining, 10) || 0
    }));

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
      usedThisMonth: Math.max(0, parseInt(monthUsage?.used_in_month, 10) || 0),
      totalCouponsUsed: Math.max(0, parseInt(allTimeUsage?.total_used, 10) || 0),
      remainingCoupons: remaining,
      productBreakdown,
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
  updateCouponBook,
  deductCouponsForDelivery,
  revertCouponsForDelivery,
  syncCouponsForDelivery,
  reconcileAllCustomerCoupons,
  adjustCouponBalance,
  getCustomerCouponDetails,
  getCouponMonthEndSummary
};
