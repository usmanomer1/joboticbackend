const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

class PdfExportService {
  constructor() {
    this.tempExportDir = 'temp/exports';
    this.supabase = null;
    this.bucketName = 'resumes';
    
    // Initialize Supabase if credentials are available
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );
    }
    
    // Default PDF options
    this.defaultOptions = {
      format: 'Letter',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: false
    };
    
    // Paper formats
    this.paperFormats = {
      'Letter': { width: 8.5, height: 11 },
      'Legal': { width: 8.5, height: 14 },
      'A4': { width: 8.27, height: 11.69 },
      'A3': { width: 11.69, height: 16.54 },
      'Tabloid': { width: 11, height: 17 }
    };
  }

  /**
   * Generate PDF from HTML content
   * @param {string} htmlContent - HTML content to convert
   * @param {string} outputPath - Path to save PDF
   * @param {Object} options - PDF generation options
   * @returns {Promise<string>} - Path to generated PDF
   */
  async generatePdfFromHtml(htmlContent, outputPath, options = {}) {
    let browser = null;
    
    try {
      // Ensure output directory exists
      await fs.ensureDir(path.dirname(outputPath));
      
      // Merge with default options
      const pdfOptions = { ...this.defaultOptions, ...options };
      
      // Launch browser
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--font-render-hinting=none' // Better font rendering
        ],
        // Use system Chrome if available (for Railway/production)
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
      });
      
      const page = await browser.newPage();
      
      // Set viewport to match PDF size
      const format = pdfOptions.format || 'Letter';
      const dimensions = this.paperFormats[format];
      if (dimensions) {
        await page.setViewport({
          width: Math.floor(dimensions.width * 96), // 96 DPI
          height: Math.floor(dimensions.height * 96),
          deviceScaleFactor: 2 // High quality
        });
      }
      
      // Add custom styles for better PDF rendering
      const enhancedHtml = this.enhanceHtmlForPdf(htmlContent);
      
      // Load HTML with proper base path for assets
      await page.setContent(enhancedHtml, { 
        waitUntil: ['networkidle0', 'domcontentloaded'],
        baseURL: `file://${process.cwd()}/temp/html/`
      });
      
      // Wait for fonts to load
      await page.evaluateHandle('document.fonts.ready');
      
      // Additional wait for complex layouts
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Generate PDF
      await page.pdf({
        path: outputPath,
        ...pdfOptions
      });
      
      console.log(`PDF generated successfully: ${outputPath}`);
      return outputPath;
      
    } catch (error) {
      console.error('PDF generation error:', error);
      throw new Error(`Failed to generate PDF: ${error.message}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Generate PDF with custom options
   * @param {string} htmlContent - HTML content
   * @param {Object} customOptions - Custom PDF options
   * @returns {Promise<Object>} - PDF info with local and remote URLs
   */
  async generateCustomPdf(htmlContent, customOptions = {}) {
    const timestamp = Date.now();
    const filename = customOptions.filename || `resume-${timestamp}.pdf`;
    const outputPath = path.join(this.tempExportDir, filename);
    
    // PDF generation options
    const options = {
      format: customOptions.format || 'Letter',
      printBackground: customOptions.printBackground !== false,
      margin: customOptions.margin || { top: 0, right: 0, bottom: 0, left: 0 },
      displayHeaderFooter: customOptions.displayHeaderFooter || false,
      headerTemplate: customOptions.headerTemplate || '',
      footerTemplate: customOptions.footerTemplate || '',
      preferCSSPageSize: customOptions.preferCSSPageSize || false,
      landscape: customOptions.landscape || false,
      pageRanges: customOptions.pageRanges || '',
      scale: customOptions.scale || 1
    };
    
    // Generate PDF
    const pdfPath = await this.generatePdfFromHtml(htmlContent, outputPath, options);
    
    // Upload to storage if enabled
    let publicUrl = null;
    if (customOptions.upload && this.supabase) {
      publicUrl = await this.uploadToStorage(pdfPath, filename);
    }
    
    return {
      localPath: pdfPath,
      filename: filename,
      publicUrl: publicUrl,
      size: (await fs.stat(pdfPath)).size,
      timestamp: timestamp
    };
  }

  /**
   * Enhance HTML for better PDF rendering
   * @param {string} htmlContent - Original HTML
   * @returns {string} - Enhanced HTML
   */
  enhanceHtmlForPdf(htmlContent) {
    // Add print-specific styles
    const printStyles = `
      <style>
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            color-adjust: exact;
          }
          
          /* Ensure fonts are embedded */
          @font-face {
            font-family: 'Arial';
            src: local('Arial');
          }
          
          /* Fix positioning for pdf2htmlEX content */
          .pc {
            page-break-inside: avoid;
            position: relative !important;
          }
          
          .t {
            position: absolute !important;
          }
          
          /* Remove suggestion highlights for final PDF */
          .ai-suggestion.accepted {
            background-color: transparent !important;
          }
          
          /* Ensure text is selectable */
          * {
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            user-select: text !important;
          }
        }
        
        /* Additional styles for screen rendering */
        body {
          margin: 0;
          padding: 0;
          background: white;
        }
        
        /* High-quality text rendering */
        * {
          text-rendering: optimizeLegibility;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
      </style>
    `;
    
    // Insert styles into head
    return htmlContent.replace('</head>', printStyles + '</head>');
  }

  /**
   * Generate PDF with different paper sizes
   * @param {string} htmlContent - HTML content
   * @param {string} paperSize - Paper size (Letter, Legal, A4, etc.)
   * @returns {Promise<string>} - Path to PDF
   */
  async generateWithPaperSize(htmlContent, paperSize = 'Letter') {
    const timestamp = Date.now();
    const filename = `resume-${paperSize.toLowerCase()}-${timestamp}.pdf`;
    const outputPath = path.join(this.tempExportDir, filename);
    
    const options = {
      format: paperSize,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    };
    
    return await this.generatePdfFromHtml(htmlContent, outputPath, options);
  }

  /**
   * Generate PDF with custom margins
   * @param {string} htmlContent - HTML content
   * @param {Object} margins - Margin settings {top, right, bottom, left}
   * @returns {Promise<string>} - Path to PDF
   */
  async generateWithMargins(htmlContent, margins) {
    const timestamp = Date.now();
    const filename = `resume-margins-${timestamp}.pdf`;
    const outputPath = path.join(this.tempExportDir, filename);
    
    const options = {
      format: 'Letter',
      printBackground: true,
      margin: {
        top: margins.top || '0.5in',
        right: margins.right || '0.5in',
        bottom: margins.bottom || '0.5in',
        left: margins.left || '0.5in'
      }
    };
    
    return await this.generatePdfFromHtml(htmlContent, outputPath, options);
  }

  /**
   * Generate PDF with headers and footers
   * @param {string} htmlContent - HTML content
   * @param {Object} headerFooter - Header/footer configuration
   * @returns {Promise<string>} - Path to PDF
   */
  async generateWithHeaderFooter(htmlContent, headerFooter = {}) {
    const timestamp = Date.now();
    const filename = `resume-hf-${timestamp}.pdf`;
    const outputPath = path.join(this.tempExportDir, filename);
    
    const options = {
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      margin: {
        top: headerFooter.marginTop || '1in',
        bottom: headerFooter.marginBottom || '1in',
        left: '0.5in',
        right: '0.5in'
      },
      headerTemplate: headerFooter.headerTemplate || `
        <div style="font-size: 10px; width: 100%; text-align: center;">
          <span class="title"></span>
        </div>
      `,
      footerTemplate: headerFooter.footerTemplate || `
        <div style="font-size: 10px; width: 100%; text-align: center;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      `
    };
    
    return await this.generatePdfFromHtml(htmlContent, outputPath, options);
  }

  /**
   * Upload PDF to Supabase storage
   * @param {string} pdfPath - Local PDF path
   * @param {string} filename - Filename for storage
   * @returns {Promise<string>} - Public URL
   */
  async uploadToStorage(pdfPath, filename) {
    if (!this.supabase) {
      throw new Error('Supabase client not initialized');
    }
    
    try {
      // Read PDF file
      const pdfBuffer = await fs.readFile(pdfPath);
      
      // Generate unique path
      const storagePath = `exports/${Date.now()}-${filename}`;
      
      // Upload to Supabase
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(storagePath, pdfBuffer, {
          contentType: 'application/pdf',
          cacheControl: '3600',
          upsert: false
        });
      
      if (error) {
        throw error;
      }
      
      // Get public URL
      const { data: { publicUrl } } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(storagePath);
      
      console.log(`PDF uploaded to: ${publicUrl}`);
      return publicUrl;
      
    } catch (error) {
      console.error('Storage upload error:', error);
      throw new Error(`Failed to upload PDF: ${error.message}`);
    }
  }

  /**
   * Generate and upload PDF in one step
   * @param {string} htmlContent - HTML content
   * @param {Object} options - Generation and upload options
   * @returns {Promise<Object>} - PDF info with URLs
   */
  async generateAndUpload(htmlContent, options = {}) {
    const pdfInfo = await this.generateCustomPdf(htmlContent, {
      ...options,
      upload: true
    });
    
    return pdfInfo;
  }

  /**
   * Clean up old export files
   * @param {number} maxAge - Maximum age in milliseconds
   */
  async cleanup(maxAge = 24 * 60 * 60 * 1000) {
    try {
      const now = Date.now();
      const files = await fs.readdir(this.tempExportDir);
      
      for (const file of files) {
        if (file === '.gitkeep') continue;
        
        const filePath = path.join(this.tempExportDir, file);
        const stats = await fs.stat(filePath);
        
        if ((now - stats.mtimeMs) > maxAge) {
          await fs.remove(filePath);
          console.log(`Cleaned up old PDF: ${file}`);
        }
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  /**
   * Batch generate PDFs with different options
   * @param {string} htmlContent - HTML content
   * @param {Array} optionsArray - Array of options for each PDF
   * @returns {Promise<Array>} - Array of PDF info objects
   */
  async batchGenerate(htmlContent, optionsArray) {
    const results = [];
    
    for (const options of optionsArray) {
      try {
        const pdfInfo = await this.generateCustomPdf(htmlContent, options);
        results.push({
          success: true,
          ...pdfInfo
        });
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          options: options
        });
      }
    }
    
    return results;
  }

  /**
   * Validate HTML before PDF generation
   * @param {string} htmlContent - HTML to validate
   * @returns {Object} - Validation result
   */
  validateHtml(htmlContent) {
    const validation = {
      isValid: true,
      warnings: [],
      errors: []
    };
    
    // Check for required pdf2htmlEX elements
    if (!htmlContent.includes('class="pc"')) {
      validation.warnings.push('Missing pdf2htmlEX page container (.pc)');
    }
    
    if (!htmlContent.includes('class="t"')) {
      validation.warnings.push('Missing pdf2htmlEX text elements (.t)');
    }
    
    // Check for HTML structure
    if (!htmlContent.includes('<html') || !htmlContent.includes('</html>')) {
      validation.errors.push('Invalid HTML structure');
      validation.isValid = false;
    }
    
    // Check for potential issues
    if (htmlContent.includes('<script')) {
      validation.warnings.push('HTML contains scripts which may affect PDF rendering');
    }
    
    return validation;
  }
}

module.exports = new PdfExportService();