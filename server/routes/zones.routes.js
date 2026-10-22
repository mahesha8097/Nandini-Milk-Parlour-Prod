const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin, verifyToken } = require('../middleware/auth');

// Get all zones (Accessible to both Admin and Delivery Boy)
router.get('/', verifyToken, async (req, res) => {
  try {
    const agentId = req.agentId || 1;
    const zones = await db.prepare(`
      SELECT z.*, 
             COUNT(c.id) as customer_count
      FROM zones z
      LEFT JOIN customers c ON c.zone_id = z.id AND c.status = 'ACTIVE' AND c.agent_id = ?
      WHERE z.agent_id = ?
      GROUP BY z.id
      ORDER BY z.route_order ASC, z.name ASC
    `).all(agentId, agentId);

    res.json(zones || []);
  } catch (err) {
    console.error('Fetch zones error:', err);
    res.status(500).json({ error: 'Failed to fetch zones' });
  }
});

// Create Zone (Admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, address, route_order, image_url } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Zone name is required' });
    }

    const agentId = req.agentId || 1;
    const order = route_order !== undefined ? parseInt(route_order, 10) || 0 : 0;
    const result = await db.prepare(`
      INSERT INTO zones (name, address, route_order, image_url, agent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(name.trim(), (address || '').trim(), order, image_url || null, agentId);

    const created = await db.prepare('SELECT * FROM zones WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('Create zone error:', err);
    res.status(500).json({ error: err.message || 'Failed to create zone' });
  }
});

// Update Zone (Admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const zoneId = req.params.id;
    const agentId = req.agentId || 1;
    const existing = await db.prepare('SELECT * FROM zones WHERE id = ? AND agent_id = ?').get(zoneId, agentId);
    if (!existing) {
      return res.status(404).json({ error: 'Zone not found' });
    }

    const { name, address, route_order, image_url } = req.body;
    const newName = (name !== undefined ? name : existing.name).trim();
    const newAddress = address !== undefined ? address.trim() : existing.address;
    const newOrder = route_order !== undefined ? parseInt(route_order, 10) || 0 : existing.route_order;
    const newImage = image_url !== undefined ? image_url : existing.image_url;

    await db.prepare(`
      UPDATE zones
      SET name = ?, address = ?, route_order = ?, image_url = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ? AND agent_id = ?
    `).run(newName, newAddress, newOrder, newImage, zoneId, agentId);

    const updated = await db.prepare('SELECT * FROM zones WHERE id = ?').get(zoneId);
    res.json(updated);
  } catch (err) {
    console.error('Update zone error:', err);
    res.status(500).json({ error: err.message || 'Failed to update zone' });
  }
});

// Delete Zone (Admin only - sets zone_id = NULL on customers safely)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const zoneId = req.params.id;
    const agentId = req.agentId || 1;
    await db.prepare('UPDATE customers SET zone_id = NULL WHERE zone_id = ? AND agent_id = ?').run(zoneId, agentId);
    await db.prepare('DELETE FROM zones WHERE id = ? AND agent_id = ?').run(zoneId, agentId);
    res.json({ message: 'Zone deleted successfully' });
  } catch (err) {
    console.error('Delete zone error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete zone' });
  }
});

module.exports = router;
