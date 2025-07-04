/**
 * AI-powered job-resume matching service using Google Gemini
 * @module services/aiMatching
 */

const geminiClient = require('../utils/geminiClient');
const { AppError } = require('../middleware/errorHandler');
const cache = require('../utils/cache');

// Matching configuration
const MATCH_CONFIG = {
  BATCH_SIZE: 10,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  CACHE_TTL: 3600, // 1 hour for match results
  SCORE_WEIGHTS: {
    skills: 0.4,
    experience: 0.3,
    education: 0.2,
    location: 0.1
  }
};

// Match label thresholds
const MATCH_LABELS = {
  STRONG: { min: 90, label: 'STRONG MATCH' },
  GOOD: { min: 70, label: 'GOOD MATCH' },
  FAIR: { min: 50, label: 'FAIR MATCH' },
  WEAK: { min: 0, label: 'WEAK MATCH' }
};

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * AI Matching Service class
 */
class AIMatchingService {
  /**
   * Match jobs to resume using AI scoring
   * @param {Array} jobs - Array of job objects to match
   * @param {string} resumeText - Resume text content
   * @returns {Promise<Array>} Jobs enriched with match scores and analysis
   */
  async matchJobsToResume(jobs, resumeText) {
    if (!jobs || jobs.length === 0) {
      return [];
    }
    
    if (!resumeText || resumeText.trim().length < 50) {
      throw new AppError('Invalid resume content provided', 400);
    }
    
    console.log(`Starting AI matching for ${jobs.length} jobs`);
    
    try {
      // Check if we have cached results for this resume
      const resumeHash = this.hashResume(resumeText);
      const cacheKey = cache.makeKey('ai:matches', resumeHash, jobs.map(j => j.job_id).join(','));
      const cachedResults = cache.get(cacheKey);
      
      if (cachedResults) {
        console.log('Returning cached AI match results');
        return cachedResults;
      }
      
      // Process jobs in batches
      const allMatches = [];
      const batches = this.createBatches(jobs, MATCH_CONFIG.BATCH_SIZE);
      
      console.log(`Processing ${batches.length} batches of jobs`);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`Processing batch ${i + 1}/${batches.length} with ${batch.length} jobs`);
        
        try {
          const batchMatches = await this.processBatch(batch, resumeText);
          allMatches.push(...batchMatches);
          
          // Small delay between batches to avoid rate limiting
          if (i < batches.length - 1) {
            await sleep(1000);
          }
        } catch (error) {
          console.error(`Failed to process batch ${i + 1}:`, error.message);
          // Continue with other batches even if one fails
          // Add default scores for failed batch
          const defaultMatches = batch.map(job => ({
            jobId: job.job_id,
            score: 0,
            matchLabel: 'PROCESSING ERROR',
            matchReasons: ['Unable to analyze this job at the moment'],
            missingSkills: [],
            keyStrengths: [],
            error: true
          }));
          allMatches.push(...defaultMatches);
        }
      }
      
      // Map matches back to jobs
      const matchMap = new Map(allMatches.map(m => [m.jobId, m]));
      const enrichedJobs = jobs.map(job => {
        const match = matchMap.get(job.job_id) || {
          score: 0,
          matchLabel: 'NO MATCH DATA',
          matchReasons: [],
          missingSkills: [],
          keyStrengths: []
        };
        
        return {
          ...job,
          match_score: match.score,
          match_label: match.matchLabel,
          match_reasons: match.matchReasons,
          missing_skills: match.missingSkills,
          key_strengths: match.keyStrengths,
          match_error: match.error || false
        };
      });
      
      // Sort by score descending
      enrichedJobs.sort((a, b) => b.match_score - a.match_score);
      
      // Cache the results
      cache.set(cacheKey, enrichedJobs, MATCH_CONFIG.CACHE_TTL);
      
      console.log('AI matching completed successfully');
      return enrichedJobs;
    } catch (error) {
      console.error('AI matching service error:', error);
      throw new AppError('Failed to match jobs to resume', 500, {
        originalError: error.message
      });
    }
  }
  
  /**
   * Process a batch of jobs for matching
   * @param {Array} batch - Batch of jobs
   * @param {string} resumeText - Resume text
   * @param {number} retries - Number of retries remaining
   * @returns {Promise<Array>} Array of match results
   */
  async processBatch(batch, resumeText, retries = MATCH_CONFIG.MAX_RETRIES) {
    try {
      // Prepare the prompt
      const prompt = this.prepareBatchPrompt(batch, resumeText);
      
      // Generate AI response
      const response = await geminiClient.generateJSON(prompt, {
        temperature: 0.3, // Lower temperature for consistent scoring
        maxOutputTokens: 2048
      });
      
      // Parse and validate response
      const matches = this.parseAIResponse(response, batch);
      
      return matches;
    } catch (error) {
      console.error(`Batch processing error (${retries} retries left):`, error.message);
      
      if (retries > 0 && !error.message.includes('safety')) {
        // Exponential backoff
        const delay = MATCH_CONFIG.RETRY_DELAY * Math.pow(2, MATCH_CONFIG.MAX_RETRIES - retries);
        await sleep(delay);
        return this.processBatch(batch, resumeText, retries - 1);
      }
      
      throw error;
    }
  }
  
  /**
   * Prepare batch prompt for AI analysis
   * @param {Array} jobs - Jobs to analyze
   * @param {string} resumeText - Resume content
   * @returns {string} Formatted prompt
   */
  prepareBatchPrompt(jobs, resumeText) {
    // Simplify jobs for the prompt
    const simplifiedJobs = jobs.map(job => ({
      id: job.job_id,
      title: job.job_title,
      company: job.employer_name,
      description: this.truncateText(job.job_description || '', 500),
      requirements: {
        skills: job.job_required_skills || [],
        experience: job.job_required_experience || {},
        education: job.job_required_education || {},
        extracted: job.extracted_requirements || {}
      },
      location: {
        city: job.job_city,
        state: job.job_state,
        remote: job.job_is_remote
      },
      employmentType: job.job_employment_type
    }));
    
    const prompt = `Analyze this resume against these job descriptions.
Score each job from 0-100 based on:
- Skills match (40%): How well do the candidate's technical skills align?
- Experience relevance (30%): Does their experience match the job requirements?
- Education fit (20%): Does education level and field match?
- Location compatibility (10%): Remote/on-site preferences

Resume:
${this.truncateText(resumeText, 2000)}

Jobs to analyze:
${JSON.stringify(simplifiedJobs, null, 2)}

Return ONLY valid JSON (no markdown, no explanations):
{
  "matches": [
    {
      "jobId": "string",
      "score": 85,
      "matchLabel": "STRONG MATCH",
      "matchReasons": ["5+ years Python experience matches requirement", "Previous fintech experience relevant"],
      "missingSkills": ["Kubernetes", "AWS"],
      "keyStrengths": ["Python expertise", "Team leadership"]
    }
  ]
}

IMPORTANT RULES:
1. Score must be 0-100
2. matchLabel: 90+ = "STRONG MATCH", 70-89 = "GOOD MATCH", 50-69 = "FAIR MATCH", below 50 = "WEAK MATCH"
3. Provide 2-4 specific match reasons
4. List actual missing skills from job requirements
5. Identify 2-3 key strengths from resume relevant to each job`;
    
    return prompt;
  }
  
  /**
   * Parse and validate AI response
   * @param {Object} response - AI response object
   * @param {Array} batch - Original job batch for validation
   * @returns {Array} Validated match results
   */
  parseAIResponse(response, batch) {
    if (!response || !response.matches || !Array.isArray(response.matches)) {
      throw new AppError('Invalid AI response format', 500);
    }
    
    const validMatches = [];
    const expectedJobIds = new Set(batch.map(job => job.job_id));
    
    for (const match of response.matches) {
      // Validate match object
      if (!match.jobId || !expectedJobIds.has(match.jobId)) {
        console.warn(`Invalid job ID in AI response: ${match.jobId}`);
        continue;
      }
      
      // Validate and normalize score
      const score = this.normalizeScore(match.score);
      
      // Calculate match label if not provided or invalid
      const matchLabel = this.calculateMatchLabel(score);
      
      // Validate arrays
      const matchReasons = Array.isArray(match.matchReasons) ? match.matchReasons : [];
      const missingSkills = Array.isArray(match.missingSkills) ? match.missingSkills : [];
      const keyStrengths = Array.isArray(match.keyStrengths) ? match.keyStrengths : [];
      
      validMatches.push({
        jobId: match.jobId,
        score,
        matchLabel,
        matchReasons: matchReasons.slice(0, 4), // Limit to 4 reasons
        missingSkills: missingSkills.slice(0, 5), // Limit to 5 skills
        keyStrengths: keyStrengths.slice(0, 3) // Limit to 3 strengths
      });
    }
    
    // Add default matches for any missing jobs
    for (const job of batch) {
      if (!validMatches.find(m => m.jobId === job.job_id)) {
        console.warn(`No match data for job ${job.job_id}, adding default`);
        validMatches.push({
          jobId: job.job_id,
          score: 50,
          matchLabel: 'FAIR MATCH',
          matchReasons: ['Unable to fully analyze match'],
          missingSkills: [],
          keyStrengths: []
        });
      }
    }
    
    return validMatches;
  }
  
  /**
   * Calculate match label based on score
   * @param {number} score - Match score (0-100)
   * @returns {string} Match label
   */
  calculateMatchLabel(score) {
    if (score >= MATCH_LABELS.STRONG.min) return MATCH_LABELS.STRONG.label;
    if (score >= MATCH_LABELS.GOOD.min) return MATCH_LABELS.GOOD.label;
    if (score >= MATCH_LABELS.FAIR.min) return MATCH_LABELS.FAIR.label;
    return MATCH_LABELS.WEAK.label;
  }
  
  /**
   * Normalize score to ensure it's between 0-100
   * @param {*} score - Raw score value
   * @returns {number} Normalized score
   */
  normalizeScore(score) {
    const numScore = Number(score);
    if (isNaN(numScore)) return 50;
    return Math.max(0, Math.min(100, Math.round(numScore)));
  }
  
  /**
   * Create batches from array
   * @param {Array} items - Items to batch
   * @param {number} batchSize - Size of each batch
   * @returns {Array<Array>} Array of batches
   */
  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
  
  /**
   * Truncate text to specified length
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length
   * @returns {string} Truncated text
   */
  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
  
  /**
   * Create a hash of resume for caching
   * @param {string} resumeText - Resume content
   * @returns {string} Hash string
   */
  hashResume(resumeText) {
    // Simple hash for caching purposes
    let hash = 0;
    for (let i = 0; i < resumeText.length; i++) {
      const char = resumeText.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
  
  /**
   * Get match statistics from enriched jobs
   * @param {Array} enrichedJobs - Jobs with match scores
   * @returns {Object} Statistics object
   */
  getMatchStatistics(enrichedJobs) {
    if (!enrichedJobs || enrichedJobs.length === 0) {
      return {
        totalJobs: 0,
        averageScore: 0,
        strongMatches: 0,
        goodMatches: 0,
        fairMatches: 0,
        weakMatches: 0
      };
    }
    
    const stats = {
      totalJobs: enrichedJobs.length,
      averageScore: 0,
      strongMatches: 0,
      goodMatches: 0,
      fairMatches: 0,
      weakMatches: 0
    };
    
    let totalScore = 0;
    
    for (const job of enrichedJobs) {
      const score = job.match_score || 0;
      totalScore += score;
      
      if (score >= 90) stats.strongMatches++;
      else if (score >= 70) stats.goodMatches++;
      else if (score >= 50) stats.fairMatches++;
      else stats.weakMatches++;
    }
    
    stats.averageScore = Math.round(totalScore / stats.totalJobs);
    
    return stats;
  }
}

// Export singleton instance
module.exports = new AIMatchingService();