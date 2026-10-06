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
 * Normalizes product key for grouping variants of the same product.
 * If base_product_name is given, or if product name has variant suffixes removed.
 */
function getProductGroupKey(item) {
  if (item.productGroupId) return `grp_${item.productGroupId}`;
  if (item.productId) {
    // If explicit product ID is provided without variant grouping, group by product name root or ID
    // Normalize e.g. "Toned Milk 1L" / "Toned Milk 500ml" to "Toned Milk" if same base product
    const name = (item.productName || '').trim();
    const normalizedName = name.replace(/\s*(500\s*ml|1\s*l|2\s*l|500\s*g|1\s*kg|packet|pkt)\b/gi, '').trim().toLowerCase();
    return normalizedName || `prod_${item.productId}`;
  }
  return (item.productName || 'unknown').trim().toLowerCase();
}

/**
 * Calculates delivery charges for a list of delivered items for a single customer on a given day.
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

  // Separate items by delivery charge rule
  // MILK_RULE items are grouped by PRODUCT IDENTITY
  const milkRuleGroups = new Map();
  const otherItems = [];

  for (const item of items) {
    const isMilkRule = item.deliveryChargeType === 'MILK_RULE' || (!item.deliveryChargeType && item.category === 'Milk');
    if (isMilkRule) {
      const groupKey = getProductGroupKey(item);
      if (!milkRuleGroups.has(groupKey)) {
        milkRuleGroups.set(groupKey, []);
      }
      milkRuleGroups.get(groupKey).push(item);
    } else {
      otherItems.push(item);
    }
  }

  const results = [];

  // Calculate each Milk product group independently
  for (const [, groupItems] of milkRuleGroups) {
    let groupTotalLitres = 0;
    for (const m of groupItems) {
      let vol = m.unitVolumeLitres;
      if (!vol || vol <= 0) {
        if (m.variantLabel && m.variantLabel.toLowerCase().includes('500')) vol = 0.5;
        else if (m.variantLabel && m.variantLabel.toLowerCase().includes('1')) vol = 1.0;
        else vol = 1.0;
      }
      groupTotalLitres += vol * m.quantity;
    }

    const groupDeliveryCharge = calculateMilkDeliveryCharge(groupTotalLitres);

    // Distribute group charge across items in the group proportionally
    let remainingCharge = groupDeliveryCharge;
    for (let i = 0; i < groupItems.length; i++) {
      const m = groupItems[i];
      let vol = m.unitVolumeLitres;
      if (!vol || vol <= 0) {
        if (m.variantLabel && m.variantLabel.toLowerCase().includes('500')) vol = 0.5;
        else if (m.variantLabel && m.variantLabel.toLowerCase().includes('1')) vol = 1.0;
        else vol = 1.0;
      }
      const itemVol = vol * m.quantity;

      let itemCharge = 0;
      if (i === groupItems.length - 1) {
        itemCharge = parseFloat(remainingCharge.toFixed(2));
      } else {
        itemCharge = parseFloat(((itemVol / groupTotalLitres) * groupDeliveryCharge).toFixed(2));
        remainingCharge -= itemCharge;
      }

      results.push({
        ...m,
        deliveryCharge: itemCharge
      });
    }
  }

  // Handle other items (Fixed per unit or None)
  for (const item of otherItems) {
    let charge = 0;
    if (item.deliveryChargeType === 'FIXED_PER_UNIT') {
      charge = parseFloat(((item.fixedDeliveryCharge || 0) * item.quantity).toFixed(2));
    } else if (item.deliveryChargeType === 'NONE') {
      charge = 0;
    }
    results.push({
      ...item,
      deliveryCharge: charge
    });
  }

  return results;
}

module.exports = {
  calculateMilkDeliveryCharge,
  calculateDeliveryChargesForCustomerDay,
  getProductGroupKey
};

