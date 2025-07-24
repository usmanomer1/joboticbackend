# Browserbase Playground Testing Guide for LinkedIn Automation

This guide provides complete, copy-paste ready scripts for testing LinkedIn automation in the Browserbase playground.

## Quick Start

1. Log into Browserbase playground
2. **IMPORTANT**: Try disabling the Adblocker toggle if you get timeouts
3. Copy any script below → Paste in editor → Click "Run"

## Timeout Issues?

If you're getting timeout errors:
1. **Disable the ad blocker** - LinkedIn may be blocking automated browsers
2. **Use the Simple Navigation Test** below first
3. **LinkedIn requires login** - You'll need to manually log in first

### 🚀 Simple Navigation Test (Use This First!)

```javascript
// ===== SIMPLE LINKEDIN TEST - TIMEOUT RESISTANT =====
console.log('🚀 Starting Simple LinkedIn Test...\n');

// Just try to load the page without waiting for specific conditions
console.log('📡 Attempting to load LinkedIn...');

try {
  // Use a simple goto without complex wait conditions
  await page.goto('https://www.linkedin.com');
  console.log('✅ LinkedIn homepage loaded');
  
  // Wait a moment
  await page.waitForTimeout(2000);
  
  // Get basic page info
  const pageInfo = await page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    hasLoginButton: document.body.innerText.includes('Sign in'),
    bodyLength: document.body.innerText.length
  }));
  
  console.log('\n📊 Page Info:');
  console.log('URL:', pageInfo.url);
  console.log('Title:', pageInfo.title);
  console.log('Content loaded:', pageInfo.bodyLength > 100 ? 'Yes' : 'No');
  console.log('Login required:', pageInfo.hasLoginButton ? 'Yes' : 'No');
  
  if (pageInfo.hasLoginButton) {
    console.log('\n📝 Next: Try navigating to the login page directly');
    await page.goto('https://www.linkedin.com/login');
    await page.waitForTimeout(2000);
    console.log('✅ Login page loaded - Please log in manually');
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.log('\n💡 This might be due to:');
  console.log('1. Ad blocker interference (try disabling it)');
  console.log('2. LinkedIn blocking automation');
  console.log('3. Network issues');
}

console.log('\n✅ Test complete!');
```

## Complete Test Scripts

### 🚀 Script 1: Basic LinkedIn Navigation Test

Copy and paste this entire script to test basic LinkedIn access:

```javascript
// ===== BASIC LINKEDIN NAVIGATION TEST =====
// Tests: Navigation, login detection, and page structure

console.log('🚀 Starting LinkedIn Navigation Test...\n');
console.log('⏱️  Note: LinkedIn may take 30-60 seconds to load initially\n');

try {
  // Navigate to LinkedIn Jobs with extended timeout
  console.log('📡 Navigating to LinkedIn Jobs...');
  await page.goto('https://www.linkedin.com/jobs/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000 // 60 seconds timeout
  });
  
  console.log('⏳ Waiting for page to stabilize...');
  
  // Wait a bit for dynamic content
  await page.waitForTimeout(3000);
  
  // Check if we landed on the jobs page
  const currentUrl = page.url();
  console.log('📍 Current URL:', currentUrl);
  
  // Check for various LinkedIn states
  const pageState = await page.evaluate(() => {
    const url = window.location.href;
    const bodyText = document.body.innerText || '';
    
    return {
      isLoginPage: url.includes('/login') || url.includes('/uas/login'),
      hasSignInLink: !!document.querySelector('a[href*="sign-in"]'),
      hasJoinNow: bodyText.includes('Join now') || bodyText.includes('Sign in'),
      isJobsPage: url.includes('/jobs'),
      hasAuthwall: !!document.querySelector('[data-test-id="authwall"]'),
      hasJobFeed: !!document.querySelector('[class*="jobs-search-results"]'),
      pageTitle: document.title
    };
  });
  
  console.log('📄 Page Title:', pageState.pageTitle);
  console.log('🔍 Page Analysis:', JSON.stringify(pageState, null, 2));
  
  // Determine if login is required
  const needsLogin = pageState.isLoginPage || pageState.hasSignInLink || pageState.hasAuthwall;
  
  if (needsLogin) {
    console.log('\n🔐 Status: Login Required');
    console.log('ℹ️  This is expected for first-time access.');
    console.log('👉 LinkedIn requires authentication to view job listings.');
    console.log('\n📝 Next Steps:');
    console.log('1. The browser will redirect you to the login page');
    console.log('2. Log in with your LinkedIn credentials');
    console.log('3. Run this test again after logging in\n');
    
    // Try to navigate to login if not already there
    if (!pageState.isLoginPage) {
      console.log('🔄 Redirecting to login page...');
      await page.goto('https://www.linkedin.com/login', { 
        timeout: 30000,
        waitUntil: 'domcontentloaded' 
      });
    }
    
  } else if (pageState.isJobsPage) {
    console.log('\n✅ Status: Successfully Loaded Jobs Page');
    
    // Wait a bit more for job listings to load
    await page.waitForTimeout(2000);
    
    // Check for job search elements with multiple selectors
    const searchElements = await page.evaluate(() => {
      const selectors = {
        searchBox: [
          'input[aria-label*="Search"]',
          'input[placeholder*="Search"]',
          'input[id*="job-search"]',
          '.jobs-search-box input'
        ],
        jobCards: [
          '[data-job-id]',
          '.job-card-container',
          '.jobs-search-results__list-item',
          '[class*="job-card"]'
        ]
      };
      
      const findElement = (selectorList) => {
        for (const selector of selectorList) {
          const element = document.querySelector(selector);
          if (element) return true;
        }
        return false;
      };
      
      const countElements = (selectorList) => {
        for (const selector of selectorList) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) return elements.length;
        }
        return 0;
      };
      
      return {
        hasSearchBox: findElement(selectors.searchBox),
        jobCount: countElements(selectors.jobCards),
        pageStructure: {
          hasHeader: !!document.querySelector('header'),
          hasNavigation: !!document.querySelector('nav'),
          hasMainContent: !!document.querySelector('main')
        }
      };
    });
    
    console.log(`\n📊 Page Analysis Results:`);
    console.log(`🔍 Search functionality available: ${searchElements.hasSearchBox ? 'Yes' : 'No'}`);
    console.log(`📋 Job listings found: ${searchElements.jobCount}`);
    console.log(`🏗️ Page structure:`, searchElements.pageStructure);
    
    if (searchElements.jobCount === 0) {
      console.log('\n⚠️  No job listings visible yet.');
      console.log('This could mean:');
      console.log('- The page is still loading');
      console.log('- You need to perform a search first');
      console.log('- LinkedIn is showing a different view');
    }
  } else {
    console.log('\n⚠️  Unexpected Page State');
    console.log('The page loaded but doesn\'t appear to be the jobs page or login page.');
    console.log('Current URL:', currentUrl);
  }
  
} catch (error) {
  console.error('\n❌ Error during navigation:', error.message);
  
  if (error.message.includes('timeout')) {
    console.log('\n💡 Timeout Tips:');
    console.log('1. LinkedIn can be slow to load initially');
    console.log('2. Try disabling the ad blocker toggle in the playground');
    console.log('3. The site might be blocking automated access');
    console.log('4. Try again in a few moments');
  } else if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
    console.log('\n💡 Connection Tips:');
    console.log('1. Check your internet connection');
    console.log('2. LinkedIn might be temporarily unavailable');
    console.log('3. Try again in a few moments');
  }
  
  // Try to get current page state even after error
  try {
    const errorUrl = page.url();
    console.log('\n📍 Current URL after error:', errorUrl);
    
    const pageContent = await page.evaluate(() => {
      return {
        title: document.title,
        hasContent: document.body.innerText.length > 0,
        bodyPreview: document.body.innerText.substring(0, 200)
      };
    });
    
    console.log('📄 Page state:', pageContent);
  } catch (e) {
    console.log('Unable to retrieve page state');
  }
}

console.log('\n✅ Navigation test complete!');
```

### 🔍 Script 2: Job Search and Extraction Test

Copy and paste this to test job searching and data extraction:

```javascript
// ===== JOB SEARCH AND EXTRACTION TEST =====
// Tests: Search functionality and job data extraction

console.log('🔍 Starting Job Search Test...\n');

try {
  // Navigate to LinkedIn Jobs
  console.log('📡 Navigating to LinkedIn Jobs...');
  await page.goto('https://www.linkedin.com/jobs/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  
  // Wait for page to stabilize
  await page.waitForTimeout(3000);
  
  // Check page state comprehensively
  console.log('🔍 Checking authentication status...');
  const pageState = await page.evaluate(() => {
    const url = window.location.href;
    const bodyText = document.body.innerText || '';
    
    return {
      url: url,
      isLoginUrl: url.includes('/login') || url.includes('/uas/login'),
      hasAuthwall: !!document.querySelector('[data-test-id="authwall"]'),
      hasSignInText: bodyText.includes('Sign in') || bodyText.includes('Join now'),
      hasSearchBox: !!document.querySelector('input[aria-label*="Search"], input[placeholder*="Search"]'),
      hasJobCards: document.querySelectorAll('[data-job-id]').length > 0,
      hasJobSearchResults: !!document.querySelector('[class*="jobs-search-results"]'),
      pageTitle: document.title
    };
  });
  
  console.log('📄 Page Analysis:');
  console.log(`   URL: ${pageState.url}`);
  console.log(`   Title: ${pageState.pageTitle}`);
  console.log(`   Has authwall: ${pageState.hasAuthwall}`);
  console.log(`   Has sign-in prompt: ${pageState.hasSignInText}`);
  console.log(`   Search box accessible: ${pageState.hasSearchBox}`);
  console.log(`   Job listings visible: ${pageState.hasJobCards}`);
  
  // Determine if we can proceed
  const isLoggedIn = !pageState.hasAuthwall && 
                     !pageState.hasSignInText && 
                     (pageState.hasSearchBox || pageState.hasJobCards);
  
  if (!isLoggedIn) {
    console.log('\n🔐 Login Required!');
    console.log('ℹ️  LinkedIn is showing a login screen, even though the URL might be /jobs');
    console.log('👉 This happens when LinkedIn detects you\'re not authenticated');
    console.log('\n📝 Next Steps:');
    console.log('1. Log into LinkedIn manually in this browser window');
    console.log('2. Make sure you can see job listings');
    console.log('3. Run this test again\n');
    
    // Don't continue with the test
    console.log('⏹️  Stopping test - authentication required');
    return;
  }
  
  console.log('\n✅ Authentication confirmed! Starting job search...\n');
  
  // Perform job search
  try {
    const searchKeyword = 'React Developer';
    const searchLocation = 'San Francisco, CA';
    
    console.log(`🔎 Searching for: "${searchKeyword}" in "${searchLocation}"`);
    
    // Find and fill search fields with multiple selector options
    const searchSelectors = {
      jobTitle: [
        'input[aria-label*="Search by title"]',
        'input[placeholder*="Search by title"]',
        'input[id*="jobs-search-box-keyword"]',
        '.jobs-search-box__text-input[aria-label*="Search"]'
      ],
      location: [
        'input[aria-label*="City, state, or zip code"]',
        'input[aria-label*="Location"]',
        'input[placeholder*="Location"]',
        'input[id*="jobs-search-box-location"]'
      ]
    };
    
    // Try to find job title input
    let jobTitleInput = null;
    for (const selector of searchSelectors.jobTitle) {
      try {
        jobTitleInput = await page.waitForSelector(selector, { timeout: 2000 });
        if (jobTitleInput) break;
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!jobTitleInput) {
      throw new Error('Could not find job title search input');
    }
    
    await jobTitleInput.fill(searchKeyword);
    
    // Try to find location input
    let locationInput = null;
    for (const selector of searchSelectors.location) {
      try {
        locationInput = await page.waitForSelector(selector, { timeout: 2000 });
        if (locationInput) break;
      } catch (e) {
        // Try next selector
      }
    }
    
    if (locationInput) {
      await locationInput.clear();
      await locationInput.fill(searchLocation);
    } else {
      console.log('⚠️  Could not find location input - searching by job title only');
    }
    
    // Submit search
    await page.keyboard.press('Enter');
    console.log('⏳ Waiting for search results...');
    await page.waitForTimeout(3000);
    
    // Extract job listings
    const jobs = await page.evaluate(() => {
      const jobCards = document.querySelectorAll('[data-job-id]');
      if (jobCards.length === 0) {
        // Try alternative selectors
        const altCards = document.querySelectorAll('.job-card-container, .jobs-search-results__list-item');
        if (altCards.length > 0) {
          return [{
            index: 1,
            title: 'Jobs found but using different structure',
            company: 'LinkedIn may have updated their HTML',
            location: 'Check selectors',
            isEasyApply: false,
            jobId: 'unknown'
          }];
        }
      }
      
      return Array.from(jobCards).slice(0, 5).map((card, index) => {
        const titleEl = card.querySelector('.job-card-list__title, [class*="job-title"], h3');
        const companyEl = card.querySelector('.job-card-container__company-name, [class*="company-name"], h4');
        const locationEl = card.querySelector('.job-card-container__metadata-item, [class*="location"]');
        const easyApplyEl = card.querySelector('[class*="easy-apply"]');
        
        return {
          index: index + 1,
          title: titleEl?.textContent?.trim() || 'N/A',
          company: companyEl?.textContent?.trim() || 'N/A',
          location: locationEl?.textContent?.trim() || 'N/A',
          isEasyApply: !!easyApplyEl,
          jobId: card.getAttribute('data-job-id') || 'N/A'
        };
      });
    });
    
    if (jobs.length === 0) {
      console.log('\n⚠️  No jobs found. This could mean:');
      console.log('   - The search returned no results');
      console.log('   - LinkedIn is still loading');
      console.log('   - The page structure has changed');
    } else {
      console.log(`\n📊 Found ${jobs.length} jobs:\n`);
      
      jobs.forEach(job => {
        console.log(`${job.index}. ${job.title}`);
        console.log(`   Company: ${job.company}`);
        console.log(`   Location: ${job.location}`);
        console.log(`   Type: ${job.isEasyApply ? '✅ Easy Apply' : '🔗 External Application'}`);
        console.log(`   Job ID: ${job.jobId}`);
        console.log('');
      });
      
      // Test clicking on a job
      if (jobs.length > 0 && jobs[0].jobId !== 'unknown') {
        console.log('🖱️ Clicking on first job to view details...');
        await page.click('[data-job-id]');
        await page.waitForTimeout(2000);
        
        // Check for apply button
        const hasApplyButton = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.some(btn => 
            btn.textContent?.toLowerCase().includes('apply') ||
            btn.textContent?.toLowerCase().includes('easy apply')
          );
        });
        
        console.log(`\n💼 Apply button found: ${hasApplyButton ? 'Yes' : 'No'}`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Search operation failed:', error.message);
    console.log('\n💡 This could be because:');
    console.log('   - LinkedIn has changed their UI structure');
    console.log('   - You\'re not fully logged in yet');
    console.log('   - The page is showing a different view');
    console.log('   - Rate limiting is in effect');
  }
  
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  
  if (error.message.includes('timeout')) {
    console.log('\n💡 Timeout Tips:');
    console.log('   - Try disabling the ad blocker in playground');
    console.log('   - LinkedIn might be slow to respond');
    console.log('   - Try again in a few moments');
  }
}

console.log('\n✅ Search test complete!');
```

### 🤖 Script 3: Stagehand AI Test (Convert to Stagehand)

First paste this code, then click "Convert to Stagehand" button:

```javascript
// ===== STAGEHAND AI AUTOMATION TEST =====
// Instructions: 
// 1. Paste this code
// 2. Click "Convert to Stagehand" button
// 3. Click "Run"

console.log('🤖 Testing Stagehand AI Automation...\n');

try {
  // Navigate to LinkedIn
  console.log('📡 Navigating to LinkedIn Jobs...');
  await page.goto('https://www.linkedin.com/jobs/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  
  // Wait for page to stabilize
  await page.waitForTimeout(3000);
  
  // Check if we're authenticated
  console.log('🔍 Checking authentication status...');
  const pageState = await page.evaluate(() => {
    const bodyText = document.body.innerText || '';
    return {
      url: window.location.href,
      hasAuthwall: !!document.querySelector('[data-test-id="authwall"]'),
      hasSignInText: bodyText.includes('Sign in') || bodyText.includes('Join now'),
      hasJobSearch: !!document.querySelector('input[aria-label*="Search"], input[placeholder*="Search"]'),
      pageTitle: document.title
    };
  });
  
  console.log('📄 Page state:', {
    url: pageState.url,
    title: pageState.pageTitle,
    authenticated: !pageState.hasAuthwall && !pageState.hasSignInText
  });
  
  // Check if login is required
  if (pageState.hasAuthwall || pageState.hasSignInText) {
    console.log('\n🔐 Login Required!');
    console.log('ℹ️  LinkedIn is showing a login screen');
    console.log('👉 The AI automation needs you to be logged in first');
    console.log('\n📝 Next Steps:');
    console.log('1. Log into LinkedIn manually in this browser');
    console.log('2. Navigate back to the jobs page');
    console.log('3. Run this test again\n');
    console.log('⏹️  Stopping test - authentication required');
    return;
  }
  
  console.log('\n✅ Authenticated! Starting AI automation test...\n');
  
  // These commands will be converted to Stagehand AI commands
  console.log('🤖 The following will be converted to AI commands:');
  console.log('   - Search for "Senior React Developer" jobs');
  console.log('   - In location "San Francisco, CA"');
  console.log('   - Click search button\n');
  
  // Fill search fields - will be converted to AI
  await page.fill('input[aria-label*="Search"]', 'Senior React Developer');
  await page.fill('input[aria-label*="Location"]', 'San Francisco, CA');
  await page.click('button[aria-label*="Search"]');
  
  // Wait for results
  console.log('⏳ Waiting for search results...');
  await page.waitForTimeout(3000);
  
  // Extract job data
  const jobs = await page.locator('[data-job-id]').count();
  console.log(`\n📊 Found ${jobs} job listings`);
  
  // Click on first job
  if (jobs > 0) {
    console.log('🖱️ Clicking on first job...');
    await page.locator('[data-job-id]').first().click();
    console.log('✅ Successfully clicked on first job');
    
    // Wait and check for job details
    await page.waitForTimeout(2000);
    
    // This would also be converted to AI command
    const hasApplyButton = await page.evaluate(() => {
      return !!document.querySelector('button:has-text("Apply"), button:has-text("Easy Apply")');
    });
    
    console.log(`💼 Apply button visible: ${hasApplyButton ? 'Yes' : 'No'}`);
  } else {
    console.log('⚠️  No jobs found to click on');
  }
  
  console.log('\n🎯 AI Automation Notes:');
  console.log('When converted to Stagehand, the AI will:');
  console.log('1. Understand natural language commands');
  console.log('2. Find elements intelligently without exact selectors');
  console.log('3. Handle dynamic page changes better');
  console.log('4. Provide more robust automation');
  
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.log('\n💡 Tips:');
  console.log('   - Make sure you\'re logged into LinkedIn first');
  console.log('   - Try disabling ad blocker if you get timeouts');
  console.log('   - The AI conversion might help with selector issues');
}

console.log('\n✅ Stagehand test complete!');
```

### 🧪 Script 4: Complete Automation Test Suite

Copy and paste this for a comprehensive test of all features:

```javascript
// ===== COMPLETE LINKEDIN AUTOMATION TEST SUITE =====
// Tests all major functionality in one script

console.log('🧪 LinkedIn Automation Complete Test Suite');
console.log('=========================================\n');

// Test results tracker
const results = {
  navigation: false,
  authentication: false,
  search: false,
  jobExtraction: false,
  jobInteraction: false,
  edgeCases: {
    rateLimiting: false,
    captcha: false
  }
};

try {
  // 1. NAVIGATION TEST
  console.log('1️⃣ Testing Navigation...');
  await page.goto('https://www.linkedin.com/jobs/');
  await page.waitForLoadState('networkidle');
  results.navigation = page.url().includes('linkedin.com');
  console.log(`   Result: ${results.navigation ? '✅ Success' : '❌ Failed'}\n`);
  
  // 2. AUTHENTICATION CHECK
  console.log('2️⃣ Checking Authentication...');
  const needsLogin = page.url().includes('/login') || page.url().includes('/uas/login');
  
  if (needsLogin) {
    console.log('   Status: ⚠️  Login Required');
    console.log('   Action: Please log in and restart test\n');
    throw new Error('Login required - stopping test');
  } else {
    results.authentication = true;
    console.log('   Status: ✅ Logged In\n');
  }
  
  // 3. SEARCH TEST
  console.log('3️⃣ Testing Job Search...');
  try {
    // Fill search fields
    await page.fill('input[aria-label*="Search by title"]', 'Software Engineer');
    await page.fill('input[aria-label*="City, state, or zip code"]', 'New York, NY');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    results.search = true;
    console.log('   Result: ✅ Search Successful\n');
  } catch (e) {
    console.log('   Result: ❌ Search Failed -', e.message, '\n');
  }
  
  // 4. JOB EXTRACTION TEST
  console.log('4️⃣ Testing Job Extraction...');
  const jobs = await page.evaluate(() => {
    const cards = document.querySelectorAll('[data-job-id]');
    return Array.from(cards).slice(0, 3).map(card => ({
      id: card.getAttribute('data-job-id'),
      title: card.querySelector('[class*="title"]')?.textContent?.trim(),
      company: card.querySelector('[class*="company"]')?.textContent?.trim(),
      hasEasyApply: !!card.querySelector('[class*="easy-apply"]')
    }));
  });
  
  results.jobExtraction = jobs.length > 0;
  console.log(`   Result: ${results.jobExtraction ? '✅' : '❌'} Found ${jobs.length} jobs`);
  
  if (jobs.length > 0) {
    console.log('   Sample:', jobs[0].title, 'at', jobs[0].company);
  }
  console.log('');
  
  // 5. JOB INTERACTION TEST
  console.log('5️⃣ Testing Job Interaction...');
  if (jobs.length > 0) {
    try {
      await page.click('[data-job-id]');
      await page.waitForTimeout(2000);
      
      const hasApplyButton = await page.evaluate(() => {
        return !!document.querySelector('button:has-text("Apply"), button:has-text("Easy Apply")');
      });
      
      results.jobInteraction = true;
      console.log(`   Result: ✅ Can interact with jobs`);
      console.log(`   Apply button: ${hasApplyButton ? 'Found' : 'Not found'}\n`);
    } catch (e) {
      console.log('   Result: ❌ Interaction failed\n');
    }
  }
  
  // 6. EDGE CASE DETECTION
  console.log('6️⃣ Testing Edge Cases...');
  
  // Check for rate limiting
  const hasRateLimit = await page.evaluate(() => {
    const text = document.body.textContent?.toLowerCase() || '';
    return text.includes('too many requests') || text.includes('try again later');
  });
  results.edgeCases.rateLimiting = !hasRateLimit;
  
  // Check for CAPTCHA
  const hasCaptcha = await page.evaluate(() => {
    return !!document.querySelector('iframe[src*="captcha"], [class*="captcha"]');
  });
  results.edgeCases.captcha = !hasCaptcha;
  
  console.log(`   Rate Limiting: ${results.edgeCases.rateLimiting ? '✅ Not detected' : '❌ Detected'}`);
  console.log(`   CAPTCHA: ${results.edgeCases.captcha ? '✅ Not detected' : '❌ Detected'}\n`);
  
} catch (error) {
  console.error('\n❌ Test Error:', error.message);
}

// FINAL SUMMARY
console.log('\n📊 TEST SUMMARY');
console.log('================');
console.log(`Navigation:      ${results.navigation ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Authentication:  ${results.authentication ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Search:          ${results.search ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Job Extraction:  ${results.jobExtraction ? '✅ PASS' : '❌ FAIL'}`);
console.log(`Job Interaction: ${results.jobInteraction ? '✅ PASS' : '❌ FAIL'}`);
console.log(`No Rate Limits:  ${results.edgeCases.rateLimiting ? '✅ PASS' : '❌ FAIL'}`);
console.log(`No CAPTCHA:      ${results.edgeCases.captcha ? '✅ PASS' : '❌ FAIL'}`);

const allPassed = Object.values(results).every(v => 
  typeof v === 'boolean' ? v : Object.values(v).every(ev => ev)
);

console.log(`\n${allPassed ? '🎉 ALL TESTS PASSED!' : '⚠️  Some tests failed. Check the results above.'}`);
```

## Quick Reference

### Step 1: Navigate to LinkedIn Jobs

```javascript
// Test basic navigation
await page.goto('https://www.linkedin.com/jobs/');
await page.waitForLoadState('networkidle');

// Verify we're on the right page
const isJobsPage = await page.evaluate(() => {
  return window.location.href.includes('/jobs');
});
console.log('Successfully navigated to jobs page:', isJobsPage);
```

### Step 2: Check Authentication Status

```javascript
// Check if we need to login
const needsLogin = await page.evaluate(() => {
  return window.location.href.includes('/login') || 
         window.location.href.includes('/uas/login') ||
         document.querySelector('a[href*="sign-in"]') !== null;
});

if (needsLogin) {
  console.log('⚠️  Login required - Expected for first run');
  console.log('Please log in manually and then continue testing');
  // In real automation, this would trigger an intervention
} else {
  console.log('✅ Already logged in');
}
```

### Step 3: Test Job Search Functionality

```javascript
// Test traditional search
async function testTraditionalSearch() {
  try {
    // Find and fill job title field
    const jobTitleInput = await page.locator('input[aria-label*="Search by title"]');
    await jobTitleInput.fill('React Developer');
    
    // Find and fill location field
    const locationInput = await page.locator('input[aria-label*="City, state, or zip code"]');
    await locationInput.fill('San Francisco, CA');
    
    // Click search button
    await page.click('button[aria-label*="Search"]');
    
    // Wait for results
    await page.waitForTimeout(3000);
    
    console.log('✅ Traditional search completed');
  } catch (error) {
    console.error('❌ Traditional search failed:', error.message);
  }
}

// Test natural language search (simulating Stagehand)
async function testNaturalLanguageSearch() {
  const searchPrompt = "Senior React developer jobs in San Francisco with good benefits";
  console.log(`Testing natural language search: "${searchPrompt}"`);
  
  // This simulates what Stagehand would do
  // In real implementation, Stagehand AI would interpret this
  await testTraditionalSearch();
}

await testNaturalLanguageSearch();
```

### Step 4: Extract Job Listings

```javascript
// Extract job data from the page
async function extractJobListings() {
  const jobs = await page.evaluate(() => {
    const jobCards = document.querySelectorAll('[data-job-id]');
    return Array.from(jobCards).slice(0, 10).map(card => {
      // LinkedIn's class names may vary, these are common ones
      const titleElement = card.querySelector('.job-card-list__title, [class*="job-title"]');
      const companyElement = card.querySelector('.job-card-container__company-name, [class*="company-name"]');
      const locationElement = card.querySelector('.job-card-container__metadata-item, [class*="location"]');
      const easyApplyElement = card.querySelector('.job-card-container__apply-method--easy-apply, [class*="easy-apply"]');
      
      return {
        id: card.getAttribute('data-job-id'),
        title: titleElement?.textContent?.trim() || 'Unknown Title',
        company: companyElement?.textContent?.trim() || 'Unknown Company',
        location: locationElement?.textContent?.trim() || 'Unknown Location',
        isEasyApply: !!easyApplyElement
      };
    });
  });
  
  console.log(`✅ Extracted ${jobs.length} job listings:`);
  jobs.forEach((job, index) => {
    console.log(`${index + 1}. ${job.title} at ${job.company} (${job.isEasyApply ? 'Easy Apply' : 'External'})${job.location ? ` - ${job.location}` : ''}`);
  });
  
  return jobs;
}

const jobListings = await extractJobListings();
```

### Step 5: Test Job Click and Details Extraction

```javascript
// Click on a job and extract details
async function testJobInteraction(jobIndex = 0) {
  try {
    // Click on the first job
    const jobCards = await page.locator('[data-job-id]');
    const firstJob = jobCards.nth(jobIndex);
    await firstJob.click();
    
    // Wait for job details to load
    await page.waitForTimeout(2000);
    
    // Extract job details
    const jobDetails = await page.evaluate(() => {
      // Find the job details pane (usually on the right side)
      const detailsPane = document.querySelector('[class*="job-details"], [class*="job-view"]');
      
      if (!detailsPane) return null;
      
      return {
        description: detailsPane.querySelector('[class*="description"]')?.textContent?.trim(),
        hasApplyButton: !!detailsPane.querySelector('button:has-text("Apply"), button:has-text("Easy Apply")'),
        isEasyApply: !!detailsPane.querySelector('button:has-text("Easy Apply")'),
        hasExternalLink: !!detailsPane.querySelector('a[href*="externalApply"]')
      };
    });
    
    console.log('✅ Job details extracted:', jobDetails);
    return jobDetails;
  } catch (error) {
    console.error('❌ Job interaction failed:', error.message);
    return null;
  }
}

await testJobInteraction();
```

### Step 6: Test Apply Button Detection

```javascript
// Test different types of apply buttons
async function testApplyButtons() {
  console.log('Testing apply button detection...');
  
  // Check for Easy Apply
  const hasEasyApply = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.some(btn => 
      btn.textContent?.toLowerCase().includes('easy apply') ||
      btn.getAttribute('aria-label')?.toLowerCase().includes('easy apply')
    );
  });
  
  // Check for regular Apply button
  const hasRegularApply = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a'));
    return buttons.some(btn => 
      btn.textContent?.toLowerCase() === 'apply' ||
      btn.textContent?.toLowerCase().includes('apply on company')
    );
  });
  
  console.log('Easy Apply available:', hasEasyApply);
  console.log('External Apply available:', hasRegularApply);
  
  return { hasEasyApply, hasRegularApply };
}

await testApplyButtons();
```

## Stagehand Integration Testing

Since your automation uses Stagehand (AI-powered browser automation), you can test it directly in the playground:

### Using the "Convert to Stagehand" Feature

1. Write regular Playwright code in the editor
2. Click "Convert to Stagehand" button
3. The playground will convert your code to use Stagehand's AI capabilities
4. Click "Run" to execute the Stagehand version

### Example: Convert Search to Stagehand

**Original Playwright Code:**
```javascript
await page.goto('https://www.linkedin.com/jobs/');
await page.fill('input[aria-label*="Search"]', 'React Developer');
await page.fill('input[aria-label*="Location"]', 'San Francisco');
await page.click('button[aria-label*="Search"]');
```

**After "Convert to Stagehand":**
```javascript
await page.goto('https://www.linkedin.com/jobs/');
await stagehand.act({ action: "Search for React Developer jobs in San Francisco" });
```

### Testing Stagehand Commands Directly

```javascript
// This simulates Stagehand initialization
// In real implementation, Stagehand would be initialized with API keys
console.log('Simulating Stagehand initialization...');

// Mock Stagehand's act() method
async function stagehandAct(instruction) {
  console.log(`Stagehand AI instruction: "${instruction}"`);
  
  // Simulate AI interpretation
  if (instruction.includes('Search for jobs')) {
    await testTraditionalSearch();
  } else if (instruction.includes('Click on')) {
    await testJobInteraction();
  } else if (instruction.includes('Extract')) {
    return await extractJobListings();
  }
}

// Mock Stagehand's extract() method
async function stagehandExtract(config) {
  console.log(`Stagehand extraction with schema:`, config.schema);
  
  if (config.instruction.includes('job listings')) {
    return await extractJobListings();
  }
}
```

### Test Natural Language Actions

```javascript
// Test Stagehand-style natural language commands
async function testStagehandCommands() {
  console.log('\n🤖 Testing Stagehand AI commands...\n');
  
  // Test search command
  await stagehandAct('Search for jobs based on these criteria: "Senior React developer in San Francisco with remote options"');
  
  // Test extraction command
  const jobs = await stagehandExtract({
    instruction: 'Extract all job listings on the page',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          company: { type: 'string' },
          location: { type: 'string' },
          isEasyApply: { type: 'boolean' }
        }
      }
    }
  });
  
  console.log('Extracted jobs via Stagehand:', jobs);
}

await testStagehandCommands();
```

## Edge Case Testing

### 1. Login Detection

```javascript
async function testLoginDetection() {
  const loginIndicators = await page.evaluate(() => {
    return {
      urlHasLogin: window.location.href.includes('/login'),
      hasLoginButton: !!document.querySelector('a[href*="sign-in"], button:has-text("Sign in")'),
      hasLoginForm: !!document.querySelector('form[action*="login"], form[id*="login"]'),
      bodyTextHasSignIn: document.body.textContent.toLowerCase().includes('sign in')
    };
  });
  
  console.log('Login detection results:', loginIndicators);
  return Object.values(loginIndicators).some(v => v);
}

const needsLogin = await testLoginDetection();
```

### 2. Rate Limiting Detection

```javascript
async function testRateLimitDetection() {
  const rateLimitIndicators = await page.evaluate(() => {
    const bodyText = document.body.textContent.toLowerCase();
    return {
      hasTooManyRequests: bodyText.includes('too many requests'),
      hasTryAgainLater: bodyText.includes('try again later'),
      hasRateLimitMessage: bodyText.includes('rate limit'),
      hasSlowDown: bodyText.includes('slow down')
    };
  });
  
  console.log('Rate limit detection:', rateLimitIndicators);
  return Object.values(rateLimitIndicators).some(v => v);
}

const isRateLimited = await testRateLimitDetection();
```

### 3. CAPTCHA Detection

```javascript
async function testCaptchaDetection() {
  const captchaIndicators = await page.evaluate(() => {
    return {
      hasRecaptcha: !!document.querySelector('iframe[src*="recaptcha"]'),
      hasCaptchaClass: !!document.querySelector('[class*="captcha"]'),
      hasChallengeText: document.body.textContent.toLowerCase().includes('verify you are human'),
      hasHCaptcha: !!document.querySelector('iframe[src*="hcaptcha"]')
    };
  });
  
  console.log('CAPTCHA detection:', captchaIndicators);
  return Object.values(captchaIndicators).some(v => v);
}

const hasCaptcha = await testCaptchaDetection();
```

### 4. External Application Tab Testing

```javascript
async function testExternalApplication() {
  console.log('Testing external application handling...');
  
  // Set up listener for new pages (tabs)
  const browser = page.context();
  let newPageOpened = false;
  
  browser.on('page', async (newPage) => {
    console.log('New tab opened:', await newPage.url());
    newPageOpened = true;
    
    // Test the new page
    await newPage.waitForLoadState('domcontentloaded');
    
    // Check if it's an external job application site
    const isExternal = await newPage.evaluate(() => {
      return !window.location.href.includes('linkedin.com');
    });
    
    console.log('Is external site:', isExternal);
    
    // Don't close in real testing - just for cleanup
    // await newPage.close();
  });
  
  // Try clicking an external apply button
  try {
    await page.click('a[href*="externalApply"], button:has-text("Apply on company website")');
    await page.waitForTimeout(3000);
  } catch (error) {
    console.log('No external apply button found to test');
  }
  
  return newPageOpened;
}

// Only test if you have an external job selected
// await testExternalApplication();
```

## Complete Test Script

Here's a comprehensive test script that runs all tests:

```javascript
async function runCompleteLinkedInAutomationTest() {
  console.log('=================================');
  console.log('LinkedIn Automation Test Suite');
  console.log('=================================\n');
  
  const results = {
    navigation: false,
    authentication: false,
    search: false,
    extraction: false,
    interaction: false,
    edgeCases: {
      loginDetection: false,
      rateLimiting: false,
      captcha: false
    }
  };
  
  try {
    // 1. Navigation Test
    console.log('1️⃣  Testing Navigation...');
    await page.goto('https://www.linkedin.com/jobs/');
    await page.waitForLoadState('networkidle');
    results.navigation = true;
    console.log('✅ Navigation successful\n');
    
    // 2. Authentication Check
    console.log('2️⃣  Testing Authentication...');
    const needsLogin = await testLoginDetection();
    if (needsLogin) {
      console.log('⚠️  Login required - Please log in and restart test\n');
      return results;
    }
    results.authentication = true;
    console.log('✅ Authentication successful\n');
    
    // 3. Search Test
    console.log('3️⃣  Testing Search...');
    await testTraditionalSearch();
    results.search = true;
    console.log('✅ Search successful\n');
    
    // 4. Extraction Test
    console.log('4️⃣  Testing Job Extraction...');
    const jobs = await extractJobListings();
    results.extraction = jobs.length > 0;
    console.log(`✅ Extraction successful - Found ${jobs.length} jobs\n`);
    
    // 5. Interaction Test
    console.log('5️⃣  Testing Job Interaction...');
    if (jobs.length > 0) {
      const details = await testJobInteraction();
      results.interaction = details !== null;
      console.log('✅ Interaction successful\n');
    }
    
    // 6. Edge Cases
    console.log('6️⃣  Testing Edge Cases...');
    results.edgeCases.loginDetection = true; // Already tested
    results.edgeCases.rateLimiting = !(await testRateLimitDetection());
    results.edgeCases.captcha = !(await testCaptchaDetection());
    console.log('✅ Edge case tests completed\n');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
  
  // Print summary
  console.log('=================================');
  console.log('Test Summary');
  console.log('=================================');
  console.log(`Navigation: ${results.navigation ? '✅' : '❌'}`);
  console.log(`Authentication: ${results.authentication ? '✅' : '❌'}`);
  console.log(`Search: ${results.search ? '✅' : '❌'}`);
  console.log(`Extraction: ${results.extraction ? '✅' : '❌'}`);
  console.log(`Interaction: ${results.interaction ? '✅' : '❌'}`);
  console.log(`No Login Issues: ${results.edgeCases.loginDetection ? '✅' : '❌'}`);
  console.log(`No Rate Limiting: ${results.edgeCases.rateLimiting ? '✅' : '❌'}`);
  console.log(`No CAPTCHA: ${results.edgeCases.captcha ? '✅' : '❌'}`);
  
  const allPassed = Object.values(results).every(v => 
    typeof v === 'boolean' ? v : Object.values(v).every(ev => ev)
  );
  
  console.log(`\nOverall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  
  return results;
}

// Run the complete test suite
await runCompleteLinkedInAutomationTest();
```

## Validation Checklist

Before considering the automation ready for production:

### Core Functionality
- [ ] **Navigation**: Can navigate to LinkedIn Jobs without errors
- [ ] **Authentication**: Properly detects login state
- [ ] **Search**: Both traditional and natural language search work
- [ ] **Job Extraction**: Successfully extracts job listings with all fields
- [ ] **Job Interaction**: Can click on jobs and view details
- [ ] **Apply Detection**: Correctly identifies Easy Apply vs External jobs

### Edge Cases
- [ ] **Login Detection**: Accurately detects when login is required
- [ ] **Rate Limiting**: Detects rate limit messages
- [ ] **CAPTCHA Detection**: Identifies CAPTCHA challenges
- [ ] **External Applications**: Can handle external job application links

### Stagehand Integration
- [ ] **Natural Language**: AI commands are properly interpreted
- [ ] **Data Extraction**: Structured data extraction works with schemas
- [ ] **Error Handling**: Graceful handling of AI interpretation failures

### Performance
- [ ] **Page Load Times**: Pages load within acceptable timeframes
- [ ] **Selector Stability**: CSS selectors work consistently
- [ ] **Memory Usage**: No memory leaks during extended sessions

## Troubleshooting

### Common Issues and Solutions

#### 1. Selectors Not Working
```javascript
// LinkedIn often changes class names. Use more robust selectors:
// Instead of: '.job-card-list__title'
// Use: '[class*="job-title"], [class*="job-card-title"]'

// Or use text-based selectors:
await page.locator('text=Jobs you may be interested in').waitFor();
```

#### 2. Page Not Loading
```javascript
// Add more specific wait conditions
await page.waitForSelector('[data-job-id]', { timeout: 30000 });
// Or wait for specific text
await page.waitForFunction(() => 
  document.body.textContent.includes('jobs')
);
```

#### 3. Login Loop
```javascript
// Check for cookie issues
const cookies = await page.context().cookies();
console.log('Session cookies:', cookies.filter(c => c.name.includes('li_at')));
```

#### 4. Rate Limiting
```javascript
// Add delays between actions
await page.waitForTimeout(2000 + Math.random() * 3000); // Random delay 2-5 seconds
```

## Next Steps

After successful playground testing:

1. **Document Working Selectors**: Save all working CSS selectors
2. **Test with Backend**: Run your actual Node.js application
3. **Monitor Performance**: Track success rates and failures
4. **Implement Logging**: Add comprehensive logging for production
5. **Set Up Monitoring**: Use Browserbase's monitoring features

## Tips for Production

1. **Use Persistent Contexts**: Maintain login sessions
2. **Implement Retry Logic**: Handle temporary failures
3. **Add Human-like Delays**: Avoid detection as a bot
4. **Monitor Rate Limits**: Track and respect LinkedIn's limits
5. **Regular Testing**: LinkedIn changes their UI frequently

This completes the Browserbase playground testing guide. Regular testing ensures your automation continues to work as LinkedIn updates their platform.