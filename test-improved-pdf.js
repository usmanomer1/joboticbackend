/**
 * Test improved PDF/DOCX generation
 */
const documentGenerationService = require('./src/services/documentGeneration.service');
const fs = require('fs').promises;

async function testGeneration() {
  console.log('Testing improved document generation...\n');
  
  // Test with AI-generated resume content
  const testData = {
    resumeText: `Sarah Johnson
Software Development Engineer
sarah.johnson@email.com | (555) 123-4567 | Seattle, WA | linkedin.com/in/sarahjohnson

PROFESSIONAL SUMMARY
Accomplished software engineer with 6+ years of experience developing scalable web applications and cloud-native solutions. Expertise in full-stack development, microservices architecture, and DevOps practices. Proven track record of leading cross-functional teams and delivering high-impact projects.

PROFESSIONAL EXPERIENCE

Senior Software Engineer - Tech Solutions Inc. (2021 - Present)
Seattle, WA
Led development of cloud-native microservices platform serving 2M+ daily active users
Implemented automated CI/CD pipelines reducing deployment time by 75%
Mentored team of 5 junior engineers and conducted technical interviews
Architected real-time data processing system handling 100K+ events per second
Reduced infrastructure costs by 40% through AWS optimization and auto-scaling

Software Engineer II - Digital Innovations Corp (2019 - 2021)
San Francisco, CA
Built responsive React applications improving user engagement by 60%
Developed RESTful APIs using Node.js and Express with 99.9% uptime
Implemented comprehensive testing suite increasing code coverage from 45% to 85%
Collaborated with product managers to define technical requirements

Junior Software Developer - StartupXYZ (2018 - 2019)
San Francisco, CA
Created data visualization dashboards using D3.js and React
Optimized database queries reducing page load times by 50%
Participated in agile development sprints and daily standups

EDUCATION

Bachelor of Science in Computer Science
University of Washington, Seattle (2014 - 2018)
GPA: 3.8/4.0, Dean's List, Computer Science Honor Society

TECHNICAL SKILLS

Languages: JavaScript, TypeScript, Python, Java, Go, SQL
Frontend: React, Redux, Vue.js, Angular, HTML5, CSS3, Sass, Webpack
Backend: Node.js, Express, Django, Spring Boot, GraphQL, REST APIs
Databases: PostgreSQL, MongoDB, Redis, Elasticsearch, DynamoDB
Cloud & DevOps: AWS (EC2, S3, Lambda, RDS), Docker, Kubernetes, Jenkins, GitLab CI/CD
Tools: Git, JIRA, Confluence, Datadog, New Relic, Postman

PROJECTS

Open Source Contributor - React Component Library
Maintained popular UI component library with 10K+ GitHub stars
Implemented accessibility features following WCAG 2.1 guidelines
Reviewed pull requests and mentored new contributors

CERTIFICATIONS
AWS Certified Solutions Architect - Associate (2022)
Certified Kubernetes Administrator (CKA) (2023)`,
    
    score: 9.2,
    jobTitle: "Senior Software Engineer",
    company: "Tech Company",
    improvements: ["Enhanced cloud experience", "Added quantifiable metrics", "Improved technical skills section"],
    changes: {}
  };
  
  try {
    // Test PDF
    console.log('Generating PDF...');
    const pdfResult = await documentGenerationService.generateResume(testData, 'pdf');
    const pdfBuffer = await documentGenerationService.readFile(pdfResult.fileId);
    await fs.writeFile('./test-improved.pdf', pdfBuffer);
    console.log('✅ PDF saved to: ./test-improved.pdf');
    
    // Test DOCX
    console.log('\nGenerating DOCX...');
    const docxResult = await documentGenerationService.generateResume(testData, 'docx');
    const docxBuffer = await documentGenerationService.readFile(docxResult.fileId);
    await fs.writeFile('./test-improved.docx', docxBuffer);
    console.log('✅ DOCX saved to: ./test-improved.docx');
    
    console.log('\nTest complete! Check the generated files for formatting.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

testGeneration();