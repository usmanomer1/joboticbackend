import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  AutomationStatus,
  InterventionType,
  ApplicationStatus,
  LogLevel,
  JobSearchConfig,
  AutomationSession,
  AutomationIntervention,
  JobApplication,
  AppliedJob,
  AutomationLog,
  DateRange,
  PaginationOptions,
  UserAutomationStats,
  ActiveSessionInfo,
  UnresolvedIntervention,
  AutomationError,
  SessionNotFoundError,
  DuplicateApplicationError,
  InvalidStateTransitionError
} from '../../types/automation.types';

export class SupabaseAutomationService {
  private supabase: SupabaseClient;
  private subscriptions: Map<string, RealtimeChannel> = new Map();

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  // ============= Session Management =============

  /**
   * Create a new automation session for a user
   */
  async createAutomationSession(
    userId: string,
    browserbaseSessionId: string,
    config: JobSearchConfig,
    liveViewUrl?: string,
    debugUrl?: string
  ): Promise<AutomationSession> {
    try {
      const contextId = `user_${userId}_linkedin_context`;
      
      const { data, error } = await this.supabase
        .from('automation_sessions')
        .insert({
          user_id: userId,
          browserbase_session_id: browserbaseSessionId,
          browserbase_context_id: contextId,
          status: AutomationStatus.RUNNING,
          config,
          job_title: config.jobTitle,
          location: config.location,
          target_count: config.targetCount || 0,
          applications_submitted: 0,
          live_view_url: liveViewUrl,
          debug_url: debugUrl
        })
        .select()
        .single();

      if (error) throw new AutomationError('Failed to create session', 'CREATE_SESSION_ERROR', error);
      
      return data as AutomationSession;
    } catch (error) {
      console.error('Create session error:', error);
      throw error;
    }
  }

  /**
   * Update session status with validation
   */
  async updateSessionStatus(
    sessionId: string,
    status: AutomationStatus,
    errorMessage?: string
  ): Promise<AutomationSession> {
    try {
      // Get current session to validate state transition
      const { data: currentSession, error: fetchError } = await this.supabase
        .from('automation_sessions')
        .select('status')
        .eq('id', sessionId)
        .single();

      if (fetchError || !currentSession) {
        throw new SessionNotFoundError(sessionId);
      }

      // Validate state transition
      this.validateStateTransition(currentSession.status, status);

      // Update session
      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      };

      if (status === AutomationStatus.COMPLETED || status === AutomationStatus.FAILED) {
        updateData.completed_at = new Date().toISOString();
      }

      if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      const { data, error } = await this.supabase
        .from('automation_sessions')
        .update(updateData)
        .eq('id', sessionId)
        .select()
        .single();

      if (error) throw new AutomationError('Failed to update session status', 'UPDATE_STATUS_ERROR', error);

      return data as AutomationSession;
    } catch (error) {
      console.error('Update session status error:', error);
      throw error;
    }
  }

  /**
   * Get active sessions for a user
   */
  async getSessionsByUser(userId: string, includeCompleted = false): Promise<AutomationSession[]> {
    try {
      let query = this.supabase
        .from('automation_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (!includeCompleted) {
        query = query.in('status', [
          AutomationStatus.RUNNING,
          AutomationStatus.PAUSED,
          AutomationStatus.INTERVENTION_REQUIRED
        ]);
      }

      const { data, error } = await query;

      if (error) throw new AutomationError('Failed to fetch sessions', 'FETCH_SESSIONS_ERROR', error);

      return data as AutomationSession[];
    } catch (error) {
      console.error('Get sessions error:', error);
      throw error;
    }
  }

  /**
   * Get active sessions count using database function
   */
  async getActiveSessionsCount(userId: string): Promise<number> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_active_sessions', { p_user_id: userId });

      if (error) throw new AutomationError('Failed to get active sessions count', 'COUNT_ERROR', error);

      return data?.length || 0;
    } catch (error) {
      console.error('Get active sessions count error:', error);
      throw error;
    }
  }

  // ============= Intervention Tracking =============

  /**
   * Log an intervention and pause the session
   */
  async logIntervention(
    sessionId: string,
    type: InterventionType,
    liveViewUrl: string,
    pageState?: any,
    message?: string,
    pageUrl?: string
  ): Promise<AutomationIntervention> {
    try {
      // Start a transaction by creating intervention and updating session
      const { data: intervention, error: interventionError } = await this.supabase
        .from('automation_interventions')
        .insert({
          session_id: sessionId,
          type,
          live_view_url: liveViewUrl,
          message,
          page_url: pageUrl,
          page_state: pageState
        })
        .select()
        .single();

      if (interventionError) {
        throw new AutomationError('Failed to log intervention', 'LOG_INTERVENTION_ERROR', interventionError);
      }

      // Update session status to intervention_required
      await this.updateSessionStatus(sessionId, AutomationStatus.INTERVENTION_REQUIRED);

      return intervention as AutomationIntervention;
    } catch (error) {
      console.error('Log intervention error:', error);
      throw error;
    }
  }

  /**
   * Resolve an intervention
   */
  async resolveIntervention(
    interventionId: string,
    resolutionData?: any
  ): Promise<AutomationIntervention> {
    try {
      // Get intervention to find session
      const { data: intervention, error: fetchError } = await this.supabase
        .from('automation_interventions')
        .select('session_id')
        .eq('id', interventionId)
        .single();

      if (fetchError || !intervention) {
        throw new AutomationError('Intervention not found', 'INTERVENTION_NOT_FOUND', { interventionId });
      }

      // Update intervention
      const { data, error } = await this.supabase
        .from('automation_interventions')
        .update({
          resolved_at: new Date().toISOString(),
          resolution_data: resolutionData
        })
        .eq('id', interventionId)
        .select()
        .single();

      if (error) throw new AutomationError('Failed to resolve intervention', 'RESOLVE_INTERVENTION_ERROR', error);

      // Update session status back to running
      await this.updateSessionStatus(intervention.session_id, AutomationStatus.RUNNING);

      return data as AutomationIntervention;
    } catch (error) {
      console.error('Resolve intervention error:', error);
      throw error;
    }
  }

  /**
   * Get active interventions for a user using database function
   */
  async getActiveInterventions(userId: string): Promise<UnresolvedIntervention[]> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_unresolved_interventions', { p_user_id: userId });

      if (error) throw new AutomationError('Failed to get active interventions', 'GET_INTERVENTIONS_ERROR', error);

      return data as UnresolvedIntervention[];
    } catch (error) {
      console.error('Get active interventions error:', error);
      throw error;
    }
  }

  // ============= Job Application Tracking =============

  /**
   * Record a job application
   */
  async recordJobApplication(
    sessionId: string,
    userId: string,
    jobDetails: JobApplication,
    status: ApplicationStatus = ApplicationStatus.SUCCESS,
    errorMessage?: string,
    responseData?: any
  ): Promise<AppliedJob> {
    try {
      // Check if already applied using database function
      const alreadyApplied = await this.checkIfAlreadyApplied(userId, jobDetails.job_id);
      
      if (alreadyApplied) {
        throw new DuplicateApplicationError(jobDetails.job_id, userId);
      }

      // Record application
      const { data, error } = await this.supabase
        .from('applied_jobs')
        .insert({
          session_id: sessionId,
          user_id: userId,
          job_id: jobDetails.job_id,
          company: jobDetails.company,
          title: jobDetails.title,
          location: jobDetails.location,
          job_url: jobDetails.job_url,
          application_type: jobDetails.application_type || 'easy_apply',
          application_status: status,
          error_message: errorMessage,
          response_data: responseData
        })
        .select()
        .single();

      if (error) {
        // Handle unique constraint violation
        if (error.code === '23505') {
          throw new DuplicateApplicationError(jobDetails.job_id, userId);
        }
        throw new AutomationError('Failed to record application', 'RECORD_APPLICATION_ERROR', error);
      }

      // Update session application count
      if (status === ApplicationStatus.SUCCESS) {
        await this.incrementApplicationCount(sessionId);
      }

      return data as AppliedJob;
    } catch (error) {
      console.error('Record job application error:', error);
      throw error;
    }
  }

  /**
   * Get applied jobs with pagination
   */
  async getAppliedJobs(
    userId: string,
    dateRange?: DateRange,
    pagination?: PaginationOptions
  ): Promise<{ jobs: AppliedJob[]; total: number }> {
    try {
      const page = pagination?.page || 1;
      const limit = pagination?.limit || 50;
      const offset = (page - 1) * limit;

      let query = this.supabase
        .from('applied_jobs')
        .select('*, automation_sessions!inner(job_title, location)', { count: 'exact' })
        .eq('user_id', userId);

      if (dateRange) {
        query = query
          .gte('applied_at', dateRange.start.toISOString())
          .lte('applied_at', dateRange.end.toISOString());
      }

      query = query
        .order(pagination?.orderBy || 'applied_at', { 
          ascending: pagination?.orderDirection === 'asc' 
        })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw new AutomationError('Failed to fetch applied jobs', 'FETCH_JOBS_ERROR', error);

      return {
        jobs: data as AppliedJob[],
        total: count || 0
      };
    } catch (error) {
      console.error('Get applied jobs error:', error);
      throw error;
    }
  }

  /**
   * Check if already applied to a job using database function
   */
  async checkIfAlreadyApplied(userId: string, jobId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .rpc('has_applied_to_job', { 
          p_user_id: userId, 
          p_job_id: jobId 
        });

      if (error) throw new AutomationError('Failed to check application status', 'CHECK_APPLICATION_ERROR', error);

      return data as boolean;
    } catch (error) {
      console.error('Check if already applied error:', error);
      throw error;
    }
  }

  // ============= Logging and Analytics =============

  /**
   * Log an automation event
   */
  async logAutomationEvent(
    sessionId: string,
    level: LogLevel,
    message: string,
    metadata?: any,
    stepName?: string,
    stepNumber?: number
  ): Promise<AutomationLog> {
    try {
      const { data, error } = await this.supabase
        .from('automation_logs')
        .insert({
          session_id: sessionId,
          level,
          message,
          metadata,
          step_name: stepName,
          step_number: stepNumber
        })
        .select()
        .single();

      if (error) throw new AutomationError('Failed to log event', 'LOG_EVENT_ERROR', error);

      return data as AutomationLog;
    } catch (error) {
      console.error('Log automation event error:', error);
      throw error;
    }
  }

  /**
   * Get session logs
   */
  async getSessionLogs(sessionId: string, limit = 100): Promise<AutomationLog[]> {
    try {
      const { data, error } = await this.supabase
        .from('automation_logs')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw new AutomationError('Failed to fetch logs', 'FETCH_LOGS_ERROR', error);

      return data as AutomationLog[];
    } catch (error) {
      console.error('Get session logs error:', error);
      throw error;
    }
  }

  /**
   * Get user automation statistics using database function
   */
  async getUserAutomationStats(userId: string, days = 30): Promise<UserAutomationStats> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_application_stats', { 
          p_user_id: userId, 
          p_days: days 
        });

      if (error) throw new AutomationError('Failed to get stats', 'GET_STATS_ERROR', error);

      return data[0] as UserAutomationStats;
    } catch (error) {
      console.error('Get user stats error:', error);
      throw error;
    }
  }

  // ============= Real-time Subscriptions =============

  /**
   * Subscribe to session status changes
   */
  subscribeToSessionStatus(
    sessionId: string,
    callback: (payload: any) => void
  ): () => void {
    const channel = this.supabase
      .channel(`session-status-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'automation_sessions',
          filter: `id=eq.${sessionId}`
        },
        (payload) => callback(payload.new)
      )
      .subscribe();

    this.subscriptions.set(`session-${sessionId}`, channel);

    // Return unsubscribe function
    return () => this.unsubscribeChannel(`session-${sessionId}`);
  }

  /**
   * Subscribe to user interventions
   */
  subscribeToInterventions(
    userId: string,
    callback: (payload: any) => void
  ): () => void {
    const channel = this.supabase
      .channel(`interventions-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'automation_interventions'
        },
        async (payload) => {
          // Check if intervention belongs to user's session
          const session = await this.getSessionById(payload.new.session_id);
          if (session?.user_id === userId) {
            callback(payload.new);
          }
        }
      )
      .subscribe();

    this.subscriptions.set(`interventions-${userId}`, channel);

    return () => this.unsubscribeChannel(`interventions-${userId}`);
  }

  /**
   * Subscribe to new applications for a session
   */
  subscribeToApplications(
    sessionId: string,
    callback: (payload: any) => void
  ): () => void {
    const channel = this.supabase
      .channel(`applications-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'applied_jobs',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => callback(payload.new)
      )
      .subscribe();

    this.subscriptions.set(`applications-${sessionId}`, channel);

    return () => this.unsubscribeChannel(`applications-${sessionId}`);
  }

  // ============= Helper Methods =============

  /**
   * Validate state transitions
   */
  private validateStateTransition(from: AutomationStatus, to: AutomationStatus): void {
    const validTransitions: Record<AutomationStatus, AutomationStatus[]> = {
      [AutomationStatus.RUNNING]: [
        AutomationStatus.PAUSED,
        AutomationStatus.INTERVENTION_REQUIRED,
        AutomationStatus.COMPLETED,
        AutomationStatus.FAILED
      ],
      [AutomationStatus.PAUSED]: [
        AutomationStatus.RUNNING,
        AutomationStatus.FAILED
      ],
      [AutomationStatus.INTERVENTION_REQUIRED]: [
        AutomationStatus.RUNNING,
        AutomationStatus.FAILED
      ],
      [AutomationStatus.COMPLETED]: [],
      [AutomationStatus.FAILED]: []
    };

    if (!validTransitions[from].includes(to)) {
      throw new InvalidStateTransitionError(from, to);
    }
  }

  /**
   * Get session by ID
   */
  private async getSessionById(sessionId: string): Promise<AutomationSession | null> {
    try {
      const { data, error } = await this.supabase
        .from('automation_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) return null;
      return data as AutomationSession;
    } catch {
      return null;
    }
  }

  /**
   * Increment application count for a session
   */
  private async incrementApplicationCount(sessionId: string): Promise<void> {
    try {
      const { error } = await this.supabase.rpc('increment', {
        table_name: 'automation_sessions',
        column_name: 'applications_submitted',
        row_id: sessionId
      });

      if (error) {
        // Fallback to manual increment
        const { data: current } = await this.supabase
          .from('automation_sessions')
          .select('applications_submitted')
          .eq('id', sessionId)
          .single();

        if (current) {
          await this.supabase
            .from('automation_sessions')
            .update({ 
              applications_submitted: (current.applications_submitted || 0) + 1 
            })
            .eq('id', sessionId);
        }
      }
    } catch (error) {
      console.error('Increment application count error:', error);
    }
  }

  /**
   * Unsubscribe from a channel
   */
  private unsubscribeChannel(key: string): void {
    const channel = this.subscriptions.get(key);
    if (channel) {
      this.supabase.removeChannel(channel);
      this.subscriptions.delete(key);
    }
  }

  /**
   * Clean up all subscriptions
   */
  cleanup(): void {
    for (const [key, channel] of this.subscriptions) {
      this.supabase.removeChannel(channel);
    }
    this.subscriptions.clear();
  }
}

// Export singleton instance
export default SupabaseAutomationService;