/**
 * Authentication middleware for API key validation
 */

const authenticateApiKey = (req, res, next) => {
  // Skip authentication in development ONLY if explicitly enabled
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    console.warn('⚠️  WARNING: Authentication is disabled in development mode');
    return next();
  }

  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required',
      details: {
        header: 'X-API-Key',
        message: 'Include your API key in the X-API-Key header'
      }
    });
  }

  if (apiKey !== process.env.API_KEY) {
    return res.status(403).json({
      success: false,
      error: 'Invalid API key',
      details: {
        message: 'The provided API key is invalid'
      }
    });
  }

  next();
};

module.exports = { authenticateApiKey };