# Testing Stagehand with Different Proxy Settings

## Test 1: With Proxy Disabled (Recommended to try first)

```javascript
console.log('🚀 Testing LinkedIn WITHOUT Proxy\n');

const { Stagehand } = require('@browserbasehq/stagehand');
const { z } = require('zod');

const stagehand = new Stagehand({
  modelName: "anthropic/claude-3-5-sonnet-20241022",
  browserOptions: {
    viewport: { width: 1280, height: 720 },
    // Disable proxy by using direct connection
    proxy: null,  // This might help avoid proxy errors
  },
  // If Browserbase supports it, try:
  browserbaseOptions: {
    proxy: false,  // Disable Browserbase proxy
    // or
    proxyType: 'none'  // Direct connection
  }
});

await stagehand.init();
const page = stagehand.page;

console.log('📍 Attempting direct connection to LinkedIn...');
try {
  await page.goto('https://www.linkedin.com/jobs/', { 
    waitUntil: 'domcontentloaded',
    timeout: 30000 
  });
  console.log('✅ Page loaded successfully WITHOUT proxy');
  
  // Quick check
  const check = await page.extract({
    instruction: "What website is this? Can you see LinkedIn?",
    schema: z.object({
      isLinkedIn: z.boolean(),
      whatYouSee: z.string()
    })
  });
  
  console.log('Result:', check);
  
} catch (error) {
  console.log('❌ Failed without proxy:', error.message);
}
```

## Test 2: With Residential Proxy (If available in Browserbase)

```javascript
console.log('🚀 Testing LinkedIn WITH Residential Proxy\n');

const { Stagehand } = require('@browserbasehq/stagehand');
const { z } = require('zod');

const stagehand = new Stagehand({
  modelName: "anthropic/claude-3-5-sonnet-20241022",
  browserOptions: {
    viewport: { width: 1280, height: 720 },
  },
  // If Browserbase supports proxy configuration:
  browserbaseOptions: {
    proxyType: 'residential',  // Better for LinkedIn
    proxyCountry: 'US',  // or your preferred country
    // Residential proxies are less likely to be blocked
  }
});

await stagehand.init();
const page = stagehand.page;

console.log('📍 Attempting connection via residential proxy...');
try {
  await page.goto('https://www.linkedin.com/jobs/', { 
    waitUntil: 'domcontentloaded',
    timeout: 30000 
  });
  console.log('✅ Page loaded successfully WITH residential proxy');
  
  const check = await page.extract({
    instruction: "What website is this? Can you see LinkedIn?",
    schema: z.object({
      isLinkedIn: z.boolean(),
      whatYouSee: z.string()
    })
  });
  
  console.log('Result:', check);
  
} catch (error) {
  console.log('❌ Failed with proxy:', error.message);
}
```

## Test 3: Simple Connection Test

```javascript
// Just test basic connectivity
const { Stagehand } = require('@browserbasehq/stagehand');

const stagehand = new Stagehand({
  modelName: "anthropic/claude-3-5-sonnet-20241022"
});

await stagehand.init();
const page = stagehand.page;

// Test with a less restrictive site first
console.log('Testing basic connectivity...');

const sites = [
  'https://www.google.com',
  'https://www.example.com',
  'https://www.linkedin.com'
];

for (const site of sites) {
  try {
    console.log(`\nTesting ${site}...`);
    await page.goto(site, { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log(`✅ ${site} loaded successfully`);
  } catch (error) {
    console.log(`❌ ${site} failed: ${error.message}`);
  }
}
```

## Recommendations:

### For LinkedIn specifically:

1. **Try WITHOUT proxy first** - Your own IP might not be blocked
2. **If that fails, try residential proxy** - Less likely to be detected
3. **Avoid datacenter proxies** - LinkedIn blocks most of them

### Signs that proxy is the issue:
- `ERR_TUNNEL_CONNECTION_FAILED` - Proxy connection problem
- `ERR_CONNECTION_CLOSED` - Proxy dropped connection  
- 403/429 errors - IP is blocked/rate limited
- Page loads but shows "Something went wrong" - Soft block

### Best practices for LinkedIn automation:
1. Use residential IPs when possible
2. Add realistic delays between actions
3. Rotate user agents
4. Use browser fingerprint randomization
5. Limit requests per session

Check your Browserbase dashboard to see what proxy options are available. Some services offer:
- No proxy (direct connection)
- Datacenter proxy (often blocked)
- Residential proxy (best for LinkedIn)
- Mobile proxy (even better but expensive)