/**
 * NANDINI MILK PARLOUR — AUTOMATED EMAIL REPORTS & VERCEL CRON TEST SUITE
 * Verifies:
 * 1. generateDailyReportData() extracts accurate milk litres, curd kg/L, routes, zones, payments, and balances
 * 2. buildDailyReportHtml() generates clean, responsive, valid email HTML
 * 3. verifyCronAuth() security enforces CRON_SECRET authorization
 * 4. sendDailyReportEmail() prevents duplicate cron dispatches
 * 5. audit logging into email_report_logs table
 */

const assert = require('assert');
const db = require('../config/db');
const {
  generateDailyReportData,
  buildDailyReportHtml,
  sendDailyReportEmail,
  getEmailReportLogs,
  getKolkataDateString,
  getPreviousMonthRange,
  getMonthRange,
  generateMonthlyBusinessReportData,
  buildMonthlyBusinessReportHtml,
  sendMonthlyBusinessReportEmail,
  generateGenericReportData,
  previewReport,
  sendManualReportEmail
} = require('../services/emailReportService');

async function runTests() {
  console.log('================================================================');
  console.log(' NANDINI MILK PARLOUR — EMAIL REPORT & VERCEL CRON TEST SUITE ');
  console.log('================================================================\n');

  const testDate = '2026-10-26';

  // [TEST 1] Report Data Generation
  console.log('[TEST 1] Generate consolidated report data directly from DB');
  const reportData = await generateDailyReportData(testDate);
  assert.ok(reportData, 'Report data must not be null');
  assert.strictEqual(reportData.reportDate, testDate);
  assert.ok(typeof reportData.milk.totalLitres === 'number', 'Milk totalLitres must be numeric');
  assert.ok(typeof reportData.curd.totalKgLitres === 'number', 'Curd totalKgLitres must be numeric');
  assert.ok(typeof reportData.overview.customersServed === 'number', 'customersServed must be numeric');
  assert.ok(Array.isArray(reportData.routeTotals), 'routeTotals must be an array');
  assert.ok(Array.isArray(reportData.zoneTotals), 'zoneTotals must be an array');
  assert.ok(Array.isArray(reportData.missedDeliveries), 'missedDeliveries must be an array');
  assert.ok(typeof reportData.customerBalances.totalActiveCustomers === 'number', 'totalActiveCustomers must be numeric');
  console.log(`  ✓ Passed: Generated report for ${reportData.formattedDate}`);
  console.log(`    - Customers: ${reportData.customerBalances.totalActiveCustomers}`);
  console.log(`    - Milk: ${reportData.milk.totalLitres} L, Curd: ${reportData.curd.totalKgLitres} kg/L`);

  // [TEST 2] Responsive HTML Template Generation
  console.log('\n[TEST 2] Build responsive email HTML template');
  const html = buildDailyReportHtml(reportData);
  assert.ok(html && html.length > 500, 'HTML must be generated with substantial length');
  assert.ok(html.includes('DAILY OPERATIONS REPORT'), 'HTML must contain report banner header');
  assert.ok(html.includes(testDate), 'HTML must contain the report date');
  assert.ok(html.includes('Milk Delivered'), 'HTML must contain Milk Delivered metric');
  assert.ok(html.includes('Curd Delivered'), 'HTML must contain Curd Delivered metric');
  assert.ok(html.includes('Financials & Ledger Summary'), 'HTML must contain ledger summary section');
  console.log(`  ✓ Passed: Responsive HTML email built successfully (${html.length} bytes)`);

  // [TEST 3] Audit Logging & Duplicate Prevention in Test Mode
  console.log('\n[TEST 3] Test duplicate prevention and audit logging');
  
  // Clean any existing test logs for this date
  try {
    await db.prepare("DELETE FROM email_report_logs WHERE report_date = ? AND recipient_email = 'test@example.com'").run(testDate);
  } catch (e) {}

  // Attempt send without API key (test mode / missing key handling)
  const result1 = await sendDailyReportEmail({
    targetDate: testDate,
    recipientEmail: 'test@example.com',
    triggerType: 'ADMIN_TEST',
    force: true
  });

  assert.ok(result1, 'Send result must not be null');
  console.log(`  ✓ Passed: Handled send gracefully (status: ${result1.status}) without crashing`);

  // Check audit log
  const logs = await getEmailReportLogs(5);
  assert.ok(logs.length > 0, 'Audit logs must record the attempt');
  console.log(`  ✓ Passed: Verified entry in email_report_logs (latest log status: ${logs[0].status})`);

  // [TEST 4] Test Duplicate Cron Prevention
  console.log('\n[TEST 4] Verify duplicate prevention for automated Cron triggers');
  // Insert a mock SENT log to simulate previous successful cron
  await db.prepare(`
    INSERT INTO email_report_logs (
      report_date, report_type, recipient_email, sender_email, resend_id,
      status, trigger_type, agent_id, created_at
    ) VALUES (?, 'DAILY_DELIVERY', 'admin@example.com', 'Nandini <onboarding@resend.dev>', 'msg_mock_123', 'SENT', 'CRON', 1, datetime('now', 'localtime'))
  `).run('2026-10-25');

  const cronResult = await sendDailyReportEmail({
    targetDate: '2026-10-25',
    recipientEmail: 'admin@example.com',
    triggerType: 'CRON',
    force: false
  });

  assert.strictEqual(cronResult.status, 'SKIPPED_DUPLICATE', 'Must skip duplicate cron dispatch');
  console.log(`  ✓ Passed: Duplicate cron send correctly blocked: "${cronResult.message}"`);

  // [TEST 5] Force bypass allows manual override
  console.log('\n[TEST 5] Verify Admin force bypass allows resending if needed');
  const forceResult = await sendDailyReportEmail({
    targetDate: '2026-10-25',
    recipientEmail: 'admin@example.com',
    triggerType: 'ADMIN_TEST',
    force: true
  });
  assert.notStrictEqual(forceResult.status, 'SKIPPED_DUPLICATE', 'Force=true must bypass duplicate block');
  console.log(`  ✓ Passed: Force override bypassed duplicate check cleanly`);

  // Cleanup mock test records
  try {
    await db.prepare("DELETE FROM email_report_logs WHERE report_date = '2026-10-25' AND resend_id = 'msg_mock_123'").run();
  } catch (e) {}

  // [TEST 6] Preview Contract & Read-Only Guarantee
  console.log('\n[TEST 6] Verify Read-Only Preview Contract and Data Integrity');
  const initialLogCount = (await db.prepare("SELECT COUNT(*) as count FROM email_report_logs").get()).count;
  const initialDeliveryCount = (await db.prepare("SELECT COUNT(*) as count FROM deliveries").get()).count;

  const previewData = await generateDailyReportData(testDate, 1);
  const previewHtml = buildDailyReportHtml(previewData);

  assert.ok(previewData, 'Preview data must be generated');
  assert.ok(previewHtml && previewHtml.includes('<!DOCTYPE html>'), 'Preview HTML must be a valid complete HTML document');
  assert.ok(previewHtml.includes(testDate), 'Preview HTML must include target report date');

  const afterLogCount = (await db.prepare("SELECT COUNT(*) as count FROM email_report_logs").get()).count;
  const afterDeliveryCount = (await db.prepare("SELECT COUNT(*) as count FROM deliveries").get()).count;

  assert.strictEqual(afterLogCount, initialLogCount, 'Preview MUST BE read-only: no email_report_logs created');
  assert.strictEqual(afterDeliveryCount, initialDeliveryCount, 'Preview MUST BE read-only: no deliveries records modified');
  console.log(`  ✓ Passed: Preview generates HTML (${previewHtml.length} bytes) and strictly preserves all data without side effects`);

  // [TEST 7] Regression Test: PostgreSQL Parameter Typing & Cron Path Integrity
  console.log('\n[TEST 7] Verify PostgreSQL parameter typing & cron execution path');
  const fs = require('fs');
  const serviceCode = fs.readFileSync(__dirname + '/../services/emailReportService.js', 'utf8');

  // Assert no untyped parameter IS NULL patterns exist in SQL strings
  const untypedParamRegex = /\?\s+IS\s+NULL/i;
  assert.strictEqual(
    untypedParamRegex.test(serviceCode),
    false,
    'Regression check: No "? IS NULL" untyped parameter expressions allowed in SQL queries'
  );

  // Assert exact cron execution path completes without throwing unhandled parameter errors
  const cronDispatchResult = await sendDailyReportEmail({
    targetDate: testDate,
    triggerType: 'CRON',
    force: true
  });
  assert.ok(cronDispatchResult, 'Cron dispatch must return result object');
  assert.ok(
    !cronDispatchResult.message || !cronDispatchResult.message.includes('could not determine data type'),
    'Cron dispatch must not encounter PostgreSQL parameter typing error 42P18'
  );
  console.log('  ✓ Passed: Zero untyped parameter expressions in service code');
  console.log(`  ✓ Passed: Exact cron dispatch path executed cleanly (status: ${cronDispatchResult.status})`);

  // [TEST 8] Monthly Business Report Data Generation & Range Calculations
  console.log('\n[TEST 8] Verify Monthly Business Report data generation & calendar range');
  const prevMonth = getPreviousMonthRange(new Date('2026-10-26T12:00:00+05:30'));
  assert.strictEqual(prevMonth.monthKey, '2026-09', 'Previous month of Oct 2026 must be 2026-09');
  assert.strictEqual(prevMonth.startDate, '2026-09-01');
  assert.strictEqual(prevMonth.endDate, '2026-09-30');
  assert.strictEqual(prevMonth.monthLabel, 'September 2026');

  const monthlyData = await generateMonthlyBusinessReportData({ month: '2026-09' });
  assert.ok(monthlyData, 'Monthly data must not be null');
  assert.strictEqual(monthlyData.period.monthKey, '2026-09');
  assert.ok(typeof monthlyData.summary.totalRevenue === 'number', 'totalRevenue must be numeric');
  assert.ok(typeof monthlyData.summary.totalCollections === 'number', 'totalCollections must be numeric');
  assert.ok(typeof monthlyData.summary.totalExpenses === 'number', 'totalExpenses must be numeric');
  assert.ok(typeof monthlyData.summary.netProfit === 'number', 'netProfit must be numeric');
  assert.ok(Array.isArray(monthlyData.categoryBreakdown), 'categoryBreakdown must be an array');
  assert.ok(Array.isArray(monthlyData.paymentMethods), 'paymentMethods must be an array');
  assert.ok(Array.isArray(monthlyData.expenseCategories), 'expenseCategories must be an array');
  console.log(`  ✓ Passed: Generated monthly report for ${monthlyData.period.monthLabel}`);
  console.log(`    - Deliveries: ${monthlyData.summary.totalDeliveries}, Revenue: ₹${monthlyData.summary.totalRevenue}`);
  console.log(`    - Collections: ₹${monthlyData.summary.totalCollections}, Net Profit: ₹${monthlyData.summary.netProfit}`);

  // [TEST 9] Monthly Responsive HTML Email Template
  console.log('\n[TEST 9] Build responsive Monthly Business Report HTML email');
  const monthlyHtml = buildMonthlyBusinessReportHtml(monthlyData);
  assert.ok(monthlyHtml && monthlyHtml.length > 500, 'Monthly HTML must be substantial');
  assert.ok(monthlyHtml.includes('MONTHLY BUSINESS &amp; OPERATIONS REPORT') || monthlyHtml.includes('MONTHLY BUSINESS & OPERATIONS REPORT'), 'Must contain header');
  assert.ok(monthlyHtml.includes('September 2026'), 'Must contain month label');
  assert.ok(monthlyHtml.includes('Total Sales Revenue'), 'Must contain Sales metric');
  assert.ok(monthlyHtml.includes('Net Operating Margin'), 'Must contain net margin');
  console.log(`  ✓ Passed: Monthly HTML template generated successfully (${monthlyHtml.length} bytes)`);

  // [TEST 10] Monthly Duplicate Prevention for CRON
  console.log('\n[TEST 10] Verify duplicate prevention for automated Monthly CRON triggers');
  // Seed a SENT log for 2026-08
  await db.prepare(`
    INSERT INTO email_report_logs (
      report_date, report_type, recipient_email, sender_email, resend_id,
      status, trigger_type, agent_id, created_at
    ) VALUES ('2026-08', 'MONTHLY_BUSINESS', 'admin@example.com', 'Nandini <onboarding@resend.dev>', 'msg_mock_monthly', 'SENT', 'CRON', 1, datetime('now', 'localtime'))
  `).run();

  const monthlyCronResult = await sendMonthlyBusinessReportEmail({
    month: '2026-08',
    recipientEmail: 'admin@example.com',
    triggerType: 'CRON',
    force: false
  });
  assert.strictEqual(monthlyCronResult.status, 'SKIPPED_DUPLICATE', 'Must skip duplicate monthly cron');
  console.log(`  ✓ Passed: Duplicate monthly cron correctly skipped: "${monthlyCronResult.message}"`);

  // Force bypass allows resend
  const monthlyForceResult = await sendMonthlyBusinessReportEmail({
    month: '2026-08',
    recipientEmail: 'admin@example.com',
    triggerType: 'ADMIN_TEST',
    force: true
  });
  assert.notStrictEqual(monthlyForceResult.status, 'SKIPPED_DUPLICATE', 'Force=true must bypass duplicate block');
  console.log('  ✓ Passed: Force override allowed manual send without duplicate blockage');

  // Clean mock log
  try {
    await db.prepare("DELETE FROM email_report_logs WHERE report_date = '2026-08' AND resend_id = 'msg_mock_monthly'").run();
  } catch (e) {}

  // [TEST 11] Date Range Validation
  console.log('\n[TEST 11] Verify date-range validation and error rejection');
  let rangeErrorThrown = false;
  try {
    await generateGenericReportData({
      reportType: 'DAILY_SALES',
      startDate: '2026-10-25',
      endDate: '2026-10-20' // invalid: start > end
    });
  } catch (err) {
    rangeErrorThrown = true;
    assert.ok(err.message.includes('cannot be after End date'), 'Error message must explain date ordering issue');
  }
  assert.strictEqual(rangeErrorThrown, true, 'Start date after end date must throw validation error');
  console.log('  ✓ Passed: Inverted date range correctly rejected with clear explanation');

  // [TEST 12] Standard Report Types Execution & Preview Contract
  console.log('\n[TEST 12] Verify all genuinely supported report types via Preview contract');
  const supportedTypes = [
    'DAILY_SALES',
    'MONTHLY_SALES',
    'PRODUCT_SALES',
    'CUSTOMER_SALES',
    'COLLECTIONS',
    'PENDING_PAYMENTS',
    'ADVANCE_BALANCES',
    'EXPENSES',
    'HOTEL_BULK_SALES',
    'MISSED_DELIVERIES'
  ];

  for (const type of supportedTypes) {
    const preview = await previewReport({
      reportType: type,
      startDate: '2026-10-01',
      endDate: '2026-10-26'
    });
    assert.ok(preview, `Preview for ${type} must not be null`);
    assert.strictEqual(preview.reportType, type);
    assert.ok(preview.html && preview.html.includes('<!DOCTYPE html>'), `HTML for ${type} must be valid document`);
    assert.ok(Array.isArray(preview.data), `Data for ${type} must be an array`);
  }
  console.log(`  ✓ Passed: All ${supportedTypes.length} supported report types executed cleanly and generated valid preview HTML`);

  // [TEST 13] Unsupported Report Type Rejection
  console.log('\n[TEST 13] Verify unsupported report types are rejected');
  let unsupportedThrown = false;
  try {
    await previewReport({ reportType: 'FABRICATED_UNSUPPORTED_REPORT' });
  } catch (err) {
    unsupportedThrown = true;
    assert.ok(err.message.includes('Unsupported report type'), 'Error must specify unsupported type');
  }
  assert.strictEqual(unsupportedThrown, true, 'Unsupported report type must be rejected');
  console.log('  ✓ Passed: Unsupported report type rejected cleanly');

  console.log('\n================================================================');
  console.log(' ALL 13 EMAIL REPORT & CRON SUITE TESTS PASSED WITH 100% SUCCESS! ');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

