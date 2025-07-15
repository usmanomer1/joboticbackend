/**
 * Supabase admin client for server-side operations
 * @module utils/supabaseAdmin
 */

const { createClient } = require('@supabase/supabase-js');

// Validate required environment variables
if (!process.env.SUPABASE_URL) {
  console.error('Missing SUPABASE_URL environment variable');
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
}

// Create Supabase admin client with service role key
// This bypasses RLS and should only be used server-side
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  }
);

/**
 * Verify user token and get user data
 * @param {string} token - JWT token from the client
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 */
async function verifyUser(token) {
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    return { user, error };
  } catch (error) {
    console.error('Error verifying user:', error);
    return { user: null, error };
  }
}

/**
 * Get user by ID (admin access)
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>}
 */
async function getUserById(userId) {
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error) {
      console.error('Error fetching user:', error);
      return null;
    }
    return user;
  } catch (error) {
    console.error('Error in getUserById:', error);
    return null;
  }
}

module.exports = {
  supabaseAdmin,
  verifyUser,
  getUserById
};