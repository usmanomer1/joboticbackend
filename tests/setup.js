/**
 * Jest test setup and configuration
 */

// Set test environment
process.env.NODE_ENV = 'test';

// Load test environment variables
require('dotenv').config({ path: '.env.test' });

// Set test timeout
jest.setTimeout(30000); // 30 seconds for AI tests

// Mock external services by default
jest.mock('../src/utils/geminiClient', () => ({
  validateConnection: jest.fn().mockResolvedValue(true),
  generateContent: jest.fn().mockResolvedValue('Mocked AI response'),
  generateJSON: jest.fn().mockResolvedValue({
    matches: [{
      jobId: 'test-job-1',
      score: 85,
      matchLabel: 'STRONG MATCH',
      matchReasons: ['Test match reason'],
      missingSkills: ['Test skill'],
      keyStrengths: ['Test strength']
    }]
  }),
  getModelInfo: jest.fn().mockReturnValue({
    provider: 'Google',
    model: 'gemini-pro',
    configured: true
  })
}));

// Global test utilities
global.testUtils = {
  /**
   * Create a test app instance
   */
  createApp: () => {
    // Clear module cache to get fresh instance
    jest.resetModules();
    return require('../server');
  },

  /**
   * Generate sample resume text
   */
  generateResume: () => {
    return `
John Doe
Software Engineer
john.doe@email.com | (555) 123-4567

SUMMARY
Experienced software engineer with 5+ years developing scalable web applications.
Proficient in JavaScript, Python, and cloud technologies.

EXPERIENCE
Senior Software Engineer - Tech Corp (2020-Present)
- Led development of microservices architecture
- Improved application performance by 40%
- Mentored junior developers

Software Engineer - StartupXYZ (2018-2020)
- Built RESTful APIs using Node.js and Express
- Implemented CI/CD pipelines
- Worked with MongoDB and PostgreSQL

EDUCATION
BS Computer Science - University of Technology (2018)

SKILLS
Languages: JavaScript, Python, Java
Frameworks: React, Node.js, Express, Django
Databases: MongoDB, PostgreSQL, Redis
Cloud: AWS, Docker, Kubernetes
`;
  },

  /**
   * Generate sample job data
   */
  generateJobData: () => ({
    job_id: 'test-job-123',
    job_title: 'Senior Software Engineer',
    employer_name: 'Test Company',
    job_description: 'We are looking for a Senior Software Engineer with experience in Node.js, React, and AWS...',
    job_required_skills: ['JavaScript', 'Node.js', 'React', 'AWS'],
    job_required_experience: {
      required_experience_in_months: 60,
      experience_mentioned: true,
      experience_preferred: false
    },
    job_is_remote: true,
    job_city: 'San Francisco',
    job_state: 'CA',
    job_country: 'US'
  }),

  /**
   * Wait for async operations
   */
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};

// Clean up after tests
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 500));
});