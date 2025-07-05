/**
 * Test job search API and download an actual employer logo
 */
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const https = require('https');

async function downloadLogo(url, filename) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filename);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', reject);
  });
}

async function testAndDownloadLogo() {
  console.log('Testing job search API and downloading employer logo...\n');
  
  try {
    // Hit the production API
    const response = await axios.post('https://jobotic-backend.vercel.app/api/jobs/match', {
      resumeText: `John Doe
Software Engineer
john.doe@email.com | (555) 123-4567 | San Francisco, CA

EXPERIENCE
Senior Software Engineer at TechCorp (2020-Present)
- Built scalable web applications using React and Node.js
- Led team of 5 developers on cloud migration project
- Improved system performance by 40% through optimization

SKILLS
JavaScript, Python, React, Node.js, AWS, Docker, Kubernetes`,
      jobTitle: 'software engineer',
      location: 'San Francisco, CA',
      datePosted: 'week'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.API_KEY || 'test-api-key-2024'
      }
    });
    
    console.log('Response received. Looking for jobs with logos...\n');
    
    const jobs = response.data.data.jobs;
    let logoFound = false;
    
    // Find first job with a logo
    for (const job of jobs) {
      if (job.employer_logo) {
        console.log(`Found logo for: ${job.employer_name}`);
        console.log(`Job Title: ${job.job_title}`);
        console.log(`Logo URL: ${job.employer_logo}`);
        
        // Download the logo
        const filename = `employer-logo-${job.employer_name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
        console.log(`\nDownloading logo to: ${filename}`);
        
        try {
          await downloadLogo(job.employer_logo, filename);
          console.log(`✅ Logo downloaded successfully!`);
          console.log(`\nOpen ${filename} to see the employer logo.`);
          logoFound = true;
          break;
        } catch (err) {
          console.error('Failed to download logo:', err.message);
        }
      }
    }
    
    if (!logoFound) {
      console.log('❌ No jobs with employer logos found in the response');
      
      // Show what fields are actually present
      if (jobs.length > 0) {
        console.log('\nFirst job object fields:');
        console.log(Object.keys(jobs[0]).sort().join(', '));
        
        console.log('\nFirst 3 jobs summary:');
        jobs.slice(0, 3).forEach((job, i) => {
          console.log(`${i + 1}. ${job.employer_name} - Logo field: ${job.hasOwnProperty('employer_logo') ? 'exists' : 'missing'}, Value: ${job.employer_logo || 'null'}`);
        });
      }
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\nAuthentication failed. The API key might be incorrect.');
    }
  }
}

testAndDownloadLogo();