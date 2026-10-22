const ExcelJS = require('exceljs');
const path = require('path');
require('dotenv').config();
const { Pool } = require('pg');

async function generateCustomerExcel() {
  console.log('Fetching zones, routes, and products from database...');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  const client = await pool.connect();

  let routes = [];
  let zones = [];
  let products = [];

  try {
    const rRes = await client.query('SELECT * FROM routes ORDER BY id ASC');
    const zRes = await client.query(`
      SELECT z.*, r.name as route_name 
      FROM zones z 
      LEFT JOIN routes r ON z.route_id = r.id 
      ORDER BY r.name ASC, z.route_order ASC
    `);
    const pRes = await client.query('SELECT * FROM products ORDER BY category ASC, selling_price ASC');
    routes = rRes.rows;
    zones = zRes.rows;
    products = pRes.rows;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`Loaded ${routes.length} routes, ${zones.length} zones, ${products.length} products.`);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nandini Milk Management System';
  workbook.created = new Date();

  // =========================================================================
  // 1. MAIN DATA ENTRY SHEET: Customers_Data_Entry
  // =========================================================================
  const wsMain = workbook.addWorksheet('Customers_Data_Entry', {
    views: [{ showGridLines: true, state: 'frozen', xSplit: 0, ySplit: 4 }]
  });

  // Title Banner
  wsMain.mergeCells('A1:O1');
  const titleCell = wsMain.getCell('A1');
  titleCell.value = 'NANDINI MILK PARLOUR — BULK CUSTOMER ONBOARDING SHEET';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004B87' } }; // Nandini Blue
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  wsMain.getRow(1).height = 36;

  // Subtitle / Guidance
  wsMain.mergeCells('A2:O2');
  const subCell = wsMain.getCell('A2');
  subCell.value = 'Fill in your customers below. In the "Zone / Community" and "Milk Product" columns, click the cell to pick from the dropdown list. Once filled, save and upload to import all customers.';
  subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF334155' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  wsMain.getRow(2).height = 24;

  // Empty separator row 3
  wsMain.getRow(3).height = 8;

  // Column Headers (Row 4)
  const headers = [
    { header: 'Sequence / Stop #', key: 'seq', width: 16 },
    { header: 'Customer Name *', key: 'name', width: 24 },
    { header: 'Phone Number *', key: 'phone', width: 16 },
    { header: 'Zone / Community (Select Dropdown) *', key: 'zone', width: 34 },
    { header: 'Flat / Villa / House #', key: 'flat_no', width: 20 },
    { header: 'Full Address / Landmark *', key: 'address', width: 32 },
    { header: 'Customer Category *', key: 'category', width: 20 },
    { header: 'Billing Type *', key: 'billing_type', width: 20 },
    { header: 'Advance Balance (₹)', key: 'advance', width: 18 },
    { header: 'Milk Product 1 (Select Dropdown) *', key: 'prod1', width: 28 },
    { header: 'Product 1 Daily Qty *', key: 'qty1', width: 18 },
    { header: 'Milk Product 2 (Optional Dropdown)', key: 'prod2', width: 28 },
    { header: 'Product 2 Daily Qty', key: 'qty2', width: 18 },
    { header: 'Delivery Start Date (YYYY-MM-DD)', key: 'start_date', width: 26 },
    { header: 'Delivery Instructions / Notes', key: 'notes', width: 30 }
  ];

  wsMain.columns = headers;

  const headerRow = wsMain.getRow(4);
  headerRow.height = 30;

  headerRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    // Color coding header groups
    if (colNumber <= 3) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }; // Blue: Core Info
    } else if (colNumber <= 6) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } }; // Teal: Zone & Address
    } else if (colNumber <= 9) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } }; // Amber: Category & Billing
    } else if (colNumber <= 13) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }; // Purple: Subscriptions
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } }; // Slate: Schedule & Notes
    }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
    };
  });

  // Sample Rows to illustrate proper format
  const sampleData = [
    {
      seq: 1,
      name: 'Suresh Kumar',
      phone: '9845012345',
      zone: 'United Elysium',
      flat_no: 'A-204',
      address: 'Tower A, 2nd Floor, United Elysium',
      category: 'HOUSE',
      billing_type: 'MONTHLY_POSTPAID',
      advance: 500,
      prod1: 'Special Milk 500ml',
      qty1: 2,
      prod2: 'Nandini Curd 500ml',
      qty2: 1,
      start_date: '2026-11-01',
      notes: 'Ring bell once; keep on door bag'
    },
    {
      seq: 2,
      name: 'Priya Sharma',
      phone: '9900112233',
      zone: 'Orchid Enclaves',
      flat_no: 'B-101',
      address: 'Block B, Ground Floor',
      category: 'HOUSE',
      billing_type: 'MONTHLY_POSTPAID',
      advance: 0,
      prod1: 'Samrudhi Milk 500ml',
      qty1: 1,
      prod2: '',
      qty2: '',
      start_date: '2026-11-01',
      notes: 'Deliver before 6:30 AM'
    },
    {
      seq: 1,
      name: 'Nandini Cafe & Tiffin',
      phone: '9448877665',
      zone: 'Bulk Orders 1',
      flat_no: 'Shop # 4',
      address: 'Main Road Commercial Shed',
      category: 'BULK_HOTEL',
      billing_type: 'MONTHLY_POSTPAID',
      advance: 2000,
      prod1: 'Shubham Milk 1ltr',
      qty1: 10,
      prod2: 'Special Milk 1ltr',
      qty2: 5,
      start_date: '2026-10-01',
      notes: 'Commercial morning delivery 5:00 AM'
    }
  ];

  sampleData.forEach((item) => {
    const row = wsMain.addRow(item);
    row.height = 22;
    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF1E293B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      if ([1, 3, 9, 11, 13, 14].includes(colNum)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });
  });

  // Pre-format 300 blank data entry rows with borders and validations
  for (let r = 8; r <= 300; r++) {
    const row = wsMain.getRow(r);
    row.height = 20;
    for (let c = 1; c <= 15; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      if ([1, 3, 9, 11, 13, 14].includes(c)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    }
  }

  // =========================================================================
  // 2. REFERENCE SHEET: Zones_And_Routes_Ref
  // =========================================================================
  const wsZones = workbook.addWorksheet('Zones_And_Routes_Ref', {
    views: [{ showGridLines: true }]
  });

  wsZones.columns = [
    { header: 'Zone / Community Name', key: 'zone_name', width: 34 },
    { header: 'Assigned Route', key: 'route_name', width: 18 },
    { header: 'Stop Sequence Order', key: 'route_order', width: 20 },
    { header: 'Address / Area', key: 'address', width: 30 }
  ];

  const zHeader = wsZones.getRow(1);
  zHeader.height = 26;
  zHeader.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  zones.forEach((z) => {
    const row = wsZones.addRow({
      zone_name: z.name,
      route_name: z.route_name || 'Unassigned',
      route_order: z.route_order || 0,
      address: z.address || 'Bangalore'
    });
    row.height = 20;
    row.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
  });

  // =========================================================================
  // 3. REFERENCE SHEET: Products_Price_List_Ref
  // =========================================================================
  const wsProducts = workbook.addWorksheet('Products_Price_List_Ref', {
    views: [{ showGridLines: true }]
  });

  wsProducts.columns = [
    { header: 'Product Name', key: 'name', width: 28 },
    { header: 'Category', key: 'category', width: 16 },
    { header: 'Variant / Volume', key: 'variant', width: 16 },
    { header: 'Selling Price (₹)', key: 'price', width: 18 }
  ];

  const pHeader = wsProducts.getRow(1);
  pHeader.height = 26;
  pHeader.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  products.forEach((p) => {
    const row = wsProducts.addRow({
      name: p.name,
      category: p.category,
      variant: p.variant_label,
      price: p.selling_price
    });
    row.height = 20;
    row.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
  });

  // =========================================================================
  // 4. INSTRUCTIONS SHEET
  // =========================================================================
  const wsInfo = workbook.addWorksheet('How_To_Fill_Instructions', {
    views: [{ showGridLines: true }]
  });

  wsInfo.columns = [
    { header: 'Column Name', key: 'col', width: 24 },
    { header: 'Description & Guidance', key: 'desc', width: 70 },
    { header: 'Example Value', key: 'ex', width: 26 }
  ];

  const iHeader = wsInfo.getRow(1);
  iHeader.height = 28;
  iHeader.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004B87' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const instructions = [
    { col: 'Sequence / Stop #', desc: 'Order of delivery within the apartment/complex (e.g., 1st flat, 2nd flat...). Helps delivery boys follow optimal run sequence.', ex: '1, 2, 3...' },
    { col: 'Customer Name *', desc: 'Full name of the customer.', ex: 'Ramesh Kumar' },
    { col: 'Phone Number *', desc: '10-digit mobile number for SMS/WhatsApp and delivery contact.', ex: '9845012345' },
    { col: 'Zone / Community *', desc: 'Select from dropdown! Automatically links the customer to the exact apartment complex and assigned delivery boy.', ex: 'United Elysium (from list)' },
    { col: 'Flat / Villa / House #', desc: 'Apartment flat number or villa number.', ex: 'A-204, Villa 15, Flat 101' },
    { col: 'Full Address / Landmark *', desc: 'Detailed address or landmark inside the community.', ex: 'Tower A, 2nd Floor' },
    { col: 'Customer Category *', desc: 'Select "HOUSE" for residential families or "BULK_HOTEL" for commercial restaurants/cafes.', ex: 'HOUSE (from list)' },
    { col: 'Billing Type *', desc: '"MONTHLY_POSTPAID" generates bill at month end. "PREPAID" deducts each daily delivery from advance.', ex: 'MONTHLY_POSTPAID (from list)' },
    { col: 'Advance Balance (₹)', desc: 'Initial advance payment received from customer (if any). Leave 0 if none.', ex: '0 or 500' },
    { col: 'Milk Product 1 *', desc: 'Main daily milk product. Select from dropdown list.', ex: 'Special Milk 500ml' },
    { col: 'Product 1 Daily Qty *', desc: 'Number of packets delivered every morning.', ex: '1, 2, 3...' },
    { col: 'Milk Product 2', desc: 'Optional second product (e.g. Curd, Cow milk, Toned milk). Select from dropdown list.', ex: 'Nandini Curd 500ml' },
    { col: 'Product 2 Daily Qty', desc: 'Number of packets of second product delivered every day.', ex: '1' },
    { col: 'Delivery Start Date', desc: 'Date when deliveries should begin. Format: YYYY-MM-DD. For next month, use 2026-11-01. For testing this month, use 2026-10-01.', ex: '2026-11-01' },
    { col: 'Delivery Instructions', desc: 'Specific customer delivery instructions.', ex: 'Ring bell once; keep in door bag' }
  ];

  instructions.forEach((ins) => {
    const row = wsInfo.addRow(ins);
    row.height = 24;
    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      if (colNum === 1) cell.font = { name: 'Calibri', size: 10, bold: true };
    });
  });

  // =========================================================================
  // 5. ATTACH DATA VALIDATIONS ON Customers_Data_Entry
  // =========================================================================
  const zoneCount = zones.length;
  const prodCount = products.length;

  for (let r = 5; r <= 300; r++) {
    const row = wsMain.getRow(r);

    // Column D: Zone / Community Dropdown
    row.getCell('D').dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'Zones_And_Routes_Ref'!$A$2:$A$${zoneCount + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Zone Selection',
      error: 'Please choose an apartment/villa zone from the dropdown list.'
    };

    // Column G: Category Dropdown
    row.getCell('G').dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"HOUSE,BULK_HOTEL"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Category',
      error: 'Please choose HOUSE or BULK_HOTEL.'
    };

    // Column H: Billing Type Dropdown
    row.getCell('H').dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"MONTHLY_POSTPAID,PREPAID"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Billing Type',
      error: 'Please choose MONTHLY_POSTPAID or PREPAID.'
    };

    // Column J: Milk Product 1 Dropdown
    row.getCell('J').dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'Products_Price_List_Ref'!$A$2:$A$${prodCount + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Product',
      error: 'Please choose a product from the dropdown list.'
    };

    // Column L: Milk Product 2 Dropdown
    row.getCell('L').dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`'Products_Price_List_Ref'!$A$2:$A$${prodCount + 1}`],
      showErrorMessage: true,
      errorTitle: 'Invalid Product',
      error: 'Please choose a product from the dropdown list.'
    };
  }

  // Save the Excel file in the project root
  const outputPath = path.join(__dirname, '..', 'Nandini_Customers_Bulk_Import_Template.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`\n✓ SUCCESS! Excel sheet created at: ${outputPath}`);
}

generateCustomerExcel().catch((err) => {
  console.error('Error generating Excel sheet:', err);
  process.exit(1);
});
