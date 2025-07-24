# Browserbase LinkedIn Diagnostic Script

This script helps diagnose why LinkedIn isn't loading properly in Browserbase.

```javascript
console.log('🔍 Browserbase LinkedIn Diagnostic Test\n');

const { Stagehand } = require('@browserbasehq/stagehand');
const { z } = require('zod');

const stagehand = new Stagehand({
  modelName: "anthropic/claude-3-5-sonnet-20241022",
});

await stagehand.init();
const page = stagehand.page;

// Test 1: Check basic connectivity
console.log('📋 Test 1: Basic Connectivity\n');

const testSites = [
  { name: 'Google', url: 'https://www.google.com' },
  { name: 'Example.com', url: 'https://www.example.com' },
  { name: 'GitHub', url: 'https://github.com' },
  { name: 'LinkedIn Home', url: 'https://www.linkedin.com' },
  { name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/' }
];

for (const site of testSites) {
  try {
    console.log(`Testing ${site.name}...`);
    const response = await page.goto(site.url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 20000 
    });
    const status = response ? response.status() : 'unknown';
    console.log(`✅ ${site.name}: Status ${status}\n`);
  } catch (error) {
    console.log(`❌ ${site.name}: ${error.message}\n`);
  }
}

// Test 2: Check what IP/location Browserbase is using
console.log('📋 Test 2: IP and Location Check\n');

try {
  await page.goto('https://httpbin.org/ip', { waitUntil: 'domcontentloaded' });
  const ipInfo = await page.extract({
    instruction: "Extract the IP address shown on this page",
    schema: z.object({ ip: z.string() })
  });
  console.log('Your IP:', ipInfo.ip);
} catch (error) {
  console.log('Could not get IP info');
}

try {
  await page.goto('https://ipapi.co/json/', { waitUntil: 'domcontentloaded' });
  const locationInfo = await page.extract({
    instruction: "Extract the location information (country, city, org/ISP)",
    schema: z.object({
      country: z.string().optional(),
      city: z.string().optional(),
      org: z.string().optional()
    })
  });
  console.log('Location:', locationInfo);
  console.log('');
} catch (error) {
  console.log('Could not get location info\n');
}

// Test 3: Check user agent and browser info
console.log('📋 Test 3: Browser Configuration\n');

const userAgent = await page.evaluate(() => navigator.userAgent);
console.log('User Agent:', userAgent);

const browserInfo = await page.evaluate(() => ({
  cookiesEnabled: navigator.cookieEnabled,
  language: navigator.language,
  platform: navigator.platform,
  webdriver: navigator.webdriver,
  plugins: navigator.plugins.length
}));
console.log('Browser Info:', browserInfo);
console.log('');

// Test 4: Try LinkedIn with different approaches
console.log('📋 Test 4: LinkedIn Access Methods\n');

// Method 1: Direct navigation
try {
  console.log('Method 1: Direct navigation...');
  await page.goto('https://www.linkedin.com', { waitUntil: 'domcontentloaded', timeout: 20000 });
  
  const pageTitle = await page.title();
  console.log('Page title:', pageTitle);
  
  if (pageTitle.includes('Security') || pageTitle.includes('Verification')) {
    console.log('⚠️ LinkedIn is showing security/verification page');
  } else if (pageTitle.includes('LinkedIn')) {
    console.log('✅ LinkedIn page loaded');
  }
} catch (error) {
  console.log('❌ Direct navigation failed:', error.message);
}

// Method 2: Check for blocking messages
try {
  const blockCheck = await page.extract({
    instruction: "Is there any error message, security check, or blocking message on this page?",
    schema: z.object({
      isBlocked: z.boolean(),
      message: z.string().optional()
    })
  });
  
  if (blockCheck.isBlocked) {
    console.log('🚫 LinkedIn is blocking access:', blockCheck.message);
  }
} catch (error) {
  console.log('Could not check for blocks');
}

console.log('\n📊 Diagnostic Summary:\n');
console.log('Based on these results:');
console.log('1. If other sites work but LinkedIn doesn\'t → LinkedIn is blocking Browserbase IPs');
console.log('2. If you see 429 errors → Rate limiting (too many requests from this IP)');
console.log('3. If webdriver=true → LinkedIn detected automation');
console.log('4. If ISP shows datacenter/hosting → LinkedIn blocks these IPs');

console.log('\n💡 Recommendations:');
console.log('1. Try Browserbase with residential proxy option if available');
console.log('2. Use your actual browser with Playwright locally instead of Browserbase');
console.log('3. Try a different cloud browser service that LinkedIn doesn\'t block');
console.log('4. Use Browserbase\'s stealth/undetected mode if available');
```

## What the errors mean:

1. **429 Status Code** = "Too Many Requests" - LinkedIn is rate limiting the IP
2. **400 Status Code** = "Bad Request" - LinkedIn is rejecting requests from this source
3. **WebGL/GPU errors** = Heavy graphics trying to load (normal for LinkedIn)
4. **Google One Tap warnings** = LinkedIn uses Google auth (can ignore)

## Solutions to try:

1. **Use Browserbase's residential proxy** (if available in your plan)
2. **Try Browserbase's stealth mode** (if they offer it)
3. **Run locally instead** - Use Playwright on your own machine
4. **Try a different service** - Some alternatives:
   - Bright Data's Scraping Browser
   - Apify
   - ScrapingBee
   - Your own VPS with residential proxy

5. **Contact Browserbase support** - Ask if they have IPs that work with LinkedIn

The core issue is that LinkedIn has likely blacklisted Browserbase's datacenter IPs. This is common - LinkedIn aggressively blocks automation from cloud providers.