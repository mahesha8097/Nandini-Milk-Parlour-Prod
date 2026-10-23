const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { getLocalDateString } = require('../utils/dateUtils');
const { calculateDeliveryChargesForCustomerDay } = require('../services/deliveryChargeService');

/**
 * Helper to add days to a YYYY-MM-DD string
 */
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Generate standard Google Calendar URL for 1-click mobile calendar sync
 */
function buildGoogleCalendarUrl({ title, startDate, endDate, description, location }) {
  const startClean = startDate.replace(/-/g, '');
  // Google Calendar all-day event end date is exclusive
  const endClean = addDays(endDate, 1).replace(/-/g, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startClean}/${endClean}`,
    details: description || '',
    location: location || ''
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate Google Calendar URL for prior resume notification (1 day before delivery starts)
 */
function buildGoogleCalendarResumeReminderUrl({ customerName, resumeDate, details, location }) {
  const priorDay = addDays(resumeDate, -1);
  const startClean = priorDay.replace(/-/g, '');
  const endClean = resumeDate.replace(/-/g, '');
  const title = `🔔 Resume Nandini Milk Tomorrow: ${customerName}`;
  const desc = `Reminder: Milk delivery resumes tomorrow (${resumeDate}) for ${customerName}.\n${details || ''}\nPlease procure required milk packets today!`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startClean}/${endClean}`,
    details: desc,
    location: location || ''
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * GET /api/calendar/notifications
 * Returns real-time alerts:
 * 1. pausedToday: Customers whose milk is paused today (Delivery Boy must NOT deliver)
 * 2. resumingTomorrow: Customers whose pause ends today and resume tomorrow (1-day prior alert for Agent)
 */
router.get('/notifications', verifyToken, async (req, res) => {
  try {
    const today = req.query.date || getLocalDateString();
    const tomorrow = addDays(today, 1);
    const agentId = req.agentId || 1;
    const isDeliveryBoy = req.user.role === 'DELIVERY_BOY';

    // 1. Paused Today: Customers with active vacation overlapping today
    let pausedSql = `
      SELECT v.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             c.flat_no, c.route as customer_route, c.zone_id, z.name as zone_name,
             u.name as delivery_boy_name
      FROM customer_vacations v
      JOIN customers c ON v.customer_id = c.id
      LEFT JOIN zones z ON c.zone_id = z.id
      LEFT JOIN users u ON c.delivery_boy_id = u.id
      WHERE v.status = 'ACTIVE'
        AND v.start_date <= ? AND v.end_date >= ?
        AND (c.agent_id = ? OR c.agent_id IS NULL)
    `;
    const pausedParams = [today, today, agentId];
    if (isDeliveryBoy) {
      pausedSql += ` AND c.delivery_boy_id = ?`;
      pausedParams.push(req.user.id);
    }
    pausedSql += ` ORDER BY z.name ASC, c.flat_no ASC, c.name ASC`;
    const pausedToday = await db.prepare(pausedSql).all(...pausedParams);

    // 2. Resuming Tomorrow: Customers whose vacation resume_date is tomorrow (or end_date is today)
    let resumeSql = `
      SELECT v.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             c.flat_no, c.route as customer_route, c.zone_id, z.name as zone_name,
             u.name as delivery_boy_name
      FROM customer_vacations v
      JOIN customers c ON v.customer_id = c.id
      LEFT JOIN zones z ON c.zone_id = z.id
      LEFT JOIN users u ON c.delivery_boy_id = u.id
      WHERE v.status = 'ACTIVE'
        AND (v.resume_date = ? OR v.end_date = ?)
        AND (c.agent_id = ? OR c.agent_id IS NULL)
    `;
    const resumeParams = [tomorrow, today, agentId];
    if (isDeliveryBoy) {
      resumeSql += ` AND c.delivery_boy_id = ?`;
      resumeParams.push(req.user.id);
    }
    resumeSql += ` ORDER BY z.name ASC, c.flat_no ASC, c.name ASC`;
    const resumingTomorrow = await db.prepare(resumeSql).all(...resumeParams);

    // Attach active subscription product summaries for quick procurement notes
    for (const item of resumingTomorrow) {
      const subs = await db.prepare(`
        SELECT s.quantity, p.name as product_name, p.variant_label
        FROM subscriptions s
        JOIN products p ON s.product_id = p.id
        WHERE s.customer_id = ? AND s.is_active = 1
      `).all(item.customer_id);
      item.products_summary = subs.map(s => `${s.quantity}x ${s.product_name} (${s.variant_label})`).join(', ') || 'Milk Subscription';
      item.google_calendar_resume_url = buildGoogleCalendarResumeReminderUrl({
        customerName: item.customer_name,
        resumeDate: item.resume_date || tomorrow,
        details: `Route: ${item.customer_route || 'General'}, Zone: ${item.zone_name || 'Direct'}, Products: ${item.products_summary}`,
        location: item.customer_address
      });
    }

    res.json({
      today,
      tomorrow,
      pausedCount: pausedToday.length,
      resumingCount: resumingTomorrow.length,
      pausedToday,
      resumingTomorrow
    });
  } catch (err) {
    console.error('Fetch calendar notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch calendar notifications' });
  }
});

/**
 * GET /api/calendar/events
 * Returns all delivery vacation & pause events for a given month or date range
 */
router.get('/events', verifyToken, async (req, res) => {
  try {
    const { month, start_date, end_date, customer_id, route_id, zone_id } = req.query;
    const agentId = req.agentId || 1;
    const isDeliveryBoy = req.user.role === 'DELIVERY_BOY';

    let rangeStart = start_date;
    let rangeEnd = end_date;

    if (month && !rangeStart && !rangeEnd) {
      const [year, m] = month.split('-').map(Number);
      const totalDays = new Date(year, m, 0).getDate();
      const pad = (n) => String(n).padStart(2, '0');
      rangeStart = `${month}-01`;
      rangeEnd = `${month}-${pad(totalDays)}`;
    } else if (!rangeStart || !rangeEnd) {
      const today = getLocalDateString();
      const [year, m] = today.split('-').map(Number);
      const totalDays = new Date(year, m, 0).getDate();
      const pad = (n) => String(n).padStart(2, '0');
      rangeStart = `${year}-${pad(m)}-01`;
      rangeEnd = `${year}-${pad(m)}-${pad(totalDays)}`;
    }

    let sql = `
      SELECT v.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             c.flat_no, c.route as customer_route, c.zone_id, z.name as zone_name,
             u.name as delivery_boy_name
      FROM customer_vacations v
      JOIN customers c ON v.customer_id = c.id
      LEFT JOIN zones z ON c.zone_id = z.id
      LEFT JOIN users u ON c.delivery_boy_id = u.id
      WHERE v.status = 'ACTIVE'
        AND v.start_date <= ? AND v.end_date >= ?
        AND (c.agent_id = ? OR c.agent_id IS NULL)
    `;
    const params = [rangeEnd, rangeStart, agentId];

    if (isDeliveryBoy) {
      sql += ` AND c.delivery_boy_id = ?`;
      params.push(req.user.id);
    }
    if (customer_id) {
      sql += ` AND v.customer_id = ?`;
      params.push(customer_id);
    }
    if (zone_id) {
      sql += ` AND c.zone_id = ?`;
      params.push(zone_id);
    }
    sql += ` ORDER BY v.start_date ASC, c.name ASC`;

    const vacations = await db.prepare(sql).all(...params);

    // Enhance each vacation with Google Calendar URL and summary
    const enhancedVacations = vacations.map(v => {
      const title = `🚫 Milk Paused: ${v.customer_name}${v.flat_no ? ` (${v.flat_no})` : ''}`;
      const desc = `Customer: ${v.customer_name} (Phone: ${v.customer_phone || 'N/A'})\nAddress: ${v.customer_address}\nZone: ${v.zone_name || 'General'}, Route: ${v.customer_route || 'Direct'}\nReason: ${v.reason || 'Vacation / Leave'}\nMilk resumes on: ${v.resume_date}`;
      return {
        ...v,
        title,
        google_calendar_url: buildGoogleCalendarUrl({
          title,
          startDate: v.start_date,
          endDate: v.end_date,
          description: desc,
          location: v.customer_address
        }),
        google_calendar_resume_url: buildGoogleCalendarResumeReminderUrl({
          customerName: v.customer_name,
          resumeDate: v.resume_date,
          details: `Route: ${v.customer_route || 'General'}, Zone: ${v.zone_name || 'General'}, Reason for prior pause: ${v.reason || 'Vacation'}`,
          location: v.customer_address
        })
      };
    });

    res.json({
      rangeStart,
      rangeEnd,
      vacations: enhancedVacations
    });
  } catch (err) {
    console.error('Fetch calendar events error:', err);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

/**
 * POST /api/calendar/vacations
 * Schedule a vacation / milk pause for a customer across a date range
 * Automatically:
 * 1. Records vacation in customer_vacations table
 * 2. Creates daily_delivery_requirements with requirement_type = 'SKIP_DELIVERY' for each date
 * 3. Updates/syncs existing deliveries to status = 'SKIPPED' with ₹0 amount!
 */
router.post('/vacations', verifyToken, async (req, res) => {
  try {
    const { customer_id, start_date, end_date, reason } = req.body;

    if (!customer_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'Customer ID, start date, and end date are required' });
    }

    if (start_date > end_date) {
      return res.status(400).json({ error: 'Start date cannot be after end date' });
    }

    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Calculate resume date (day after end_date) and prior notification date (day before resume_date)
    const resumeDate = addDays(end_date, 1);
    const notifyAgentDate = addDays(resumeDate, -1); // which is end_date

    // 1. Insert into customer_vacations
    const insertVacation = db.prepare(`
      INSERT INTO customer_vacations (
        customer_id, start_date, end_date, resume_date, reason, status,
        notify_agent_date, agent_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `);

    const vResult = await insertVacation.run(
      customer.id,
      start_date,
      end_date,
      resumeDate,
      (reason || 'Customer Vacation / Pause').trim(),
      notifyAgentDate,
      customer.agent_id || req.agentId || 1,
      req.user?.id || null
    );
    const vacationId = vResult.lastInsertRowid;

    // 2. Find customer's active subscriptions to create product-specific skips
    const subs = await db.prepare(`
      SELECT s.*, p.name as product_name, p.category, p.variant_label, p.selling_price
      FROM subscriptions s
      JOIN products p ON s.product_id = p.id
      WHERE s.customer_id = ? AND s.is_active = 1
    `).all(customer.id);

    // 3. For each date from start_date to end_date:
    let curr = start_date;
    while (curr <= end_date) {
      for (const s of subs) {
        // Upsert in daily_delivery_requirements
        const existingReq = await db.prepare(`
          SELECT id FROM daily_delivery_requirements
          WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
        `).get(customer.id, s.product_id, curr);

        if (existingReq) {
          await db.prepare(`
            UPDATE daily_delivery_requirements
            SET requirement_type = 'SKIP_DELIVERY',
                normal_quantity = ?,
                required_quantity = 0,
                effective_quantity = 0,
                reason = ?,
                status = 'ACTIVE',
                created_by = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
          `).run(
            s.quantity,
            `Pause / Vacation (${start_date} to ${end_date}): ${reason || 'Customer request'}`,
            req.user?.id || null,
            existingReq.id
          );
        } else {
          await db.prepare(`
            INSERT INTO daily_delivery_requirements (
              customer_id, product_id, subscription_id, delivery_date, requirement_type,
              normal_quantity, required_quantity, additional_quantity, effective_quantity,
              reason, status, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'SKIP_DELIVERY', ?, 0, 0, 0, ?, 'ACTIVE', ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
          `).run(
            customer.id,
            s.product_id,
            s.id,
            curr,
            s.quantity,
            `Pause / Vacation (${start_date} to ${end_date}): ${reason || 'Customer request'}`,
            req.user?.id || null
          );
        }

        // Update existing delivery record if already created for that day (preserve 0 amount and SKIPPED status)
        const delRow = await db.prepare(`
          SELECT id, status FROM deliveries
          WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
        `).get(customer.id, s.product_id, curr);

        if (delRow) {
          await db.prepare(`
            UPDATE deliveries
            SET status = 'SKIPPED',
                total_product_amount = 0,
                delivery_charge_snapshot = 0,
                total_amount = 0,
                notes = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
          `).run(
            `DO NOT DELIVER - Milk Paused (${start_date} to ${end_date}): ${reason || 'Customer request'}`,
            delRow.id
          );
        }
      }
      curr = addDays(curr, 1);
    }

    const created = await db.prepare(`
      SELECT v.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             c.flat_no, c.route as customer_route, z.name as zone_name
      FROM customer_vacations v
      JOIN customers c ON v.customer_id = c.id
      LEFT JOIN zones z ON c.zone_id = z.id
      WHERE v.id = ?
    `).get(vacationId);

    const title = `🚫 Milk Paused: ${created.customer_name}${created.flat_no ? ` (${created.flat_no})` : ''}`;
    const desc = `Customer: ${created.customer_name} (Phone: ${created.customer_phone || 'N/A'})\nAddress: ${created.customer_address}\nReason: ${created.reason || 'Vacation'}\nDeliveries resume on: ${created.resume_date}`;
    created.google_calendar_url = buildGoogleCalendarUrl({
      title,
      startDate: created.start_date,
      endDate: created.end_date,
      description: desc,
      location: created.customer_address
    });
    created.google_calendar_resume_url = buildGoogleCalendarResumeReminderUrl({
      customerName: created.customer_name,
      resumeDate: created.resume_date,
      details: `Milk resumes on ${created.resume_date}`,
      location: created.customer_address
    });

    res.status(201).json({
      message: `Milk paused successfully for ${customer.name} from ${start_date} to ${end_date}. Delivery resumes on ${resumeDate}.`,
      vacation: created
    });
  } catch (err) {
    console.error('Create vacation error:', err);
    res.status(500).json({ error: err.message || 'Failed to schedule vacation / pause' });
  }
});

/**
 * DELETE /api/calendar/vacations/:id
 * Cancels a scheduled vacation / pause and restores pending delivery requirements
 */
router.delete('/vacations/:id', verifyToken, async (req, res) => {
  try {
    const vacationId = req.params.id;
    const vacation = await db.prepare('SELECT * FROM customer_vacations WHERE id = ?').get(vacationId);
    if (!vacation) {
      return res.status(404).json({ error: 'Vacation schedule not found' });
    }

    // Cancel vacation
    await db.prepare(`
      UPDATE customer_vacations
      SET status = 'CANCELLED', updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(vacationId);

    const today = getLocalDateString();
    // Cancel daily delivery requirements from today onwards
    await db.prepare(`
      UPDATE daily_delivery_requirements
      SET status = 'CANCELLED', updated_at = datetime('now', 'localtime')
      WHERE customer_id = ? AND delivery_date >= ? AND delivery_date <= ? AND requirement_type = 'SKIP_DELIVERY'
    `).run(vacation.customer_id, vacation.start_date, vacation.end_date);

    // Revert future deliveries that were marked SKIPPED due to vacation back to PENDING with restored prices
    const subs = await db.prepare(`
      SELECT s.*, p.name as product_name, p.selling_price
      FROM subscriptions s
      JOIN products p ON s.product_id = p.id
      WHERE s.customer_id = ? AND s.is_active = 1
    `).all(vacation.customer_id);

    let curr = vacation.start_date > today ? vacation.start_date : today;
    while (curr <= vacation.end_date) {
      for (const s of subs) {
        const delRow = await db.prepare(`
          SELECT id, status FROM deliveries
          WHERE customer_id = ? AND product_id = ? AND delivery_date = ?
        `).get(vacation.customer_id, s.product_id, curr);

        if (delRow && delRow.status === 'SKIPPED') {
          const prodPrice = s.selling_price || 0;
          const totalProd = parseFloat((prodPrice * s.quantity).toFixed(2));
          await db.prepare(`
            UPDATE deliveries
            SET status = 'PENDING',
                quantity = ?,
                unit_price_snapshot = ?,
                total_product_amount = ?,
                total_amount = ?,
                notes = 'Vacation cancelled; resumed normal delivery',
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
          `).run(s.quantity, prodPrice, totalProd, totalProd, delRow.id);
        }
      }
      curr = addDays(curr, 1);
    }

    res.json({ message: 'Vacation / pause cancelled successfully and normal deliveries restored.' });
  } catch (err) {
    console.error('Cancel vacation error:', err);
    res.status(500).json({ error: err.message || 'Failed to cancel vacation' });
  }
});

module.exports = router;
