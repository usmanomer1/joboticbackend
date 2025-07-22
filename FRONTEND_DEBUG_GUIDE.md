# Frontend Debug Guide - Header Stripping Issue

## Issue Summary
The Authorization and X-API-Key headers are being stripped between the frontend and Railway deployment. The frontend is sending the headers correctly, but the backend is not receiving them.

## Debug Steps Added

### 1. Raw Headers Debug Logging
I've added debug logging at the very beginning of the Express app that logs ALL incoming headers. This will appear in your Railway logs as:
```
=== RAW HEADERS DEBUG ===
POST /api/jobs/match
ALL headers: { ... }
Authorization: [value or "NOT FOUND"]
X-API-Key: [value or "NOT FOUND"]
Origin: [value or "NOT SET"]
======================
```

### 2. Debug Headers Endpoint
Test endpoint available at: `GET/POST https://your-railway-url/api/debug/headers`

This endpoint will return all headers received by the server without requiring authentication.

Example test:
```bash
curl -X POST https://your-railway-url/api/debug/headers \
  -H "Authorization: Bearer test-token" \
  -H "X-API-Key: test-key" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

## Solutions to Try

### 1. Use Lowercase Header Names
Railway's proxy might be normalizing headers to lowercase. Try:
```javascript
headers: {
  'authorization': `Bearer ${token}`,  // lowercase
  'x-api-key': apiKey                  // lowercase
}
```

### 2. Try Alternative Header Names
Some proxies strip certain headers. Try these alternatives:
```javascript
headers: {
  'X-Auth-Token': apiKey,
  'X-Access-Token': token,
  'API-Key': apiKey,
  'Auth-Token': token
}
```

### 3. Use Query Parameters (Temporary Workaround)
If headers continue to be stripped, you can temporarily pass auth in query params:
```javascript
const url = `${API_URL}/api/jobs/match?api_key=${apiKey}&auth_token=${token}`;
```

Then update the backend to check `req.query` in addition to headers.

### 4. Check Railway Configuration
1. Check if Railway has any header forwarding settings
2. Look for proxy configuration options
3. Check if there are any WAF or security rules stripping headers

### 5. Use Request ID for Correlation
The backend adds a request ID to all responses. Use this to correlate frontend requests with backend logs:
```javascript
// In frontend response handler
console.log('Request ID:', response.headers['x-request-id']);
```

### 6. Test with Different Clients
Test if the issue is specific to your frontend setup:
```bash
# Test from command line
curl -X GET https://your-railway-url/api/debug/headers \
  -H "Authorization: Bearer test" \
  -H "X-API-Key: test"

# Test from different origins
# This helps identify if it's a CORS-related issue
```

## Monitoring the Logs

1. Deploy these changes to Railway
2. Make a request from your frontend
3. Check Railway logs for the "RAW HEADERS DEBUG" output
4. Look for which headers are actually reaching the server
5. Check the auth middleware debug logs to see where it's failing

## Next Steps Based on Findings

### If headers are completely missing:
- Railway proxy is stripping them
- Try alternative header names
- Contact Railway support about header forwarding

### If headers are present but in different format:
- Update backend to handle the format Railway provides
- Normalize header access (check both cases)

### If only certain headers are missing:
- Those specific headers are being filtered
- Use alternative header names for those

## Quick Test Script for Frontend
```javascript
// Test function to debug headers
async function testHeaders() {
  const testUrl = 'https://your-railway-url/api/debug/headers';
  
  const tests = [
    {
      name: 'Standard Headers',
      headers: {
        'Authorization': 'Bearer test-token',
        'X-API-Key': 'test-key'
      }
    },
    {
      name: 'Lowercase Headers',
      headers: {
        'authorization': 'Bearer test-token',
        'x-api-key': 'test-key'
      }
    },
    {
      name: 'Alternative Headers',
      headers: {
        'X-Auth-Token': 'test-token',
        'API-Key': 'test-key'
      }
    }
  ];
  
  for (const test of tests) {
    console.log(`\nTesting: ${test.name}`);
    try {
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...test.headers
        },
        body: JSON.stringify({ test: test.name })
      });
      
      const data = await response.json();
      console.log('Headers received by server:', data.data.headersReceived);
    } catch (error) {
      console.error('Test failed:', error);
    }
  }
}

// Run the test
testHeaders();
```

## Contact Information
If you need to modify the backend auth to accept alternative headers or implement a workaround, let me know which approach works and I can update the authentication middleware accordingly.