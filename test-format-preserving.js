/**
 * Test script for format-preserving resume editor
 */

const axios = require('axios');
const fs = require('fs').promises;

// Test resume text that should preserve exact format
const testResume = `Jake Ryan
jake@su.edu | 123-456-7890 | linkedin.com/in/jake | github.com/jake

EDUCATION
State University, San Francisco, CA
Bachelor of Science in Computer Science, GPA: 3.8/4.0                             Expected May 2024
Relevant Coursework: Data Structures, Software Engineering, Operating Systems

EXPERIENCE
Tech Solutions Inc., San Francisco, CA                                            June 2023 - Present
Software Engineering Intern
• Developed and maintained RESTful APIs using Node.js and Express, serving 10,000+ daily users
• Implemented caching strategies that reduced API response time by 40%
• Collaborated with cross-functional teams to deliver 3 major features on schedule

StartupXYZ, Remote                                                                Jan 2023 - May 2023
Frontend Developer Intern  
• Built responsive React components following design specifications
• Optimized web application performance, achieving 95+ Lighthouse scores
• Participated in daily standups and code reviews

PROJECTS
E-commerce Platform | React, Node.js, MongoDB                                    Sept 2023 - Dec 2023
• Developed full-stack e-commerce application with user authentication and payment processing
• Implemented real-time inventory tracking and order management system
• Deployed on AWS with CI/CD pipeline using GitHub Actions

SKILLS
Languages: JavaScript, Python, Java, SQL, HTML/CSS
Frameworks: React, Node.js, Express, Django, Spring Boot
Tools: Git, Docker, AWS, MongoDB, PostgreSQL, Redis`;

const jobDescription = `
Software Engineer - Backend
WP Engine

We are looking for a talented Backend Software Engineer to join our team. 

Requirements:
- 2+ years of experience with Node.js and Express
- Strong understanding of RESTful API design
- Experience with cloud platforms (AWS preferred)
- Knowledge of caching strategies and performance optimization
- Experience with MongoDB or other NoSQL databases
- Strong collaboration and communication skills

Nice to have:
- Experience with microservices architecture
- Knowledge of Docker and containerization
- CI/CD pipeline experience
`;

async function testFormatPreserving() {
  const API_URL = process.env.API_URL || 'http://localhost:3001';
  const API_KEY = process.env.JOBOTIC_API_KEY || 'test-api-key-123';
  
  try {
    console.log('Testing Format-Preserving Resume Editor...\n');
    
    // Test 1: Process resume without job description
    console.log('Test 1: Processing resume without job description...');
    const response1 = await axios.post(
      `${API_URL}/api/format-preserving/process`,
      {
        resumeText: testResume,
        userId: 'test-user-123'
      },
      {
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Process response:', {
      sessionId: response1.data.data.sessionId,
      pdfUrl: response1.data.data.pdfUrl,
      hasOriginal: !!response1.data.data.originalText,
      hasEnhanced: !!response1.data.data.enhancedText,
      editableCount: response1.data.data.editableContent?.editableElements?.length || 0
    });
    
    // Test 2: Process with job description
    console.log('\nTest 2: Processing resume with job description...');
    const response2 = await axios.post(
      `${API_URL}/api/format-preserving/process`,
      {
        resumeText: testResume,
        jobDescription: jobDescription,
        userId: 'test-user-456'
      },
      {
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Enhanced process response:', {
      sessionId: response2.data.data.sessionId,
      pdfUrl: response2.data.data.pdfUrl,
      contentChanged: response2.data.data.originalText !== response2.data.data.enhancedText
    });
    
    // Compare original vs enhanced
    if (response2.data.data.originalText && response2.data.data.enhancedText) {
      console.log('\n=== FORMAT COMPARISON ===');
      const originalLines = response2.data.data.originalText.split('\n').length;
      const enhancedLines = response2.data.data.enhancedText.split('\n').length;
      console.log(`Original lines: ${originalLines}`);
      console.log(`Enhanced lines: ${enhancedLines}`);
      console.log(`Lines preserved: ${originalLines === enhancedLines ? 'YES ✅' : 'NO ❌'}`);
      
      // Check structure preservation
      const originalSections = response2.data.data.originalText.match(/^[A-Z]+$/gm) || [];
      const enhancedSections = response2.data.data.enhancedText.match(/^[A-Z]+$/gm) || [];
      console.log(`Original sections: ${originalSections.join(', ')}`);
      console.log(`Enhanced sections: ${enhancedSections.join(', ')}`);
      console.log(`Sections preserved: ${originalSections.join(',') === enhancedSections.join(',') ? 'YES ✅' : 'NO ❌'}`);
    }
    
    // Test 3: Update specific content
    if (response2.data.data.sessionId && response2.data.data.editableContent?.editableElements?.length > 0) {
      console.log('\nTest 3: Updating specific content...');
      const firstBullet = response2.data.data.editableContent.editableElements.find(el => el.type === 'bullet');
      
      if (firstBullet) {
        const updateResponse = await axios.post(
          `${API_URL}/api/format-preserving/update`,
          {
            sessionId: response2.data.data.sessionId,
            updates: [{
              startPos: firstBullet.startPos,
              endPos: firstBullet.endPos,
              newContent: 'Enhanced bullet point with better metrics and keywords from job description'
            }]
          },
          {
            headers: {
              'X-API-Key': API_KEY,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log('✅ Update response:', {
          newPdfUrl: updateResponse.data.data.pdfUrl,
          textUpdated: !!updateResponse.data.data.updatedText
        });
      }
    }
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    if (error.response?.data?.error) {
      console.error('Error details:', error.response.data.error);
    }
  }
}

// Run the test
testFormatPreserving();