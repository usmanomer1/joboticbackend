# Robust Stagehand Test with Better Error Handling

This version handles network issues and page loading problems more gracefully.

```javascript
console.log('🚀 Starting Robust LinkedIn Test\n');

// Initialize Stagehand
const { Stagehand } = require('@browserbasehq/stagehand');
const { z } = require('zod');

const stagehand = new Stagehand({
  modelName: "anthropic/claude-3-5-sonnet-20241022",
  browserOptions: {
    // Simpler configuration to avoid issues
    viewport: { width: 1280, height: 720 },
    // Remove locale/timezone to use default
  }
});

await stagehand.init();
const page = stagehand.page;

// Helper function to safely navigate with retries
async function safeNavigate(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`📍 Attempting to navigate to ${url} (attempt ${i + 1}/${maxRetries})...`);
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', // Less strict than networkidle
        timeout: 30000 
      });
      console.log('✅ Navigation successful');
      return true;
    } catch (error) {
      console.log(`⚠️ Navigation attempt ${i + 1} failed: ${error.message}`);
      if (i < maxRetries - 1) {
        console.log('⏳ Waiting 5 seconds before retry...');
        await page.waitForTimeout(5000);
      }
    }
  }
  return false;
}

// Start test
console.log('📋 Test 1: Navigate to LinkedIn\n');

if (!await safeNavigate('https://www.linkedin.com/jobs/')) {
  console.log('❌ Failed to load LinkedIn. This might be due to:');
  console.log('   - Network/proxy issues in Browserbase');
  console.log('   - Regional blocking');
  console.log('   - LinkedIn detecting automation');
  console.log('\n💡 Try: Refreshing the browser or using a different Browserbase session');
  return;
}

await page.waitForTimeout(3000);

// Simple login check
console.log('\n📋 Test 2: Check if logged in\n');

try {
  const loginCheck = await page.extract({
    instruction: "Am I logged into LinkedIn? Just tell me yes or no based on what you see.",
    schema: z.object({
      isLoggedIn: z.boolean(),
      whatYouSee: z.string().describe("Brief description of what's on the page")
    })
  });
  
  console.log('Login status:', loginCheck.isLoggedIn ? 'Logged in ✅' : 'Not logged in ❌');
  console.log('Page content:', loginCheck.whatYouSee);
  
  if (!loginCheck.isLoggedIn) {
    console.log('\n⏳ Waiting for manual login...');
    console.log('Please log in, then the test will continue automatically.\n');
    
    // Check every 10 seconds (less frequent to avoid issues)
    let attempts = 0;
    while (attempts < 30) { // 5 minutes max
      await page.waitForTimeout(10000);
      attempts++;
      
      console.log(`⏳ Checking... (${attempts * 10} seconds elapsed)`);
      
      try {
        const recheck = await page.extract({
          instruction: "Check if logged into LinkedIn now",
          schema: z.object({ isLoggedIn: z.boolean() })
        });
        
        if (recheck.isLoggedIn) {
          console.log('\n✅ Login detected! Continuing...\n');
          break;
        }
      } catch (error) {
        console.log('⚠️ Check failed, will retry...');
      }
    }
  }
  
} catch (error) {
  console.log('❌ Login check failed:', error.message);
  console.log('The page might not have loaded properly.');
}

// Try a simple search
console.log('\n📋 Test 3: Simple job search\n');

try {
  // Direct URL navigation as fallback
  const searchUrl = 'https://www.linkedin.com/jobs/search/?keywords=software%20engineer&location=Singapore';
  console.log('📍 Navigating directly to search results...');
  
  if (await safeNavigate(searchUrl)) {
    await page.waitForTimeout(5000);
    
    // Extract whatever we can see
    const pageContent = await page.extract({
      instruction: "What do you see on this page? Are there any job listings?",
      schema: z.object({
        hasJobs: z.boolean(),
        description: z.string()
      })
    });
    
    console.log('Page analysis:', pageContent.description);
    console.log('Jobs visible:', pageContent.hasJobs ? 'Yes ✅' : 'No ❌');
  }
  
} catch (error) {
  console.log('❌ Search test failed:', error.message);
}

console.log('\n✅ Test complete!');
console.log('\nIf you experienced loading issues, try:');
console.log('1. Using a fresh Browserbase session');
console.log('2. Checking if LinkedIn works manually in the browser first');
console.log('3. Using a VPN or different region in Browserbase');
```

## Alternative: Simple Direct Test

If the above still has issues, try this minimal version:

```javascript
// Super simple test - just check what loads
const { Stagehand } = require('@browserbasehq/stagehand');
const { z } = require('zod');

const stagehand = new Stagehand({
  modelName: "anthropic/claude-3-5-sonnet-20241022"
});

await stagehand.init();
const page = stagehand.page;

console.log('Going to LinkedIn...');
try {
  await page.goto('https://www.linkedin.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  const result = await page.extract({
    instruction: "What website is this and what do you see?",
    schema: z.object({
      site: z.string(),
      content: z.string()
    })
  });
  
  console.log('Result:', result);
} catch (error) {
  console.log('Error:', error.message);
}
```

## Why These Network Errors Occur:

1. **Browserbase Proxy Issues**: The `ERR_TUNNEL_CONNECTION_FAILED` suggests proxy/tunnel problems
2. **LinkedIn Security**: LinkedIn aggressively blocks automation and may detect Browserbase IPs
3. **Regional Restrictions**: Some regions may have additional blocking
4. **Resource Loading**: WebGL and other resource errors suggest heavy page resources failing to load

The robust version above handles these issues by:
- Using retry logic for navigation
- Less strict page load waiting
- Simpler checks that don't rely on specific page elements
- Direct URL navigation as fallback
- Better error messages to diagnose issues