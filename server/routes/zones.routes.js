const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin, verifyToken } = require('../middleware/auth');
const { getDeliveryBoyAssignedRouteIds } = require('../services/routeAuthService');

// Get all zones
// Admin: gets all zones in parlour/agent
// Delivery Boy: gets ONLY zones belonging to their assigned active route(s)
router.get('/', verifyToken, async (req, res) => {
  try {
    const agentId = req.agentId || 1;
    const isDeliveryBoy = req.user.role === 'DELIVERY_BOY';

    let assignedRouteIds = [];
    if (isDeliveryBoy) {
      assignedRouteIds = await getDeliveryBoyAssignedRouteIds(req.user.id, agentId);
      if (assignedRouteIds.length === 0) {
        // Delivery boy has no assigned route -> see zero zones (Requirement 8 & 9)
        return res.json([]);
      }
    }

    let query = `
      SELECT z.*, 
             r.name as route_name,
             COALESCE(
               r.delivery_boy_id,
               (SELECT u2.id FROM users u2 WHERE u2.role = 'DELIVERY_BOY' AND (u2.assigned_route = r.name OR u2.assigned_route = CAST(r.id AS TEXT) OR u2.assigned_route LIKE '%' || r.name || '%') AND COALESCE(u2.agent_id, 1) = COALESCE(z.agent_id, 1) LIMIT 1),
               (SELECT c.delivery_boy_id FROM customers c WHERE c.zone_id = z.id AND c.delivery_boy_id IS NOT NULL GROUP BY c.delivery_boy_id ORDER BY COUNT(*) DESC LIMIT 1)
             ) as route_delivery_boy_id,
             COALESCE(
               u.name,
               (SELECT u3.name FROM users u3 WHERE u3.id = (
                 SELECT c2.delivery_boy_id FROM customers c2 WHERE c2.zone_id = z.id AND c2.delivery_boy_id IS NOT NULL GROUP BY c2.delivery_boy_id ORDER BY COUNT(*) DESC LIMIT 1
               ))
             ) as delivery_boy_name,
             COALESCE(
               u.phone,
               (SELECT u4.phone FROM users u4 WHERE u4.id = (
                 SELECT c3.delivery_boy_id FROM customers c3 WHERE c3.zone_id = z.id AND c3.delivery_boy_id IS NOT NULL GROUP BY c3.delivery_boy_id ORDER BY COUNT(*) DESC LIMIT 1
               ))
             ) as delivery_boy_phone,
             COUNT(c.id) as customer_count
      FROM zones z
      LEFT JOIN routes r ON z.route_id = r.id
      LEFT JOIN users u ON COALESCE(r.delivery_boy_id, (SELECT u2.id FROM users u2 WHERE u2.role = 'DELIVERY_BOY' AND (u2.assigned_route = r.name OR u2.assigned_route = CAST(r.id AS TEXT)) AND COALESCE(u2.agent_id, 1) = COALESCE(z.agent_id, 1) LIMIT 1)) = u.id
      LEFT JOIN customers c ON c.zone_id = z.id AND c.status = 'ACTIVE' AND COALESCE(c.agent_id, 1) = ?
      WHERE COALESCE(z.agent_id, 1) = ?
    `;
    const params = [agentId, agentId];

    if (isDeliveryBoy) {
      const placeholders = assignedRouteIds.map(() => '?').join(', ');
      query += ` AND z.route_id IN (${placeholders})`;
      params.push(...assignedRouteIds);
    }

    query += `
      GROUP BY z.id, r.name, r.delivery_boy_id, u.name, u.phone
      ORDER BY z.route_order ASC, z.name ASC
    `;

    const zones = await db.prepare(query).all(...params);
    res.json(zones || []);
  } catch (err) {
    console.error('Fetch zones error:', err);
    res.status(500).json({ error: 'Failed to fetch zones' });
  }
});

// Create Zone (Admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, address, route_order, route_id, image_url } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Zone name is required' });
    }

    const agentId = req.agentId || 1;
    const order = route_order !== undefined ? parseInt(route_order, 10) || 0 : 0;
    const rId = route_id !== undefined ? (route_id ? parseInt(route_id, 10) || null : null) : null;

    let route = null;
    if (rId) {
      route = await db.prepare('SELECT * FROM routes WHERE id = ? AND COALESCE(agent_id, 1) = ?').get(rId, agentId);
    }

    const result = await db.prepare(`
      INSERT INTO zones (name, address, route_order, route_id, image_url, agent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(name.trim(), (address || '').trim(), order, rId, image_url || null, agentId);

    const created = await db.prepare(`
      SELECT z.*, r.name as route_name
      FROM zones z
      LEFT JOIN routes r ON z.route_id = r.id
      WHERE z.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(created);
  } catch (err) {
    console.error('Create zone error:', err);
    res.status(500).json({ error: err.message || 'Failed to create zone' });
  }
});

// Update Zone (Admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const zoneId = parseInt(req.params.id, 10);
    const agentId = req.agentId || 1;
    const existing = await db.prepare('SELECT * FROM zones WHERE id = ? AND COALESCE(agent_id, 1) = ?').get(zoneId, agentId);
    if (!existing) {
      return res.status(404).json({ error: 'Zone not found' });
    }

    const { name, address, route_order, route_id, image_url } = req.body;
    const newName = (name !== undefined ? name : existing.name).trim();
    const newAddress = address !== undefined ? address.trim() : existing.address;
    const newOrder = route_order !== undefined ? parseInt(route_order, 10) || 0 : existing.route_order;
    const newImage = image_url !== undefined ? image_url : existing.image_url;
    const newRouteId = route_id !== undefined ? (route_id ? parseInt(route_id, 10) || null : null) : existing.route_id;

    await db.prepare(`
      UPDATE zones
      SET name = ?, address = ?, route_order = ?, route_id = ?, image_url = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ? AND COALESCE(agent_id, 1) = ?
    `).run(newName, newAddress, newOrder, newRouteId, newImage, zoneId, agentId);

    // If route_id changed, synchronize customer route and delivery boy
    if (route_id !== undefined && newRouteId !== existing.route_id) {
      try {
        let routeName = null;
        let routeDboyId = null;
        if (newRouteId) {
          const r = await db.prepare('SELECT name, delivery_boy_id FROM routes WHERE id = ?').get(newRouteId);
          if (r) {
            routeName = r.name;
            routeDboyId = r.delivery_boy_id;
          }
        }
        await db.prepare(`
          UPDATE customers
          SET route = COALESCE(?, route),
              delivery_boy_id = COALESCE(?, delivery_boy_id),
              updated_at = datetime('now', 'localtime')
          WHERE zone_id = ? AND COALESCE(agent_id, 1) = ?
        `).run(routeName, routeDboyId, zoneId, agentId);
      } catch (syncErr) {
        console.warn('Sync zone route change to customers note:', syncErr.message);
      }
    }

    const updated = await db.prepare(`
      SELECT z.*, r.name as route_name
      FROM zones z
      LEFT JOIN routes r ON z.route_id = r.id
      WHERE z.id = ?
    `).get(zoneId);

    res.json(updated);
  } catch (err) {
    console.error('Update zone error:', err);
    res.status(500).json({ error: err.message || 'Failed to update zone' });
  }
});

// Delete Zone (Admin only - sets zone_id = NULL on customers safely)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const zoneId = parseInt(req.params.id, 10);
    const agentId = req.agentId || 1;
    await db.prepare('UPDATE customers SET zone_id = NULL WHERE zone_id = ? AND COALESCE(agent_id, 1) = ?').run(zoneId, agentId);
    await db.prepare('DELETE FROM zones WHERE id = ? AND COALESCE(agent_id, 1) = ?').run(zoneId, agentId);
    res.json({ message: 'Zone deleted successfully' });
  } catch (err) {
    console.error('Delete zone error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete zone' });
  }
});

module.exports = router;
