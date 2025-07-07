const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const logger = require('../utils/logger');

class PdfToHtmlService {
  constructor() {
    this.tempHtmlDir = 'temp/html';
    this.maxFileAge = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Convert PDF to HTML using pdf2htmlEX with fallback
   * @param {string} pdfPath - Path to the PDF file
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} - Conversion result with method used
   */
  async convertWithFallback(pdfPath, options = {}) {
    const { forceFallback = false } = options;
    
    // Check if pdf2htmlEX is disabled via environment variable
    const pdf2htmlexDisabled = process.env.DISABLE_PDF2HTMLEX === 'true';
    
    // Try pdf2htmlEX first unless fallback is forced or pdf2htmlEX is disabled
    if (!forceFallback && !pdf2htmlexDisabled) {
      try {
        const htmlPath = await this.convert(pdfPath);
        return {
          success: true,
          method: 'pdf2htmlEX',
          htmlPath,
          fallbackUsed: false
        };
      } catch (error) {
        logger.warn('PDF_CONVERSION', 'pdf2htmlEX failed, attempting fallback', { 
          error: error.message 
        });
      }
    }
    
    // Fallback to text extraction
    try {
      const fallbackHtml = await this.fallbackConversion(pdfPath);
      return {
        success: true,
        method: 'text-extraction',
        htmlPath: fallbackHtml,
        fallbackUsed: true
      };
    } catch (fallbackError) {
      logger.error('PDF_CONVERSION', 'All conversion methods failed', { 
        pdf2htmlError: !forceFallback ? 'failed' : 'skipped',
        fallbackError: fallbackError.message 
      });
      throw new Error('PDF conversion failed with all methods');
    }
  }

  /**
   * Fallback conversion using text extraction
   * @param {string} pdfPath - Path to the PDF file
   * @returns {Promise<string>} - Path to generated HTML file
   */
  async fallbackConversion(pdfPath) {
    logger.info('PDF_CONVERSION', 'Using fallback text extraction method');
    
    // Import existing resume parser service as fallback
    const resumeParser = require('./resumeParserService');
    
    // Extract text from PDF
    const pdfBuffer = await fs.readFile(pdfPath);
    const extractedText = await resumeParser.extractTextFromPDF(pdfBuffer);
    
    if (!extractedText || extractedText.length < 50) {
      throw new Error('Failed to extract meaningful text from PDF');
    }
    
    // Parse resume structure
    const parsedResume = resumeParser.parseResumeText(extractedText);
    
    // Generate simple HTML representation
    const html = this.generateFallbackHtml(parsedResume, extractedText);
    
    // Save HTML
    const outputName = path.basename(pdfPath, '.pdf');
    const outputPath = path.join(this.tempHtmlDir, `${outputName}-fallback`);
    await fs.ensureDir(outputPath);
    
    const htmlPath = path.join(outputPath, `${outputName}.html`);
    await fs.writeFile(htmlPath, html);
    
    logger.info('PDF_CONVERSION', 'Fallback conversion completed', { htmlPath });
    
    return htmlPath;
  }

  /**
   * Generate fallback HTML from parsed resume
   */
  generateFallbackHtml(parsedResume, originalText) {
    // Create a simple HTML structure that mimics pdf2htmlEX output
    const sections = [];
    let yPosition = 50;
    
    // Add each line as a positioned text element
    const lines = originalText.split('\n');
    lines.forEach((line, index) => {
      if (line.trim()) {
        sections.push(`<div class="t" style="position: absolute; left: 50px; top: ${yPosition}px;">${this.escapeHtml(line)}</div>`);
        yPosition += 20;
      } else {
        yPosition += 10; // Empty line
      }
    });
    
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
.pc { position: relative; overflow: hidden; width: 595px; height: 842px; margin: 0 auto; background: white; }
.t { position: absolute; white-space: pre-wrap; font-family: Arial, sans-serif; font-size: 12px; }
.fallback-notice { position: absolute; top: 10px; right: 10px; background: #fff3cd; padding: 5px 10px; border: 1px solid #ffeaa7; border-radius: 3px; font-size: 10px; }
</style>
</head>
<body>
<div class="pc">
  <div class="fallback-notice">Text-based conversion (fallback mode)</div>
  ${sections.join('\n  ')}
</div>
</body>
</html>`;
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
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
   * Convert PDF to HTML using pdf2htmlEX
   * @param {string} pdfPath - Path to the PDF file
   * @returns {Promise<string>} - Path to generated HTML file
   */
  async convert(pdfPath) {
    try {
      // Validate PDF exists
      if (!await fs.pathExists(pdfPath)) {
        throw new Error(`PDF file not found: ${pdfPath}`);
      }

      // Check if file is actually a PDF
      const stats = await fs.stat(pdfPath);
      if (stats.size === 0) {
        throw new Error('PDF file is empty');
      }

      const outputName = path.basename(pdfPath, '.pdf');
      const outputPath = path.join(this.tempHtmlDir, outputName);
      
      // Create output directory
      await fs.ensureDir(outputPath);
      
      // Run pdf2htmlEX with optimized settings for layout preservation
      const command = `pdf2htmlEX --zoom 1.5 --process-outline 0 --data-dir /usr/share/pdf2htmlEX/data "${pdfPath}" --dest-dir "${outputPath}"`;
      
      console.log(`Converting PDF to HTML: ${pdfPath}`);
      logger.logConversion('START', 'Beginning PDF to HTML conversion', { pdfPath, outputPath });
      
      return new Promise((resolve, reject) => {
        exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
          if (error) {
            console.error('pdf2htmlEX error:', error.message);
            console.error('stderr:', stderr);
            logger.error('PDF_CONVERSION', 'pdf2htmlEX command failed', { 
              error: error.message, 
              stderr, 
              command: command.substring(0, 100) + '...' 
            });
            
            // Clean up on error
            fs.remove(outputPath).catch(err => 
              console.error('Failed to clean up after error:', err)
            );
            
            // Handle specific pdf2htmlEX errors
            if (error.message.includes('command not found')) {
              reject(new Error('pdf2htmlEX is not installed. Please install it using: apt-get install pdf2htmlex'));
            } else if (error.message.includes('Invalid PDF')) {
              reject(new Error('Invalid or corrupted PDF file'));
            } else {
              reject(new Error(`PDF conversion failed: ${error.message}`));
            }
          } else {
            const htmlPath = path.join(outputPath, outputName + '.html');
            
            // Verify HTML was created
            fs.pathExists(htmlPath)
              .then(exists => {
                if (exists) {
                  console.log(`Successfully converted to HTML: ${htmlPath}`);
                  logger.logConversion('SUCCESS', 'PDF converted to HTML successfully', { 
                    htmlPath, 
                    stdout: stdout.substring(0, 200) 
                  });
                  resolve(htmlPath);
                } else {
                  logger.error('PDF_CONVERSION', 'HTML file was not generated', { expectedPath: htmlPath });
                  reject(new Error('HTML file was not generated'));
                }
              })
              .catch(reject);
          }
        });
      });
    } catch (error) {
      console.error('PDF to HTML conversion error:', error);
      throw error;
    }
  }

  /**
   * Clean up old HTML files
   * @param {number} maxAge - Maximum age in milliseconds (default: 24 hours)
   */
  async cleanup(maxAge = this.maxFileAge) {
    try {
      const now = Date.now();
      const htmlDir = this.tempHtmlDir;
      
      if (!await fs.pathExists(htmlDir)) {
        return;
      }

      const folders = await fs.readdir(htmlDir);
      
      for (const folder of folders) {
        if (folder === '.gitkeep') continue;
        
        const folderPath = path.join(htmlDir, folder);
        const stats = await fs.stat(folderPath);
        
        if (stats.isDirectory() && (now - stats.mtimeMs) > maxAge) {
          await fs.remove(folderPath);
          console.log(`Cleaned up old HTML folder: ${folder}`);
        }
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  /**
   * Clean up specific conversion output
   * @param {string} htmlPath - Path to HTML file or directory
   */
  async cleanupSpecific(htmlPath) {
    try {
      const dir = path.dirname(htmlPath);
      if (dir.startsWith(this.tempHtmlDir)) {
        await fs.remove(dir);
        console.log(`Cleaned up HTML directory: ${dir}`);
      }
    } catch (error) {
      console.error('Specific cleanup error:', error);
    }
  }

  /**
   * Validate PDF file
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<boolean>} - True if valid PDF
   */
  async validatePdf(pdfPath) {
    try {
      // Check file exists
      if (!await fs.pathExists(pdfPath)) {
        return false;
      }

      // Check file extension
      if (!pdfPath.toLowerCase().endsWith('.pdf')) {
        return false;
      }

      // Check file header (PDF magic number)
      const buffer = Buffer.alloc(5);
      const fd = await fs.open(pdfPath, 'r');
      await fs.read(fd, buffer, 0, 5, 0);
      await fs.close(fd);
      
      const header = buffer.toString();
      return header === '%PDF-';
    } catch (error) {
      console.error('PDF validation error:', error);
      return false;
    }
  }
}

module.exports = new PdfToHtmlService();