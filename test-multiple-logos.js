/**
 * Download multiple employer logos to verify they're working
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

async function downloadMultipleLogos() {
  console.log('Fetching jobs and downloading multiple employer logos...\n');
  
  try {
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
    
    const jobs = response.data.data.jobs;
    let downloadCount = 0;
    const maxDownloads = 5;
    
    console.log(`Found ${jobs.length} jobs. Downloading logos for companies that have them...\n`);
    
    for (const job of jobs) {
      if (job.employer_logo && downloadCount < maxDownloads) {
        const filename = `logo-${downloadCount + 1}-${job.employer_name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
        
        console.log(`${downloadCount + 1}. ${job.employer_name}`);
        console.log(`   Job: ${job.job_title}`);
        console.log(`   Logo URL: ${job.employer_logo}`);
        
        try {
          await downloadLogo(job.employer_logo, filename);
          console.log(`   ✅ Downloaded as: ${filename}\n`);
          downloadCount++;
        } catch (err) {
          console.log(`   ❌ Failed to download: ${err.message}\n`);
        }
      }
    }
    
    // Summary
    const jobsWithLogos = jobs.filter(job => job.employer_logo).length;
    console.log(`\nSummary:`);
    console.log(`- Total jobs found: ${jobs.length}`);
    console.log(`- Jobs with logos: ${jobsWithLogos} (${Math.round(jobsWithLogos / jobs.length * 100)}%)`);
    console.log(`- Logos downloaded: ${downloadCount}`);
    
    if (downloadCount > 0) {
      console.log(`\nCheck the downloaded logo files in the project root!`);
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

downloadMultipleLogos();