const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase Admin client with service role key
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);

/**
 * Middleware to authenticate requests using Supabase JWT tokens
 * Expects Authorization header with Bearer token
 */
const authenticateSupabase = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Auth check: Missing authorization header');
      return res.status(401).json({ 
        error: 'Missing or invalid authorization header' 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('Auth check: Token received, length:', token.length);

    // Verify the JWT token using the admin client
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      console.error('Supabase auth error:', error ? error.message : 'No user found');
      console.error('Full error:', error);
      return res.status(401).json({ 
        error: 'Invalid or expired token',
        details: error ? error.message : 'User not found'
      });
    }

    // Attach user to request object
    req.user = user;
    req.userId = user.id;
    
    // Log successful authentication
    console.log(`Authenticated user: ${user.email || 'unknown'} (${user.id})`);
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ 
      error: 'Authentication failed' 
    });
  }
};

/**
 * Optional middleware for routes that can work with or without auth
 * If token is provided, validates it. Otherwise continues without auth.
 */
const optionalSupabaseAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No auth provided, continue without user context
      return next();
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (!error && user) {
      req.user = user;
      req.userId = user.id;
      console.log(`Authenticated user (optional): ${user.email} (${user.id})`);
    }
    
    next();
  } catch (error) {
    // Continue without auth on error
    console.warn('Optional auth failed:', error.message);
    next();
  }
};

module.exports = {
  authenticateSupabase,
  optionalSupabaseAuth
};