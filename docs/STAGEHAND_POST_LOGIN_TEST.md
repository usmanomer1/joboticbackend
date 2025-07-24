# Stagehand Test - Handling Post-Login LinkedIn Issues

This test focuses on the specific problem where LinkedIn doesn't load properly AFTER login.

```javascript
console.log('🚀 LinkedIn Post-Login Loading Test\n');

const { Stagehand } = require('@browserbasehq/stagehand');
const { z } = require('zod');

const stagehand = new Stagehand({
  modelName: "anthropic/claude-3-5-sonnet-20241022",
});

await stagehand.init();
const page = stagehand.page;

// Navigate to LinkedIn
console.log('📍 Going to LinkedIn...');
await page.goto('https://www.linkedin.com/jobs/');
await page.waitForTimeout(3000);

// Check if logged in
const loginCheck = await page.extract({
  instruction: "Am I logged into LinkedIn?",
  schema: z.object({
    isLoggedIn: z.boolean(),
    currentUrl: z.string().optional()
  })
});

if (!loginCheck.isLoggedIn) {
  console.log('⏳ Not logged in. Please log in manually...\n');
  console.log('IMPORTANT: After logging in, LinkedIn might show a blank/loading page.');
  console.log('This test will handle that issue.\n');
  
  // Wait for login
  let attempts = 0;
  while (attempts < 30) {
    await page.waitForTimeout(10000);
    attempts++;
    
    try {
      // Check current URL and page state
      const currentUrl = await page.url();
      console.log(`⏳ Checking... (${attempts * 10}s) - URL: ${currentUrl}`);
      
      // Check if we're stuck on a loading page
      const pageState = await page.extract({
        instruction: "Describe what you see. Is the page loading/blank, or can you see LinkedIn content?",
        schema: z.object({
          isLoading: z.boolean(),
          hasContent: z.boolean(),
          description: z.string()
        })
      });
      
      console.log(`   Page state: ${pageState.description}`);
      
      // If logged in but page is stuck loading
      if (currentUrl.includes('feed') || currentUrl.includes('in/')) {
        console.log('\n✅ Logged in! Now handling post-login loading...\n');
        
        // Strategy 1: Force refresh
        console.log('🔄 Strategy 1: Force refreshing page...');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(5000);
        
        // Check if it loaded
        const afterRefresh = await page.extract({
          instruction: "Can you see LinkedIn feed or navigation now?",
          schema: z.object({ loaded: z.boolean() })
        });
        
        if (!afterRefresh.loaded) {
          // Strategy 2: Navigate directly to jobs
          console.log('🔄 Strategy 2: Navigating directly to jobs page...');
          await page.goto('https://www.linkedin.com/jobs/', { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
          });
          await page.waitForTimeout(5000);
        }
        
        // Strategy 3: Try different wait conditions
        console.log('🔄 Strategy 3: Waiting for specific elements...');
        try {
          // Wait for LinkedIn navigation to appear
          await page.act({
            action: "Wait until you can see the LinkedIn navigation bar or search box"
          });
        } catch (e) {
          console.log('   Navigation not found, trying alternative...');
        }
        
        break;
      }
    } catch (error) {
      console.log('   Check error:', error.message);
    }
  }
}

// Final check - what can we see?
console.log('\n📊 Final Page Analysis:\n');

const finalState = await page.extract({
  instruction: "Analyze the current page comprehensively. What elements are visible?",
  schema: z.object({
    url: z.string(),
    hasNavigation: z.boolean(),
    hasSearchBox: z.boolean(),
    hasJobListings: z.boolean(),
    hasFeed: z.boolean(),
    pageType: z.string(),
    issues: z.array(z.string())
  })
});

console.log('Current URL:', finalState.url);
console.log('Page type:', finalState.pageType);
console.log('Has navigation:', finalState.hasNavigation ? '✅' : '❌');
console.log('Has search:', finalState.hasSearchBox ? '✅' : '❌');
console.log('Has jobs:', finalState.hasJobListings ? '✅' : '❌');
console.log('Has feed:', finalState.hasFeed ? '✅' : '❌');

if (finalState.issues.length > 0) {
  console.log('\nIssues detected:');
  finalState.issues.forEach(issue => console.log(`- ${issue}`));
}

// If we made it here and can see content, try a search
if (finalState.hasSearchBox || finalState.hasJobListings) {
  console.log('\n✅ LinkedIn loaded successfully! Testing search...\n');
  
  try {
    await page.act({
      action: "Search for software engineer jobs"
    });
    await page.waitForTimeout(3000);
    console.log('✅ Search completed!');
  } catch (error) {
    console.log('❌ Search failed:', error.message);
  }
}

console.log('\n💡 Summary:');
console.log('- LinkedIn login page loads fine');
console.log('- Post-login loading issues are common');
console.log('- This might be due to:');
console.log('  1. LinkedIn detecting automation');
console.log('  2. Heavy JavaScript that fails to load');
console.log('  3. Region/proxy restrictions');
console.log('  4. Browser fingerprinting detection');
```

## Why This Happens:

1. **LinkedIn's Anti-Bot Measures**: After login, LinkedIn runs additional checks
2. **JavaScript Loading Issues**: Complex React app might fail to initialize
3. **Session Validation**: LinkedIn might be validating the session differently post-login
4. **CDN/Resource Blocking**: Some resources might be blocked based on IP

## Alternative Approach:

```javascript
// Skip the feed, go directly to jobs after login
console.log('Alternative: Direct job navigation approach\n');

const { Stagehand } = require('@browserbasehq/stagehand');
const { z } = require('zod');

const stagehand = new Stagehand({
  modelName: "anthropic/claude-3-5-sonnet-20241022",
});

await stagehand.init();
const page = stagehand.page;

// Start directly at jobs URL
console.log('Going directly to jobs search URL...');
const searchUrl = 'https://www.linkedin.com/jobs/search/?keywords=software%20engineer&location=United%20States';

await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

// This might redirect to login, then after login, should go back to search
const check = await page.extract({
  instruction: "What page am I on? Login, jobs search, or something else?",
  schema: z.object({
    pageType: z.string(),
    needsLogin: z.boolean()
  })
});

console.log('Page type:', check.pageType);
console.log('Needs login:', check.needsLogin);

// If you need to log in, it should redirect back to the search after
```

## For Your Production App:

Since you mentioned your backend works in production, the issue is likely specific to Browserbase playground. Your production setup probably:
1. Uses better proxies
2. Has proper session management
3. Implements retry logic for post-login loading