/**
 * Helper functions for automation database operations
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  AutomationStatus,
  InterventionType,
  ApplicationStatus,
  AutomationSession,
  AutomationError
} from '../../types/automation.types';

export class AutomationHelpers {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get session by Browserbase session ID
   */
  async getSessionByBrowserbaseId(browserbaseSessionId: string): Promise<AutomationSession | null> {
    try {
      const { data, error } = await this.supabase
        .from('automation_sessions')
        .select('*')
        .eq('browserbase_session_id', browserbaseSessionId)
        .single();

      if (error) return null;
      return data as AutomationSession;
    } catch {
      return null;
    }
  }

  /**
   * Check if user has reached session limit
   */
  async hasReachedSessionLimit(userId: string, limit: number): Promise<boolean> {
    try {
      const { count, error } = await this.supabase
        .from('automation_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', [
          AutomationStatus.RUNNING,
          AutomationStatus.PAUSED,
          AutomationStatus.INTERVENTION_REQUIRED
        ]);

      if (error) throw new AutomationError('Failed to check session limit', 'SESSION_LIMIT_ERROR', error);

      return (count || 0) >= limit;
    } catch (error) {
      console.error('Check session limit error:', error);
      throw error;
    }
  }

  /**
   * Get recent session for resume
   */
  async getRecentSessionForResume(userId: string): Promise<AutomationSession | null> {
    try {
      const { data, error } = await this.supabase
        .from('automation_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', AutomationStatus.PAUSED)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error) return null;
      return data as AutomationSession;
    } catch {
      return null;
    }
  }

  /**
   * Get intervention history for a session
   */
  async getSessionInterventionHistory(sessionId: string) {
    try {
      const { data, error } = await this.supabase
        .from('automation_interventions')
        .select('*')
        .eq('session_id', sessionId)
        .order('detected_at', { ascending: false });

      if (error) throw new AutomationError('Failed to get intervention history', 'INTERVENTION_HISTORY_ERROR', error);

      return data || [];
    } catch (error) {
      console.error('Get intervention history error:', error);
      throw error;
    }
  }

  /**
   * Get job application rate for rate limiting
   */
  async getApplicationRate(userId: string, minutes: number): Promise<number> {
    try {
      const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
      
      const { count, error } = await this.supabase
        .from('applied_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('applied_at', since);

      if (error) throw new AutomationError('Failed to get application rate', 'APPLICATION_RATE_ERROR', error);

      return count || 0;
    } catch (error) {
      console.error('Get application rate error:', error);
      throw error;
    }
  }

  /**
   * Clean up stale sessions
   */
  async cleanupStaleSessions(hours: number = 24): Promise<number> {
    try {
      const staleDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      
      const { data, error } = await this.supabase
        .from('automation_sessions')
        .update({ 
          status: AutomationStatus.FAILED,
          error_message: 'Session timed out',
          completed_at: new Date().toISOString()
        })
        .in('status', [AutomationStatus.RUNNING, AutomationStatus.PAUSED])
        .lt('updated_at', staleDate)
        .select();

      if (error) throw new AutomationError('Failed to cleanup stale sessions', 'CLEANUP_ERROR', error);

      return data?.length || 0;
    } catch (error) {
      console.error('Cleanup stale sessions error:', error);
      throw error;
    }
  }

  /**
   * Get session summary
   */
  async getSessionSummary(sessionId: string) {
    try {
      const [session, interventions, applications, logs] = await Promise.all([
        this.supabase
          .from('automation_sessions')
          .select('*')
          .eq('id', sessionId)
          .single(),
        this.supabase
          .from('automation_interventions')
          .select('*', { count: 'exact' })
          .eq('session_id', sessionId),
        this.supabase
          .from('applied_jobs')
          .select('*', { count: 'exact' })
          .eq('session_id', sessionId),
        this.supabase
          .from('automation_logs')
          .select('*', { count: 'exact' })
          .eq('session_id', sessionId)
          .eq('level', LogLevel.ERROR)
      ]);

      if (session.error) throw new AutomationError('Session not found', 'SESSION_NOT_FOUND', { sessionId });

      return {
        session: session.data,
        interventionCount: interventions.count || 0,
        applicationCount: applications.count || 0,
        errorCount: logs.count || 0,
        applications: applications.data || [],
        interventions: interventions.data || []
      };
    } catch (error) {
      console.error('Get session summary error:', error);
      throw error;
    }
  }

  /**
   * Bulk update application statuses
   */
  async bulkUpdateApplicationStatus(
    jobIds: string[],
    userId: string,
    status: ApplicationStatus
  ): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .from('applied_jobs')
        .update({ 
          application_status: status,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .in('job_id', jobIds)
        .select();

      if (error) throw new AutomationError('Failed to bulk update applications', 'BULK_UPDATE_ERROR', error);

      return data?.length || 0;
    } catch (error) {
      console.error('Bulk update application status error:', error);
      throw error;
    }
  }

  /**
   * Get duplicate job applications
   */
  async getDuplicateApplications(userId: string) {
    try {
      const { data, error } = await this.supabase
        .from('applied_jobs')
        .select('job_id, company, title, COUNT(*)')
        .eq('user_id', userId)
        .group('job_id, company, title')
        .having('COUNT(*) > 1');

      if (error) throw new AutomationError('Failed to get duplicate applications', 'DUPLICATE_CHECK_ERROR', error);

      return data || [];
    } catch (error) {
      console.error('Get duplicate applications error:', error);
      throw error;
    }
  }

  /**
   * Archive completed sessions older than specified days
   */
  async archiveOldSessions(days: number): Promise<number> {
    try {
      const archiveDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      
      // In a real implementation, you might move these to an archive table
      // For now, we'll just mark them with metadata
      const { data, error } = await this.supabase
        .from('automation_sessions')
        .update({ 
          metadata: { archived: true, archived_at: new Date().toISOString() }
        })
        .in('status', [AutomationStatus.COMPLETED, AutomationStatus.FAILED])
        .lt('completed_at', archiveDate)
        .select();

      if (error) throw new AutomationError('Failed to archive sessions', 'ARCHIVE_ERROR', error);

      return data?.length || 0;
    } catch (error) {
      console.error('Archive old sessions error:', error);
      throw error;
    }
  }
}

// Enum import for LogLevel
import { LogLevel } from '../../types/automation.types';