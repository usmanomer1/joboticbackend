/**
 * Test the resume analysis endpoint locally
 */
const axios = require('axios');

const testResumeAnalysis = async () => {
  console.log('Testing Resume Analysis Endpoint...\n');
  
  const testData = {
    resumeText: `John Doe
Software Engineer
john.doe@email.com | (555) 123-4567 | San Francisco, CA

PROFESSIONAL SUMMARY
Experienced software engineer with 5+ years developing scalable web applications using JavaScript, Python, and cloud technologies. Proven track record of delivering high-quality solutions in agile environments.

EXPERIENCE
Senior Software Engineer - Tech Corp (2020-Present)
- Led development of microservices architecture serving 1M+ users
- Implemented CI/CD pipelines reducing deployment time by 60%
- Mentored junior developers and conducted code reviews

Software Engineer - StartupXYZ (2018-2020)
- Built RESTful APIs using Node.js and Express
- Developed React components for customer-facing dashboard
- Improved application performance by 40% through optimization

SKILLS
Languages: JavaScript, Python, Java, SQL
Frameworks: React, Node.js, Express, Django
Tools: Docker, Kubernetes, Jenkins, Git, AWS

EDUCATION
Bachelor of Science in Computer Science
University of California, Berkeley (2018)`,
    
    jobId: "test-job-123",
    jobDescription: `We are looking for a Senior Software Engineer to join our team.

Requirements:
- 5+ years of software development experience
- Strong expertise in JavaScript, React, and Node.js
- Experience with cloud platforms (AWS preferred)
- Knowledge of microservices architecture
- Experience with Docker and Kubernetes
- Strong problem-solving skills
- Excellent communication skills

Nice to have:
- Python experience
- Machine learning knowledge
- GraphQL experience`,
    
    jobTitle: "Senior Software Engineer",
    employerName: "Tech Company Inc"
  };
  
  try {
    console.log('Sending request to: http://localhost:3001/api/resume/analyze');
    console.log('Resume length:', testData.resumeText.length);
    console.log('Job description length:', testData.jobDescription.length);
    
    const response = await axios.post('http://localhost:3001/api/resume/analyze', testData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });
    
    console.log('\n✅ SUCCESS! Analysis completed\n');
    console.log('Response status:', response.status);
    console.log('\nAnalysis Results:');
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.data?.analysis) {
      const analysis = response.data.data.analysis;
      console.log('\n📊 Score Breakdown:');
      console.log(`- Current Score: ${analysis.currentScore}/10`);
      console.log(`- Skills Score: ${analysis.scoreBreakdown?.skills?.score}/${analysis.scoreBreakdown?.skills?.max}`);
      console.log(`- Experience Score: ${analysis.scoreBreakdown?.experience?.score}/${analysis.scoreBreakdown?.experience?.max}`);
      console.log(`- Keywords Score: ${analysis.scoreBreakdown?.keywords?.score}/${analysis.scoreBreakdown?.keywords?.max}`);
      
      if (analysis.analysisNote) {
        console.log(`\n⚠️  Note: ${analysis.analysisNote}`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received. Is the server running on port 3001?');
    } else {
      console.error('Error details:', error);
    }
  }
};

// Wait 2 seconds for server to be ready, then test
setTimeout(() => {
  testResumeAnalysis();
}, 2000);