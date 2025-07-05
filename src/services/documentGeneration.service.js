/**
 * Document generation service for creating PDFs and DOCX files
 * @module services/documentGeneration
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pdfGenerator = require('../utils/pdfGenerator');
const atsOptimizedPdfGenerator = require('../utils/atsOptimizedPdfGenerator');
const atsOptimizedDocxGenerator = require('../utils/atsOptimizedDocxGenerator');
const { AppError } = require('../middleware/errorHandler');
const cache = require('../utils/cache');

// Document generation configuration
const DOC_CONFIG = {
  TEMP_DIR: process.env.VERCEL ? '/tmp' : path.join(process.cwd(), 'temp', 'documents'),
  FILE_TTL: 3600000, // 1 hour in milliseconds
  CLEANUP_INTERVAL: 900000, // 15 minutes
  MAX_FILE_SIZE: 10485760, // 10MB
  ALLOWED_FORMATS: ['pdf', 'docx']
};

/**
 * Document Generation Service class
 */
class DocumentGenerationService {
  constructor() {
    // Ensure temp directory exists
    this.initializeTempDirectory();
    
    // Start cleanup job (only in non-serverless environments)
    if (!process.env.VERCEL) {
      this.startCleanupJob();
    }
  }

  /**
   * Initialize temporary directory
   */
  async initializeTempDirectory() {
    try {
      if (!process.env.VERCEL) {
        // Only create directory in non-serverless environments
        await fs.mkdir(DOC_CONFIG.TEMP_DIR, { recursive: true });
      }
      console.log('Temporary directory ready:', DOC_CONFIG.TEMP_DIR);
    } catch (error) {
      console.error('Failed to initialize temp directory:', error);
      // In Vercel, /tmp always exists, so this shouldn't fail
    }
  }

  /**
   * Generate resume document in specified format
   * @param {Object} data - Resume data and metadata
   * @param {string} data.resumeText - Resume content
   * @param {number} data.score - Match score
   * @param {string} data.jobTitle - Job title
   * @param {string} data.company - Company name
   * @param {Object} data.changes - Changes made during optimization
   * @param {string} format - Output format (pdf or docx)
   * @returns {Promise<Object>} File info with download URL
   */
  async generateResume(data, format = 'pdf') {
    // Validate format
    if (!DOC_CONFIG.ALLOWED_FORMATS.includes(format.toLowerCase())) {
      throw new AppError(`Invalid format. Allowed formats: ${DOC_CONFIG.ALLOWED_FORMATS.join(', ')}`, 400);
    }

    // Validate data
    if (!data || !data.resumeText) {
      throw new AppError('Resume text is required for document generation', 400);
    }

    console.log(`Generating ${format.toUpperCase()} document for resume`);

    try {
      let buffer;
      
      // Generate document based on format using ATS-optimized generators
      if (format.toLowerCase() === 'pdf') {
        buffer = await this.generateATSOptimizedPDF(data);
      } else if (format.toLowerCase() === 'docx') {
        buffer = await this.generateATSOptimizedDOCX(data);
      }

      // Create filename
      const filename = this.createFilename(data, format);

      // Create temporary URL
      const fileInfo = await this.createTemporaryUrl(buffer, filename, format);

      return fileInfo;
    } catch (error) {
      console.error('Document generation error:', {
        message: error.message,
        stack: error.stack,
        format,
        tempDir: DOC_CONFIG.TEMP_DIR,
        isVercel: !!process.env.VERCEL
      });
      throw new AppError('Failed to generate document', 500, {
        originalError: error.message,
        format,
        environment: process.env.VERCEL ? 'vercel' : 'local'
      });
    }
  }

  /**
   * Generate ATS-optimized PDF document
   * @param {Object} data - Resume data
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateATSOptimizedPDF(data) {
    const resumeData = {
      text: data.resumeText,
      score: data.score || 0,
      optimizedFor: data.jobTitle || 'General Position'
    };

    const metadata = {
      jobTitle: data.jobTitle,
      company: data.company,
      improvements: data.improvements || [],
      changes: data.changes || {}
    };

    console.log('Generating ATS-optimized PDF with enhanced formatting and professional styling');
    return await atsOptimizedPdfGenerator.generatePDF(resumeData, metadata);
  }

  /**
   * Generate ATS-optimized DOCX document  
   * @param {Object} data - Resume data
   * @returns {Promise<Buffer>} DOCX buffer
   */
  async generateATSOptimizedDOCX(data) {
    const resumeData = {
      text: data.resumeText,
      score: data.score || 0,
      optimizedFor: data.jobTitle || 'General Position'
    };

    const metadata = {
      jobTitle: data.jobTitle,
      company: data.company,
      improvements: data.improvements || [],
      changes: data.changes || {}
    };

    console.log('Generating ATS-optimized DOCX with professional styling and structure');
    return await atsOptimizedDocxGenerator.generateDOCX(resumeData, metadata);
  }

  /**
   * Generate PDF document (legacy method)
   * @param {Object} data - Resume data
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generatePDF(data) {
    const resumeData = {
      text: data.resumeText,
      score: data.score || 0,
      optimizedFor: data.jobTitle || 'General Position'
    };

    const metadata = {
      jobTitle: data.jobTitle,
      company: data.company,
      improvements: data.improvements || [],
      changes: data.changes || {}
    };

    return await pdfGenerator.generatePDF(resumeData, metadata);
  }

  /**
   * Generate DOCX document
   * @param {Object} data - Resume data
   * @returns {Promise<Buffer>} DOCX buffer
   */
  async generateDOCX(data) {
    // For now, we'll create a simple DOCX implementation
    // In production, you'd use a library like docx
    const docx = require('docx');
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = docx;

    // Create document
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // Header
          new Paragraph({
            children: [
              new TextRun({
                text: "Optimized Resume",
                bold: true,
                size: 32
              })
            ],
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          }),

          // Score and optimization info
          new Paragraph({
            children: [
              new TextRun({
                text: `Match Score: ${data.score || 0}/10`,
                bold: true,
                size: 24,
                color: this.getScoreColor(data.score || 0)
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
          }),

          new Paragraph({
            children: [
              new TextRun({
                text: `Optimized for: ${data.jobTitle || 'General Position'}`,
                size: 20,
                italics: true
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
          }),

          // Company info if available
          ...(data.company ? [
            new Paragraph({
              children: [
                new TextRun({
                  text: `Target Company: ${data.company}`,
                  size: 20
                })
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 }
            })
          ] : []),

          // Improvements section if available
          ...(data.improvements && data.improvements.length > 0 ? [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Optimizations Applied:",
                  bold: true,
                  size: 24
                })
              ],
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 }
            }),
            ...data.improvements.slice(0, 5).map(improvement => 
              new Paragraph({
                children: [
                  new TextRun({
                    text: `• ${improvement}`,
                    size: 20
                  })
                ],
                spacing: { after: 100 },
                indent: { left: 360 }
              })
            ),
            new Paragraph({
              text: "",
              spacing: { after: 400 }
            })
          ] : []),

          // Resume content
          new Paragraph({
            children: [
              new TextRun({
                text: "Resume Content",
                bold: true,
                size: 24
              })
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
            border: {
              bottom: {
                color: "000000",
                space: 1,
                style: BorderStyle.SINGLE,
                size: 6
              }
            }
          }),

          // Parse and add resume content
          ...this.parseResumeContent(data.resumeText),

          // Footer
          new Paragraph({
            text: "",
            spacing: { before: 800 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Generated on ${new Date().toLocaleDateString()} | AI-Powered Resume Optimization`,
                size: 18,
                italics: true,
                color: "666666"
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200 }
          })
        ]
      }]
    });

    // Generate buffer
    const buffer = await docx.Packer.toBuffer(doc);
    return buffer;
  }

  /**
   * Parse resume content into DOCX paragraphs
   * @param {string} text - Resume text
   * @returns {Array} Array of Paragraph objects
   */
  parseResumeContent(text) {
    const docx = require('docx');
    const { Paragraph, TextRun } = docx;
    
    // Split by double newlines for paragraphs
    const paragraphs = text.split(/\n\n+/);
    
    return paragraphs.map(para => {
      // Check if it's a heading (all caps or ends with colon)
      const isHeading = para.trim().match(/^[A-Z\s]+$/) || para.trim().endsWith(':');
      
      return new Paragraph({
        children: [
          new TextRun({
            text: para.trim(),
            bold: isHeading,
            size: isHeading ? 24 : 22
          })
        ],
        spacing: { after: isHeading ? 200 : 150 }
      });
    });
  }

  /**
   * Create temporary URL for file download
   * @param {Buffer} buffer - File buffer
   * @param {string} filename - Original filename
   * @param {string} format - File format
   * @returns {Promise<Object>} File info with URL
   */
  async createTemporaryUrl(buffer, filename, format) {
    try {
      // Generate unique file ID
      const fileId = uuidv4();
      const timestamp = Date.now();
      
      // Create file path
      const filePath = path.join(DOC_CONFIG.TEMP_DIR, `${fileId}.${format}`);
      
      // Write file to disk
      await fs.writeFile(filePath, buffer);
      
      // Store file metadata in cache
      const fileMetadata = {
        fileId,
        filename,
        format,
        path: filePath,
        size: buffer.length,
        createdAt: timestamp,
        expiresAt: timestamp + DOC_CONFIG.FILE_TTL
      };
      
      // Cache metadata for quick retrieval
      cache.set(`file:${fileId}`, fileMetadata, DOC_CONFIG.FILE_TTL / 1000);
      
      console.log(`Temporary file created: ${fileId} (${filename})`);
      
      return {
        fileId,
        filename,
        format,
        size: buffer.length,
        downloadUrl: `/api/download/${fileId}`,
        expiresIn: DOC_CONFIG.FILE_TTL / 1000, // seconds
        expiresAt: new Date(fileMetadata.expiresAt).toISOString()
      };
    } catch (error) {
      console.error('Failed to create temporary file:', error);
      throw new AppError('Failed to create download link', 500);
    }
  }

  /**
   * Get file info by ID
   * @param {string} fileId - File ID
   * @returns {Promise<Object>} File metadata
   */
  async getFileInfo(fileId) {
    // Check cache first
    const cachedInfo = cache.get(`file:${fileId}`);
    if (cachedInfo) {
      return cachedInfo;
    }
    
    // If not in cache, file doesn't exist or has expired
    throw new AppError('File not found or has expired', 404);
  }

  /**
   * Read file buffer by ID
   * @param {string} fileId - File ID
   * @returns {Promise<Buffer>} File buffer
   */
  async readFile(fileId) {
    const fileInfo = await this.getFileInfo(fileId);
    
    try {
      const buffer = await fs.readFile(fileInfo.path);
      return buffer;
    } catch (error) {
      console.error('Failed to read file:', error);
      throw new AppError('Failed to read file', 500);
    }
  }

  /**
   * Delete file by ID
   * @param {string} fileId - File ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteFile(fileId) {
    try {
      const fileInfo = await this.getFileInfo(fileId);
      
      // Delete file from disk
      await fs.unlink(fileInfo.path);
      
      // Remove from cache
      cache.del(`file:${fileId}`);
      
      console.log(`File deleted: ${fileId}`);
      return true;
    } catch (error) {
      console.error('Failed to delete file:', error);
      return false;
    }
  }

  /**
   * Clean up old files
   * @returns {Promise<Object>} Cleanup statistics
   */
  async cleanupOldFiles() {
    console.log('Starting file cleanup...');
    
    const stats = {
      checked: 0,
      deleted: 0,
      errors: 0,
      startTime: Date.now()
    };
    
    try {
      // Read all files in temp directory
      const files = await fs.readdir(DOC_CONFIG.TEMP_DIR);
      stats.checked = files.length;
      
      const now = Date.now();
      
      // Check each file
      for (const file of files) {
        try {
          const filePath = path.join(DOC_CONFIG.TEMP_DIR, file);
          const fileStat = await fs.stat(filePath);
          
          // Check if file is older than TTL
          const fileAge = now - fileStat.mtimeMs;
          if (fileAge > DOC_CONFIG.FILE_TTL) {
            await fs.unlink(filePath);
            stats.deleted++;
            console.log(`Deleted expired file: ${file}`);
          }
        } catch (error) {
          console.error(`Error processing file ${file}:`, error);
          stats.errors++;
        }
      }
      
      stats.duration = Date.now() - stats.startTime;
      console.log(`Cleanup completed: ${stats.deleted} files deleted in ${stats.duration}ms`);
      
      return stats;
    } catch (error) {
      console.error('Cleanup error:', error);
      stats.error = error.message;
      return stats;
    }
  }

  /**
   * Start automatic cleanup job
   */
  startCleanupJob() {
    // Run cleanup immediately on startup
    this.cleanupOldFiles().catch(console.error);
    
    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldFiles().catch(console.error);
    }, DOC_CONFIG.CLEANUP_INTERVAL);
    
    console.log(`File cleanup job scheduled every ${DOC_CONFIG.CLEANUP_INTERVAL / 60000} minutes`);
  }

  /**
   * Stop cleanup job
   */
  stopCleanupJob() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      console.log('File cleanup job stopped');
    }
  }

  /**
   * Create filename for document
   * @param {Object} data - Resume data
   * @param {string} format - File format
   * @returns {string} Filename
   */
  createFilename(data, format) {
    const parts = ['resume'];
    
    if (data.jobTitle) {
      const sanitizedTitle = data.jobTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .substring(0, 30);
      parts.push(sanitizedTitle);
    }
    
    if (data.company) {
      const sanitizedCompany = data.company
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .substring(0, 20);
      parts.push(sanitizedCompany);
    }
    
    // Add date
    const date = new Date().toISOString().split('T')[0];
    parts.push(date);
    
    return `${parts.join('_')}.${format}`;
  }

  /**
   * Get score color for DOCX
   * @param {number} score - Score value
   * @returns {string} Hex color without #
   */
  getScoreColor(score) {
    if (score >= 8) return "27ae60"; // Green
    if (score >= 6) return "3498db"; // Blue
    if (score >= 4) return "f39c12"; // Orange
    return "e74c3c"; // Red
  }

  /**
   * Get cleanup statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      tempDirectory: DOC_CONFIG.TEMP_DIR,
      fileTTL: DOC_CONFIG.FILE_TTL,
      cleanupInterval: DOC_CONFIG.CLEANUP_INTERVAL,
      maxFileSize: DOC_CONFIG.MAX_FILE_SIZE,
      allowedFormats: DOC_CONFIG.ALLOWED_FORMATS
    };
  }
}

// Export singleton instance
module.exports = new DocumentGenerationService();