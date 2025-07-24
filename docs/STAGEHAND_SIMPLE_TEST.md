# Simple Stagehand Test for LinkedIn (Browserbase Compatible)

Based on how Browserbase actually implements Stagehand, here's a simple test that should work.

## Test Script

Copy this and paste in Browserbase playground, then click "Convert to Stagehand":

```javascript
// ===== SIMPLE STAGEHAND LINKEDIN TEST =====
console.log('🚀 Starting Stagehand LinkedIn Test\n');

// Navigate to LinkedIn
console.log('📍 Navigating to LinkedIn Jobs...');
await page.goto('https://www.linkedin.com/jobs/');
await page.waitForTimeout(3000);

// Test 1: Check login status using Stagehand
console.log('\n📋 Test 1: Checking if logged in...\n');

try {
  // Use Stagehand's act method to check the page
  await page.act({
    action: "Look at the page and tell me: Am I logged into LinkedIn? Can you see a login form or sign-in button?"
  });
  
  // If we can perform actions, we might be logged in
  console.log('✅ Stagehand executed successfully');
  
  // Try to search for jobs
  console.log('\n📋 Test 2: Attempting job search...\n');
  
  await page.act({
    action: "Search for software engineering jobs in Vancouver"
  });
  
  console.log('✅ Search action completed');
  
  // Extract some job data
  console.log('\n📋 Test 3: Extracting job listings...\n');
  
  const jobData = await page.extract({
    instruction: "Find up to 3 job listings and extract their titles and companies",
    schema: z.object({
      jobs: z.array(z.object({
        title: z.string(),
        company: z.string()
      }))
    })
  });
  
  console.log('Jobs found:', JSON.stringify(jobData, null, 2));
  
} catch (error) {
  console.log('❌ Error:', error.message);
  console.log('\nThis might mean:');
  console.log('1. You need to log in first');
  console.log('2. The page structure has changed');
  console.log('3. Stagehand needs different instructions');
}

console.log('\n✅ Test complete!');
```

## Even Simpler Version

If the above doesn't work, try this minimal test:

```javascript
// Super simple test
console.log('Starting simple test...');

await page.goto('https://www.linkedin.com/jobs/');
await page.waitForTimeout(2000);

// Just try one simple action
await page.act({
  action: "Click on the sign in button if you see one, otherwise tell me what you see on the page"
});

console.log('Action completed');
```

## Notes

1. Browserbase's Stagehand implementation adds methods directly to the `page` object
2. The main methods are `page.act()` for actions and `page.extract()` for data extraction
3. When you click "Convert to Stagehand", it automatically handles the setup

Try the simple version first to see if Stagehand is working correctly in your Browserbase environment.