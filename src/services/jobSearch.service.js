/**
 * Job search service integrating with JSearch API
 * @module services/jobSearch
 */

const axios = require('axios');
const cache = require('../utils/cache');
const { AppError } = require('../middleware/errorHandler');

// JSearch API configuration
const JSEARCH_BASE_URL = 'https://jsearch.p.rapidapi.com';
const JSEARCH_HEADERS = {
  'x-rapidapi-key': process.env.RAPIDAPI_KEY,
  'x-rapidapi-host': 'jsearch.p.rapidapi.com'
};

// Cache TTL configurations
const CACHE_TTL = {
  SEARCH: 7200,        // 2 hours for search results
  JOB_DETAILS: 7200,   // 2 hours for job details
  SALARY: 86400        // 24 hours for salary data
};

// Retry configuration
const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000, // 1 second
  MAX_DELAY: 10000     // 10 seconds
};

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Execute request with exponential backoff retry
 * @param {Function} requestFn - Function that returns axios promise
 * @param {number} retries - Number of retries remaining
 * @returns {Promise} Response data
 */
const executeWithRetry = async (requestFn, retries = RETRY_CONFIG.MAX_RETRIES) => {
  try {
    const response = await requestFn();
    return response.data;
  } catch (error) {
    const isRateLimit = error.response?.status === 429;
    const isServerError = error.response?.status >= 500;
    const shouldRetry = (isRateLimit || isServerError) && retries > 0;
    
    if (shouldRetry) {
      const delay = Math.min(
        RETRY_CONFIG.INITIAL_DELAY * Math.pow(2, RETRY_CONFIG.MAX_RETRIES - retries),
        RETRY_CONFIG.MAX_DELAY
      );
      
      console.log(`Retrying after ${delay}ms... (${retries} retries left)`);
      await sleep(delay);
      return executeWithRetry(requestFn, retries - 1);
    }
    
    throw error;
  }
};

/**
 * Job search service class
 */
class JobSearchService {
  /**
   * Search for jobs using JSearch API
   * @param {Object} params - Search parameters
   * @param {string} params.query - Search query
   * @param {number} params.page - Page number
   * @param {number} params.num_pages - Number of pages to fetch
   * @param {string} params.date_posted - Date filter
   * @param {boolean} params.remote_jobs_only - Remote only filter
   * @param {string[]} params.employment_types - Employment type filters
   * @param {string[]} params.job_requirements - Experience/degree requirements
   * @param {string} params.country - Country code (default: 'us')
   * @returns {Promise<Object>} Search results
   */
  async searchJobs(params) {
    try {
      // Build cache key from all parameters
      const cacheKey = cache.makeKey(
        'jobs:search',
        params.query,
        params.page || 1,
        params.num_pages || 1,
        params.date_posted || 'all',
        params.remote_jobs_only || false,
        JSON.stringify(params.employment_types || []),
        JSON.stringify(params.job_requirements || []),
        params.country || 'us'
      );
      
      // Check cache first
      const cachedData = cache.get(cacheKey);
      if (cachedData) {
        console.log('Returning cached job search results');
        return cachedData;
      }
      
      // Prepare request parameters
      const requestParams = {
        query: params.query,
        page: params.page || 1,
        num_pages: params.num_pages || 1,
        country: params.country || 'us'
      };
      
      // Add optional parameters
      if (params.date_posted && params.date_posted !== 'all') {
        requestParams.date_posted = params.date_posted;
      }
      
      if (params.remote_jobs_only) {
        requestParams.work_from_home = true;
      }
      
      if (params.employment_types && params.employment_types.length > 0) {
        requestParams.employment_types = params.employment_types.join(',');
      }
      
      if (params.job_requirements && params.job_requirements.length > 0) {
        requestParams.job_requirements = params.job_requirements.join(',');
      }
      
      // Execute request with retry
      const response = await executeWithRetry(() => 
        axios.get(`${JSEARCH_BASE_URL}/search`, {
          headers: JSEARCH_HEADERS,
          params: requestParams
        })
      );
      
      // Transform and enhance response
      const transformedResponse = {
        success: true,
        data: response.data || [],
        parameters: response.parameters || {},
        request_id: response.request_id,
        status: response.status || 'OK',
        jobs: (response.data || []).map(job => this.transformJobResponse(job)),
        totalResults: response.parameters?.total_results || 0,
        currentPage: params.page || 1,
        totalPages: Math.ceil((response.parameters?.total_results || 0) / 10)
      };
      
      // Cache the results
      cache.set(cacheKey, transformedResponse, CACHE_TTL.SEARCH);
      
      return transformedResponse;
    } catch (error) {
      console.error('Job search error:', error.response?.data || error.message);
      
      // Try to return cached data on failure
      const fallbackCacheKey = cache.makeKey('jobs:search', params.query);
      const fallbackData = cache.get(fallbackCacheKey);
      
      if (fallbackData) {
        console.log('Returning fallback cached data due to API error');
        return { ...fallbackData, fromCache: true };
      }
      
      throw new AppError(
        error.response?.data?.message || 'Failed to search jobs',
        error.response?.status || 500,
        {
          originalError: error.message,
          endpoint: 'search',
          params
        }
      );
    }
  }
  
  /**
   * Get detailed job information
   * @param {string} jobId - JSearch job ID
   * @param {string} country - Country code (default: 'us')
   * @returns {Promise<Object>} Job details
   */
  async getJobDetails(jobId, country = 'us') {
    try {
      // Check cache first
      const cacheKey = cache.makeKey('jobs:details', jobId, country);
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        console.log('Returning cached job details');
        return cachedData;
      }
      
      // Execute request with retry
      const response = await executeWithRetry(() =>
        axios.get(`${JSEARCH_BASE_URL}/job-details`, {
          headers: JSEARCH_HEADERS,
          params: {
            job_id: jobId,
            country: country
          }
        })
      );
      
      // Transform response
      const jobDetails = {
        success: true,
        data: response.data?.[0] || null,
        request_id: response.request_id,
        status: response.status || 'OK'
      };
      
      if (jobDetails.data) {
        jobDetails.data = this.transformJobResponse(jobDetails.data);
      }
      
      // Cache the results
      cache.set(cacheKey, jobDetails, CACHE_TTL.JOB_DETAILS);
      
      return jobDetails;
    } catch (error) {
      console.error('Job details error:', error.response?.data || error.message);
      
      throw new AppError(
        error.response?.data?.message || 'Failed to get job details',
        error.response?.status || 500,
        {
          originalError: error.message,
          endpoint: 'job-details',
          jobId
        }
      );
    }
  }
  
  /**
   * Get estimated salary for a job title and location
   * @param {string} jobTitle - Job title
   * @param {string} location - Location
   * @param {string} locationType - Location type (default: 'ANY')
   * @returns {Promise<Object>} Salary estimates
   */
  async getEstimatedSalary(jobTitle, location, locationType = 'ANY') {
    try {
      // Check cache first
      const cacheKey = cache.makeKey('jobs:salary', jobTitle, location, locationType);
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        console.log('Returning cached salary data');
        return cachedData;
      }
      
      // Execute request with retry
      const response = await executeWithRetry(() =>
        axios.get(`${JSEARCH_BASE_URL}/estimated-salary`, {
          headers: JSEARCH_HEADERS,
          params: {
            job_title: jobTitle,
            location: location,
            location_type: locationType
          }
        })
      );
      
      // Transform response
      const salaryData = {
        success: true,
        data: response.data || {},
        request_id: response.request_id,
        status: response.status || 'OK',
        jobTitle,
        location,
        salaryEstimates: {
          min: response.data?.min_salary || null,
          max: response.data?.max_salary || null,
          median: response.data?.median_salary || null,
          average: response.data?.average_salary || null,
          currency: response.data?.currency || 'USD',
          salaryPeriod: response.data?.salary_period || 'YEAR',
          dataPoints: response.data?.data_points || 0,
          lastUpdated: new Date().toISOString()
        }
      };
      
      // Cache for 24 hours
      cache.set(cacheKey, salaryData, CACHE_TTL.SALARY);
      
      return salaryData;
    } catch (error) {
      console.error('Salary estimate error:', error.response?.data || error.message);
      
      // Return null salary data instead of throwing on salary endpoint failure
      return {
        success: false,
        error: 'Salary data unavailable',
        jobTitle,
        location,
        salaryEstimates: {
          min: null,
          max: null,
          median: null,
          average: null,
          currency: 'USD',
          salaryPeriod: 'YEAR',
          dataPoints: 0
        }
      };
    }
  }
  
  /**
   * Build search query from components
   * @param {string} jobTitle - Job title
   * @param {string} location - Location
   * @param {string[]} keywords - Additional keywords
   * @returns {string} Combined search query
   */
  buildSearchQuery(jobTitle, location, keywords = []) {
    const parts = [];
    
    // Handle null/undefined values
    if (jobTitle && jobTitle.trim()) {
      parts.push(jobTitle.trim());
    }
    
    if (location && location.trim()) {
      parts.push(location.trim());
    }
    
    if (keywords && Array.isArray(keywords)) {
      const validKeywords = keywords
        .filter(k => k && typeof k === 'string' && k.trim())
        .map(k => k.trim());
      parts.push(...validKeywords);
    }
    
    // Join with space and clean up multiple spaces
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }
  
  /**
   * Search jobs optimized for AI matching
   * @param {Object} params - Search parameters
   * @returns {Promise<Object>} Search results with cleaned data for AI
   */
  async searchJobsForMatching(params) {
    try {
      console.log('Searching jobs for AI matching:', params.query);
      
      // Use the num_pages from params (already validated in routes)
      const searchParams = {
        ...params,
        page: params.page || 1
      };
      
      // Perform search
      const searchResults = await this.searchJobs(searchParams);
      
      // Process jobs for AI matching
      const processedJobs = (searchResults.jobs || []).map(job => {
        // Strip HTML from description for AI processing
        const cleanDescription = this.stripHtml(job.job_description || '');
        
        // Extract key requirements from highlights for AI
        const requirements = this.extractRequirements(job.job_highlights);
        
        // Return ALL fields from JSearch API plus our additions
        return {
          ...job, // Preserve ALL original fields from JSearch
          
          // Override description with clean version for AI
          job_description_clean: cleanDescription,
          
          // Add our extracted/calculated fields
          extracted_requirements: requirements,
          
          // Placeholders for AI results
          match_score: null,
          match_label: null,
          match_reasons: [],
          missing_skills: []
        };
      });
      
      return {
        ...searchResults,
        jobs: processedJobs,
        optimizedForMatching: true
      };
    } catch (error) {
      console.error('Search for matching error:', error);
      throw error;
    }
  }
  
  /**
   * Enrich jobs with salary estimates
   * @param {Array} jobs - Array of job objects
   * @returns {Promise<Array>} Jobs with salary data
   */
  async enrichJobsWithSalary(jobs) {
    if (!jobs || jobs.length === 0) return jobs;
    
    try {
      // Extract unique job title/location combinations
      const salaryQueries = new Map();
      
      jobs.forEach(job => {
        if (job.job_title && (job.job_city || job.job_state)) {
          const location = job.job_city ? `${job.job_city}, ${job.job_state}` : job.job_state;
          const key = `${job.job_title}::${location}`;
          
          if (!salaryQueries.has(key)) {
            salaryQueries.set(key, {
              jobTitle: job.job_title,
              location: location,
              jobIds: []
            });
          }
          
          salaryQueries.get(key).jobIds.push(job.job_id);
        }
      });
      
      console.log(`Enriching ${salaryQueries.size} unique job/location combinations with salary data`);
      
      // Process in batches of 5
      const salaryResults = new Map();
      const queries = Array.from(salaryQueries.values());
      
      for (let i = 0; i < queries.length; i += 5) {
        const batch = queries.slice(i, i + 5);
        
        // Fetch salary data in parallel for this batch
        const batchPromises = batch.map(async query => {
          try {
            const salaryData = await this.getEstimatedSalary(
              query.jobTitle,
              query.location
            );
            
            if (salaryData.success) {
              return {
                key: `${query.jobTitle}::${query.location}`,
                data: salaryData.salaryEstimates
              };
            }
            
            return null;
          } catch (error) {
            console.error(`Failed to get salary for ${query.jobTitle} in ${query.location}:`, error.message);
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Store results
        batchResults.forEach(result => {
          if (result) {
            salaryResults.set(result.key, result.data);
          }
        });
        
        // Small delay between batches to avoid rate limiting
        if (i + 5 < queries.length) {
          await sleep(500);
        }
      }
      
      // Apply salary data to jobs
      const enrichedJobs = jobs.map(job => {
        if (job.job_title && (job.job_city || job.job_state)) {
          const location = job.job_city ? `${job.job_city}, ${job.job_state}` : job.job_state;
          const key = `${job.job_title}::${location}`;
          const salaryData = salaryResults.get(key);
          
          if (salaryData) {
            return {
              ...job,
              salary_estimate: salaryData
            };
          }
        }
        
        return job;
      });
      
      console.log(`Successfully enriched ${salaryResults.size} job/location combinations`);
      
      return enrichedJobs;
    } catch (error) {
      console.error('Error enriching jobs with salary:', error);
      // Return original jobs on error
      return jobs;
    }
  }
  
  /**
   * Strip HTML tags from text
   * @param {string} html - HTML string
   * @returns {string} Plain text
   */
  stripHtml(html) {
    if (!html) return '';
    
    // Remove HTML tags
    let text = html.replace(/<[^>]*>/g, ' ');
    
    // Decode HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, ' ');
    
    // Clean up whitespace
    return text.replace(/\s+/g, ' ').trim();
  }
  
  /**
   * Extract requirements from job highlights
   * @param {Object} highlights - Job highlights object
   * @returns {Object} Extracted requirements
   */
  extractRequirements(highlights) {
    const requirements = {
      qualifications: [],
      responsibilities: [],
      benefits: [],
      skills: []
    };
    
    if (!highlights) return requirements;
    
    // Extract qualifications
    if (highlights.Qualifications && Array.isArray(highlights.Qualifications)) {
      requirements.qualifications = highlights.Qualifications.map(q => this.stripHtml(q));
    }
    
    // Extract responsibilities
    if (highlights.Responsibilities && Array.isArray(highlights.Responsibilities)) {
      requirements.responsibilities = highlights.Responsibilities.map(r => this.stripHtml(r));
    }
    
    // Extract benefits
    if (highlights.Benefits && Array.isArray(highlights.Benefits)) {
      requirements.benefits = highlights.Benefits.map(b => this.stripHtml(b));
    }
    
    // Try to extract skills from qualifications
    requirements.skills = this.extractSkillsFromText([
      ...requirements.qualifications,
      ...requirements.responsibilities
    ].join(' '));
    
    return requirements;
  }
  
  /**
   * Extract skills from text using common patterns
   * @param {string} text - Text to analyze
   * @returns {Array<string>} Extracted skills
   */
  extractSkillsFromText(text) {
    if (!text) return [];
    
    const skills = new Set();
    
    // Common programming languages and technologies
    const techPatterns = [
      /\b(JavaScript|TypeScript|Python|Java|C\+\+|C#|Ruby|Go|Rust|Swift|Kotlin|PHP|Scala)\b/gi,
      /\b(React|Angular|Vue|Node\.js|Express|Django|Flask|Spring|Rails|Laravel)\b/gi,
      /\b(AWS|Azure|GCP|Docker|Kubernetes|Jenkins|Git|CI\/CD|DevOps)\b/gi,
      /\b(MongoDB|PostgreSQL|MySQL|Redis|Elasticsearch|DynamoDB|SQL|NoSQL)\b/gi,
      /\b(REST|GraphQL|API|Microservices|Serverless|Cloud)\b/gi,
      /\b(Machine Learning|AI|Data Science|Deep Learning|NLP|Computer Vision)\b/gi
    ];
    
    techPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => skills.add(match));
      }
    });
    
    return Array.from(skills);
  }
  
  /**
   * Transform JSearch job response to our format
   * @param {Object} jsearchJob - Raw job from JSearch API
   * @returns {Object} Transformed job object
   */
  transformJobResponse(jsearchJob) {
    return {
      // Core fields from JSearch
      job_id: jsearchJob.job_id,
      employer_name: jsearchJob.employer_name,
      employer_logo: jsearchJob.employer_logo,
      employer_website: jsearchJob.employer_website,
      employer_company_type: jsearchJob.employer_company_type,
      job_publisher: jsearchJob.job_publisher,
      job_employment_type: jsearchJob.job_employment_type,
      job_title: jsearchJob.job_title,
      job_apply_link: jsearchJob.job_apply_link,
      job_apply_is_direct: jsearchJob.job_apply_is_direct,
      job_apply_quality_score: jsearchJob.job_apply_quality_score,
      job_description: jsearchJob.job_description,
      job_is_remote: jsearchJob.job_is_remote,
      job_posted_at_timestamp: jsearchJob.job_posted_at_timestamp,
      job_posted_at_datetime_utc: jsearchJob.job_posted_at_datetime_utc,
      job_city: jsearchJob.job_city,
      job_state: jsearchJob.job_state,
      job_country: jsearchJob.job_country,
      job_latitude: jsearchJob.job_latitude,
      job_longitude: jsearchJob.job_longitude,
      job_benefits: jsearchJob.job_benefits,
      job_google_link: jsearchJob.job_google_link,
      job_offer_expiration_datetime_utc: jsearchJob.job_offer_expiration_datetime_utc,
      job_offer_expiration_timestamp: jsearchJob.job_offer_expiration_timestamp,
      job_required_experience: jsearchJob.job_required_experience,
      job_required_skills: jsearchJob.job_required_skills,
      job_required_education: jsearchJob.job_required_education,
      job_experience_in_place_of_education: jsearchJob.job_experience_in_place_of_education,
      job_min_salary: jsearchJob.job_min_salary,
      job_max_salary: jsearchJob.job_max_salary,
      job_salary_currency: jsearchJob.job_salary_currency,
      job_salary_period: jsearchJob.job_salary_period,
      job_highlights: jsearchJob.job_highlights,
      job_job_title: jsearchJob.job_job_title,
      job_posting_language: jsearchJob.job_posting_language,
      job_onet_soc: jsearchJob.job_onet_soc,
      job_onet_job_zone: jsearchJob.job_onet_job_zone,
      
      // Additional fields for our system
      match_score: null,           // Will be populated by AI matching service
      match_label: null,           // Will be populated by AI matching service
      match_reasons: [],           // Will be populated by AI matching service
      missing_skills: [],          // Will be populated by AI matching service
      salary_estimate: null,       // Can be populated with salary API data
      application_deadline_days: this.calculateDeadlineDays(jsearchJob.job_offer_expiration_timestamp),
      posted_days_ago: this.calculateDaysAgo(jsearchJob.job_posted_at_timestamp),
      location_display: this.formatLocation(jsearchJob)
    };
  }
  
  /**
   * Calculate days until application deadline
   * @param {number} expirationTimestamp - Unix timestamp
   * @returns {number|null} Days until deadline
   */
  calculateDeadlineDays(expirationTimestamp) {
    if (!expirationTimestamp) return null;
    
    const now = Date.now() / 1000;
    const daysUntil = Math.ceil((expirationTimestamp - now) / 86400);
    
    return daysUntil > 0 ? daysUntil : 0;
  }
  
  /**
   * Calculate how many days ago job was posted
   * @param {number} postedTimestamp - Unix timestamp
   * @returns {number} Days since posted
   */
  calculateDaysAgo(postedTimestamp) {
    if (!postedTimestamp) return 0;
    
    const now = Date.now() / 1000;
    return Math.floor((now - postedTimestamp) / 86400);
  }
  
  /**
   * Format location for display
   * @param {Object} job - Job object
   * @returns {string} Formatted location
   */
  formatLocation(job) {
    const parts = [];
    
    if (job.job_city) parts.push(job.job_city);
    if (job.job_state) parts.push(job.job_state);
    if (job.job_country && job.job_country !== 'US') parts.push(job.job_country);
    
    if (job.job_is_remote) {
      return parts.length > 0 ? `Remote / ${parts.join(', ')}` : 'Remote';
    }
    
    return parts.join(', ') || 'Location not specified';
  }
  
  /**
   * Handle pagination info from response
   * @param {Object} response - API response
   * @param {number} currentPage - Current page number
   * @returns {Object} Pagination metadata
   */
  handlePagination(response, currentPage) {
    const totalResults = response.parameters?.total_results || 0;
    const resultsPerPage = response.data?.length || 10;
    const totalPages = Math.ceil(totalResults / resultsPerPage);
    
    return {
      currentPage,
      totalPages,
      totalResults,
      resultsPerPage,
      hasNextPage: currentPage < totalPages,
      hasPreviousPage: currentPage > 1,
      nextPage: currentPage < totalPages ? currentPage + 1 : null,
      previousPage: currentPage > 1 ? currentPage - 1 : null
    };
  }
}

// Export singleton instance
module.exports = new JobSearchService();