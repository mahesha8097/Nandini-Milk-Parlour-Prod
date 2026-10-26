const express = require('express');
const router = express.Router();
const {
  sendDailyReportEmail,
  sendMonthlyBusinessReportEmail,
  getKolkataDateString
} = require('../services/emailReportService');

/**
 * Validates the caller against CRON_SECRET.
 * Vercel Cron automatically attaches: `Authorization: Bearer <CRON_SECRET>`.
 * Also supports `x-cron-secret` header or `?secret=` query parameter for manual testing.
 */
function verifyCronAuth(req) {
  const cronSecret = process.env.CRON_SECRET;

  // In production, CRON_SECRET is strictly required
  if (process.env.NODE_ENV === 'production' && (!cronSecret || cronSecret.trim() === '')) {
    return {
      authorized: false,
      reason: 'CRON_SECRET is not configured in server environment variables.'
    };
  }

  // If secret is set, verify incoming tokens
  if (cronSecret && cronSecret.trim() !== '') {
    const authHeader = req.headers['authorization'] || '';
    const customHeader = req.headers['x-cron-secret'] || '';
    const querySecret = req.query.secret || '';

    let token = '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (authHeader) {
      token = authHeader.trim();
    }

    if (token === cronSecret || customHeader === cronSecret || querySecret === cronSecret) {
      return { authorized: true };
    }

    return {
      authorized: false,
      reason: 'Unauthorized: Invalid or missing Cron authorization credentials.'
    };
  }

  // Development mode without CRON_SECRET configured
  return { authorized: true };
}

/**
 * Handler for the daily delivery report cron job.
 * Handles both GET and POST requests.
 */
async function handleDailyDeliveryReport(req, res) {
  try {
    const auth = verifyCronAuth(req);
    if (!auth.authorized) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: auth.reason
      });
    }

    const targetDate = req.query.date || req.body?.date || getKolkataDateString();
    const force = req.query.force === 'true' || req.body?.force === true;

    console.log(`[Cron] Triggering daily delivery report for ${targetDate} (force=${force})...`);

    const result = await sendDailyReportEmail({
      targetDate,
      triggerType: 'CRON',
      force
    });

    // On the 1st of any month, automatically trigger previous month's business report.
    // This allows Vercel Hobby accounts (limited to 1 cron job in vercel.json) to reliably dispatch both reports
    // without interference, protected by duplicate check so it runs only once per month.
    if (process.env.AUTO_MONTHLY_REPORT !== 'false' && targetDate.endsWith('-01')) {
      try {
        console.log(`[Cron] Day 1 of month detected (${targetDate}). Checking/dispatching Monthly Business Report for previous month...`);
        await sendMonthlyBusinessReportEmail({
          triggerType: 'CRON',
          force: false
        });
      } catch (mErr) {
        console.warn('[Cron] Chained monthly business report note (non-blocking):', mErr.message);
      }
    }

    // We return 200 with result details so Vercel logs the status clearly
    res.status(200).json({
      success: result.success,
      status: result.status,
      message: result.message,
      reportDate: result.reportDate,
      messageId: result.messageId || null,
      summary: result.summary || null,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Cron] Unhandled daily delivery report error:', err);
    // Never crash the serverless container or return 500 without json
    res.status(500).json({
      success: false,
      status: 'CRON_EXECUTION_ERROR',
      error: err.message || 'Internal error executing daily delivery report cron'
    });
  }
}

/**
 * Handler for the monthly business report cron job.
 * Supports GET and POST. Can be invoked directly by external schedulers or Vercel Pro.
 */
async function handleMonthlyBusinessReport(req, res) {
  try {
    const auth = verifyCronAuth(req);
    if (!auth.authorized) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: auth.reason
      });
    }

    const month = req.query.month || req.body?.month;
    const force = req.query.force === 'true' || req.body?.force === true;

    console.log(`[Cron] Triggering monthly business report (month=${month || 'previous'}, force=${force})...`);

    const result = await sendMonthlyBusinessReportEmail({
      month,
      triggerType: 'CRON',
      force
    });

    res.status(200).json({
      success: result.success,
      status: result.status,
      message: result.message,
      reportPeriod: result.reportPeriod,
      messageId: result.messageId || null,
      summary: result.summary || null,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Cron] Unhandled monthly business report error:', err);
    res.status(500).json({
      success: false,
      status: 'CRON_EXECUTION_ERROR',
      error: err.message || 'Internal error executing monthly business report cron'
    });
  }
}

// Daily Delivery Report routes
router.get('/daily-delivery-report', handleDailyDeliveryReport);
router.post('/daily-delivery-report', handleDailyDeliveryReport);

// Monthly Business Report routes
router.get('/monthly-business-report', handleMonthlyBusinessReport);
router.post('/monthly-business-report', handleMonthlyBusinessReport);

module.exports = router;

