/**
 * Standalone HTML generator for testing
 */

function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function generateHTML(resumeData) {
  const { sections } = resumeData;
  
  // Extract the methods from pdfGenerator
  const renderHeader = (personalInfo) => {
    if (!personalInfo) return '';
    
    const contactParts = [];
    
    if (personalInfo.phone) {
      contactParts.push(personalInfo.phone);
    }
    
    if (personalInfo.email) {
      contactParts.push(`<a href="mailto:${personalInfo.email}">${personalInfo.email}</a>`);
    }
    
    if (personalInfo.linkedin) {
      const linkedinDisplay = personalInfo.linkedin.replace(/^https?:\/\//, '').replace(/\/$/, '');
      contactParts.push(`<a href="${personalInfo.linkedin}">${linkedinDisplay}</a>`);
    }
    
    if (personalInfo.github) {
      const githubDisplay = personalInfo.github.replace(/^https?:\/\//, '').replace(/\/$/, '');
      contactParts.push(`<a href="${personalInfo.github}">${githubDisplay}</a>`);
    }
    
    return `
      <div class="header">
        ${personalInfo.name ? `<div class="name">${personalInfo.name}</div>` : ''}
        ${contactParts.length ? `<div class="contact-line">${contactParts.join('<span class="pipe">|</span>')}</div>` : ''}
      </div>
    `;
  };

  const renderExperienceItem = (item) => {
    let html = '<div class="experience-item">';
    
    // First row: Title and Date
    html += '<div class="item-row">';
    html += `<div class="item-left"><span class="item-title">${escapeHtml(item.title || '')}</span></div>`;
    html += `<div class="item-right"><span class="item-date">${escapeHtml(item.dateRange || '')}</span></div>`;
    html += '</div>';
    
    // Second row: Organization/Location
    if (item.organization || item.location) {
      html += '<div class="item-row">';
      let orgLocation = [];
      if (item.organization) orgLocation.push(escapeHtml(item.organization));
      if (item.location) orgLocation.push(escapeHtml(item.location));
      html += `<div class="item-left"><span class="item-subtitle">${orgLocation.join(', ')}</span></div>`;
      html += '<div class="item-right"></div>';
      html += '</div>';
    }
    
    // Bullet points
    if (item.description && item.description.length > 0) {
      html += '<div class="bullet-list">';
      item.description.forEach(desc => {
        html += `<div class="bullet-item">${escapeHtml(desc)}</div>`;
      });
      html += '</div>';
    }
    
    html += '</div>';
    return html;
  };

  const renderEducationItem = (item) => {
    let html = '<div class="education-item">';
    
    // First row: Institution and Location
    html += '<div class="item-row">';
    html += `<div class="item-left"><span class="item-title">${escapeHtml(item.institution || '')}</span></div>`;
    html += `<div class="item-right"><span class="item-date">${escapeHtml(item.location || '')}</span></div>`;
    html += '</div>';
    
    // Second row: Degree and Date
    html += '<div class="item-row">';
    html += `<div class="item-left"><span class="item-subtitle">${escapeHtml(item.degree || '')}</span></div>`;
    html += `<div class="item-right"><span class="item-date">${escapeHtml(item.date || '')}</span></div>`;
    html += '</div>';
    
    html += '</div>';
    return html;
  };

  const renderProjectItem = (item) => {
    let html = '<div class="project-item">';
    
    // Project header with title, tech stack, and date
    html += '<div class="project-header">';
    
    let projectTitle = item.title || '';
    let techStack = '';
    
    if (item.organization && item.organization.includes('|')) {
      const parts = item.organization.split('|');
      techStack = parts[0].trim();
    } else if (projectTitle.includes('|')) {
      const parts = projectTitle.split('|');
      projectTitle = parts[0].trim();
      techStack = parts[1].trim();
    } else if (item.organization) {
      techStack = item.organization;
    }
    
    html += '<div class="project-title">';
    html += `<strong>${escapeHtml(projectTitle)}</strong>`;
    if (techStack) {
      html += ` <span class="project-tech">| ${escapeHtml(techStack)}</span>`;
    }
    html += '</div>';
    
    html += `<div class="project-date">${escapeHtml(item.dateRange || '')}</div>`;
    html += '</div>';
    
    // Bullet points
    if (item.description && item.description.length > 0) {
      html += '<div class="bullet-list">';
      item.description.forEach(desc => {
        html += `<div class="bullet-item">${escapeHtml(desc)}</div>`;
      });
      html += '</div>';
    }
    
    html += '</div>';
    return html;
  };

  const renderSections = (sections) => {
    let html = '';
    
    Object.entries(sections).forEach(([key, section]) => {
      if (key === 'personalInfo') return;
      
      html += `<div class="section">`;
      html += `<div class="section-header">${section.title}</div>`;
      
      switch (section.type) {
        case 'experience':
          if (section.title && section.title.toLowerCase().includes('project')) {
            section.items.forEach(item => {
              html += renderProjectItem(item);
            });
          } else {
            section.items.forEach(item => {
              html += renderExperienceItem(item);
            });
          }
          break;
          
        case 'education':
          section.items.forEach(item => {
            html += renderEducationItem(item);
          });
          break;
          
        case 'skills':
          html += '<div class="skills-container">';
          section.categories.forEach(category => {
            html += `<div class="skill-category"><span class="skill-label">${escapeHtml(category.name)}:</span> <span class="skill-items">${escapeHtml(category.skills)}</span></div>`;
          });
          html += '</div>';
          break;
      }
      
      html += '</div>';
    });
    
    return html;
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    /* Use Computer Modern or similar serif font to match LaTeX */
    @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700&family=Source+Sans+Pro:wght@400;600;700&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Computer Modern', 'EB Garamond', 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.3;
      color: #000;
      background: white;
    }
    
    .container {
      max-width: 8.5in;
      margin: 0 auto;
      padding: 0.5in;
    }
    
    /* Header Styles - Centered like Jake's */
    .header {
      text-align: center;
      margin-bottom: 0.3in;
    }
    
    .name {
      font-size: 20pt;
      font-weight: 700;
      color: #000;
      text-transform: uppercase;
      letter-spacing: 3px;
      margin-bottom: 5px;
    }
    
    .contact-line {
      font-size: 10pt;
      color: #000;
      margin-top: 3px;
    }
    
    .contact-line a {
      color: #000;
      text-decoration: underline;
    }
    
    .pipe {
      margin: 0 0.5em;
    }
    
    /* Section Styles - ALL CAPS with underline */
    .section {
      margin-bottom: 0.15in;
      margin-top: 0.15in;
    }
    
    .section-header {
      font-size: 12pt;
      font-weight: 400;
      color: #000;
      margin-bottom: 4px;
      padding-bottom: 1px;
      border-bottom: 0.5pt solid #000;
      font-variant: small-caps;
      letter-spacing: 1px;
    }
    
    /* Experience/Education Item Styles - Two column layout */
    .item-row {
      display: table;
      width: 100%;
      margin-bottom: 2pt;
    }
    
    .item-left {
      display: table-cell;
      vertical-align: top;
      width: 75%;
    }
    
    .item-right {
      display: table-cell;
      vertical-align: top;
      width: 25%;
      text-align: right;
      font-size: 10pt;
    }
    
    .item-title {
      font-weight: 700;
      font-size: 11pt;
      color: #000;
    }
    
    .item-subtitle {
      font-size: 10pt;
      font-style: italic;
      color: #000;
    }
    
    .item-date {
      font-size: 10pt;
      font-style: italic;
      color: #000;
    }
    
    /* Bullet Points - Smaller and tighter */
    .bullet-list {
      margin-left: 0.2in;
      margin-top: 2pt;
      margin-bottom: 8pt;
    }
    
    .bullet-item {
      margin-bottom: 2pt;
      color: #000;
      font-size: 10pt;
      position: relative;
      padding-left: 0.15in;
      text-align: left;
    }
    
    .bullet-item:before {
      content: "•";
      position: absolute;
      left: 0;
      color: #000;
    }
    
    /* Projects Section - Special formatting */
    .project-item {
      margin-bottom: 8pt;
    }
    
    .project-header {
      display: table;
      width: 100%;
      margin-bottom: 2pt;
    }
    
    .project-title {
      display: table-cell;
      font-weight: 700;
      font-size: 10pt;
      vertical-align: top;
    }
    
    .project-tech {
      font-weight: 400;
      font-style: italic;
    }
    
    .project-date {
      display: table-cell;
      text-align: right;
      font-size: 10pt;
      font-style: italic;
      vertical-align: top;
    }
    
    /* Skills Section - Inline layout */
    .skills-container {
      margin-left: 0.2in;
      margin-top: 2pt;
    }
    
    .skill-category {
      margin-bottom: 3pt;
      font-size: 10pt;
    }
    
    .skill-label {
      font-weight: 700;
      color: #000;
    }
    
    .skill-items {
      color: #000;
      font-weight: 400;
    }
  </style>
</head>
<body>
  <div class="container">
    ${renderHeader(sections.personalInfo)}
    ${renderSections(sections)}
  </div>
</body>
</html>`;
}

// Test resume data
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
const html = generateHTML(testResumeData);

// Save to file
const fs = require('fs');
fs.writeFileSync('test-resume-jake-format.html', html);

console.log('HTML saved to test-resume-jake-format.html');
console.log('Open this file in a browser to see the generated layout');