/**
 * Async handler wrapper for Express routes
 * Catches async errors and passes them to error handling middleware
 */

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;