#!/usr/bin/env node

const https = require('https');

console.log(`
===========================================
    SESSION MYSTERY INVESTIGATION
===========================================

This script will help identify why you see 2 sessions in Browserbase.

THEORY 1: Frontend and backend have different session IDs
THEORY 2: One session is from a previous run (stale)
THEORY 3: Context creation is creating a session
THEORY 4: There's a race condition
THEORY 5: Frontend is getting redirected/refreshed

===========================================
`);

console.log('STEP 1: Check what the frontend is actually displaying\n');
console.log('In the frontend, add this debugging code:\n');

console.log(`
// Add to your component where you handle the session
useEffect(() => {
  console.log('[FRONTEND DEBUG] Session info:', {
    sessionId,
    liveViewUrl,
    timestamp: new Date().toISOString(),
    localStorage: localStorage.getItem('activeSessionId')
  });
}, [sessionId, liveViewUrl]);

// When you start automation
const handleStart = async () => {
  console.log('[FRONTEND DEBUG] Starting automation at', new Date().toISOString());
  const result = await linkedInJobSearchApi.startJobSearch(...);
  console.log('[FRONTEND DEBUG] API returned:', result);
  console.log('[FRONTEND DEBUG] Setting sessionId:', result.sessionId);
};
`);

console.log('\nSTEP 2: Check Browserbase Dashboard\n');
console.log('1. Clear ALL sessions in Browserbase dashboard');
console.log('2. Start fresh - no sessions should exist');
console.log('3. Start automation from frontend');
console.log('4. Immediately check Browserbase dashboard');
console.log('5. Note BOTH session IDs that appear');
console.log('');

console.log('STEP 3: Cross-reference Session IDs\n');
console.log('Fill in these values:');
console.log('');
console.log('Frontend console shows sessionId: ________________');
console.log('Backend logs show sessionId:      ________________');
console.log('Browserbase shows session 1:      ________________');
console.log('Browserbase shows session 2:      ________________');
console.log('');

console.log('STEP 4: Check Session Details in Browserbase\n');
console.log('For EACH session in Browserbase dashboard:');
console.log('1. Click on the session');
console.log('2. Check the "Created at" timestamp');
console.log('3. Check if it has a Context ID');
console.log('4. Check the Session ID');
console.log('5. Check any metadata or tags');
console.log('');

console.log('STEP 5: Test the Debug URL Theory\n');
console.log('1. Get the liveViewUrl from the API response');
console.log('2. DO NOT embed it in an iframe yet');
console.log('3. Check Browserbase - should be only 1 session');
console.log('4. Now paste the URL in a browser tab');
console.log('5. Check Browserbase again - still 1 session?');
console.log('');

console.log('STEP 6: Check for Stale Sessions\n');
console.log('Run this SQL query in Supabase:');
console.log(`
SELECT 
  id,
  browserbase_session_id,
  status,
  created_at,
  updated_at
FROM linkedin_sessions
WHERE user_id = 'YOUR_USER_ID'
ORDER BY created_at DESC
LIMIT 10;
`);

console.log('\nSTEP 7: Add More Backend Logging\n');
console.log('Add this to your backend createBrowserbaseSession method:');
console.log(`
console.log('[BROWSERBASE API] Request to create session:', {
  url: \`\${this.baseUrl}/sessions\`,
  projectId: body.projectId,
  contextId: body.browserSettings?.context?.id,
  timestamp: new Date().toISOString()
});

// After response
console.log('[BROWSERBASE API] Session created:', {
  sessionId: response.id,
  status: response.status,
  timestamp: new Date().toISOString()
});
`);

console.log('\nPOSSIBLE EXPLANATIONS:\n');
console.log('1. OLD SESSION: One session is from a previous attempt');
console.log('   - Check timestamps in Browserbase dashboard');
console.log('');
console.log('2. CONTEXT SESSION: Context creation might show as a session');
console.log('   - Check if one session has no automation running');
console.log('');
console.log('3. IFRAME BEHAVIOR: The iframe might be doing something unexpected');
console.log('   - Test without embedding the iframe');
console.log('');
console.log('4. DIFFERENT IDs: Frontend and backend have different session IDs');
console.log('   - Compare all 4 IDs from Step 3');
console.log('');

console.log('===========================================');
console.log('Run through these steps and report back:');
console.log('1. What are the 4 session IDs?');
console.log('2. What are the timestamps?');
console.log('3. Does NOT embedding the iframe change anything?');
console.log('4. Are both sessions "RUNNING" or is one different?');
console.log('===========================================\n');