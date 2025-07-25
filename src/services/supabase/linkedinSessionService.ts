import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface LinkedInSession {
  id: string;
  user_id: string;
  browserbase_session_id: string;
  status: 'active' | 'completed' | 'failed' | 'expired' | 'intervention_required';
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  live_view_url?: string;
  config?: any; // Job search configuration
  created_at: string;
  updated_at: string;
}

export interface JobApplication {
  id: string;
  user_id: string;
  session_id: string;
  job_url: string;
  job_id?: string;
  company_name?: string;
  job_title?: string;
  location?: string;
  applied_at: string;
  application_type: 'easy_apply' | 'external';
  success: boolean;
  error_message?: string;
  created_at: string;
}

export interface UserUsageStats {
  total_sessions: number;
  active_sessions: number;
  total_applications: number;
  total_time_seconds: number;
  applications_today: number;
  applications_this_week: number;
  applications_this_month: number;
}

export class LinkedInSessionService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    console.log('Creating LinkedInSessionService with URL:', supabaseUrl);
    console.log('Using service role key:', supabaseKey.substring(0, 20) + '...');
    
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    });
  }

  /**
   * Create a new LinkedIn automation session
   */
  async createSession(
    userId: string,
    browserbaseSessionId: string,
    liveViewUrl?: string,
    config?: any,
    contextId?: string
  ): Promise<LinkedInSession> {
    const dbCallId = Math.random().toString(36).substring(7);
    console.log(`\n[DB-${dbCallId}] >>>>> Creating LinkedIn session in database at ${new Date().toISOString()}`);
    console.log(`[DB-${dbCallId}] User: ${userId}`);
    console.log(`[DB-${dbCallId}] Browserbase Session: ${browserbaseSessionId}`);
    
    const sessionData: any = {
      user_id: userId,
      browserbase_session_id: browserbaseSessionId,
      status: 'active',
      live_view_url: liveViewUrl,
      config: config || null
    };

    // Add context ID if provided
    if (contextId) {
      sessionData.browserbase_context_id = contextId;
    }

    console.log(`[DB-${dbCallId}] Inserting session data...`);
    const { data, error } = await this.supabase
      .from('linkedin_sessions')
      .insert(sessionData)
      .select()
      .single();

    if (error) {
      console.error(`[DB-${dbCallId}] Error creating LinkedIn session:`, error);
      throw new Error(`Failed to create session: ${error.message}`);
    }

    console.log(`[DB-${dbCallId}] Session created successfully:`, {
      id: data.id,
      browserbase_session_id: data.browserbase_session_id
    });
    console.log(`[DB-${dbCallId}] <<<<< Returning from createSession\n`);
    
    return data;
  }

  /**
   * Update session status
   */
  async updateSessionStatus(
    sessionId: string,
    status: 'active' | 'completed' | 'failed' | 'expired' | 'intervention_required',
    endedAt?: Date
  ): Promise<LinkedInSession> {
    const updateData: any = { status };
    if (endedAt) {
      updateData.ended_at = endedAt.toISOString();
    }

    const { data, error } = await this.supabase
      .from('linkedin_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('Error updating session status:', error);
      throw new Error(`Failed to update session: ${error.message}`);
    }

    return data;
  }

  /**
   * Get active sessions for a user
   */
  async getActiveSessionsCount(userId: string): Promise<number> {
    try {
      console.log('Counting active sessions for user:', userId);
      console.log('Supabase client auth:', this.supabase.auth);
      
      // Try a simpler query first
      const testQuery = await this.supabase
        .from('linkedin_sessions')
        .select('id')
        .limit(1);
      
      console.log('Test query result:', testQuery);
      
      const { count, error } = await this.supabase
        .from('linkedin_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'active');

      console.log('Count query result:', { count, error });

      if (error) {
        console.error('Error counting active sessions:', error);
        // Try a manual count as fallback
        const { data: sessions, error: fallbackError } = await this.supabase
          .from('linkedin_sessions')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active');
        
        if (fallbackError) {
          throw new Error(`Failed to count active sessions: ${fallbackError.message || JSON.stringify(fallbackError)}`);
        }
        
        return sessions?.length || 0;
      }

      return count || 0;
    } catch (e) {
      console.error('Exception in getActiveSessionsCount:', e);
      throw e;
    }
  }

  /**
   * Get session by browserbase ID
   */
  async getSessionByBrowserbaseId(browserbaseSessionId: string): Promise<LinkedInSession | null> {
    const { data, error } = await this.supabase
      .from('linkedin_sessions')
      .select('*')
      .eq('browserbase_session_id', browserbaseSessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('Error fetching session:', error);
      throw new Error(`Failed to fetch session: ${error.message}`);
    }

    return data;
  }

  /**
   * Record a job application
   */
  async recordJobApplication(
    sessionId: string,
    userId: string,
    jobData: {
      job_url: string;
      job_id?: string;
      company_name?: string;
      job_title?: string;
      location?: string;
      application_type: 'easy_apply' | 'external';
      success?: boolean;
      error_message?: string;
    }
  ): Promise<JobApplication> {
    const { data, error } = await this.supabase
      .from('job_applications')
      .insert({
        session_id: sessionId,
        user_id: userId,
        ...jobData,
        success: jobData.success ?? true
      })
      .select()
      .single();

    if (error) {
      // Check if it's a duplicate application
      if (error.code === '23505') {
        throw new Error('Already applied to this job');
      }
      console.error('Error recording job application:', error);
      throw new Error(`Failed to record application: ${error.message}`);
    }

    return data;
  }

  /**
   * Get user's usage statistics
   */
  async getUserUsageStats(userId: string): Promise<UserUsageStats> {
    const { data, error } = await this.supabase
      .rpc('get_user_linkedin_usage', { p_user_id: userId })
      .single();

    if (error) {
      console.error('Error fetching user stats:', error);
      throw new Error(`Failed to fetch usage stats: ${error.message}`);
    }

    return data;
  }

  /**
   * Check if user has already applied to a job
   */
  async hasAppliedToJob(userId: string, jobUrl: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('job_applications')
      .select('id')
      .eq('user_id', userId)
      .eq('job_url', jobUrl)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return false; // Not found
      console.error('Error checking job application:', error);
      throw new Error(`Failed to check application: ${error.message}`);
    }

    return !!data;
  }

  /**
   * End all active sessions for a user (cleanup)
   */
  async endAllActiveSessions(userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('linkedin_sessions')
      .update({ 
        status: 'expired',
        ended_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) {
      console.error('Error ending active sessions:', error);
      throw new Error(`Failed to end sessions: ${error.message}`);
    }
  }

  /**
   * Store user's Browserbase context ID for persistent authentication
   */
  async updateUserContext(userId: string, contextId: string): Promise<void> {
    try {
      // First, try to update existing preferences
      const { data: existing, error: fetchError } = await this.supabase
        .from('user_linkedin_preferences')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (existing) {
        // Update existing record
        const { error } = await this.supabase
          .from('user_linkedin_preferences')
          .update({ 
            browserbase_context_id: contextId,
            context_created_at: contextId ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        if (error) {
          console.error('Error updating user context:', error);
        }
      } else {
        // Create new record
        const { error } = await this.supabase
          .from('user_linkedin_preferences')
          .insert({
            user_id: userId,
            browserbase_context_id: contextId,
            context_created_at: contextId ? new Date().toISOString() : null,
            use_persistent_auth: true
          });

        if (error) {
          console.error('Error creating user preferences:', error);
        }
      }

      // Also update the most recent session for backward compatibility
      await this.supabase
        .from('linkedin_sessions')
        .update({ browserbase_context_id: contextId })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);

    } catch (error) {
      console.error('Error in updateUserContext:', error);
    }
  }

  /**
   * Get user's Browserbase context ID
   */
  async getUserContext(userId: string): Promise<string | null> {
    try {
      // First check the preferences table
      const { data: prefs, error: prefsError } = await this.supabase
        .from('user_linkedin_preferences')
        .select('browserbase_context_id, use_persistent_auth')
        .eq('user_id', userId)
        .single();

      if (prefs && prefs.use_persistent_auth && prefs.browserbase_context_id) {
        return prefs.browserbase_context_id;
      }

      // Fallback: check sessions table for backward compatibility
      const { data, error } = await this.supabase
        .from('linkedin_sessions')
        .select('browserbase_context_id')
        .eq('user_id', userId)
        .not('browserbase_context_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data && data.browserbase_context_id) {
        // Migrate to preferences table
        await this.updateUserContext(userId, data.browserbase_context_id);
        return data.browserbase_context_id;
      }

      return null;
    } catch (error) {
      console.error('Error getting user context:', error);
      return null;
    }
  }
  
  /**
   * Get last session for a user
   */
  async getLastSessionForUser(userId: string): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .from('linkedin_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      if (error && error.code !== 'PGRST116') { // Ignore "no rows" error
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Error getting last session:', error);
      return null;
    }
  }
}