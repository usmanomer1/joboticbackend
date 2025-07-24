# Simple Stagehand Agent Test for LinkedIn

This is a much simpler test using Stagehand's agent mode, which is what your backend actually uses.

## Test Script for Browserbase Playground

Copy this entire script and paste it in Browserbase playground, then click "Convert to Stagehand":

```javascript
// ===== STAGEHAND AGENT TEST FOR LINKEDIN =====
console.log('🚀 Starting Stagehand Agent Test\n');

// Navigate to LinkedIn
await page.goto('https://www.linkedin.com/jobs/');

// Test 1: Check if we're logged into LinkedIn
console.log('📋 Test 1: Checking LinkedIn login status...\n');

const loginCheck = await agent.execute(
  "Check if I'm logged into LinkedIn. Look for login forms, 'Sign in' buttons, or if I can see the job search interface."
);

console.log('Login Check Result:', loginCheck.message);
console.log('Actions taken:', JSON.stringify(loginCheck.actions, null, 2));

// If not logged in, the test stops here (as expected)
if (loginCheck.message.toLowerCase().includes('not logged in') || 
    loginCheck.message.toLowerCase().includes('sign in') ||
    loginCheck.message.toLowerCase().includes('login')) {
  console.log('\n✅ LOGIN DETECTION SUCCESSFUL!');
  console.log('=====================================');
  console.log('The agent correctly detected that login is required.');
  console.log('\nIn your actual app:');
  console.log('1. Session status → INTERVENTION_REQUIRED');
  console.log('2. User logs in manually');
  console.log('3. User clicks "Continue" in app');
  console.log('4. Automation resumes\n');
  console.log('💡 Next: Log in manually, then run test again');
  return;
}

// Test 2: Natural Language Job Search
console.log('\n📋 Test 2: Natural Language Job Search...\n');

const searchResult = await agent.execute(
  "Search for software engineering jobs in Vancouver, BC with good benefits and remote options"
);

console.log('Search Result:', searchResult.message);
console.log('Actions:', JSON.stringify(searchResult.actions, null, 2));

// Test 3: Extract Job Listings
console.log('\n📋 Test 3: Extracting Job Listings...\n');

const jobsResult = await agent.execute(
  "Extract the first 5 job listings showing the title, company, location, and whether it's Easy Apply"
);

console.log('Jobs Found:', jobsResult.message);

// Test 4: Click on a Job
console.log('\n📋 Test 4: Testing Job Interaction...\n');

const clickResult = await agent.execute(
  "Click on the first job listing to view its details"
);

console.log('Click Result:', clickResult.message);

// Test 5: Check Apply Button
console.log('\n📋 Test 5: Checking Apply Options...\n');

const applyCheck = await agent.execute(
  "Check if this job has an Easy Apply button or regular Apply button"
);

console.log('Apply Options:', applyCheck.message);

console.log('\n✅ Test Complete!');
console.log('================');
console.log('This demonstrates how your backend uses Stagehand agent mode.');
```

## Even Simpler One-Command Test

If you just want to test login detection with one command:

```javascript
// Super simple login test
const agent = stagehand.agent();
await stagehand.page.goto('https://www.linkedin.com/jobs/');

const result = await agent.execute(
  "Am I logged into LinkedIn? If not, what login elements do you see?"
);

console.log('Result:', result.message);
```

## Why This Approach is Better

1. **Matches Your Implementation**: Your backend uses Stagehand's agent mode, not manual DOM manipulation
2. **Simpler**: No need for complex dual-mode code or Zod schemas
3. **More Reliable**: Let the AI figure out the page state instead of hardcoding selectors
4. **Cleaner**: The agent handles all the complexity

## How to Run

1. Copy either script above
2. Paste in Browserbase playground
3. Click "Convert to Stagehand" 
4. Click "Run"

The agent will tell you if you're logged in or not, and demonstrate the same flow your backend uses.