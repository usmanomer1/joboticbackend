/**
 * Resume analysis and optimization routes
 * @module routes/resume
 */

const router = require('express').Router();
const resumeAnalysisService = require('../services/resumeAnalysis.service');
const resumeOptimizationService = require('../services/resumeOptimization.service');
const jobSearchService = require('../services/jobSearch.service');
const { validate, validators } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { aiLimiter } = require('../middleware/rateLimiter');
const { body } = require('express-validator');

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

module.exports = router;