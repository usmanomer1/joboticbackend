const express = require('express');
const router = express.Router();
const { jobSearchService, aiMatchingService } = require('../services');

/**
 * Simple endpoint - no auth needed!
 * Convex already verified the user
 */
router.post('/match',
  // NO authenticateSupabaseUser middleware!
  async (req, res) => {
    const {
      resumeText,
      query,
      location,
      filters = {},
      numJobs = 100,
      userId // Optional, just for logging
    } = req.body;

    try {
      console.log(`Processing job search for user: ${userId || 'anonymous'}`);
      
      // Build search query
      const searchQuery = query || `${location}`;
      
      // Calculate optimal pages
      const pagesNeeded = Math.ceil(numJobs / 10);
      const optimalPages = Math.min(pagesNeeded, 10);

      // JSearch request
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

      const searchResults = await jobSearchService.searchJobs(jsearchParams);
      const jobs = searchResults.data || [];

      // AI enrichment
      const BATCH_SIZE = 10;
      const enrichedJobs = [];
      
      for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
        const batch = jobs.slice(i, i + BATCH_SIZE);
        const enrichedBatch = await aiMatchingService.enhancedAnalysis(
          batch,
          resumeText
        );
        enrichedJobs.push(...enrichedBatch);
      }

      // Just return data - no auth, no session management
      res.json({
        success: true,
        jobs: enrichedJobs,
        totalFound: searchResults.total_num_results,
        searchMetadata: {
          query: searchQuery,
          pagesReturned: optimalPages,
          costMultiplier: optimalPages <= 1 ? 1 : optimalPages <= 10 ? 2 : 3,
        },
      });

    } catch (error) {
      console.error('Match error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

module.exports = router;