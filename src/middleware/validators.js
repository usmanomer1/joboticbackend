/**
 * Validation middleware for Express routes
 * Handles request validation using express-validator
 */

const { validationResult } = require('express-validator');

/**
 * Middleware to check validation results
 * If validation fails, returns 400 with error details
 */
const validate = (validations) => {
  return async (req, res, next) => {
    // Run all validations
    for (let validation of validations) {
      const result = await validation.run(req);
      if (result.errors.length) break;
    }

    // Check for errors
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    // Format and return errors
    const extractedErrors = {};
    errors.array().forEach(err => {
      if (!extractedErrors[err.path]) {
        extractedErrors[err.path] = [];
      }
      extractedErrors[err.path].push(err.msg);
    });

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: extractedErrors
    });
  };
};

module.exports = {
  validate
};