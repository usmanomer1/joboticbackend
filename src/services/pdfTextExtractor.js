/**
 * PDF Text Extraction Service
 * Uses Puppeteer to extract text from PDFs without external dependencies
 */

const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');

class PDFTextExtractor {
  /**
   * Extract text from PDF using Puppeteer
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<string>} - Extracted text
   */
  async extractText(pdfPath) {
    let browser;
    
    try {
      // Read PDF file
      const pdfBuffer = await fs.readFile(pdfPath);
      const base64PDF = pdfBuffer.toString('base64');
      
      // Launch Puppeteer
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
      });
      
      const page = await browser.newPage();
      
      // Create HTML with embedded PDF
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>PDF Text Extraction</title>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js"></script>
        </head>
        <body>
          <div id="text-content"></div>
          <script>
            // Workaround for CORS
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
            
            const base64PDF = '${base64PDF}';
            const pdfData = atob(base64PDF);
            
            // Convert to Uint8Array
            const pdfArray = new Uint8Array(pdfData.length);
            for (let i = 0; i < pdfData.length; i++) {
              pdfArray[i] = pdfData.charCodeAt(i);
            }
            
            // Load PDF
            pdfjsLib.getDocument({data: pdfArray}).promise.then(async (pdf) => {
              let fullText = '';
              
              // Extract text from each page
              for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\\n\\n';
              }
              
              // Set text content
              document.getElementById('text-content').textContent = fullText;
              
              // Signal completion
              window.pdfTextExtracted = true;
            }).catch(error => {
              console.error('PDF extraction error:', error);
              document.getElementById('text-content').textContent = 'ERROR: ' + error.message;
              window.pdfTextExtracted = true;
            });
          </script>
        </body>
        </html>
      `;
      
      // Set content
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      // Wait for PDF processing with timeout
      await page.waitForFunction(
        () => window.pdfTextExtracted === true,
        { timeout: 30000 }
      );
      
      // Extract text
      const extractedText = await page.$eval('#text-content', el => el.textContent);
      
      await browser.close();
      
      if (extractedText.startsWith('ERROR:')) {
        throw new Error(extractedText);
      }
      
      return extractedText || '';
      
    } catch (error) {
      if (browser) {
        await browser.close();
      }
      console.error('PDF text extraction error:', error);
      
      // Return a basic fallback
      return `[PDF Text Extraction Failed]
      
Unable to extract text from PDF.
File: ${path.basename(pdfPath)}
Error: ${error.message}

This may be due to:
- Corrupted PDF file
- Password-protected PDF
- Scanned PDF without text layer
- PDF with complex formatting

Please try uploading a different PDF or contact support.`;
    }
  }
  
  /**
   * Parse resume structure from extracted text
   * @param {string} text - Extracted text
   * @returns {Object} - Parsed resume structure
   */
  parseResumeStructure(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    
    const structure = {
      personalInfo: {},
      sections: [],
      rawText: text
    };
    
    // Try to identify sections
    const sectionHeaders = [
      'EXPERIENCE', 'WORK EXPERIENCE', 'EMPLOYMENT',
      'EDUCATION', 'ACADEMIC',
      'SKILLS', 'TECHNICAL SKILLS', 'COMPETENCIES',
      'PROJECTS', 'PORTFOLIO',
      'SUMMARY', 'OBJECTIVE', 'PROFILE'
    ];
    
    let currentSection = null;
    let currentItems = [];
    
    lines.forEach((line, index) => {
      const upperLine = line.toUpperCase();
      
      // Check if it's a section header
      const isHeader = sectionHeaders.some(header => 
        upperLine.includes(header) && line.length < 50
      );
      
      if (isHeader) {
        // Save previous section
        if (currentSection) {
          structure.sections.push({
            type: currentSection.toLowerCase().replace(/\s+/g, '_'),
            title: currentSection,
            items: currentItems.map(text => ({ text, type: 'text' }))
          });
        }
        
        currentSection = line;
        currentItems = [];
      } else if (currentSection) {
        currentItems.push(line);
      } else if (index < 5 && !structure.personalInfo.name) {
        // First few lines might be personal info
        if (line.length < 50 && /^[A-Z]/.test(line)) {
          structure.personalInfo.name = line;
        }
      }
    });
    
    // Save last section
    if (currentSection) {
      structure.sections.push({
        type: currentSection.toLowerCase().replace(/\s+/g, '_'),
        title: currentSection,
        items: currentItems.map(text => ({ text, type: 'text' }))
      });
    }
    
    return structure;
  }
}

module.exports = new PDFTextExtractor();