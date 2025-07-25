// Add this to your stagehand.config.js or wherever you configure Browserbase

const originalFetch = global.fetch;
global.fetch = async (...args) => {
  const [url, options] = args;
  
  // Log all Browserbase API calls
  if (url && url.includes('browserbase.com')) {
    console.log('\n[BROWSERBASE API CALL]', {
      url,
      method: options?.method || 'GET',
      body: options?.body ? JSON.parse(options.body) : undefined,
      timestamp: new Date().toISOString()
    });
  }
  
  const response = await originalFetch(...args);
  
  // Log response for session creation
  if (url && url.includes('browserbase.com/sessions') && options?.method === 'POST') {
    const clonedResponse = response.clone();
    const responseData = await clonedResponse.json();
    console.log('[BROWSERBASE SESSION CREATED]', responseData);
  }
  
  return response;
};