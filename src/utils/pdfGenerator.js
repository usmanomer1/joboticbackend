/**
 * PDF generation utility using Puppeteer
 * @module utils/pdfGenerator
 */

const puppeteer = require('puppeteer');
const { AppError } = require('../middleware/errorHandler');

// PDF generation configuration
const PDF_CONFIG = {
  TIMEOUT: 30000, // 30 seconds
  RETRY_COUNT: 1,
  PAGE_FORMAT: 'Letter',
  MARGINS: {
    top: '0.5in',
    bottom: '0.5in',
    left: '0.5in',
    right: '0.5in'
  }
};

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * PDF Generator class
 */
class PDFGenerator {
  /**
   * Generate PDF from resume data
   * @param {Object} resumeData - Resume information
   * @param {string} resumeData.text - Resume content
   * @param {number} resumeData.score - Match score
   * @param {string} resumeData.optimizedFor - Job title optimized for
   * @param {Object} metadata - Additional metadata
   * @param {string} metadata.jobTitle - Target job title
   * @param {string} metadata.company - Company name
   * @param {Array} metadata.improvements - List of improvements made
   * @param {Object} metadata.changes - Detailed changes object
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generatePDF(resumeData, metadata = {}) {
    if (!resumeData || !resumeData.text) {
      throw new AppError('Invalid resume data provided for PDF generation', 400);
    }

    console.log('Generating PDF for resume');
    console.log(`Score: ${resumeData.score}, Optimized for: ${resumeData.optimizedFor}`);

    let browser = null;
    
    try {
      // Generate PDF with retry logic
      const pdfBuffer = await this.generateWithRetry(resumeData, metadata);
      return pdfBuffer;
    } catch (error) {
      console.error('PDF generation failed:', error);
      throw new AppError('Failed to generate PDF', 500, {
        originalError: error.message
      });
    }
  }

  /**
   * Generate PDF with retry logic
   * @param {Object} resumeData - Resume data
   * @param {Object} metadata - Metadata
   * @param {number} attempt - Current attempt number
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateWithRetry(resumeData, metadata, attempt = 1) {
    let browser = null;
    
    try {
      // Launch Puppeteer browser
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ],
        timeout: PDF_CONFIG.TIMEOUT
      });

      // Create new page
      const page = await browser.newPage();
      
      // Set timeout
      page.setDefaultTimeout(PDF_CONFIG.TIMEOUT);

      // Generate HTML content
      const htmlContent = this.generateHTML(resumeData, metadata);
      
      // Set content and wait for rendering
      await page.setContent(htmlContent, {
        waitUntil: ['networkidle0', 'domcontentloaded']
      });

      // Add custom CSS for print
      await page.addStyleTag({
        content: this.getPrintStyles()
      });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: PDF_CONFIG.PAGE_FORMAT,
        margin: PDF_CONFIG.MARGINS,
        printBackground: true,
        preferCSSPageSize: true
      });

      // Close browser
      await browser.close();

      console.log('PDF generated successfully');
      return pdfBuffer;

    } catch (error) {
      // Clean up browser if it exists
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error('Error closing browser:', closeError);
        }
      }

      // Retry logic
      if (attempt <= PDF_CONFIG.RETRY_COUNT) {
        console.log(`PDF generation failed, retrying... (attempt ${attempt + 1})`);
        await sleep(1000);
        return this.generateWithRetry(resumeData, metadata, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Generate HTML template for PDF
   * @param {Object} resumeData - Resume data
   * @param {Object} metadata - Metadata
   * @returns {string} HTML content
   */
  generateHTML(resumeData, metadata) {
    const {
      text,
      score = 0,
      optimizedFor = 'General Position'
    } = resumeData;

    const {
      jobTitle = optimizedFor,
      company = '',
      improvements = [],
      changes = {}
    } = metadata;

    // Format resume text for HTML
    const formattedResume = this.formatResumeText(text, changes);

    // Score badge color based on score
    const scoreColor = this.getScoreColor(score);

    // Generation date
    const generationDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Optimized Resume</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Arial', 'Helvetica', sans-serif;
      line-height: 1.6;
      color: #333;
      background: white;
    }

    .container {
      max-width: 8.5in;
      margin: 0 auto;
      padding: 0.5in;
      background: white;
    }

    .header {
      border-bottom: 3px solid #2c3e50;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }

    .score-badge {
      display: inline-block;
      background: ${scoreColor};
      color: white;
      padding: 8px 16px;
      border-radius: 25px;
      font-weight: bold;
      font-size: 18px;
      float: right;
    }

    .optimization-info {
      margin-top: 10px;
      color: #555;
      font-size: 16px;
    }

    .optimization-info strong {
      color: #2c3e50;
    }

    .improvements-section {
      background: #f8f9fa;
      border-left: 4px solid #27ae60;
      padding: 15px;
      margin: 20px 0;
      border-radius: 0 4px 4px 0;
    }

    .improvements-section h3 {
      color: #27ae60;
      margin-bottom: 10px;
      font-size: 16px;
    }

    .improvements-list {
      list-style: none;
      padding-left: 0;
    }

    .improvements-list li {
      padding: 5px 0;
      padding-left: 20px;
      position: relative;
    }

    .improvements-list li:before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #27ae60;
      font-weight: bold;
    }

    .resume-content {
      margin-top: 30px;
      white-space: pre-wrap;
      font-size: 12pt;
      line-height: 1.8;
    }

    .highlighted {
      background-color: #e8f5e9;
      padding: 2px 4px;
      border-radius: 3px;
      transition: background-color 0.3s ease;
    }

    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      color: #777;
      font-size: 11px;
    }

    h1, h2, h3, h4, h5, h6 {
      color: #2c3e50;
      margin: 15px 0 10px 0;
    }

    /* Professional typography */
    h1 { font-size: 24pt; font-weight: 600; }
    h2 { font-size: 18pt; font-weight: 600; }
    h3 { font-size: 14pt; font-weight: 600; }
    h4 { font-size: 12pt; font-weight: 600; }

    /* Section spacing */
    .section {
      margin-bottom: 25px;
    }

    /* List formatting */
    ul, ol {
      margin-left: 20px;
      margin-bottom: 10px;
    }

    li {
      margin-bottom: 5px;
    }

    /* Contact info styling */
    .contact-info {
      color: #555;
      font-size: 11pt;
      margin-bottom: 20px;
    }

    @media print {
      body {
        background: white;
      }
      
      .container {
        padding: 0;
      }

      .header {
        page-break-after: avoid;
      }

      .section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Optimized Resume</h1>
      <div class="score-badge">Score: ${score}/10</div>
      <div style="clear: both;"></div>
      <div class="optimization-info">
        <strong>Optimized for:</strong> ${jobTitle}${company ? ` at ${company}` : ''}
      </div>
    </div>

    ${improvements.length > 0 ? `
    <div class="improvements-section">
      <h3>Optimizations Applied</h3>
      <ul class="improvements-list">
        ${improvements.slice(0, 5).map(improvement => `
          <li>${this.escapeHtml(improvement)}</li>
        `).join('')}
      </ul>
    </div>
    ` : ''}

    <div class="resume-content">
${formattedResume}
    </div>

    <div class="footer">
      <p>Generated on ${generationDate} | Optimized with AI-powered Resume Enhancement</p>
      <p>This resume has been tailored for the specific position mentioned above</p>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Format resume text with highlighting
   * @param {string} text - Resume text
   * @param {Object} changes - Changes made during optimization
   * @returns {string} Formatted HTML text
   */
  formatResumeText(text, changes) {
    // Escape HTML first
    let formatted = this.escapeHtml(text);

    // Apply basic formatting
    // Convert multiple newlines to paragraph breaks
    formatted = formatted.replace(/\n\n+/g, '</p><p>');
    formatted = `<p>${formatted}</p>`;

    // Highlight keywords if available
    if (changes.keywordsIntegrated && Array.isArray(changes.keywordsIntegrated)) {
      changes.keywordsIntegrated.forEach(keyword => {
        // Case-insensitive highlighting
        const regex = new RegExp(`\\b(${this.escapeRegex(keyword)})\\b`, 'gi');
        formatted = formatted.replace(regex, '<span class="highlighted">$1</span>');
      });
    }

    return formatted;
  }

  /**
   * Get additional print styles
   * @returns {string} CSS styles
   */
  getPrintStyles() {
    return `
      @page {
        size: letter;
        margin: 0.5in;
      }

      @media print {
        .score-badge {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .highlighted {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .improvements-section {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `;
  }

  /**
   * Get color for score badge
   * @param {number} score - Score value
   * @returns {string} Hex color
   */
  getScoreColor(score) {
    if (score >= 8) return '#27ae60'; // Green
    if (score >= 6) return '#3498db'; // Blue
    if (score >= 4) return '#f39c12'; // Orange
    return '#e74c3c'; // Red
  }

  /**
   * Escape HTML special characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, char => map[char]);
  }

  /**
   * Escape regex special characters
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Generate simple PDF without optimization info
   * @param {string} resumeText - Plain resume text
   * @param {string} filename - Desired filename
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateSimplePDF(resumeText, filename = 'resume') {
    const resumeData = {
      text: resumeText,
      score: null,
      optimizedFor: filename
    };

    const metadata = {
      jobTitle: '',
      company: '',
      improvements: []
    };

    return this.generatePDF(resumeData, metadata);
  }
}

// Export singleton instance
module.exports = new PDFGenerator();