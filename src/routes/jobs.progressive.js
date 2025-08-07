/**
 * Progressive Job Loading Routes with Convex
 * Handles job search with background processing
 */

const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticateSupabaseUser } = require('../middleware/supabaseAuth');
const jobSearchService = require('../services/jobSearch.service');
const aiMatchingService = require('../services/aiMatching.service');
const { convex } = require('../services/convexClient');
const { api } = require('../../convex/_generated/api');

/**
 * @route   POST /api/jobs/match
 * @desc    Progressive job search with Convex background processing
 * @access  Protected (requires Supabase auth)
 */
router.post('/match',
  authenticateSupabaseUser,
  validate([
    body('query').notEmpty().withMessage('Search query is required'),
    body('resumeText').notEmpty().isLength({ min: 100 }).withMessage('Resume text is required (min 100 chars)'),
    body('location').optional().trim(),
    body('offset').optional().isInt({ min: 0 }).toInt(),
    body('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    body('sessionId').optional().isString().trim(),
  ]),
  async (req, res) => {
    try {
      const {
        query,
        location,
        resumeText,
        offset = 0,
        limit = 10,
        sessionId
      } = req.body;

      const userId = req.userId;

      // If continuing a session, return next batch from Convex
      if (sessionId) {
        try {
          // Get processed jobs from Convex
          const result = await convex.query(api.jobs.getProcessedJobs, {
            sessionId,
            offset,
            limit
          });

          if (result && result.jobs.length > 0) {
            return res.json({
              success: true,
              jobs: result.jobs,
              total: result.total,
              offset: offset,
              hasMore: result.hasMore,
              sessionId: sessionId
            });
          }
        } catch (error) {
          console.log('Session not found or expired, starting new search');
        }
      }

      // New search: fetch from JSearch API
      console.log('Starting new job search:', { query, location });
      
      const searchParams = {
        query,
        location: location || "United States",
        num_pages: 10, // Get up to 100 jobs
        date_posted: 'month',
        remote_jobs_only: false,
        employment_types: [],
        job_requirements: [],
        country: 'us'
      };

      const searchResults = await jobSearchService.searchJobsForMatching(searchParams);
      const allJobs = searchResults.jobs || [];
      
      console.log(`Found ${allJobs.length} jobs from JSearch`);

      if (allJobs.length === 0) {
        return res.json({
          success: true,
          jobs: [],
          total: 0,
          offset: 0,
          hasMore: false,
          message: 'No jobs found matching your criteria'
        });
      }

      // Create a new session in Convex
      const newSessionId = await convex.mutation(api.jobs.createJobSearchSession, {
        userId,
        query,
        location,
        resumeText,
        totalJobs: allJobs.length
      });

      console.log('Created Convex session:', newSessionId);

      // Store raw jobs in Convex for background processing
      const BATCH_SIZE = 10;
      for (let i = 0; i < allJobs.length; i += BATCH_SIZE) {
        const batch = allJobs.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE);
        
        await convex.mutation(api.jobs.storeRawJobs, {
          sessionId: newSessionId,
          jobs: batch.map(job => ({
            job_id: job.job_id,
            job_title: job.job_title,
            employer_name: job.employer_name,
            job_city: job.job_city,
            job_state: job.job_state,
            job_country: job.job_country,
            job_description: job.job_description,
            job_apply_link: job.job_apply_link,
            employer_logo: job.employer_logo,
            job_posted_at_datetime_utc: job.job_posted_at_datetime_utc,
            job_min_salary: job.job_min_salary,
            job_max_salary: job.job_max_salary
          })),
          batchNumber
        });
      }

      // Start background processing
      processJobsInBackground(newSessionId, allJobs, resumeText);

      // Immediately process first batch for instant response
      const firstBatch = allJobs.slice(0, limit);
      console.log(`Processing first batch of ${firstBatch.length} jobs`);
      
      let matchedFirstBatch;
      try {
        matchedFirstBatch = await aiMatchingService.matchJobsToResume(
          firstBatch,
          resumeText
        );
      } catch (error) {
        console.error('AI matching failed for first batch:', error);
        // Fallback: return jobs without scores
        matchedFirstBatch = firstBatch.map(job => ({
          ...job,
          match_score: 50,
          match_label: 'PENDING',
          match_reasons: ['AI processing unavailable'],
          missing_skills: [],
          key_strengths: []
        }));
      }

      // Store the processed first batch in Convex
      await convex.mutation(api.jobs.storeProcessedJobs, {
        sessionId: newSessionId,
        jobs: matchedFirstBatch.map(job => ({
          jobId: job.job_id,
          jobTitle: job.job_title,
          company: job.employer_name,
          location: job.job_city ? `${job.job_city}, ${job.job_state}` : job.job_state,
          description: job.job_description || '',
          jobUrl: job.job_apply_link,
          employerLogo: job.employer_logo,
          postedDate: job.job_posted_at_datetime_utc,
          salaryMin: job.job_min_salary,
          salaryMax: job.job_max_salary,
          matchScore: job.match_score,
          matchLabel: job.match_label,
          matchReasons: job.match_reasons,
          missingSkills: job.missing_skills,
          keyStrengths: job.key_strengths
        })),
        batchNumber: 0
      });

      return res.json({
        success: true,
        jobs: matchedFirstBatch,
        total: allJobs.length,
        offset: 0,
        hasMore: allJobs.length > limit,
        sessionId: newSessionId,
        message: `Processing ${allJobs.length} jobs in background...`
      });

    } catch (error) {
      console.error('Job search error:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to search jobs'
      });
    }
  }
);

/**
 * Background processor function
 * Processes remaining jobs through AI and stores in Convex
 */
async function processJobsInBackground(sessionId, jobs, resumeText) {
  const BATCH_SIZE = 10;
  const PARALLEL_LIMIT = 3; // Process 3 batches in parallel
  
  console.log(`Starting background processing for ${jobs.length} jobs`);
  
  // Skip the first batch (already processed)
  const remainingJobs = jobs.slice(10);
  
  // Process in batches
  for (let i = 0; i < remainingJobs.length; i += BATCH_SIZE * PARALLEL_LIMIT) {
    const batchGroup = [];
    
    // Create batch group for parallel processing
    for (let j = 0; j < PARALLEL_LIMIT && i + j * BATCH_SIZE < remainingJobs.length; j++) {
      const start = i + j * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, remainingJobs.length);
      const batch = remainingJobs.slice(start, end);
      
      if (batch.length > 0) {
        const batchNumber = Math.floor((start + 10) / BATCH_SIZE); // +10 for the first batch
        batchGroup.push({ batch, batchNumber });
      }
    }
    
    // Process batch group in parallel
    const promises = batchGroup.map(async ({ batch, batchNumber }) => {
      try {
        console.log(`Processing batch ${batchNumber} with ${batch.length} jobs`);
        
        // Process through Gemini AI
        const matchedBatch = await aiMatchingService.matchJobsToResume(batch, resumeText);
        
        // Store in Convex
        await convex.mutation(api.jobs.storeProcessedJobs, {
          sessionId,
          jobs: matchedBatch.map(job => ({
            jobId: job.job_id,
            jobTitle: job.job_title,
            company: job.employer_name,
            location: job.job_city ? `${job.job_city}, ${job.job_state}` : job.job_state,
            description: job.job_description || '',
            jobUrl: job.job_apply_link,
            employerLogo: job.employer_logo,
            postedDate: job.job_posted_at_datetime_utc,
            salaryMin: job.job_min_salary,
            salaryMax: job.job_max_salary,
            matchScore: job.match_score,
            matchLabel: job.match_label,
            matchReasons: job.match_reasons,
            missingSkills: job.missing_skills,
            keyStrengths: job.key_strengths
          })),
          batchNumber
        });
        
        console.log(`Batch ${batchNumber} processed successfully`);
      } catch (error) {
        console.error(`Batch ${batchNumber} failed:`, error);
        
        // Store jobs with default scores on error
        const fallbackBatch = batch.map(job => ({
          jobId: job.job_id,
          jobTitle: job.job_title,
          company: job.employer_name,
          location: job.job_city ? `${job.job_city}, ${job.job_state}` : job.job_state,
          description: job.job_description || '',
          jobUrl: job.job_apply_link,
          employerLogo: job.employer_logo,
          postedDate: job.job_posted_at_datetime_utc,
          salaryMin: job.job_min_salary,
          salaryMax: job.job_max_salary,
          matchScore: 50,
          matchLabel: 'ERROR',
          matchReasons: ['Processing failed'],
          missingSkills: [],
          keyStrengths: []
        }));
        
        await convex.mutation(api.jobs.storeProcessedJobs, {
          sessionId,
          jobs: fallbackBatch,
          batchNumber
        });
      }
    });
    
    // Wait for batch group to complete
    await Promise.all(promises);
    
    // Small delay between batch groups to avoid rate limits
    if (i + BATCH_SIZE * PARALLEL_LIMIT < remainingJobs.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`Background processing complete for session ${sessionId}`);
}

/**
 * @route   GET /api/jobs/session/:sessionId
 * @desc    Get session status and processed jobs
 * @access  Protected
 */
router.get('/session/:sessionId',
  authenticateSupabaseUser,
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const offset = parseInt(req.query.offset) || 0;
      const limit = parseInt(req.query.limit) || 10;

      // Get session status
      const session = await convex.query(api.jobs.getSessionStatus, { sessionId });
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      // Check if user owns this session
      if (session.userId !== req.userId) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized'
        });
      }

      // Get processed jobs
      const result = await convex.query(api.jobs.getProcessedJobs, {
        sessionId,
        offset,
        limit
      });

      return res.json({
        success: true,
        session: {
          status: session.status,
          processedCount: session.processedCount,
          totalJobs: session.totalJobs,
          createdAt: session.createdAt
        },
        jobs: result.jobs,
        total: result.total,
        offset: offset,
        hasMore: result.hasMore
      });

    } catch (error) {
      console.error('Error fetching session:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;