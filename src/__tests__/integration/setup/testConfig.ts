import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

// Test configuration
export const TEST_CONFIG = {
  supabase: {
    url: process.env.TEST_SUPABASE_URL || process.env.SUPABASE_URL!,
    serviceKey: process.env.TEST_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    anonKey: process.env.TEST_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!
  },
  browserbase: {
    apiKey: process.env.TEST_BROWSERBASE_API_KEY || 'test-api-key'
  },
  server: {
    port: parseInt(process.env.TEST_PORT || '3001'),
    url: process.env.TEST_SERVER_URL || 'http://localhost:3001'
  },
  websocket: {
    url: process.env.TEST_WS_URL || 'ws://localhost:3001'
  },
  redis: {
    url: process.env.TEST_REDIS_URL || 'redis://localhost:6379/1' // Use database 1 for tests
  }
};

// Global test timeout
export const TEST_TIMEOUT = 30000; // 30 seconds

// Create Supabase clients
export function createTestSupabaseClient(): SupabaseClient {
  return createClient(TEST_CONFIG.supabase.url, TEST_CONFIG.supabase.serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function createTestSupabaseAnonClient(): SupabaseClient {
  return createClient(TEST_CONFIG.supabase.url, TEST_CONFIG.supabase.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// Test user credentials
export const TEST_USERS = {
  userA: {
    email: 'test-user-a@example.com',
    password: 'test-password-123',
    id: ''
  },
  userB: {
    email: 'test-user-b@example.com',
    password: 'test-password-456',
    id: ''
  }
};