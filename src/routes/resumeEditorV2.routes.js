/**
 * Resume Editor V2 Routes
 * Edit interface with preview and form fields
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validators');
const { body } = require('express-validator');
const asyncHandler = require('../middleware/asyncHandler');
const resumeEditorService = require('../services/resumeEditorV2.service');
const { AppError } = require('../middleware/errorHandler');

// Validation schemas
const validators = {
  parseForEdit: [
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
  updateField: [
    body('sessionId').isString().notEmpty(),
    body('sectionId').isString().notEmpty(),
    body('itemId').optional().isString(),
    body('fieldId').isString().notEmpty(),
    body('newValue').exists()
  ]
};

/**
 * @route   POST /api/resume-editor-v2/parse-for-edit
 * @desc    Parse resume and create edit interface data
 * @access  Private
 */
router.post('/parse-for-edit',
  validate(validators.parseForEdit),
  asyncHandler(async (req, res) => {
    const { resumeText, jobDescription, userId } = req.body;
    
    console.log('=== PARSE FOR EDIT V2 ===');
    console.log('Creating edit interface...');
    
    const userIdentifier = userId || `temp_${Date.now()}`;
    
    try {
      const result = await resumeEditorService.parseForEdit(
        userIdentifier,
        resumeText,
        jobDescription
      );
      
      res.json({
        success: true,
        data: {
          sessionId: result.sessionId,
          pdfUrl: result.pdfUrl,
          editSchema: result.editSchema,
          sections: result.sections
        }
      });
    } catch (error) {
      console.error('Parse error:', error);
      throw new AppError(`Failed to parse resume: ${error.message}`, 500);
    }
  })
);

/**
 * @route   POST /api/resume-editor-v2/update-field
 * @desc    Update a specific field and regenerate PDF
 * @access  Private
 */
router.post('/update-field',
  validate(validators.updateField),
  asyncHandler(async (req, res) => {
    const { sessionId, sectionId, itemId, fieldId, newValue } = req.body;
    
    console.log('=== UPDATE FIELD ===');
    console.log(`Section: ${sectionId}, Field: ${fieldId}`);
    
    try {
      const result = await resumeEditorService.updateField(
        sessionId,
        sectionId,
        itemId,
        fieldId,
        newValue
      );
      
      res.json({
        success: true,
        data: {
          pdfUrl: result.pdfUrl,
          updatedText: result.updatedText
        }
      });
    } catch (error) {
      console.error('Update error:', error);
      throw error;
    }
  })
);

/**
 * @route   GET /api/resume-editor-v2/session/:sessionId
 * @desc    Get resume session data
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
          editSchema: data.edit_schema,
          currentText: data.current_text,
          pdfUrl: data.pdf_url,
          sections: data.sections
        }
      });
    } catch (error) {
      console.error('Get session error:', error);
      throw error;
    }
  })
);

module.exports = router;