const ExcelJS = require('exceljs');
const path = require('path');
require('dotenv').config();
const { Pool } = require('pg');

async function importCustomers(filePath = null) {
  const excelPath = filePath || path.join(__dirname, '..', 'Nandini_Customers_Bulk_Import_Template.xlsx');
  console.log(`\n======================================================`);
  console.log(` Reading Excel Customer Import: ${excelPath}`);
  console.log(`======================================================\n`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);

  const ws = workbook.getWorksheet('Customers_Data_Entry') || workbook.worksheets[0];
  if (!ws) {
    throw new Error('Could not find sheet Customers_Data_Entry');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  const client = await pool.connect();

  try {
    // 1. Load active Master Zones & Products
    const zRes = await client.query(`
      SELECT z.*, r.name as route_name, r.delivery_boy_id as route_dboy_id 
      FROM zones z 
      LEFT JOIN routes r ON z.route_id = r.id
    `);
    const pRes = await client.query('SELECT * FROM products');
    const dbZones = zRes.rows;
    const dbProducts = pRes.rows;

    const zoneMap = new Map();
    dbZones.forEach(z => zoneMap.set(z.name.toLowerCase().trim(), z));

    const productMap = new Map();
    dbProducts.forEach(p => productMap.set(p.name.toLowerCase().trim(), p));

    // 2. Parse Rows
    const customersToProcess = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber < 5) return; // skip header & guidance rows

      const name = row.getCell(2).text?.trim();
      const phone = row.getCell(3).text?.trim();
      if (!name || !phone) return;

      const seq = parseInt(row.getCell(1).value, 10) || 0;
      const zoneName = row.getCell(4).text?.trim() || '';
      const flatNo = row.getCell(5).text?.trim() || '';
      const address = row.getCell(6).text?.trim() || `${flatNo} ${zoneName}`.trim();
      const category = (row.getCell(7).text?.trim() || 'HOUSE').toUpperCase();
      const billingType = (row.getCell(8).text?.trim() || 'MONTHLY_POSTPAID').toUpperCase();
      const advance = parseFloat(row.getCell(9).value) || 0;
      const prod1Name = row.getCell(10).text?.trim();
      const qty1 = parseInt(row.getCell(11).value, 10) || 0;
      const prod2Name = row.getCell(12).text?.trim();
      const qty2 = parseInt(row.getCell(13).value, 10) || 0;
      const startDate = row.getCell(14).text?.trim() || '2026-11-01';
      const notes = row.getCell(15).text?.trim() || '';

      const matchedZone = zoneName ? zoneMap.get(zoneName.toLowerCase().trim()) : null;
      const prod1 = prod1Name ? productMap.get(prod1Name.toLowerCase().trim()) : null;
      const prod2 = prod2Name ? productMap.get(prod2Name.toLowerCase().trim()) : null;

      customersToProcess.push({
        rowNumber,
        seq,
        name,
        phone,
        zoneName,
        zoneId: matchedZone?.id || null,
        routeName: matchedZone?.route_name || '',
        dboyId: matchedZone?.route_dboy_id || null,
        flatNo,
        address,
        category: category === 'BULK_HOTEL' ? 'BULK_HOTEL' : 'HOUSE',
        billingType: billingType === 'PREPAID' ? 'PREPAID' : 'MONTHLY_POSTPAID',
        advance,
        prod1,
        qty1,
        prod2,
        qty2,
        startDate,
        notes
      });
    });

    console.log(`Found ${customersToProcess.length} valid customer rows to insert into database.\n`);

    let insertedCount = 0;
    let skippedCount = 0;

    for (const item of customersToProcess) {
      // Check if phone number already exists
      const existing = await client.query('SELECT id, name FROM customers WHERE phone = $1', [item.phone]);
      if (existing.rows.length > 0) {
        console.log(`[SKIP] Row ${item.rowNumber}: Customer with phone ${item.phone} already exists (${existing.rows[0].name}). Skipping.`);
        skippedCount++;
        continue;
      }

      // Insert customer
      const custRes = await client.query(`
        INSERT INTO customers (
          serial_no, name, phone, address, flat_no, zone_id, customer_category,
          billing_type, delivery_boy_id, route, status, notes,
          advance_balance, pending_balance, agent_id,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE', $11, $12, 0.0, 1,
          TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
          TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
        ) RETURNING id;
      `, [
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
      ]);

      const customerId = custRes.rows[0].id;

      // If customer has initial advance balance, record in ledger
      if (item.advance > 0) {
        await client.query(`
          INSERT INTO customer_ledger (
            customer_id, transaction_type, amount, balance_after,
            description, agent_id, created_at
          ) VALUES (
            $1, 'ADVANCE_DEPOSIT', $2, $2,
            'Initial Opening Advance Balance from Bulk Onboarding', 1,
            TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
          );
        `, [customerId, item.advance]);
      }

      // Insert Subscription 1
      if (item.prod1 && item.qty1 > 0) {
        await client.query(`
          INSERT INTO subscriptions (
            customer_id, product_id, quantity, start_date, is_active,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, 1,
            TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
            TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
          );
        `, [customerId, item.prod1.id, item.qty1, item.startDate]);
      }

      // Insert Subscription 2
      if (item.prod2 && item.qty2 > 0) {
        await client.query(`
          INSERT INTO subscriptions (
            customer_id, product_id, quantity, start_date, is_active,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, 1,
            TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS'),
            TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS')
          );
        `, [customerId, item.prod2.id, item.qty2, item.startDate]);
      }

      console.log(`[OK] Row ${item.rowNumber}: Added "${item.name}" (ID #${customerId}) to Zone "${item.zoneName}" [Route: ${item.routeName || 'None'}]`);
      insertedCount++;
    }

    console.log(`\n======================================================`);
    console.log(` IMPORT COMPLETED: ${insertedCount} added, ${skippedCount} skipped.`);
    console.log(`======================================================\n`);
    return { insertedCount, skippedCount };
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  const customFile = process.argv[2] || null;
  importCustomers(customFile).catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
  });
}

module.exports = { importCustomers };
