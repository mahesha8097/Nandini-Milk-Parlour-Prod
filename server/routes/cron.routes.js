const express = require('express');
const router = express.Router();
const { sendDailyReportEmail, getKolkataDateString } = require('../services/emailReportService');

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

// Support both GET (Vercel Cron default) and POST
router.get('/daily-delivery-report', handleDailyDeliveryReport);
router.post('/daily-delivery-report', handleDailyDeliveryReport);

module.exports = router;
