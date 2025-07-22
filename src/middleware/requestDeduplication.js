/**
 * Request deduplication middleware
 * Prevents duplicate processing of identical requests
 */

const crypto = require('crypto');

// Store for active requests
const activeRequests = new Map();

// Request timeout (30 seconds - much shorter for job searches)
const REQUEST_TIMEOUT = 30 * 1000;

/**
 * Generate a unique request fingerprint
 * @param {Object} req - Express request object
 * @returns {string} Request fingerprint
 */
function generateRequestFingerprint(req) {
  const userId = req.userId || 'anonymous';
  const body = req.body || {};
  
  // Create fingerprint from critical request parameters
  const fingerprintData = {
    userId,
    path: req.path,
    method: req.method,
    // For job matching, use resume hash and search params
    resumeHash: body.resumeText ? crypto.createHash('md5').update(body.resumeText).digest('hex') : null,
    query: body.query || body.preferences?.query,
    jobTitle: body.jobTitle || body.preferences?.jobTitle,
    location: body.location || body.preferences?.location || 'NO_LOCATION',
    page: body.page || 1,
    numPages: body.num_pages || body.preferences?.numPages || 1,
    datePosted: body.date_posted || body.preferences?.datePosted,
    remote: body.remote_jobs_only || body.preferences?.remote,
    employmentTypes: JSON.stringify(body.employment_types || body.preferences?.employmentTypes || []),
    requirements: JSON.stringify(body.job_requirements || body.preferences?.jobRequirements || []),
    // Add session_id to fingerprint to differentiate searches
    sessionId: body.session_id || null
  };
  
  // Debug logging for duplicate detection issues
  if (process.env.NODE_ENV !== 'production') {
    console.log('Request fingerprint data:', {
      query: fingerprintData.query,
      location: fingerprintData.location,
      page: fingerprintData.page
    });
  }
  
  // Create hash of fingerprint data
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(fingerprintData))
    .digest('hex');
}

/**
 * Clean up expired requests
 */
function cleanupExpiredRequests() {
  const now = Date.now();
  for (const [fingerprint, request] of activeRequests.entries()) {
    if (now - request.timestamp > REQUEST_TIMEOUT) {
      console.log(`Cleaning up expired request: ${fingerprint}`);
      activeRequests.delete(fingerprint);
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredRequests, 60 * 1000);

/**
 * Request deduplication middleware
 * @param {Object} options - Middleware options
 * @param {boolean} options.waitForResult - Whether to wait for duplicate request to complete
 * @returns {Function} Express middleware
 */
function requestDeduplication(options = {}) {
  const { waitForResult = true } = options;
  
  return async (req, res, next) => {
    // Skip deduplication for GET requests and non-match endpoints
    if (req.method === 'GET' || !req.path.includes('/match')) {
      return next();
    }
    
    const fingerprint = generateRequestFingerprint(req);
    const existingRequest = activeRequests.get(fingerprint);
    
    if (existingRequest) {
      const requestAge = Date.now() - existingRequest.timestamp;
      console.log(`Duplicate request detected: ${fingerprint}`);
      console.log(`Original request started ${requestAge}ms ago`);
      
      // If the existing request is old (> 20 seconds), allow new request
      if (requestAge > 20000) {
        console.log('Existing request is stale, allowing new request');
        activeRequests.delete(fingerprint);
      } else if (waitForResult && existingRequest.promise) {
        try {
          // Wait for the original request to complete
          console.log('Waiting for original request to complete...');
          const result = await existingRequest.promise;
          
          // Send the same result
          console.log('Returning result from original request');
          return res.json(result);
        } catch (error) {
          console.error('Original request failed:', error);
          // Continue with new request if original failed
        }
      } else {
        // Return immediate response for duplicate
        return res.status(429).json({
          success: false,
          error: 'Duplicate request already in progress',
          message: 'A similar request is already being processed. Please wait for it to complete.',
          retryAfter: Math.ceil((20000 - requestAge) / 1000) // Seconds until stale
        });
      }
    }
    
    // Create a promise that will be resolved when request completes
    let resolvePromise, rejectPromise;
    const requestPromise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    
    // Store request info
    activeRequests.set(fingerprint, {
      timestamp: Date.now(),
      promise: requestPromise,
      userId: req.userId,
      path: req.path
    });
    
    // Attach cleanup handlers
    req.on('close', () => {
      console.log(`Request closed: ${fingerprint}`);
      activeRequests.delete(fingerprint);
      rejectPromise(new Error('Request closed'));
    });
    
    req.on('error', (error) => {
      console.log(`Request error: ${fingerprint}`, error);
      activeRequests.delete(fingerprint);
      rejectPromise(error);
    });
    
    // Override res.json to capture response
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      // Clean up and resolve promise
      activeRequests.delete(fingerprint);
      resolvePromise(data);
      
      // Send response
      return originalJson(data);
    };
    
    // Override res.status for error responses
    const originalStatus = res.status.bind(res);
    res.status = function(code) {
      const chainable = originalStatus(code);
      const originalChainJson = chainable.json.bind(chainable);
      
      chainable.json = function(data) {
        // Clean up and reject promise for error responses
        activeRequests.delete(fingerprint);
        if (code >= 400) {
          // Create error but handle it gracefully
          const error = new Error(data.error || 'Request failed');
          error.statusCode = code;
          error.data = data;
          
          // Reject promise but catch it to prevent unhandled rejection
          rejectPromise(error);
          
          // Ensure the promise rejection is handled
          if (requestPromise && requestPromise.catch) {
            requestPromise.catch(() => {
              // Already logged, just prevent unhandled rejection
            });
          }
        } else {
          resolvePromise(data);
        }
        
        return originalChainJson(data);
      };
      
      return chainable;
    };
    
    // Continue with request
    next();
  };
}

module.exports = {
  requestDeduplication,
  generateRequestFingerprint,
  activeRequests
};