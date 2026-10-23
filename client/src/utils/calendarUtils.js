/**
 * Calendar Integration Utilities for Nandini Milk Parlour
 * Generates direct 1-click Google Calendar URLs and downloadable .ics files
 * for mobile notification bar alerts on Android and iOS.
 */

// Helper to add days to YYYY-MM-DD string
export function addDays(dateStr, days) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Builds Google Calendar event URL for Milk Pause / Vacation
 * Clicking opens Google Calendar on phone/PC, saving notification alerts
 */
export function generateGoogleCalendarPauseUrl({
  customerName = '',
  flatNo = '',
  startDate = '',
  endDate = '',
  resumeDate = '',
  reason = 'Customer Vacation',
  address = '',
  phone = ''
}) {
  if (!startDate || !endDate) return '';
  const startClean = startDate.replace(/-/g, '');
  // Google Calendar all-day event end date is exclusive
  const endClean = addDays(endDate, 1).replace(/-/g, '');

  const title = `🚫 Nandini Milk Paused: ${customerName}${flatNo ? ` (${flatNo})` : ''}`;
  const details = [
    `Customer: ${customerName}`,
    phone ? `Phone: ${phone}` : '',
    flatNo ? `Flat/Villa: ${flatNo}` : '',
    address ? `Address: ${address}` : '',
    `Reason: ${reason}`,
    `Pause Period: ${startDate} to ${endDate}`,
    `Deliveries Resume: ${resumeDate || addDays(endDate, 1)}`,
    '',
    '⚠️ Note: Do not deliver milk on these days.'
  ].filter(Boolean).join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startClean}/${endClean}`,
    details,
    location: address || 'Bangalore, Karnataka'
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Builds Google Calendar event URL for Prior Resume Reminder (1 day before delivery continues)
 */
export function generateGoogleCalendarResumeUrl({
  customerName = '',
  flatNo = '',
  resumeDate = '',
  reason = '',
  address = '',
  phone = '',
  productsSummary = ''
}) {
  if (!resumeDate) return '';
  const priorDay = addDays(resumeDate, -1);
  const startClean = priorDay.replace(/-/g, '');
  const endClean = resumeDate.replace(/-/g, '');

  const title = `🔔 Resume Nandini Milk Tomorrow: ${customerName}${flatNo ? ` (${flatNo})` : ''}`;
  const details = [
    `REMINDER: Milk delivery resumes tomorrow on ${resumeDate}!`,
    `Customer: ${customerName}`,
    phone ? `Phone: ${phone}` : '',
    flatNo ? `Flat/Villa: ${flatNo}` : '',
    address ? `Address: ${address}` : '',
    productsSummary ? `Required Products: ${productsSummary}` : '',
    reason ? `Previous Vacation Reason: ${reason}` : '',
    '',
    'Action Required: Procure and pack milk packets today for tomorrow morning delivery.'
  ].filter(Boolean).join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startClean}/${endClean}`,
    details,
    location: address || 'Bangalore, Karnataka'
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generates and downloads a universal .ics file for Apple Calendar, Outlook, and Android
 */
export function downloadIcsFile({
  title = 'Nandini Milk Delivery Event',
  startDate = '',
  endDate = '',
  description = '',
  location = ''
}) {
  if (!startDate) return;
  const targetEnd = endDate || startDate;
  const startClean = startDate.replace(/-/g, '');
  const endClean = addDays(targetEnd, 1).replace(/-/g, '');

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nandini Milk Parlour//Delivery Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:nandini-${Date.now()}-${Math.random().toString(36).substring(2, 8)}@nandiniparlour.local`,
    `SUMMARY:${title.replace(/[\r\n]+/g, ' ')}`,
    `DTSTART;VALUE=DATE:${startClean}`,
    `DTEND;VALUE=DATE:${endClean}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    `LOCATION:${(location || '').replace(/[\r\n]+/g, ' ')}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'TRIGGER:-P1D', // Alert 1 day prior
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  const blob = new Blob([icsLines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const cleanFilename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.ics`;
  link.setAttribute('download', cleanFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
