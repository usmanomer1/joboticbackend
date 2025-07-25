const fetch = require('node-fetch');

// IMPORTANT: The frontend and backend are creating SEPARATE Browserbase sessions!
// This script helps diagnose where the frontend is creating its own session.

console.log(`
=== DUAL SESSION DIAGNOSIS ===

PROBLEM: Two Browserbase sessions are being created:
1. Session A - Created by frontend, controls the iframe view
2. Session B - Created by backend, runs the automation

EVIDENCE:
- Closing Session A in Browserbase UI → Frontend stops working, backend continues
- Closing Session B in Browserbase UI → Backend logs "session stopped", frontend continues

POSSIBLE CAUSES:
1. Frontend is making direct Browserbase API calls
2. The liveViewUrl is creating a new session when embedded
3. Frontend is using Browserbase SDK directly
4. There's a proxy or middleware creating sessions
5. Frontend is calling a different endpoint

WHAT TO CHECK:
`);

console.log(`
1. CHECK FRONTEND CODE FOR:
   - Direct Browserbase API calls (search for browserbase.com)
   - Browserbase SDK imports (@browserbasehq/sdk)
   - Any other endpoints that might create sessions
   - How the iframe is being embedded

2. CHECK NETWORK TAB:
   - Filter by "browserbase"
   - Look for API calls to api.browserbase.com
   - Check if embedding the iframe makes API calls

3. COMPARE SESSION IDs:
   - Frontend sessionId: Check what's stored in localStorage/state
   - Backend sessionId: Check server logs
   - Browserbase UI: Check both session IDs

4. TEST THE IFRAME URL:
   - Copy the liveViewUrl from the API response
   - Open it in a new tab
   - Check if it creates a new session in Browserbase UI

5. CHECK FOR THESE PATTERNS IN FRONTEND:
`);

const patternsToCheck = [
  'new Browserbase',
  'browserbase.createSession',
  'api.browserbase.com',
  '@browserbasehq',
  'BROWSERBASE_API_KEY',
  'BROWSERBASE_PROJECT_ID',
  'iframe.onload',
  'postMessage.*browserbase',
  'window.open.*browserbase'
];

patternsToCheck.forEach(pattern => {
  console.log(`   - "${pattern}"`);
});

console.log(`
6. ASK THE FRONTEND DEVELOPER:
   - Are you using any Browserbase SDK or API directly?
   - Is there any code that creates browser sessions?
   - How exactly is the iframe being embedded?
   - Are there any environment variables for Browserbase?

7. SPECIFIC THINGS TO LOOK FOR:
`);

// Show what to look for in the frontend code
const frontendChecks = `
// Check if frontend has Browserbase config
const BROWSERBASE_API_KEY = import.meta.env.VITE_BROWSERBASE_API_KEY;
const BROWSERBASE_PROJECT_ID = import.meta.env.VITE_BROWSERBASE_PROJECT_ID;

// Check if frontend is creating sessions
const browserbase = new Browserbase({ apiKey: BROWSERBASE_API_KEY });
const session = await browserbase.createSession({ ... });

// Check iframe implementation
<iframe 
  src={liveViewUrl}  // Is this URL creating a new session?
  onLoad={(e) => {
    // Is there any session creation here?
  }}
/>

// Check for any proxy endpoints
fetch('/api/browserbase/create-session')  // Different endpoint?
`;

console.log(frontendChecks);

console.log(`
8. SOLUTION APPROACHES:

Option A: Use Only Backend Session
- Frontend should ONLY use the sessionId from backend
- Frontend should NEVER create its own sessions
- All Browserbase operations go through backend

Option B: Share Session Context
- If frontend needs direct access, share the session ID
- Use the same Browserbase session for both

Option C: Coordinate Sessions
- If both need sessions, explicitly coordinate them
- Track which session is for what purpose

NEXT STEPS:
1. Search frontend codebase for the patterns above
2. Check browser Network tab when starting automation
3. Compare the session IDs in all three places
4. Identify where the second session is created
`);

// Test helper to check if URL creates a new session
console.log(`
=== TEST THE LIVE VIEW URL ===

Run this test to see if the liveViewUrl creates a new session:

1. Start your backend
2. Make a request to create a session
3. Copy the liveViewUrl from the response
4. Open Browserbase dashboard and note current sessions
5. Open the liveViewUrl in a new browser tab
6. Check if a new session appeared in Browserbase dashboard

If a new session appears, the iframe URL is creating sessions!
`);