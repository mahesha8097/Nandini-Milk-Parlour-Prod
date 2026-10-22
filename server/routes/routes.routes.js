const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireAdmin, verifyToken } = require('../middleware/auth');
const { isRouteAuthorized } = require('../services/routeAuthService');

// Get all routes
// Admin: gets all routes in the parlour/agent
// Delivery Boy: gets ONLY their assigned active route(s)
router.get('/', verifyToken, async (req, res) => {
  try {
    const agentId = req.agentId || 1;
    const isDeliveryBoy = req.user.role === 'DELIVERY_BOY';

    let query = `
      SELECT r.*,
             u.name as delivery_boy_name,
             u.phone as delivery_boy_phone,
             u.username as delivery_boy_username,
             (SELECT COUNT(*) FROM zones z WHERE z.route_id = r.id AND COALESCE(z.agent_id, 1) = ?) as zone_count,
             (SELECT COUNT(c.id) 
              FROM customers c 
              JOIN zones z ON c.zone_id = z.id 
              WHERE z.route_id = r.id AND c.status = 'ACTIVE' AND COALESCE(c.agent_id, 1) = ?) as customer_count
      FROM routes r
      LEFT JOIN users u ON r.delivery_boy_id = u.id
      WHERE COALESCE(r.agent_id, 1) = ?
    `;
    const params = [agentId, agentId, agentId];

    if (isDeliveryBoy) {
      query += ` AND r.delivery_boy_id = ? AND r.status = 'ACTIVE'`;
      params.push(req.user.id);
    }

    query += ` ORDER BY r.name ASC, r.id ASC`;

    const routes = await db.prepare(query).all(...params);

    // Attach zones summary to each route
    const enriched = await Promise.all((routes || []).map(async (r) => {
      const zones = await db.prepare(`
        SELECT z.id, z.name, z.address, z.route_order,
               (SELECT COUNT(*) FROM customers c WHERE c.zone_id = z.id AND c.status = 'ACTIVE' AND COALESCE(c.agent_id, 1) = ?) as customer_count
        FROM zones z
        WHERE z.route_id = ? AND COALESCE(z.agent_id, 1) = ?
        ORDER BY z.route_order ASC, z.name ASC
      `).all(agentId, r.id, agentId);

      return {
        ...r,
        zone_count: zones.length,
        zones: zones || []
      };
    }));

    res.json(enriched);
  } catch (err) {
    console.error('Fetch routes error:', err);
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
});

// Get single route details
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const agentId = req.agentId || 1;

    // Authorization check for Delivery Boy
    if (req.user.role === 'DELIVERY_BOY') {
      const authorized = await isRouteAuthorized(routeId, req.user, agentId);
      if (!authorized) {
        return res.status(403).json({ error: 'You are not authorized to view this route.' });
      }
    }

    const route = await db.prepare(`
      SELECT r.*,
             u.name as delivery_boy_name,
             u.phone as delivery_boy_phone,
             u.username as delivery_boy_username
      FROM routes r
      LEFT JOIN users u ON r.delivery_boy_id = u.id
      WHERE r.id = ? AND COALESCE(r.agent_id, 1) = ?
    `).get(routeId, agentId);

    if (!route) {
      return res.status(404).json({ error: 'Route not found.' });
    }

    // Zones belonging to this route with customer lists
    const zones = await db.prepare(`
      SELECT z.id, z.name, z.address, z.route_order, z.image_url,
             (SELECT COUNT(*) FROM customers c WHERE c.zone_id = z.id AND c.status = 'ACTIVE' AND COALESCE(c.agent_id, 1) = ?) as customer_count
      FROM zones z
      WHERE z.route_id = ? AND COALESCE(z.agent_id, 1) = ?
      ORDER BY z.route_order ASC, z.name ASC
    `).all(agentId, routeId, agentId);

    // Available zones (unassigned or assigned to other routes) for Admin management
    let availableZones = [];
    if (req.user.role === 'ADMIN') {
      availableZones = await db.prepare(`
        SELECT z.id, z.name, z.address, z.route_order, z.route_id,
               r.name as current_route_name,
               (SELECT COUNT(*) FROM customers c WHERE c.zone_id = z.id AND c.status = 'ACTIVE' AND COALESCE(c.agent_id, 1) = ?) as customer_count
        FROM zones z
        LEFT JOIN routes r ON z.route_id = r.id
        WHERE (z.route_id IS NULL OR z.route_id != ?) AND COALESCE(z.agent_id, 1) = ?
        ORDER BY z.name ASC
      `).all(agentId, routeId, agentId);
    }

    res.json({
      route,
      zones: zones || [],
      availableZones: availableZones || []
    });
  } catch (err) {
    console.error('Fetch route details error:', err);
    res.status(500).json({ error: 'Failed to fetch route details' });
  }
});

// Create new route (Admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, description, delivery_boy_id, status } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Route name is required' });
    }

    const agentId = req.agentId || 1;
    const cleanName = name.trim();
    const cleanDesc = description ? description.trim() : null;
    const cleanStatus = status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const cleanDboyId = delivery_boy_id ? parseInt(delivery_boy_id, 10) || null : null;

    // Check duplicate route name in this parlour
    const existing = await db.prepare(`
      SELECT id FROM routes WHERE LOWER(name) = LOWER(?) AND COALESCE(agent_id, 1) = ?
    `).get(cleanName, agentId);

    if (existing) {
      return res.status(400).json({ error: `A route named "${cleanName}" already exists.` });
    }

    const result = await db.prepare(`
      INSERT INTO routes (name, description, delivery_boy_id, status, agent_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
    `).run(cleanName, cleanDesc, cleanDboyId, cleanStatus, agentId);

    const created = await db.prepare('SELECT * FROM routes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    console.error('Create route error:', err);
    res.status(500).json({ error: err.message || 'Failed to create route' });
  }
});

// Update route (Admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const agentId = req.agentId || 1;

    const existing = await db.prepare('SELECT * FROM routes WHERE id = ? AND COALESCE(agent_id, 1) = ?').get(routeId, agentId);
    if (!existing) {
      return res.status(404).json({ error: 'Route not found' });
    }

    const { name, description, delivery_boy_id, status } = req.body;
    const newName = name !== undefined ? name.trim() : existing.name;
    const newDesc = description !== undefined ? (description ? description.trim() : null) : existing.description;
    const newStatus = status !== undefined ? (status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE') : existing.status;
    const newDboyId = delivery_boy_id !== undefined ? (delivery_boy_id ? parseInt(delivery_boy_id, 10) || null : null) : existing.delivery_boy_id;

    if (!newName) {
      return res.status(400).json({ error: 'Route name cannot be empty' });
    }

    // Check name uniqueness if changed
    if (newName.toLowerCase() !== existing.name.toLowerCase()) {
      const dup = await db.prepare('SELECT id FROM routes WHERE LOWER(name) = LOWER(?) AND id != ? AND COALESCE(agent_id, 1) = ?').get(newName, routeId, agentId);
      if (dup) {
        return res.status(400).json({ error: `Another route is already named "${newName}".` });
      }
    }

    await db.prepare(`
      UPDATE routes
      SET name = ?, description = ?, delivery_boy_id = ?, status = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ? AND COALESCE(agent_id, 1) = ?
    `).run(newName, newDesc, newDboyId, newStatus, routeId, agentId);

    // If delivery boy changed, synchronize customers and future pending deliveries in this route's zones
    if (delivery_boy_id !== undefined && newDboyId !== existing.delivery_boy_id) {
      try {
        // Sync customers
        await db.prepare(`
          UPDATE customers
          SET delivery_boy_id = ?, updated_at = datetime('now', 'localtime')
          WHERE zone_id IN (SELECT id FROM zones WHERE route_id = ?) AND COALESCE(agent_id, 1) = ?
        `).run(newDboyId, routeId, agentId);

        // Sync future/pending deliveries
        await db.prepare(`
          UPDATE deliveries
          SET delivery_boy_id = ?, updated_at = datetime('now', 'localtime')
          WHERE customer_id IN (
            SELECT c.id FROM customers c
            JOIN zones z ON c.zone_id = z.id
            WHERE z.route_id = ?
          ) AND status = 'PENDING' AND delivery_date >= date('now', 'localtime')
        `).run(newDboyId, routeId);
      } catch (syncErr) {
        console.warn('Sync delivery boy to route customers note:', syncErr.message);
      }
    }

    // If route name changed, sync customers.route
    if (newName !== existing.name) {
      try {
        await db.prepare(`
          UPDATE customers
          SET route = ?, updated_at = datetime('now', 'localtime')
          WHERE zone_id IN (SELECT id FROM zones WHERE route_id = ?) AND COALESCE(agent_id, 1) = ?
        `).run(newName, routeId, agentId);
      } catch (nameSyncErr) {
        console.warn('Sync route name to customers note:', nameSyncErr.message);
      }
    }

    const updated = await db.prepare(`
      SELECT r.*,
             u.name as delivery_boy_name,
             u.phone as delivery_boy_phone,
             u.username as delivery_boy_username
      FROM routes r
      LEFT JOIN users u ON r.delivery_boy_id = u.id
      WHERE r.id = ?
    `).get(routeId);

    res.json(updated);
  } catch (err) {
    console.error('Update route error:', err);
    res.status(500).json({ error: err.message || 'Failed to update route' });
  }
});

// Add one or multiple zones to route (Admin only)
router.post('/:id/zones', requireAdmin, async (req, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const agentId = req.agentId || 1;
    const { zone_ids, zone_id, force } = req.body;

    const route = await db.prepare('SELECT * FROM routes WHERE id = ? AND COALESCE(agent_id, 1) = ?').get(routeId, agentId);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    let targetZoneIds = [];
    if (Array.isArray(zone_ids)) {
      targetZoneIds = zone_ids.map(id => parseInt(id, 10)).filter(Boolean);
    } else if (zone_id) {
      targetZoneIds = [parseInt(zone_id, 10)];
    }

    if (targetZoneIds.length === 0) {
      return res.status(400).json({ error: 'Please specify at least one zone to add.' });
    }

    // Check if any zone belongs to another active route
    const conflictingZones = [];
    for (const zid of targetZoneIds) {
      const z = await db.prepare(`
        SELECT z.id, z.name, z.route_id, r.name as current_route_name
        FROM zones z
        LEFT JOIN routes r ON z.route_id = r.id
        WHERE z.id = ? AND COALESCE(z.agent_id, 1) = ?
      `).get(zid, agentId);

      if (z && z.route_id && z.route_id !== routeId) {
        conflictingZones.push({
          id: z.id,
          name: z.name,
          currentRoute: z.current_route_name || `Route #${z.route_id}`
        });
      }
    }

    // If conflict and not forced, inform Admin explicitly (Requirement 5)
    if (conflictingZones.length > 0 && !force) {
      const conflictNames = conflictingZones.map(c => `"${c.name}" (assigned to ${c.currentRoute})`).join(', ');
      return res.status(409).json({
        conflict: true,
        conflictingZones,
        error: `Cannot add: ${conflictNames}. A zone can belong to at most one active route. Please confirm reassignment.`
      });
    }

    // Assign zones to this route
    for (const zid of targetZoneIds) {
      await db.prepare(`
        UPDATE zones
        SET route_id = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ? AND COALESCE(agent_id, 1) = ?
      `).run(routeId, zid, agentId);

      // Automatically update customer route name and delivery boy
      await db.prepare(`
        UPDATE customers
        SET route = ?,
            delivery_boy_id = COALESCE(?, delivery_boy_id),
            updated_at = datetime('now', 'localtime')
        WHERE zone_id = ? AND COALESCE(agent_id, 1) = ?
      `).run(route.name, route.delivery_boy_id || null, zid, agentId);
    }

    res.json({
      message: `Successfully added ${targetZoneIds.length} zone(s) to "${route.name}".`
    });
  } catch (err) {
    console.error('Add zones to route error:', err);
    res.status(500).json({ error: err.message || 'Failed to add zones to route' });
  }
});

// Remove a zone from route (Admin only)
// Safely unlinks zone (route_id = NULL). Strictly DOES NOT delete zone, customers, subscriptions, or historical deliveries.
router.delete('/:id/zones/:zoneId', requireAdmin, async (req, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const zoneId = parseInt(req.params.zoneId, 10);
    const agentId = req.agentId || 1;

    const zone = await db.prepare('SELECT * FROM zones WHERE id = ? AND route_id = ? AND COALESCE(agent_id, 1) = ?').get(zoneId, routeId, agentId);
    if (!zone) {
      return res.status(404).json({ error: 'Zone is not in this route or not found.' });
    }

    await db.prepare(`
      UPDATE zones
      SET route_id = NULL, updated_at = datetime('now', 'localtime')
      WHERE id = ? AND COALESCE(agent_id, 1) = ?
    `).run(zoneId, agentId);

    res.json({ message: `Zone "${zone.name}" removed from route safely.` });
  } catch (err) {
    console.error('Remove zone from route error:', err);
    res.status(500).json({ error: err.message || 'Failed to remove zone from route' });
  }
});

// Safe Delete / Deactivate Route (Admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const routeId = parseInt(req.params.id, 10);
    const agentId = req.agentId || 1;

    const route = await db.prepare('SELECT * FROM routes WHERE id = ? AND COALESCE(agent_id, 1) = ?').get(routeId, agentId);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    // Safely reset customer route text if assigned to this route or its zones
    await db.prepare(`
      UPDATE customers
      SET route = NULL, updated_at = datetime('now', 'localtime')
      WHERE (route = ? OR zone_id IN (SELECT id FROM zones WHERE route_id = ?)) AND COALESCE(agent_id, 1) = ?
    `).run(route.name, routeId, agentId);

    // Safely unlink all zones belonging to this route
    await db.prepare(`
      UPDATE zones
      SET route_id = NULL, updated_at = datetime('now', 'localtime')
      WHERE route_id = ? AND COALESCE(agent_id, 1) = ?
    `).run(routeId, agentId);

    // Delete record cleanly
    await db.prepare('DELETE FROM routes WHERE id = ? AND COALESCE(agent_id, 1) = ?').run(routeId, agentId);
    res.json({ message: `Route "${route.name}" deleted successfully.` });
  } catch (err) {
    console.error('Delete route error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete route' });
  }
});

module.exports = router;
