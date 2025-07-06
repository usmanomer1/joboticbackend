/**
 * Simple PDF Generator that preserves original formatting
 * Just updates content without changing layout
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

class SimplePdfGeneratorService {
  constructor() {
    this.browserInstance = null;
  }

  /**
   * Get or create browser instance
   */
  async getBrowser() {
    if (!this.browserInstance) {
      const options = {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      };
      
      this.browserInstance = await puppeteer.launch(options);
    }
    return this.browserInstance;
  }

  /**
   * Generate PDF from plain text resume
   * Preserves original formatting exactly
   */
  async generatePDF(resumeText, userId) {
    console.log('=== SIMPLE PDF GENERATOR ===');
    console.log('Generating PDF from plain text, preserving format...');
    
    let browser;
    let page;
    
    try {
      browser = await this.getBrowser();
      page = await browser.newPage();
      
      // Generate simple HTML that preserves text formatting
      const html = this.generateSimpleHTML(resumeText);
      
      // Set content
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: {
          top: '1in',
          right: '1in', 
          bottom: '1in',
          left: '1in'
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
      
      if (error) {
        throw new AppError(`Failed to upload PDF: ${error.message}`, 500);
      }
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('resumes')
        .getPublicUrl(fileName);
      
      console.log('PDF generated successfully:', publicUrl);
      return publicUrl;
      
    } catch (error) {
      console.error('PDF generation error:', error);
      throw error;
    } finally {
      if (page) await page.close();
    }
  }

  /**
   * Generate simple HTML that preserves text formatting
   */
  generateSimpleHTML(resumeText) {
    // Escape HTML but preserve line breaks and spaces
    const escapedText = resumeText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #000;
      margin: 0;
      padding: 0;
      background: white;
    }
    
    .content {
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    /* Basic styling for common patterns */
    @media print {
      body {
        margin: 0;
      }
    }
  </style>
</head>
<body>
  <div class="content">${escapedText}</div>
</body>
</html>`;
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

module.exports = new SimplePdfGeneratorService();