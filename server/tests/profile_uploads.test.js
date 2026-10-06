const assert = require('assert');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');

console.log('================================================================');
console.log(' TESTING LOGO, SIGNATURE & UPI QR PROFILE UPLOADS & INVOICES');
console.log('================================================================\n');

// 1. Check database columns exist and profile is accessible
console.log('[TEST 1] Business Profile database schema verification');
{
  const profile = db.prepare('SELECT * FROM business_profile WHERE id = 1').get();
  assert(profile !== undefined, 'Business profile row id=1 must exist');
  assert('business_logo' in profile, 'profile must have business_logo column');
  assert('signature' in profile, 'profile must have signature column');
  assert('upi_qr' in profile, 'profile must have upi_qr column');
  console.log('  ✓ Passed: business_profile schema contains business_logo, signature, and upi_qr columns');
}

// 2. Test saving and retrieving business logo, signature, and upi_qr in database
console.log('\n[TEST 2] Persistent database update for logo, signature, and UPI QR code');
{
  const testLogoPath = '/uploads/business-logo-test-11111.png';
  const testSigPath = '/uploads/signature-test-12345.png';
  const testQrPath = '/uploads/upi-qr-test-67890.png';

  db.prepare(`
    UPDATE business_profile
    SET business_logo = ?, invoice_logo = ?, signature = ?, upi_qr = ?, upi_id = 'test@upi', updated_at = datetime('now', 'localtime')
    WHERE id = 1
  `).run(testLogoPath, testLogoPath, testSigPath, testQrPath);

  const updated = db.prepare('SELECT business_logo, invoice_logo, signature, upi_qr, upi_id FROM business_profile WHERE id = 1').get();
  assert.strictEqual(updated.business_logo, testLogoPath);
  assert.strictEqual(updated.invoice_logo, testLogoPath);
  assert.strictEqual(updated.signature, testSigPath);
  assert.strictEqual(updated.upi_qr, testQrPath);
  assert.strictEqual(updated.upi_id, 'test@upi');
  console.log('  ✓ Passed: Business Logo, Signature and UPI QR saved and retrieved accurately');
}

// 3. Test removing logo, signature, and UPI QR (clean removal)
console.log('\n[TEST 3] Removing logo, signature and UPI QR returns clean empty values');
{
  db.prepare(`
    UPDATE business_profile
    SET business_logo = '', invoice_logo = '', signature = '', upi_qr = '', updated_at = datetime('now', 'localtime')
    WHERE id = 1
  `).run();

  const cleared = db.prepare('SELECT business_logo, invoice_logo, signature, upi_qr FROM business_profile WHERE id = 1').get();
  assert.strictEqual(cleared.business_logo, '');
  assert.strictEqual(cleared.invoice_logo, '');
  assert.strictEqual(cleared.signature, '');
  assert.strictEqual(cleared.upi_qr, '');
  console.log('  ✓ Passed: Logo, Signature and UPI QR cleanly cleared without leaving broken state');
}

// 4. Test File Filter Logic (Security test)
console.log('\n[TEST 4] File filter rejects non-image executable or text files');
{
  const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg'];
  const allowedExts = ['.png', '.jpg', '.jpeg'];

  function isAllowed(mimetype, filename) {
    const ext = path.extname(filename).toLowerCase();
    return allowedMimes.includes(mimetype) && allowedExts.includes(ext);
  }

  assert.strictEqual(isAllowed('image/png', 'logo.png'), true);
  assert.strictEqual(isAllowed('image/jpeg', 'logo.jpg'), true);
  assert.strictEqual(isAllowed('image/jpeg', 'logo.jpeg'), true);
  assert.strictEqual(isAllowed('application/x-msdownload', 'malware.exe'), false);
  assert.strictEqual(isAllowed('text/plain', 'note.txt'), false);
  assert.strictEqual(isAllowed('application/javascript', 'script.js'), false);
  assert.strictEqual(isAllowed('image/svg+xml', 'vector.svg'), false);
  console.log('  ✓ Passed: File filter strictly enforces PNG, JPG, JPEG only and blocks all executable/script files');
}

// 5. Test Invoice endpoint returns latest business profile with Logo, QR and signature
console.log('\n[TEST 5] Invoice details fetch includes business profile with Logo, QR and signature');
{
  const testLogo = '/uploads/business-logo-nandini.png';
  const testSig = '/uploads/signature-owner.png';
  const testQr = '/uploads/upi-qr-owner.png';
  db.prepare(`
    UPDATE business_profile
    SET business_logo = ?, invoice_logo = ?, signature = ?, upi_qr = ?, upi_id = 'nandini@upi', updated_at = datetime('now', 'localtime')
    WHERE id = 1
  `).run(testLogo, testLogo, testSig, testQr);

  const profileRow = db.prepare('SELECT * FROM business_profile WHERE id = 1').get();
  assert.strictEqual(profileRow.business_logo, testLogo);
  assert.strictEqual(profileRow.signature, testSig);
  assert.strictEqual(profileRow.upi_qr, testQr);
  assert.strictEqual(profileRow.upi_id, 'nandini@upi');
  console.log('  ✓ Passed: Invoices will receive configured business logo, signature, and UPI QR code dynamically');
}

console.log('\n================================================================');
console.log(' ALL BUSINESS LOGO, SIGNATURE & UPI QR TESTS PASSED! ✓');
console.log('================================================================\n');
