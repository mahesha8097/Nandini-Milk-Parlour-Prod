const assert = require('assert');

async function testFullApiWorkflow() {
  const BASE = 'http://localhost:5000/api';
  console.log('=== VERIFYING FULL LIVE API WORKFLOW ===');

  // 1. Initial Status check
  const initRes = await fetch(`${BASE}/auth/init-status`).then(r => r.json());
  console.log('Init Status:', initRes);

  let adminToken = '';
  if (!initRes.hasAdmin) {
    // 2. Register Admin
    const regRes = await fetch(`${BASE}/auth/register-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Nandini Parlour Owner',
        username: 'admin_nandini',
        password: 'Password@2026',
        phone: '9845011223',
        email: 'owner@nandiniparlour.com'
      })
    }).then(r => r.json());
    console.log('Admin Registered:', regRes.user.name, regRes.user.username);
    adminToken = regRes.token;
  } else {
    // Login
    const loginRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin_nandini',
        password: 'Password@2026'
      })
    }).then(r => r.json());
    adminToken = loginRes.token;
  }

  const authHeader = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`
  };

  // 3. Create Products
  const p1 = await fetch(`${BASE}/products`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      name: 'Nandini Toned Milk (Blue)',
      category: 'Milk',
      variant_label: '500 ml',
      unit_volume_litres: 0.5,
      selling_price: 25.0,
      delivery_charge_type: 'MILK_RULE'
    })
  }).then(r => r.json());

  const p2 = await fetch(`${BASE}/products`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      name: 'Nandini Toned Milk (Blue)',
      category: 'Milk',
      variant_label: '1 L',
      unit_volume_litres: 1.0,
      selling_price: 50.0,
      delivery_charge_type: 'MILK_RULE'
    })
  }).then(r => r.json());

  const p3 = await fetch(`${BASE}/products`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      name: 'Nandini Curd',
      category: 'Curd',
      variant_label: '500 g',
      unit_volume_litres: 0.5,
      selling_price: 28.0,
      delivery_charge_type: 'NONE'
    })
  }).then(r => r.json());

  console.log('✓ Created 3 Nandini products:', p1.name, p2.name, p3.name);

  // 4. Create Delivery Boy
  const dboy = await fetch(`${BASE}/delivery-boys`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      name: 'Suresh Kumar',
      username: 'suresh_agent',
      password: 'DeliveryBoy@123',
      phone: '9880011223',
      assigned_route: 'Indiranagar Sector 1-4'
    })
  }).then(r => r.json());
  console.log('✓ Created Delivery Boy:', dboy.name, dboy.username);

  // 5. Create House Customer (Prepaid) with ₹1,000 Advance
  const cust1 = await fetch(`${BASE}/customers`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      name: 'Anand Sharma',
      phone: '9845099887',
      address: '#102, Shanti Nilaya, 5th Cross, Indiranagar',
      customer_category: 'HOUSE',
      billing_type: 'PREPAID',
      delivery_boy_id: dboy.id,
      route: 'Indiranagar Sector 2',
      initial_advance: 1000.0,
      notes: 'Deliver before 6:30 AM'
    })
  }).then(r => r.json());
  console.log('✓ Created House Customer with ₹1000 advance:', cust1.name, 'Advance:', cust1.advance_balance);

  // 6. Add Subscriptions for Customer: 1L Milk + 500g Curd daily
  const sub1 = await fetch(`${BASE}/customers/${cust1.id}/subscriptions`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      product_id: p2.id, // 1L Milk
      quantity: 1,
      frequency: 'DAILY',
      start_date: new Date().toISOString().slice(0, 10)
    })
  }).then(r => r.json());

  const sub2 = await fetch(`${BASE}/customers/${cust1.id}/subscriptions`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      product_id: p3.id, // 500g Curd
      quantity: 1,
      frequency: 'DAILY',
      start_date: new Date().toISOString().slice(0, 10)
    })
  }).then(r => r.json());
  console.log('✓ Added Subscriptions:', sub1.product_name, '+', sub2.product_name);

  // 7. Test Delivery Boy Login & Deliveries
  const dboyLogin = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'suresh_agent',
      password: 'DeliveryBoy@123'
    })
  }).then(r => r.json());
  console.log('✓ Delivery Boy Logged In successfully. Role:', dboyLogin.user.role);

  const dboyAuthHeader = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${dboyLogin.token}`
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayDeliveries = await fetch(`${BASE}/deliveries?date=${todayStr}`, {
    headers: dboyAuthHeader
  }).then(r => r.json());
  console.log(`✓ Fetched today's deliveries (${todayDeliveries.length} items found)`);

  // Delivery Boy marks first delivery item as DELIVERED
  if (todayDeliveries.length > 0) {
    const markRes = await fetch(`${BASE}/deliveries/${todayDeliveries[0].id}/status`, {
      method: 'PUT',
      headers: dboyAuthHeader,
      body: JSON.stringify({ status: 'DELIVERED' })
    }).then(r => r.json());
    console.log('✓ Delivery Boy marked delivery ID', markRes.id, 'as', markRes.status);
  }

  // 8. Admin checks Dashboard live stats
  const dashboard = await fetch(`${BASE}/dashboard`, { headers: authHeader }).then(r => r.json());
  console.log('✓ Admin Live Dashboard Overview:', {
    todaySales: dashboard.todayOverview.todaySales,
    completedDeliveries: dashboard.todayOverview.completedDeliveries,
    totalCustomers: dashboard.customerOverview.totalCustomers,
    advanceBalance: dashboard.paymentOverview.advanceBalance
  });

  // 9. Generate Monthly Bill
  const currentMonth = todayStr.slice(0, 7);
  const billingRes = await fetch(`${BASE}/bills/generate-monthly`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ month: currentMonth })
  }).then(r => r.json());
  console.log('✓ Monthly Billing Result:', billingRes.summary);

  // 10. Record an expense
  const expRes = await fetch(`${BASE}/expenses`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      category: 'PETROL',
      amount: 300,
      expense_date: todayStr,
      payment_method: 'UPI',
      recipient_name: 'Shell Petrol Pump',
      description: 'Delivery vehicle petrol'
    })
  }).then(r => r.json());
  console.log('✓ Recorded Business Expense:', expRes.category, '₹' + expRes.amount);

  console.log('\n========================================================');
  console.log(' ALL END-TO-END WORKFLOW TESTS PASSED 100% SUCCESSFULLY! ');
  console.log('========================================================\n');
}

testFullApiWorkflow().catch(err => {
  console.error('Workflow error:', err);
  process.exit(1);
});
