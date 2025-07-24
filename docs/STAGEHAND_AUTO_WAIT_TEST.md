# Stagehand Test with Auto-Wait for Login

This test will detect if you're not logged in, then wait for you to log in manually and automatically continue.

```javascript
console.log('🚀 Starting LinkedIn Automation Test with Auto-Wait\n');

// Initialize Stagehand
const { Stagehand } = require('@browserbasehq/stagehand');
const { z } = require('zod');

// Configure with better model and regional settings
const stagehand = new Stagehand({
  modelName: "anthropic/claude-3-5-sonnet-20241022", // More capable model
  browserOptions: {
    // Set browser context for Asian region
    locale: 'en-SG',  // Singapore English (change to your preference)
    timezoneId: 'Asia/Singapore',
    
    // Additional browser settings for better compatibility
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    
    // Other Asian locale options you can try:
    // locale: 'en-IN', timezoneId: 'Asia/Kolkata'  // India
    // locale: 'en-PH', timezoneId: 'Asia/Manila'   // Philippines
    // locale: 'en-HK', timezoneId: 'Asia/Hong_Kong' // Hong Kong
    // locale: 'ja-JP', timezoneId: 'Asia/Tokyo'    // Japan
  }
});

console.log('🌏 Using Asian region settings (Singapore)');
console.log('🤖 Using Claude 3.5 Sonnet for better accuracy\n');

await stagehand.init();

const page = stagehand.page;

// Navigate to LinkedIn
console.log('📍 Navigating to LinkedIn Jobs...');
await page.goto('https://www.linkedin.com/jobs/');
await page.waitForTimeout(3000);

// Step 1: Check login status
console.log('\n🔐 Step 1: Checking authentication status...\n');

let loginStatus = await page.extract({
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

// Step 2: Wait for login if needed
if (!loginStatus.isLoggedIn) {
  console.log('\n' + '='.repeat(50));
  console.log('🔴 INTERVENTION REQUIRED: USER NOT LOGGED IN');
  console.log('='.repeat(50));
  
  console.log('\n⏳ WAITING FOR YOU TO LOG IN...');
  console.log('Please log in to LinkedIn in this browser window.');
  console.log('The test will automatically continue once you\'re logged in.\n');
  
  // Keep checking every 5 seconds until logged in
  let checkCount = 0;
  while (!loginStatus.isLoggedIn && checkCount < 60) { // Max 5 minutes wait
    console.log(`⏳ Checking login status... (${checkCount * 5} seconds elapsed)`);
    await page.waitForTimeout(5000);
    
    // Re-check login status
    loginStatus = await page.extract({
      instruction: "Check if the user is now logged into LinkedIn by looking for job search functionality or if login forms are gone",
      schema: z.object({
        isLoggedIn: z.boolean(),
        currentUrl: z.string().optional()
      })
    });
    
    checkCount++;
  }
  
  if (loginStatus.isLoggedIn) {
    console.log('\n✅ LOGIN DETECTED! Continuing automation...\n');
    // Wait a bit for page to stabilize after login
    await page.waitForTimeout(3000);
  } else {
    console.log('\n❌ Timeout waiting for login (5 minutes). Please run the test again.');
    return;
  }
}

console.log('\n✅ User is logged in! Continuing with automation...\n');

// Step 3: Navigate to jobs page (login often redirects to home feed)
console.log('📍 Navigating to LinkedIn Jobs page...');
await page.goto('https://www.linkedin.com/jobs/', { waitUntil: 'networkidle' });
console.log('⏳ Waiting for page to fully load...');
await page.waitForTimeout(5000); // Give LinkedIn time to fully load

// Verify we're on the jobs page
const pageCheck = await page.extract({
  instruction: "Check if we're on the LinkedIn Jobs page with search functionality visible",
  schema: z.object({
    isOnJobsPage: z.boolean(),
    hasSearchBox: z.boolean(),
    currentUrl: z.string()
  })
});

console.log('Page check:', JSON.stringify(pageCheck, null, 2));

if (!pageCheck.hasSearchBox) {
  console.log('⚠️  Search functionality not visible, waiting a bit more...');
  await page.waitForTimeout(3000);
}

// Step 4: Perform job search
console.log('\n🔍 Performing job search...');
console.log('Query: "Software engineering jobs in Vancouver, BC"\n');

try {
  // Try multiple approaches to ensure search works
  const searchApproach1 = await page.act({
    action: "Click on the job search box and type 'Software engineering'"
  });
  
  await page.waitForTimeout(1000);
  
  const searchApproach2 = await page.act({
    action: "Click on the location field and type 'Vancouver, BC'"
  });
  
  await page.waitForTimeout(1000);
  
  const searchApproach3 = await page.act({
    action: "Click the search button or press Enter to search"
  });
  
  console.log('⏳ Waiting for search results to load...');
  await page.waitForTimeout(5000);
  console.log('✅ Search completed\n');
} catch (error) {
  console.log('❌ Search failed:', error.message);
  console.log('Trying alternative search method...');
  
  // Alternative: Direct navigation to search URL
  try {
    const searchUrl = 'https://www.linkedin.com/jobs/search/?keywords=Software%20engineering&location=Vancouver%2C%20BC';
    console.log('📍 Navigating directly to search results...');
    await page.goto(searchUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    console.log('✅ Direct navigation successful\n');
  } catch (navError) {
    console.log('❌ Direct navigation also failed:', navError.message);
  }
}

// Step 5: Extract job listings
console.log('📋 Extracting job listings...\n');

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
  
  // Step 6: Test clicking on a job
  if (jobData.jobs.length > 0) {
    console.log('📋 Testing job interaction...\n');
    
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
console.log('This demonstrates the full LinkedIn automation flow with auto-wait for login.');
```

## Key Features:

1. **Auto-Wait Loop**: If not logged in, it enters a loop that checks every 5 seconds
2. **Visual Progress**: Shows elapsed time while waiting
3. **Auto-Continue**: Once login is detected, it automatically continues
4. **Timeout Protection**: Stops after 5 minutes to prevent infinite loops
5. **Page Navigation**: Goes back to jobs page after login if needed

This mimics how your actual backend works - it detects the need for intervention, waits for the user to complete it, then automatically continues!