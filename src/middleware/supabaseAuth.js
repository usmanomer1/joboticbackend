/**
 * Supabase authentication middleware
 * @module middleware/supabaseAuth
 */

const { verifyUser } = require('../utils/supabaseAdmin');
const { AppError } = require('./errorHandler');

/**
 * Middleware to authenticate Supabase users
 * Expects Authorization header with Bearer token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticateSupabaseUser = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No authentication token provided', 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      throw new AppError('Invalid authentication token format', 401);
    }
    
    // Verify the token with Supabase
    const { user, error } = await verifyUser(token);
    
    if (error || !user) {
      console.error('Token verification failed:', error?.message || 'No user found');
      throw new AppError('Invalid or expired authentication token', 401);
    }
    
    // Attach user to request object
    req.user = user;
    req.userId = user.id;
    
    // Log authentication for debugging (remove in production)
    if (process.env.NODE_ENV === 'development') {
      console.log(`Authenticated user: ${user.id} (${user.email})`);
    }
    
    next();
  } catch (error) {
    // Pass AppError through, convert others
    if (error instanceof AppError) {
      next(error);
    } else {
      console.error('Auth middleware error:', error);
      next(new AppError('Authentication failed', 500));
    }
  }
};

/**
 * Optional authentication middleware
 * Authenticates if token is present, but doesn't require it
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const optionalSupabaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user
      req.user = null;
      req.userId = null;
      return next();
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    if (token) {
      const { user, error } = await verifyUser(token);
      
      if (!error && user) {
        req.user = user;
        req.userId = user.id;
      } else {
        req.user = null;
        req.userId = null;
      }
    }
    
    next();
  } catch (error) {
    // Don't fail on optional auth errors
    console.error('Optional auth error:', error);
    req.user = null;
    req.userId = null;
    next();
  }
};

module.exports = {
  authenticateSupabaseUser,
  optionalSupabaseAuth
};