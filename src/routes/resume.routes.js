/**
 * Resume analysis and optimization routes
 * @module routes/resume
 */

const router = require('express').Router();
const resumeAnalysisService = require('../services/resumeAnalysis.service');
const resumeOptimizationService = require('../services/resumeOptimization.service');
const jobSearchService = require('../services/jobSearch.service');
const documentGenerationService = require('../services/documentGeneration.service');
const { validate, validators } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { aiLimiter, generalLimiter } = require('../middleware/rateLimiter');
const { body, param } = require('express-validator');
const cache = require('../utils/cache');

/**
 * Custom validators for resume routes
 */
const resumeValidators = {
  /**
   * Validates resume analysis request
   */
  resumeAnalysis: [
    body('resumeText')
      .trim()
      .notEmpty().withMessage('Resume text is required')
      .isLength({ min: 100 }).withMessage('Resume must be at least 100 characters')
      .isLength({ max: 50000 }).withMessage('Resume must not exceed 50000 characters'),
    
    body('jobId')
      .trim()
      .notEmpty().withMessage('Job ID is required')
      .isLength({ min: 1 }).withMessage('Job ID cannot be empty'),
    
    body('jobDescription')
      .trim()
      .notEmpty().withMessage('Job description is required')
      .isLength({ min: 50 }).withMessage('Job description must be at least 50 characters')
      .isLength({ max: 10000 }).withMessage('Job description must not exceed 10000 characters'),
    
    body('jobTitle')
      .optional()
      .trim()
      .isLength({ max: 200 }).withMessage('Job title must not exceed 200 characters'),
    
    body('employerName')
      .optional()
      .trim()
      .isLength({ max: 200 }).withMessage('Employer name must not exceed 200 characters')
  ],

  /**
   * Validates resume optimization request
   */
  resumeOptimization: [
    body('resumeText')
      .trim()
      .notEmpty().withMessage('Resume text is required')
      .isLength({ min: 100 }).withMessage('Resume must be at least 100 characters')
      .isLength({ max: 50000 }).withMessage('Resume must not exceed 50000 characters'),
    
    body('jobData')
      .notEmpty().withMessage('Job data is required')
      .isObject().withMessage('Job data must be an object'),
    
    body('jobData.job_title')
      .trim()
      .notEmpty().withMessage('Job title is required')
      .isLength({ max: 200 }).withMessage('Job title must not exceed 200 characters'),
    
    body('jobData.job_description')
      .trim()
      .notEmpty().withMessage('Job description is required')
      .isLength({ min: 50 }).withMessage('Job description must be at least 50 characters')
      .isLength({ max: 10000 }).withMessage('Job description must not exceed 10000 characters'),
    
    body('jobData.employer_name')
      .optional()
      .trim()
      .isLength({ max: 200 }).withMessage('Employer name must not exceed 200 characters'),
    
    body('options')
      .optional()
      .isObject().withMessage('Options must be an object'),
    
    body('options.sections')
      .optional()
      .isObject().withMessage('Sections must be an object')
      .custom((value) => {
        const validSections = ['summary', 'skills', 'experience'];
        return Object.keys(value).every(key => validSections.includes(key));
      }).withMessage('Invalid section specified'),
    
    body('options.addSkills')
      .optional()
      .isArray().withMessage('Add skills must be an array')
      .custom((value) => value.every(skill => typeof skill === 'string'))
      .withMessage('All skills must be strings'),
    
    body('options.quickEdit')
      .optional()
      .isBoolean().withMessage('Quick edit must be a boolean')
  ],

  /**
   * Validates resume download request
   */
  resumeDownload: [
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
      .isArray().withMessage('Improvements must be an array'),
    
    body('metadata.changes')
      .optional()
      .isObject().withMessage('Changes must be an object')
  ]
};

/**
 * @route   POST /api/resume/analyze
 * @desc    Analyze resume against a specific job
 * @access  Public (rate limited)
 * @body    {
 *   resumeText: string (required),
 *   jobId: string (required),
 *   jobDescription: string (required),
 *   jobTitle: string (optional),
 *   employerName: string (optional)
 * }
 */
router.post('/analyze',
  aiLimiter, // Apply AI rate limiter
  validate(resumeValidators.resumeAnalysis),
  asyncHandler(async (req, res) => {
    const { 
      resumeText, 
      jobId, 
      jobDescription, 
      jobTitle, 
      employerName 
    } = req.body;
    
    console.log(`Resume analysis requested for job: ${jobId}`);
    
    try {
      // Build job data object
      const jobData = {
        job_id: jobId,
        job_title: jobTitle || 'Position',
        job_description: jobDescription,
        employer_name: employerName || 'Company'
      };
      
      // Try to fetch additional job details if we have a valid job ID
      try {
        const jobDetails = await jobSearchService.getJobDetails(jobId);
        if (jobDetails.data) {
          // Merge with fetched data, preserving user-provided data
          jobData.job_title = jobTitle || jobDetails.data.job_title;
          jobData.employer_name = employerName || jobDetails.data.employer_name;
          jobData.job_required_skills = jobDetails.data.job_required_skills;
          jobData.job_required_experience = jobDetails.data.job_required_experience;
          jobData.job_required_education = jobDetails.data.job_required_education;
          jobData.job_highlights = jobDetails.data.job_highlights;
          jobData.extracted_requirements = jobDetails.data.extracted_requirements;
        }
      } catch (error) {
        console.log('Could not fetch additional job details, using provided data only');
      }
      
      // Perform analysis
      const analysis = await resumeAnalysisService.analyzeResume(resumeText, jobData);
      
      // Return analysis results
      res.json({
        success: true,
        data: {
          analysis,
          jobInfo: {
            jobId: jobData.job_id,
            jobTitle: jobData.job_title,
            employerName: jobData.employer_name
          }
        }
      });
    } catch (error) {
      console.error('Resume analysis error:', error);
      throw error;
    }
  })
);

/**
 * @route   POST /api/resume/optimize
 * @desc    Optimize resume for a specific job
 * @access  Public (rate limited)
 * @body    {
 *   resumeText: string (required),
 *   jobData: {
 *     job_title: string (required),
 *     job_description: string (required),
 *     employer_name: string (optional),
 *     // other job fields
 *   },
 *   options: {
 *     sections: { summary: bool, skills: bool, experience: bool },
 *     addSkills: string[],
 *     quickEdit: bool
 *   }
 * }
 */
router.post('/optimize',
  aiLimiter, // Apply AI rate limiter
  validate(resumeValidators.resumeOptimization),
  asyncHandler(async (req, res) => {
    const { resumeText, jobData, options = {} } = req.body;
    
    console.log(`Resume optimization requested for: ${jobData.job_title}`);
    console.log('Optimization options:', options);
    
    try {
      // If jobData has a job_id, try to enrich with additional details
      if (jobData.job_id) {
        try {
          const jobDetails = await jobSearchService.getJobDetails(jobData.job_id);
          if (jobDetails.data) {
            // Merge additional details while preserving provided data
            jobData.job_required_skills = jobData.job_required_skills || jobDetails.data.job_required_skills;
            jobData.job_required_experience = jobData.job_required_experience || jobDetails.data.job_required_experience;
            jobData.job_required_education = jobData.job_required_education || jobDetails.data.job_required_education;
            jobData.job_highlights = jobData.job_highlights || jobDetails.data.job_highlights;
            jobData.extracted_requirements = jobData.extracted_requirements || jobDetails.data.extracted_requirements;
          }
        } catch (error) {
          console.log('Could not fetch additional job details, using provided data only');
        }
      }
      
      // Perform optimization
      const optimization = await resumeOptimizationService.optimizeResume(
        resumeText,
        jobData,
        options
      );
      
      // Return optimization results
      res.json({
        success: true,
        data: {
          optimizedResume: optimization.optimizedResume,
          changes: optimization.changes,
          scores: optimization.scores,
          qualityReport: optimization.qualityReport,
          metadata: optimization.metadata
        },
        message: optimization.scores.improvement > 0 
          ? `Resume optimized successfully! Score improved from ${optimization.scores.before} to ${optimization.scores.after}`
          : 'Resume optimization completed'
      });
    } catch (error) {
      console.error('Resume optimization error:', error);
      throw error;
    }
  })
);

/**
 * @route   POST /api/resume/quick-analyze
 * @desc    Quick analysis of resume without job context
 * @access  Public (rate limited)
 * @body    {
 *   resumeText: string (required)
 * }
 */
router.post('/quick-analyze',
  aiLimiter,
  validate([
    body('resumeText')
      .trim()
      .notEmpty().withMessage('Resume text is required')
      .isLength({ min: 100 }).withMessage('Resume must be at least 100 characters')
      .isLength({ max: 50000 }).withMessage('Resume must not exceed 50000 characters')
  ]),
  asyncHandler(async (req, res) => {
    const { resumeText } = req.body;
    
    console.log('Quick resume analysis requested');
    
    // For quick analysis, create a generic job context
    const genericJobData = {
      job_title: 'General Professional Position',
      job_description: 'Seeking a qualified professional with relevant experience and skills.',
      employer_name: 'Generic Company'
    };
    
    try {
      const analysis = await resumeAnalysisService.analyzeResume(resumeText, genericJobData);
      
      res.json({
        success: true,
        data: {
          generalScore: analysis.currentScore,
          strengths: analysis.scoreBreakdown,
          improvements: analysis.improvements,
          message: 'This is a general analysis. For specific job matching, use the full analysis endpoint.'
        }
      });
    } catch (error) {
      console.error('Quick analysis error:', error);
      throw error;
    }
  })
);

/**
 * @route   POST /api/resume/compare
 * @desc    Compare original and optimized resumes
 * @access  Public
 * @body    {
 *   originalResume: string (required),
 *   optimizedResume: string (required),
 *   jobData: object (required)
 * }
 */
router.post('/compare',
  validate([
    body('originalResume')
      .trim()
      .notEmpty().withMessage('Original resume is required')
      .isLength({ min: 100 }).withMessage('Original resume must be at least 100 characters'),
    
    body('optimizedResume')
      .trim()
      .notEmpty().withMessage('Optimized resume is required')
      .isLength({ min: 100 }).withMessage('Optimized resume must be at least 100 characters'),
    
    body('jobData')
      .notEmpty().withMessage('Job data is required')
      .isObject().withMessage('Job data must be an object'),
    
    body('jobData.job_title')
      .trim()
      .notEmpty().withMessage('Job title is required'),
    
    body('jobData.job_description')
      .trim()
      .notEmpty().withMessage('Job description is required')
  ]),
  asyncHandler(async (req, res) => {
    const { originalResume, optimizedResume, jobData } = req.body;
    
    console.log('Resume comparison requested');
    
    try {
      // Analyze both resumes
      const [originalAnalysis, optimizedAnalysis] = await Promise.all([
        resumeAnalysisService.analyzeResume(originalResume, jobData),
        resumeAnalysisService.analyzeResume(optimizedResume, jobData)
      ]);
      
      // Calculate improvements
      const comparison = {
        originalScore: originalAnalysis.currentScore,
        optimizedScore: optimizedAnalysis.currentScore,
        improvement: optimizedAnalysis.currentScore - originalAnalysis.currentScore,
        improvementPercentage: Math.round(
          ((optimizedAnalysis.currentScore - originalAnalysis.currentScore) / originalAnalysis.currentScore) * 100
        ),
        categoryImprovements: {
          skills: {
            before: originalAnalysis.scoreBreakdown.skills.score,
            after: optimizedAnalysis.scoreBreakdown.skills.score,
            improvement: optimizedAnalysis.scoreBreakdown.skills.score - originalAnalysis.scoreBreakdown.skills.score
          },
          experience: {
            before: originalAnalysis.scoreBreakdown.experience.score,
            after: optimizedAnalysis.scoreBreakdown.experience.score,
            improvement: optimizedAnalysis.scoreBreakdown.experience.score - originalAnalysis.scoreBreakdown.experience.score
          },
          keywords: {
            before: originalAnalysis.scoreBreakdown.keywords.score,
            after: optimizedAnalysis.scoreBreakdown.keywords.score,
            improvement: optimizedAnalysis.scoreBreakdown.keywords.score - originalAnalysis.scoreBreakdown.keywords.score
          }
        },
        newStrengths: optimizedAnalysis.scoreBreakdown.skills.present.filter(
          skill => !originalAnalysis.scoreBreakdown.skills.present.includes(skill)
        ),
        resolvedGaps: originalAnalysis.criticalMissing.skills.filter(
          skill => !optimizedAnalysis.criticalMissing.skills.includes(skill)
        )
      };
      
      res.json({
        success: true,
        data: {
          comparison,
          originalAnalysis,
          optimizedAnalysis
        }
      });
    } catch (error) {
      console.error('Resume comparison error:', error);
      throw error;
    }
  })
);

/**
 * @route   POST /api/resume/download
 * @desc    Generate and download resume document (PDF or DOCX)
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
router.post('/download',
  aiLimiter, // Apply AI rate limiter since this uses resources
  validate(resumeValidators.resumeDownload),
  asyncHandler(async (req, res) => {
    const { resumeText, format, metadata = {} } = req.body;
    
    console.log(`Resume document generation requested: ${format.toUpperCase()}`);
    console.log('Metadata:', metadata);
    
    try {
      // Prepare enhanced data for ATS-optimized document generation
      const documentData = {
        resumeText,
        score: metadata.score,
        jobTitle: metadata.jobTitle,
        company: metadata.company,
        improvements: metadata.improvements || [],
        changes: metadata.changes || {},
        // Add preview data for frontend highlighting
        previewData: {
          highlightedSections: metadata.changes ? generateHighlightData(metadata.changes) : [],
          originalText: resumeText,
          optimizedText: resumeText // This would be the optimized version in a real scenario
        }
      };
      
      // Generate ATS-optimized document
      const fileInfo = await documentGenerationService.generateResume(documentData, format);
      
      // Cache preview data for the frontend
      const previewData = {
        changes: documentData.changes,
        improvements: documentData.improvements,
        score: documentData.score,
        highlightedSections: documentData.previewData.highlightedSections
      };
      cache.set(`preview:${fileInfo.fileId}`, previewData, fileInfo.expiresIn);
      
      // Return download information with preview data
      res.json({
        success: true,
        data: {
          fileId: fileInfo.fileId,
          filename: fileInfo.filename,
          format: fileInfo.format,
          size: fileInfo.size,
          downloadUrl: fileInfo.downloadUrl,
          expiresIn: fileInfo.expiresIn,
          expiresAt: fileInfo.expiresAt,
          // Add preview URL for frontend rendering
          previewUrl: `/api/resume/preview/${fileInfo.fileId}`,
          // Add highlighted changes for frontend
          preview: {
            changes: documentData.changes,
            improvements: documentData.improvements,
            score: documentData.score,
            highlightedSections: documentData.previewData.highlightedSections
          }
        },
        message: `${format.toUpperCase()} document generated successfully with ATS optimization`
      });
    } catch (error) {
      console.error('Resume document generation error:', error);
      throw error;
    }
  })
);

/**
 * @route   GET /api/resume/preview/:fileId
 * @desc    Get resume preview with highlighted changes for frontend rendering
 * @access  Public
 * @params  fileId: UUID of the generated file
 */
router.get('/preview/:fileId',
  generalLimiter,
  validate([
    param('fileId')
      .trim()
      .notEmpty().withMessage('File ID is required')
      .isUUID().withMessage('Invalid file ID format')
  ]),
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;
    
    console.log(`Resume preview requested: ${fileId}`);
    
    try {
      // Get file info from document generation service
      const fileInfo = await documentGenerationService.getFileInfo(fileId);
      
      // Check if file has expired
      if (Date.now() > fileInfo.expiresAt) {
        throw new AppError('Preview has expired', 410);
      }
      
      // Get cached preview data (this would be stored during generation)
      const previewData = cache.get(`preview:${fileId}`) || {
        changes: {},
        improvements: [],
        score: 0,
        highlightedSections: []
      };
      
      // Return enhanced preview data for frontend rendering
      res.json({
        success: true,
        data: {
          fileId,
          filename: fileInfo.filename,
          format: fileInfo.format,
          downloadUrl: `/api/download/${fileId}`,
          expiresAt: new Date(fileInfo.expiresAt).toISOString(),
          preview: {
            // Highlighted sections for frontend to render with green highlights
            highlightedSections: previewData.highlightedSections || [],
            // Summary of changes made
            changesSummary: {
              sectionsImproved: Object.keys(previewData.changes || {}).length,
              keywordsAdded: extractAddedKeywords(previewData.changes || {}),
              skillsAdded: extractAddedSkills(previewData.changes || {}),
              improvementsCount: (previewData.improvements || []).length
            },
            // Detailed changes for highlighting
            changes: previewData.changes || {},
            improvements: previewData.improvements || [],
            score: previewData.score || 0,
            // For frontend highlighting - specific text sections that were changed
            textHighlights: generateTextHighlights(previewData.changes || {})
          }
        }
      });
    } catch (error) {
      console.error('Resume preview error:', error);
      
      if (error.status === 404 || error.status === 410) {
        throw error;
      }
      
      throw new AppError('Failed to generate preview', 500);
    }
  })
);

/**
 * Helper function to extract added keywords from changes
 */
function extractAddedKeywords(changes) {
  const keywords = [];
  
  if (changes.summary && changes.summary.keywordsAdded) {
    keywords.push(...changes.summary.keywordsAdded);
  }
  
  if (changes.experience && Array.isArray(changes.experience)) {
    changes.experience.forEach(exp => {
      if (exp.keywordsAdded) {
        keywords.push(...exp.keywordsAdded);
      }
    });
  }
  
  return [...new Set(keywords)];
}

/**
 * Helper function to extract added skills from changes
 */
function extractAddedSkills(changes) {
  if (changes.skills && changes.skills.added) {
    return changes.skills.added;
  }
  return [];
}

/**
 * Helper function to generate text highlights for frontend
 */
function generateTextHighlights(changes) {
  const highlights = [];
  
  // Summary highlights
  if (changes.summary) {
    highlights.push({
      section: 'summary',
      type: 'improvement',
      originalText: changes.summary.before || '',
      highlightedText: changes.summary.after || '',
      keywords: changes.summary.keywordsAdded || [],
      color: 'green'
    });
  }
  
  // Skills highlights
  if (changes.skills) {
    if (changes.skills.added && changes.skills.added.length > 0) {
      highlights.push({
        section: 'skills',
        type: 'addition',
        addedItems: changes.skills.added,
        removedItems: changes.skills.removed || [],
        color: 'green'
      });
    }
  }
  
  // Experience highlights
  if (changes.experience && Array.isArray(changes.experience)) {
    changes.experience.forEach((exp, index) => {
      highlights.push({
        section: 'experience',
        subsection: index,
        type: 'enhancement',
        position: exp.position || `Position ${index + 1}`,
        originalText: exp.before || '',
        highlightedText: exp.after || '',
        improvementType: exp.improvementType || 'general',
        color: 'green'
      });
    });
  }
  
  return highlights;
}

/**
 * Helper function to generate highlight data for frontend
 * @param {Object} changes - Changes object from optimization
 * @returns {Array} Array of highlight information
 */
function generateHighlightData(changes) {
  const highlights = [];
  
  if (changes.summary) {
    highlights.push({
      section: 'summary',
      type: 'improvement',
      before: changes.summary.before,
      after: changes.summary.after,
      keywords: changes.summary.keywordsAdded || []
    });
  }
  
  if (changes.skills) {
    highlights.push({
      section: 'skills',
      type: 'addition',
      added: changes.skills.added || [],
      removed: changes.skills.removed || [],
      reorganized: changes.skills.reorganized
    });
  }
  
  if (changes.experience && Array.isArray(changes.experience)) {
    changes.experience.forEach((exp, index) => {
      highlights.push({
        section: 'experience',
        subsection: index,
        type: 'enhancement',
        position: exp.position,
        before: exp.before,
        after: exp.after,
        improvementType: exp.improvementType
      });
    });
  }
  
  return highlights;
}

module.exports = router;