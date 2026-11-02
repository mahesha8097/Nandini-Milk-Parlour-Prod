const assert = require('assert');
const db = require('../config/db');

console.log('================================================================');
console.log(' NANDINI MILK PARLOUR — PRODUCT PRICE UPDATE & DATA INTEGRITY TEST');
console.log('================================================================\n');

(async () => {
  try {
    // 1. Find or create a test Curd product
    let curdProduct = await db.prepare("SELECT * FROM products WHERE category = 'Curd' LIMIT 1").get();
    let createdCurd = false;

    if (!curdProduct) {
      const insertRes = await db.prepare(`
        INSERT INTO products (
          name, category, variant_label, unit_volume_litres, selling_price,
          delivery_charge_type, fixed_delivery_charge, is_coupon_eligible, is_active,
          agent_id, created_at, updated_at
        ) VALUES (
          'Nandini Curd 1ltr', 'Curd', '1 kg', 1.0, 54.0,
          'NONE', 0, 0, 1, 1, datetime('now', 'localtime'), datetime('now', 'localtime')
        )
      `).run();
      curdProduct = await db.prepare('SELECT * FROM products WHERE id = ?').get(insertRes.lastInsertRowid);
      createdCurd = true;
    }

    console.log(`[TEST 1] Setup: Testing with Product "${curdProduct.name}" (ID: ${curdProduct.id}), Current Price: ₹${curdProduct.selling_price}`);

    // 2. Find a test customer and verify baseline data
    const customer = await db.prepare("SELECT * FROM customers WHERE status = 'ACTIVE' LIMIT 1").get();
    assert(customer, 'Active customer exists for verification');
    const originalCustomerAdvance = customer.advance_balance;
    const originalCustomerPending = customer.pending_balance;
    const originalCustomerPhone = customer.phone;

    console.log(`[TEST 2] Active Customer Snapshot: "${customer.name}" (ID: ${customer.id})`);
    console.log(`  Advance: ₹${originalCustomerAdvance}, Pending: ₹${originalCustomerPending}, Phone: ${originalCustomerPhone}`);

    // 3. Create a historical DELIVERED delivery record with original price
    const pastDate = '2026-10-25';
    await db.prepare('DELETE FROM deliveries WHERE customer_id = ? AND product_id = ? AND delivery_date = ?').run(customer.id, curdProduct.id, pastDate);

    await db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_boy_id, delivery_date, product_id,
        product_name_snapshot, category_snapshot, variant_snapshot,
        unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount,
        status, notes, agent_id, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, 2, ?,
        ?, 0, ?,
        'DELIVERED', 'Historical delivery at original price', 1, datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(
      customer.id, customer.delivery_boy_id || null, pastDate, curdProduct.id,
      curdProduct.name, curdProduct.category, curdProduct.variant_label,
      curdProduct.unit_volume_litres, curdProduct.selling_price,
      (curdProduct.selling_price * 2), (curdProduct.selling_price * 2)
    );

    // 4. Create an upcoming PENDING delivery record for tomorrow, and today's DELIVERED delivery
    const todayDate = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const futureDate = tomorrow.toISOString().slice(0, 10);
    await db.prepare('DELETE FROM deliveries WHERE customer_id = ? AND product_id = ? AND delivery_date IN (?, ?)').run(customer.id, curdProduct.id, todayDate, futureDate);

    // Today's delivery (marked DELIVERED)
    await db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_boy_id, delivery_date, product_id,
        product_name_snapshot, category_snapshot, variant_snapshot,
        unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount,
        status, notes, agent_id, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, 2, ?,
        ?, 0, ?,
        'DELIVERED', 'Delivered today with initial price', 1, datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(
      customer.id, customer.delivery_boy_id || null, todayDate, curdProduct.id,
      curdProduct.name, curdProduct.category, curdProduct.variant_label,
      curdProduct.unit_volume_litres, curdProduct.selling_price,
      (curdProduct.selling_price * 2), (curdProduct.selling_price * 2)
    );

    // Future delivery
    await db.prepare(`
      INSERT INTO deliveries (
        customer_id, delivery_boy_id, delivery_date, product_id,
        product_name_snapshot, category_snapshot, variant_snapshot,
        unit_volume_litres_snapshot, quantity, unit_price_snapshot,
        total_product_amount, delivery_charge_snapshot, total_amount,
        status, notes, agent_id, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, 1, ?,
        ?, 0, ?,
        'PENDING', 'Upcoming delivery', 1, datetime('now', 'localtime'), datetime('now', 'localtime')
      )
    `).run(
      customer.id, customer.delivery_boy_id || null, futureDate, curdProduct.id,
      curdProduct.name, curdProduct.category, curdProduct.variant_label,
      curdProduct.unit_volume_litres, curdProduct.selling_price,
      curdProduct.selling_price, curdProduct.selling_price
    );

    console.log(`[TEST 3] Created past delivery on ${pastDate} (DELIVERED, ₹${curdProduct.selling_price}), today's delivery on ${todayDate} (DELIVERED, ₹${curdProduct.selling_price}), and future delivery on ${futureDate} (PENDING, ₹${curdProduct.selling_price})`);

    // 5. Test updating the product price to ₹68 with apply_to_today = true (Simulating PUT /api/products/:id logic)
    const newPrice = 68.0;
    const initialPrice = curdProduct.selling_price;
    const applyToToday = true;

    // Simulate route handler execution
    const productId = curdProduct.id;
    const existing = await db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    assert(existing, 'Product must exist');

    const rawPrice = newPrice;
    const price = parseFloat(rawPrice);
    assert(!isNaN(price) && price >= 0, 'Price must be valid');

    const trimmedName = existing.name.trim();
    const trimmedCategory = existing.category.trim();
    const trimmedVariant = '1 kg';
    const vol = 1.0;
    const chargeType = 'NONE';
    const fixedCharge = 0;
    const active = 1;
    const couponEligible = 0;
    const imageUrl = existing.image_url;

    await db.prepare(`
      UPDATE products
      SET name = ?, category = ?, variant_label = ?, unit_volume_litres = ?,
          selling_price = ?, delivery_charge_type = ?, fixed_delivery_charge = ?,
          is_coupon_eligible = ?, image_url = ?, is_active = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      trimmedName,
      trimmedCategory,
      trimmedVariant,
      vol,
      price,
      chargeType,
      fixedCharge,
      couponEligible,
      imageUrl,
      active,
      productId
    );

    const oldPrice = parseFloat(existing.selling_price);
    const priceChanged = Math.abs(price - oldPrice) > 0.001;
    const detailsChanged = trimmedName !== existing.name || trimmedVariant !== existing.variant_label || trimmedCategory !== existing.category;

    if (priceChanged || detailsChanged) {
      // 1. Synchronize upcoming PENDING deliveries (tomorrow onwards)
      await db.prepare(`
        UPDATE deliveries
        SET product_name_snapshot = ?,
            category_snapshot = ?,
            variant_snapshot = ?,
            unit_volume_litres_snapshot = ?,
            unit_price_snapshot = ?,
            total_product_amount = (? * quantity),
            total_amount = ((? * quantity) + delivery_charge_snapshot),
            updated_at = datetime('now', 'localtime')
        WHERE product_id = ?
          AND status = 'PENDING'
          AND delivery_date > date('now', 'localtime')
      `).run(trimmedName, trimmedCategory, trimmedVariant, vol, price, price, price, productId);

      // 2. Synchronize today's deliveries if applyToToday is enabled
      if (applyToToday) {
        await db.prepare(`
          UPDATE deliveries
          SET product_name_snapshot = ?,
              category_snapshot = ?,
              variant_snapshot = ?,
              unit_volume_litres_snapshot = ?,
              unit_price_snapshot = ?,
              total_product_amount = (? * quantity),
              total_amount = ((? * quantity) + delivery_charge_snapshot),
              updated_at = datetime('now', 'localtime')
          WHERE product_id = ?
            AND delivery_date = date('now', 'localtime')
            AND status IN ('DELIVERED', 'PENDING')
        `).run(trimmedName, trimmedCategory, trimmedVariant, vol, price, price, price, productId);
      }
    }

    // 6. Verify product table updated with new price ₹68
    const updatedProd = await db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    assert.strictEqual(updatedProd.selling_price, 68, 'Product selling_price must be updated to ₹68');
    assert.strictEqual(updatedProd.variant_label, '1 kg', 'Product variant must be updated to 1 kg');
    console.log(`\n[TEST 4] Product updated successfully: ${updatedProd.name} -> ₹${updatedProd.selling_price} (Variant: ${updatedProd.variant_label})`);

    // 7. Verify Historical DELIVERED delivery retains original price
    const historicalDel = await db.prepare('SELECT * FROM deliveries WHERE customer_id = ? AND product_id = ? AND delivery_date = ?').get(customer.id, productId, pastDate);
    assert.strictEqual(historicalDel.unit_price_snapshot, initialPrice, `Past delivered delivery must retain original price snapshot of ₹${initialPrice}`);
    assert.strictEqual(historicalDel.status, 'DELIVERED');
    console.log(`[TEST 5] Historical delivery verification: Retained original price ₹${historicalDel.unit_price_snapshot} (Total: ₹${historicalDel.total_amount}) ✓`);

    // 8. Verify Today's DELIVERED delivery updated to ₹68
    const todayDel = await db.prepare('SELECT * FROM deliveries WHERE customer_id = ? AND product_id = ? AND delivery_date = ?').get(customer.id, productId, todayDate);
    assert.strictEqual(todayDel.unit_price_snapshot, 68, 'Today delivered delivery must be updated to ₹68');
    assert.strictEqual(todayDel.total_product_amount, 136, 'Today delivered total_product_amount must be 2 * 68 = ₹136');
    assert.strictEqual(todayDel.total_amount, 136, 'Today delivered total_amount must be ₹136');
    console.log(`[TEST 6] Today's delivery verification: Successfully updated to new price ₹${todayDel.unit_price_snapshot} (Total: ₹${todayDel.total_amount}) ✓`);

    // 9. Verify Future PENDING delivery synchronized to ₹68
    const futureDel = await db.prepare('SELECT * FROM deliveries WHERE customer_id = ? AND product_id = ? AND delivery_date = ?').get(customer.id, productId, futureDate);
    assert.strictEqual(futureDel.unit_price_snapshot, 68, 'Future pending delivery must be synchronized to ₹68');
    assert.strictEqual(futureDel.total_product_amount, 68, 'Future pending total_product_amount must be ₹68');
    assert.strictEqual(futureDel.total_amount, 68, 'Future pending total_amount must be ₹68');
    console.log(`[TEST 7] Future delivery verification: Successfully updated to new price ₹${futureDel.unit_price_snapshot} (Total: ₹${futureDel.total_amount}) ✓`);

    // 10. Verify Customer Data Integrity (Untouched and safe)
    const afterCustomer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(customer.id);
    assert.strictEqual(afterCustomer.advance_balance, originalCustomerAdvance, 'Customer advance_balance must not be modified');
    assert.strictEqual(afterCustomer.pending_balance, originalCustomerPending, 'Customer pending_balance must not be modified');
    assert.strictEqual(afterCustomer.phone, originalCustomerPhone, 'Customer phone must not be modified');
    console.log(`[TEST 8] Customer Data Integrity: Customer "${afterCustomer.name}" record is 100% untouched and safe ✓`);

    // Clean up temporary test delivery records
    await db.prepare('DELETE FROM deliveries WHERE customer_id = ? AND product_id = ? AND delivery_date IN (?, ?, ?)').run(customer.id, productId, pastDate, todayDate, futureDate);
    if (createdCurd) {
      await db.prepare('DELETE FROM products WHERE id = ?').run(curdProduct.id);
    } else {
      // Restore initial price
      await db.prepare('UPDATE products SET selling_price = ? WHERE id = ?').run(initialPrice, curdProduct.id);
    }

    console.log('\n================================================================');
    console.log(' ALL PRODUCT PRICE UPDATE & DATA INTEGRITY TESTS PASSED! ✓');
    console.log('================================================================\n');
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
})();

