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

// Upload Product Image (Admin only)
router.post('/upload-image', requireAdmin, handleUpload(upload.single('image')), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a product image file to upload.' });
    }
    const uploadResult = await storageService.uploadFile(req.file, 'product');
    res.json({
      message: 'Product image uploaded successfully',
      fileUrl: uploadResult.fileUrl,
      filename: uploadResult.filename
    });
  } catch (err) {
    console.error('Product image upload error:', err);
    res.status(500).json({ error: 'Failed to process product image upload.' });
  }
});

// Get all products (Admin can see all, Delivery Boy / general can see active products)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { includeInactive } = req.query;
    let query = 'SELECT * FROM products';
    if (includeInactive !== 'true') {
      query += ' WHERE is_active = 1';
    }
    query += ' ORDER BY category ASC, name ASC, variant_label ASC';
    const products = await db.prepare(query).all();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Add new product (Admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      name,
      category,
      variant_label,
      unit_volume_litres,
      selling_price,
      delivery_charge_type,
      fixed_delivery_charge,
      image_url,
      is_active
    } = req.body;

    if (!name || !category || !variant_label || selling_price === undefined) {
      return res.status(400).json({ error: 'Product name, category, variant, and selling price are required' });
    }

    const price = parseFloat(selling_price);
    if (isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'Valid selling price is required' });
    }

    const vol = parseFloat(unit_volume_litres || 0);
    const chargeType = delivery_charge_type || (category === 'Milk' ? 'MILK_RULE' : 'NONE');
    const fixedCharge = parseFloat(fixed_delivery_charge || 0);
    const active = is_active === undefined ? 1 : (is_active ? 1 : 0);

    const stmt = db.prepare(`
      INSERT INTO products (
        name, category, variant_label, unit_volume_litres, selling_price,
        delivery_charge_type, fixed_delivery_charge, is_active, image_url,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `);

    const result = await stmt.run(
      name.trim(),
      category.trim(),
      variant_label.trim(),
      vol,
      price,
      chargeType,
      fixedCharge,
      active,
      image_url || null
    );

    const newProductId = result.lastInsertRowid;
    const newProduct = await db.prepare('SELECT * FROM products WHERE id = ?').get(newProductId);

    // Audit log
    await db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
      VALUES (?, 'CREATE_PRODUCT', 'products', ?, ?, datetime('now', 'localtime'))
    `).run(req.user.id, newProduct.id, `Created product: ${newProduct.name} (${newProduct.variant_label}) at ₹${newProduct.selling_price}`);

    res.status(201).json(newProduct);
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product (Admin only) - Note: Old deliveries will retain their price snapshot!
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const productId = req.params.id;
    const existing = await db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const {
      name,
      category,
      variant_label,
      unit_volume_litres,
      selling_price,
      delivery_charge_type,
      fixed_delivery_charge,
      image_url,
      is_active
    } = req.body;

    const price = selling_price !== undefined ? parseFloat(selling_price) : existing.selling_price;
    const vol = unit_volume_litres !== undefined ? parseFloat(unit_volume_litres) : existing.unit_volume_litres;
    const chargeType = delivery_charge_type || existing.delivery_charge_type;
    const fixedCharge = fixed_delivery_charge !== undefined ? parseFloat(fixed_delivery_charge) : existing.fixed_delivery_charge;
    const active = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;

    await db.prepare(`
      UPDATE products
      SET name = ?, category = ?, variant_label = ?, unit_volume_litres = ?,
          selling_price = ?, delivery_charge_type = ?, fixed_delivery_charge = ?,
          image_url = ?, is_active = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      (name || existing.name).trim(),
      (category || existing.category).trim(),
      (variant_label || existing.variant_label).trim(),
      vol,
      price,
      chargeType,
      fixedCharge,
      image_url !== undefined ? image_url : existing.image_url,
      active,
      productId
    );

    const updated = await db.prepare('SELECT * FROM products WHERE id = ?').get(productId);

    // Audit log
    await db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
      VALUES (?, 'UPDATE_PRODUCT', 'products', ?, ?, datetime('now', 'localtime'))
    `).run(req.user.id, productId, `Updated product ID ${productId}: Price ₹${existing.selling_price} -> ₹${price}`);

    res.json(updated);
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Toggle Active/Inactive
router.patch('/:id/toggle-status', requireAdmin, async (req, res) => {
  try {
    const product = await db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const newStatus = product.is_active ? 0 : 1;
    await db.prepare(`UPDATE products SET is_active = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`).run(newStatus, product.id);

    res.json({ message: `Product ${newStatus ? 'activated' : 'deactivated'}`, is_active: newStatus });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle product status' });
  }
});

module.exports = router;
