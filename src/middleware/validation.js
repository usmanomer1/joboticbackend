/**
 * Validation middleware factory and common validators
 * @module middleware/validation
 */

const { body, query, param, validationResult } = require('express-validator');

/**
 * Validation error handler middleware
 * Checks for validation errors and formats them properly
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().reduce((acc, error) => {
      if (!acc[error.path]) {
        acc[error.path] = [];
      }
      acc[error.path].push(error.msg);
      return acc;
    }, {});
    
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: formattedErrors
    });
  }
  
  next();
};

/**
 * Creates validation middleware chain
 * @param {Array} validations - Array of express-validator validations
 * @returns {Array} Array of middleware functions including error handler
 */
const validate = (validations) => {
  return [...validations, handleValidationErrors];
};

/**
 * Common validators for reuse across routes
 */
const validators = {
  /**
   * Validates job search parameters for JSearch API
   */
  jobSearch: [
    // Query is optional, but if not provided, jobTitle and location are required
    body('query')
      .optional()
      .trim()
      .isLength({ min: 2, max: 200 }).withMessage('Query must be between 2 and 200 characters'),
    
    // JobTitle is conditionally required if no query
    body('jobTitle')
      .if(body('query').not().exists())
      .trim()
      .notEmpty().withMessage('Job title is required when query is not provided')
      .isLength({ min: 2, max: 100 }).withMessage('Job title must be between 2 and 100 characters'),
    
    // Location is conditionally required if no query
    body('location')
      .if(body('query').not().exists())
      .trim()
      .notEmpty().withMessage('Location is required when query is not provided')
      .isLength({ min: 2, max: 100 }).withMessage('Location must be between 2 and 100 characters'),
    
    // Pagination parameters
    body('page')
      .optional()
      .isInt({ min: 1 }).withMessage('Page must be a positive integer')
      .toInt()
      .default(1),
    
    body('num_pages')
      .optional()
      .isInt({ min: 1, max: 10 }).withMessage('Number of pages must be between 1 and 10')
      .toInt()
      .default(1),
    
    // Date posted filter
    body('date_posted')
      .optional()
      .isIn(['all', 'today', '3days', 'week', 'month'])
      .withMessage('Date posted must be one of: all, today, 3days, week, month'),
    
    // Remote jobs filter
    body('remote_jobs_only')
      .optional()
      .isBoolean().withMessage('Remote jobs only must be a boolean')
      .toBoolean(),
    
    // Employment types filter
    body('employment_types')
      .optional()
      .isArray().withMessage('Employment types must be an array')
      .custom((value) => {
        const validTypes = ['FULLTIME', 'CONTRACTOR', 'PARTTIME', 'INTERN'];
        return value.every(type => validTypes.includes(type));
      }).withMessage('Employment types must contain only: FULLTIME, CONTRACTOR, PARTTIME, INTERN'),
    
    // Job requirements filter
    body('job_requirements')
      .optional()
      .isArray().withMessage('Job requirements must be an array')
      .custom((value) => {
        const validRequirements = ['under_3_years_exp', 'more_than_3_years_exp', 'no_exp', 'no_degree', 'fair_chance'];
        return value.every(req => validRequirements.includes(req));
      }).withMessage('Job requirements must contain only: under_3_years_exp, more_than_3_years_exp, no_exp, no_degree, fair_chance'),
    
    // Custom sanitizer to build query from jobTitle and location if needed
    body().custom((value, { req }) => {
      if (!req.body.query && req.body.jobTitle && req.body.location) {
        req.body.query = `${req.body.jobTitle} ${req.body.location}`;
      }
      return true;
    })
  ],

  /**
   * Validates job matching request with AI scoring
   */
  jobMatch: [
    // Resume text is always required for matching
    body('resumeText')
      .trim()
      .notEmpty().withMessage('Resume text content is required')
      .isLength({ min: 50, max: 50000 }).withMessage('Resume text must be between 50 and 50000 characters')
      .customSanitizer(value => {
        // Remove any potential script tags or malicious content
        return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                   .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
      }),
    
    // Query is optional, but if not provided, jobTitle and location are required
    body('query')
      .optional()
      .trim()
      .isLength({ min: 2, max: 200 }).withMessage('Query must be between 2 and 200 characters'),
    
    // JobTitle is conditionally required if no query
    body('jobTitle')
      .if(body('query').not().exists())
      .trim()
      .notEmpty().withMessage('Job title is required when query is not provided')
      .isLength({ min: 2, max: 100 }).withMessage('Job title must be between 2 and 100 characters'),
    
    // Location is conditionally required if no query
    body('location')
      .if(body('query').not().exists())
      .trim()
      .notEmpty().withMessage('Location is required when query is not provided')
      .isLength({ min: 2, max: 100 }).withMessage('Location must be between 2 and 100 characters'),
    
    // Additional search filters
    body('date_posted')
      .optional()
      .isIn(['all', 'today', '3days', 'week', 'month'])
      .withMessage('Date posted must be one of: all, today, 3days, week, month'),
    
    body('remote_jobs_only')
      .optional()
      .isBoolean().withMessage('Remote jobs only must be a boolean')
      .toBoolean(),
    
    body('employment_types')
      .optional()
      .isArray().withMessage('Employment types must be an array')
      .custom((value) => {
        const validTypes = ['FULLTIME', 'CONTRACTOR', 'PARTTIME', 'INTERN'];
        return value.every(type => validTypes.includes(type));
      }).withMessage('Employment types must contain only: FULLTIME, CONTRACTOR, PARTTIME, INTERN'),
    
    body('job_requirements')
      .optional()
      .isArray().withMessage('Job requirements must be an array')
      .custom((value) => {
        const validRequirements = ['under_3_years_exp', 'more_than_3_years_exp', 'no_exp', 'no_degree', 'fair_chance'];
        return value.every(req => validRequirements.includes(req));
      }).withMessage('Job requirements must contain only: under_3_years_exp, more_than_3_years_exp, no_exp, no_degree, fair_chance'),
    
    // Pagination
    body('page')
      .optional()
      .isInt({ min: 1 }).withMessage('Page must be a positive integer')
      .toInt()
      .default(1),
    
    body('num_pages')
      .optional()
      .isInt({ min: 1, max: 10 }).withMessage('Number of pages must be between 1 and 10')
      .toInt()
      .default(1),
    
    // Max jobs to return after matching
    body('max_jobs')
      .optional()
      .isInt({ min: 1, max: 10 }).withMessage('Max jobs must be between 1 and 10')
      .toInt()
      .default(10),
    
    // Custom sanitizer to build query from jobTitle and location if needed
    body().custom((value, { req }) => {
      if (!req.body.query && req.body.jobTitle && req.body.location) {
        req.body.query = `${req.body.jobTitle} ${req.body.location}`;
      }
      return true;
    })
  ],


  /**
   * Validates job details request
   */
  jobDetails: [
    param('jobId')
      .trim()
      .notEmpty().withMessage('Job ID is required')
      .isLength({ min: 1 }).withMessage('Job ID cannot be empty')
  ],

  /**
   * Validates salary estimate request
   */
  salaryEstimate: [
    body('job_title')
      .trim()
      .notEmpty().withMessage('Job title is required for salary estimate')
      .isLength({ min: 2, max: 200 }).withMessage('Job title must be between 2 and 200 characters'),
    
    body('location')
      .trim()
      .notEmpty().withMessage('Location is required for salary estimate')
      .isLength({ min: 2, max: 100 }).withMessage('Location must be between 2 and 100 characters'),
    
    body('location_type')
      .optional()
      .isIn(['city', 'state', 'country'])
      .withMessage('Location type must be one of: city, state, country')
      .default('city')
  ],

  /**
   * Validates UUID parameter
   */
  uuidParam: (paramName = 'id') => [
    param(paramName)
      .isUUID().withMessage(`Invalid ${paramName} format`)
  ],

  /**
   * Validates pagination query parameters
   */
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ]
};

/**
 * Custom sanitizers for common use cases
 */
const sanitizers = {
  /**
   * Sanitizes and normalizes text input
   * @param {string} field - Field name to sanitize
   */
  normalizeText: (field) => 
    body(field)
      .trim()
      .escape()
      .replace(/\s+/g, ' '),

  /**
   * Sanitizes HTML content
   * @param {string} field - Field name to sanitize
   */
  sanitizeHtml: (field) =>
    body(field)
      .trim()
      .customSanitizer(value => {
        // Remove script tags and other potentially harmful content
        return value
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      })
};

module.exports = {
  validate,
  validators,
  sanitizers,
  handleValidationErrors
};