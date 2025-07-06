/**
 * Test script to check HTML generation
 */
const pdfGenerator = require('./src/services/pdfGenerator');

// Test resume data matching Jake's format
const testResumeData = {
  sections: {
    personalInfo: {
      name: 'Jake Ryan',
      phone: '123-456-7890',
      email: 'jake@su.edu',
      linkedin: 'https://linkedin.com/in/jake',
      github: 'https://github.com/jake'
    },
    education: {
      title: 'Education',
      type: 'education',
      items: [
        {
          institution: 'Southwestern University',
          location: 'Georgetown, TX',
          degree: 'Bachelor of Arts in Computer Science, Minor in Business',
          date: 'Aug. 2018 -- May 2021'
        },
        {
          institution: 'Blinn College', 
          location: 'Bryan, TX',
          degree: "Associate's in Liberal Arts",
          date: 'Aug. 2014 -- May 2018'
        }
      ]
    },
    experience: {
      title: 'Experience',
      type: 'experience',
      items: [
        {
          title: 'Undergraduate Research Assistant',
          dateRange: 'June 2020 -- Present',
          organization: 'Texas A&M University',
          location: 'College Station, TX',
          description: [
            'Developed a REST API using FastAPI and PostgreSQL to store data from learning management systems',
            'Developed a full-stack web application using Flask, React, PostgreSQL and Docker to analyze GitHub data',
            'Explored ways to visualize GitHub collaboration in a classroom setting'
          ]
        }
      ]
    },
    projects: {
      title: 'Projects',
      type: 'experience',
      items: [
        {
          title: 'Gitlytics',
          organization: 'Python, Flask, React, PostgreSQL, Docker',
          dateRange: 'June 2020 -- Present',
          description: [
            'Developed a full-stack web application using with Flask serving a REST API with React as the frontend',
            'Implemented GitHub OAuth to get data from user\'s repositories',
            'Visualized GitHub data to show collaboration',
            'Used Celery and Redis for asynchronous tasks'
          ]
        }
      ]
    },
    skills: {
      title: 'Technical Skills',
      type: 'skills',
      categories: [
        { name: 'Languages', skills: 'Java, Python, C/C++, SQL (Postgres), JavaScript, HTML/CSS, R' },
        { name: 'Frameworks', skills: 'React, Node.js, Flask, JUnit, WordPress, Material-UI, FastAPI' },
        { name: 'Developer Tools', skills: 'Git, Docker, TravisCI, Google Cloud Platform, VS Code, Visual Studio, PyCharm, IntelliJ, Eclipse' },
        { name: 'Libraries', skills: 'pandas, NumPy, Matplotlib' }
      ]
    }
  }
};

// Generate HTML
const html = pdfGenerator.generateHTML(testResumeData);

// Save to file
const fs = require('fs');
fs.writeFileSync('test-resume.html', html);

console.log('HTML saved to test-resume.html');
console.log('Open this file in a browser to see the generated layout');