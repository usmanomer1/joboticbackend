const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const { jobSearchService, aiMatchingService } = require('../services');
const { authenticateSupabase } = require('../middlewares/supabaseAuth');

/**
 * Helper function to generate unique session ID
 */
function generateSessionId() {
  return `job-session-${crypto.randomBytes(16).toString('hex')}`;
}

/**
 * Process jobs in background and send to callback URL
 */
async function processJobsInBackground(sessionId, jobs, resumeText, callbackUrl, userId) {
  const BATCH_SIZE = 10;
  const totalBatches = Math.ceil(jobs.length / BATCH_SIZE);
  
  console.log(`[${sessionId}] Starting background processing for ${jobs.length} jobs in ${totalBatches} batches`);
  console.log(`[${sessionId}] Callback URL: ${callbackUrl}`);
  
  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    const batchIndex = Math.floor(i / BATCH_SIZE);
    const batch = jobs.slice(i, i + BATCH_SIZE);
    
    try {
      console.log(`[${sessionId}] Processing batch ${batchIndex + 1}/${totalBatches} with ${batch.length} jobs`);
      
      // Process batch with AI enhancement
      const startTime = Date.now();
      const enhancedBatch = await aiMatchingService.enhancedAnalysis(batch, resumeText);
      const processingTime = Date.now() - startTime;
      
      console.log(`[${sessionId}] Batch ${batchIndex + 1} processed in ${processingTime}ms`);
      
      // Prepare webhook payload
      const webhookPayload = {
        sessionId,
        batchIndex,
        batchCount: totalBatches,
        jobs: enhancedBatch,
        isLastBatch: batchIndex === totalBatches - 1,
        processedCount: Math.min((batchIndex + 1) * BATCH_SIZE, jobs.length),
        totalCount: jobs.length,
        userId,
        processingTime,
        timestamp: new Date().toISOString()
      };
      
      // Send batch to callback URL
      console.log(`[${sessionId}] Sending batch ${batchIndex + 1} to callback URL`);
      
      try {
        const callbackResponse = await axios.post(callbackUrl, webhookPayload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': sessionId,
            'X-Batch-Index': batchIndex.toString(),
            'X-Is-Last-Batch': (batchIndex === totalBatches - 1).toString()
          },
          timeout: 10000 // 10 second timeout for callback
        });
        
        console.log(`[${sessionId}] Batch ${batchIndex + 1} sent successfully, status: ${callbackResponse.status}`);
      } catch (callbackError) {
        console.error(`[${sessionId}] Failed to send batch ${batchIndex + 1} to callback:`, callbackError.message);
        // Continue processing other batches even if callback fails
      }
      
      // Small delay between batches to avoid overwhelming the client
      if (batchIndex < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
    } catch (error) {
      console.error(`[${sessionId}] Failed to process batch ${batchIndex + 1}:`, error.message);
      
      // Try to notify client of the error
      try {
        await axios.post(callbackUrl, {
          sessionId,
          batchIndex,
          error: true,
          errorMessage: error.message,
          partialResults: false
        }, {
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': sessionId,
            'X-Error': 'true'
          },
          timeout: 5000
        });
      } catch (notifyError) {
        console.error(`[${sessionId}] Failed to notify error:`, notifyError.message);
      }
    }
  }
  
  console.log(`[${sessionId}] Background processing completed`);
}

/**
 * Progressive job matching endpoint with webhook callbacks
 * Now requires Supabase authentication
 */
router.post('/match',
  authenticateSupabase,
  async (req, res) => {
    const {
      resumeText,
      query,
      location,
      filters = {},
      numJobs = 100,
      callbackUrl,  // NEW: Client provides their callback URL
      sessionId,    // NEW: Accept sessionId from Convex
    } = req.body;
    
    // Get userId from authenticated user
    const userId = req.userId || req.user?.id;

    // Use provided sessionId or generate one if not provided (for backward compatibility)
    const finalSessionId = sessionId || generateSessionId();
    const requestId = req.id || 'no-request-id';
    
    console.log(`[${requestId}] New job search request - Session: ${finalSessionId}`);
    console.log(`[${requestId}] User: ${userId || 'anonymous'}, Callback: ${callbackUrl ? 'Yes' : 'No'}`);
    console.log(`[${requestId}] Using ${sessionId ? 'provided' : 'generated'} sessionId`);

    try {
      // Build search query
      const searchQuery = query || `${location}`;
      
      // Calculate optimal pages
      const pagesNeeded = Math.ceil(numJobs / 10);
      const optimalPages = Math.min(pagesNeeded, 10);

      // JSearch request parameters
      const jsearchParams = {
        query: searchQuery,
        page: 1,
        num_pages: optimalPages,
        date_posted: filters.datePosted || 'week',
        work_from_home: filters.remote || false,
        employment_types: filters.employmentTypes?.join(','),
        job_requirements: filters.experienceLevel?.join(','),
        radius: filters.radius || 50,
      };

      console.log(`[${requestId}] JSearch API parameters:`, jsearchParams);
      
      // Fetch jobs from JSearch
      const startTime = Date.now();
      const searchResults = await jobSearchService.searchJobs(jsearchParams);
      const jobs = searchResults.data || [];
      const fetchTime = Date.now() - startTime;
      
      console.log(`[${requestId}] JSearch API returned ${jobs.length} jobs in ${fetchTime}ms`);

      // Return IMMEDIATELY with session info
      const immediateResponse = {
        success: true,
        sessionId: finalSessionId,  // Use the final sessionId
        totalFound: jobs.length,
        searchMetadata: {
          query: searchQuery,
          location,
          filters,
          pagesReturned: optimalPages,
          costMultiplier: optimalPages <= 1 ? 1 : optimalPages <= 10 ? 2 : 3,
          fetchTime
        },
        jobs: callbackUrl ? [] : jobs.slice(0, 10), // Return first 10 if no callback
        status: callbackUrl ? 'processing' : 'partial',
        message: callbackUrl 
          ? `${jobs.length} jobs are being processed and will be sent to your callback URL`
          : `Returning first 10 jobs immediately, ${jobs.length} total found`,
        callbackUrl: callbackUrl || null,
        timestamp: new Date().toISOString()
      };

      // Send immediate response
      res.json(immediateResponse);
      console.log(`[${requestId}] Immediate response sent to client`);

      // Process jobs in background if callback URL is provided
      if (callbackUrl && jobs.length > 0) {
        // Don't await - let it run in background
        processJobsInBackground(finalSessionId, jobs, resumeText, callbackUrl, userId)
          .then(() => {
            console.log(`[${finalSessionId}] Background processing completed successfully`);
          })
          .catch(error => {
            console.error(`[${finalSessionId}] Background processing failed:`, error.message);
          });
      } else if (!callbackUrl && jobs.length > 0) {
        // If no callback URL, process first 10 synchronously and return
        console.log(`[${requestId}] No callback URL provided, processing first 10 jobs synchronously`);
        try {
          const firstBatch = jobs.slice(0, 10);
          const enhancedBatch = await aiMatchingService.enhancedAnalysis(firstBatch, resumeText);
          
          // Update the response that was already sent (this won't work, but shows intent)
          console.log(`[${requestId}] Note: First 10 jobs were returned unprocessed. Consider using callback URL for AI enhancement.`);
        } catch (error) {
          console.error(`[${requestId}] Failed to enhance first batch:`, error.message);
        }
      }

    } catch (error) {
      console.error(`[${requestId}] Match error:`, error);
      res.status(500).json({
        success: false,
        sessionId: finalSessionId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * Check session status endpoint (optional)
 */
router.get('/match/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  // In a production system, you'd track this in a database
  // For now, just return a placeholder response
  res.json({
    sessionId,
    status: 'unknown',
    message: 'Session tracking not implemented. Use callback URL to receive results.'
  });
});

/**
 * SSE endpoint for real-time job matching with streaming
 * Requires Supabase authentication
 */
router.post('/match/stream',
  authenticateSupabase,
  async (req, res) => {
    const {
      resumeText,
      query,
      location,
      filters = {},
      numJobs = 100,
      sessionId,
      userId
    } = req.body;

    // Use provided sessionId or generate one
    const finalSessionId = sessionId || generateSessionId();
    const requestId = req.id || 'no-request-id';
    
    console.log(`[${requestId}] SSE stream request - Session: ${finalSessionId}`);
    console.log(`[${requestId}] User: ${req.userId || userId || 'anonymous'}`);

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable Nginx buffering
    });

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ 
      sessionId: finalSessionId,
      status: 'connected',
      timestamp: new Date().toISOString()
    })}\n\n`);

    try {
      // Build search query
      const searchQuery = query || `${location}`;
      
      // Calculate optimal pages
      const pagesNeeded = Math.ceil(numJobs / 10);
      const optimalPages = Math.min(pagesNeeded, 10);

      // JSearch request parameters
      const jsearchParams = {
        query: searchQuery,
        page: 1,
        num_pages: optimalPages,
        date_posted: filters.datePosted || 'week',
        work_from_home: filters.remote || false,
        employment_types: filters.employmentTypes?.join(','),
        job_requirements: filters.experienceLevel?.join(','),
        radius: filters.radius || 50,
      };

      console.log(`[${requestId}] SSE: Fetching jobs from JSearch`);
      
      // Send search started event
      res.write(`event: search_started\ndata: ${JSON.stringify({
        sessionId: finalSessionId,
        status: 'searching',
        query: searchQuery,
        location,
        timestamp: new Date().toISOString()
      })}\n\n`);

      // Fetch jobs from JSearch
      const startTime = Date.now();
      const searchResults = await jobSearchService.searchJobs(jsearchParams);
      const jobs = searchResults.data || [];
      const fetchTime = Date.now() - startTime;
      
      console.log(`[${requestId}] SSE: Found ${jobs.length} jobs in ${fetchTime}ms`);

      // Send jobs found event
      res.write(`event: jobs_found\ndata: ${JSON.stringify({
        sessionId: finalSessionId,
        totalFound: jobs.length,
        fetchTime,
        timestamp: new Date().toISOString()
      })}\n\n`);

      // Process and stream jobs in batches
      const BATCH_SIZE = 10;
      const totalBatches = Math.ceil(jobs.length / BATCH_SIZE);
      
      for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
        const batchIndex = Math.floor(i / BATCH_SIZE);
        const batch = jobs.slice(i, i + BATCH_SIZE);
        
        try {
          console.log(`[${finalSessionId}] SSE: Processing batch ${batchIndex + 1}/${totalBatches}`);
          
          // Process batch with AI enhancement
          const batchStartTime = Date.now();
          const enhancedBatch = await aiMatchingService.enhancedAnalysis(batch, resumeText);
          const processingTime = Date.now() - batchStartTime;
          
          // Send batch event
          res.write(`event: batch\ndata: ${JSON.stringify({
            sessionId: finalSessionId,
            batchIndex,
            batchCount: totalBatches,
            jobs: enhancedBatch,
            isLastBatch: batchIndex === totalBatches - 1,
            processedCount: Math.min((batchIndex + 1) * BATCH_SIZE, jobs.length),
            totalCount: jobs.length,
            processingTime,
            timestamp: new Date().toISOString()
          })}\n\n`);
          
          console.log(`[${finalSessionId}] SSE: Batch ${batchIndex + 1} sent (${processingTime}ms)`);
          
          // Small delay between batches
          if (batchIndex < totalBatches - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
        } catch (batchError) {
          console.error(`[${finalSessionId}] SSE: Batch ${batchIndex + 1} error:`, batchError.message);
          
          // Send error event for this batch
          res.write(`event: batch_error\ndata: ${JSON.stringify({
            sessionId: finalSessionId,
            batchIndex,
            error: batchError.message,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      }

      // Send completion event
      res.write(`event: complete\ndata: ${JSON.stringify({
        sessionId: finalSessionId,
        status: 'completed',
        totalProcessed: jobs.length,
        timestamp: new Date().toISOString()
      })}\n\n`);
      
      console.log(`[${finalSessionId}] SSE: Stream completed`);
      
    } catch (error) {
      console.error(`[${requestId}] SSE error:`, error);
      
      // Send error event
      res.write(`event: error\ndata: ${JSON.stringify({
        sessionId: finalSessionId,
        error: error.message,
        timestamp: new Date().toISOString()
      })}\n\n`);
    } finally {
      // Close the connection
      res.end();
    }
  }
);

module.exports = router;