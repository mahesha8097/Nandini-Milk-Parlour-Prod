const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const db = require('../server/config/db');

async function generateCustomerExcel() {
  console.log('Fetching routes, zones, and products from database...');

  // Fetch routes
  let routes = [];
  try {
    routes = await db.prepare('SELECT id, name, description, status FROM routes WHERE agent_id = 1 OR agent_id IS NULL ORDER BY id ASC').all();
  } catch (e) {
    console.warn('Routes fetch note:', e.message);
  }

  // Fetch zones with assigned route
  let zones = [];
  try {
    zones = await db.prepare(`
      SELECT z.id, z.name, z.address, z.route_order, z.route_id, z.agent_id,
             COALESCE(r.name, 'Unassigned') as route_name
      FROM zones z
      LEFT JOIN routes r ON z.route_id = r.id
      WHERE z.agent_id = 1 OR z.agent_id IS NULL
      ORDER BY COALESCE(z.route_id, 999), z.route_order ASC, z.name ASC
    `).all();
  } catch (e) {
    console.warn('Zones fetch note:', e.message);
  }

  // Deduplicate zones by name
  const seenZones = new Set();
  const uniqueZones = [];
  zones.forEach(z => {
    const key = (z.name || '').trim().toLowerCase();
    if (!seenZones.has(key)) {
      seenZones.add(key);
      uniqueZones.push(z);
    }
  });
  zones = uniqueZones;

  // Fetch products
  let products = [];
  try {
    const rawProds = await db.prepare(`
      SELECT DISTINCT name, category, selling_price
      FROM products
      WHERE is_active = 1 OR is_active IS NULL
      ORDER BY category ASC, selling_price ASC, name ASC
    `).all();

    const seenProds = new Set();
    rawProds.forEach(p => {
      const key = (p.name || '').trim().toLowerCase();
      if (!seenProds.has(key)) {
        seenProds.add(key);
        products.push(p);
      }
    });
  } catch (e) {
    console.warn('Products fetch note:', e.message);
  }

  // Fallback defaults if products empty
  if (products.length === 0) {
    products = [
      { name: 'Special Milk 500ml', category: 'Milk', selling_price: 27 },
      { name: 'Samrudhi Milk 500ml', category: 'Milk', selling_price: 28 },
      { name: 'Shubham Milk 500ml', category: 'Milk', selling_price: 27 },
      { name: 'Toned Milk 500ml', category: 'Milk', selling_price: 24 },
      { name: 'Cow Milk 500ml', category: 'Milk', selling_price: 26 },
      { name: 'Special Milk 1ltr', category: 'Milk', selling_price: 52 },
      { name: 'Shubham Milk 1ltr', category: 'Milk', selling_price: 52 },
      { name: 'Toned Milk 1ltr', category: 'Milk', selling_price: 46 },
      { name: 'Nandini Curd 500ml', category: 'Curd', selling_price: 28 },
      { name: 'Nandini Curd 1ltr', category: 'Curd', selling_price: 54 }
    ];
  }

  console.log(`Loaded ${routes.length} routes, ${zones.length} unique zones, ${products.length} unique products.`);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nandini Milk Parlour System';
  workbook.created = new Date();

  // Column definitions matching user's Google Sheet layout
  const standardHeaders = [
    { header: 'Zone / Community', key: 'zone', width: 28 },
    { header: 'Stop #', key: 'seq', width: 10 },
    { header: 'Flat / House #', key: 'flat_no', width: 16 },
    { header: 'Customer Name *', key: 'name', width: 24 },
    { header: 'Phone Number *', key: 'phone', width: 16 },
    { header: 'Category *', key: 'category', width: 16 },
    { header: 'Billing Type *', key: 'billing_type', width: 18 },
    { header: 'Full Address / Landmark', key: 'address', width: 34 },
    { header: 'Milk Product 1 *', key: 'prod1', width: 26 },
    { header: 'Qty 1 *', key: 'qty1', width: 10 },
    { header: 'Product 2 (Optional)', key: 'prod2', width: 26 },
    { header: 'Qty 2', key: 'qty2', width: 10 },
    { header: 'Advance (₹)', key: 'advance', width: 14 },
    { header: 'Start Date (YYYY-MM-DD)', key: 'start_date', width: 22 },
    { header: 'Delivery Notes', key: 'notes', width: 28 }
  ];

  // Helper: Style Header Row (Dark Blue #1B365D with white bold text like user's screenshot)
  function applyHeaderStyles(sheet, titleText = '') {
    sheet.columns = standardHeaders;

    const headerRow = sheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF10375C' } // Deep Navy Blue
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0B2545' } },
        left: { style: 'thin', color: { argb: 'FF334E68' } },
        bottom: { style: 'medium', color: { argb: 'FF0B2545' } },
        right: { style: 'thin', color: { argb: 'FF334E68' } }
      };
    });
  }

  // Helper: Apply validations on a row
  function applyRowValidations(row, rowNum, prodCount, zoneCount) {
    // Dropdown for Category (Col F / 6)
    row.getCell(6).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"HOUSE,BULK_HOTEL"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Category',
      error: 'Please choose HOUSE or BULK_HOTEL'
    };

    // Dropdown for Billing Type (Col G / 7)
    row.getCell(7).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"MONTHLY_POSTPAID,PREPAID"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Billing Type',
      error: 'Please choose MONTHLY_POSTPAID or PREPAID'
    };

    // Dropdown for Product 1 (Col I / 9)
    row.getCell(9).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'Nandini_Products_List'!$A$2:$A$${prodCount + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Product',
      error: 'Please choose from the Nandini product list'
    };

    // Dropdown for Product 2 (Col K / 11)
    row.getCell(11).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'Nandini_Products_List'!$A$2:$A$${prodCount + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Product',
      error: 'Please choose from the Nandini product list'
    };
  }

  // Group zones by Route
  const route1Zones = zones.filter(z => (z.route_name || '').toLowerCase().includes('route 1') || z.route_id === 1);
  const route2Zones = zones.filter(z => (z.route_name || '').toLowerCase().includes('route 2') || z.route_id === 2);
  const otherZones = zones.filter(z => !route1Zones.includes(z) && !route2Zones.includes(z));

  // =========================================================================
  // TAB 1: Route 1 (Pre-grouped by zone blocks with alternating soft tints)
  // =========================================================================
  const wsRoute1 = workbook.addWorksheet('Route 1', {
    views: [{ showGridLines: true, state: 'frozen', xSplit: 0, ySplit: 1 }]
  });
  applyHeaderStyles(wsRoute1, 'ROUTE 1');

  let r1RowIdx = 2;
  const SLOTS_PER_ZONE = 8; // 8 customer rows pre-created per apartment

  route1Zones.forEach((z, zIdx) => {
    const isEvenZone = zIdx % 2 === 0;
    // Alternating soft green block tint (#D1E7DD / #E8F5E9) like the user's screenshot
    const bgArgb = isEvenZone ? 'FFFFFFFF' : 'FFE8F5E9';
    const startRow = r1RowIdx;
    const endRow = r1RowIdx + SLOTS_PER_ZONE - 1;

    for (let slot = 1; slot <= SLOTS_PER_ZONE; slot++) {
      const row = wsRoute1.getRow(r1RowIdx);
      row.height = 22;

      row.getCell(1).value = z.name; // Zone
      row.getCell(2).value = slot;   // Stop #
      row.getCell(6).value = z.name.toLowerCase().includes('bulk') ? 'BULK_HOTEL' : 'HOUSE';
      row.getCell(7).value = 'MONTHLY_POSTPAID';
      row.getCell(8).value = z.address || z.name;
      row.getCell(10).value = 1; // Default Qty 1
      row.getCell(13).value = 0; // Default Advance 0
      row.getCell(14).value = '2026-11-01'; // Default Start Date

      for (let c = 1; c <= 15; c++) {
        const cell = row.getCell(c);
        cell.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
        if ([2, 3, 5, 6, 7, 10, 12, 13, 14].includes(c)) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      }

      applyRowValidations(row, r1RowIdx, products.length, zones.length);
      r1RowIdx++;
    }

    // Merge Zone column across its customer slots (like AID-01 / AID-02 in screenshot)
    wsRoute1.mergeCells(`A${startRow}:A${endRow}`);
    const zoneCell = wsRoute1.getCell(`A${startRow}`);
    zoneCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    zoneCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    zoneCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isEvenZone ? 'FFF1F5F9' : 'FFDCFCE7' }
    };
  });

  // =========================================================================
  // TAB 2: Route 2 (Pre-grouped by zone blocks with alternating soft tints)
  // =========================================================================
  const wsRoute2 = workbook.addWorksheet('Route 2', {
    views: [{ showGridLines: true, state: 'frozen', xSplit: 0, ySplit: 1 }]
  });
  applyHeaderStyles(wsRoute2, 'ROUTE 2');

  let r2RowIdx = 2;
  route2Zones.forEach((z, zIdx) => {
    const isEvenZone = zIdx % 2 === 0;
    const bgArgb = isEvenZone ? 'FFFFFFFF' : 'FFE8F5E9';
    const startRow = r2RowIdx;
    const endRow = r2RowIdx + SLOTS_PER_ZONE - 1;

    for (let slot = 1; slot <= SLOTS_PER_ZONE; slot++) {
      const row = wsRoute2.getRow(r2RowIdx);
      row.height = 22;

      row.getCell(1).value = z.name;
      row.getCell(2).value = slot;
      row.getCell(6).value = z.name.toLowerCase().includes('bulk') ? 'BULK_HOTEL' : 'HOUSE';
      row.getCell(7).value = 'MONTHLY_POSTPAID';
      row.getCell(8).value = z.address || z.name;
      row.getCell(10).value = 1;
      row.getCell(13).value = 0;
      row.getCell(14).value = '2026-11-01';

      for (let c = 1; c <= 15; c++) {
        const cell = row.getCell(c);
        cell.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
        if ([2, 3, 5, 6, 7, 10, 12, 13, 14].includes(c)) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }
      }

      applyRowValidations(row, r2RowIdx, products.length, zones.length);
      r2RowIdx++;
    }

    wsRoute2.mergeCells(`A${startRow}:A${endRow}`);
    const zoneCell = wsRoute2.getCell(`A${startRow}`);
    zoneCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    zoneCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    zoneCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isEvenZone ? 'FFF1F5F9' : 'FFDCFCE7' }
    };
  });

  // =========================================================================
  // TAB 3: All_Customers (Consolidated free-form grid for entering any customer)
  // =========================================================================
  const wsAll = workbook.addWorksheet('All_Customers', {
    views: [{ showGridLines: true, state: 'frozen', xSplit: 0, ySplit: 1 }]
  });
  applyHeaderStyles(wsAll, 'ALL CUSTOMERS');

  // Pre-format 100 blank rows in All_Customers
  for (let r = 2; r <= 100; r++) {
    const row = wsAll.getRow(r);
    row.height = 22;

    row.getCell(6).value = 'HOUSE';
    row.getCell(7).value = 'MONTHLY_POSTPAID';
    row.getCell(10).value = 1;
    row.getCell(13).value = 0;
    row.getCell(14).value = '2026-11-01';

    for (let c = 1; c <= 15; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Arial', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      if ([2, 3, 5, 6, 7, 10, 12, 13, 14].includes(c)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    }

    // Zone dropdown on Col A
    row.getCell(1).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'Zones_&_Routes_Ref'!$A$2:$A$${zones.length + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Zone',
      error: 'Please choose an apartment/zone from the list'
    };

    applyRowValidations(row, r, products.length, zones.length);
  }

  // =========================================================================
  // TAB 4: Zones_&_Routes_Ref (Reference list)
  // =========================================================================
  const wsZones = workbook.addWorksheet('Zones_&_Routes_Ref', {
    views: [{ showGridLines: true }]
  });
  wsZones.columns = [
    { header: 'Zone / Community Name', key: 'name', width: 34 },
    { header: 'Assigned Route', key: 'route', width: 18 },
    { header: 'Stop Order', key: 'order', width: 14 },
    { header: 'Full Area / Landmark Address', key: 'address', width: 60 }
  ];

  const zH = wsZones.getRow(1);
  zH.height = 26;
  zH.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } }; // Teal
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  zones.forEach((z) => {
    const row = wsZones.addRow({
      name: z.name,
      route: z.route_name || 'Unassigned',
      order: z.route_order || 0,
      address: z.address || ''
    });
    row.height = 20;
    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      if (colNum === 3) cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
  });

  // =========================================================================
  // TAB 5: Nandini_Products_List (Reference list)
  // =========================================================================
  const wsProds = workbook.addWorksheet('Nandini_Products_List', {
    views: [{ showGridLines: true }]
  });
  wsProds.columns = [
    { header: 'Nandini Product Name', key: 'name', width: 30 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Selling Price (₹)', key: 'price', width: 18 }
  ];

  const pH = wsProds.getRow(1);
  pH.height = 26;
  pH.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }; // Purple
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  products.forEach((p) => {
    const row = wsProds.addRow({
      name: p.name,
      category: p.category,
      price: p.selling_price
    });
    row.height = 20;
    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      if (colNum === 3) cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
  });

  // =========================================================================
  // TAB 6: Instructions
  // =========================================================================
  const wsHelp = workbook.addWorksheet('Instructions', {
    views: [{ showGridLines: true }]
  });
  wsHelp.columns = [
    { header: 'Step / Column', key: 'col', width: 24 },
    { header: 'How to Fill', key: 'desc', width: 70 },
    { header: 'Example', key: 'example', width: 28 }
  ];

  const hH = wsHelp.getRow(1);
  hH.height = 26;
  hH.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004B87' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const tips = [
    { col: 'Choose Tab', desc: 'Use "Route 1" or "Route 2" tabs where all your apartments/zones are already arranged in delivery sequence. Or use "All_Customers" for single list.', example: 'Click Route 1 tab at bottom' },
    { col: 'Customer Name *', desc: 'Full name of the customer.', example: 'Ramesh Kumar' },
    { col: 'Phone Number *', desc: '10-digit mobile number for delivery notifications and billing.', example: '9845012345' },
    { col: 'Flat / House #', desc: 'Apartment flat number or villa number.', example: 'A-204 or Villa 15' },
    { col: 'Category', desc: 'Pick "HOUSE" for households, or "BULK_HOTEL" for restaurants/cafes.', example: 'HOUSE' },
    { col: 'Billing Type', desc: 'Pick "MONTHLY_POSTPAID" for monthly bills, or "PREPAID" for advance deduction.', example: 'MONTHLY_POSTPAID' },
    { col: 'Milk Product 1 *', desc: 'Click the cell to pick from the Nandini product dropdown list.', example: 'Special Milk 500ml' },
    { col: 'Qty 1 *', desc: 'Daily morning delivery quantity in packets.', example: '2' },
    { col: 'Product 2 (Optional)', desc: 'Optional second product like Curd, Cow milk, etc.', example: 'Nandini Curd 500ml' },
    { col: 'Start Date', desc: 'Date deliveries should begin. Format YYYY-MM-DD.', example: '2026-11-01' }
  ];

  tips.forEach(t => {
    const row = wsHelp.addRow(t);
    row.height = 22;
    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      if (colNum === 1) cell.font = { name: 'Arial', size: 10, bold: true };
    });
  });

  // Write files to both project root and client/public
  const rootPath = path.join(__dirname, '..', 'Nandini_Customers_Bulk_Import_Template.xlsx');
  const publicPath = path.join(__dirname, '..', 'client', 'public', 'Nandini_Customers_Bulk_Import_Template.xlsx');

  await workbook.xlsx.writeFile(rootPath);
  try {
    fs.copyFileSync(rootPath, publicPath);
    console.log(`Copied template to client/public: ${publicPath}`);
  } catch (cpErr) {
    console.warn('Could not copy to client/public:', cpErr.message);
  }

  console.log(`\n✓ SUCCESS: Generated customer bulk onboarding sheet at: ${rootPath}`);
  return rootPath;
}

if (require.main === module) {
  generateCustomerExcel()
    .then((p) => {
      console.log('Successfully completed generation at ' + p);
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error generating Excel:', err);
      process.exit(1);
    });
}

module.exports = { generateCustomerExcel };
