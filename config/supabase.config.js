// Supabase configuration
// This file helps clean and validate environment variables

function cleanEnvVar(value) {
  if (!value) return null;
  // Remove any whitespace, newlines, quotes
  return value.trim().replace(/[\n\r"']/g, '');
}

const supabaseConfig = {
  url: cleanEnvVar(process.env.SUPABASE_URL),
  anonKey: cleanEnvVar(process.env.SUPABASE_ANON_KEY)
};

// Debug logging to help diagnose issues
console.log('Supabase Config Debug:', {
  urlFound: !!supabaseConfig.url,
  urlLength: supabaseConfig.url?.length,
  keyFound: !!supabaseConfig.anonKey,
  keyLength: supabaseConfig.anonKey?.length,
  keyHasDots: supabaseConfig.anonKey?.includes('.'),
  keySegments: supabaseConfig.anonKey?.split('.').length
});

// Validate the configuration
if (!supabaseConfig.url || !supabaseConfig.anonKey) {
  throw new Error('Supabase configuration is missing from environment variables');
}

// Validate key format (should be a JWT with 3 segments)
if (!supabaseConfig.anonKey.includes('.') || supabaseConfig.anonKey.split('.').length !== 3) {
  throw new Error('Invalid Supabase anon key format - should be a JWT token');
}

module.exports = supabaseConfig;