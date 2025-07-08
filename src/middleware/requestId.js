/**
 * Request ID middleware for tracking and debugging
 * @module middleware/requestId
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Adds a unique request ID to each request for tracking
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requestIdMiddleware = (req, res, next) => {
  // Generate a unique request ID
  const requestId = req.headers['x-request-id'] || uuidv4();
  
  // Attach to request object
  req.id = requestId;
  
  // Add to response headers
  res.setHeader('X-Request-ID', requestId);
  
  // Add to logging context
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  // Override console methods to include request ID
  console.log = (...args) => {
    originalLog(`[${requestId}]`, ...args);
  };
  
  console.error = (...args) => {
    originalError(`[${requestId}]`, ...args);
  };
  
  console.warn = (...args) => {
    originalWarn(`[${requestId}]`, ...args);
  };
  
  // Restore original console methods after response
  res.on('finish', () => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  });
  
  next();
};

module.exports = { requestIdMiddleware };