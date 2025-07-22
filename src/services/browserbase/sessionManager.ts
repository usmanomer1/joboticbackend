import { SupabaseAutomationService } from '../supabase/automationService';
import { AutomationHelpers } from '../supabase/automationHelpers';
import {
  AutomationStatus,
  AutomationSession,
  AutomationError,
  LogLevel,
  JobSearchConfig
} from '../../types/automation.types';

interface BrowserbaseSession {
  id: string;
  projectId: string;
  status: string;
  createdAt: string;
  metadata?: any;
}

interface BrowserbaseCreateSessionOptions {
  projectId?: string;
  extensionId?: string;
  fingerprint?: {
    locales?: string[];
    operatingSystems?: string[];
    devices?: string[];
  };
  proxies?: boolean;
  timeout?: number;
}

interface BrowserbaseSessionManager {
  createUserSession(userId: string, config: JobSearchConfig): Promise<AutomationSession>;
  getOrCreateSession(userId: string, config: JobSearchConfig): Promise<AutomationSession>;
  pauseSession(sessionId: string): Promise<AutomationSession>;
  resumeSession(sessionId: string): Promise<AutomationSession>;
  terminateSession(sessionId: string, reason?: string): Promise<AutomationSession>;
  cleanupStaleSessions(hours?: number): Promise<number>;
}

export class BrowserbaseSessionManager implements BrowserbaseSessionManager {
  private supabaseService: SupabaseAutomationService;
  private helpers: AutomationHelpers;
  private apiKey: string;
  private projectId: string;
  private baseUrl = 'https://www.browserbase.com/v1';

  constructor(
    supabaseService: SupabaseAutomationService,
    helpers: AutomationHelpers,
    apiKey: string,
    projectId: string
  ) {
    this.supabaseService = supabaseService;
    this.helpers = helpers;
    this.apiKey = apiKey;
    this.projectId = projectId;
  }

  /**
   * Create a new browser session for a user
   */
  async createUserSession(userId: string, config: JobSearchConfig): Promise<AutomationSession> {
    try {
      // Check if user has reached session limit
      const hasReachedLimit = await this.helpers.hasReachedSessionLimit(userId, 3);
      if (hasReachedLimit) {
        throw new AutomationError(
          'Session limit reached. Please complete or terminate existing sessions.',
          'SESSION_LIMIT_REACHED',
          { userId, limit: 3 }
        );
      }

      // Create Browserbase session
      const browserbaseSession = await this.createBrowserbaseSession({
        projectId: this.projectId,
        fingerprint: {
          locales: ['en', 'en-US'],
          operatingSystems: ['windows', 'macos'],
          devices: ['desktop']
        },
        proxies: true,
        timeout: 3600000 // 1 hour
      });

      // Generate URLs
      const liveViewUrl = `https://www.browserbase.com/sessions/${browserbaseSession.id}/live`;
      const debugUrl = `https://www.browserbase.com/sessions/${browserbaseSession.id}`;

      // Create Supabase automation session
      const automationSession = await this.supabaseService.createAutomationSession(
        userId,
        browserbaseSession.id,
        config,
        liveViewUrl,
        debugUrl
      );

      // Log session creation
      await this.supabaseService.logAutomationEvent(
        automationSession.id,
        LogLevel.INFO,
        'Browser session created successfully',
        {
          browserbaseSessionId: browserbaseSession.id,
          contextId: automationSession.browserbase_context_id,
          config
        },
        'session_creation',
        1
      );

      return automationSession;
    } catch (error) {
      console.error('Create user session error:', error);
      throw error;
    }
  }

  /**
   * Get existing session or create a new one
   */
  async getOrCreateSession(userId: string, config: JobSearchConfig): Promise<AutomationSession> {
    try {
      // Check for recent paused session to resume
      const recentSession = await this.helpers.getRecentSessionForResume(userId);
      
      if (recentSession) {
        // Check if Browserbase session is still valid
        const isValid = await this.checkBrowserbaseSessionStatus(recentSession.browserbase_session_id);
        
        if (isValid) {
          // Resume the session
          return await this.resumeSession(recentSession.id);
        } else {
          // Mark old session as failed
          await this.supabaseService.updateSessionStatus(
            recentSession.id,
            AutomationStatus.FAILED,
            'Browser session expired'
          );
        }
      }

      // Create new session
      return await this.createUserSession(userId, config);
    } catch (error) {
      console.error('Get or create session error:', error);
      throw error;
    }
  }

  /**
   * Pause an active session
   */
  async pauseSession(sessionId: string): Promise<AutomationSession> {
    try {
      // Update status in Supabase
      const session = await this.supabaseService.updateSessionStatus(
        sessionId,
        AutomationStatus.PAUSED
      );

      // Log pause event
      await this.supabaseService.logAutomationEvent(
        sessionId,
        LogLevel.INFO,
        'Session paused by user',
        { previousStatus: AutomationStatus.RUNNING },
        'session_pause'
      );

      // Note: We don't terminate the Browserbase session when pausing
      // to allow for quick resume

      return session;
    } catch (error) {
      console.error('Pause session error:', error);
      throw error;
    }
  }

  /**
   * Resume a paused session
   */
  async resumeSession(sessionId: string): Promise<AutomationSession> {
    try {
      // Get session details
      const sessions = await this.supabaseService.getSessionsByUser('', true);
      const session = sessions.find(s => s.id === sessionId);

      if (!session) {
        throw new AutomationError('Session not found', 'SESSION_NOT_FOUND', { sessionId });
      }

      if (session.status !== AutomationStatus.PAUSED) {
        throw new AutomationError(
          'Only paused sessions can be resumed',
          'INVALID_SESSION_STATE',
          { sessionId, currentStatus: session.status }
        );
      }

      // Check if Browserbase session is still valid
      const isValid = await this.checkBrowserbaseSessionStatus(session.browserbase_session_id);
      
      if (!isValid) {
        throw new AutomationError(
          'Browser session has expired. Please start a new session.',
          'BROWSER_SESSION_EXPIRED',
          { sessionId }
        );
      }

      // Update status to running
      const updatedSession = await this.supabaseService.updateSessionStatus(
        sessionId,
        AutomationStatus.RUNNING
      );

      // Log resume event
      await this.supabaseService.logAutomationEvent(
        sessionId,
        LogLevel.INFO,
        'Session resumed',
        { previousStatus: AutomationStatus.PAUSED },
        'session_resume'
      );

      return updatedSession;
    } catch (error) {
      console.error('Resume session error:', error);
      throw error;
    }
  }

  /**
   * Terminate a session
   */
  async terminateSession(sessionId: string, reason?: string): Promise<AutomationSession> {
    try {
      // Get session details
      const sessions = await this.supabaseService.getSessionsByUser('', true);
      const session = sessions.find(s => s.id === sessionId);

      if (!session) {
        throw new AutomationError('Session not found', 'SESSION_NOT_FOUND', { sessionId });
      }

      // Terminate Browserbase session
      await this.terminateBrowserbaseSession(session.browserbase_session_id);

      // Update status in Supabase
      const updatedSession = await this.supabaseService.updateSessionStatus(
        sessionId,
        AutomationStatus.COMPLETED,
        reason
      );

      // Log termination event
      await this.supabaseService.logAutomationEvent(
        sessionId,
        LogLevel.INFO,
        'Session terminated',
        { reason, previousStatus: session.status },
        'session_termination'
      );

      // Get session summary for final log
      const summary = await this.helpers.getSessionSummary(sessionId);
      await this.supabaseService.logAutomationEvent(
        sessionId,
        LogLevel.INFO,
        'Session summary',
        {
          duration: new Date(updatedSession.updated_at).getTime() - new Date(session.started_at).getTime(),
          applicationsSubmitted: summary.applicationCount,
          interventionsEncountered: summary.interventionCount,
          errorsLogged: summary.errorCount
        },
        'session_summary'
      );

      return updatedSession;
    } catch (error) {
      console.error('Terminate session error:', error);
      throw error;
    }
  }

  /**
   * Clean up stale sessions
   */
  async cleanupStaleSessions(hours = 24): Promise<number> {
    try {
      // Get stale sessions from Supabase
      const cleanedCount = await this.helpers.cleanupStaleSessions(hours);

      // Log cleanup event
      console.log(`Cleaned up ${cleanedCount} stale sessions older than ${hours} hours`);

      // Additionally, check for orphaned Browserbase sessions
      await this.cleanupOrphanedBrowserbaseSessions();

      return cleanedCount;
    } catch (error) {
      console.error('Cleanup stale sessions error:', error);
      throw error;
    }
  }

  // ============= Private Helper Methods =============

  /**
   * Create a Browserbase session via API
   */
  private async createBrowserbaseSession(options: BrowserbaseCreateSessionOptions): Promise<BrowserbaseSession> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions`, {
        method: 'POST',
        headers: {
          'x-bb-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: options.projectId || this.projectId,
          extensionId: options.extensionId,
          fingerprint: options.fingerprint,
          proxies: options.proxies,
          timeout: options.timeout
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new AutomationError(
          'Failed to create Browserbase session',
          'BROWSERBASE_API_ERROR',
          { status: response.status, error }
        );
      }

      const session = await response.json();
      return session as BrowserbaseSession;
    } catch (error) {
      console.error('Create Browserbase session error:', error);
      throw error;
    }
  }

  /**
   * Check if a Browserbase session is still valid
   */
  private async checkBrowserbaseSessionStatus(sessionId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
        method: 'GET',
        headers: {
          'x-bb-api-key': this.apiKey
        }
      });

      if (!response.ok) {
        return false;
      }

      const session = await response.json();
      // Check if session is in a usable state
      return ['RUNNING', 'PENDING'].includes(session.status);
    } catch (error) {
      console.error('Check Browserbase session status error:', error);
      return false;
    }
  }

  /**
   * Terminate a Browserbase session
   */
  private async terminateBrowserbaseSession(sessionId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${sessionId}`, {
        method: 'POST',
        headers: {
          'x-bb-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: this.projectId,
          status: 'REQUEST_RELEASE'
        })
      });

      if (!response.ok) {
        console.error('Failed to terminate Browserbase session:', await response.text());
      }
    } catch (error) {
      console.error('Terminate Browserbase session error:', error);
      // Don't throw - we still want to update Supabase even if Browserbase fails
    }
  }

  /**
   * Clean up orphaned Browserbase sessions
   */
  private async cleanupOrphanedBrowserbaseSessions(): Promise<void> {
    try {
      // Get all sessions from Browserbase
      const response = await fetch(`${this.baseUrl}/sessions`, {
        method: 'GET',
        headers: {
          'x-bb-api-key': this.apiKey
        }
      });

      if (!response.ok) {
        console.error('Failed to list Browserbase sessions');
        return;
      }

      const sessions: BrowserbaseSession[] = await response.json();

      // Check each session against Supabase
      for (const bbSession of sessions) {
        const supabaseSession = await this.helpers.getSessionByBrowserbaseId(bbSession.id);
        
        // If no Supabase record or session is completed/failed, terminate Browserbase session
        if (!supabaseSession || 
            [AutomationStatus.COMPLETED, AutomationStatus.FAILED].includes(supabaseSession.status)) {
          await this.terminateBrowserbaseSession(bbSession.id);
          console.log(`Cleaned up orphaned Browserbase session: ${bbSession.id}`);
        }
      }
    } catch (error) {
      console.error('Cleanup orphaned Browserbase sessions error:', error);
    }
  }

  /**
   * Get connection URL for a session
   */
  getConnectionUrl(sessionId: string, options?: { enableProxy?: boolean }): string {
    const params = new URLSearchParams({
      apiKey: this.apiKey,
      sessionId
    });

    if (options?.enableProxy) {
      params.append('enableProxy', 'true');
    }

    return `wss://connect.browserbase.com?${params.toString()}`;
  }

  /**
   * Get debug URL for a session
   */
  async getDebugUrl(sessionId: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/debug`, {
        method: 'GET',
        headers: {
          'x-bb-api-key': this.apiKey
        }
      });

      if (!response.ok) {
        throw new AutomationError(
          'Failed to get debug URL',
          'BROWSERBASE_API_ERROR',
          { status: response.status }
        );
      }

      const data = await response.json();
      return data.debuggerFullscreenUrl;
    } catch (error) {
      console.error('Get debug URL error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const createBrowserbaseSessionManager = (
  supabaseService: SupabaseAutomationService,
  helpers: AutomationHelpers
): BrowserbaseSessionManager => {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    throw new Error('BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set');
  }

  return new BrowserbaseSessionManager(supabaseService, helpers, apiKey, projectId);
};