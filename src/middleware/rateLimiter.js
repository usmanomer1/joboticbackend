/**
 * Rate limiting middleware for API endpoints
 * @module middleware/rateLimiter
 */

const rateLimit = require('express-rate-limit');

/**
 * Creates a rate limiter with custom configuration
 * @param {Object} options - Rate limiter options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum number of requests
 * @param {string} options.message - Error message to return
 * @returns {Function} Express rate limit middleware
 */
const createRateLimiter = (options) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      success: false,
      error: options.message || 'Too many requests, please try again later.',
      details: {
        retryAfter: options.windowMs / 1000 / 60 + ' minutes'
      }
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: options.message || 'Too many requests, please try again later.',
        details: {
          retryAfter: Math.ceil(req.rateLimit.resetTime / 1000 / 60) + ' minutes',
          limit: req.rateLimit.limit,
          remaining: req.rateLimit.remaining,
          resetTime: new Date(req.rateLimit.resetTime).toISOString()
        }
      });
    },
    skip: (req) => {
      // Skip rate limiting in test environment
      return process.env.NODE_ENV === 'test';
    }
  });
};

/**
 * General rate limiter for standard endpoints
 * Allows 100 requests per 15 minutes
 */
const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

/**
 * Strict rate limiter for AI-powered endpoints
 * Allows 10 requests per minute
 */
const aiLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: 'AI endpoint rate limit exceeded, please try again after 1 minute'
});

/**
 * Very strict rate limiter for expensive operations
 * Allows 5 requests per 5 minutes
 */
const strictLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  message: 'Rate limit exceeded for this operation, please try again after 5 minutes'
});

/**
 * Authentication rate limiter
 * Allows 5 attempts per 15 minutes
 */
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts, please try again after 15 minutes',
  skipSuccessfulRequests: true // Don't count successful requests
});

/**
 * Dynamic rate limiter that adjusts based on user type or API key
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware
 */
const dynamicRateLimiter = (options = {}) => {
  return (req, res, next) => {
    // Check for API key or user type
    const apiKey = req.headers['x-api-key'];
    const userType = req.user?.type || 'anonymous';
    
    let limiter;
    
    // Apply different limits based on user type or API key
    if (apiKey && options.apiKeyLimits && options.apiKeyLimits[apiKey]) {
      // Custom limits for specific API keys
      limiter = createRateLimiter(options.apiKeyLimits[apiKey]);
    } else if (userType === 'premium') {
      // Higher limits for premium users
      limiter = createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 500,
        message: 'Premium rate limit exceeded'
      });
    } else if (userType === 'authenticated') {
      // Standard limits for authenticated users
      limiter = createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 200,
        message: 'Authenticated user rate limit exceeded'
      });
    } else {
      // Default to general limiter for anonymous users
      limiter = generalLimiter;
    }
    
    limiter(req, res, next);
  };
};

/**
 * Creates a sliding window rate limiter
 * More accurate than fixed window but uses more memory
 * @param {Object} options - Rate limiter options
 * @returns {Function} Express rate limit middleware
 */
const slidingWindowLimiter = (options) => {
  const store = new Map();
  const windowMs = options.windowMs || 60000;
  const max = options.max || 100;
  
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Get or create request history for this IP
    if (!store.has(key)) {
      store.set(key, []);
    }
    
    const requests = store.get(key);
    
    // Remove old requests outside the window
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    
    // Check if limit exceeded
    if (validRequests.length >= max) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        details: {
          limit: max,
          windowMs: windowMs,
          remaining: 0
        }
      });
    }
    
    // Add current request
    validRequests.push(now);
    store.set(key, validRequests);
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', max - validRequests.length - 1);
    res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());
    
    next();
  };
};

module.exports = {
  generalLimiter,
  aiLimiter,
  strictLimiter,
  authLimiter,
  dynamicRateLimiter,
  slidingWindowLimiter,
  createRateLimiter
};