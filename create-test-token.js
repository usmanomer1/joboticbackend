#!/usr/bin/env node

/**
 * Create a test JWT token directly using Supabase
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function createTestToken() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('                    CREATE TEST JWT TOKEN                          ');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  
  const supabaseUrl = 'https://wqyquvgduwjkyadkumkl.supabase.co';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseAnonKey) {
    console.error('❌ ERROR: SUPABASE_ANON_KEY not found in .env file');
    console.log('');
    console.log('Add this to your .env file:');
    console.log('SUPABASE_ANON_KEY=your-anon-key-here');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  
  try {
    // Try to sign in with test credentials
    console.log('Attempting to sign in with test user...');
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'tarheel@gmail.com',
      password: 'test123' // You'll need to provide the actual password
    });
    
    if (error) {
      console.error('❌ Sign in failed:', error.message);
      console.log('');
      console.log('Alternative: Use the service role key as a bearer token');
      console.log('');
      console.log('Your service role key (from .env):');
      console.log(process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 50) + '...');
      console.log('');
      console.log('Use it like this:');
      console.log('curl -X POST http://localhost:3001/api/linkedin/start \\');
      console.log('  -H "Content-Type: application/json" \\');
      console.log('  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \\');
      console.log('  -d \'{"config": {"searchPrompt": "test", "maxApplications": 10}}\'');
      return;
    }
    
    console.log('✅ Sign in successful!');
    console.log('');
    console.log('Your JWT Token:');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(data.session.access_token);
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Use it in Postman:');
    console.log('1. Set Authorization header to: Bearer ' + data.session.access_token.substring(0, 20) + '...');
    console.log('');
    console.log('Or use with curl:');
    console.log('curl -X POST http://localhost:3001/api/linkedin/start \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -H "Authorization: Bearer ' + data.session.access_token + '" \\');
    console.log('  -d \'{"config": {"searchPrompt": "software engineer test", "maxApplications": 10}}\'');
    
  } catch (err) {
    console.error('❌ ERROR:', err.message);
  }
}

createTestToken();