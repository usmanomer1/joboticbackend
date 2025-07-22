import { BrowserbaseSessionManager, createBrowserbaseSessionManager } from './sessionManager';
import { automationService } from '../supabase';
import { AutomationHelpers } from '../supabase/automationHelpers';
import { createClient } from '@supabase/supabase-js';

// Create helpers instance
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
const helpers = new AutomationHelpers(supabase);

// Create and export singleton instance
export const browserbaseSessionManager = createBrowserbaseSessionManager(
  automationService,
  helpers
);

// Re-export types and classes
export { BrowserbaseSessionManager } from './sessionManager';
export type { JobSearchConfig } from '../../types/automation.types';