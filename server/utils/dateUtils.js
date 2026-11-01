/**
 * Date Utilities for Local Time Handling
 * Ensures that dates rollover properly at 12:00 AM local midnight (e.g. IST UTC+5:30)
 * rather than waiting for UTC 00:00 (which is 5:30 AM in IST).
 */

function getLocalDateString(date = new Date()) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  } catch (e) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

module.exports = {
  getLocalDateString
};
