/**
 * Resume Editor Routes
 * Real-time resume editing with PDF preview
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { validate } = require('../middleware/validators');
const { body } = require('express-validator');
const asyncHandler = require('../middleware/asyncHandler');
const resumeEditorService = require('../services/resumeEditor.service');
const { AppError } = require('../middleware/errorHandler');

// Validation schemas
const resumeEditorValidators = {
  parseForEdit: [
    body('resumeText')
      .isString()
      .trim()
      .isLength({ min: 100 })
      .withMessage('Resume text must be at least 100 characters'),
    body('jobId')
      .optional()
      .isString()
      .trim()
      .withMessage('Job ID must be a string')
  ],
  updateSection: [
    body('sessionId')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Session ID is required'),
    body('sectionId')
      .isString()
      .trim()
      .isIn(['personalInfo', 'summary', 'skills', 'experience', 'projects', 'education', 'certifications'])
      .withMessage('Invalid section ID'),
    body('data')
      .isObject()
      .withMessage('Section data must be an object')
  ],
  finalize: [
    body('sessionId')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Session ID is required'),
    body('format')
      .isString()
      .trim()
      .isIn(['pdf', 'docx'])
      .withMessage('Format must be pdf or docx')
  ]
};

/**
 * @route   POST /api/resume-editor/parse-for-edit
 * @desc    Parse resume and create editable schema with PDF preview
 * @access  Private
 */
router.post('/parse-for-edit',
  validate(resumeEditorValidators.parseForEdit),
  asyncHandler(async (req, res) => {
    const { resumeText, jobId } = req.body;
    
    console.log('Parsing resume for edit interface');
    
    // Create a new editing session
    const sessionId = uuidv4();
    
    try {
      // Parse resume and generate initial PDF
      const result = await resumeEditorService.parseAndInitialize(sessionId, resumeText, jobId);
      
      res.json({
        success: true,
        data: {
          sessionId,
          pdfUrl: `/api/resume-editor/preview/${sessionId}`,
          schema: result.schema,
          sections: result.sections
        }
      });
    } catch (error) {
      console.error('Parse for edit error:', error);
      throw new AppError('Failed to parse resume for editing', 500);
    }
  })
);

/**
 * @route   POST /api/resume-editor/update-section
 * @desc    Update a specific section and regenerate PDF
 * @access  Private
 */
router.post('/update-section',
  validate(resumeEditorValidators.updateSection),
  asyncHandler(async (req, res) => {
    const { sessionId, sectionId, data } = req.body;
    
    console.log(`Updating section ${sectionId} for session ${sessionId}`);
    
    try {
      // Update section and regenerate PDF
      const result = await resumeEditorService.updateSection(sessionId, sectionId, data);
      
      if (!result) {
        throw new AppError('Session not found or expired', 404);
      }
      
      res.json({
        success: true,
        data: {
          pdfUrl: `/api/resume-editor/preview/${sessionId}?v=${Date.now()}`,
          updated: true,
          sectionId
        }
      });
    } catch (error) {
      if (error.statusCode === 404) throw error;
      console.error('Update section error:', error);
      throw new AppError('Failed to update resume section', 500);
    }
  })
);

/**
 * @route   POST /api/resume-editor/finalize
 * @desc    Finalize resume and generate download link
 * @access  Private
 */
router.post('/finalize',
  validate(resumeEditorValidators.finalize),
  asyncHandler(async (req, res) => {
    const { sessionId, format } = req.body;
    
    console.log(`Finalizing resume for session ${sessionId} as ${format}`);
    
    try {
      // Generate final document
      const result = await resumeEditorService.finalizeResume(sessionId, format);
      
      if (!result) {
        throw new AppError('Session not found or expired', 404);
      }
      
      res.json({
        success: true,
        data: {
          downloadUrl: `/api/resume-editor/download/${result.fileId}`,
          filename: result.filename,
          format,
          expiresIn: 3600 // 1 hour
        }
      });
    } catch (error) {
      if (error.statusCode === 404) throw error;
      console.error('Finalize error:', error);
      throw new AppError('Failed to finalize resume', 500);
    }
  })
);

/**
 * @route   GET /api/resume-editor/preview/:sessionId
 * @desc    Get PDF preview for a session
 * @access  Private
 */
router.get('/preview/:sessionId',
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    try {
      const pdfBuffer = await resumeEditorService.getPreviewPdf(sessionId);
      
      if (!pdfBuffer) {
        throw new AppError('Preview not found', 404);
      }
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="resume-preview.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      if (error.statusCode === 404) throw error;
      console.error('Preview error:', error);
      throw new AppError('Failed to get preview', 500);
    }
  })
);

/**
 * @route   GET /api/resume-editor/download/:fileId
 * @desc    Download finalized resume
 * @access  Private
 */
router.get('/download/:fileId',
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    
    try {
      const file = await resumeEditorService.getDownloadFile(fileId);
      
      if (!file) {
        throw new AppError('File not found or expired', 404);
      }
      
      const contentType = file.format === 'pdf' 
        ? 'application/pdf' 
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.send(file.buffer);
    } catch (error) {
      if (error.statusCode === 404) throw error;
      console.error('Download error:', error);
      throw new AppError('Failed to download file', 500);
    }
  })
);

/**
 * @route   GET /api/resume-editor/schema
 * @desc    Get empty resume schema for new resumes
 * @access  Private
 */
router.get('/schema',
  asyncHandler(async (req, res) => {
    const schema = resumeEditorService.getEmptySchema();
    
    res.json({
      success: true,
      data: { schema }
    });
  })
);

module.exports = router;