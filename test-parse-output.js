/**
 * Test the parsing output to see what structure is being created
 */

// Mock the Supabase client to avoid initialization errors
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-key';

const resumeEditorService = require('./src/services/resumeEditorSupabase.service');

// Test resume text
const testResumeText = `Jake Ryan
123-456-7890 | jake@su.edu | linkedin.com/in/jake | github.com/jake

EDUCATION
Southwestern University
Bachelor of Arts in Computer Science, Minor in Business
Aug. 2018 -- May 2021
Georgetown, TX

Blinn College
Associate's in Liberal Arts
Aug. 2014 -- May 2018
Bryan, TX

EXPERIENCE
Undergraduate Research Assistant
June 2020 -- Present
Texas A&M University
College Station, TX
• Developed a REST API using FastAPI and PostgreSQL to store data from learning management systems
• Developed a full-stack web application using Flask, React, PostgreSQL and Docker to analyze GitHub data
• Explored ways to visualize GitHub collaboration in a classroom setting

TECHNICAL SKILLS
Languages: Java, Python, C/C++, SQL (Postgres), JavaScript, HTML/CSS, R
Frameworks: React, Node.js, Flask, JUnit, WordPress, Material-UI, FastAPI
Developer Tools: Git, Docker, TravisCI, Google Cloud Platform, VS Code, Visual Studio, PyCharm, IntelliJ, Eclipse
Libraries: pandas, NumPy, Matplotlib`;

// Parse the resume
const parsedData = resumeEditorService.intelligentParse(testResumeText);

// Output the parsed structure
console.log('Parsed Data Structure:');
console.log(JSON.stringify(parsedData, null, 2));

// Also generate the edit schema
const editSchema = resumeEditorService.generateEditSchema(parsedData.sections);
console.log('\n\nEdit Schema:');
console.log(JSON.stringify(editSchema, null, 2));