/**
 * PDF generation utility using PDFKit
 * @module utils/pdfGenerator
 */

const PDFDocument = require('pdfkit');
const { AppError } = require('../middleware/errorHandler');

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

    console.log('Generating PDF for resume with PDFKit');
    console.log(`Score: ${resumeData.score}, Optimized for: ${resumeData.optimizedFor}`);

    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50
        }
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));

      // Add content to PDF
      this.addContent(doc, resumeData, metadata);
      
      doc.end();

      return new Promise((resolve, reject) => {
        doc.on('end', () => {
          try {
            const pdfBuffer = Buffer.concat(buffers);
            console.log('PDF generated successfully with PDFKit');
            resolve(pdfBuffer);
          } catch (error) {
            reject(error);
          }
        });
        
        doc.on('error', reject);
      });
    } catch (error) {
      console.error('PDF generation failed:', error);
      throw new AppError('Failed to generate PDF', 500, {
        originalError: error.message
      });
    }
  }

  /**
   * Add content to PDF document
   * @param {PDFDocument} doc - PDF document instance
   * @param {Object} resumeData - Resume data
   * @param {Object} metadata - Metadata
   */
  addContent(doc, resumeData, metadata) {
    const {
      text,
      score = 0,
      optimizedFor = 'General Position'
    } = resumeData;

    const {
      jobTitle = optimizedFor,
      company = '',
      improvements = []
    } = metadata;

    const pageWidth = doc.page.width - 100; // Account for margins

    // Header Section
    this.addHeader(doc, score, jobTitle, company, pageWidth);

    // Improvements Section (if any)
    if (improvements.length > 0) {
      this.addImprovements(doc, improvements);
    }

    // Resume Content
    this.addResumeContent(doc, text);

    // Footer
    this.addFooter(doc);
  }

  /**
   * Add header with title and score badge
   * @param {PDFDocument} doc - PDF document
   * @param {number} score - Match score
   * @param {string} jobTitle - Job title
   * @param {string} company - Company name
   * @param {number} pageWidth - Available page width
   */
  addHeader(doc, score, jobTitle, company, pageWidth) {
    // Title
    doc.fontSize(24)
       .fillColor('#2c3e50')
       .font('Helvetica-Bold')
       .text('Optimized Resume', 50, 50);

    // Score badge (right aligned)
    if (score > 0) {
      const scoreText = `Score: ${score}/10`;
      const scoreColor = this.getScoreColor(score);
      const scoreWidth = doc.widthOfString(scoreText, { fontSize: 16 });
      
      doc.fontSize(16)
         .fillColor(scoreColor)
         .font('Helvetica-Bold')
         .text(scoreText, pageWidth - scoreWidth + 50, 55);
    }

    // Optimized for subtitle
    doc.moveDown(1);
    const optimizedText = `Optimized for: ${jobTitle}${company ? ` at ${company}` : ''}`;
    doc.fontSize(14)
       .fillColor('#555555')
       .font('Helvetica')
       .text(optimizedText, 50);

    // Separator line
    doc.moveDown(0.5);
    doc.strokeColor('#2c3e50')
       .lineWidth(2)
       .moveTo(50, doc.y)
       .lineTo(pageWidth + 50, doc.y)
       .stroke();

    doc.moveDown(1);
  }

  /**
   * Add improvements section
   * @param {PDFDocument} doc - PDF document
   * @param {Array} improvements - List of improvements
   */
  addImprovements(doc, improvements) {
    // Section title
    doc.fontSize(16)
       .fillColor('#27ae60')
       .font('Helvetica-Bold')
       .text('Optimizations Applied', 50);

    doc.moveDown(0.5);

    // Add improvements as bullet points
    improvements.slice(0, 5).forEach((improvement, index) => {
      doc.fontSize(11)
         .fillColor('#333333')
         .font('Helvetica')
         .text('✓', 60, doc.y, { continued: true })
         .text(` ${improvement}`, 75);
      
      if (index < improvements.length - 1) {
        doc.moveDown(0.3);
      }
    });

    doc.moveDown(1);
  }

  /**
   * Add resume content with proper formatting
   * @param {PDFDocument} doc - PDF document
   * @param {string} text - Resume text
   */
  addResumeContent(doc, text) {
    // Parse and format resume sections
    const sections = this.parseResumeSections(text);
    
    sections.forEach((section, index) => {
      if (section.isHeader) {
        // Section headers
        doc.fontSize(14)
           .fillColor('#2c3e50')
           .font('Helvetica-Bold')
           .text(section.content, 50);
        doc.moveDown(0.5);
      } else if (section.isSubHeader) {
        // Sub headers (job titles, companies, etc.)
        doc.fontSize(12)
           .fillColor('#34495e')
           .font('Helvetica-Bold')
           .text(section.content, 50);
        doc.moveDown(0.3);
      } else {
        // Regular content
        doc.fontSize(11)
           .fillColor('#333333')
           .font('Helvetica')
           .text(section.content, 50, doc.y, {
             align: 'left',
             width: doc.page.width - 100
           });
        doc.moveDown(0.4);
      }

      // Add page break if content is getting too long
      if (doc.y > doc.page.height - 100) {
        doc.addPage();
      }
    });
  }

  /**
   * Parse resume text into sections
   * @param {string} text - Resume text
   * @returns {Array} Parsed sections
   */
  parseResumeSections(text) {
    const lines = text.split('\n');
    const sections = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Detect section headers (all caps or common section names)
      if (this.isSectionHeader(trimmed)) {
        sections.push({ content: trimmed, isHeader: true });
      }
      // Detect sub-headers (job titles, company names)
      else if (this.isSubHeader(trimmed)) {
        sections.push({ content: trimmed, isSubHeader: true });
      }
      // Regular content
      else {
        sections.push({ content: trimmed, isHeader: false, isSubHeader: false });
      }
    });

    return sections;
  }

  /**
   * Check if line is a section header
   * @param {string} line - Text line
   * @returns {boolean} True if section header
   */
  isSectionHeader(line) {
    const commonHeaders = [
      'PROFESSIONAL SUMMARY', 'SUMMARY', 'OBJECTIVE',
      'EXPERIENCE', 'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE',
      'EDUCATION', 'SKILLS', 'TECHNICAL SKILLS', 'CORE COMPETENCIES',
      'CERTIFICATIONS', 'PROJECTS', 'ACHIEVEMENTS', 'AWARDS',
      'LANGUAGES', 'INTERESTS', 'REFERENCES', 'CONTACT'
    ];
    
    const upperLine = line.toUpperCase();
    
    // Check if it's all uppercase and longer than 3 chars
    if (line === upperLine && line.length > 3) {
      return true;
    }
    
    // Check against common headers
    return commonHeaders.some(header => upperLine.includes(header));
  }

  /**
   * Check if line is a sub-header
   * @param {string} line - Text line
   * @returns {boolean} True if sub-header
   */
  isSubHeader(line) {
    // Look for patterns like job titles or company names
    // Usually have dates, company names, or are in title case
    const hasDate = /\d{4}|\d{1,2}\/\d{4}|present|current/i.test(line);
    const titleCase = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/.test(line);
    const hasAtSymbol = line.includes(' at ') || line.includes(' @ ');
    
    return hasDate || (titleCase && line.length < 60) || hasAtSymbol;
  }

  /**
   * Add footer to document
   * @param {PDFDocument} doc - PDF document
   */
  addFooter(doc) {
    const footerY = doc.page.height - 50;
    const generationDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    doc.fontSize(9)
       .fillColor('#777777')
       .font('Helvetica')
       .text(`Generated on ${generationDate} | AI-Enhanced Resume`, 50, footerY, {
         align: 'center',
         width: doc.page.width - 100
       });
  }

  /**
   * Get color for score badge
   * @param {number} score - Score value
   * @returns {string} Color value
   */
  getScoreColor(score) {
    if (score >= 8) return '#27ae60'; // Green
    if (score >= 6) return '#3498db'; // Blue
    if (score >= 4) return '#f39c12'; // Orange
    return '#e74c3c'; // Red
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