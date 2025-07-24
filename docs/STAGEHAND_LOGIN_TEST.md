# Stagehand Login Detection Test (Proper Implementation)

This test mimics how your actual backend handles login detection and intervention.

## Test Script

Copy this entire script and paste in Browserbase playground, then click "Convert to Stagehand":

```javascript
console.log('🚀 Starting LinkedIn Automation Test with Login Detection\n');

// Navigate to LinkedIn
console.log('📍 Navigating to LinkedIn Jobs...');
await page.goto('https://www.linkedin.com/jobs/');
await page.waitForTimeout(3000);

// Step 1: Check login status
console.log('\n🔐 Step 1: Checking authentication status...\n');

const loginStatus = await page.extract({
  instruction: "Check if the user is logged into LinkedIn. Look for: 1) Login forms or sign-in buttons, 2) Whether you can see job search inputs, 3) Whether there are job listings visible",
  schema: z.object({
    isLoggedIn: z.boolean().describe("True if user is logged in"),
    hasLoginForm: z.boolean().describe("True if login form is visible"),
    hasSignInButton: z.boolean().describe("True if sign-in button is visible"),
    canSeeJobSearch: z.boolean().describe("True if job search interface is visible"),
    canSeeJobListings: z.boolean().describe("True if job listings are visible"),
    pageIndicators: z.string().describe("What indicators you see on the page")
  })
});

console.log('Login Status:', JSON.stringify(loginStatus, null, 2));

// Step 2: Handle login requirement
if (!loginStatus.isLoggedIn) {
  console.log('\n' + '='.repeat(50));
  console.log('🔴 INTERVENTION REQUIRED: USER NOT LOGGED IN');
  console.log('='.repeat(50));
  
  console.log('\n✅ LOGIN DETECTION SUCCESSFUL!');
  console.log('The automation correctly detected that login is required.\n');
  
  console.log('📋 What happens in your actual app:');
  console.log('1. Session status → INTERVENTION_REQUIRED');
  console.log('2. User gets notification to log in');
  console.log('3. User logs in manually in Browserbase');
  console.log('4. User clicks "Continue" in your app');
  console.log('5. Automation resumes from this point\n');
  
  console.log('🛑 AUTOMATION STOPPED - Login required');
  console.log('💡 Next: Log in manually, then run this test again\n');
  
  // Stop execution here - this is what your backend does
  return;
}

// If we get here, user is logged in
console.log('\n✅ User is logged in! Continuing with automation...\n');

// Step 3: Perform job search
console.log('🔍 Step 2: Performing job search...');
console.log('Query: "Software engineering jobs in Vancouver, BC"\n');

try {
  await page.act({
    action: "Search for software engineering jobs in Vancouver, BC"
  });
  
  await page.waitForTimeout(3000);
  console.log('✅ Search completed\n');
} catch (error) {
  console.log('❌ Search failed:', error.message);
}

// Step 4: Extract job listings
console.log('📋 Step 3: Extracting job listings...\n');

try {
  const jobData = await page.extract({
    instruction: "Extract up to 5 job listings with their title, company, location, and whether it's Easy Apply",
    schema: z.object({
      jobs: z.array(z.object({
        title: z.string(),
        company: z.string(),
        location: z.string(),
        isEasyApply: z.boolean()
      })).max(5)
    })
  });
  
  console.log(`Found ${jobData.jobs.length} jobs:\n`);
  jobData.jobs.forEach((job, index) => {
    console.log(`${index + 1}. ${job.title}`);
    console.log(`   Company: ${job.company}`);
    console.log(`   Location: ${job.location}`);
    console.log(`   Easy Apply: ${job.isEasyApply ? '✅' : '❌'}\n`);
  });
} catch (error) {
  console.log('❌ Job extraction failed:', error.message);
}

console.log('\n✅ Test complete!');
console.log('This demonstrates how your backend handles login detection and job automation.');
```

## Key Points

1. **Login Detection First**: The test checks login status before trying any actions
2. **Stops When Not Logged In**: If not logged in, it stops execution (just like your backend)
3. **Clear Intervention Message**: Shows exactly what happens in your app
4. **Continues Only When Logged In**: Job search only happens if user is authenticated

## How Your Backend Works

Your actual backend implementation:
1. Detects login state using Stagehand
2. Returns `INTERVENTION_REQUIRED` status if not logged in
3. Pauses the session and waits for user to log in
4. Resumes automation after user confirms login

This test mimics that exact behavior!