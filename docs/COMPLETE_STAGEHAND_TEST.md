# Complete Stagehand Test Script

Copy this entire script into Browserbase playground, then run it directly (no need to convert):

```javascript
console.log('🚀 Starting LinkedIn Automation Test with Login Detection\n');

// Initialize Stagehand
const { Stagehand } = require('@browserbasehq/stagehand');
const { z } = require('zod');

const stagehand = new Stagehand({
  modelName: "google/gemini-2.0-flash-exp",
});
await stagehand.init();

const page = stagehand.page;

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
  
  return;
}

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
  
  // Step 5: Test clicking on a job
  if (jobData.jobs.length > 0) {
    console.log('📋 Step 4: Testing job interaction...\n');
    
    try {
      await page.act({
        action: `Click on the first job listing: "${jobData.jobs[0].title}" at "${jobData.jobs[0].company}"`
      });
      
      await page.waitForTimeout(2000);
      console.log('✅ Successfully clicked on job\n');
      
      // Check for apply buttons
      const applyStatus = await page.extract({
        instruction: "Check what apply options are available for this job",
        schema: z.object({
          hasEasyApply: z.boolean(),
          hasExternalApply: z.boolean(),
          applyButtonText: z.string().optional()
        })
      });
      
      console.log('Apply Options:', JSON.stringify(applyStatus, null, 2));
      
    } catch (error) {
      console.log('❌ Job interaction failed:', error.message);
    }
  }
  
} catch (error) {
  console.log('❌ Job extraction failed:', error.message);
}

console.log('\n✅ Test complete!');
console.log('This demonstrates how your backend handles login detection and job automation.');
```

## What Browserbase Does When Converting:

1. **Adds Stagehand initialization** at the top:
   ```javascript
   const stagehand = new Stagehand({
     modelName: "google/gemini-2.0-flash-exp",
   });
   await stagehand.init();
   const page = stagehand.page;
   ```

2. **Converts complex actions** to observe/act pattern:
   ```javascript
   // Instead of one act() call, it uses:
   const [action] = await page.observe("description");
   await page.act(action);
   ```

3. **Keeps extract() calls** mostly the same since they're already AI-powered

4. **Adds z (Zod) import** automatically

The script above is written to work well with their conversion process!