import { LinkedInSessionService, LinkedInSession } from '../supabase/linkedinSessionService';
import {
  AutomationError,
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
  // fingerprint option removed - not supported by current API
  proxies?: boolean;
  timeout?: number;
}

export class BrowserbaseSessionManager {
  private sessionService: LinkedInSessionService;
  private apiKey: string;
  private projectId: string;
  private baseUrl = 'https://api.browserbase.com/v1';
  private maxActiveSessions = 3; // Configurable limit
  private userContextMap = new Map<string, string>(); // userId -> contextId mapping

  constructor(
    sessionService: LinkedInSessionService,
    apiKey: string,
    projectId: string
  ) {
    this.sessionService = sessionService;
    this.apiKey = apiKey;
    this.projectId = projectId;
  }

  /**
   * Create a new browser session for a user
   */
  async createUserSession(userId: string, config: JobSearchConfig): Promise<LinkedInSession> {
    try {
      // Check if user has reached session limit
      const activeCount = await this.sessionService.getActiveSessionsCount(userId);
      
      if (activeCount >= this.maxActiveSessions) {
        throw new AutomationError(
          'Session limit reached. Please complete or terminate existing sessions.',
          'SESSION_LIMIT_REACHED',
          { userId, limit: this.maxActiveSessions, currentActive: activeCount }
        );
      }

      // Get or create a context for this user
      let contextId = await this.getOrCreateUserContext(userId);
      const useContext = config.useContext !== false; // Default to true
      
      // If no context exists and useContext is enabled, create one
      if (!contextId && useContext) {
        console.log(`Creating new context for user ${userId}`);
        contextId = await this.createUserContext(userId);
      }

      // Create Browserbase session with optional context
      const sessionOptions: any = {
        projectId: this.projectId,
        proxies: true,
        timeout: 3600 // 1 hour in seconds
      };

      if (useContext && contextId) {
        sessionOptions.contextId = contextId;
        sessionOptions.persist = true;
        console.log(`Creating session with context for user ${userId}, contextId: ${contextId}`);
      } else {
        console.log(`Creating session without context for user ${userId}`);
      }

      const browserbaseSession = await this.createBrowserbaseSession(sessionOptions);

      // Get the debug URLs from Browserbase API
      let liveViewUrl = '';
      try {
        const debugUrls = await this.getSessionDebugUrls(browserbaseSession.id);
        // Use the debuggerUrl which is suitable for embedding in iframes
        liveViewUrl = debugUrls.debuggerUrl;
        console.log('Got debug URL from Browserbase:', liveViewUrl);
      } catch (error) {
        console.error('Failed to get debug URL, using fallback:', error);
        // Fallback to a constructed URL if the API call fails
        liveViewUrl = `https://www.browserbase.com/sessions/${browserbaseSession.id}/live`;
      }

      // Create session record in our database with context info
      const linkedinSession = await this.sessionService.createSession(
        userId,
        browserbaseSession.id,
        liveViewUrl,
        config,
        contextId // Pass context ID to store in DB
      );

      return linkedinSession;
    } catch (error) {
      console.error('Create user session error:', error);
      throw error;
    }
  }

  /**
   * Get existing session or create a new one
   */
  async getOrCreateSession(userId: string, config: JobSearchConfig): Promise<LinkedInSession> {
    try {
      // For now, always create a new session
      // In the future, we could check for resumable sessions
      return await this.createUserSession(userId, config);
    } catch (error) {
      console.error('Get or create session error:', error);
      throw error;
    }
  }

  /**
   * Terminate a session
   */
  async terminateSession(sessionId: string, reason?: string): Promise<LinkedInSession> {
    try {
      // Get session details
      const session = await this.sessionService.getSessionByBrowserbaseId(sessionId);
      
      if (!session) {
        throw new AutomationError('Session not found', 'SESSION_NOT_FOUND', { sessionId });
      }

      // Try to terminate the Browserbase session
      try {
        await this.terminateBrowserbaseSession(session.browserbase_session_id);
      } catch (error) {
        console.warn('Failed to terminate Browserbase session:', error);
        // Continue anyway - we'll mark it as terminated in our DB
      }

      // Update session status
      const updatedSession = await this.sessionService.updateSessionStatus(
        session.id,
        reason === 'expired' ? 'expired' : 'completed',
        new Date()
      );

      return updatedSession;
    } catch (error) {
      console.error('Terminate session error:', error);
      throw error;
    }
  }

  // ============= Private Helper Methods =============

  /**
   * Create a Browserbase session via API
   */
  private async createBrowserbaseSession(options: BrowserbaseCreateSessionOptions & { contextId?: string, persist?: boolean }): Promise<BrowserbaseSession> {
    try {
      const body: any = {
        projectId: options.projectId || this.projectId,
        extensionId: options.extensionId,
        proxies: options.proxies,
        timeout: options.timeout
      };

      // Add context configuration if provided
      if (options.contextId) {
        body.browserSettings = {
          context: {
            id: options.contextId,
            persist: options.persist !== false // Default to true for persisting auth
          }
        };
      }

      const response = await fetch(`${this.baseUrl}/sessions`, {
        method: 'POST',
        headers: {
          'x-bb-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
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
   * Get session debug URLs from Browserbase API (public method)
   */
  public async getSessionDebugUrls(sessionId: string): Promise<{
    debuggerUrl: string;
    debuggerFullscreenUrl: string;
    wsUrl: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/sessions/${sessionId}/debug`, {
        method: 'GET',
        headers: {
          'x-bb-api-key': this.apiKey
        }
      });

      if (!response.ok) {
        const error = await response.text();
        throw new AutomationError(
          'Failed to get session debug URLs',
          'BROWSERBASE_API_ERROR',
          { status: response.status, error }
        );
      }

      const data = await response.json();
      return {
        debuggerUrl: data.debuggerUrl,
        debuggerFullscreenUrl: data.debuggerFullscreenUrl,
        wsUrl: data.wsUrl
      };
    } catch (error) {
      console.error('Get session debug URLs error:', error);
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
      return session.status === 'RUNNING' || session.status === 'IDLE';
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
        method: 'DELETE',
        headers: {
          'x-bb-api-key': this.apiKey
        }
      });

      if (!response.ok && response.status !== 404) {
        const error = await response.text();
        throw new Error(`Failed to terminate session: ${error}`);
      }
    } catch (error) {
      console.error('Terminate Browserbase session error:', error);
      throw error;
    }
  }

  /**
   * Create a context for a user to persist authentication
   */
  public async createUserContext(userId: string): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}/contexts`, {
        method: 'POST',
        headers: {
          'x-bb-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: this.projectId
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new AutomationError(
          'Failed to create Browserbase context',
          'BROWSERBASE_API_ERROR',
          { status: response.status, error }
        );
      }

      const context = await response.json();
      
      // Store the context ID for this user
      this.userContextMap.set(userId, context.id);
      
      // Also persist to database for future sessions
      await this.sessionService.updateUserContext(userId, context.id);
      
      return context.id;
    } catch (error) {
      console.error('Create context error:', error);
      throw error;
    }
  }

  /**
   * Get or create a context for a user
   */
  public async getOrCreateUserContext(userId: string): Promise<string | null> {
    try {
      // Check in-memory cache first
      let contextId = this.userContextMap.get(userId);
      
      if (!contextId) {
        // Check database
        contextId = await this.sessionService.getUserContext(userId);
        if (contextId) {
          this.userContextMap.set(userId, contextId);
        }
      }
      
      return contextId;
    } catch (error) {
      console.error('Get or create context error:', error);
      return null;
    }
  }
}

// Export factory function for backward compatibility
export const createBrowserbaseSessionManager = (
  sessionService: LinkedInSessionService,
  apiKey: string,
  projectId: string
): BrowserbaseSessionManager => {
  return new BrowserbaseSessionManager(sessionService, apiKey, projectId);
};