// Supabase configuration
// This file provides a fallback for environment variables

const config = {
  // Primary: Use environment variables
  url: process.env.SUPABASE_URL?.trim(),
  anonKey: process.env.SUPABASE_ANON_KEY?.trim(),
  
  // Fallback: Hardcoded values (for Railway issues)
  fallback: {
    url: 'https://fwtazrqqrtqmcsdzzdmi.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3dGF6cnFxcnRxbWNzZHp6ZG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2MzEwNjQsImV4cCI6MjA2NzIwNzA2NH0.ks-Jta2Zx3ZfjU_69nG5auJczJCPVRCpcGAIdY_2_88'
  }
};

// Use fallback if env vars are missing or invalid
const supabaseConfig = {
  url: config.url || config.fallback.url,
  anonKey: config.anonKey || config.fallback.anonKey
};

// Validate the configuration
if (!supabaseConfig.url || !supabaseConfig.anonKey) {
  throw new Error('Supabase configuration is missing');
}

// Validate key format (should be a JWT)
if (!supabaseConfig.anonKey.includes('.') || supabaseConfig.anonKey.length < 100) {
  console.error('Invalid Supabase key format detected, using fallback');
  supabaseConfig.anonKey = config.fallback.anonKey;
}

module.exports = supabaseConfig;