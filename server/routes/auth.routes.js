const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { generateToken, verifyToken } = require('../middleware/auth');

// Initial setup status - check if admin has registered
router.get('/init-status', async (req, res) => {
  try {
    const adminCount = await db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'`).get();
    res.json({
      hasAdmin: parseInt(adminCount?.count || '0', 10) > 0,
      systemTime: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to query system status' });
  }
});

// Agent Self-Registration (Allows any new agent/parlour owner to create their own isolated parlour workspace)
const handleAgentRegistration = async (req, res) => {
  try {
    const { name, username, password, phone, email, parlour_name } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ error: 'Name, username, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if username taken
    const existing = await db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim().toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'Username already taken. Please choose another username.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const insert = db.prepare(`
      INSERT INTO users (
        name, username, password_hash, role, phone, email, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, 'ADMIN', ?, ?, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `);

    const result = await insert.run(name.trim(), username.trim().toLowerCase(), passwordHash, phone || '', email || '');
    const newUserId = result.lastInsertRowid;

    // Set user's own agent_id
    await db.prepare('UPDATE users SET agent_id = ? WHERE id = ?').run(newUserId, newUserId);

    const newUser = await db.prepare('SELECT id, name, username, role, phone, email, is_active, agent_id FROM users WHERE id = ?').get(newUserId);
    const token = generateToken(newUser);

    // 1. Create dedicated Business & Invoicing Profile for this Agent
    const businessName = (parlour_name || '').trim() || `${name.trim()} Nandini Milk Parlour`;
    try {
      await db.prepare(`
        INSERT INTO business_profile (
          agent_id, business_name, invoice_business_name, phone, email, address, state, pincode,
          upi_phone, invoice_footer, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, '', 'Karnataka', '',
          ?, 'Thank you for choosing Nandini Milk! Pure & Fresh.', datetime('now', 'localtime')
        )
      `).run(newUserId, businessName, businessName, phone || '', email || '', phone || '7022754524');
    } catch (bpErr) {
      console.warn('Agent business profile creation note:', bpErr.message);
    }

    // 2. Seed Standard Nandini Product Catalogue for this Agent
    try {
      let baseProducts = await db.prepare(`
        SELECT name, category, variant_label, unit_volume_litres, selling_price, delivery_charge_type, fixed_delivery_charge, is_active, image_url
        FROM products
        WHERE agent_id = 1 OR agent_id IS NULL
      `).all();

      if (!baseProducts || baseProducts.length === 0) {
        baseProducts = [
          { name: 'Toned Milk', category: 'Milk', variant_label: '500 ml', unit_volume_litres: 0.5, selling_price: 24.0, delivery_charge_type: 'MILK_RULE', fixed_delivery_charge: 0 },
          { name: 'Toned Milk', category: 'Milk', variant_label: '1 Litre', unit_volume_litres: 1.0, selling_price: 47.0, delivery_charge_type: 'MILK_RULE', fixed_delivery_charge: 0 },
          { name: 'Special Milk', category: 'Milk', variant_label: '500 ml', unit_volume_litres: 0.5, selling_price: 27.0, delivery_charge_type: 'MILK_RULE', fixed_delivery_charge: 0 },
          { name: 'Special Milk', category: 'Milk', variant_label: '1 Litre', unit_volume_litres: 1.0, selling_price: 53.0, delivery_charge_type: 'MILK_RULE', fixed_delivery_charge: 0 },
          { name: 'Samruddhi Milk', category: 'Milk', variant_label: '500 ml', unit_volume_litres: 0.5, selling_price: 28.0, delivery_charge_type: 'MILK_RULE', fixed_delivery_charge: 0 },
          { name: 'Samruddhi Milk', category: 'Milk', variant_label: '1 Litre', unit_volume_litres: 1.0, selling_price: 55.0, delivery_charge_type: 'MILK_RULE', fixed_delivery_charge: 0 },
          { name: 'Shubham Milk', category: 'Milk', variant_label: '500 ml', unit_volume_litres: 0.5, selling_price: 28.0, delivery_charge_type: 'MILK_RULE', fixed_delivery_charge: 0 },
          { name: 'Shubham Milk', category: 'Milk', variant_label: '1 Litre', unit_volume_litres: 1.0, selling_price: 55.0, delivery_charge_type: 'MILK_RULE', fixed_delivery_charge: 0 },
          { name: 'Curd (Dahi)', category: 'Curd', variant_label: '500 g', unit_volume_litres: 0.5, selling_price: 27.0, delivery_charge_type: 'FIXED_PER_UNIT', fixed_delivery_charge: 1.0 },
          { name: 'Curd (Dahi)', category: 'Curd', variant_label: '1 kg', unit_volume_litres: 1.0, selling_price: 52.0, delivery_charge_type: 'FIXED_PER_UNIT', fixed_delivery_charge: 2.0 },
          { name: 'Pure Cow Ghee', category: 'Ghee', variant_label: '500 ml', unit_volume_litres: 0.5, selling_price: 330.0, delivery_charge_type: 'NONE', fixed_delivery_charge: 0 },
          { name: 'Fresh Paneer', category: 'Paneer', variant_label: '200 g', unit_volume_litres: 0.2, selling_price: 95.0, delivery_charge_type: 'NONE', fixed_delivery_charge: 0 }
        ];
      }

      const insertProd = db.prepare(`
        INSERT INTO products (
          name, category, variant_label, unit_volume_litres, selling_price, delivery_charge_type,
          fixed_delivery_charge, is_active, image_url, agent_id, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime')
        )
      `);
      for (const p of baseProducts) {
        insertProd.run(p.name, p.category, p.variant_label, p.unit_volume_litres, p.selling_price, p.delivery_charge_type, p.fixed_delivery_charge || 0, p.is_active !== undefined ? p.is_active : 1, p.image_url || null, newUserId);
      }
    } catch (prodErr) {
      console.warn('Agent standard products seed note:', prodErr.message);
    }

    // 3. Seed Default Zones for this Agent
    try {
      const defaultZones = [
        { name: 'Prestige Lakeside', address: 'Varthur Main Road, Bangalore', route_order: 1 },
        { name: 'Chaitanya Apartments', address: 'Sandeep Vihar, Seegehalli, Bangalore', route_order: 2 },
        { name: 'Green View Villas', address: 'Whitefield, Bangalore', route_order: 3 },
        { name: 'Sai Residency', address: 'Kadugodi, Bangalore', route_order: 4 },
        { name: 'Brindavan Enclave', address: 'Brookefield, Bangalore', route_order: 5 },
        { name: 'Independent Houses', address: 'Local area routes', route_order: 6 }
      ];
      const insertZone = db.prepare(`
        INSERT INTO zones (name, address, route_order, agent_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
      `);
      for (const z of defaultZones) {
        insertZone.run(z.name, z.address, z.route_order, newUserId);
      }
    } catch (zErr) {
      console.warn('Agent default zones seed note:', zErr.message);
    }

    // Audit log
    try {
      await db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
        VALUES (?, 'AGENT_REGISTER', 'users', ?, 'New Agent registered with isolated workspace', datetime('now', 'localtime'))
      `).run(newUser.id, newUser.id);
    } catch (aErr) {}

    res.status(201).json({
      message: 'Agent account created successfully',
      user: newUser,
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

router.post('/register-admin', handleAgentRegistration);
router.post('/register-agent', handleAgentRegistration);

// Login for Admin and Delivery Boys
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim().toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated. Please contact administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = generateToken(user);
    const safeUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      phone: user.phone,
      email: user.email,
      assigned_route: user.assigned_route
    };

    res.json({
      message: 'Login successful',
      user: safeUser,
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// Get Current User Profile
router.get('/me', verifyToken, (req, res) => {
  res.json({ user: req.user });
});

// Change Password
router.post('/change-password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await db.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(newHash, req.user.id);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
