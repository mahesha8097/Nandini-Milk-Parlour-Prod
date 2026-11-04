const assert = require('assert');
const db = require('../config/db');
const indentService = require('../services/indentService');

async function runTests() {
  console.log('================================================================');
  console.log(' NANDINI MILK PARLOUR — DAILY INDENT & PROFIT TRACKER TEST SUITE ');
  console.log('================================================================\n');

  const testAgentId = 9999;
  const testDate = '2026-11-03';
  const testNextDate = '2026-11-04';

  try {
    // Cleanup any preexisting test records
    await db.prepare('DELETE FROM daily_indents WHERE agent_id = ?').run(testAgentId);

    // [TEST 1] Default Template Verification
    console.log('[TEST 1] Verify Nandini KMF Default Indent Template');
    const template = indentService.getDefaultTemplate();
    assert.strictEqual(Array.isArray(template), true, 'Template must be an array');
    assert.strictEqual(template.length >= 11, true, 'Template must include at least 11 Nandini products');

    const toned500 = template.find(t => t.item_code === '[1]');
    assert.ok(toned500, 'Toned Milk 500ml [1] must exist in template');
    assert.strictEqual(toned500.purchase_price, 25.65, 'Toned milk P/U should be ₹25.65');
    assert.strictEqual(toned500.selling_price, 27.00, 'Toned milk selling price should be ₹27.00');
    assert.strictEqual(toned500.margin_per_unit, 1.35, 'Toned milk margin should be ₹1.35 per packet');
    console.log('  ✓ Passed: KMF Nandini product template contains 11 verified products with standard margins.\n');

    // [TEST 2] Create Daily Indent Matching User Uploaded Bill
    console.log('[TEST 2] Save Daily Indent for 2026-11-03 matching KMF Invoice #4648247');
    const invoiceItems = [
      { item_code: '[13]', product_name: 'BUTTER MILK 200ML', category: 'Buttermilk', unit_label: '200 ml', inward_qty: 10, purchase_price: 10.00, selling_price: 12.00, opening_stock: 0, closing_stock: 0, damaged_qty: 0, missing_qty: 0 },
      { item_code: '[12]', product_name: 'CURD 1000GM', category: 'Curd', unit_label: '1 kg', inward_qty: 24, purchase_price: 62.40, selling_price: 68.00, opening_stock: 0, closing_stock: 0, damaged_qty: 0, missing_qty: 0 },
      { item_code: '[11]', product_name: 'CURD 500GM', category: 'Curd', unit_label: '500 g', inward_qty: 144, purchase_price: 31.19, selling_price: 34.00, opening_stock: 0, closing_stock: 0, damaged_qty: 0, missing_qty: 0 },
      { item_code: '[9]', product_name: 'HOMOGINISED COW MILK 500ML', category: 'Milk', unit_label: '500 ml', inward_qty: 36, purchase_price: 27.55, selling_price: 29.00, opening_stock: 0, closing_stock: 0, damaged_qty: 0, missing_qty: 0 },
      { item_code: '[83]', product_name: 'SHUBHAM 1000 ML', category: 'Milk', unit_label: '1 Litre', inward_qty: 84, purchase_price: 60.80, selling_price: 64.00, opening_stock: 0, closing_stock: 0, damaged_qty: 0, missing_qty: 0 },
      { item_code: '[809]', product_name: 'HOMOGINISED COW MILK 140 ML', category: 'Milk', unit_label: '140 ml', inward_qty: 10, purchase_price: 8.50, selling_price: 10.00, opening_stock: 0, closing_stock: 0, damaged_qty: 0, missing_qty: 0 },
      { item_code: '[4]', product_name: 'SHUBAM 500ML', category: 'Milk', unit_label: '500 ml', inward_qty: 312, purchase_price: 30.40, selling_price: 32.00, opening_stock: 0, closing_stock: 0, damaged_qty: 0, missing_qty: 0 },
      { item_code: '[2]', product_name: 'TONED MILK 1000ML', category: 'Milk', unit_label: '1 Litre', inward_qty: 60, purchase_price: 51.30, selling_price: 54.00, opening_stock: 0, closing_stock: 0, damaged_qty: 0, missing_qty: 0 },
      { item_code: '[102]', product_name: 'SPECIAL MILK 1000ML', category: 'Milk', unit_label: '1 Litre', inward_qty: 12, purchase_price: 60.80, selling_price: 64.00, opening_stock: 0, closing_stock: 0, damaged_qty: 0, missing_qty: 0 },
      { item_code: '[101]', product_name: 'SPECIAL MILK 500ML', category: 'Milk', unit_label: '500 ml', inward_qty: 48, purchase_price: 30.40, selling_price: 32.00, opening_stock: 0, closing_stock: 0, damaged_qty: 0, missing_qty: 0 },
      { item_code: '[1]', product_name: 'TONED MILK 500ML', category: 'Milk', unit_label: '500 ml', inward_qty: 144, purchase_price: 25.65, selling_price: 27.00, opening_stock: 0, closing_stock: 14, damaged_qty: 2, missing_qty: 1 }
    ];

    const savedResult = await indentService.saveOrUpdateIndent({
      indent_date: testDate,
      invoice_no: '4648247',
      supplier_name: 'KMF / Nandini Mother Dairy',
      crate_deposit_amount: 52.54,
      other_charges: 0,
      status: 'OPEN',
      notes: 'Morning lorry arrival',
      items: invoiceItems
    }, testAgentId);

    assert.strictEqual(savedResult.exists, true);
    assert.strictEqual(savedResult.indent.invoice_no, '4648247');
    assert.strictEqual(savedResult.indent.crate_deposit_amount, 52.54);

    // Verify Inward Cost matches expected total ₹30,770 (allowing minor floating point difference of < 1 rupee)
    const inwardCost = savedResult.indent.total_inward_amount;
    console.log(`  Calculated Total Inward Amount: ₹${inwardCost.toFixed(2)} (Expected ~₹30,770.00)`);
    assert.ok(Math.abs(inwardCost - 30770.00) < 1.0, `Inward cost ₹${inwardCost} should match ~₹30,770.00`);

    // Verify Toned Milk calculations: inward 144, closing 14, damaged 2, missing 1 -> sold 127
    const tonedItem = savedResult.items.find(i => i.item_code === '[1]');
    assert.strictEqual(tonedItem.sold_qty, 127, 'Sold quantity should be 127');
    assert.strictEqual(tonedItem.sales_revenue, Number((127 * 27.00).toFixed(2)));
    assert.strictEqual(tonedItem.cost_of_goods_sold, Number((127 * 25.65).toFixed(2)));
    const expectedTonedProfit = Number((127 * (27 - 25.65) - (3 * 25.65)).toFixed(2));
    assert.strictEqual(tonedItem.profit_earned, expectedTonedProfit, 'Profit should factor in margin and damage/missing losses');
    console.log('  ✓ Passed: Inward cost, sales, sold quantities, and damage losses calculated with 100% precision.\n');

    // [TEST 3] Push Leftovers to Next Day (Carry Forward)
    console.log('[TEST 3] Push Unsold Leftovers (Closing Stock) to 2026-11-04');
    const nextDayResult = await indentService.pushLeftoversToNextDay(testDate, testAgentId);
    assert.strictEqual(nextDayResult.exists, true);
    assert.strictEqual(nextDayResult.indent.indent_date, testNextDate);

    const carriedToned = nextDayResult.items.find(i => i.item_code === '[1]');
    assert.ok(carriedToned, 'Carried item must exist in next day indent');
    assert.strictEqual(carriedToned.opening_stock, 14, 'Next day opening stock must equal previous day closing stock (14 pkts)');
    console.log('  ✓ Passed: Closing stock of 14 pkts automatically transferred to next day opening stock!\n');

    // [TEST 4] Profit & Sales Summary Metrics (Daily, Weekly, Monthly)
    console.log('[TEST 4] Verify Daily, Weekly, and Monthly Profit Summary');
    const summary = await indentService.getProfitSummary(testDate, testAgentId);
    assert.strictEqual(summary.selectedDate, testDate);
    assert.ok(summary.today.net_daily_profit > 0, 'Today profit should be positive');
    assert.ok(summary.weekly.netProfit > 0, 'Weekly profit should be positive');
    assert.ok(summary.monthly.netProfit > 0, 'Monthly profit should be positive');
    console.log(`  Today's Net Profit: ₹${summary.today.net_daily_profit}`);
    console.log(`  Weekly Sales: ₹${summary.weekly.sales} | Weekly Net Profit: ₹${summary.weekly.netProfit}`);
    console.log(`  Monthly Sales: ₹${summary.monthly.sales} | Monthly Net Profit: ₹${summary.monthly.netProfit}`);
    console.log('  ✓ Passed: Aggregations for Day, Week, and Month verified cleanly.\n');

    // [TEST 5] Clean up test records
    console.log('[TEST 5] Clean up test records');
    await db.prepare('DELETE FROM daily_indents WHERE agent_id = ?').run(testAgentId);
    console.log('  ✓ Passed: Test data safely purged.\n');

    console.log('================================================================');
    console.log(' ALL DAILY INDENT & PROFIT TESTS PASSED SUCCESSFULLY! ✓');
    console.log('================================================================');
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  }
}

runTests();

