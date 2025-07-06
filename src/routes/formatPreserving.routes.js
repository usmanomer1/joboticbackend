/**
 * Format-Preserving Resume Editor Routes
 * Maintains exact resume format while editing
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validators');
const { body } = require('express-validator');
const asyncHandler = require('../middleware/asyncHandler');
const formatPreservingEditor = require('../services/formatPreservingEditor.service');
const { AppError } = require('../middleware/errorHandler');

// Validators
const validators = {
  process: [
    body('resumeText').isString().trim().isLength({ min: 100 }),
    body('jobDescription').optional().isString().trim()
  ],
  update: [
    body('sessionId').isString().notEmpty(),
    body('updates').isArray().notEmpty(),
    body('updates.*.startPos').isInt({ min: 0 }),
    body('updates.*.endPos').isInt({ min: 0 }),
    body('updates.*.newContent').isString()
  ]
};

/**
 * @route   POST /api/format-preserving/process
 * @desc    Process resume preserving exact format
 * @access  Private
 */
router.post('/process',
  validate(validators.process),
  asyncHandler(async (req, res) => {
    const { resumeText, jobDescription, userId } = req.body;
    
    console.log('=== FORMAT PRESERVING PROCESS ===');
    console.log('Resume length:', resumeText?.length);
    console.log('Has job description:', !!jobDescription);
    
    const userIdentifier = userId || `temp_${Date.now()}`;
    
    try {
      const result = await formatPreservingEditor.processResume(
        userIdentifier,
        resumeText,
        jobDescription
      );
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Process error:', error);
      throw new AppError(`Failed to process resume: ${error.message}`, 500);
    }
  })
);

/**
 * @route   POST /api/format-preserving/update
 * @desc    Update specific content while preserving format
 * @access  Private
 */
router.post('/update',
  validate(validators.update),
  asyncHandler(async (req, res) => {
    const { sessionId, updates } = req.body;
    
    console.log('=== FORMAT PRESERVING UPDATE ===');
    console.log('Session:', sessionId);
    console.log('Updates count:', updates.length);
    
    try {
      const result = await formatPreservingEditor.updateContent(sessionId, updates);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Update error:', error);
      throw error;
    }
  })
);

module.exports = router;