/**
 * Security test script for the API
 * Run with: node test-security.js
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.API_KEY || 'test-api-key';

async function testSecurityHeaders() {
  console.log('🔍 Testing Security Headers...\n');
  
  try {
    // Test health endpoint (no auth required)
    console.log('1. Testing health endpoint headers:');
    const healthResponse = await axios.get(`${API_BASE_URL}/api/health`);
    
    const securityHeaders = [
      'x-request-id',
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection',
      'strict-transport-security',
      'referrer-policy',
      'x-powered-by'
    ];
    
    console.log('Response headers received:');
    securityHeaders.forEach(header => {
      const value = healthResponse.headers[header];
      if (header === 'x-powered-by') {
        console.log(`  ${header}: ${value ? '❌ PRESENT (should be removed)' : '✅ REMOVED'}`);
      } else {
        console.log(`  ${header}: ${value ? `✅ ${value}` : '❌ MISSING'}`);
      }
    });
    
    console.log('\n2. Testing authenticated endpoint without API key:');
    try {
      await axios.post(`${API_BASE_URL}/api/jobs/search`, {
        query: 'software engineer'
      });
      console.log('❌ Request succeeded without API key (should have failed)');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Request correctly rejected with 401 (unauthorized)');
        console.log(`   Message: ${error.response.data.error}`);
        console.log(`   Request ID: ${error.response.data.requestId || 'No request ID'}`);
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }
    
    console.log('\n3. Testing authenticated endpoint with invalid API key:');
    try {
      await axios.post(`${API_BASE_URL}/api/jobs/search`, {
        query: 'software engineer'
      }, {
        headers: {
          'X-API-Key': 'invalid-key'
        }
      });
      console.log('❌ Request succeeded with invalid API key (should have failed)');
    } catch (error) {
      if (error.response?.status === 403) {
        console.log('✅ Request correctly rejected with 403 (forbidden)');
        console.log(`   Message: ${error.response.data.error}`);
        console.log(`   Request ID: ${error.response.data.requestId || 'No request ID'}`);
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }
    
    console.log('\n4. Testing input validation with malicious content:');
    try {
      await axios.post(`${API_BASE_URL}/api/jobs/match`, {
        resumeText: '<script>alert("XSS")</script>This is a test resume with potentially malicious content <iframe src="evil.com"></iframe>',
        query: 'software engineer'
      }, {
        headers: {
          'X-API-Key': API_KEY
        }
      });
      console.log('✅ Request accepted (content should be sanitized)');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Validation error (if resume too short):', error.response.data.error);
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        console.log('⚠️  Authentication required - set API_KEY environment variable');
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }
    
    console.log('\n5. Testing 404 handling:');
    try {
      await axios.get(`${API_BASE_URL}/api/nonexistent`);
      console.log('❌ Request succeeded on non-existent route');
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('✅ 404 error correctly returned');
        console.log(`   Request ID: ${error.response.headers['x-request-id'] || 'No request ID'}`);
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }
    
    console.log('\n6. Testing rate limiting (may take a few seconds):');
    const requests = [];
    for (let i = 0; i < 105; i++) {
      requests.push(
        axios.get(`${API_BASE_URL}/api/health`)
          .then(() => ({ success: true }))
          .catch(error => ({ 
            success: false, 
            status: error.response?.status,
            message: error.response?.data?.error
          }))
      );
    }
    
    const results = await Promise.all(requests);
    const rateLimited = results.filter(r => !r.success && r.status === 429);
    
    if (rateLimited.length > 0) {
      console.log(`✅ Rate limiting working: ${rateLimited.length} requests were rate limited`);
    } else {
      console.log('⚠️  Rate limiting might not be working (all 105 requests succeeded)');
    }
    
    console.log('\n✅ Security test completed!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testSecurityHeaders().catch(console.error);