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

// Admin Self-Registration (Strictly Allowed ONLY when no Admin exists in the database)
router.post('/register-admin', async (req, res) => {
  try {
    const { name, username, password, phone, email } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ error: 'Name, username, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const adminCount = await db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN'`).get();
    if (parseInt(adminCount?.count || '0', 10) > 0) {
      return res.status(403).json({ error: 'Admin account already registered. Please log in.' });
    }

    // Check if username taken
    const existing = await db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim().toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
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
    const newUser = await db.prepare('SELECT id, name, username, role, phone, email, is_active FROM users WHERE id = ?').get(newUserId);
    const token = generateToken(newUser);

    // Audit log
    await db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
      VALUES (?, 'ADMIN_REGISTER', 'users', ?, 'Initial Admin registered', datetime('now', 'localtime'))
    `).run(newUser.id, newUser.id);

    res.status(201).json({
      message: 'Admin account created successfully',
      user: newUser,
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

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
