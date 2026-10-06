/**
 * Delivery Charge Calculation Service
 * 
 * CRITICAL BUSINESS RULES:
 * 1. Bulk / Hotel / Restaurant customers: Delivery Charge = ₹0 (unless explicitly configured).
 * 2. House customers with Milk rule:
 *    Delivery charge is calculated on the TOTAL QUANTITY (litres) of the SAME PRODUCT delivered to the SAME CUSTOMER on the SAME DAY:
 *    - <= 0.5 L (e.g., 500 ml) = ₹2.00
 *    - > 0.5 L (e.g., 1.0 L, 1.5 L, 2.0 L, 2.5 L, 3.0 L) = Total Litres × ₹3.00
 *    
 *    Examples for the SAME product:
 *    - 1 × 500 ml = 0.5 L -> ₹2.00
 *    - 2 × 500 ml = 1.0 L -> ₹3.00
 *    - 3 × 500 ml = 1.5 L -> ₹4.50
 *    - 4 × 500 ml = 2.0 L -> ₹6.00
 *    - 2 × 1 L    = 2.0 L -> ₹6.00
 *    - 1 × 1 L + 1 × 500 ml = 1.5 L -> ₹4.50
 * 
 * 3. Grouping must be based on actual PRODUCT identity/ID, not simply category.
 *    If two different products have MILK_RULE (e.g., Product A: 500ml and Product B: 500ml),
 *    they are NOT combined into 1.0L. Each product's total volume calculates independently (₹2 + ₹2 = ₹4).
 */

function calculateMilkDeliveryCharge(totalLitres) {
  if (totalLitres <= 0) return 0;
  // Exactly or less than 500ml (0.5L) is ₹2
  if (totalLitres <= 0.5) {
    return 2.0;
  }
  // For > 0.5L (1.0L = ₹3, 1.5L = ₹4.50, 2.0L = ₹6, etc.)
  return parseFloat((totalLitres * 3.0).toFixed(2));
}

/**
 * Calculates delivery charges for a list of delivered items for a single customer on a given day.
 * All Milk products (e.g. Shubham + Toned) delivered to the customer on the same day are combined
 * together under the Milk rule: <= 500ml total is ₹2, 1L is ₹3 (and ₹3/L proportional for > 0.5L).
 * @param {string} customerCategory - 'HOUSE' or 'BULK_HOTEL'
 * @param {Array} items - Array of { productId, productName, category, unitVolumeLitres, variantLabel, quantity, deliveryChargeType, fixedDeliveryCharge }
 * @returns {Array} items with calculated deliveryCharge attached to each item
 */
function calculateDeliveryChargesForCustomerDay(customerCategory, items) {
  if (!items || items.length === 0) return [];

  // Bulk / Hotel / Restaurant has ₹0 delivery charge
  if (customerCategory === 'BULK_HOTEL') {
    return items.map(item => ({
      ...item,
      deliveryCharge: 0
    }));
  }

  // Separate milk items and other items
  // An item uses MILK_RULE only if:
  // 1) deliveryChargeType is explicitly 'MILK_RULE'
  // 2) OR if deliveryChargeType is not specified and category is 'Milk'
  // If deliveryChargeType is 'FIXED_PER_UNIT' or 'NONE', it must NEVER use the Milk rule.
  const milkItems = [];
  const otherItems = [];

  for (const item of items) {
    const chargeType = item.deliveryChargeType || item.delivery_charge_type;
    const isMilkCategory = Boolean(item.category && item.category.trim().toLowerCase() === 'milk');

    const isMilkRule = chargeType === 'MILK_RULE' || (!chargeType && isMilkCategory);

    if (isMilkRule) {
      milkItems.push(item);
    } else {
      otherItems.push(item);
    }
  }

  const results = [];

  // Calculate combined Milk delivery charge
  if (milkItems.length > 0) {
    let totalMilkLitres = 0;
    for (const m of milkItems) {
      let vol = m.unitVolumeLitres;
      if (!vol || vol <= 0) {
        if (m.variantLabel && m.variantLabel.toLowerCase().includes('500')) vol = 0.5;
        else if (m.variantLabel && m.variantLabel.toLowerCase().includes('1')) vol = 1.0;
        else vol = 1.0;
      }
      totalMilkLitres += vol * m.quantity;
    }

    const totalMilkDeliveryCharge = calculateMilkDeliveryCharge(totalMilkLitres);

    // Distribute group charge across milk items proportionally
    let remainingCharge = totalMilkDeliveryCharge;
    for (let i = 0; i < milkItems.length; i++) {
      const m = milkItems[i];
      let vol = m.unitVolumeLitres;
      if (!vol || vol <= 0) {
        if (m.variantLabel && m.variantLabel.toLowerCase().includes('500')) vol = 0.5;
        else if (m.variantLabel && m.variantLabel.toLowerCase().includes('1')) vol = 1.0;
        else vol = 1.0;
      }
      const itemVol = vol * m.quantity;

      let itemCharge = 0;
      if (i === milkItems.length - 1) {
        itemCharge = parseFloat(remainingCharge.toFixed(2));
      } else {
        itemCharge = totalMilkLitres > 0
          ? parseFloat(((itemVol / totalMilkLitres) * totalMilkDeliveryCharge).toFixed(2))
          : 0;
        remainingCharge -= itemCharge;
      }

      results.push({
        ...m,
        deliveryCharge: itemCharge
      });
    }
  }

  // Handle other items (Fixed per unit or None)
  // Per packet/unit: charge = fixedDeliveryCharge * quantity
  for (const item of otherItems) {
    const chargeType = item.deliveryChargeType || item.delivery_charge_type;
    const fixedCharge = item.fixedDeliveryCharge !== undefined
      ? item.fixedDeliveryCharge
      : (item.fixed_delivery_charge !== undefined ? item.fixed_delivery_charge : 0);

    let charge = 0;
    if (chargeType === 'FIXED_PER_UNIT') {
      const perPacket = parseFloat(fixedCharge) || 0;
      const qty = parseFloat(item.quantity) || 0;
      charge = parseFloat((perPacket * qty).toFixed(2));
    } else if (chargeType === 'NONE') {
      charge = 0;
    } else {
      charge = 0;
    }

    results.push({
      ...item,
      deliveryCharge: charge
    });
  }

  return results;
}

function getProductGroupKey(item) {
  if (item.productGroupId) return `grp_${item.productGroupId}`;
  if (item.productId) {
    const name = (item.productName || '').trim();
    const normalizedName = name.replace(/\s*(500\s*ml|1\s*l|2\s*l|500\s*g|1\s*kg|packet|pkt)\b/gi, '').trim().toLowerCase();
    return normalizedName || `prod_${item.productId}`;
  }
  return (item.productName || 'unknown').trim().toLowerCase();
}

module.exports = {
  calculateMilkDeliveryCharge,
  calculateDeliveryChargesForCustomerDay,
  getProductGroupKey
};

