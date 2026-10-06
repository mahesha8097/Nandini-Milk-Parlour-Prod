const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/db');
const { requireAdmin, verifyToken } = require('../middleware/auth');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Memory Storage Configuration (Supports both Local Disk and Cloud Storage)
const storage = multer.memoryStorage();

// File Filter: Strictly accept PNG, JPG, JPEG only
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg'];
  const allowedExts = ['.png', '.jpg', '.jpeg'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PNG, JPG, and JPEG images are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB Max
  fileFilter: fileFilter
});

const storageService = require('../services/storageService');

// Error handling wrapper for multer
function handleUpload(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File size too large. Maximum allowed size is 5MB.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ error: err.message || 'File upload failed.' });
      }
      next();
    });
  };
}

// Get Business Profile & Invoicing Details
router.get('/', verifyToken, async (req, res) => {
  try {
    const profile = await db.prepare('SELECT * FROM business_profile WHERE id = 1').get();
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Upload Business / Parlour Logo (Admin only)
router.post('/upload-logo', requireAdmin, handleUpload(upload.single('logo')), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a logo image file to upload.' });
    }

    const uploadResult = await storageService.uploadFile(req.file, 'business-logo');
    const fileUrl = uploadResult.fileUrl;
    
    // Automatically persist to business_profile database immediately
    await db.prepare(`
      UPDATE business_profile
      SET business_logo = ?, invoice_logo = ?, updated_at = datetime('now', 'localtime')
      WHERE id = 1
    `).run(fileUrl, fileUrl);

    res.json({
      message: 'Business logo uploaded and saved successfully',
      fileUrl: fileUrl,
      filename: uploadResult.filename
    });
  } catch (err) {
    console.error('Logo upload error:', err);
    res.status(500).json({ error: 'Failed to process and save logo upload.' });
  }
});

// Upload Authorized Signature (Admin only)
router.post('/upload-signature', requireAdmin, handleUpload(upload.single('signature')), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a signature image file to upload.' });
    }

    const uploadResult = await storageService.uploadFile(req.file, 'signature');
    const fileUrl = uploadResult.fileUrl;
    
    // Automatically persist to business_profile database immediately
    await db.prepare(`
      UPDATE business_profile
      SET signature = ?, updated_at = datetime('now', 'localtime')
      WHERE id = 1
    `).run(fileUrl);

    res.json({
      message: 'Signature uploaded and saved successfully',
      fileUrl: fileUrl,
      filename: uploadResult.filename
    });
  } catch (err) {
    console.error('Signature upload error:', err);
    res.status(500).json({ error: 'Failed to process and save signature upload.' });
  }
});

// Upload UPI QR Code (Admin only)
router.post('/upload-upi-qr', requireAdmin, handleUpload(upload.single('upi_qr')), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a UPI QR image file to upload.' });
    }

    const uploadResult = await storageService.uploadFile(req.file, 'upi-qr');
    const fileUrl = uploadResult.fileUrl;
    
    // Automatically persist to business_profile database immediately
    await db.prepare(`
      UPDATE business_profile
      SET upi_qr = ?, updated_at = datetime('now', 'localtime')
      WHERE id = 1
    `).run(fileUrl);

    res.json({
      message: 'UPI QR code uploaded and saved successfully',
      fileUrl: fileUrl,
      filename: uploadResult.filename
    });
  } catch (err) {
    console.error('UPI QR upload error:', err);
    res.status(500).json({ error: 'Failed to process and save UPI QR code upload.' });
  }
});

// Update Business Profile (Admin only)
router.put('/', requireAdmin, (req, res) => {
  try {
    const {
      business_name,
      business_logo,
      phone,
      email,
      address,
      state,
      pincode,
      business_details,
      invoice_business_name,
      invoice_logo,
      signature,
      upi_id,
      upi_qr,
      upi_phone,
      invoice_footer
    } = req.body;

    db.prepare(`
      UPDATE business_profile
      SET business_name = ?, business_logo = ?, phone = ?, email = ?,
          address = ?, state = ?, pincode = ?, business_details = ?,
          invoice_business_name = ?, invoice_logo = ?, signature = ?,
          upi_id = ?, upi_qr = ?, upi_phone = ?, invoice_footer = ?,
          updated_at = datetime('now', 'localtime')
      WHERE id = 1
    `).run(
      business_name || 'Nandini Milk Parlour',
      business_logo !== undefined ? business_logo : '',
      phone !== undefined ? phone : '',
      email !== undefined ? email : '',
      address !== undefined ? address : '',
      state || 'Karnataka',
      pincode !== undefined ? pincode : '',
      business_details !== undefined ? business_details : '',
      invoice_business_name || 'Nandini Milk Parlour',
      invoice_logo !== undefined ? invoice_logo : '',
      signature !== undefined ? signature : '',
      upi_id !== undefined ? upi_id : '',
      upi_qr !== undefined ? upi_qr : '',
      upi_phone !== undefined ? upi_phone : '7022754524',
      invoice_footer || 'Thank you for choosing Nandini Milk! Pure & Fresh.'
    );

    const updated = db.prepare('SELECT * FROM business_profile WHERE id = 1').get();
    res.json(updated);
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;

