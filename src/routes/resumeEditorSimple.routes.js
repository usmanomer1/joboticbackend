/**
 * Simple Resume Editor Routes
 * Preserves format, only enhances content
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validators');
const { body } = require('express-validator');
const asyncHandler = require('../middleware/asyncHandler');
const resumeEditorService = require('../services/resumeEditorSimple.service');
const { AppError } = require('../middleware/errorHandler');

// Validation schemas
const validators = {
  parse: [
    body('resumeText')
      .isString()
      .trim()
      .isLength({ min: 100 })
      .withMessage('Resume text must be at least 100 characters'),
    body('jobDescription')
      .optional()
      .isString()
      .trim()
      .withMessage('Job description must be a string')
  ],
  update: [
    body('sessionId')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Session ID is required'),
    body('resumeText')
      .isString()
      .trim()
      .isLength({ min: 100 })
      .withMessage('Resume text must be at least 100 characters')
  ]
};

/**
 * @route   POST /api/resume-simple/parse
 * @desc    Parse resume and enhance content while preserving format
 * @access  Private
 */
router.post('/parse',
  validate(validators.parse),
  asyncHandler(async (req, res) => {
    const { resumeText, jobDescription, userId } = req.body;
    
    console.log('=== SIMPLE PARSE REQUEST ===');
    console.log('Resume length:', resumeText?.length);
    console.log('Has job description:', !!jobDescription);
    
    // Use provided userId or generate temporary one
    const userIdentifier = userId || `temp_${Date.now()}`;
    
    try {
      const result = await resumeEditorService.parseAndInitialize(
        userIdentifier, 
        resumeText, 
        jobDescription
      );
      
      res.json({
        success: true,
        data: {
          sessionId: result.sessionId,
          pdfUrl: result.pdfUrl,
          originalText: result.originalText,
          enhancedText: result.enhancedText,
          changes: result.changes
        }
      });
    } catch (error) {
      console.error('Parse error:', error);
      throw new AppError(`Failed to parse resume: ${error.message}`, 500);
    }
  })
);

/**
 * @route   POST /api/resume-simple/update
 * @desc    Update resume text and regenerate PDF
 * @access  Private
 */
router.post('/update',
  validate(validators.update),
  asyncHandler(async (req, res) => {
    const { sessionId, resumeText } = req.body;
    
    console.log('=== UPDATE REQUEST ===');
    console.log('Session:', sessionId);
    
    try {
      const result = await resumeEditorService.updateResume(sessionId, resumeText);
      
      res.json({
        success: true,
        data: {
          pdfUrl: result.pdfUrl,
          changes: result.changes
        }
      });
    } catch (error) {
      console.error('Update error:', error);
      throw error;
    }
  })
);

/**
 * @route   GET /api/resume-simple/session/:sessionId
 * @desc    Get resume data for a session
 * @access  Private
 */
router.get('/session/:sessionId',
  asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    
    try {
      const data = await resumeEditorService.getResumeData(sessionId);
      
      res.json({
        success: true,
        data: {
          originalText: data.original_text,
          enhancedText: data.enhanced_text,
          pdfUrl: data.pdf_url,
          jobDescription: data.job_description
        }
      });
    } catch (error) {
      console.error('Get session error:', error);
      throw error;
    }
  })
);

module.exports = router;