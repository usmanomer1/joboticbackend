/**
 * Test script for the /api/jobs/usage endpoint
 * Run with: node test-usage-endpoint.js
 */

const axios = require('axios');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const SUPABASE_TOKEN = process.env.TEST_SUPABASE_TOKEN || 'YOUR_SUPABASE_TOKEN_HERE';

async function testUsageEndpoint() {
  try {
    console.log('Testing GET /api/jobs/usage endpoint...\n');
    
    const response = await axios.get(`${API_BASE_URL}/api/jobs/usage`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Success! Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Validate response structure
    const { data } = response.data;
    
    console.log('\n📊 Summary:');
    console.log(`- Current Plan: ${data.plan.name}`);
    console.log(`- Plan Limit: ${data.plan.isUnlimited ? 'Unlimited' : data.plan.limit}`);
    console.log(`- Jobs Used This Month: ${data.currentMonth.totalJobsViewed}`);
    console.log(`- Remaining: ${data.currentMonth.remaining}`);
    console.log(`- Percent Used: ${data.currentMonth.percentUsed}%`);
    console.log(`- History Months Available: ${data.history.length}`);
    console.log(`- Recent Searches: ${data.recentSearches.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.error('\n⚠️  Authentication failed. Please provide a valid Supabase token.');
    }
  }
}

// Run the test
console.log('🚀 Starting usage endpoint test...\n');
testUsageEndpoint();