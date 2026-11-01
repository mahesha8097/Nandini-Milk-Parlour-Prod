const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');
const {
  generateAdvanceBillForPrepaidCustomer,
  generatePostpaidBill,
  runMonthlyBillGeneration
} = require('../services/billingService');

// Get bills (Admin only - filtered by month, customer_id, status, billing_type)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { month, customer_id, status, billing_type } = req.query;

    const agentId = req.agentId || 1;
    let query = `
      SELECT b.*, c.name as customer_name, c.phone as customer_phone,
             c.address as customer_address, c.customer_category, c.route,
             c.advance_balance as customer_advance_balance, c.pending_balance as customer_pending_balance
      FROM bills b
      JOIN customers c ON b.customer_id = c.id
      WHERE (b.agent_id = ? OR c.agent_id = ?)
    `;
    const params = [agentId, agentId];

    if (month) {
      query += ` AND b.billing_month = ?`;
      params.push(month);
    }

    if (customer_id) {
      query += ` AND b.customer_id = ?`;
      params.push(customer_id);
    }

    if (status) {
      query += ` AND b.status = ?`;
      params.push(status);
    }

    if (billing_type) {
      query += ` AND b.billing_type = ?`;
      params.push(billing_type);
    }

    query += ` ORDER BY b.billing_month DESC, b.id DESC`;

    const bills = await db.prepare(query).all(...params);
    res.json(bills);
  } catch (err) {
    console.error('Fetch bills error:', err);
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
});

// Advance Monthly Bill Calculation Preview (Admin only - pre-calculates without saving)
router.get('/advance-preview', requireAdmin, async (req, res) => {
  try {
    const { month } = req.query;
    const targetMonth = month || new Date().toISOString().slice(0, 7);
    const { calculateAdvanceProjectionForMonth } = require('../services/billingService');
    const result = await calculateAdvanceProjectionForMonth(targetMonth, req.agentId || 1);
    res.json(result);
  } catch (err) {
    console.error('Advance preview error:', err);
    res.status(500).json({ error: err.message || 'Failed to calculate advance preview' });
  }
});

// Generate advance monthly bills for all prepaid/advance customers (Admin only)
router.post('/generate-advance-monthly', requireAdmin, async (req, res) => {
  try {
    const { month, forceRegenerate } = req.body;
    const targetMonth = month || new Date().toISOString().slice(0, 7);
    const { runMonthlyBillGeneration } = require('../services/billingService');
    const result = await runMonthlyBillGeneration(targetMonth, {
      forceRegenerate: Boolean(forceRegenerate),
      billingBasis: 'SUBSCRIPTION',
      agentId: req.agentId || 1
    });
    res.json({
      message: `Advance monthly bills generated for ${targetMonth}`,
      summary: result
    });
  } catch (err) {
    console.error('Generate advance monthly bills error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate advance monthly bills' });
  }
});

// Save Monthly Advance Bill & Delivery Schedule (Admin only - custom calendar days & off-days)
router.post('/save-advance-schedule', requireAdmin, async (req, res) => {
  try {
    const {
      customer_id,
      billing_month,
      selected_days,
      off_days,
      items,
      gross_amount,
      product_subtotal,
      delivery_charges_total,
      advance_adjusted,
      net_payable,
      notes
    } = req.body;

    if (!customer_id || !billing_month) {
      return res.status(400).json({ error: 'Customer ID and billing month are required' });
    }

    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const [yearStr, monthStr] = billing_month.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');

    const scheduledCount = Array.isArray(selected_days) ? selected_days.length : daysInMonth;
    const finalGross = parseFloat(Number(gross_amount || 0).toFixed(2));
    const finalProdSubtotal = parseFloat(Number(product_subtotal || 0).toFixed(2));
    const finalDelCharges = parseFloat(Number(delivery_charges_total || 0).toFixed(2));
    const finalAdvAdj = parseFloat(Number(advance_adjusted || 0).toFixed(2));
    const finalNet = parseFloat(Number(net_payable !== undefined ? net_payable : (finalGross - finalAdvAdj)).toFixed(2));

    const billDate = `${billing_month}-01`;
    const dueDate = `${billing_month}-05`;

    const customerBillingType = customer.billing_type || 'PREPAID';

    // Check if a bill already exists for this customer and month
    const existingBill = await db.prepare(`
      SELECT * FROM bills
      WHERE customer_id = ? AND billing_month = ?
      ORDER BY id DESC LIMIT 1
    `).get(customer.id, billing_month);

    let billStatus = 'PENDING';
    if (finalNet === 0) {
      billStatus = finalAdvAdj > 0 ? 'ADVANCE_PAID' : 'PAID';
    } else if (finalAdvAdj > 0) {
      billStatus = 'PARTIALLY_PAID';
    } else {
      billStatus = 'PENDING';
    }

    let itemsArray = Array.isArray(items) && items.length > 0 ? [...items] : [];
    if (itemsArray.length === 0) {
      itemsArray = [{
        customer_id: customer.id,
        billing_month,
        gross_amount: finalGross,
        product_subtotal: finalProdSubtotal,
        delivery_charges_total: finalDelCharges
      }];
    }
    itemsArray.forEach(it => {
      it.selected_days = selected_days || [];
      it.off_days = off_days || [];
      it.scheduled_days_count = scheduledCount;
    });
    const itemsJsonPayload = JSON.stringify(itemsArray);

    const billNotes = notes || `${customerBillingType === 'PREPAID' ? 'Monthly Advance Bill' : 'Monthly Bill'} (${billing_month}, ${scheduledCount} active days, ${(off_days || []).length} off days)`;

    let savedBillId = null;

    if (existingBill) {
      const oldNet = parseFloat(existingBill.net_payable) || 0;
      const netDiff = parseFloat((finalNet - oldNet).toFixed(2));

      await db.prepare(`
        UPDATE bills
        SET total_deliveries_count = ?,
            product_subtotal = ?,
            delivery_charges_total = ?,
            gross_amount = ?,
            advance_adjusted = ?,
            net_payable = ?,
            status = ?,
            items_json = ?,
            notes = ?,
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        scheduledCount,
        finalProdSubtotal,
        finalDelCharges,
        finalGross,
        finalAdvAdj,
        finalNet,
        billStatus,
        itemsJsonPayload,
        billNotes,
        existingBill.id
      );
      savedBillId = existingBill.id;

      if (netDiff !== 0) {
        await db.prepare(`
          UPDATE customers
          SET pending_balance = MAX(0, pending_balance + ?), updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(netDiff, customer.id);
      }
    } else {
      const billNumber = `NB-${billing_month.replace('-', '')}-${customer.id.toString().padStart(4, '0')}`;

      const insertRes = await db.prepare(`
        INSERT INTO bills (
          bill_number, customer_id, billing_month, billing_type, bill_date, due_date,
          total_deliveries_count, product_subtotal, delivery_charges_total, gross_amount,
          previous_due, advance_adjusted, net_payable, paid_amount, status, lifecycle_stage,
          items_json, notes, agent_id, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          0, ?, ?, 0, ?, 'FINALIZED',
          ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
        )
      `).run(
        billNumber,
        customer.id,
        billing_month,
        customerBillingType,
        billDate,
        dueDate,
        scheduledCount,
        finalProdSubtotal,
        finalDelCharges,
        finalGross,
        finalAdvAdj,
        finalNet,
        billStatus,
        itemsJsonPayload,
        billNotes,
        customer.agent_id || req.agentId || 1
      );
      savedBillId = insertRes.lastInsertRowid;

      if (finalNet > 0) {
        await db.prepare(`
          UPDATE customers
          SET pending_balance = pending_balance + ?, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(finalNet, customer.id);
      }
    }

    // Persist OFF days into daily_delivery_requirements & customer_vacations
    const subs = await db.prepare(`
      SELECT * FROM subscriptions WHERE customer_id = ? AND is_active = 1
    `).all(customer.id);

    // Collect product items to apply skip requirements to
    const productList = [];
    subs.forEach(s => productList.push({ product_id: s.product_id, quantity: s.quantity, sub_id: s.id }));
    if (Array.isArray(items)) {
      items.forEach(it => {
        const pId = it.productId || it.product_id;
        if (pId && !productList.some(p => p.product_id === pId)) {
          productList.push({ product_id: pId, quantity: it.quantity || 1, sub_id: null });
        }
      });
    }

    if (off_days && Array.isArray(off_days) && off_days.length > 0) {
      for (const d of off_days) {
        const dateStr = `${billing_month}-${pad(d)}`;
        for (const sub of productList) {
          const existingReq = await db.prepare(`
            SELECT id FROM daily_delivery_requirements
            WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
          `).get(customer.id, sub.product_id, dateStr);

          if (existingReq) {
            await db.prepare(`
              UPDATE daily_delivery_requirements
              SET requirement_type = 'SKIP_DELIVERY',
                  normal_quantity = ?,
                  required_quantity = 0,
                  effective_quantity = 0,
                  reason = ?,
                  status = 'ACTIVE',
                  updated_at = datetime('now', 'localtime')
              WHERE id = ?
            `).run(sub.quantity, 'No Milk Required (Monthly Advance Calendar)', existingReq.id);
          } else {
            await db.prepare(`
              INSERT INTO daily_delivery_requirements (
                customer_id, product_id, subscription_id, delivery_date, requirement_type,
                normal_quantity, required_quantity, additional_quantity, effective_quantity,
                reason, status, created_by, created_at, updated_at
              ) VALUES (?, ?, ?, ?, 'SKIP_DELIVERY', ?, 0, 0, 0, ?, 'ACTIVE', ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
            `).run(customer.id, sub.product_id, sub.id, dateStr, sub.quantity, 'No Milk Required (Monthly Advance Calendar)', req.user?.id || null);
          }

          // If delivery row exists, update to SKIPPED
          await db.prepare(`
            UPDATE deliveries
            SET status = 'SKIPPED', total_product_amount = 0, delivery_charge_snapshot = 0, total_amount = 0,
                notes = 'No Milk Required (Monthly Advance Calendar)', updated_at = datetime('now', 'localtime')
            WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
          `).run(customer.id, sub.product_id, dateStr);
        }
      }

      // Group off days into continuous segments for customer_vacations
      const sortedOff = [...new Set(off_days.map(Number))].sort((a, b) => a - b);
      const segments = [];
      let sStart = sortedOff[0];
      let sEnd = sortedOff[0];
      for (let i = 1; i < sortedOff.length; i++) {
        if (sortedOff[i] === sEnd + 1) {
          sEnd = sortedOff[i];
        } else {
          segments.push({ start: sStart, end: sEnd });
          sStart = sortedOff[i];
          sEnd = sortedOff[i];
        }
      }
      segments.push({ start: sStart, end: sEnd });

      // Clean up previous calendar vacations for this month to avoid duplicates
      await db.prepare(`
        UPDATE customer_vacations
        SET status = 'CANCELLED', updated_at = datetime('now', 'localtime')
        WHERE customer_id = ? AND status = 'ACTIVE'
          AND start_date >= ? AND end_date <= ?
          AND reason LIKE '%Monthly Advance Calendar%'
      `).run(customer.id, `${billing_month}-01`, `${billing_month}-${pad(daysInMonth)}`);

      for (const seg of segments) {
        const segStartDate = `${billing_month}-${pad(seg.start)}`;
        const segEndDate = `${billing_month}-${pad(seg.end)}`;
        const resumeDateObj = new Date(year, month - 1, seg.end + 1);
        const resumeDate = `${resumeDateObj.getFullYear()}-${pad(resumeDateObj.getMonth() + 1)}-${pad(resumeDateObj.getDate())}`;

        await db.prepare(`
          INSERT INTO customer_vacations (
            customer_id, start_date, end_date, resume_date, reason, status,
            agent_id, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'No Milk Required (Monthly Advance Calendar)', 'ACTIVE', ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
        `).run(customer.id, segStartDate, segEndDate, resumeDate, customer.agent_id || 1, req.user?.id || null);
      }
    }

    // Remove any previous calendar SKIP requirements for active days
    if (selected_days && Array.isArray(selected_days) && selected_days.length > 0) {
      for (const d of selected_days) {
        const dateStr = `${billing_month}-${pad(d)}`;
        await db.prepare(`
          DELETE FROM daily_delivery_requirements
          WHERE customer_id = ? AND delivery_date = ?
            AND requirement_type = 'SKIP_DELIVERY'
            AND reason LIKE '%Monthly Advance Calendar%'
        `).run(customer.id, dateStr);
      }
    }

    const savedBill = await db.prepare('SELECT * FROM bills WHERE id = ?').get(savedBillId);
    const freshCustomer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer.id);

    res.json({
      success: true,
      message: `Advance bill and ${scheduledCount}-day schedule saved successfully for ${customer.name}`,
      bill: savedBill,
      customer: freshCustomer
    });
  } catch (err) {
    console.error('Save advance schedule error:', err);
    res.status(500).json({ error: err.message || 'Failed to save advance schedule and bill' });
  }
});

// Generate Weekly Bill (Admin only - accepts startDate, endDate, customer_id, forceRegenerate)
router.post('/generate-weekly', requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, customer_id, customerId, forceRegenerate, billingBasis } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start date and end date are required for weekly billing' });
    }

    const { generateWeeklyBillForCustomer, generateWeeklyBillsForPeriod } = require('../services/billingService');

    const targetCustomerId = customer_id || customerId;

    if (targetCustomerId) {
      const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(targetCustomerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const bill = await generateWeeklyBillForCustomer(customer, startDate, endDate, {
        forceRegenerate: Boolean(forceRegenerate),
        billingBasis: billingBasis || 'AUTO'
      });
      if (!bill) {
        return res.status(400).json({ error: `No active subscriptions or delivered records found for ${customer.name} between ${startDate} and ${endDate}` });
      }

      return res.json({
        message: `Weekly bill #${bill.bill_number} generated successfully for ${customer.name}`,
        bill
      });
    }

    // Generate for all weekly customers
    const result = await generateWeeklyBillsForPeriod(startDate, endDate, {
      forceRegenerate: Boolean(forceRegenerate),
      agentId: req.agentId || 1
    });

    res.json({
      message: `Weekly bills generated for period ${startDate} to ${endDate}`,
      summary: result
    });
  } catch (err) {
    console.error('Generate weekly bill error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate weekly bill' });
  }
});

// Merge multiple pending bills into a single consolidated payment invoice (Admin only)
router.post('/merge-pending', requireAdmin, async (req, res) => {
  try {
    const { customerId, customer_id, billIds } = req.body;
    const targetId = customerId || customer_id;
    if (!targetId) {
      return res.status(400).json({ error: 'Customer ID is required to merge pending bills' });
    }
    const { mergePendingBillsForCustomer } = require('../services/billingService');
    const result = await mergePendingBillsForCustomer(targetId, billIds);
    res.json(result);
  } catch (err) {
    console.error('Merge bills error:', err);
    res.status(500).json({ error: err.message || 'Failed to merge pending bills' });
  }
});

// Get single bill with invoice details and business profile (Admin only)
router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const bill = await db.prepare(`
      SELECT b.*, c.name as customer_name, c.phone as customer_phone,
             c.address as customer_address, c.customer_category, c.route,
             c.advance_balance as customer_advance_balance, c.pending_balance as customer_pending_balance
      FROM bills b
      JOIN customers c ON b.customer_id = c.id
      WHERE b.id = ?
    `).get(req.params.id);

    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const agentId = bill.agent_id || req.agentId || 1;
    let businessProfile = await db.prepare('SELECT * FROM business_profile WHERE agent_id = ?').get(agentId);
    if (!businessProfile) {
      businessProfile = await db.prepare('SELECT * FROM business_profile WHERE id = 1').get();
    }
    let parsedItems = [];
    try {
      parsedItems = JSON.parse(bill.items_json || '[]');
    } catch (e) {
      parsedItems = [];
    }

    res.json({
      bill,
      items: parsedItems,
      businessProfile
    });
  } catch (err) {
    console.error('Fetch bill error:', err);
    res.status(500).json({ error: 'Failed to fetch bill' });
  }
});

// Trigger automated monthly bill generation (Admin only)
router.post('/generate-monthly', requireAdmin, async (req, res) => {
  try {
    const { month, forceRegenerate, billingBasis } = req.body; // e.g. "2026-10", billingBasis: 'DELIVERIES' | 'SUBSCRIPTION' | 'AUTO'
    const targetMonth = month || new Date().toISOString().slice(0, 7);

    const { runMonthlyBillGeneration } = require('../services/billingService');
    const result = await runMonthlyBillGeneration(targetMonth, {
      forceRegenerate: Boolean(forceRegenerate),
      billingBasis: billingBasis || 'AUTO',
      agentId: req.agentId || 1
    });
    res.json({
      message: `Monthly bill generation completed for ${targetMonth}`,
      summary: result
    });
  } catch (err) {
    console.error('Generate monthly bills error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate monthly bills' });
  }
});

// Generate bill for a single customer (Admin only)
router.post('/generate-single', requireAdmin, async (req, res) => {
  try {
    const { customer_id, month, forceRegenerate, billingBasis } = req.body;
    if (!customer_id) {
      return res.status(400).json({ error: 'Customer ID is required' });
    }

    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (customer.billing_type === 'COUPON') {
      return res.status(400).json({
        error: 'This customer is on the Coupon system. Payments are collected when coupon books are purchased; monthly bills are not generated for coupon customers.'
      });
    }

    let targetMonth = month || new Date().toISOString().slice(0, 7);
    const { generateBillForCustomer } = require('../services/billingService');

    let bill = await generateBillForCustomer(customer, targetMonth, {
      billingBasis: billingBasis || 'AUTO',
      forceRegenerate: Boolean(forceRegenerate)
    });

    // If no bill was generated and customer is PREPAID or requested SUBSCRIPTION basis,
    // automatically check if the customer has an active upcoming subscription (e.g. starting next month)
    if (!bill && (billingBasis === 'SUBSCRIPTION' || customer.billing_type === 'PREPAID')) {
      const activeSub = await db.prepare(`
        SELECT start_date FROM subscriptions
        WHERE customer_id = ? AND is_active = 1
        ORDER BY start_date ASC
        LIMIT 1
      `).get(customer.id);
      if (activeSub && activeSub.start_date) {
        const subMonth = activeSub.start_date.slice(0, 7);
        if (subMonth !== targetMonth) {
          bill = await generateBillForCustomer(customer, subMonth, {
            billingBasis: billingBasis || 'AUTO',
            forceRegenerate: Boolean(forceRegenerate)
          });
        }
      }
    }

    if (!bill) {
      return res.status(400).json({ error: 'No active subscriptions or delivered records found to generate bill' });
    }

    res.json(bill);
  } catch (err) {
    console.error('Single bill generation error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate bill' });
  }
});

// Recalculate / Regenerate an existing bill with latest subscriptions/deliveries (Admin only)
const handleBillRegenerate = async (req, res) => {
  try {
    const billId = req.params.id;
    const { billingBasis } = req.body || {};
    const { recalculateSingleBill } = require('../services/billingService');
    const updatedBill = await recalculateSingleBill(billId, billingBasis || 'AUTO');
    res.json({
      message: 'Bill successfully recalculated and updated against customer advance balance',
      bill: updatedBill
    });
  } catch (err) {
    console.error('Regenerate bill error:', err);
    res.status(500).json({ error: err.message || 'Failed to regenerate bill' });
  }
};
router.post('/:id/regenerate', requireAdmin, handleBillRegenerate);
router.put('/:id/regenerate', requireAdmin, handleBillRegenerate);

// Cancel a bill (Admin only)
router.post('/:id/cancel', requireAdmin, async (req, res) => {
  try {
    const billId = req.params.id;
    const { reason } = req.body;

    const bill = await db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    if (bill.status === 'CANCELLED') {
      return res.status(400).json({ error: 'Bill is already cancelled' });
    }

    // Revert customer pending balance if applicable
    if (bill.net_payable > 0) {
      const unpaid = Math.max(0, bill.net_payable - bill.paid_amount);
      await db.prepare(`
        UPDATE customers
        SET pending_balance = MAX(0, pending_balance - ?), updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(unpaid, bill.customer_id);
    }

    await db.prepare(`
      UPDATE bills
      SET status = 'CANCELLED', notes = notes || ' [Cancelled: ' || ? || ']', updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(reason || 'Cancelled by Admin', billId);

    // Ledger log
    await db.prepare(`
      INSERT INTO customer_ledger (
        customer_id, transaction_date, transaction_type, reference_id, debit, credit,
        advance_balance_after, pending_balance_after, description, created_at
      )
      SELECT id, date('now', 'localtime'), 'ADJUSTMENT', ?, 0, 0, advance_balance, pending_balance, ?, datetime('now', 'localtime')
      FROM customers WHERE id = ?
    `).run(`CANCEL-${billId}`, `Cancelled Bill #${bill.bill_number}`, bill.customer_id);

    res.json({ message: 'Bill cancelled successfully' });
  } catch (err) {
    console.error('Cancel bill error:', err);
    res.status(500).json({ error: 'Failed to cancel bill' });
  }
});

// Edit / Modify Bill (Admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const billId = req.params.id;
    const { gross_amount, delivery_charges_total, product_subtotal, net_payable, notes, status, due_date } = req.body;

    const bill = await db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(bill.customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const oldNet = parseFloat(bill.net_payable) || 0;
    const newNet = net_payable !== undefined ? parseFloat(net_payable) : oldNet;
    const netDiff = parseFloat((newNet - oldNet).toFixed(2));

    // If net payable changed and bill is unpaid or partially paid, adjust customer's pending_balance
    if (netDiff !== 0 && bill.status !== 'PAID' && bill.status !== 'ADVANCE_PAID') {
      const newPending = Math.max(0, parseFloat(((customer.pending_balance || 0) + netDiff).toFixed(2)));
      await db.prepare(`
        UPDATE customers 
        SET pending_balance = ?, updated_at = datetime('now', 'localtime') 
        WHERE id = ?
      `).run(newPending, customer.id);
    }

    await db.prepare(`
      UPDATE bills
      SET gross_amount = COALESCE(?, gross_amount),
          delivery_charges_total = COALESCE(?, delivery_charges_total),
          product_subtotal = COALESCE(?, product_subtotal),
          net_payable = COALESCE(?, net_payable),
          status = COALESCE(?, status),
          due_date = COALESCE(?, due_date),
          notes = COALESCE(?, notes),
          updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      gross_amount !== undefined ? parseFloat(gross_amount) : null,
      delivery_charges_total !== undefined ? parseFloat(delivery_charges_total) : null,
      product_subtotal !== undefined ? parseFloat(product_subtotal) : null,
      net_payable !== undefined ? parseFloat(net_payable) : null,
      status || null,
      due_date || null,
      notes !== undefined ? notes : null,
      billId
    );

    const updatedBill = await db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
    res.json({
      message: 'Bill updated successfully',
      bill: updatedBill
    });
  } catch (err) {
    console.error('Update bill error:', err);
    res.status(400).json({ error: err.message || 'Failed to update bill' });
  }
});

// Delete / Remove Bill (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const billId = req.params.id;
    const bill = await db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(bill.customer_id);
    if (customer) {
      // Revert pending balance if net_payable was added
      if (bill.net_payable > 0 && bill.status !== 'CANCELLED') {
        const unpaid = Math.max(0, bill.net_payable - (bill.paid_amount || 0));
        await db.prepare(`
          UPDATE customers 
          SET pending_balance = MAX(0, pending_balance - ?), updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(unpaid, customer.id);
      }

      // Restore advance balance if advance was deducted by this bill
      if (bill.advance_adjusted > 0) {
        await db.prepare(`
          UPDATE customers 
          SET advance_balance = advance_balance + ?, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `).run(bill.advance_adjusted, customer.id);
      }

      // Remove ledger entries associated with this bill
      await db.prepare(`
        DELETE FROM customer_ledger 
        WHERE customer_id = ? AND reference_id = ?
      `).run(customer.id, `BILL-${billId}`);
    }

    // Delete bill
    await db.prepare('DELETE FROM bills WHERE id = ?').run(billId);

    res.json({ success: true, message: `Bill #${bill.bill_number} deleted successfully` });
  } catch (err) {
    console.error('Delete bill error:', err);
    res.status(400).json({ error: err.message || 'Failed to delete bill' });
  }
});

const multer = require('multer');
const storageService = require('../services/storageService');
const invoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Upload invoice image for WhatsApp sharing & cloud link preview (Admin only)
router.post('/upload-invoice-image', requireAdmin, invoiceUpload.single('invoice'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No invoice image file provided' });
    }
    const result = await storageService.uploadFile(req.file, 'invoices');
    res.json({
      success: true,
      fileUrl: result.fileUrl,
      filename: result.filename
    });
  } catch (err) {
    console.error('Invoice image upload error:', err);
    res.status(500).json({ error: 'Failed to upload invoice image' });
  }
});

module.exports = router;

