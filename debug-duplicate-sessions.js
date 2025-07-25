#!/usr/bin/env node

/**
 * Duplicate Session Debugging Script
 * 
 * This script helps identify why two Browserbase sessions are being created
 * when the frontend only calls one backend endpoint.
 */

const readline = require('readline');
const https = require('https');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           BROWSERBASE DUPLICATE SESSION DEBUGGER                 ║
╚══════════════════════════════════════════════════════════════════╝

This interactive debugger will help identify why you're seeing 2 sessions.

WHAT WE KNOW:
✓ Frontend has NO Browserbase code/references
✓ Frontend only calls ONE endpoint: POST /api/linkedin/start
✓ Backend logs show only ONE session being created
✓ No proxy functions (Netlify, etc.) are being used
✗ BUT: Two sessions appear in Browserbase dashboard

THEORIES TO TEST:
1. The debug URL creates a viewer session when loaded in iframe
2. One session is stale from a previous run
3. Browser is making duplicate requests
4. CORS preflight is triggering something
5. Frontend is retrying the request

Let's investigate...
`);

const questions = [
  {
    id: 'clear_sessions',
    prompt: '\n1. Have you cleared ALL sessions in Browserbase dashboard? (yes/no): ',
    validate: (answer) => ['yes', 'no'].includes(answer.toLowerCase())
  },
  {
    id: 'network_tab',
    prompt: '\n2. Open browser DevTools Network tab. How many requests to /api/linkedin/start do you see? ',
    validate: (answer) => !isNaN(parseInt(answer))
  },
  {
    id: 'start_automation',
    prompt: '\n3. Now start automation from frontend. Press ENTER when done: ',
    validate: () => true
  },
  {
    id: 'session_count',
    prompt: '\n4. How many sessions do you see in Browserbase dashboard now? ',
    validate: (answer) => !isNaN(parseInt(answer))
  },
  {
    id: 'session_ids',
    prompt: '\n5. List ALL session IDs from Browserbase (comma-separated): ',
    validate: (answer) => answer.trim().length > 0
  },
  {
    id: 'backend_session_id',
    prompt: '\n6. What session ID does the backend log show? ',
    validate: (answer) => answer.trim().length > 0
  },
  {
    id: 'frontend_session_id',
    prompt: '\n7. What session ID does the frontend receive/display? ',
    validate: (answer) => answer.trim().length > 0
  }
];

async function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question.prompt, (answer) => {
      if (question.validate(answer)) {
        resolve(answer);
      } else {
        console.log('Invalid answer. Please try again.');
        resolve(askQuestion(question));
      }
    });
  });
}

async function runDebugger() {
  const answers = {};
  
  for (const question of questions) {
    answers[question.id] = await askQuestion(question);
  }
  
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('                    ANALYSIS RESULTS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Analyze the results
  const networkRequests = parseInt(answers.network_tab);
  const sessionCount = parseInt(answers.session_count);
  const browserbaseSessions = answers.session_ids.split(',').map(s => s.trim());
  const backendSessionId = answers.backend_session_id.trim();
  const frontendSessionId = answers.frontend_session_id.trim();
  
  console.log('📊 DATA COLLECTED:');
  console.log(`   • Network requests to /api/linkedin/start: ${networkRequests}`);
  console.log(`   • Sessions in Browserbase: ${sessionCount}`);
  console.log(`   • Browserbase session IDs: ${browserbaseSessions.join(', ')}`);
  console.log(`   • Backend logged session: ${backendSessionId}`);
  console.log(`   • Frontend received session: ${frontendSessionId}`);
  
  console.log('\n🔍 ANALYSIS:\n');
  
  // Check if backend session matches any Browserbase session
  const backendMatchesBrowserbase = browserbaseSessions.includes(backendSessionId);
  const frontendMatchesBackend = frontendSessionId === backendSessionId;
  const frontendMatchesBrowserbase = browserbaseSessions.includes(frontendSessionId);
  
  if (networkRequests > 1) {
    console.log('❗ ISSUE FOUND: Multiple network requests detected!');
    console.log('   → The frontend is making ${networkRequests} requests to start automation');
    console.log('   → This could be due to:');
    console.log('     • React StrictMode (double-rendering in development)');
    console.log('     • Retry logic in the API client');
    console.log('     • User double-clicking the start button');
    console.log('\n   SOLUTION: Add request deduplication or disable StrictMode');
  }
  
  if (!backendMatchesBrowserbase) {
    console.log('❗ ISSUE FOUND: Backend session ID not in Browserbase!');
    console.log(`   → Backend created: ${backendSessionId}`);
    console.log(`   → But Browserbase shows: ${browserbaseSessions.join(', ')}`);
    console.log('   → This suggests the backend session creation failed or was replaced');
  }
  
  if (!frontendMatchesBackend) {
    console.log('❗ ISSUE FOUND: Frontend and backend have different session IDs!');
    console.log(`   → Backend sent: ${backendSessionId}`);
    console.log(`   → Frontend shows: ${frontendSessionId}`);
    console.log('   → This suggests a communication issue or data transformation problem');
  }
  
  // Check for the debug URL theory
  if (sessionCount === 2 && backendMatchesBrowserbase) {
    console.log('🎯 LIKELY CAUSE: Debug URL iframe is creating a viewer session!');
    console.log('   → One session is the actual automation session');
    console.log('   → The other is created when the debug URL is loaded in iframe');
    console.log('\n   TEST THIS THEORY:');
    console.log('   1. Start automation but DON\'T embed the liveViewUrl in iframe');
    console.log('   2. Check Browserbase - should show only 1 session');
    console.log('   3. Now load the liveViewUrl in iframe');
    console.log('   4. Check again - if 2 sessions appear, theory confirmed!');
  }
  
  console.log('\n📋 NEXT STEPS:\n');
  console.log('1. Add this to your frontend to track requests:');
  console.log(`
   // In your API client
   let requestCount = 0;
   const startJobSearch = async (config) => {
     requestCount++;
     console.log(\`[API] Request #\${requestCount} to /api/linkedin/start\`);
     const response = await fetch(...);
     console.log(\`[API] Response #\${requestCount}:\`, response);
     return response.json();
   };
`);
  
  console.log('\n2. Add this to your backend to detect duplicate requests:');
  console.log(`
   // In your controller
   const requestMap = new Map();
   
   async startAutomation(req, res) {
     const userId = req.user.id;
     const requestKey = \`\${userId}-\${Date.now()}\`;
     
     // Check for recent duplicate
     const recentRequest = Array.from(requestMap.entries())
       .find(([key, time]) => key.startsWith(userId) && Date.now() - time < 5000);
     
     if (recentRequest) {
       console.warn('[DUPLICATE] Request within 5 seconds!');
     }
     
     requestMap.set(requestKey, Date.now());
     // ... rest of your code
   }
`);
  
  console.log('\n3. Test the iframe theory:');
  console.log('   • Start automation without embedding the iframe');
  console.log('   • Note session count in Browserbase');
  console.log('   • Then embed the iframe and check again');
  
  console.log('\n═══════════════════════════════════════════════════════════════\n');
  
  rl.close();
}

// Run the debugger
runDebugger().catch(console.error);