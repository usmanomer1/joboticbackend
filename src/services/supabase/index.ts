import { SupabaseAutomationService } from './automationService';

// Initialize the service with environment variables
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

// Create and export singleton instance
export const automationService = new SupabaseAutomationService(supabaseUrl, supabaseKey);

// Re-export types and service class
export * from './automationService';
export * from '../../types/automation.types';