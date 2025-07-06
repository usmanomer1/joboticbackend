/**
 * Resume Editor Routes with Supabase Integration
 * Dynamically parses resumes and persists to Supabase
 */

const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validators');
const { body } = require('express-validator');
const asyncHandler = require('../middleware/asyncHandler');
const resumeEditorService = require('../services/resumeEditorSupabase.service');
const { AppError } = require('../middleware/errorHandler');

// Validation schemas
const resumeEditorValidators = {
  parseForEdit: [
    body('userId')
      .isUUID()
      .withMessage('Valid user ID is required'),
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
      .isUUID()
      .withMessage('Valid session ID is required'),
    body('sectionId')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Section ID is required'),
    body('data')
      .isObject()
      .withMessage('Section data must be an object'),
    body('jobId')
      .optional()
      .isString()
      .trim()
      .withMessage('Job ID must be a string')
  ],
  finalize: [
    body('userId')
      .isUUID()
      .withMessage('Valid user ID is required'),
    body('format')
      .isString()
      .trim()
      .isIn(['pdf', 'docx'])
      .withMessage('Format must be pdf or docx')
  ],
  getResume: [
    body('userId')
      .isUUID()
      .withMessage('Valid user ID is required')
  ]
};

/**
 * @route   POST /api/resume-editor/parse-for-edit
 * @desc    Parse resume and create/update in Supabase with dynamic sections
 * @access  Private
 */
router.post('/parse-for-edit',
  validate(resumeEditorValidators.parseForEdit),
  asyncHandler(async (req, res) => {
    const { userId, resumeText, jobId } = req.body;
    
    console.log('Parsing resume for dynamic editing - userId:', userId);
    
    try {
      const result = await resumeEditorService.parseAndInitialize(userId, resumeText, jobId);
      
      res.json({
        success: true,
        data: {
          sessionId: result.sessionId,
          pdfUrl: result.pdfUrl,
          editSchema: result.editSchema,
          matchData: result.matchData
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
 * @desc    Update a specific section in Supabase and regenerate PDF
 * @access  Private
 */
router.post('/update-section',
  validate(resumeEditorValidators.updateSection),
  asyncHandler(async (req, res) => {
    const { sessionId, sectionId, data, jobId } = req.body;
    
    console.log(`Updating section ${sectionId} for session ${sessionId}`);
    
    try {
      const result = await resumeEditorService.updateSection(sessionId, sectionId, data, jobId);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      if (error.statusCode === 404) throw error;
      console.error('Update section error:', error);
      throw new AppError('Failed to update resume section', 500);
    }
  })
);

/**
 * @route   POST /api/resume-editor/get-resume
 * @desc    Get user's resume data from Supabase
 * @access  Private
 */
router.post('/get-resume',
  validate(resumeEditorValidators.getResume),
  asyncHandler(async (req, res) => {
    const { userId } = req.body;
    
    console.log('Getting resume data for user:', userId);
    
    try {
      const result = await resumeEditorService.getResumeData(userId);
      
      if (!result) {
        return res.json({
          success: true,
          data: null,
          message: 'No resume found for user'
        });
      }
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get resume error:', error);
      throw new AppError('Failed to get resume data', 500);
    }
  })
);

/**
 * @route   POST /api/resume-editor/add-section
 * @desc    Add a new custom section to the resume
 * @access  Private
 */
router.post('/add-section',
  asyncHandler(async (req, res) => {
    const { userId, sectionKey, sectionTitle, sectionType } = req.body;
    
    console.log(`Adding new section ${sectionKey} for user ${userId}`);
    
    try {
      const result = await resumeEditorService.addSection(userId, sectionKey, sectionTitle, sectionType);
      
      res.json({
        success: true,
        data: {
          pdfUrl: result.pdfUrl,
          schema: result.schema,
          sections: result.sections
        }
      });
    } catch (error) {
      console.error('Add section error:', error);
      throw new AppError('Failed to add section', 500);
    }
  })
);

/**
 * @route   POST /api/resume-editor/remove-section
 * @desc    Remove a section from the resume
 * @access  Private
 */
router.post('/remove-section',
  asyncHandler(async (req, res) => {
    const { userId, sectionId } = req.body;
    
    console.log(`Removing section ${sectionId} for user ${userId}`);
    
    try {
      const result = await resumeEditorService.removeSection(userId, sectionId);
      
      res.json({
        success: true,
        data: {
          pdfUrl: result.pdfUrl,
          removed: true
        }
      });
    } catch (error) {
      console.error('Remove section error:', error);
      throw new AppError('Failed to remove section', 500);
    }
  })
);

/**
 * @route   POST /api/resume-editor/reorder-sections
 * @desc    Reorder resume sections
 * @access  Private
 */
router.post('/reorder-sections',
  asyncHandler(async (req, res) => {
    const { userId, sectionOrder } = req.body;
    
    console.log('Reordering sections for user:', userId);
    
    try {
      const result = await resumeEditorService.reorderSections(userId, sectionOrder);
      
      res.json({
        success: true,
        data: {
          pdfUrl: result.pdfUrl,
          sections: result.sections
        }
      });
    } catch (error) {
      console.error('Reorder sections error:', error);
      throw new AppError('Failed to reorder sections', 500);
    }
  })
);

/**
 * @route   GET /api/resume-editor/section-templates
 * @desc    Get available section templates
 * @access  Private
 */
router.get('/section-templates',
  asyncHandler(async (req, res) => {
    const templates = {
      summary: {
        title: 'Professional Summary',
        type: 'paragraph',
        icon: 'FileText',
        description: 'A brief overview of your professional background'
      },
      experience: {
        title: 'Work Experience',
        type: 'experience',
        icon: 'Briefcase',
        description: 'Your employment history and achievements'
      },
      education: {
        title: 'Education',
        type: 'education',
        icon: 'GraduationCap',
        description: 'Your academic qualifications'
      },
      skills: {
        title: 'Skills',
        type: 'skills',
        icon: 'Award',
        description: 'Your technical and professional skills'
      },
      projects: {
        title: 'Projects',
        type: 'experience',
        icon: 'Code',
        description: 'Notable projects you have worked on'
      },
      certifications: {
        title: 'Certifications',
        type: 'list',
        icon: 'Certificate',
        description: 'Professional certifications and licenses'
      },
      publications: {
        title: 'Publications',
        type: 'list',
        icon: 'BookOpen',
        description: 'Articles, papers, or books you have published'
      },
      awards: {
        title: 'Awards & Achievements',
        type: 'list',
        icon: 'Trophy',
        description: 'Recognition and awards received'
      },
      languages: {
        title: 'Languages',
        type: 'list',
        icon: 'Globe',
        description: 'Languages you speak'
      },
      volunteer: {
        title: 'Volunteer Experience',
        type: 'experience',
        icon: 'Heart',
        description: 'Community service and volunteer work'
      }
    };
    
    res.json({
      success: true,
      data: templates
    });
  })
);

module.exports = router;