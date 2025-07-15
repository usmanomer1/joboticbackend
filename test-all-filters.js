/**
 * Comprehensive test for all job search filters
 * Run with: node test-all-filters.js
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.API_KEY || 'test-api-key';

// Sample resume for matching tests
const SAMPLE_RESUME = `
SOFTWARE ENGINEER - 2 Years Experience
Entry-level developer with experience in web development

SKILLS:
- JavaScript, HTML, CSS
- React basics
- Node.js fundamentals
- Git version control

EXPERIENCE:
Junior Developer at StartupXYZ (2022-2024)
- Built responsive web interfaces
- Collaborated on REST API development
- Participated in code reviews

EDUCATION:
Bachelor of Computer Science (2022)
`;

async function testFilters(endpoint, filters, description) {
  console.log(`\n🧪 Testing: ${description}`);
  console.log('Filters:', JSON.stringify(filters, null, 2));
  
  try {
    const payload = endpoint === '/api/jobs/match' 
      ? { resumeText: SAMPLE_RESUME, ...filters }
      : filters;
      
    const response = await axios.post(`${API_BASE_URL}${endpoint}`, payload, {
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    const jobs = response.data.data.jobs;
    console.log(`✅ Success: Found ${jobs.length} jobs`);
    
    // Show first job as example
    if (jobs.length > 0) {
      const job = jobs[0];
      console.log('\nFirst job example:');
      console.log(`  Title: ${job.job_title}`);
      console.log(`  Company: ${job.employer_name}`);
      console.log(`  Type: ${job.job_employment_type}`);
      console.log(`  Remote: ${job.job_is_remote ? 'Yes' : 'No'}`);
      console.log(`  Location: ${job.job_city}, ${job.job_state}`);
      if (endpoint === '/api/jobs/match') {
        console.log(`  Match Score: ${job.match_score} (${job.match_label})`);
      }
    }
    
    return jobs.length;
  } catch (error) {
    console.error(`❌ Failed: ${error.response?.data?.error || error.message}`);
    if (error.response?.data?.details) {
      console.error('Validation errors:', error.response.data.details);
    }
    return 0;
  }
}

async function runAllTests() {
  console.log('🚀 Testing All Job Search Filters\n');
  console.log('API URL:', API_BASE_URL);
  console.log('═'.repeat(80));
  
  // Test both endpoints
  for (const endpoint of ['/api/jobs/search', '/api/jobs/match']) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📍 Testing endpoint: ${endpoint}`);
    console.log(`${'='.repeat(80)}`);
    
    // Test 1: Employment Type Filters
    await testFilters(endpoint, {
      query: 'software engineer Vancouver BC',
      employment_types: ['FULLTIME']
    }, 'Full-time positions only');
    
    await testFilters(endpoint, {
      query: 'software engineer intern Vancouver BC',
      employment_types: ['INTERN']
    }, 'Internships only');
    
    await testFilters(endpoint, {
      query: 'software developer Vancouver BC',
      employment_types: ['FULLTIME', 'CONTRACTOR']
    }, 'Full-time OR Contractor positions');
    
    // Test 2: Experience Level Filters
    await testFilters(endpoint, {
      query: 'software engineer Vancouver BC',
      job_requirements: ['no_exp']
    }, 'No experience required');
    
    await testFilters(endpoint, {
      query: 'software engineer Vancouver BC',
      job_requirements: ['under_3_years_exp']
    }, 'Entry-level (under 3 years)');
    
    await testFilters(endpoint, {
      query: 'senior software engineer Vancouver BC',
      job_requirements: ['more_than_3_years_exp']
    }, 'Senior positions (3+ years)');
    
    // Test 3: Remote Work Filter
    await testFilters(endpoint, {
      query: 'software engineer',
      remote_jobs_only: true
    }, 'Remote positions only');
    
    // Test 4: Date Posted Filters
    await testFilters(endpoint, {
      query: 'software engineer Vancouver BC',
      date_posted: 'today'
    }, 'Posted today');
    
    await testFilters(endpoint, {
      query: 'software engineer Vancouver BC',
      date_posted: 'week'
    }, 'Posted this week');
    
    // Test 5: Combined Filters
    await testFilters(endpoint, {
      query: 'software engineer',
      employment_types: ['FULLTIME'],
      job_requirements: ['no_exp', 'no_degree'],
      remote_jobs_only: true,
      date_posted: 'week'
    }, 'Full-time remote entry-level positions posted this week');
    
    // Test 6: Pagination with filters
    await testFilters(endpoint, {
      query: 'software engineer Vancouver BC',
      employment_types: ['FULLTIME', 'INTERN'],
      num_pages: 3,
      page: 1
    }, 'Multiple pages with filters');
    
    // Test 7: Structured search (no query)
    await testFilters(endpoint, {
      jobTitle: 'software engineer',
      location: 'Vancouver, BC',
      employment_types: ['FULLTIME'],
      date_posted: 'month'
    }, 'Structured search with filters');
    
    // Additional test for match endpoint
    if (endpoint === '/api/jobs/match') {
      await testFilters(endpoint, {
        query: 'software engineer Vancouver BC',
        employment_types: ['FULLTIME'],
        num_pages: 5,
        min_score: 70
      }, 'Match with minimum score filter');
    }
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log('✅ All filter tests completed!');
  console.log('\n📋 Summary for Frontend Engineers:');
  console.log('1. All filters can be combined (they work as AND conditions)');
  console.log('2. Employment types: FULLTIME, PARTTIME, INTERN, CONTRACTOR');
  console.log('3. Job requirements: no_exp, under_3_years_exp, more_than_3_years_exp, no_degree, fair_chance');
  console.log('4. Date posted: all, today, 3days, week, month');
  console.log('5. Remote: remote_jobs_only (true/false)');
  console.log('6. Pagination: page (1+), num_pages (1-10)');
  console.log('7. Match only: min_score (0-100)');
}

// Run all tests
runAllTests().catch(console.error);