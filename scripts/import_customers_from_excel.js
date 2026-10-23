const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const db = require('../server/config/db');

async function importCustomers(filePath = null) {
  const excelPath = filePath || path.join(__dirname, '..', 'Nandini_Customers_Bulk_Import_Template.xlsx');
  console.log(`\n======================================================`);
  console.log(` Reading Excel Customer Import: ${excelPath}`);
  console.log(`======================================================\n`);

  if (!fs.existsSync(excelPath)) {
    throw new Error(`Import file not found at: ${excelPath}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);

  // 1. Load active Master Zones & Products from database
  const zones = await db.prepare(`
    SELECT z.*, r.name as route_name, r.delivery_boy_id as route_dboy_id 
    FROM zones z 
    LEFT JOIN routes r ON z.route_id = r.id
    WHERE z.agent_id = 1 OR z.agent_id IS NULL
  `).all();

  const products = await db.prepare(`
    SELECT * FROM products WHERE is_active = 1 OR is_active IS NULL
  `).all();

  const zoneMap = new Map();
  zones.forEach(z => {
    if (z.name) zoneMap.set(z.name.toLowerCase().trim(), z);
  });

  const productMap = new Map();
  products.forEach(p => {
    if (p.name) productMap.set(p.name.toLowerCase().trim(), p);
  });

  // Reference sheets to skip
  const SKIP_SHEETS = ['zones_&_routes_ref', 'nandini_products_list', 'instructions', 'how_to_fill_instructions', 'products_price_list_ref'];

  // Check if Route 1 or Route 2 has data rows. If so, skip All_Customers so we don't process duplicate rows.
  const hasRouteSpecificData = workbook.worksheets.some(w => ['route 1', 'route 2'].includes(w.name.toLowerCase().trim()) && w.rowCount > 1);
  if (hasRouteSpecificData) {
    SKIP_SHEETS.push('all_customers');
  }

  const customersToProcess = [];
  const seenPhonesInBatch = new Set();

  // 2. Iterate through all eligible sheets in workbook
  for (const ws of workbook.worksheets) {
    const sheetNameLower = ws.name.toLowerCase().trim();
    if (SKIP_SHEETS.includes(sheetNameLower)) {
      continue;
    }

    console.log(`Processing worksheet: "${ws.name}" (${ws.rowCount} rows)...`);
    let currentZoneName = '';

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Header row

      // Read Zone (Col A / 1) - If merged, keep last seen zone name
      const rawZone = row.getCell(1).text?.trim();
      if (rawZone) {
        currentZoneName = rawZone;
      }

      // Check Column Positions:
      // Standard Format: Col 1: Zone, 2: Seq, 3: Flat, 4: Name, 5: Phone, 6: Cat, 7: Billing, 8: Addr, 9: Prod1, 10: Qty1, 11: Prod2, 12: Qty2, 13: Adv, 14: Date, 15: Notes
      let name = row.getCell(4).text?.trim();
      let phone = row.getCell(5).text?.trim();
      let flatNo = row.getCell(3).text?.trim() || '';
      let seq = parseInt(row.getCell(2).value, 10) || rowNumber - 1;
      let category = (row.getCell(6).text?.trim() || 'HOUSE').toUpperCase();
      let billingType = (row.getCell(7).text?.trim() || 'MONTHLY_POSTPAID').toUpperCase();
      let address = row.getCell(8).text?.trim() || '';
      let prod1Name = row.getCell(9).text?.trim();
      let qty1 = parseInt(row.getCell(10).value, 10) || 0;
      let prod2Name = row.getCell(11).text?.trim();
      let qty2 = parseInt(row.getCell(12).value, 10) || 0;
      let advance = parseFloat(row.getCell(13).value) || 0;
      let startDate = row.getCell(14).text?.trim() || '2026-11-01';
      let notes = row.getCell(15).text?.trim() || '';

      // Fallback for legacy template layout (where Col 2 was Name, Col 3 was Phone)
      if (!phone && row.getCell(3).text?.trim()?.match(/^\d{7,12}$/)) {
        name = row.getCell(2).text?.trim();
        phone = row.getCell(3).text?.trim();
        currentZoneName = row.getCell(4).text?.trim() || currentZoneName;
        flatNo = row.getCell(5).text?.trim() || '';
        address = row.getCell(6).text?.trim() || address;
        category = (row.getCell(7).text?.trim() || 'HOUSE').toUpperCase();
        billingType = (row.getCell(8).text?.trim() || 'MONTHLY_POSTPAID').toUpperCase();
        advance = parseFloat(row.getCell(9).value) || 0;
        prod1Name = row.getCell(10).text?.trim();
        qty1 = parseInt(row.getCell(11).value, 10) || 0;
        prod2Name = row.getCell(12).text?.trim();
        qty2 = parseInt(row.getCell(13).value, 10) || 0;
        startDate = row.getCell(14).text?.trim() || '2026-11-01';
        notes = row.getCell(15).text?.trim() || '';
      }

      // Ignore empty placeholder rows
      if (!name && !phone) return;
      if (!phone) {
        console.warn(`[WARN] Sheet "${ws.name}" Row ${rowNumber}: Customer "${name}" has no phone number. Skipping.`);
        return;
      }

      // Clean phone number (strip spaces/dashes)
      phone = phone.replace(/[^0-9]/g, '');
      if (phone.length === 12 && phone.startsWith('91')) {
        phone = phone.slice(2);
      }

      if (seenPhonesInBatch.has(phone)) {
        console.warn(`[SKIP] Sheet "${ws.name}" Row ${rowNumber}: Duplicate phone ${phone} in Excel batch. Skipping.`);
        return;
      }
      seenPhonesInBatch.add(phone);

      const matchedZone = currentZoneName ? zoneMap.get(currentZoneName.toLowerCase().trim()) : null;

      // Match products (fuzzy/flexible fallback)
      let prod1 = prod1Name ? productMap.get(prod1Name.toLowerCase().trim()) : null;
      if (!prod1 && prod1Name) {
        const p1Key = prod1Name.toLowerCase();
        prod1 = products.find(p => p.name.toLowerCase().includes(p1Key) || p1Key.includes(p.name.toLowerCase()));
      }

      let prod2 = prod2Name ? productMap.get(prod2Name.toLowerCase().trim()) : null;
      if (!prod2 && prod2Name) {
        const p2Key = prod2Name.toLowerCase();
        prod2 = products.find(p => p.name.toLowerCase().includes(p2Key) || p2Key.includes(p.name.toLowerCase()));
      }

      customersToProcess.push({
        sheetName: ws.name,
        rowNumber,
        seq,
        name: name || `Customer ${phone}`,
        phone,
        zoneName: currentZoneName,
        zoneId: matchedZone?.id || null,
        routeName: matchedZone?.route_name || '',
        dboyId: matchedZone?.route_dboy_id || null,
        flatNo,
        address: address || `${flatNo} ${currentZoneName}`.trim(),
        category: category.includes('BULK') || category.includes('HOTEL') ? 'BULK_HOTEL' : 'HOUSE',
        billingType: billingType.includes('PREPAID') ? 'PREPAID' : 'POSTPAID',
        advance,
        prod1,
        qty1: qty1 > 0 ? qty1 : (prod1 ? 1 : 0),
        prod2,
        qty2,
        startDate: startDate.match(/^\d{4}-\d{2}-\d{2}$/) ? startDate : '2026-11-01',
        notes
      });
    });
  }

  console.log(`\nFound ${customersToProcess.length} valid customer rows across all sheets.\n`);

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const item of customersToProcess) {
    // Check if phone number already exists in DB
    const existing = await db.prepare('SELECT id, name FROM customers WHERE phone = ?').get(item.phone);
    if (existing) {
      console.log(`[UPDATE] ${item.sheetName} Row ${item.rowNumber}: Customer with phone ${item.phone} already exists (${existing.name}). Updating info.`);
      await db.prepare(`
        UPDATE customers SET
          serial_no = COALESCE(?, serial_no),
          name = COALESCE(?, name),
          flat_no = COALESCE(?, flat_no),
          address = COALESCE(?, address),
          zone_id = COALESCE(?, zone_id),
          customer_category = COALESCE(?, customer_category),
          billing_type = COALESCE(?, billing_type),
          route = COALESCE(?, route),
          updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        item.seq,
        item.name,
        item.flatNo || null,
        item.address,
        item.zoneId,
        item.category,
        item.billingType,
        item.routeName || null,
        existing.id
      );
      updatedCount++;
      continue;
    }

    // Insert customer
    const insertCustStmt = db.prepare(`
      INSERT INTO customers (
        serial_no, name, phone, address, flat_no, zone_id, customer_category,
        billing_type, delivery_boy_id, route, status, notes,
        advance_balance, pending_balance, agent_id,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, 'ACTIVE', ?,
        ?, 0.0, 1,
        datetime('now', 'localtime'),
        datetime('now', 'localtime')
      )
    `);

    const insertResult = await insertCustStmt.run(
      item.seq,
      item.name,
      item.phone,
      item.address,
      item.flatNo || null,
      item.zoneId,
      item.category,
      item.billingType,
      item.dboyId,
      item.routeName || null,
      item.notes || null,
      item.advance
    );

    const customerId = insertResult.lastInsertRowid;

    // Record Opening Advance in Ledger if > 0
    if (item.advance > 0) {
      await db.prepare(`
        INSERT INTO customer_ledger (
          customer_id, transaction_type, amount, balance_after,
          description, agent_id, created_at
        ) VALUES (
          ?, 'ADVANCE_DEPOSIT', ?, ?,
          'Initial Opening Advance Balance from Bulk Onboarding', 1,
          datetime('now', 'localtime')
        )
      `).run(customerId, item.advance, item.advance);
    }

    // Insert Subscription 1
    if (item.prod1 && item.qty1 > 0) {
      await db.prepare(`
        INSERT INTO subscriptions (
          customer_id, product_id, quantity, start_date, is_active,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, 1,
          datetime('now', 'localtime'),
          datetime('now', 'localtime')
        )
      `).run(customerId, item.prod1.id, item.qty1, item.startDate);
    }

    // Insert Subscription 2
    if (item.prod2 && item.qty2 > 0) {
      await db.prepare(`
        INSERT INTO subscriptions (
          customer_id, product_id, quantity, start_date, is_active,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, 1,
          datetime('now', 'localtime'),
          datetime('now', 'localtime')
        )
      `).run(customerId, item.prod2.id, item.qty2, item.startDate);
    }

    console.log(`[OK] Added "${item.name}" (ID #${customerId}) in "${item.zoneName || 'No Zone'}" [${item.routeName || 'No Route'}] - Phone: ${item.phone}`);
    insertedCount++;
  }

  console.log(`\n======================================================`);
  console.log(` IMPORT COMPLETED: ${insertedCount} added, ${updatedCount} updated, ${skippedCount} skipped.`);
  console.log(`======================================================\n`);
  return { insertedCount, updatedCount, skippedCount, totalProcessed: customersToProcess.length };
}

if (require.main === module) {
  const customFile = process.argv[2] || null;
  importCustomers(customFile)
    .then((stats) => {
      console.log('Import finished:', stats);
      process.exit(0);
    })
    .catch(err => {
      console.error('Import failed:', err);
      process.exit(1);
    });
}

module.exports = { importCustomers };
