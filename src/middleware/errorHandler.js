/**
 * Global error handling middleware for the application
 * @module middleware/errorHandler
 */

/**
 * Logs error with timestamp and additional context
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 */
const logError = (err, req) => {
  const timestamp = new Date().toISOString();
  const errorLog = {
    timestamp,
    method: req.method,
    url: req.originalUrl,
    message: err.message,
    stack: err.stack,
    body: req.body,
    params: req.params,
    query: req.query,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type']
    }
  };
  
  console.error('[ERROR]', JSON.stringify(errorLog, null, 2));
};

/**
 * Custom error class for application errors
 */
class AppError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {Object} details - Additional error details
   */
  constructor(message, statusCode = 500, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handling middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  logError(err, req);
  
  // Default error values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details || {};
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error';
    details = err.details || err.errors;
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid data format';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  } else if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate entry';
    details = { field: Object.keys(err.keyValue)[0] };
  }
  
  // Check if we're in development or production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Build error response
  const errorResponse = {
    success: false,
    error: message,
    ...(isDevelopment && { 
      details: {
        ...details,
        stack: err.stack,
        originalError: err.message
      }
    }),
    ...(!isDevelopment && Object.keys(details).length > 0 && { details })
  };
  
  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Async error handler wrapper
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    details: {
      method: req.method,
      url: req.originalUrl
    }
  });
};

module.exports = {
  errorHandler,
  AppError,
  asyncHandler,
  notFoundHandler
};