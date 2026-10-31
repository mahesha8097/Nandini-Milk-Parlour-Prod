const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/db');
const { requireAdmin, verifyToken } = require('../middleware/auth');

// Ensure uploads directory exists (local development)
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!process.env.VERCEL && !fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (e) {
    console.warn('Upload directory check note:', e.message);
  }
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
    const { includeInactive, coupon_eligible } = req.query;
    const agentId = req.agentId || 1;
    let query = 'SELECT * FROM products WHERE agent_id = ?';
    if (includeInactive !== 'true') {
      query += ' AND is_active = 1';
    }
    if (coupon_eligible === 'true' || coupon_eligible === '1') {
      query += ' AND is_coupon_eligible = 1';
    }
    query += ' ORDER BY category ASC, name ASC, variant_label ASC';
    let products = await db.prepare(query).all(agentId);
    if ((!products || products.length === 0) && agentId !== 1) {
      products = await db.prepare(query).all(1);
    }
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Dedicated endpoint to fetch only active coupon-eligible products
router.get('/coupon-eligible', verifyToken, async (req, res) => {
  try {
    const agentId = req.agentId || 1;
    let query = 'SELECT * FROM products WHERE is_active = 1 AND is_coupon_eligible = 1 AND agent_id = ? ORDER BY category ASC, name ASC, variant_label ASC';
    let products = await db.prepare(query).all(agentId);
    if ((!products || products.length === 0) && agentId !== 1) {
      products = await db.prepare(query).all(1);
    }
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch coupon-eligible products' });
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
      is_active,
      is_coupon_eligible
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
    const couponEligible = is_coupon_eligible !== undefined
      ? (is_coupon_eligible ? 1 : 0)
      : (category === 'Milk' || category === 'MILK' ? 1 : 0);
    const agentId = req.agentId || 1;

    const stmt = db.prepare(`
      INSERT INTO products (
        name, category, variant_label, unit_volume_litres, selling_price,
        delivery_charge_type, fixed_delivery_charge, is_coupon_eligible, is_active, image_url,
        agent_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `);

    const result = await stmt.run(
      name.trim(),
      category.trim(),
      variant_label.trim(),
      vol,
      price,
      chargeType,
      fixedCharge,
      couponEligible,
      active,
      image_url || null,
      agentId
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
      is_active,
      is_coupon_eligible
    } = req.body;

    const price = selling_price !== undefined ? parseFloat(selling_price) : existing.selling_price;
    const vol = unit_volume_litres !== undefined ? parseFloat(unit_volume_litres) : existing.unit_volume_litres;
    const chargeType = delivery_charge_type || existing.delivery_charge_type;
    const fixedCharge = fixed_delivery_charge !== undefined ? parseFloat(fixed_delivery_charge) : existing.fixed_delivery_charge;
    const active = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;
    const couponEligible = is_coupon_eligible !== undefined
      ? (is_coupon_eligible ? 1 : 0)
      : (existing.is_coupon_eligible !== undefined ? existing.is_coupon_eligible : (existing.category === 'Milk' ? 1 : 0));

    await db.prepare(`
      UPDATE products
      SET name = ?, category = ?, variant_label = ?, unit_volume_litres = ?,
          selling_price = ?, delivery_charge_type = ?, fixed_delivery_charge = ?,
          is_coupon_eligible = ?, image_url = ?, is_active = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      (name || existing.name).trim(),
      (category || existing.category).trim(),
      (variant_label || existing.variant_label).trim(),
      vol,
      price,
      chargeType,
      fixedCharge,
      couponEligible,
      image_url !== undefined ? image_url : existing.image_url,
      active,
      productId
    );

    // If selling price changed, automatically synchronize any upcoming PENDING deliveries (tomorrow onwards)
    if (price !== existing.selling_price) {
      await db.prepare(`
        UPDATE deliveries
        SET unit_price_snapshot = ?,
            total_product_amount = (? * quantity),
            total_amount = ((? * quantity) + delivery_charge_snapshot),
            updated_at = datetime('now', 'localtime')
        WHERE product_id = ?
          AND status = 'PENDING'
          AND delivery_date > date('now', 'localtime')
      `).run(price, price, price, productId);
    }

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

// Delete product (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const productId = req.params.id;
    const { cascade } = req.query;
    const existing = await db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // 1. Check for active customer subscriptions
    const subRow = await db.prepare('SELECT COUNT(*) as count FROM subscriptions WHERE product_id = ? AND is_active = 1').get(productId);
    const subCount = subRow ? parseInt(subRow.count, 10) : 0;
    if (subCount > 0 && cascade !== 'true') {
      return res.status(400).json({
        error: `Cannot delete "${existing.name}": It is currently assigned to ${subCount} active customer subscription(s). You can Deactivate it instead so it will not appear for new deliveries.`,
        hasSubscriptions: true,
        subCount
      });
    }

    // 2. Check for historical deliveries
    const delRow = await db.prepare('SELECT COUNT(*) as count FROM deliveries WHERE product_id = ?').get(productId);
    const delCount = delRow ? parseInt(delRow.count, 10) : 0;
    if (delCount > 0 && cascade !== 'true') {
      return res.status(400).json({
        error: `Cannot delete "${existing.name}" because it has ${delCount} recorded deliveries needed for billing and payment records. You can Deactivate it instead so it will not appear for new deliveries.`,
        hasDeliveries: true,
        deliveryCount: delCount
      });
    }

    // 3. If cascade === 'true' and has deliveries, clean up delivery children first
    if (delCount > 0 && cascade === 'true') {
      const deliveryRows = await db.prepare('SELECT id FROM deliveries WHERE product_id = ?').all(productId);
      const delIds = deliveryRows.map(r => r.id);
      if (delIds.length > 0) {
        const placeholders = delIds.map(() => '?').join(',');
        await db.prepare(`DELETE FROM delivery_corrections WHERE delivery_id IN (${placeholders})`).run(...delIds);
        await db.prepare(`DELETE FROM coupon_transactions WHERE delivery_id IN (${placeholders})`).run(...delIds);
        await db.prepare('DELETE FROM deliveries WHERE product_id = ?').run(productId);
      }
    }

    // 4. Clean up any inactive subscriptions, daily requirements, and coupon books references
    await db.prepare('DELETE FROM daily_delivery_requirements WHERE product_id = ? OR target_product_id = ?').run(productId, productId);
    await db.prepare('DELETE FROM delivery_corrections WHERE product_id = ?').run(productId);
    await db.prepare('DELETE FROM subscriptions WHERE product_id = ?').run(productId);
    await db.prepare('UPDATE coupon_books SET product_id = NULL WHERE product_id = ?').run(productId);

    // 5. Delete the product
    await db.prepare('DELETE FROM products WHERE id = ?').run(productId);

    // Audit log
    await db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
      VALUES (?, 'DELETE_PRODUCT', 'products', ?, ?, datetime('now', 'localtime'))
    `).run(req.user.id, productId, `Deleted product: ${existing.name} (${existing.variant_label}) [ID: ${productId}]`);

    res.json({ message: `Product "${existing.name}" deleted successfully` });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete product' });
  }
});

module.exports = router;
