/**
 * Document download routes
 * @module routes/download
 */

const router = require('express').Router();
const documentGenerationService = require('../services/documentGeneration.service');
const { validate } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { aiLimiter, generalLimiter } = require('../middleware/rateLimiter');
const { body, param } = require('express-validator');

/**
 * Download route validators
 */
const downloadValidators = {
  /**
   * Validates document generation request
   */
  generateDocument: [
    body('resumeText')
      .trim()
      .notEmpty().withMessage('Resume text is required')
      .isLength({ min: 100 }).withMessage('Resume must be at least 100 characters')
      .isLength({ max: 50000 }).withMessage('Resume must not exceed 50000 characters'),
    
    body('format')
      .trim()
      .notEmpty().withMessage('Format is required')
      .isIn(['pdf', 'docx', 'PDF', 'DOCX']).withMessage('Format must be either pdf or docx')
      .customSanitizer(value => value.toLowerCase()),
    
    body('metadata')
      .optional()
      .isObject().withMessage('Metadata must be an object'),
    
    body('metadata.score')
      .optional()
      .isFloat({ min: 0, max: 10 }).withMessage('Score must be between 0 and 10'),
    
    body('metadata.jobTitle')
      .optional()
      .trim()
      .isLength({ max: 200 }).withMessage('Job title must not exceed 200 characters'),
    
    body('metadata.company')
      .optional()
      .trim()
      .isLength({ max: 200 }).withMessage('Company name must not exceed 200 characters'),
    
    body('metadata.improvements')
      .optional()
      .isArray().withMessage('Improvements must be an array')
      .custom(value => value.every(item => typeof item === 'string'))
      .withMessage('All improvements must be strings'),
    
    body('metadata.changes')
      .optional()
      .isObject().withMessage('Changes must be an object')
  ],

  /**
   * Validates file download request
   */
  downloadFile: [
    param('fileId')
      .trim()
      .notEmpty().withMessage('File ID is required')
      .isUUID().withMessage('Invalid file ID format')
  ]
};

/**
 * @route   POST /api/resume/download
 * @desc    Generate document and return download URL
 * @access  Public (rate limited)
 * @body    {
 *   resumeText: string (required),
 *   format: 'pdf' | 'docx' (required),
 *   metadata: {
 *     score: number,
 *     jobTitle: string,
 *     company: string,
 *     improvements: string[],
 *     changes: object
 *   }
 * }
 */
router.post('/resume/download',
  aiLimiter, // Apply AI rate limiter since this uses resources
  validate(downloadValidators.generateDocument),
  asyncHandler(async (req, res) => {
    const { resumeText, format, metadata = {} } = req.body;
    
    console.log(`Document generation requested: ${format.toUpperCase()}`);
    
    try {
      // Prepare data for document generation
      const documentData = {
        resumeText,
        score: metadata.score,
        jobTitle: metadata.jobTitle,
        company: metadata.company,
        improvements: metadata.improvements,
        changes: metadata.changes
      };
      
      // Generate document
      const fileInfo = await documentGenerationService.generateResume(documentData, format);
      
      // Return download information
      res.json({
        success: true,
        data: {
          fileId: fileInfo.fileId,
          filename: fileInfo.filename,
          format: fileInfo.format,
          size: fileInfo.size,
          downloadUrl: fileInfo.downloadUrl,
          expiresIn: fileInfo.expiresIn,
          expiresAt: fileInfo.expiresAt
        },
        message: `${format.toUpperCase()} document generated successfully`
      });
    } catch (error) {
      console.error('Document generation error:', error);
      throw error;
    }
  })
);

/**
 * @route   GET /api/download/:fileId
 * @desc    Download file by ID
 * @access  Public
 * @params  fileId: UUID of the file
 */
router.get('/:fileId',
  generalLimiter, // Apply general rate limiter
  validate(downloadValidators.downloadFile),
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    
    console.log(`File download requested: ${fileId}`);
    
    try {
      // Get file info
      const fileInfo = await documentGenerationService.getFileInfo(fileId);
      
      // Check if file has expired
      if (Date.now() > fileInfo.expiresAt) {
        // Try to delete expired file
        await documentGenerationService.deleteFile(fileId);
        throw new AppError('File has expired', 410);
      }
      
      // Read file buffer
      const buffer = await documentGenerationService.readFile(fileId);
      
      // Set appropriate headers
      res.set({
        'Content-Type': fileInfo.format === 'pdf' 
          ? 'application/pdf' 
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileInfo.filename}"`,
        'Content-Length': buffer.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      // Send file
      res.send(buffer);
      
      console.log(`File served successfully: ${fileId} (${fileInfo.filename})`);
    } catch (error) {
      console.error('File download error:', error);
      
      if (error.status === 404) {
        throw new AppError('File not found or has expired', 404);
      }
      
      throw error;
    }
  })
);

/**
 * @route   DELETE /api/download/:fileId
 * @desc    Delete file by ID (optional endpoint for manual cleanup)
 * @access  Public
 * @params  fileId: UUID of the file
 */
router.delete('/:fileId',
  generalLimiter,
  validate(downloadValidators.downloadFile),
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    
    console.log(`File deletion requested: ${fileId}`);
    
    try {
      const success = await documentGenerationService.deleteFile(fileId);
      
      if (!success) {
        throw new AppError('File not found or already deleted', 404);
      }
      
      res.json({
        success: true,
        message: 'File deleted successfully'
      });
    } catch (error) {
      console.error('File deletion error:', error);
      throw error;
    }
  })
);

/**
 * @route   GET /api/download/status/:fileId
 * @desc    Check file status without downloading
 * @access  Public
 * @params  fileId: UUID of the file
 */
router.get('/status/:fileId',
  generalLimiter,
  validate(downloadValidators.downloadFile),
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    
    try {
      const fileInfo = await documentGenerationService.getFileInfo(fileId);
      
      const now = Date.now();
      const isExpired = now > fileInfo.expiresAt;
      const remainingTime = Math.max(0, fileInfo.expiresAt - now);
      
      res.json({
        success: true,
        data: {
          fileId: fileInfo.fileId,
          filename: fileInfo.filename,
          format: fileInfo.format,
          size: fileInfo.size,
          createdAt: new Date(fileInfo.createdAt).toISOString(),
          expiresAt: new Date(fileInfo.expiresAt).toISOString(),
          isExpired,
          remainingTime: Math.floor(remainingTime / 1000), // seconds
          downloadUrl: isExpired ? null : `/api/download/${fileId}`
        }
      });
    } catch (error) {
      if (error.status === 404) {
        res.json({
          success: false,
          error: 'File not found',
          data: {
            fileId,
            isExpired: true,
            remainingTime: 0
          }
        });
        return;
      }
      
      throw error;
    }
  })
);

/**
 * @route   GET /api/download/cleanup/stats
 * @desc    Get cleanup statistics (admin endpoint)
 * @access  Public (should be protected in production)
 */
router.get('/cleanup/stats',
  asyncHandler(async (req, res) => {
    const stats = documentGenerationService.getStatistics();
    
    res.json({
      success: true,
      data: stats
    });
  })
);

/**
 * @route   POST /api/download/cleanup/run
 * @desc    Manually trigger cleanup (admin endpoint)
 * @access  Public (should be protected in production)
 */
router.post('/cleanup/run',
  asyncHandler(async (req, res) => {
    console.log('Manual cleanup triggered');
    
    const stats = await documentGenerationService.cleanupOldFiles();
    
    res.json({
      success: true,
      data: stats,
      message: `Cleanup completed: ${stats.deleted} files deleted`
    });
  })
);

module.exports = router;