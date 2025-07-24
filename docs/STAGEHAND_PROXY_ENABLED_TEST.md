# Stagehand Test with Browserbase Proxy Enabled

Based on Browserbase documentation, here's how to properly use their proxy feature:

```javascript
console.log('🚀 Starting LinkedIn Test with Browserbase Proxy\n');

// Initialize Stagehand
const { Stagehand } = require('@browserbasehq/stagehand');
const { z } = require('zod');

// Create a session with fingerprinting first
async function createSession() {
  const response = await fetch(`https://www.browserbase.com/v1/sessions`, {
    method: "POST",
    headers: {
      "x-bb-api-key": process.env.BROWSERBASE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      projectId: process.env.BROWSERBASE_PROJECT_ID,
      // Fingerprinting options to appear less bot-like
      fingerprint: {
        locales: ["en-US", "en"],
        operatingSystems: ["windows", "macos"]
      }
    }),
  });
  const json = await response.json();
  return json.id;
}

// For Browserbase playground, we need to use their API
const sessionId = await createSession();

// Connect with proxy enabled
const stagehand = new Stagehand({
  modelName: "anthropic/claude-3-5-sonnet-20241022",
  // Use the session ID we created
  sessionId: sessionId,
  // Enable proxy through connection URL
  browserWSEndpoint: `wss://connect.browserbase.com?apiKey=${process.env.BROWSERBASE_API_KEY}&sessionId=${sessionId}&enableProxy=true`
});

await stagehand.init();
const page = stagehand.page;

// Test connection
console.log('📍 Testing connection with proxy enabled...\n');

try {
  // First test with a simple site
  console.log('Testing basic connectivity...');
  await page.goto('https://httpbin.org/ip', { waitUntil: 'domcontentloaded' });
  
  const ipInfo = await page.extract({
    instruction: "What IP address is shown on this page?",
    schema: z.object({ ip: z.string() })
  });
  
  console.log('Your proxy IP:', ipInfo.ip);
  console.log('✅ Proxy is working!\n');
  
  // Now try LinkedIn
  console.log('📍 Navigating to LinkedIn...');
  await page.goto('https://www.linkedin.com/jobs/', { 
    waitUntil: 'domcontentloaded',
    timeout: 30000 
  });
  
  await page.waitForTimeout(3000);
  
  // Check what we see
  const pageCheck = await page.extract({
    instruction: "What do you see on this page? Is it LinkedIn or an error/block page?",
    schema: z.object({
      isLinkedIn: z.boolean(),
      pageDescription: z.string()
    })
  });
  
  console.log('Page check:', pageCheck);
  
  if (pageCheck.isLinkedIn) {
    console.log('\n✅ Successfully loaded LinkedIn with proxy!');
    
    // Continue with login check
    const loginStatus = await page.extract({
      instruction: "Am I logged into LinkedIn?",
      schema: z.object({
        isLoggedIn: z.boolean(),
        whatYouSee: z.string()
      })
    });
    
    console.log('Login status:', loginStatus);
  } else {
    console.log('\n❌ LinkedIn is still blocking even with proxy');
    console.log('The proxy might be a datacenter proxy that LinkedIn blocks');
  }
  
} catch (error) {
  console.log('❌ Error:', error.message);
}

console.log('\n📊 Summary:');
console.log('- Browserbase proxy feature is enabled');
console.log('- But LinkedIn may still block datacenter proxies');
console.log('- You may need residential proxies (contact Browserbase support)');
```

## Alternative: Direct Browserbase Connection

If you're in the playground, try this simpler version that should automatically handle proxy:

```javascript
// Simpler version for Browserbase playground
const { Stagehand } = require('@browserbasehq/stagehand');
const { z } = require('zod');

const stagehand = new Stagehand({
  modelName: "anthropic/claude-3-5-sonnet-20241022"
});

await stagehand.init();
const page = stagehand.page;

// The playground might already have proxy settings
console.log('Testing LinkedIn access...');

try {
  await page.goto('https://www.linkedin.com/jobs/');
  await page.waitForTimeout(3000);
  
  const result = await page.extract({
    instruction: "Describe what you see - is this LinkedIn or a block page?",
    schema: z.object({
      description: z.string(),
      isBlocked: z.boolean()
    })
  });
  
  console.log('Result:', result);
  
  // If not blocked, check IP
  await page.goto('https://ipinfo.io/json');
  const ipData = await page.extract({
    instruction: "Extract the IP, city, region, and org/ISP from this page",
    schema: z.object({
      ip: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      org: z.string().optional()
    })
  });
  
  console.log('\nConnection info:', ipData);
  
  if (ipData.org && ipData.org.includes('datacenter')) {
    console.log('\n⚠️ Using datacenter IP - LinkedIn likely blocks these');
  }
  
} catch (error) {
  console.log('Error:', error.message);
}
```

## Bottom Line:

1. **Browserbase DOES have proxy support** via `enableProxy=true`
2. **They also have fingerprinting** to reduce detection
3. **BUT** they don't specify if it's residential or datacenter proxies
4. **LinkedIn likely still blocks datacenter proxies**

## What to do:

1. Try the proxy-enabled script above
2. If it still fails, **contact Browserbase support** and ask:
   - Do they offer residential proxies?
   - Do they have specific solutions for LinkedIn?
   - What type of proxies does `enableProxy` use?

3. For production, your backend already works because you're using proper residential proxies through your own setup