/**
 * Test job search API to verify employer_logo field
 */
require('dotenv').config();
const axios = require('axios');

async function testJobLogos() {
  console.log('Testing job search API for employer logos...\n');
  
  try {
    // Test the match endpoint
    const response = await axios.post('http://localhost:5001/api/jobs/match', {
      resumeText: `Software Engineer with 5 years experience in JavaScript, React, Node.js`,
      jobTitle: 'software engineer',
      location: 'San Francisco, CA',
      datePosted: 'week'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.API_KEY || 'your-api-key-here'
      }
    });
    
    console.log('Response received. Checking for employer_logo field...\n');
    
    const jobs = response.data.data.jobs;
    
    // Check first 5 jobs for logos
    jobs.slice(0, 5).forEach((job, index) => {
      console.log(`Job ${index + 1}:`);
      console.log(`  Company: ${job.employer_name}`);
      console.log(`  Logo: ${job.employer_logo || 'NO LOGO FIELD'}`);
      console.log(`  Has logo field: ${job.hasOwnProperty('employer_logo') ? 'YES' : 'NO'}`);
      console.log('');
    });
    
    // Count how many jobs have logos
    const jobsWithLogos = jobs.filter(job => job.employer_logo).length;
    console.log(`\nSummary: ${jobsWithLogos}/${jobs.length} jobs have employer logos`);
    
    // Show all fields for first job
    console.log('\nAll fields in first job object:');
    console.log(Object.keys(jobs[0]).sort().join(', '));
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Check if server is running
console.log('Make sure the backend server is running on http://localhost:5001');
console.log('Press Ctrl+C to exit\n');

testJobLogos();