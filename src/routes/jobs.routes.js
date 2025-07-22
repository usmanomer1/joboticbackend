/**
 * Job search routes
 * @module routes/jobs
 */

const router = require('express').Router();
const crypto = require('crypto');
const { body } = require('express-validator');
const jobSearchService = require('../services/jobSearch.service');
const aiMatchingService = require('../services/aiMatching.service');
const usageTrackingService = require('../services/usageTracking.service');
const cache = require('../utils/cache');
const { supabaseAdmin } = require('../utils/supabaseAdmin');
const { validate, validators } = require('../middleware/validation');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { aiLimiter, generalLimiter } = require('../middleware/rateLimiter');
const { authenticateSupabaseUser } = require('../middleware/supabaseAuth');
const { requestDeduplication } = require('../middleware/requestDeduplication');

// Constants for session-based pagination
const MAX_PAGES_PER_REQUEST = 2; // Process 2 pages (20 jobs) per request
const SESSION_TTL = 300; // 5 minutes

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
    let searchQuery = query || jobSearchService.buildSearchQuery(jobTitle, location);
    
    if (!searchQuery || searchQuery.trim().length === 0) {
      throw new AppError('Search query cannot be empty', 400);
    }
    
    // Handle internship searches - append "intern" to query instead of using filter
    let modifiedEmploymentTypes = employment_types;
    if (employment_types.includes('INTERN')) {
      // Check if "intern" or "internship" is not already in the query
      const queryLower = searchQuery.toLowerCase();
      if (!queryLower.includes('intern')) {
        searchQuery = searchQuery.trim() + ' intern';
        console.log('Appended "intern" to search query for better internship results');
      }
      // Remove INTERN from employment types array since we're using query-based search
      modifiedEmploymentTypes = employment_types.filter(type => type !== 'INTERN');
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
      employment_types: modifiedEmploymentTypes,
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
        hasMore: (searchResults.jobs?.length || 0) >= 10,
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
  authenticateSupabaseUser, // Require Supabase authentication
  requestDeduplication({ waitForResult: true }), // Prevent duplicate processing
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
      .isInt({ min: 1, max: 20 }).withMessage('Number of pages must be between 1 and 20'),
    
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
    body('job_requirements').optional().isArray(),
    
    // Session tracking
    body('session_id').optional().isString().trim(),
    body('offset').optional().isInt({ min: 0 }).toInt(),
    
    // Continuation request parameters
    body('continueSession').optional().isBoolean().toBoolean(),
    body('sessionId').optional().isString().trim()
  ]),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const userId = req.userId; // From Supabase auth middleware
    
    // Check if this is a continuation request
    if (req.body.continueSession && req.body.sessionId) {
      return handleContinuationRequest(req, res, startTime);
    }
    
    const sessionId = req.body.session_id || crypto.randomUUID();
    const requestedLimit = req.body.limit || 15;
    
    // Check if client wants streaming response
    const acceptHeader = req.headers.accept || '';
    const isStreaming = acceptHeader.includes('application/x-ndjson');
    console.log('Request headers:', {
      accept: req.headers.accept,
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip']
    });
    console.log('Streaming enabled:', isStreaming);
    console.log('Full Accept header value:', req.headers.accept);
    console.log('Header matches NDJSON?', req.headers.accept === 'application/x-ndjson');
    
    // Setup streaming response if requested
    if (isStreaming) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Response-Type', 'stream');
      // Add custom header as backup for Content-Type detection
      res.setHeader('X-Stream-Format', 'ndjson');
      // Expose headers to frontend for CORS
      res.setHeader('Access-Control-Expose-Headers', 'Content-Type, X-Stream-Format, X-Response-Type');
      
      // IMPORTANT: Start the response immediately to prevent gateway timeouts
      // This tells proxies/gateways that we're alive and streaming
      res.flushHeaders();
    }
    
    // Helper function to send NDJSON chunks
    const sendChunk = (type, data) => {
      if (isStreaming && !res.finished) {
        res.write(JSON.stringify({ type, data }) + '\n');
      }
    };
    
    // Check user limits before processing
    const limitCheck = await usageTrackingService.checkUserLimit(userId, requestedLimit);
    
    if (!limitCheck.allowed && limitCheck.limitReached) {
      return res.status(403).json({
        success: false,
        error: 'Monthly job view limit reached',
        limit_reached: true,
        usage: {
          plan: limitCheck.plan.name,
          monthly_limit: limitCheck.plan.limit,
          monthly_used: limitCheck.currentUsage,
          remaining: limitCheck.remaining
        }
      });
    }
    
    // Start keepalive interval for streaming to prevent gateway timeouts
    let keepaliveInterval;
    if (isStreaming) {
      keepaliveInterval = setInterval(() => {
        sendChunk('keepalive', { timestamp: Date.now() });
      }, 10000); // Send keepalive every 10 seconds
      
      // Clean up on response end
      res.on('finish', () => {
        if (keepaliveInterval) clearInterval(keepaliveInterval);
      });
      res.on('close', () => {
        if (keepaliveInterval) clearInterval(keepaliveInterval);
      });
    }
    
    // Adjust limit if user has partial allowance
    let effectiveLimit = requestedLimit;
    if (limitCheck.partialFulfillment && limitCheck.maxAllowed) {
      effectiveLimit = Math.min(requestedLimit, limitCheck.maxAllowed);
      console.log(`Adjusted limit from ${requestedLimit} to ${effectiveLimit} due to plan limits`);
    }
    
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
      num_pages: Math.min(preferences.numPages || req.body.num_pages || 10, 20), // Default 10 pages (100 jobs), max 20 pages (200 jobs)
      date_posted: preferences.datePosted || req.body.date_posted || 'all',
      remote_jobs_only: preferences.remote || req.body.remote_jobs_only || false,
      employment_types: preferences.employmentTypes || req.body.employment_types || [],
      job_requirements: preferences.jobRequirements || req.body.job_requirements || [],
      // Removed min_score - we now return ALL jobs with scores
    };
    
    // Build search query
    let searchQuery = searchParams.query || 
      jobSearchService.buildSearchQuery(searchParams.jobTitle, searchParams.location, searchParams.keywords);
    
    if (!searchQuery || searchQuery.trim().length === 0) {
      throw new AppError('Search query cannot be empty. Provide query or jobTitle+location', 400);
    }
    
    // Handle internship searches - append "intern" to query instead of using filter
    if (searchParams.employment_types.includes('INTERN')) {
      // Check if "intern" or "internship" is not already in the query
      const queryLower = searchQuery.toLowerCase();
      if (!queryLower.includes('intern')) {
        searchQuery = searchQuery.trim() + ' intern';
        console.log('Appended "intern" to search query for better internship results');
      }
      // Remove INTERN from employment types array since we're using query-based search
      searchParams.employment_types = searchParams.employment_types.filter(type => type !== 'INTERN');
    }
    
    console.log('=== Job Match Request ===');
    console.log('Search query:', searchQuery);
    console.log('Resume length:', resumeText.length);
    console.log('Search params:', searchParams);
    console.log('Location being used:', searchParams.location || 'NO LOCATION');
    console.log('Query includes location?', searchQuery.includes(searchParams.location));
    console.log('Streaming enabled:', isStreaming);
    console.log('Requested pages:', searchParams.num_pages);
    
    // Send initial data for streaming immediately to establish connection
    if (isStreaming) {
      sendChunk('initial', {
        searchCriteria: {
          query: searchQuery,
          jobTitle: searchParams.jobTitle,
          location: searchParams.location,
          keywords: searchParams.keywords,
          datePosted: searchParams.date_posted,
          remote: searchParams.remote_jobs_only,
          employmentTypes: searchParams.employment_types,
          requirements: searchParams.job_requirements
        },
        sessionId: sessionId,
        message: 'Starting job search...'
      });
      
      // Force flush to ensure data is sent immediately
      if (res.flush && typeof res.flush === 'function') {
        res.flush();
      }
    }
    
    // Check cache for matched results
    const cacheKey = cache.makeKey(
      'match',
      searchQuery,
      searchParams.page,
      searchParams.date_posted,
      searchParams.location || '',
      searchParams.remote_jobs_only || false,
      JSON.stringify(searchParams.employment_types || []),
      JSON.stringify(searchParams.job_requirements || []),
      resumeText.substring(0, 100) // Use first 100 chars of resume for cache key
    );
    
    // Skip cache for streaming requests to ensure real-time processing
    const cachedResults = !isStreaming ? cache.get(cacheKey) : null;
    if (cachedResults) {
      console.log('Returning cached match results');
      const cacheTiming = Date.now() - startTime;
      return res.json({
        ...cachedResults,
        timing: { total: cacheTiming, fromCache: true }
      });
    }
    
    // For true streaming, we need to process page by page
    if (isStreaming) {
      try {
        // Step 1: Get job count first (quick query)
        console.log('[Step 1] Getting job count...');
        const countStartTime = Date.now();
        
        const countInfo = await jobSearchService.getJobCount({
          query: searchQuery,
          location: searchParams.location,
          date_posted: searchParams.date_posted,
          remote_jobs_only: searchParams.remote_jobs_only,
          employment_types: searchParams.employment_types,
          job_requirements: searchParams.job_requirements,
          country: 'us'
        });
        
        const countDuration = Date.now() - countStartTime;
        console.log(`Got job count in ${countDuration}ms: ${countInfo.total} jobs`);
        
        // Send initial count immediately (within 2-3 seconds of request)
        sendChunk('initial', {
          totalFound: countInfo.total,
          totalPages: countInfo.totalPages,
          message: `Found ${countInfo.total} jobs matching your criteria`
        });
        
        // Force flush to ensure it's sent
        if (res.flush && typeof res.flush === 'function') {
          res.flush();
        }
        
        // Step 2: Process page by page (limited to MAX_PAGES_PER_REQUEST)
        let totalPagesToFetch;
        if (countInfo.total === 0 || countInfo.estimated) {
          // Count might be wrong, fetch the requested number of pages
          totalPagesToFetch = searchParams.num_pages;
          console.log(`Count returned ${countInfo.total}, but fetching ${totalPagesToFetch} pages as requested`);
        } else {
          // Normal case: fetch up to the available pages
          totalPagesToFetch = Math.min(searchParams.num_pages, countInfo.totalPages);
        }
        
        // Limit pages for this request to prevent timeout
        const pagesThisRequest = Math.min(MAX_PAGES_PER_REQUEST, totalPagesToFetch);
        const hasMorePages = pagesThisRequest < totalPagesToFetch;
        
        // Generate session ID for continuation
        const streamSessionId = crypto.randomBytes(16).toString('hex');
        
        console.log(`Processing ${pagesThisRequest} of ${totalPagesToFetch} total pages`);
        if (hasMorePages) {
          console.log(`Session ${streamSessionId} created for continuation`);
        }
        
        let allProcessedJobs = [];
        let totalProcessed = 0;
        
        for (let currentPage = 1; currentPage <= pagesThisRequest; currentPage++) {
          console.log(`[Step 2.${currentPage}] Fetching page ${currentPage}/${pagesThisRequest} (of ${totalPagesToFetch} total)...`);
          
          try {
            // Fetch single page
            const pageStartTime = Date.now();
            const pageResults = await jobSearchService.searchSinglePage({
              query: searchQuery,
              location: searchParams.location,
              date_posted: searchParams.date_posted,
              remote_jobs_only: searchParams.remote_jobs_only,
              employment_types: searchParams.employment_types,
              job_requirements: searchParams.job_requirements,
              country: 'us'
            }, currentPage);
            
            const pageFetchTime = Date.now() - pageStartTime;
            console.log(`Fetched page ${currentPage} with ${pageResults.jobs?.length || 0} jobs in ${pageFetchTime}ms`);
            
            if (pageResults.jobs && pageResults.jobs.length > 0) {
              // Process this page through AI immediately
              const matchStartTime = Date.now();
              let scoredJobs;
              
              try {
                scoredJobs = await aiMatchingService.matchJobsToResume(
                  pageResults.jobs,
                  resumeText
                );
              } catch (aiError) {
                console.error(`AI matching failed for page ${currentPage}:`, aiError.message);
                // Use fallback scoring
                scoredJobs = pageResults.jobs.map(job => {
                  const fallbackMatch = aiMatchingService.createFallbackMatch(job, resumeText);
                  return {
                    ...job,
                    match_score: fallbackMatch.score,
                    match_label: fallbackMatch.matchLabel,
                    match_reasons: fallbackMatch.matchReasons,
                    missing_skills: fallbackMatch.missingSkills,
                    key_strengths: fallbackMatch.keyStrengths
                  };
                });
              }
              
              const matchTime = Date.now() - matchStartTime;
              console.log(`AI matched page ${currentPage} in ${matchTime}ms`);
              
              // Send this batch immediately
              sendChunk('jobs', {
                jobs: scoredJobs,
                batchNumber: currentPage,
                totalBatches: pagesThisRequest,
                pageNumber: currentPage
              });
              
              // Update progress
              totalProcessed += scoredJobs.length;
              sendChunk('progress', {
                processed: totalProcessed,
                total: Math.min(countInfo.total, pagesThisRequest * 10),
                percentage: Math.round((currentPage / pagesThisRequest) * 100),
                currentPage: currentPage,
                totalPages: pagesThisRequest
              });
              
              // Force flush after each batch
              if (res.flush && typeof res.flush === 'function') {
                res.flush();
              }
              
              // Collect for final response
              allProcessedJobs.push(...scoredJobs);
            }
            
          } catch (pageError) {
            console.error(`Error processing page ${currentPage}:`, pageError);
            sendChunk('error', {
              message: `Failed to process page ${currentPage}`,
              pageNumber: currentPage,
              error: pageError.message
            });
          }
        }
        
        // Step 3: Complete
        const totalDuration = Date.now() - startTime;
        console.log(`=== Streaming Match Completed in ${totalDuration}ms ===`);
        console.log(`Processed ${totalProcessed} jobs across ${pagesThisRequest} pages (${totalPagesToFetch} total requested)`);
        
        // Update usage stats
        const updatedUsage = limitCheck.currentUsage + totalProcessed;
        
        // Save session state if there are more pages to process
        if (hasMorePages) {
          const sessionData = {
            searchParams,
            resumeText,
            searchQuery,
            processedPages: pagesThisRequest,
            totalPages: totalPagesToFetch,
            userId,
            timestamp: Date.now(),
            allProcessedJobIds: allProcessedJobs.map(j => j.job_id)
          };
          
          cache.set(`jobsession:${streamSessionId}`, sessionData, SESSION_TTL);
          console.log(`Session saved for continuation: ${streamSessionId}`);
        }
        
        sendChunk('complete', {
          totalProcessed: totalProcessed,
          sessionInfo: {
            sessionId: hasMorePages ? streamSessionId : null,
            processedPages: pagesThisRequest,
            totalPages: totalPagesToFetch,
            hasMore: hasMorePages
          },
          usage: {
            plan: limitCheck.plan.name,
            monthly_limit: limitCheck.plan.limit === -1 ? 'unlimited' : limitCheck.plan.limit,
            monthly_used: updatedUsage,
            remaining: limitCheck.plan.limit === -1 ? 'unlimited' : Math.max(0, limitCheck.plan.limit - updatedUsage),
            credits_used: pagesThisRequest,
            pages_fetched: pagesThisRequest,
            jobs_processed: totalProcessed
          },
          timing: {
            total: totalDuration,
            fromCache: false
          },
          sessionId: sessionId
        });
        
        // Clear keepalive interval before ending
        if (keepaliveInterval) {
          clearInterval(keepaliveInterval);
        }
        
        // End the streaming response
        res.end();
        
        // Track usage
        await usageTrackingService.trackJobUsage(
          userId,
          sessionId,
          searchQuery,
          totalProcessed,
          {
            filters: searchParams,
            offset: req.body.offset || 0,
            scores: allProcessedJobs.slice(0, 10).map(j => ({ 
              id: j.job_id, 
              score: j.match_score,
              title: j.job_title 
            }))
          }
        );
        
        return; // Exit early for streaming
        
      } catch (error) {
        console.error('Streaming job search failed:', error);
        sendChunk('error', {
          message: 'Failed to complete job search',
          error: error.message
        });
        if (keepaliveInterval) clearInterval(keepaliveInterval);
        res.end();
        return;
      }
    }
    
    // Non-streaming path (original implementation)
    let searchResults;
    let matchedJobs;
    let searchError = null;
    let matchError = null;
    
    try {
      // Original non-streaming implementation
      console.log('[1/3] Searching for jobs (non-streaming)...');
      const searchStartTime = Date.now();
      
      searchResults = await jobSearchService.searchJobsForMatching({
        query: searchQuery,
        location: searchParams.location,
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
        return res.json({
          success: true,
          data: {
            jobs: [],
            totalFound: 0,
            currentPage: searchParams.page,
            totalPages: 0,
            hasMore: false,
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
        
        // Fallback
        console.log('Using fallback matching due to AI service error');
        matchedJobs = searchResults.jobs.map(job => {
          const fallbackMatch = aiMatchingService.createFallbackMatch(job, resumeText);
          return {
            ...job,
            match_score: fallbackMatch.score,
            match_label: fallbackMatch.matchLabel,
            match_reasons: fallbackMatch.matchReasons,
            missing_skills: fallbackMatch.missingSkills,
            key_strengths: fallbackMatch.keyStrengths,
            match_error: false
          };
        });
      }
      
      // Step 3: Enrich with salary data
      console.log('[3/3] Enriching with salary data...');
      const salaryStartTime = Date.now();
      
      try {
        matchedJobs = await jobSearchService.enrichJobsWithSalary(matchedJobs, {
          streaming: false,
          timeout: 5000
        });
        const salaryDuration = Date.now() - salaryStartTime;
        console.log(`[3/3] Salary enrichment completed in ${salaryDuration}ms`);
      } catch (error) {
        console.error('Salary enrichment failed (non-critical):', error.message);
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
    
    // No filtering - return ALL jobs with their scores
    const allJobsWithScores = matchedJobs || [];
    
    // Calculate timing
    const totalDuration = Date.now() - startTime;
    
    // Prepare response
    const response = {
      success: true,
      data: {
        jobs: allJobsWithScores,
        totalFound: searchResults?.totalResults || 0,
        jobsReturned: allJobsWithScores.length, // Number of jobs in this response
        currentPage: searchParams.page,
        pagesReturned: searchParams.num_pages,
        totalPages: searchResults?.totalPages || 1,
        hasMore: allJobsWithScores.length >= (searchParams.num_pages * 10), // If we got full pages, there might be more
        jobsPerPage: 10, // JSearch always returns 10 per page
        searchCriteria: {
          query: searchQuery,
          jobTitle: searchParams.jobTitle,
          location: searchParams.location,
          keywords: searchParams.keywords,
          datePosted: searchParams.date_posted,
          remote: searchParams.remote_jobs_only,
          employmentTypes: searchParams.employment_types,
          requirements: searchParams.job_requirements
        },
        timestamp: new Date().toISOString()
      },
      timing: {
        total: totalDuration,
        search: searchResults?._timing || 'N/A',
        matching: matchError ? 'failed' : 'completed',
        fromCache: false
      },
      usage: {
        credits_used: searchParams.num_pages <= 1 ? 1 : searchParams.num_pages <= 10 ? 2 : 3, // JSearch pricing tiers
        pages_fetched: searchParams.num_pages,
        jobs_processed: allJobsWithScores.length,
        ai_batches: Math.ceil(allJobsWithScores.length / 10) // Number of AI calls made
      }
    };
    
    // Add warnings if any services failed
    if (matchError) {
      response.warnings = ['AI matching unavailable - showing unscored results'];
    }
    
    // Cache successful results for 5 minutes (but not for streaming responses)
    if (!searchError && !matchError && !isStreaming) {
      cache.set(cacheKey, response, 300); // 5 minutes
    }
    
    console.log(`=== Match Request Completed in ${totalDuration}ms ===`);
    
    // Handle streaming completion
    if (isStreaming) {
      // Send final completion chunk
      sendChunk('complete', {
        totalProcessed: allJobsWithScores.length,
        usage: {
          plan: limitCheck.plan.name,
          monthly_limit: limitCheck.plan.limit === -1 ? 'unlimited' : limitCheck.plan.limit,
          monthly_used: limitCheck.currentUsage + allJobsWithScores.length,
          remaining: limitCheck.plan.limit === -1 ? 'unlimited' : Math.max(0, limitCheck.plan.limit - (limitCheck.currentUsage + allJobsWithScores.length)),
          credits_used: searchParams.num_pages <= 1 ? 1 : searchParams.num_pages <= 10 ? 2 : 3,
          pages_fetched: searchParams.num_pages,
          jobs_processed: allJobsWithScores.length,
          ai_batches: Math.ceil(allJobsWithScores.length / 5) // Updated for smaller batch size
        },
        timing: {
          total: totalDuration,
          search: searchResults?._timing || 'N/A',
          matching: matchError ? 'failed' : 'completed'
        },
        sessionId: sessionId
      });
      
      // Clear keepalive interval before ending
      if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
      }
      
      // End the streaming response
      res.end();
      
      // Still track usage
      await usageTrackingService.trackJobUsage(
        userId,
        sessionId,
        searchQuery,
        allJobsWithScores.length,
        {
          filters: searchParams,
          offset: req.body.offset || 0,
          scores: allJobsWithScores.slice(0, 10).map(j => ({ 
            id: j.job_id, 
            score: j.match_score,
            title: j.job_title 
          }))
        }
      );
      
      return; // Exit early for streaming
    }
    
    // Regular JSON response continues below...
    
    // Track usage after successful response
    await usageTrackingService.trackJobUsage(
      userId,
      sessionId,
      searchQuery,
      allJobsWithScores.length,
      {
        filters: searchParams,
        offset: req.body.offset || 0,
        scores: allJobsWithScores.slice(0, 10).map(j => ({ 
          id: j.job_id, 
          score: j.match_score,
          title: j.job_title 
        }))
      }
    );
    
    // Add usage info to response (merge with existing usage data)
    const updatedUsage = limitCheck.currentUsage + allJobsWithScores.length;
    response.usage = {
      ...response.usage, // Keep API usage data
      plan: limitCheck.plan.name,
      monthly_limit: limitCheck.plan.limit === -1 ? 'unlimited' : limitCheck.plan.limit,
      monthly_used: updatedUsage,
      remaining: limitCheck.plan.limit === -1 ? 'unlimited' : Math.max(0, limitCheck.plan.limit - updatedUsage)
    };
    response.session_id = sessionId;
    
    res.json(response);
  })
);

/**
 * Process jobs with streaming support
 * @param {Array} jobs - Jobs to process
 * @param {string} resumeText - Resume text
 * @param {Function} sendChunk - Function to send NDJSON chunks
 * @returns {Promise<Array>} Processed jobs
 */
async function processJobsWithStreaming(jobs, resumeText, sendChunk) {
  const batchSize = 5; // Process 5 jobs at a time
  const batches = [];
  
  // Create batches
  for (let i = 0; i < jobs.length; i += batchSize) {
    batches.push(jobs.slice(i, i + batchSize));
  }
  
  const totalBatches = batches.length;
  let processedCount = 0;
  const allProcessedJobs = [];
  
  // Process in smaller parallel groups for faster initial response
  const STREAMING_PARALLEL_LIMIT = 3;
  
  for (let i = 0; i < batches.length; i += STREAMING_PARALLEL_LIMIT) {
    const batchGroup = batches.slice(i, i + STREAMING_PARALLEL_LIMIT);
    
    try {
      // Process batch group in parallel
      const batchPromises = batchGroup.map(async (batch, index) => {
        const batchNumber = i + index + 1;
        const batchStartTime = Date.now();
        
        try {
          console.log(`Processing streaming batch ${batchNumber}/${totalBatches} with ${batch.length} jobs`);
          
          // Use the AI matching service to process the batch
          const scoredJobs = await aiMatchingService.processBatch(batch, resumeText);
          
          console.log(`Completed streaming batch ${batchNumber} in ${Date.now() - batchStartTime}ms`);
          return { success: true, jobs: scoredJobs, batchNumber };
          
        } catch (error) {
          console.error(`Streaming batch ${batchNumber} failed:`, error.message);
          
          // Return jobs with fallback scoring
          const fallbackJobs = batch.map(job => ({
            ...job,
            match_score: 50,
            match_label: 'PROCESSING_ERROR',
            match_reasons: ['Unable to process - showing unscored'],
            missing_skills: [],
            key_strengths: []
          }));
          
          return { 
            success: false, 
            jobs: fallbackJobs, 
            batchNumber, 
            error: error.message 
          };
        }
      });
      
      // Wait for batch group to complete
      const results = await Promise.all(batchPromises);
      
      // Send each batch result immediately
      for (const result of results) {
        processedCount += result.jobs.length;
        allProcessedJobs.push(...result.jobs);
        
        // Send jobs chunk
        sendChunk('jobs', {
          jobs: result.jobs,
          batchNumber: result.batchNumber,
          totalBatches: totalBatches
        });
        
        // Send progress update
        sendChunk('progress', {
          processed: processedCount,
          total: jobs.length,
          percentage: Math.round((processedCount / jobs.length) * 100)
        });
        
        // If batch failed, send error notification
        if (!result.success) {
          sendChunk('error', {
            message: `Batch ${result.batchNumber} partially failed`,
            batchNumber: result.batchNumber,
            error: result.error
          });
        }
      }
      
    } catch (groupError) {
      console.error('Batch group processing error:', groupError);
      sendChunk('error', {
        message: 'Some jobs could not be processed',
        error: groupError.message
      });
    }
  }
  
  return allProcessedJobs;
}

/**
 * @route   POST /api/jobs/echo-headers
 * @desc    Debug endpoint to echo request headers
 * @access  Public
 */
router.post('/echo-headers', (req, res) => {
  res.json({
    headers: req.headers,
    body: req.body,
    streaming: req.headers.accept?.includes('application/x-ndjson'),
    acceptHeader: req.headers.accept,
    contentType: req.headers['content-type'],
    authorization: req.headers.authorization ? 'Bearer [REDACTED]' : 'None',
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   POST /api/jobs/clear-cache
 * @desc    Clear job search cache (development only)
 * @access  Protected
 */
router.post('/clear-cache', authenticateSupabaseUser, (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Cache clearing disabled in production' });
  }
  
  const { pattern } = req.body;
  
  if (pattern) {
    // Clear specific pattern
    cache.clearPattern(pattern);
    res.json({ success: true, message: `Cleared cache entries matching: ${pattern}` });
  } else {
    // Clear all job-related cache
    cache.clearPattern('jobs:');
    res.json({ success: true, message: 'Cleared all job search cache' });
  }
});

/**
 * @route   GET /api/jobs/debug/active-requests
 * @desc    Debug endpoint to see active requests (development only)
 * @access  Public
 */
router.get('/debug/active-requests', (req, res) => {
  const { activeRequests } = require('../middleware/requestDeduplication');
  
  const requests = [];
  for (const [fingerprint, request] of activeRequests.entries()) {
    requests.push({
      fingerprint: fingerprint.substring(0, 8) + '...',
      userId: request.userId,
      path: request.path,
      age: Date.now() - request.timestamp,
      timestamp: new Date(request.timestamp).toISOString()
    });
  }
  
  res.json({
    activeRequests: requests.length,
    requests: requests.sort((a, b) => b.timestamp - a.timestamp),
    timestamp: new Date().toISOString()
  });
});

/**
 * Get job search usage data for the authenticated user
 * 
 * @route GET /api/jobs/usage
 * @returns {Object} Usage data including current usage, plan limits, and history
 * 
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "currentMonth": {
 *       "month": "2025-01",
 *       "totalJobsViewed": 125,
 *       "searchSessions": 15,
 *       "remaining": 175,
 *       "percentUsed": 41.67
 *     },
 *     "plan": {
 *       "name": "Plus",
 *       "limit": 300,
 *       "isUnlimited": false
 *     },
 *     "history": [
 *       {
 *         "month": "2024-12",
 *         "totalJobsViewed": 250,
 *         "searchSessions": 30
 *       }
 *     ],
 *     "recentSearches": [
 *       {
 *         "query": "software engineer",
 *         "jobsViewed": 20,
 *         "searchedAt": "2025-01-20T..."
 *       }
 *     ]
 *   }
 * }
 */
router.get('/usage',
  authenticateSupabaseUser,
  generalLimiter,
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    
    try {
      // Get current month's usage and plan
      const [limitCheck, currentStats] = await Promise.all([
        usageTrackingService.checkUserLimit(userId),
        usageTrackingService.getUserStats(userId)
      ]);
      
      // Get historical data (last 6 months)
      const history = [];
      const currentDate = new Date();
      
      for (let i = 1; i <= 6; i++) {
        const date = new Date(currentDate);
        date.setMonth(date.getMonth() - i);
        const monthYear = date.toISOString().slice(0, 7);
        
        try {
          const { data } = await supabaseAdmin
            .from('job_search_monthly_usage')
            .select('month_year, total_jobs_viewed, search_sessions')
            .eq('user_id', userId)
            .eq('month_year', monthYear)
            .single();
          
          if (data) {
            history.push({
              month: monthYear,
              totalJobsViewed: data.total_jobs_viewed,
              searchSessions: data.search_sessions
            });
          }
        } catch (err) {
          // No data for this month, skip
        }
      }
      
      // Format recent searches
      const recentSearches = currentStats.recentSearches.map(search => ({
        query: search.query,
        jobsViewed: search.jobs_viewed,
        searchedAt: search.created_at
      }));
      
      // Calculate percentage used
      const percentUsed = limitCheck.plan.isUnlimited 
        ? 0 
        : Math.round((limitCheck.currentUsage / limitCheck.plan.limit) * 100 * 100) / 100;
      
      return res.json({
        success: true,
        data: {
          currentMonth: {
            month: new Date().toISOString().slice(0, 7),
            totalJobsViewed: limitCheck.currentUsage,
            searchSessions: currentStats.searchSessions,
            totalRequests: currentStats.totalRequests,
            remaining: limitCheck.remaining,
            percentUsed,
            lastSearchAt: currentStats.lastSearchAt
          },
          plan: {
            name: limitCheck.plan.name,
            priceId: limitCheck.plan.priceId,
            limit: limitCheck.plan.limit,
            isUnlimited: limitCheck.plan.isUnlimited,
            isActive: limitCheck.plan.isActive
          },
          history: history.reverse(), // Show oldest to newest
          recentSearches: recentSearches
        }
      });
    } catch (error) {
      console.error('Failed to fetch usage data:', error);
      throw new AppError('Failed to fetch usage data', 500);
    }
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

/**
 * Handle continuation requests for session-based pagination
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} startTime - Request start time
 */
async function handleContinuationRequest(req, res, startTime) {
  const { sessionId: continueSessionId, resumeText } = req.body;
  const userId = req.userId;
  
  console.log(`=== Continuation Request for session: ${continueSessionId} ===`);
  
  // Retrieve session from cache
  const sessionKey = `jobsession:${continueSessionId}`;
  const session = cache.get(sessionKey);
  
  if (!session) {
    console.log('Session not found or expired');
    return res.status(400).json({
      success: false,
      error: 'Session expired or not found. Please start a new search.'
    });
  }
  
  // Verify user matches
  if (session.userId !== userId) {
    console.log('Unauthorized session access attempt');
    return res.status(403).json({
      success: false,
      error: 'Unauthorized access to session'
    });
  }
  
  // Check if client wants streaming response
  const acceptHeader = req.headers.accept || '';
  const isStreaming = acceptHeader.includes('application/x-ndjson');
  
  // Setup streaming response if requested
  if (isStreaming) {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Response-Type', 'stream');
    res.setHeader('X-Stream-Format', 'ndjson');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Type, X-Stream-Format, X-Response-Type');
    res.flushHeaders();
  }
  
  // Helper function to send NDJSON chunks
  const sendChunk = (type, data) => {
    if (isStreaming && !res.finished) {
      res.write(JSON.stringify({ type, data }) + '\n');
    }
  };
  
  // Start keepalive interval
  let keepaliveInterval;
  if (isStreaming) {
    keepaliveInterval = setInterval(() => {
      sendChunk('keepalive', { timestamp: Date.now() });
    }, 10000);
    
    res.on('finish', () => {
      if (keepaliveInterval) clearInterval(keepaliveInterval);
    });
    res.on('close', () => {
      if (keepaliveInterval) clearInterval(keepaliveInterval);
    });
  }
  
  try {
    // Extract session data
    const {
      searchParams,
      resumeText: sessionResumeText,
      searchQuery,
      processedPages,
      totalPages,
      allProcessedJobIds
    } = session;
    
    // Calculate next pages to process
    const startPage = processedPages + 1;
    const pagesThisRequest = Math.min(MAX_PAGES_PER_REQUEST, totalPages - processedPages);
    const endPage = startPage + pagesThisRequest - 1;
    const hasMorePages = endPage < totalPages;
    
    console.log(`Continuing from page ${startPage}, processing ${pagesThisRequest} pages`);
    
    // Send initial continuation info
    sendChunk('continuation', {
      sessionId: continueSessionId,
      startPage,
      endPage,
      totalPages,
      previouslyProcessed: processedPages,
      message: `Continuing job search from page ${startPage}`
    });
    
    let continuationJobs = [];
    let totalProcessed = 0;
    
    // Process pages
    for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
      console.log(`[Continuation ${currentPage}] Fetching page ${currentPage}/${totalPages}...`);
      
      try {
        // Fetch single page
        const pageStartTime = Date.now();
        const pageResults = await jobSearchService.searchSinglePage({
          query: searchQuery,
          location: searchParams.location,
          date_posted: searchParams.date_posted,
          remote_jobs_only: searchParams.remote_jobs_only,
          employment_types: searchParams.employment_types,
          job_requirements: searchParams.job_requirements,
          country: 'us'
        }, currentPage);
        
        const pageFetchTime = Date.now() - pageStartTime;
        console.log(`Fetched page ${currentPage} with ${pageResults.jobs?.length || 0} jobs in ${pageFetchTime}ms`);
        
        if (pageResults.jobs && pageResults.jobs.length > 0) {
          // Filter out already processed jobs
          const newJobs = pageResults.jobs.filter(job => 
            !allProcessedJobIds.includes(job.job_id)
          );
          
          if (newJobs.length > 0) {
            // Process through AI
            const matchStartTime = Date.now();
            let scoredJobs;
            
            try {
              scoredJobs = await aiMatchingService.matchJobsToResume(
                newJobs,
                resumeText || sessionResumeText
              );
            } catch (aiError) {
              console.error(`AI matching failed for continuation page ${currentPage}:`, aiError.message);
              // Use fallback scoring
              scoredJobs = newJobs.map(job => {
                const fallbackMatch = aiMatchingService.createFallbackMatch(job, resumeText || sessionResumeText);
                return {
                  ...job,
                  match_score: fallbackMatch.score,
                  match_label: fallbackMatch.matchLabel,
                  match_reasons: fallbackMatch.matchReasons,
                  missing_skills: fallbackMatch.missingSkills,
                  key_strengths: fallbackMatch.keyStrengths
                };
              });
            }
            
            const matchTime = Date.now() - matchStartTime;
            console.log(`AI matched ${newJobs.length} new jobs in ${matchTime}ms`);
            
            // Send jobs chunk
            sendChunk('jobs', {
              jobs: scoredJobs,
              batchNumber: currentPage - startPage + 1,
              totalBatches: pagesThisRequest,
              pageNumber: currentPage
            });
            
            // Update progress
            totalProcessed += scoredJobs.length;
            continuationJobs.push(...scoredJobs);
            
            sendChunk('progress', {
              processed: totalProcessed,
              total: pagesThisRequest * 10,
              percentage: Math.round(((currentPage - startPage + 1) / pagesThisRequest) * 100),
              currentPage: currentPage - startPage + 1,
              totalPages: pagesThisRequest
            });
            
            // Force flush
            if (res.flush && typeof res.flush === 'function') {
              res.flush();
            }
          }
        }
      } catch (pageError) {
        console.error(`Error processing continuation page ${currentPage}:`, pageError);
        sendChunk('error', {
          message: `Failed to process page ${currentPage}`,
          pageNumber: currentPage,
          error: pageError.message
        });
      }
    }
    
    // Update session if there are more pages
    if (hasMorePages) {
      const updatedSession = {
        ...session,
        processedPages: endPage,
        allProcessedJobIds: [
          ...allProcessedJobIds,
          ...continuationJobs.map(j => j.job_id)
        ]
      };
      
      cache.set(sessionKey, updatedSession, SESSION_TTL);
      console.log(`Session updated, processed through page ${endPage}`);
    } else {
      // Remove session if complete
      cache.del(sessionKey);
      console.log('All pages processed, session removed');
    }
    
    // Send completion
    const totalDuration = Date.now() - startTime;
    
    sendChunk('complete', {
      totalProcessed: totalProcessed,
      sessionInfo: {
        sessionId: hasMorePages ? continueSessionId : null,
        processedPages: endPage,
        totalPages: totalPages,
        hasMore: hasMorePages
      },
      timing: {
        total: totalDuration,
        fromCache: false
      }
    });
    
    // Clear keepalive
    if (keepaliveInterval) {
      clearInterval(keepaliveInterval);
    }
    
    // End streaming response
    res.end();
    
  } catch (error) {
    console.error('Continuation request failed:', error);
    sendChunk('error', {
      message: 'Failed to continue job search',
      error: error.message
    });
    if (keepaliveInterval) clearInterval(keepaliveInterval);
    res.end();
  }
}


module.exports = router;