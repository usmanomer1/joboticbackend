// Test script to verify the session duplication fix
// This script monitors Browserbase API calls to ensure only one session is created

const originalFetch = global.fetch;
let sessionCount = 0;
const createdSessions = [];

// Intercept all fetch calls
global.fetch = async (...args) => {
  const [url, options] = args;
  
  // Log Browserbase session creation attempts
  if (url && url.includes('browserbase.com/sessions') && options?.method === 'POST') {
    sessionCount++;
    console.log(`\n[SESSION CREATION ATTEMPT #${sessionCount}]`, {
      url,
      timestamp: new Date().toISOString(),
      body: options.body ? JSON.parse(options.body) : undefined
    });
  }
  
  const response = await originalFetch(...args);
  
  // Log successful session creations
  if (url && url.includes('browserbase.com/sessions') && options?.method === 'POST' && response.ok) {
    const clonedResponse = response.clone();
    const sessionData = await clonedResponse.json();
    createdSessions.push({
      id: sessionData.id,
      createdAt: new Date().toISOString()
    });
    console.log(`[SESSION CREATED] ID: ${sessionData.id}`);
  }
  
  return response;
};

// Run your test here
async function runTest() {
  console.log('Starting session creation test...');
  console.log('This will monitor all Browserbase API calls\n');
  
  // Import and run your automation service
  // const { LinkedInAutomationService } = require('./dist/services/linkedin/linkedinAutomationService');
  // ... your test code here ...
  
  // After test completes
  setTimeout(() => {
    console.log('\n========== TEST RESULTS ==========');
    console.log(`Total session creation attempts: ${sessionCount}`);
    console.log(`Total sessions created: ${createdSessions.length}`);
    console.log('Created sessions:', createdSessions);
    
    if (createdSessions.length > 1) {
      console.error('❌ FAIL: Multiple sessions were created!');
    } else if (createdSessions.length === 1) {
      console.log('✅ PASS: Only one session was created');
    } else {
      console.warn('⚠️  WARNING: No sessions were created');
    }
  }, 10000); // Check after 10 seconds
}

// Export for use in other scripts
module.exports = { runTest };

// Run if called directly
if (require.main === module) {
  runTest();
}