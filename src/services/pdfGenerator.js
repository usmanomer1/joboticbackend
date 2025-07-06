/**
 * Professional PDF Generator using Puppeteer
 * Generates ATS-friendly resumes with HTML/CSS
 */

const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('../middleware/errorHandler');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials for PDF generator');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

class PdfGeneratorService {
  constructor() {
    this.browserInstance = null;
  }

  /**
   * Get or create browser instance
   */
  async getBrowser() {
    if (!this.browserInstance) {
      // Configuration for deployment
      const options = {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      };
      
      // For Railway/production deployment
      if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
        // Try multiple possible paths for Chromium
        const possiblePaths = [
          process.env.PUPPETEER_EXECUTABLE_PATH,
          '/usr/bin/chromium-browser', // Alpine Linux
          '/usr/bin/chromium',          // Other Linux distros
          'chromium'                     // System PATH
        ].filter(Boolean);
        
        for (const path of possiblePaths) {
          try {
            options.executablePath = path;
            break;
          } catch (e) {
            continue;
          }
        }
      }
      
      this.browserInstance = await puppeteer.launch(options);
    }
    return this.browserInstance;
  }

  /**
   * Generate PDF from resume data
   */
  async generatePDF(resumeData, userId) {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    
    try {
      // Generate HTML content
      const html = this.generateHTML(resumeData);
      
      // Set content and wait for styles to load
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      // Generate PDF with professional settings
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
      
      // Upload to Supabase
      const fileName = `${userId}/resume_${Date.now()}_${uuidv4()}.pdf`;
      const { data, error } = await supabase.storage
        .from('resumes')
        .upload(fileName, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true
        });
      
      if (error) throw new AppError('Failed to upload PDF to storage', 500);
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('resumes')
        .getPublicUrl(fileName);
      
      return publicUrl;
      
    } finally {
      await page.close();
    }
  }

  /**
   * Generate professional HTML for resume
   */
  generateHTML(resumeData) {
    const { sections } = resumeData;
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 10.5pt;
      line-height: 1.5;
      color: #1a1a1a;
      background: white;
    }
    
    .container {
      max-width: 8.5in;
      margin: 0 auto;
      padding: 0.5in;
    }
    
    /* Header Styles */
    .header {
      text-align: center;
      margin-bottom: 20px;
    }
    
    .name {
      font-size: 24pt;
      font-weight: 700;
      color: #000;
      margin-bottom: 5px;
      letter-spacing: 0.5px;
    }
    
    .title {
      font-size: 14pt;
      font-weight: 500;
      color: #333;
      margin-bottom: 8px;
    }
    
    .contact-info {
      font-size: 10pt;
      color: #555;
      margin-bottom: 4px;
    }
    
    .contact-info a {
      color: #555;
      text-decoration: none;
    }
    
    /* Section Styles */
    .section {
      margin-bottom: 20px;
    }
    
    .section-header {
      font-size: 12pt;
      font-weight: 700;
      color: #000;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1.5px solid #000;
    }
    
    /* Content Styles */
    .paragraph {
      margin-bottom: 10px;
      text-align: justify;
      color: #333;
    }
    
    .experience-item, .education-item {
      margin-bottom: 15px;
    }
    
    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
    }
    
    .item-title {
      font-weight: 600;
      font-size: 11pt;
      color: #000;
    }
    
    .item-date {
      font-size: 10pt;
      color: #555;
      white-space: nowrap;
    }
    
    .item-subtitle {
      font-size: 10.5pt;
      color: #333;
      font-style: italic;
      margin-bottom: 6px;
    }
    
    .item-location {
      font-size: 10pt;
      color: #666;
      margin-bottom: 6px;
    }
    
    /* Bullet Points */
    .bullet-list {
      margin-left: 15px;
    }
    
    .bullet-item {
      margin-bottom: 4px;
      color: #333;
      position: relative;
      padding-left: 15px;
    }
    
    .bullet-item:before {
      content: "•";
      position: absolute;
      left: 0;
      color: #000;
    }
    
    /* Skills Section */
    .skills-container {
      margin-bottom: 8px;
    }
    
    .skill-category {
      margin-bottom: 6px;
      display: flex;
      align-items: baseline;
    }
    
    .skill-label {
      font-weight: 600;
      color: #000;
      margin-right: 8px;
      min-width: fit-content;
    }
    
    .skill-items {
      color: #333;
      flex: 1;
    }
    
    /* List Items */
    .list-item {
      margin-bottom: 4px;
      color: #333;
      padding-left: 15px;
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
   * Render header section
   */
  renderHeader(personalInfo) {
    if (!personalInfo) return '';
    
    const contactParts = [];
    if (personalInfo.phone) contactParts.push(personalInfo.phone);
    if (personalInfo.email) contactParts.push(`<a href="mailto:${personalInfo.email}">${personalInfo.email}</a>`);
    if (personalInfo.location) contactParts.push(personalInfo.location);
    
    const linkParts = [];
    if (personalInfo.linkedin) linkParts.push(`<a href="${personalInfo.linkedin}">${this.cleanUrl(personalInfo.linkedin)}</a>`);
    if (personalInfo.github) linkParts.push(`<a href="${personalInfo.github}">${this.cleanUrl(personalInfo.github)}</a>`);
    if (personalInfo.website) linkParts.push(`<a href="${personalInfo.website}">${this.cleanUrl(personalInfo.website)}</a>`);
    
    return `
      <div class="header">
        ${personalInfo.name ? `<div class="name">${personalInfo.name}</div>` : ''}
        ${personalInfo.title ? `<div class="title">${personalInfo.title}</div>` : ''}
        ${contactParts.length ? `<div class="contact-info">${contactParts.join(' | ')}</div>` : ''}
        ${linkParts.length ? `<div class="contact-info">${linkParts.join(' | ')}</div>` : ''}
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
          section.items.forEach(item => {
            html += this.renderExperienceItem(item);
          });
          break;
          
        case 'education':
          section.items.forEach(item => {
            html += this.renderEducationItem(item);
          });
          break;
          
        case 'skills':
          html += '<div class="skills-container">';
          section.categories.forEach(category => {
            html += `
              <div class="skill-category">
                <span class="skill-label">${category.name}:</span>
                <span class="skill-items">${this.escapeHtml(category.skills)}</span>
              </div>
            `;
          });
          html += '</div>';
          break;
      }
      
      html += '</div>';
    });
    
    return html;
  }

  /**
   * Render experience item
   */
  renderExperienceItem(item) {
    let html = '<div class="experience-item">';
    
    html += '<div class="item-header">';
    html += `<div class="item-title">${this.escapeHtml(item.title || '')}</div>`;
    if (item.dateRange) {
      html += `<div class="item-date">${this.escapeHtml(item.dateRange)}</div>`;
    }
    html += '</div>';
    
    if (item.organization) {
      html += `<div class="item-subtitle">${this.escapeHtml(item.organization)}</div>`;
    }
    
    if (item.location) {
      html += `<div class="item-location">${this.escapeHtml(item.location)}</div>`;
    }
    
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
   * Render education item
   */
  renderEducationItem(item) {
    let html = '<div class="education-item">';
    
    html += '<div class="item-header">';
    html += `<div class="item-title">${this.escapeHtml(item.degree || '')}</div>`;
    if (item.date) {
      html += `<div class="item-date">${this.escapeHtml(item.date)}</div>`;
    }
    html += '</div>';
    
    if (item.institution) {
      html += `<div class="item-subtitle">${this.escapeHtml(item.institution)}</div>`;
    }
    
    if (item.location) {
      html += `<div class="item-location">${this.escapeHtml(item.location)}</div>`;
    }
    
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