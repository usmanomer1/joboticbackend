const fetch = require('node-fetch');
require('dotenv').config();

async function debugBrowserbaseConnection() {
  console.log('=== Browserbase Connection Debug ===\n');
  
  // 1. Check environment variables
  console.log('1. Environment Check:');
  console.log('   BROWSERBASE_API_KEY:', process.env.BROWSERBASE_API_KEY ? '✓ Set' : '✗ Missing');
  console.log('   BROWSERBASE_PROJECT_ID:', process.env.BROWSERBASE_PROJECT_ID ? '✓ Set' : '✗ Missing');
  console.log('');

  if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_PROJECT_ID) {
    console.error('❌ Missing required environment variables');
    return;
  }

  // 2. Test API connectivity
  console.log('2. Testing Browserbase API:');
  try {
    const response = await fetch('https://api.browserbase.com/v1/sessions', {
      method: 'GET',
      headers: {
        'x-bb-api-key': process.env.BROWSERBASE_API_KEY
      }
    });
    console.log('   API Status:', response.status);
    console.log('   API Response:', response.ok ? '✓ OK' : '✗ Failed');
    
    if (!response.ok) {
      const error = await response.text();
      console.log('   Error:', error);
    }
  } catch (error) {
    console.error('   ✗ API Connection failed:', error.message);
  }
  console.log('');

  // 3. Create a test session
  console.log('3. Creating Test Session:');
  try {
    const sessionResponse = await fetch('https://api.browserbase.com/v1/sessions', {
      method: 'POST',
      headers: {
        'x-bb-api-key': process.env.BROWSERBASE_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        projectId: process.env.BROWSERBASE_PROJECT_ID,
        proxies: true,
        timeout: 300 // 5 minutes
      })
    });

    if (!sessionResponse.ok) {
      const error = await sessionResponse.text();
      console.error('   ✗ Session creation failed:', error);
      return;
    }

    const session = await sessionResponse.json();
    console.log('   ✓ Session created:', session.id);
    console.log('   Status:', session.status);
    console.log('');

    // 4. Get debug URLs
    console.log('4. Getting Debug URLs:');
    const debugResponse = await fetch(`https://api.browserbase.com/v1/sessions/${session.id}/debug`, {
      method: 'GET',
      headers: {
        'x-bb-api-key': process.env.BROWSERBASE_API_KEY
      }
    });

    if (debugResponse.ok) {
      const debugData = await debugResponse.json();
      console.log('   ✓ Debug URL:', debugData.debuggerUrl);
      console.log('   ✓ Fullscreen URL:', debugData.debuggerFullscreenUrl);
    } else {
      console.error('   ✗ Failed to get debug URLs');
    }
    console.log('');

    // 5. Test with Stagehand
    console.log('5. Testing Stagehand Connection:');
    const { Stagehand } = require('@browserbasehq/stagehand');
    
    const stagehand = new Stagehand({
      browserbaseSessionId: session.id,
      headless: false,
      logger: {
        level: 'debug'
      }
    });

    try {
      await stagehand.init();
      console.log('   ✓ Stagehand initialized');
      
      // Test navigation
      console.log('   Testing navigation to LinkedIn...');
      await stagehand.page.goto('https://www.linkedin.com/jobs/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      console.log('   ✓ Successfully navigated to LinkedIn');
      
      // Get current URL
      const currentUrl = stagehand.page.url();
      console.log('   Current URL:', currentUrl);
      
    } catch (navError) {
      console.error('   ✗ Navigation failed:', navError.message);
      console.error('   Error type:', navError.constructor.name);
      
      // Check if it's a proxy issue
      if (navError.message.includes('ERR_TUNNEL_CONNECTION_FAILED')) {
        console.log('\n⚠️  Proxy Tunnel Connection Failed');
        console.log('   This indicates the Browserbase proxy cannot reach LinkedIn');
        console.log('   Possible causes:');
        console.log('   - Browserbase proxy servers are down');
        console.log('   - LinkedIn is blocking Browserbase proxy IPs');
        console.log('   - Network connectivity issues on Browserbase side');
      }
    } finally {
      try {
        await stagehand.close();
        console.log('   ✓ Stagehand closed');
      } catch (e) {
        console.log('   ⚠️  Failed to close Stagehand');
      }
    }

  } catch (error) {
    console.error('   ✗ Test failed:', error.message);
  }

  console.log('\n=== Debug Complete ===');
}

// Run the debug
debugBrowserbaseConnection().catch(console.error);