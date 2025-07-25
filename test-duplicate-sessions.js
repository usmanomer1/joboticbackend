const fetch = require('node-fetch');

// Test configuration
const API_URL = 'http://localhost:3001';
const TEST_TOKEN = process.env.TEST_JWT || 'your-test-jwt-here';
const TEST_USER_ID = process.env.TEST_USER_ID || '27c01ed9-a739-45fc-a2aa-ac30c2749424';

async function makeRequest(name, delay = 0) {
  if (delay > 0) {
    console.log(`Waiting ${delay}ms before request "${name}"...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  console.log(`\n========== REQUEST ${name} ==========`);
  console.log(`Time: ${new Date().toISOString()}`);
  
  try {
    const response = await fetch(`${API_URL}/api/linkedin/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'X-Request-ID': `test-${name}-${Date.now()}`
      },
      body: JSON.stringify({
        userId: TEST_USER_ID,
        searchPrompt: 'software engineer test',
        config: {
          maxApplications: 5,
          filters: {
            easyApplyOnly: true
          }
        }
      })
    });

    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    return data;
  } catch (error) {
    console.error('Request failed:', error.message);
    return null;
  }
}

async function testDuplicateSessions() {
  console.log('=== Testing Duplicate Sessions ===');
  console.log('API URL:', API_URL);
  console.log('User ID:', TEST_USER_ID);
  console.log('');
  
  // Test 1: Single request
  console.log('\n### Test 1: Single Request ###');
  const result1 = await makeRequest('single');
  
  // Test 2: Two requests with delay
  console.log('\n\n### Test 2: Two Requests with 3s Delay ###');
  const result2a = await makeRequest('delayed-1');
  const result2b = await makeRequest('delayed-2', 3000);
  
  // Test 3: Two rapid requests
  console.log('\n\n### Test 3: Two Rapid Requests ###');
  const [result3a, result3b] = await Promise.all([
    makeRequest('rapid-1'),
    makeRequest('rapid-2')
  ]);
  
  // Summary
  console.log('\n\n=== SUMMARY ===');
  const sessions = [
    { test: 'Test 1', sessionId: result1?.sessionId },
    { test: 'Test 2a', sessionId: result2a?.sessionId },
    { test: 'Test 2b', sessionId: result2b?.sessionId },
    { test: 'Test 3a', sessionId: result3a?.sessionId },
    { test: 'Test 3b', sessionId: result3b?.sessionId }
  ];
  
  console.log('Sessions created:');
  sessions.forEach(s => {
    console.log(`  ${s.test}: ${s.sessionId || 'FAILED'}`);
  });
  
  // Check for duplicates
  const sessionIds = sessions.map(s => s.sessionId).filter(Boolean);
  const uniqueSessions = [...new Set(sessionIds)];
  
  console.log(`\nTotal requests: ${sessions.length}`);
  console.log(`Successful sessions: ${sessionIds.length}`);
  console.log(`Unique sessions: ${uniqueSessions.length}`);
  
  if (sessionIds.length > uniqueSessions.length) {
    console.log('\n⚠️  DUPLICATE SESSIONS DETECTED!');
  }
}

// Instructions
console.log('=== Duplicate Session Test Script ===\n');
console.log('Usage:');
console.log('  TEST_JWT="your-jwt-token" TEST_USER_ID="your-user-id" node test-duplicate-sessions.js');
console.log('');
console.log('This script will:');
console.log('1. Make a single request');
console.log('2. Make two requests with 3s delay');
console.log('3. Make two rapid concurrent requests');
console.log('');
console.log('Watch the server logs to see the detailed flow.\n');

// Run tests
testDuplicateSessions().catch(console.error);