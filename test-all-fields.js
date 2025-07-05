/**
 * Test to show ALL fields now available from JSearch API
 */
require('dotenv').config();
const axios = require('axios');

async function testAllFields() {
  console.log('Testing job search API to see ALL available fields...\n');
  
  try {
    const response = await axios.post('http://localhost:3001/api/jobs/match', {
      resumeText: `John Doe
Software Engineer with 5+ years experience
Skills: JavaScript, Python, React, Node.js, AWS, Docker, Kubernetes
Experience: Built scalable web applications, led teams, cloud architecture`,
      jobTitle: 'software engineer',
      location: 'San Francisco, CA',
      datePosted: 'week'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.API_KEY || 'test-api-key-2024'
      }
    });
    
    const jobs = response.data.data.jobs;
    
    if (jobs.length > 0) {
      const firstJob = jobs[0];
      
      console.log('=== FIRST JOB - ALL AVAILABLE FIELDS ===\n');
      
      // Group fields by category
      const fieldCategories = {
        'Basic Info': [
          'job_id', 'job_title', 'employer_name', 'employer_logo', 
          'employer_website', 'employer_company_type'
        ],
        'Location': [
          'job_city', 'job_state', 'job_country', 'job_is_remote',
          'job_latitude', 'job_longitude', 'location_display'
        ],
        'Application': [
          'job_apply_link', 'job_apply_is_direct', 'job_apply_quality_score',
          'job_google_link', 'job_publisher'
        ],
        'Compensation': [
          'job_min_salary', 'job_max_salary', 'job_salary_currency',
          'job_salary_period', 'job_benefits', 'salary_estimate'
        ],
        'Requirements': [
          'job_required_experience', 'job_required_skills', 
          'job_required_education', 'job_experience_in_place_of_education',
          'extracted_requirements'
        ],
        'Timing': [
          'job_posted_at_timestamp', 'job_posted_at_datetime_utc',
          'job_offer_expiration_timestamp', 'job_offer_expiration_datetime_utc',
          'posted_days_ago', 'application_deadline_days'
        ],
        'Classification': [
          'job_employment_type', 'job_onet_soc', 'job_onet_job_zone',
          'job_job_title', 'job_posting_language'
        ],
        'Content': [
          'job_description', 'job_description_clean', 'job_highlights'
        ],
        'AI Matching': [
          'match_score', 'match_label', 'match_reasons', 
          'missing_skills', 'key_strengths', 'match_error'
        ]
      };
      
      // Display fields by category
      for (const [category, fields] of Object.entries(fieldCategories)) {
        console.log(`\n${category}:`);
        console.log('─'.repeat(50));
        
        for (const field of fields) {
          if (firstJob.hasOwnProperty(field)) {
            const value = firstJob[field];
            let displayValue = value;
            
            // Format display based on type
            if (value === null) {
              displayValue = 'null';
            } else if (value === undefined) {
              displayValue = 'undefined';
            } else if (typeof value === 'object') {
              displayValue = JSON.stringify(value, null, 2);
            } else if (typeof value === 'string' && value.length > 100) {
              displayValue = value.substring(0, 100) + '...';
            }
            
            console.log(`  ${field}: ${displayValue}`);
          } else {
            console.log(`  ${field}: [FIELD MISSING]`);
          }
        }
      }
      
      // Show total field count
      const allFields = Object.keys(firstJob);
      console.log(`\n\nTOTAL FIELDS AVAILABLE: ${allFields.length}`);
      
      // Show any fields not categorized
      const categorizedFields = Object.values(fieldCategories).flat();
      const uncategorizedFields = allFields.filter(f => !categorizedFields.includes(f));
      
      if (uncategorizedFields.length > 0) {
        console.log('\nUncategorized fields:', uncategorizedFields.join(', '));
      }
      
      // Check for important premium fields
      console.log('\n\n=== PREMIUM FIELD CHECK ===');
      const premiumFields = [
        'job_highlights',
        'job_apply_quality_score',
        'job_onet_soc',
        'job_onet_job_zone',
        'job_experience_in_place_of_education',
        'job_offer_expiration_timestamp'
      ];
      
      for (const field of premiumFields) {
        const hasField = firstJob.hasOwnProperty(field) && firstJob[field] !== null;
        console.log(`${field}: ${hasField ? '✅ Present' : '❌ Missing'}`);
      }
      
    } else {
      console.log('No jobs found in response');
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Run test
console.log('Make sure the backend server is running on http://localhost:3001\n');
testAllFields();