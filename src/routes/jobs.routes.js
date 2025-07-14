/**
 * Job search routes
 * @module routes/jobs
 */

const router = require('express').Router();
const { body } = require('express-validator');
const jobSearchService = require('../services/jobSearch.service');
const aiMatchingService = require('../services/aiMatching.service');
const cache = require('../utils/cache');
const { validate, validators } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { aiLimiter } = require('../middleware/rateLimiter');

/**
 * @route   POST /api/jobs/search
 * @desc    Search for jobs using JSearch API
 * @access  Public
 * @body    {
 *   query: string (optional),
 *   jobTitle: string (required if no query),
 *   location: string (required if no query),
 *   page: number (optional),
 *   datePosted: string (optional),
 *   remote: boolean (optional),
 *   employmentTypes: array (optional)
 * }
 */
router.post('/search', 
  validate(validators.jobSearch),
  asyncHandler(async (req, res) => {
    const {
      query,
      jobTitle,
      location,
      page = 1,
      num_pages = 1,
      date_posted = 'all',
      remote_jobs_only = false,
      employment_types = [],
      job_requirements = []
    } = req.body;
    
    // Build search query if not provided
    const searchQuery = query || jobSearchService.buildSearchQuery(jobTitle, location);
    
    if (!searchQuery || searchQuery.trim().length === 0) {
      throw new AppError('Search query cannot be empty', 400);
    }
    
    // Log search request
    console.log('Job search request:', {
      query: searchQuery,
      page,
      filters: {
        date_posted,
        remote_jobs_only,
        employment_types,
        job_requirements
      }
    });
    
    // Perform search
    const searchResults = await jobSearchService.searchJobs({
      query: searchQuery,
      page,
      num_pages,
      date_posted,
      remote_jobs_only,
      employment_types,
      job_requirements,
      country: 'us' // Default to US jobs
    });
    
    // Format response
    res.json({
      success: true,
      data: {
        jobs: searchResults.jobs || [],
        totalFound: searchResults.totalResults || 0,
        currentPage: searchResults.currentPage || page,
        totalPages: searchResults.totalPages || 1,
        resultsPerPage: searchResults.jobs?.length || 0,
        query: searchQuery,
        filters: {
          datePosted: date_posted,
          remote: remote_jobs_only,
          employmentTypes: employment_types,
          requirements: job_requirements
        }
      },
      message: searchResults.fromCache ? 'Results from cache due to API unavailability' : null
    });
  })
);

/**
 * @route   POST /api/jobs/match
 * @desc    Search jobs and get AI match scores against resume
 * @access  Public (rate limited)
 * @body    {
 *   resumeText: string (required, min 100 chars),
 *   preferences: {
 *     jobTitle: string,
 *     location: string,
 *     keywords: string[],
 *     datePosted: string
 *   },
 *   // Legacy support - also accepts flat structure
 *   query: string,
 *   page: number,
 *   remote_jobs_only: boolean,
 *   employment_types: string[],
 *   job_requirements: string[]
 * }
 */
router.post('/match',
  aiLimiter, // Apply AI rate limiter
  validate([
    // Support both new structure (resumeText + preferences) and legacy (resume + flat params)
    body('resumeText')
      .optional()
      .trim()
      .isLength({ min: 100 }).withMessage('Resume must be at least 100 characters'),
    
    body('resume')
      .optional()
      .trim()
      .isLength({ min: 100 }).withMessage('Resume must be at least 100 characters'),
    
    // Validate that at least one resume field is provided
    body().custom((value) => {
      if (!value.resumeText && !value.resume) {
        throw new Error('Resume text is required (use resumeText or resume field)');
      }
      return true;
    }),
    
    body('preferences')
      .optional()
      .isObject().withMessage('Preferences must be an object'),
    
    body('preferences.jobTitle')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 }).withMessage('Job title must be between 2 and 100 characters'),
    
    body('preferences.location')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 }).withMessage('Location must be between 2 and 100 characters'),
    
    body('preferences.keywords')
      .optional()
      .isArray().withMessage('Keywords must be an array'),
    
    body('preferences.datePosted')
      .optional()
      .isIn(['all', 'today', '3days', 'week', 'month']).withMessage('Invalid date posted value'),
    
    body('preferences.numPages')
      .optional()
      .isInt({ min: 1, max: 10 }).withMessage('Number of pages must be between 1 and 10'),
    
    body('preferences.minScore')
      .optional()
      .isInt({ min: 0, max: 100 }).withMessage('Minimum score must be between 0 and 100'),
    
    // Legacy flat parameters
    body('query').optional().trim(),
    body('jobTitle').optional().trim(),
    body('location').optional().trim(),
    body('page').optional().isInt({ min: 1 }).toInt(),
    body('num_pages').optional().isInt({ min: 1, max: 10 }).toInt(),
    body('min_score').optional().isInt({ min: 0, max: 100 }).toInt(),
    body('date_posted').optional().isIn(['all', 'today', '3days', 'week', 'month']),
    body('remote_jobs_only').optional().isBoolean().toBoolean(),
    body('employment_types').optional().isArray(),
    body('job_requirements').optional().isArray()
  ]),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    // Extract parameters - support both new and legacy formats
    const resumeText = req.body.resumeText || req.body.resume;
    const preferences = req.body.preferences || {};
    
    // Build search parameters from preferences or flat structure
    const searchParams = {
      query: preferences.query || req.body.query,
      jobTitle: preferences.jobTitle || req.body.jobTitle,
      location: preferences.location || req.body.location,
      keywords: preferences.keywords || [],
      page: req.body.page || 1,
      num_pages: Math.min(req.body.num_pages || 5, 10), // Default 5 pages (50 jobs), max 10 pages (100 jobs)
      date_posted: preferences.datePosted || req.body.date_posted || 'all',
      remote_jobs_only: preferences.remote || req.body.remote_jobs_only || false,
      employment_types: preferences.employmentTypes || req.body.employment_types || [],
      job_requirements: preferences.jobRequirements || req.body.job_requirements || [],
      min_score: preferences.minScore || req.body.min_score || 0 // Optional minimum match score filter
    };
    
    // Build search query
    const searchQuery = searchParams.query || 
      jobSearchService.buildSearchQuery(searchParams.jobTitle, searchParams.location, searchParams.keywords);
    
    if (!searchQuery || searchQuery.trim().length === 0) {
      throw new AppError('Search query cannot be empty. Provide query or jobTitle+location', 400);
    }
    
    console.log('=== Job Match Request ===');
    console.log('Search query:', searchQuery);
    console.log('Resume length:', resumeText.length);
    console.log('Search params:', searchParams);
    
    // Check cache for matched results
    const cacheKey = cache.makeKey(
      'match',
      searchQuery,
      searchParams.page,
      searchParams.date_posted,
      resumeText.substring(0, 100) // Use first 100 chars of resume for cache key
    );
    
    const cachedResults = cache.get(cacheKey);
    if (cachedResults) {
      console.log('Returning cached match results');
      const cacheTiming = Date.now() - startTime;
      return res.json({
        ...cachedResults,
        timing: { total: cacheTiming, fromCache: true }
      });
    }
    
    let searchResults;
    let matchedJobs;
    let searchError = null;
    let matchError = null;
    
    try {
      // Step 1: Search for jobs
      console.log('[1/3] Searching for jobs...');
      const searchStartTime = Date.now();
      
      searchResults = await jobSearchService.searchJobsForMatching({
        query: searchQuery,
        page: searchParams.page,
        num_pages: searchParams.num_pages,
        date_posted: searchParams.date_posted,
        remote_jobs_only: searchParams.remote_jobs_only,
        employment_types: searchParams.employment_types,
        job_requirements: searchParams.job_requirements,
        country: 'us'
      });
      
      const searchDuration = Date.now() - searchStartTime;
      console.log(`[1/3] Found ${searchResults.jobs?.length || 0} jobs in ${searchDuration}ms`);
      
      if (!searchResults.jobs || searchResults.jobs.length === 0) {
        // No jobs found - return empty result
        return res.json({
          success: true,
          data: {
            jobs: [],
            totalFound: 0,
            searchCriteria: {
              query: searchQuery,
              ...searchParams
            },
            timestamp: new Date().toISOString()
          },
          message: 'No jobs found matching your criteria'
        });
      }
      
      // Step 2: Get AI match scores
      console.log('[2/3] Running AI matching...');
      const matchStartTime = Date.now();
      
      try {
        matchedJobs = await aiMatchingService.matchJobsToResume(
          searchResults.jobs,
          resumeText
        );
        
        const matchDuration = Date.now() - matchStartTime;
        console.log(`[2/3] AI matching completed in ${matchDuration}ms`);
      } catch (error) {
        matchError = error;
        console.error('AI matching failed:', error.message);
        
        // Fallback: Return jobs without scores
        matchedJobs = searchResults.jobs.map(job => ({
          ...job,
          match_score: 0,
          match_label: 'MATCHING UNAVAILABLE',
          match_reasons: ['AI matching service temporarily unavailable'],
          missing_skills: [],
          key_strengths: [],
          match_error: true
        }));
      }
      
      // Step 3: Enrich with salary data (optional, non-blocking)
      console.log('[3/3] Enriching with salary data...');
      const salaryStartTime = Date.now();
      
      try {
        matchedJobs = await jobSearchService.enrichJobsWithSalary(matchedJobs);
        const salaryDuration = Date.now() - salaryStartTime;
        console.log(`[3/3] Salary enrichment completed in ${salaryDuration}ms`);
      } catch (error) {
        console.error('Salary enrichment failed (non-critical):', error.message);
        // Continue without salary data
      }
      
    } catch (error) {
      searchError = error;
      console.error('Job search failed:', error);
      throw new AppError(
        'Failed to search for jobs. Please try again.',
        error.status || 500,
        { originalError: error.message }
      );
    }
    
    // Apply minimum score filter if specified
    let filteredJobs = matchedJobs || [];
    let preFilterCount = filteredJobs.length;
    
    if (searchParams.min_score > 0 && !matchError) {
      filteredJobs = filteredJobs.filter(job => job.match_score >= searchParams.min_score);
      console.log(`Applied min_score filter: ${preFilterCount} jobs -> ${filteredJobs.length} jobs (min_score: ${searchParams.min_score})`);
    }
    
    // Calculate timing
    const totalDuration = Date.now() - startTime;
    
    // Prepare response
    const response = {
      success: true,
      data: {
        jobs: filteredJobs,
        totalFound: searchResults?.totalResults || 0,
        totalMatched: preFilterCount, // Total jobs before filtering
        totalFiltered: filteredJobs.length, // Jobs after filtering
        currentPage: searchParams.page,
        totalPages: searchResults?.totalPages || 1,
        searchCriteria: {
          query: searchQuery,
          jobTitle: searchParams.jobTitle,
          location: searchParams.location,
          keywords: searchParams.keywords,
          datePosted: searchParams.date_posted,
          remote: searchParams.remote_jobs_only,
          employmentTypes: searchParams.employment_types,
          requirements: searchParams.job_requirements,
          minScore: searchParams.min_score
        },
        timestamp: new Date().toISOString()
      },
      timing: {
        total: totalDuration,
        search: searchResults?._timing || 'N/A',
        matching: matchError ? 'failed' : 'completed',
        fromCache: false
      }
    };
    
    // Add warnings if any services failed
    if (matchError) {
      response.warnings = ['AI matching unavailable - showing unscored results'];
    }
    
    // Cache successful results for 5 minutes
    if (!searchError && !matchError) {
      cache.set(cacheKey, response, 300); // 5 minutes
    }
    
    console.log(`=== Match Request Completed in ${totalDuration}ms ===`);
    
    res.json(response);
  })
);

/**
 * @route   GET /api/jobs/:jobId
 * @desc    Get detailed job information
 * @access  Public
 * @params  jobId: JSearch job ID
 */
router.get('/:jobId',
  validate(validators.jobDetails),
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    
    console.log('Fetching job details for:', jobId);
    
    // Get job details
    const jobDetails = await jobSearchService.getJobDetails(jobId);
    
    if (!jobDetails.data) {
      throw new AppError('Job not found', 404);
    }
    
    // Try to get salary estimate if we have job title and location
    let salaryData = null;
    const job = jobDetails.data;
    
    if (job.job_title && (job.job_city || job.job_state)) {
      try {
        const location = job.job_city ? `${job.job_city}, ${job.job_state}` : job.job_state;
        const salaryResponse = await jobSearchService.getEstimatedSalary(
          job.job_title,
          location
        );
        
        if (salaryResponse.success) {
          salaryData = salaryResponse.salaryEstimates;
        }
      } catch (error) {
        console.error('Failed to get salary estimate:', error.message);
        // Continue without salary data
      }
    }
    
    // Combine job details with salary estimate
    const enrichedJob = {
      ...job,
      salary_estimate: salaryData || job.salary_estimate
    };
    
    res.json({
      success: true,
      data: enrichedJob
    });
  })
);

/**
 * @route   POST /api/jobs/salary-estimate
 * @desc    Get salary estimate for a job title and location
 * @access  Public
 * @body    {
 *   job_title: string (required),
 *   location: string (required),
 *   location_type: string (optional)
 * }
 */
router.post('/salary-estimate',
  validate(validators.salaryEstimate),
  asyncHandler(async (req, res) => {
    const { job_title, location, location_type = 'ANY' } = req.body;
    
    console.log('Salary estimate request:', { job_title, location, location_type });
    
    // Get salary estimate
    const salaryData = await jobSearchService.getEstimatedSalary(
      job_title,
      location,
      location_type
    );
    
    if (!salaryData.success) {
      res.status(200).json({
        success: false,
        error: 'Unable to retrieve salary data',
        data: {
          jobTitle: job_title,
          location,
          salaryEstimates: salaryData.salaryEstimates
        }
      });
      return;
    }
    
    res.json({
      success: true,
      data: {
        jobTitle: job_title,
        location,
        locationType: location_type,
        salaryEstimates: salaryData.salaryEstimates,
        dataPoints: salaryData.salaryEstimates.dataPoints,
        lastUpdated: salaryData.salaryEstimates.lastUpdated
      }
    });
  })
);

/**
 * @route   GET /api/jobs/trending
 * @desc    Get trending job searches (cached popular searches)
 * @access  Public
 */
router.get('/trending',
  asyncHandler(async (_, res) => {
    // This could be implemented to track and return popular searches
    const trendingSearches = [
      { query: 'software engineer', count: 1523 },
      { query: 'data scientist', count: 987 },
      { query: 'product manager', count: 765 },
      { query: 'frontend developer', count: 654 },
      { query: 'machine learning engineer', count: 543 }
    ];
    
    res.json({
      success: true,
      data: trendingSearches
    });
  })
);

module.exports = router;