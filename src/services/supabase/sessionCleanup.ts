import { createClient } from '@supabase/supabase-js';

/**
 * Clean up stale LinkedIn sessions
 * Sessions are considered stale if they're active for more than 2 hours
 */
export class SessionCleanupService {
  private supabase;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  /**
   * Mark old active sessions as expired
   */
  async cleanupStaleSessions(maxAgeMinutes: number = 120): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('linkedin_sessions')
        .update({ 
          status: 'expired',
          updated_at: new Date().toISOString()
        })
        .eq('status', 'active')
        .lt('created_at', new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString())
        .select();

      if (error) {
        console.error('Error cleaning up stale sessions:', error);
        return 0;
      }

      console.log(`Cleaned up ${data?.length || 0} stale sessions`);
      return data?.length || 0;
    } catch (err) {
      console.error('Exception during session cleanup:', err);
      return 0;
    }
  }

  /**
   * Clean up sessions for a specific user
   */
  async cleanupUserSessions(userId: string, keepNewest: number = 1): Promise<number> {
    try {
      // Get all active sessions for user, ordered by creation date
      const { data: sessions, error: fetchError } = await this.supabase
        .from('linkedin_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching user sessions:', fetchError);
        return 0;
      }

      if (!sessions || sessions.length <= keepNewest) {
        return 0;
      }

      // Mark older sessions as expired
      const sessionsToExpire = sessions.slice(keepNewest).map(s => s.id);
      
      const { error: updateError } = await this.supabase
        .from('linkedin_sessions')
        .update({ 
          status: 'expired',
          updated_at: new Date().toISOString()
        })
        .in('id', sessionsToExpire);

      if (updateError) {
        console.error('Error expiring user sessions:', updateError);
        return 0;
      }

      console.log(`Expired ${sessionsToExpire.length} sessions for user ${userId}`);
      return sessionsToExpire.length;
    } catch (err) {
      console.error('Exception during user session cleanup:', err);
      return 0;
    }
  }
}

// Run cleanup periodically (e.g., every hour)
export function startSessionCleanup(supabaseUrl: string, supabaseKey: string) {
  const cleanup = new SessionCleanupService(supabaseUrl, supabaseKey);
  
  // Initial cleanup
  cleanup.cleanupStaleSessions(120); // 2 hours
  
  // Schedule periodic cleanup
  setInterval(() => {
    cleanup.cleanupStaleSessions(120);
  }, 60 * 60 * 1000); // Every hour
}