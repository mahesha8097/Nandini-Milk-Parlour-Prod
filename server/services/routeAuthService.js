const db = require('../config/db');

/**
 * Route-Zone-Customer authorization helper for Delivery Boys & Admins
 */

/**
 * Gets all active route IDs assigned to a specific delivery boy.
 * @param {number} deliveryBoyId 
 * @param {number} agentId 
 * @returns {Promise<number[]>}
 */
async function getDeliveryBoyAssignedRouteIds(deliveryBoyId, agentId = 1) {
  if (!deliveryBoyId) return [];
  const rows = await db.prepare(`
    SELECT id FROM routes 
    WHERE delivery_boy_id = ? AND status = 'ACTIVE' AND COALESCE(agent_id, 1) = ?
  `).all(deliveryBoyId, agentId);
  return (rows || []).map(r => r.id);
}

/**
 * Gets all zone IDs belonging to routes assigned to a specific delivery boy.
 * @param {number} deliveryBoyId 
 * @param {number} agentId 
 * @returns {Promise<number[]>}
 */
async function getDeliveryBoyAuthorizedZoneIds(deliveryBoyId, agentId = 1) {
  const routeIds = await getDeliveryBoyAssignedRouteIds(deliveryBoyId, agentId);
  if (routeIds.length === 0) return [];

  const placeholders = routeIds.map(() => '?').join(', ');
  const rows = await db.prepare(`
    SELECT id FROM zones 
    WHERE route_id IN (${placeholders}) AND COALESCE(agent_id, 1) = ?
  `).all(...routeIds, agentId);

  return (rows || []).map(r => r.id);
}

/**
 * Verifies if a user is authorized to view or manage a customer.
 * - Admin: always authorized.
 * - Delivery Boy: must have customer in an assigned route's zone, or legacy direct assignment.
 * @param {number} customerId 
 * @param {object} user 
 * @param {number} agentId 
 * @returns {Promise<boolean>}
 */
async function isCustomerAuthorized(customerId, user, agentId = 1) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'DELIVERY_BOY') return false;

  const cust = await db.prepare(`
    SELECT c.id, c.zone_id, c.delivery_boy_id,
           z.route_id, r.delivery_boy_id as route_delivery_boy_id, r.status as route_status
    FROM customers c
    LEFT JOIN zones z ON c.zone_id = z.id
    LEFT JOIN routes r ON z.route_id = r.id
    WHERE c.id = ? AND COALESCE(c.agent_id, 1) = ?
  `).get(customerId, agentId);

  if (!cust) return false;

  // 1. Authorized via Route -> Zone -> Customer hierarchy
  if (cust.route_delivery_boy_id === user.id && cust.route_status === 'ACTIVE') {
    return true;
  }

  // 2. Backward compatibility fallback: direct delivery_boy_id assignment on customer
  if (cust.delivery_boy_id === user.id) {
    return true;
  }

  return false;
}

/**
 * Verifies if a user is authorized to view or modify a delivery item.
 * @param {number} deliveryId 
 * @param {object} user 
 * @param {number} agentId 
 * @returns {Promise<boolean>}
 */
async function isDeliveryAuthorized(deliveryId, user, agentId = 1) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'DELIVERY_BOY') return false;

  const del = await db.prepare(`
    SELECT d.id, d.customer_id, d.delivery_boy_id,
           c.zone_id, z.route_id, r.delivery_boy_id as route_delivery_boy_id, r.status as route_status
    FROM deliveries d
    JOIN customers c ON d.customer_id = c.id
    LEFT JOIN zones z ON c.zone_id = z.id
    LEFT JOIN routes r ON z.route_id = r.id
    WHERE d.id = ? AND (d.agent_id = ? OR c.agent_id = ?)
  `).get(deliveryId, agentId, agentId);

  if (!del) return false;

  if (del.route_delivery_boy_id === user.id && del.route_status === 'ACTIVE') {
    return true;
  }
  if (del.delivery_boy_id === user.id) {
    return true;
  }

  return false;
}

/**
 * Verifies if a user is authorized for a specific route.
 * @param {number} routeId 
 * @param {object} user 
 * @param {number} agentId 
 * @returns {Promise<boolean>}
 */
async function isRouteAuthorized(routeId, user, agentId = 1) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'DELIVERY_BOY') return false;

  const route = await db.prepare(`
    SELECT id, delivery_boy_id, status FROM routes
    WHERE id = ? AND COALESCE(agent_id, 1) = ?
  `).get(routeId, agentId);

  if (!route) return false;
  return route.delivery_boy_id === user.id && route.status === 'ACTIVE';
}

module.exports = {
  getDeliveryBoyAssignedRouteIds,
  getDeliveryBoyAuthorizedZoneIds,
  isCustomerAuthorized,
  isDeliveryAuthorized,
  isRouteAuthorized
};
