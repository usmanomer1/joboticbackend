/**
 * Professional PDF Generator using Puppeteer
 * Generates ATS-friendly resumes with HTML/CSS
 */

const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../middleware/errorHandler');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class PdfGeneratorService {
  constructor() {
    this.browserInstance = null;
  }

  /**
   * Get or create browser instance
   */
  async getBrowser() {
    if (!this.browserInstance) {
      // Configuration for Docker/Railway deployment
      const options = {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      };
      
      try {
        console.log('Launching Puppeteer with executable path:', options.executablePath);
        this.browserInstance = await puppeteer.launch(options);
        console.log('Puppeteer launched successfully');
      } catch (error) {
        console.error('Failed to launch Puppeteer:', error.message);
        console.error('Error details:', {
          executablePath: options.executablePath,
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch
        });
        throw new Error(`Cannot launch Chromium: ${error.message}`);
      }
    }
    return this.browserInstance;
  }

  /**
   * Generate PDF from resume data
   */
  async generatePDF(resumeData, userId) {
    console.log('=== PDF GENERATOR CALLED ===');
    console.log('User ID:', userId);
    console.log('Resume data sections:', Object.keys(resumeData.sections || {}));
    
    let browser;
    let page;
    
    try {
      browser = await this.getBrowser();
      page = await browser.newPage();
      
      // Generate HTML content
      console.log('Generating HTML content...');
      const html = this.generateHTML(resumeData);
      console.log('HTML length:', html.length);
      
      // Log first 500 chars of HTML for debugging
      console.log('HTML preview:', html.substring(0, 500) + '...');
      
      // Set content and wait for styles to load
      console.log('Setting page content...');
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      // Generate PDF with professional settings
      console.log('Generating PDF buffer...');
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: {
          top: '0.5in',
          right: '0.5in',
          bottom: '0.5in',
          left: '0.5in'
        }
      });
      
      console.log('PDF buffer generated, size:', pdfBuffer.length);
      console.log('PDF buffer type:', typeof pdfBuffer);
      console.log('Is Buffer?', Buffer.isBuffer(pdfBuffer));
      
      // Upload to Supabase
      const fileName = `${userId}/resume_${Date.now()}_${uuidv4()}.pdf`;
      console.log('Uploading to Supabase storage with filename:', fileName);
      
      const { data, error } = await supabase.storage
        .from('resumes')
        .upload(fileName, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true
        });
      
      if (error) {
        console.error('Supabase storage upload error:', error);
        throw new AppError(`Failed to upload PDF to storage: ${error.message}`, 500);
      }
      
      console.log('PDF uploaded successfully to Supabase');
      console.log('Upload response:', data);
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('resumes')
        .getPublicUrl(fileName);
      
      console.log('PDF public URL:', publicUrl);
      return publicUrl;
      
    } catch (error) {
      console.error('PDF generation error:', error);
      console.error('Error stack:', error.stack);
      throw error;
    } finally {
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Generate professional HTML for resume matching Jake's LaTeX format
   */
  generateHTML(resumeData) {
    const { sections } = resumeData;
    
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
    
    /* Paragraph/Summary Styles */
    .paragraph {
      margin-bottom: 8pt;
      text-align: left;
      color: #000;
      font-size: 10pt;
      line-height: 1.4;
    }
    
    /* List items for simple lists */
    .list-item {
      margin-bottom: 2pt;
      color: #000;
      font-size: 10pt;
      padding-left: 0.2in;
      position: relative;
    }
    
    .list-item:before {
      content: "•";
      position: absolute;
      left: 0;
      color: #000;
    }
    
    /* Responsive adjustments for PDF */
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    ${this.renderHeader(sections.personalInfo)}
    ${this.renderSections(sections)}
  </div>
</body>
</html>`;
  }

  /**
   * Render header section - Jake's format with all info on one line
   */
  renderHeader(personalInfo) {
    if (!personalInfo) return '';
    
    // Combine all contact info into one line with pipe separators
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
    
    if (personalInfo.website) {
      const websiteDisplay = personalInfo.website.replace(/^https?:\/\//, '').replace(/\/$/, '');
      contactParts.push(`<a href="${personalInfo.website}">${websiteDisplay}</a>`);
    }
    
    return `
      <div class="header">
        ${personalInfo.name ? `<div class="name">${personalInfo.name}</div>` : ''}
        ${contactParts.length ? `<div class="contact-line">${contactParts.join('<span class="pipe">|</span>')}</div>` : ''}
      </div>
    `;
  }

  /**
   * Render all sections dynamically
   */
  renderSections(sections) {
    let html = '';
    
    Object.entries(sections).forEach(([key, section]) => {
      if (key === 'personalInfo') return;
      
      html += `<div class="section">`;
      html += `<div class="section-header">${section.title}</div>`;
      
      switch (section.type) {
        case 'paragraph':
          html += `<div class="paragraph">${this.escapeHtml(section.content)}</div>`;
          break;
          
        case 'list':
          html += '<div class="bullet-list">';
          section.items.forEach(item => {
            html += `<div class="list-item">${this.escapeHtml(item)}</div>`;
          });
          html += '</div>';
          break;
          
        case 'experience':
          // Check if this is actually a projects section based on title
          if (section.title && section.title.toLowerCase().includes('project')) {
            section.items.forEach(item => {
              html += this.renderProjectItem(item);
            });
          } else {
            section.items.forEach(item => {
              html += this.renderExperienceItem(item);
            });
          }
          break;
          
        case 'education':
          section.items.forEach(item => {
            html += this.renderEducationItem(item);
          });
          break;
          
        case 'skills':
          html += '<div class="skills-container">';
          section.categories.forEach(category => {
            html += `<div class="skill-category"><span class="skill-label">${this.escapeHtml(category.name)}:</span> <span class="skill-items">${this.escapeHtml(category.skills)}</span></div>`;
          });
          html += '</div>';
          break;
      }
      
      html += '</div>';
    });
    
    return html;
  }

  /**
   * Render experience item - Jake's two-column layout
   */
  renderExperienceItem(item) {
    let html = '<div class="experience-item">';
    
    // First row: Title and Date
    html += '<div class="item-row">';
    html += `<div class="item-left"><span class="item-title">${this.escapeHtml(item.title || '')}</span></div>`;
    html += `<div class="item-right"><span class="item-date">${this.escapeHtml(item.dateRange || '')}</span></div>`;
    html += '</div>';
    
    // Second row: Organization/Location and Date continuation
    if (item.organization || item.location) {
      html += '<div class="item-row">';
      let orgLocation = [];
      if (item.organization) orgLocation.push(this.escapeHtml(item.organization));
      if (item.location) orgLocation.push(this.escapeHtml(item.location));
      html += `<div class="item-left"><span class="item-subtitle">${orgLocation.join(', ')}</span></div>`;
      html += '<div class="item-right"></div>';
      html += '</div>';
    }
    
    // Bullet points
    if (item.description && item.description.length > 0) {
      html += '<div class="bullet-list">';
      item.description.forEach(desc => {
        html += `<div class="bullet-item">${this.escapeHtml(desc)}</div>`;
      });
      html += '</div>';
    }
    
    html += '</div>';
    return html;
  }

  /**
   * Render education item - Jake's two-column layout
   */
  renderEducationItem(item) {
    let html = '<div class="education-item">';
    
    // First row: Institution and Location
    html += '<div class="item-row">';
    html += `<div class="item-left"><span class="item-title">${this.escapeHtml(item.institution || '')}</span></div>`;
    html += `<div class="item-right"><span class="item-date">${this.escapeHtml(item.location || '')}</span></div>`;
    html += '</div>';
    
    // Second row: Degree and Date
    html += '<div class="item-row">';
    html += `<div class="item-left"><span class="item-subtitle">${this.escapeHtml(item.degree || '')}</span></div>`;
    html += `<div class="item-right"><span class="item-date">${this.escapeHtml(item.date || '')}</span></div>`;
    html += '</div>';
    
    // Additional details if any
    if (item.details && item.details.length > 0) {
      html += '<div class="bullet-list">';
      item.details.forEach(detail => {
        html += `<div class="bullet-item">${this.escapeHtml(detail)}</div>`;
      });
      html += '</div>';
    }
    
    html += '</div>';
    return html;
  }

  /**
   * Render project item - Jake's format with tech stack inline
   */
  renderProjectItem(item) {
    let html = '<div class="project-item">';
    
    // Project header with title, tech stack, and date
    html += '<div class="project-header">';
    
    // Extract tech stack from organization field or title
    let projectTitle = item.title || '';
    let techStack = '';
    
    // Check if tech stack is in organization field (common pattern)
    if (item.organization && item.organization.includes('|')) {
      const parts = item.organization.split('|');
      techStack = parts[0].trim();
    } else if (projectTitle.includes('|')) {
      const parts = projectTitle.split('|');
      projectTitle = parts[0].trim();
      techStack = parts[1].trim();
    }
    
    html += '<div class="project-title">';
    html += `<strong>${this.escapeHtml(projectTitle)}</strong>`;
    if (techStack) {
      html += ` <span class="project-tech">| ${this.escapeHtml(techStack)}</span>`;
    }
    html += '</div>';
    
    html += `<div class="project-date">${this.escapeHtml(item.dateRange || '')}</div>`;
    html += '</div>';
    
    // Bullet points
    if (item.description && item.description.length > 0) {
      html += '<div class="bullet-list">';
      item.description.forEach(desc => {
        html += `<div class="bullet-item">${this.escapeHtml(desc)}</div>`;
      });
      html += '</div>';
    }
    
    html += '</div>';
    return html;
  }

  /**
   * Clean URL for display
   */
  cleanUrl(url) {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
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

  /**
   * Cleanup browser instance
   */
  async cleanup() {
    if (this.browserInstance) {
      await this.browserInstance.close();
      this.browserInstance = null;
    }
  }
}

// Export singleton instance
module.exports = new PdfGeneratorService();