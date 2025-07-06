/**
 * Test Resume Editor API
 */
require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:3001';
const API_KEY = process.env.API_KEY || 'test-api-key-2024';

const testResumeText = `John Doe
Senior Software Engineer
john.doe@email.com | (555) 123-4567 | San Francisco, CA | linkedin.com/in/johndoe | github.com/johndoe

PROFESSIONAL SUMMARY
Experienced software engineer with 8+ years developing scalable web applications and leading technical teams. Expertise in full-stack development, cloud architecture, and DevOps practices.

SKILLS
Languages: JavaScript, TypeScript, Python, Java, Go
Frameworks: React, Node.js, Express, Django, Spring Boot
Databases: PostgreSQL, MongoDB, Redis, Elasticsearch
Cloud & DevOps: AWS, Docker, Kubernetes, Jenkins, GitLab CI/CD

EXPERIENCE
Senior Software Engineer - Tech Corp
San Francisco, CA
Jan 2020 - Present
- Led development of microservices architecture serving 2M+ daily active users
- Implemented CI/CD pipelines reducing deployment time by 75%
- Mentored team of 5 junior engineers and conducted technical interviews
- Architected real-time data processing system handling 100K+ events per second

Software Engineer II - StartupXYZ
San Francisco, CA
Jun 2018 - Dec 2019
- Built responsive React applications improving user engagement by 60%
- Developed RESTful APIs using Node.js with 99.9% uptime
- Implemented comprehensive testing suite increasing code coverage to 85%

PROJECTS
Open Source Contributor - React Component Library | React, TypeScript, Jest
2022 - Present
- Maintained popular UI component library with 10K+ GitHub stars
- Implemented accessibility features following WCAG 2.1 guidelines
- Reviewed pull requests and mentored new contributors

EDUCATION
Bachelor of Science in Computer Science
University of California, Berkeley
2014 - 2018
GPA: 3.8/4.0`;

async function testResumeEditor() {
  console.log('Testing Resume Editor API...\n');
  
  try {
    // Test 1: Parse resume for editing
    console.log('1. Testing parse-for-edit endpoint...');
    const parseResponse = await axios.post(`${API_URL}/api/resume-editor/parse-for-edit`, {
      resumeText: testResumeText,
      jobId: 'test-job-123'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      }
    });
    
    const { sessionId, pdfUrl, schema, sections } = parseResponse.data.data;
    console.log('✅ Parse successful');
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   PDF URL: ${pdfUrl}`);
    console.log(`   Sections parsed: ${Object.keys(sections).join(', ')}`);
    
    // Test 2: Update a section
    console.log('\n2. Testing update-section endpoint...');
    const updatedPersonalInfo = {
      ...sections.personalInfo,
      title: 'Staff Software Engineer',
      website: 'https://johndoe.dev'
    };
    
    const updateResponse = await axios.post(`${API_URL}/api/resume-editor/update-section`, {
      sessionId,
      sectionId: 'personalInfo',
      data: updatedPersonalInfo
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      }
    });
    
    console.log('✅ Section updated successfully');
    console.log(`   New PDF URL: ${updateResponse.data.data.pdfUrl}`);
    
    // Test 3: Add a new skill
    console.log('\n3. Testing skills update...');
    const updatedSkills = [
      ...sections.skills,
      { category: 'Tools', skills: 'Jira, Confluence, Datadog, New Relic' }
    ];
    
    await axios.post(`${API_URL}/api/resume-editor/update-section`, {
      sessionId,
      sectionId: 'skills',
      data: updatedSkills
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      }
    });
    
    console.log('✅ Skills updated successfully');
    
    // Test 4: Finalize resume
    console.log('\n4. Testing finalize endpoint...');
    const finalizeResponse = await axios.post(`${API_URL}/api/resume-editor/finalize`, {
      sessionId,
      format: 'pdf'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      }
    });
    
    console.log('✅ Resume finalized');
    console.log(`   Download URL: ${finalizeResponse.data.data.downloadUrl}`);
    console.log(`   Filename: ${finalizeResponse.data.data.filename}`);
    console.log(`   Expires in: ${finalizeResponse.data.data.expiresIn} seconds`);
    
    // Test 5: Get schema for empty resume
    console.log('\n5. Testing schema endpoint...');
    const schemaResponse = await axios.get(`${API_URL}/api/resume-editor/schema`, {
      headers: {
        'x-api-key': API_KEY
      }
    });
    
    console.log('✅ Schema retrieved');
    console.log(`   Available sections: ${Object.keys(schemaResponse.data.data.schema).join(', ')}`);
    
    console.log('\n✅ All tests passed!');
    console.log('\nFrontend Integration Guide:');
    console.log('1. Call parse-for-edit to initialize session and get editable schema');
    console.log('2. Display PDF using iframe with pdfUrl');
    console.log('3. Render form fields based on schema structure');
    console.log('4. Call update-section whenever user modifies a field');
    console.log('5. PDF will auto-refresh with new URL after each update');
    console.log('6. Call finalize when user is done editing');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run tests
console.log('Make sure the backend server is running on http://localhost:3001\n');
testResumeEditor();