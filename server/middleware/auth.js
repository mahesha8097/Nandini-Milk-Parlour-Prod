const jwt = require('jsonwebtoken');
const db = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'nandini-parlour-super-secret-key-2026';

function generateToken(user) {
  const agentId = user.role === 'ADMIN' ? user.id : (user.agent_id || user.id || 1);
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      agent_id: agentId
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
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (jwtErr) {
    console.warn('JWT verification failed:', jwtErr.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    // Select user without failing if agent_id column is not yet present
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated. Please contact administrator.' });
    }
    req.user = user;
    req.agentId = user.role === 'ADMIN' ? user.id : (user.agent_id || user.id || 1);
    next();
  } catch (dbErr) {
    console.warn('verifyToken DB lookup warning, falling back to verified JWT payload:', dbErr.message);
    req.user = {
      id: decoded.id,
      name: decoded.name || 'Admin',
      username: decoded.username || '',
      role: decoded.role || 'ADMIN',
      is_active: 1,
      agent_id: decoded.agent_id || decoded.id || 1
    };
    req.agentId = req.user.role === 'ADMIN' ? req.user.id : (req.user.agent_id || req.user.id || 1);
    next();
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
