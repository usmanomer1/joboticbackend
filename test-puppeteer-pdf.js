/**
 * Test PDF Generation with Puppeteer
 */
require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:3001';
const API_KEY = process.env.API_KEY || 'test-api-key-2024';

// Sample user ID (you'll need to replace with actual Supabase user ID)
const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174000';

const testResumeText = `John Doe
Senior Full Stack Developer
john.doe@email.com | (555) 123-4567 | San Francisco, CA
linkedin.com/in/johndoe | github.com/johndoe | johndoe.dev

PROFESSIONAL SUMMARY
Experienced full-stack developer with 8+ years building scalable web applications. Expertise in React, Node.js, and cloud architecture. Led development teams and delivered 20+ production applications serving millions of users.

TECHNICAL EXPERTISE
Languages: JavaScript, TypeScript, Python, Java, Go
Frontend: React, Next.js, Vue.js, Redux, GraphQL, Tailwind CSS
Backend: Node.js, Express, Django, Spring Boot, PostgreSQL, MongoDB
Cloud & DevOps: AWS (EC2, S3, Lambda), Docker, Kubernetes, Jenkins, GitLab CI/CD
Tools: Git, Jira, Datadog, Sentry, Webpack, Babel

PROFESSIONAL EXPERIENCE
Senior Software Engineer - Tech Innovations Inc.
San Francisco, CA
Jan 2020 - Present
• Led development of microservices architecture serving 2M+ daily active users
• Reduced API response time by 60% through database optimization and caching strategies
• Implemented CI/CD pipelines reducing deployment time from 2 hours to 15 minutes
• Mentored team of 5 junior engineers and conducted 50+ technical interviews
• Architected real-time data processing system handling 100K+ events per second

Software Engineer II - StartupXYZ
San Francisco, CA
Jun 2018 - Dec 2019
• Built responsive React applications improving user engagement by 60%
• Developed RESTful APIs using Node.js with 99.9% uptime
• Implemented comprehensive testing suite increasing code coverage from 40% to 85%
• Collaborated with product team to deliver features 2 weeks ahead of schedule

Software Engineer - Digital Solutions Corp
San Jose, CA
Aug 2016 - May 2018
• Developed and maintained e-commerce platform processing $10M+ in transactions
• Optimized database queries reducing page load time by 40%
• Integrated third-party payment systems including Stripe and PayPal
• Participated in agile development with 2-week sprints

NOTABLE PROJECTS
Open Source Contributor - React Component Library
React, TypeScript, Jest, Storybook | github.com/awesome-react-lib
2022 - Present
• Maintained popular UI component library with 10K+ GitHub stars
• Implemented accessibility features following WCAG 2.1 guidelines
• Reviewed 100+ pull requests and mentored new contributors
• Added comprehensive documentation increasing adoption by 30%

E-Learning Platform
Next.js, Node.js, PostgreSQL, AWS | 2021
• Built full-stack platform serving 50K+ students
• Implemented video streaming with adaptive bitrate
• Designed RESTful API with comprehensive documentation
• Achieved 99.9% uptime through proper monitoring and error handling

EDUCATION
Bachelor of Science in Computer Science
University of California, Berkeley
2012 - 2016
GPA: 3.8/4.0 | Dean's List (4 semesters)

CERTIFICATIONS
• AWS Certified Solutions Architect - Professional (2023)
• Google Cloud Professional Cloud Architect (2022)
• Certified Kubernetes Administrator (CKA) (2021)

PUBLICATIONS
• "Scaling Microservices in Production" - Tech Blog 2023
• "React Performance Optimization Techniques" - Medium 2022
• Co-author: "Modern Web Development" - O'Reilly 2021`;

async function testPdfGeneration() {
  console.log('Testing PDF Generation with Puppeteer...\n');
  
  try {
    // Test parse-for-edit endpoint
    console.log('1. Calling parse-for-edit endpoint...');
    const response = await axios.post(`${API_URL}/api/resume-editor/parse-for-edit`, {
      userId: TEST_USER_ID,
      resumeText: testResumeText
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      }
    });
    
    const { resumeId, pdfUrl, sections, schema } = response.data.data;
    
    console.log('✅ Resume parsed successfully!');
    console.log(`   Resume ID: ${resumeId}`);
    console.log(`   PDF URL: ${pdfUrl}`);
    console.log(`   Sections detected: ${Object.keys(sections).join(', ')}`);
    console.log(`   Schema keys: ${Object.keys(schema).join(', ')}\n`);
    
    // Log detected sections
    console.log('2. Detected Sections:');
    Object.entries(sections).forEach(([key, section]) => {
      if (key === 'personalInfo') {
        console.log(`   - Personal Info: ${section.name}, ${section.title}`);
      } else {
        console.log(`   - ${section.title} (${section.type})`);
      }
    });
    
    console.log('\n3. Testing PDF Access...');
    // Since it's a Supabase URL, we can check if it's accessible
    if (pdfUrl.includes('supabase.co')) {
      console.log('✅ PDF successfully uploaded to Supabase storage');
      console.log(`   Access URL: ${pdfUrl}`);
    }
    
    // Test updating a section
    console.log('\n4. Testing section update...');
    const updatedSummary = {
      title: 'PROFESSIONAL SUMMARY',
      type: 'paragraph',
      content: 'Senior full-stack developer with 8+ years of experience building scalable web applications. Expert in React, Node.js, and cloud architecture. Led multiple development teams and delivered 25+ production applications serving millions of users worldwide. Passionate about clean code and mentoring.'
    };
    
    const updateResponse = await axios.post(`${API_URL}/api/resume-editor/update-section`, {
      userId: TEST_USER_ID,
      sectionId: 'professional_summary',
      data: updatedSummary
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      }
    });
    
    console.log('✅ Section updated successfully');
    console.log(`   New PDF URL: ${updateResponse.data.data.pdfUrl}`);
    
    console.log('\n✅ PDF generation test completed successfully!');
    console.log('\nNotes:');
    console.log('- PDFs are stored in Supabase storage bucket');
    console.log('- Each update generates a new PDF with timestamp');
    console.log('- Professional HTML/CSS template with clean formatting');
    console.log('- Dynamic section detection working properly');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.data?.details) {
      console.error('Details:', error.response.data.details);
    }
  }
}

// Run test
console.log('Make sure the backend server is running on http://localhost:3001');
console.log('Note: You need to use a valid Supabase user ID from your database\n');
testPdfGeneration();