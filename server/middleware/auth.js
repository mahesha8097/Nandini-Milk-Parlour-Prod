const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'nandini-parlour-super-secret-key-2026';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

async function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Authentication token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Verify user still exists and is active
    const user = await db.prepare('SELECT id, name, username, role, is_active, phone FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated. Please contact administrator.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied: Admin privileges required' });
    }
    next();
  });
}

function requireDeliveryBoy(req, res, next) {
  verifyToken(req, res, () => {
    if (req.user.role !== 'DELIVERY_BOY' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Access denied: Delivery Boy access only' });
    }
    next();
  });
}

module.exports = {
  generateToken,
  verifyToken,
  requireAdmin,
  requireDeliveryBoy
};
