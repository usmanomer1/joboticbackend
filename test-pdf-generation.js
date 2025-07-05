/**
 * Test PDF generation locally to debug formatting
 */
const documentGenerationService = require('./src/services/documentGeneration.service');
const fs = require('fs').promises;

async function testPdfGeneration() {
  console.log('Testing PDF generation...\n');
  
  const testData = {
    resumeText: `John Doe
Software Engineer
john.doe@email.com | (555) 123-4567 | San Francisco, CA

PROFESSIONAL SUMMARY
Experienced software engineer with 5+ years developing scalable web applications using JavaScript, Python, and cloud technologies.

EXPERIENCE
Senior Software Engineer - Tech Corp (2020-Present)
San Francisco, CA
- Led development of microservices architecture serving 1M+ users
- Implemented CI/CD pipelines reducing deployment time by 60%
- Mentored junior developers and conducted code reviews
- Built RESTful APIs using Node.js and Express
- Improved application performance by 40% through optimization

Software Engineer - StartupXYZ (2018-2020)
San Francisco, CA
- Developed React components for customer-facing dashboard
- Created automated testing suite increasing code coverage to 85%
- Collaborated with product team on feature requirements

SKILLS
Languages: JavaScript, Python, Java, SQL
Frameworks: React, Node.js, Express, Django
Tools: Docker, Kubernetes, Jenkins, Git, AWS
Databases: PostgreSQL, MongoDB, Redis

EDUCATION
Bachelor of Science in Computer Science
University of California, Berkeley (2018)`,
    
    score: 8.5,
    jobTitle: "Senior Software Engineer",
    company: "TechCorp",
    improvements: ["Added cloud experience", "Enhanced bullet points", "Included metrics"],
    changes: {
      summary: {
        before: "Software engineer with experience",
        after: "Experienced software engineer with 5+ years developing scalable web applications"
      }
    }
  };
  
  try {
    console.log('Generating PDF...');
    const result = await documentGenerationService.generateResume(testData, 'pdf');
    
    console.log('\nResult:', result);
    
    // Save locally for inspection
    const filePath = `./test-output-${Date.now()}.pdf`;
    const fileBuffer = await documentGenerationService.readFile(result.fileId);
    await fs.writeFile(filePath, fileBuffer);
    
    console.log(`\n✅ PDF saved to: ${filePath}`);
    console.log('Open this file to check the formatting');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testPdfGeneration();