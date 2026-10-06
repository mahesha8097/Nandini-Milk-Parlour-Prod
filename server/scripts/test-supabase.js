// Script to verify Supabase PostgreSQL and Storage connection
require('dotenv').config();
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

async function testSupabase() {
  console.log('====================================================');
  console.log('   NANDINI MILK PARLOUR — SUPABASE CONNECTION TEST  ');
  console.log('====================================================\n');

  let hasErrors = false;

  // 1. Check Environment Variables
  console.log('1. Checking Environment Variables...');
  const dbUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'nandini-assets';

  if (!dbUrl || dbUrl.includes('[PROJECT-REF]') || dbUrl.includes('YOUR_ACTUAL_PASSWORD')) {
    console.log('   ❌ DATABASE_URL is missing or contains placeholder values.');
    console.log(`      Current value: ${dbUrl || '(empty)'}`);
    hasErrors = true;
  } else {
    console.log('   ✅ DATABASE_URL is populated.');
  }

  if (!supabaseUrl || supabaseUrl.includes('your-project-ref')) {
    console.log('   ❌ SUPABASE_URL is missing or contains placeholders.');
    hasErrors = true;
  } else {
    console.log(`   ✅ SUPABASE_URL: ${supabaseUrl}`);
  }

  if (!serviceKey || serviceKey.includes('your-supabase-service-role-key')) {
    console.log('   ⚠️ SUPABASE_SERVICE_ROLE_KEY is missing or contains placeholders.');
  } else {
    console.log('   ✅ SUPABASE_SERVICE_ROLE_KEY is configured.');
  }

  // 2. Test PostgreSQL Database Connection
  console.log('\n2. Testing Supabase PostgreSQL Connection...');
  if (dbUrl && !dbUrl.includes('[PROJECT-REF]') && !dbUrl.includes('YOUR_ACTUAL_PASSWORD')) {
    const pool = new Pool({
      connectionString: dbUrl,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });

    try {
      const client = await pool.connect();
      console.log('   ✅ Successfully connected to Supabase PostgreSQL!');

      const res = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
      `);
      
      const tables = res.rows.map(r => r.table_name);
      console.log(`   ✅ Found ${tables.length} tables in public schema:`);
      if (tables.length > 0) {
        console.log(`      ${tables.join(', ')}`);
      } else {
        console.log('   ⚠️ WARNING: No tables found! Did you run postgres-schema.sql in the Supabase SQL Editor?');
      }

      client.release();
      await pool.end();
    } catch (err) {
      console.log(`   ❌ Database connection failed: ${err.message}`);
      if (err.message.includes('password authentication failed')) {
        console.log('      👉 Hint: Check your database password in DATABASE_URL.');
      } else if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
        console.log('      👉 Hint: Check host and project ref in DATABASE_URL.');
      }
      hasErrors = true;
    }
  } else {
    console.log('   ⏭️ Skipping DB test due to invalid/missing DATABASE_URL.');
  }

  // 3. Test Supabase Storage Bucket
  console.log('\n3. Testing Supabase Cloud Storage...');
  if (supabaseUrl && (serviceKey || anonKey)) {
    try {
      const supabase = createClient(supabaseUrl, serviceKey || anonKey);
      const { data: buckets, error } = await supabase.storage.listBuckets();
      if (error) {
        console.log(`   ❌ Failed to list storage buckets: ${error.message}`);
        hasErrors = true;
      } else {
        console.log(`   ✅ Connected to Supabase Storage API.`);
        const bucketExists = buckets.some(b => b.name === bucketName);
        if (bucketExists) {
          const targetBucket = buckets.find(b => b.name === bucketName);
          console.log(`   ✅ Target bucket "${bucketName}" exists (Public: ${targetBucket.public ? 'YES' : 'NO'})!`);
          if (!targetBucket.public) {
            console.log('   ⚠️ WARNING: Bucket is marked private. Please set it to Public in Supabase dashboard so bill logos/QR codes render.');
          }
        } else {
          console.log(`   ⚠️ Bucket "${bucketName}" was not found!`);
          console.log(`      Existing buckets: ${buckets.map(b => b.name).join(', ') || 'None'}`);
          console.log(`      👉 Please create bucket "${bucketName}" in Supabase Storage.`);
        }
      }
    } catch (err) {
      console.log(`   ❌ Supabase Storage test error: ${err.message}`);
      hasErrors = true;
    }
  } else {
    console.log('   ⏭️ Skipping Storage test due to missing credentials.');
  }

  console.log('\n====================================================');
  if (hasErrors) {
    console.log('   RESULT: Configuration needs attention (see above).');
  } else {
    console.log('   RESULT: Supabase integration is verified & ready!');
  }
  console.log('====================================================');
}

testSupabase().catch(console.error);
