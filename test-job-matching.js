/**
 * Test script for job matching with increased limits
 * Run with: node test-job-matching.js
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.API_KEY || 'test-api-key';

// Sample resume for testing
const SAMPLE_RESUME = `
SENIOR SOFTWARE ENGINEER
10+ years of experience in full-stack development

SKILLS:
- Languages: JavaScript, TypeScript, Python, Java, Go
- Frontend: React, Angular, Vue.js, Next.js
- Backend: Node.js, Express, Django, Spring Boot
- Databases: PostgreSQL, MongoDB, Redis, MySQL
- Cloud: AWS, Azure, GCP, Docker, Kubernetes
- Tools: Git, Jenkins, CI/CD, Terraform

EXPERIENCE:
Senior Software Engineer at Tech Corp (2020-Present)
- Led development of microservices architecture
- Implemented CI/CD pipelines reducing deployment time by 60%
- Mentored junior developers and conducted code reviews

Software Engineer at StartupXYZ (2018-2020)
- Built scalable APIs serving 1M+ requests daily
- Developed React-based dashboard for analytics
- Worked in agile environment with 2-week sprints

EDUCATION:
Bachelor of Computer Science - University of Technology (2014)
`;

async function testJobSearch() {
  console.log('🔍 Testing Job Search (without AI matching)...\n');
  
  try {
    const response = await axios.post(`${API_BASE_URL}/api/jobs/search`, {
      query: 'software engineer Vancouver BC',
      location: 'Vancouver, BC',
      jobTitle: 'software engineer',
      page: 1,
      num_pages: 5  // Request 5 pages (50 jobs)
    }, {
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Search Results:');
    console.log(`   Total jobs found: ${response.data.data.totalFound}`);
    console.log(`   Jobs returned: ${response.data.data.jobs.length}`);
    console.log(`   Current page: ${response.data.data.currentPage}`);
    console.log(`   Total pages: ${response.data.data.totalPages}`);
    
    return response.data.data.totalFound;
  } catch (error) {
    console.error('❌ Search failed:', error.response?.data || error.message);
    return 0;
  }
}

async function testJobMatching(numPages = 5, minScore = 0) {
  console.log(`\n🤖 Testing AI Job Matching (${numPages} pages, min_score: ${minScore})...\n`);
  
  try {
    const startTime = Date.now();
    
    const response = await axios.post(`${API_BASE_URL}/api/jobs/match`, {
      resumeText: SAMPLE_RESUME,
      jobTitle: 'software engineer',
      location: 'Vancouver, BC',
      page: 1,
      num_pages: numPages,
      min_score: minScore
    }, {
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    const duration = Date.now() - startTime;
    
    console.log('✅ Match Results:');
    console.log(`   Total jobs found: ${response.data.data.totalFound}`);
    console.log(`   Jobs matched: ${response.data.data.totalMatched}`);
    console.log(`   Jobs after filtering: ${response.data.data.totalFiltered || response.data.data.jobs.length}`);
    console.log(`   Processing time: ${duration}ms`);
    
    // Show score distribution
    const scoreDistribution = {
      'STRONG MATCH (90-100)': 0,
      'GOOD MATCH (70-89)': 0,
      'FAIR MATCH (50-69)': 0,
      'WEAK MATCH (0-49)': 0
    };
    
    response.data.data.jobs.forEach(job => {
      if (job.match_score >= 90) scoreDistribution['STRONG MATCH (90-100)']++;
      else if (job.match_score >= 70) scoreDistribution['GOOD MATCH (70-89)']++;
      else if (job.match_score >= 50) scoreDistribution['FAIR MATCH (50-69)']++;
      else scoreDistribution['WEAK MATCH (0-49)']++;
    });
    
    console.log('\n📊 Score Distribution:');
    Object.entries(scoreDistribution).forEach(([label, count]) => {
      console.log(`   ${label}: ${count} jobs`);
    });
    
    // Show top 5 matches
    console.log('\n🏆 Top 5 Matches:');
    response.data.data.jobs.slice(0, 5).forEach((job, index) => {
      console.log(`\n   ${index + 1}. ${job.job_title} at ${job.employer_name}`);
      console.log(`      Score: ${job.match_score} (${job.match_label})`);
      console.log(`      Location: ${job.job_city}, ${job.job_state}${job.job_is_remote ? ' (Remote)' : ''}`);
      if (job.match_reasons && job.match_reasons.length > 0) {
        console.log(`      Match reasons: ${job.match_reasons[0]}`);
      }
    });
    
    return response.data.data.jobs;
  } catch (error) {
    console.error('❌ Matching failed:', error.response?.data || error.message);
    return [];
  }
}

async function runTests() {
  console.log('🚀 Starting Job Search & Matching Tests\n');
  console.log('API URL:', API_BASE_URL);
  console.log('═'.repeat(80));
  
  // Test 1: Basic search to see total available jobs
  const totalJobs = await testJobSearch();
  
  if (totalJobs === 0) {
    console.log('\n⚠️  No jobs found. Check your API key and connection.');
    return;
  }
  
  console.log('═'.repeat(80));
  
  // Test 2: AI matching with default settings (5 pages, no filter)
  await testJobMatching(5, 0);
  
  console.log('═'.repeat(80));
  
  // Test 3: AI matching with more pages
  await testJobMatching(8, 0);
  
  console.log('═'.repeat(80));
  
  // Test 4: AI matching with minimum score filter
  await testJobMatching(5, 70);
  
  console.log('\n✅ All tests completed!');
  console.log('\n💡 Summary:');
  console.log('- You can now request up to 10 pages (100 jobs) with num_pages parameter');
  console.log('- Use min_score parameter (0-100) to filter results by match score');
  console.log('- Default is 5 pages (50 jobs) with no score filtering');
}

// Run the tests
runTests().catch(console.error);