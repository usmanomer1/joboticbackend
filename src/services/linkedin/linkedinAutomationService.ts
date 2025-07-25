import { Stagehand } from '@browserbasehq/stagehand';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { 
  JobSearchConfig, 
  InterventionType,
  AutomationEventType,
  AutomationError
} from '../../types/automation.types';
import { BrowserbaseSessionManager } from '../browserbase/sessionManager';
import { SupabaseAutomationService } from '../supabase/automationService';
import { LinkedInSessionService, LinkedInSession } from '../supabase/linkedinSessionService';
import { InterventionDetectionService } from '../stagehand/interventionDetectionService';
import { BrowserbaseUploadService } from '../browserbase/uploadService';
import { JobApplicationAgent } from './jobApplicationAgent';
import { JobDataCache } from './jobDataCache';
import { AutomationMetrics } from './automationMetrics';
import { HybridJobSearchFlow } from './hybridJobSearchFlow';

interface LinkedInAutomationConfig {
  maxRetries?: number;
  retryDelay?: number;
  saveProgressInterval?: number;
  checkInterventionAfterActions?: boolean;
  verboseLogging?: boolean;
}

interface AutomationProgress {
  totalJobs: number;
  processedJobs: number;
  appliedJobs: number;
  skippedJobs: number;
  failedJobs: number;
  currentPage: number;
  lastProcessedJobId?: string;
}

export class LinkedInAutomationService extends EventEmitter {
  private config: LinkedInAutomationConfig;
  private browserbaseManager: BrowserbaseSessionManager;
  private supabaseService: SupabaseAutomationService;
  private linkedinSessionService: LinkedInSessionService;
  private interventionDetector: InterventionDetectionService;
  private uploadService: BrowserbaseUploadService;
  private activeStagehand: Map<string, Stagehand> = new Map();
  private sessionProgress: Map<string, AutomationProgress> = new Map();
  private loginMonitors: Map<string, NodeJS.Timeout> = new Map();
  private uploadedResumes: Map<string, string> = new Map(); // sessionId -> uploadedFileName
  private jobCaches: Map<string, JobDataCache> = new Map();
  private metricsCollectors: Map<string, AutomationMetrics> = new Map();

  constructor(
    browserbaseManager: BrowserbaseSessionManager,
    supabaseService: SupabaseAutomationService,
    config?: LinkedInAutomationConfig
  ) {
    super();
    this.browserbaseManager = browserbaseManager;
    this.supabaseService = supabaseService;
    
    // Extract LinkedInSessionService from browserbaseManager
    this.linkedinSessionService = (browserbaseManager as any).sessionService;
    
    this.interventionDetector = new InterventionDetectionService({
      confidenceThreshold: 0.7,
      verboseLogging: config?.verboseLogging
    });
    
    // Initialize upload service
    this.uploadService = new BrowserbaseUploadService(
      process.env.BROWSERBASE_API_KEY!,
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    this.config = {
      maxRetries: 3,
      retryDelay: 2000,
      saveProgressInterval: 10, // Save every 10 jobs
      checkInterventionAfterActions: true,
      verboseLogging: false,
      ...config
    };
  }

  /**
   * Start a new LinkedIn job search automation session
   */
  async startJobSearch(
    userId: string,
    config: JobSearchConfig
  ): Promise<{ sessionId: string; debugUrl: string }> {
    try {
      // Use BrowserbaseSessionManager to create session with context
      const session = await this.browserbaseManager.createUserSession(userId, config);
      
      console.log('Created Browserbase session with context:', {
        sessionId: session.browserbase_session_id,
        hasContext: !!session.browserbase_context_id,
        contextId: session.browserbase_context_id
      });
      
      // Check if first-time user (no context)
      if (!session.browserbase_context_id) {
        this.emit(AutomationEventType.CONTEXT_STATUS, { 
          requiresLogin: true, 
          firstTime: true,
          sessionId: session.browserbase_session_id
        });
      }
      
      // Initialize Stagehand with the existing session
      const stagehand = new Stagehand({
        env: 'BROWSERBASE',
        browserbaseApiKey: process.env.BROWSERBASE_API_KEY!,
        projectId: process.env.BROWSERBASE_PROJECT_ID!,
        browserbaseSessionID: session.browserbase_session_id, // Use existing session
        verbose: this.config.verboseLogging ? 1 : 0,
        modelName: 'openai/gpt-4o' as any,
        openaiApiKey: process.env.OPENAI_API_KEY!,
        domSettleTimeoutMs: 30000
      });

      try {
        console.log('Initializing Stagehand with existing session:', {
          sessionId: session.browserbase_session_id,
          contextId: session.browserbase_context_id
        });
        
        await stagehand.init();
        console.log('Stagehand initialized successfully');
        
        this.activeStagehand.set(session.browserbase_session_id, stagehand);
      } catch (initError: any) {
        console.error('Stagehand initialization error:', initError);
        console.error('Error details:', {
          message: initError.message,
          stack: initError.stack,
          response: initError.response,
          data: initError.data
        });
        // Clean up Stagehand if initialization fails
        if (stagehand) {
          await stagehand.close().catch(() => {});
        }
        throw initError;
      }

      // Initialize progress tracking
      const progress: AutomationProgress = {
        totalJobs: 0,
        processedJobs: 0,
        appliedJobs: 0,
        skippedJobs: 0,
        failedJobs: 0,
        currentPage: 1
      };
      this.sessionProgress.set(session.browserbase_session_id, progress);

      // Initialize cache and metrics for this session
      const cache = new JobDataCache(session.browserbase_session_id);
      const metrics = new AutomationMetrics(session.browserbase_session_id);
      
      // Forward cache and metrics events
      cache.on(AutomationEventType.CACHE_HIT, (data) => this.emit(AutomationEventType.CACHE_HIT, data));
      cache.on(AutomationEventType.CACHE_MISS, (data) => this.emit(AutomationEventType.CACHE_MISS, data));
      metrics.on(AutomationEventType.METRICS_UPDATED, (data) => this.emit(AutomationEventType.METRICS_UPDATED, data));
      
      this.jobCaches.set(session.browserbase_session_id, cache);
      this.metricsCollectors.set(session.browserbase_session_id, metrics);

      // Emit event
      this.emit(AutomationEventType.SESSION_STARTED, {
        sessionId: session.browserbase_session_id,
        userId,
        config,
        debugUrl: session.live_view_url
      });

      // Start the automation process asynchronously
      this.runAutomation(session, stagehand, config).catch(error => {
        console.error('Automation process error:', error);
        // Don't handle intervention errors as failures
        if (error instanceof Error && !error.message.includes('Intervention required')) {
          this.handleAutomationError(session.browserbase_session_id, error);
        }
      });

      return {
        sessionId: session.browserbase_session_id,
        debugUrl: session.live_view_url || ''
      };
    } catch (error) {
      console.error('Failed to start job search:', error);
      throw error;
    }
  }

  /**
   * Get automation progress
   */
  async getProgress(sessionId: string): Promise<AutomationProgress> {
    const progress = this.sessionProgress.get(sessionId);
    if (!progress) {
      // Return default progress if not found
      return {
        totalJobs: 0,
        processedJobs: 0,
        appliedJobs: 0,
        skippedJobs: 0,
        failedJobs: 0,
        currentPage: 1
      };
    }
    return progress;
  }

  /**
   * Pause automation session
   */
  async pauseSession(sessionId: string): Promise<void> {
    try {
      const session = await this.linkedinSessionService.getSessionByBrowserbaseId(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Update session status
      await this.linkedinSessionService.updateSessionStatus(
        session.id,
        'completed',
        new Date()
      );

      // Clean up Stagehand
      const stagehand = this.activeStagehand.get(sessionId);
      if (stagehand) {
        await stagehand.close();
        this.activeStagehand.delete(sessionId);
      }
      
      // Clean up metrics and cache
      const metrics = this.metricsCollectors.get(sessionId);
      if (metrics) {
        metrics.dispose();
        this.metricsCollectors.delete(sessionId);
      }
      
      const cache = this.jobCaches.get(sessionId);
      if (cache) {
        cache.clear();
        this.jobCaches.delete(sessionId);
      }

      this.emit(AutomationEventType.SESSION_PAUSED, { sessionId });
    } catch (error) {
      console.error('Failed to pause session:', error);
      throw error;
    }
  }

  /**
   * Resume automation session after intervention
   */
  async resumeSession(sessionId: string): Promise<void> {
    try {
      const session = await this.linkedinSessionService.getSessionByBrowserbaseId(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const stagehand = this.activeStagehand.get(sessionId);
      if (!stagehand) {
        throw new Error('No active Stagehand instance for this session');
      }

      // Get the stored config from the initial session
      const config = session.config || {};
      
      console.log('Resuming automation after intervention for session:', sessionId);
      
      // Update session status back to active
      await this.linkedinSessionService.updateSessionStatus(
        session.id,
        'active',
        null
      );
      
      // Emit resumption event
      this.emit(AutomationEventType.SESSION_RESUMED, { sessionId });
      
      // Continue the automation from where we left off
      this.runAutomation(session, stagehand, config).catch(error => {
        console.error('Error resuming automation:', error);
        this.handleAutomationError(sessionId, error);
      });
    } catch (error) {
      console.error('Failed to resume session:', error);
      throw error;
    }
  }

  /**
   * Stop automation session
   */
  async stopSession(sessionId: string, reason?: string): Promise<void> {
    try {
      const session = await this.linkedinSessionService.getSessionByBrowserbaseId(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Update session status
      await this.linkedinSessionService.updateSessionStatus(
        session.id,
        reason === 'expired' ? 'expired' : 'completed',
        new Date()
      );

      // Clean up Stagehand
      const stagehand = this.activeStagehand.get(sessionId);
      if (stagehand) {
        await stagehand.close();
        this.activeStagehand.delete(sessionId);
      }

      // Clean up progress
      this.sessionProgress.delete(sessionId);
      
      // Clean up uploaded resume reference
      this.uploadedResumes.delete(sessionId);
      
      // Clean up metrics and cache
      const metrics = this.metricsCollectors.get(sessionId);
      if (metrics) {
        metrics.dispose();
        this.metricsCollectors.delete(sessionId);
      }
      
      const cache = this.jobCaches.get(sessionId);
      if (cache) {
        cache.clear();
        this.jobCaches.delete(sessionId);
      }

      this.emit(AutomationEventType.SESSION_STOPPED, { sessionId, reason });
    } catch (error) {
      console.error('Failed to stop session:', error);
      throw error;
    }
  }

  /**
   * Run the automation process
   */
  private async runAutomation(
    session: LinkedInSession,
    stagehand: Stagehand,
    config: JobSearchConfig
  ): Promise<void> {
    try {
      // Upload resume if provided
      if (config.resumeUrl) {
        try {
          console.log('Uploading resume from:', config.resumeUrl);
          const uploadedFileName = await this.uploadService.uploadResumeFromSupabase(
            session.browserbase_session_id,
            config.resumeUrl
          );
          this.uploadedResumes.set(session.browserbase_session_id, uploadedFileName);
          console.log('Resume uploaded successfully:', uploadedFileName);
        } catch (error) {
          console.error('Failed to upload resume, continuing without it:', error);
          // Don't fail the entire process if resume upload fails
        }
      }

      // Navigate to LinkedIn
      await this.navigateToLinkedIn(stagehand, session.browserbase_session_id);

      // Check if navigation succeeded (no intervention needed)
      const currentSession = await this.linkedinSessionService.getSessionByBrowserbaseId(session.browserbase_session_id);
      if (currentSession?.status === 'intervention_required') {
        console.log('Automation paused for intervention');
        return; // Exit gracefully - login monitor will resume
      }
      
      // Get cache and metrics for this session
      const cache = this.jobCaches.get(session.browserbase_session_id)!;
      const metrics = this.metricsCollectors.get(session.browserbase_session_id)!;
      
      // Create and execute hybrid flow
      const hybridFlow = new HybridJobSearchFlow(
        stagehand,
        session,
        config,
        cache,
        metrics,
        this.linkedinSessionService
      );
      
      // Forward events
      hybridFlow.on(AutomationEventType.ACTION_PERFORMED, (data) => this.emit(AutomationEventType.ACTION_PERFORMED, data));
      hybridFlow.on(AutomationEventType.AGENT_STEP, (data) => this.emit(AutomationEventType.AGENT_STEP, data));
      hybridFlow.on(AutomationEventType.AGENT_STEP_REALTIME, (data) => this.emit(AutomationEventType.AGENT_STEP_REALTIME, data));
      hybridFlow.on(AutomationEventType.AGENT_COMPLETE, (data) => this.emit(AutomationEventType.AGENT_COMPLETE, data));
      hybridFlow.on(AutomationEventType.EXTRACTION_RESULT, (data) => this.emit(AutomationEventType.EXTRACTION_RESULT, data));
      hybridFlow.on(AutomationEventType.JOB_FOUND, (data) => this.emit(AutomationEventType.JOB_FOUND, data));
      hybridFlow.on(AutomationEventType.JOB_SKIPPED, (data) => this.emit(AutomationEventType.JOB_SKIPPED, data));
      hybridFlow.on(AutomationEventType.APPLICATION_STARTED, (data) => this.emit(AutomationEventType.APPLICATION_STARTED, data));
      hybridFlow.on(AutomationEventType.APPLICATION_SAVED, (data) => this.emit(AutomationEventType.APPLICATION_SAVED, data));
      hybridFlow.on(AutomationEventType.APPLICATION_SUBMITTED, (data) => this.emit(AutomationEventType.APPLICATION_SUBMITTED, data));
      hybridFlow.on(AutomationEventType.SESSION_COMPLETED, (data) => this.emit(AutomationEventType.SESSION_COMPLETED, data));
      hybridFlow.on(AutomationEventType.INTERVENTION_REQUIRED, (data) => this.emit(AutomationEventType.INTERVENTION_REQUIRED, data));
      
      // Execute the flow
      await hybridFlow.execute();

    } catch (error) {
      console.error('Job search automation error:', error);
      
      // Check if it's an intervention error
      if (error instanceof Error && error.message.includes('Intervention required')) {
        console.log('Automation paused due to intervention requirement');
        // Don't handle as error - the session should stay active
        // The intervention event has already been emitted
        return;
      }
      
      await this.handleAutomationError(session.browserbase_session_id, error);
      throw error;
    }
  }

  /**
   * Navigate to LinkedIn Jobs page
   */
  private async navigateToLinkedIn(
    stagehand: Stagehand,
    sessionId: string
  ): Promise<void> {
    try {
      // Use domcontentloaded instead of networkidle to avoid timeout
      await stagehand.page.goto('https://www.linkedin.com/jobs/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000 // Increase timeout to 60 seconds
      });

      // Wait a bit for the page to settle
      await stagehand.page.waitForTimeout(3000);

      // Check for interventions
      if (this.config.checkInterventionAfterActions) {
        const needsIntervention = await this.checkForIntervention(stagehand, sessionId);
        if (needsIntervention) {
          // Stop the automation flow gracefully
          return;
        }
      }
    } catch (error) {
      console.error('Failed to navigate to LinkedIn:', error);
      throw error;
    }
  }

  /**
   * Check for intervention requirements
   */
  private async checkForIntervention(
    stagehand: Stagehand,
    sessionId: string
  ): Promise<boolean> {
    try {
      const detection = await this.interventionDetector.detectIntervention(stagehand.page);
      
      if (detection.requiresIntervention) {
        console.log('Intervention detected:', detection);
        
        // Get the current session
        const session = await this.linkedinSessionService.getSessionByBrowserbaseId(sessionId);
        if (!session) {
          console.error('Session not found for intervention');
          return true;
        }
        
        // Update session status to intervention_required
        await this.linkedinSessionService.updateSessionStatus(
          session.id,
          'intervention_required',
          null
        );
        
        // Get the current URL
        const currentUrl = await stagehand.page.url();
        
        // Emit intervention event
        this.emit(AutomationEventType.INTERVENTION_REQUIRED, {
          sessionId,
          intervention: {
            type: detection.type,
            confidence: detection.confidence,
            message: detection.message || 'Manual intervention required',
            instructions: this.getInterventionInstructions(detection.type),
            url: currentUrl,
            liveViewUrl: session.live_view_url
          }
        });
        
        // Log the intervention
        console.log(`Intervention required for session ${sessionId}:`, {
          type: detection.type,
          url: currentUrl,
          liveViewUrl: session.live_view_url
        });
        
        // Set up login monitoring for login interventions
        if (detection.type === InterventionType.LOGIN) {
          this.startLoginMonitoring(sessionId, session);
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking for intervention:', error);
      return false;
    }
  }

  /**
   * Get instructions for specific intervention types
   */
  private getInterventionInstructions(type: InterventionType): string {
    switch (type) {
      case InterventionType.LOGIN:
        return 'Please log in to your LinkedIn account to continue the automation.';
      case InterventionType.CAPTCHA:
        return 'Please solve the CAPTCHA to continue.';
      case InterventionType.TWO_FA:
        return 'Please complete the two-factor authentication to continue.';
      case InterventionType.BLOCKED:
        return 'Your account may be temporarily restricted. Please verify your account or try again later.';
      case InterventionType.RATE_LIMIT:
        return 'LinkedIn has rate-limited your activity. Please wait a few minutes before continuing.';
      case InterventionType.ACCOUNT_CREATION:
        return 'Please create an account on the company website to continue with the application.';
      default:
        return 'Manual intervention required. Please check the browser and complete any required actions.';
    }
  }

  /**
   * Start monitoring for login completion
   */
  private startLoginMonitoring(sessionId: string, session: LinkedInSession): void {
    console.log('Starting login monitoring for session:', sessionId);
    
    // Clear any existing monitor
    const existingMonitor = this.loginMonitors.get(sessionId);
    if (existingMonitor) {
      clearInterval(existingMonitor);
    }
    
    // Set up periodic check
    const monitor = setInterval(async () => {
      try {
        const stagehand = this.activeStagehand.get(sessionId);
        if (!stagehand) {
          console.log('No active Stagehand for monitoring, clearing monitor');
          clearInterval(monitor);
          this.loginMonitors.delete(sessionId);
          return;
        }
        
        // Check current URL
        const currentUrl = await stagehand.page.url().catch(() => null);
        if (!currentUrl) {
          console.log('Failed to get current URL, browser may be closed');
          clearInterval(monitor);
          this.loginMonitors.delete(sessionId);
          return;
        }
        
        console.log('Login monitor check - URL:', currentUrl);
        
        // Check if we're logged in
        if (currentUrl.includes('/feed/') || currentUrl.includes('/jobs/')) {
          console.log('Login detected! User is now on:', currentUrl);
          
          // Clear the monitor
          clearInterval(monitor);
          this.loginMonitors.delete(sessionId);
          
          // Update session status
          await this.linkedinSessionService.updateSessionStatus(
            session.id,
            'active',
            null
          );
          
          // Save the context for future sessions
          const contextId = session.browserbase_context_id;
          if (contextId) {
            await this.linkedinSessionService.updateUserContext(session.user_id, contextId);
            console.log('Context saved for future sessions');
          }
          
          // Resume the automation
          console.log('Resuming automation after successful login');
          const config = session.config || {};
          
          this.runAutomation(session, stagehand, config).catch(error => {
            console.error('Error resuming automation after login:', error);
            this.handleAutomationError(sessionId, error);
          });
        }
      } catch (error) {
        console.error('Error in login monitor:', error);
      }
    }, 5000); // Check every 5 seconds
    
    this.loginMonitors.set(sessionId, monitor);
    
    // Set a timeout to stop monitoring after 30 minutes
    setTimeout(() => {
      const activeMonitor = this.loginMonitors.get(sessionId);
      if (activeMonitor === monitor) {
        console.log('Login monitoring timeout reached for session:', sessionId);
        clearInterval(monitor);
        this.loginMonitors.delete(sessionId);
      }
    }, 30 * 60 * 1000); // 30 minutes
  }

  /**
   * Manually continue automation after login
   * This can be called when the frontend detects the user has logged in
   */
  async continueAfterLogin(sessionId: string): Promise<void> {
    try {
      console.log('Manual continue requested for session:', sessionId);
      console.log('Active Stagehand sessions:', Array.from(this.activeStagehand.keys()));
      
      // Get the stagehand instance
      let stagehand = this.activeStagehand.get(sessionId);
      
      // If no active Stagehand, try to reconnect to the Browserbase session
      if (!stagehand) {
        console.log('No active Stagehand found, attempting to reconnect to Browserbase session...');
        
        try {
          // Initialize a new Stagehand instance with the existing session
          console.log('Attempting to reconnect with sessionId:', sessionId);
          stagehand = new Stagehand({
            env: 'BROWSERBASE',
            projectId: process.env.BROWSERBASE_PROJECT_ID!,
            browserbaseApiKey: process.env.BROWSERBASE_API_KEY!,
            browserbaseSessionID: sessionId, // Use capital ID for reconnecting to existing session
            modelName: 'openai/gpt-4o' as any,
            openaiApiKey: process.env.OPENAI_API_KEY!,
            verbose: 1,
            domSettleTimeoutMs: 30000 // Increase timeout for reconnection
          });
          
          await stagehand.init();
          console.log('Successfully reconnected to Browserbase session');
          
          // Store the new instance
          this.activeStagehand.set(sessionId, stagehand);
        } catch (reconnectError) {
          console.error('Failed to reconnect to Browserbase session:', reconnectError);
          throw new Error('Failed to reconnect to browser session. The session may have expired.');
        }
      }
      
      // Get the session
      const session = await this.linkedinSessionService.getSessionByBrowserbaseId(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      
      // Clear any login monitor
      const monitor = this.loginMonitors.get(sessionId);
      if (monitor) {
        clearInterval(monitor);
        this.loginMonitors.delete(sessionId);
      }
      
      // Check current URL to confirm we're logged in
      const currentUrl = await stagehand.page.url();
      console.log('Current URL:', currentUrl);
      
      if (currentUrl.includes('/jobs/') || currentUrl.includes('/feed/')) {
        // We're logged in, update status and continue
        await this.linkedinSessionService.updateSessionStatus(
          session.id,
          'active',
          null
        );
        
        // Get cache and metrics for this session
        const cache = this.jobCaches.get(session.browserbase_session_id) || new JobDataCache(session.browserbase_session_id);
        const metrics = this.metricsCollectors.get(session.browserbase_session_id) || new AutomationMetrics(session.browserbase_session_id);
        
        if (!this.jobCaches.has(session.browserbase_session_id)) {
          this.jobCaches.set(session.browserbase_session_id, cache);
        }
        if (!this.metricsCollectors.has(session.browserbase_session_id)) {
          this.metricsCollectors.set(session.browserbase_session_id, metrics);
        }
        
        // Create and execute hybrid flow
        const hybridFlow = new HybridJobSearchFlow(
          stagehand,
          session,
          session.config || {},
          cache,
          metrics,
          this.linkedinSessionService
        );
        
        // Forward events
        hybridFlow.on(AutomationEventType.ACTION_PERFORMED, (data) => this.emit(AutomationEventType.ACTION_PERFORMED, data));
        hybridFlow.on(AutomationEventType.AGENT_STEP, (data) => this.emit(AutomationEventType.AGENT_STEP, data));
        hybridFlow.on(AutomationEventType.AGENT_STEP_REALTIME, (data) => this.emit(AutomationEventType.AGENT_STEP_REALTIME, data));
        hybridFlow.on(AutomationEventType.AGENT_COMPLETE, (data) => this.emit(AutomationEventType.AGENT_COMPLETE, data));
        hybridFlow.on(AutomationEventType.EXTRACTION_RESULT, (data) => this.emit(AutomationEventType.EXTRACTION_RESULT, data));
        hybridFlow.on(AutomationEventType.JOB_FOUND, (data) => this.emit(AutomationEventType.JOB_FOUND, data));
        hybridFlow.on(AutomationEventType.JOB_SKIPPED, (data) => this.emit(AutomationEventType.JOB_SKIPPED, data));
        hybridFlow.on(AutomationEventType.APPLICATION_STARTED, (data) => this.emit(AutomationEventType.APPLICATION_STARTED, data));
        hybridFlow.on(AutomationEventType.APPLICATION_SAVED, (data) => this.emit(AutomationEventType.APPLICATION_SAVED, data));
        hybridFlow.on(AutomationEventType.APPLICATION_SUBMITTED, (data) => this.emit(AutomationEventType.APPLICATION_SUBMITTED, data));
        hybridFlow.on(AutomationEventType.SESSION_COMPLETED, (data) => this.emit(AutomationEventType.SESSION_COMPLETED, data));
        hybridFlow.on(AutomationEventType.INTERVENTION_REQUIRED, (data) => this.emit(AutomationEventType.INTERVENTION_REQUIRED, data));
        
        // Execute the flow
        await hybridFlow.execute();
      } else {
        throw new Error('Still on login page. Please complete login first.');
      }
    } catch (error) {
      console.error('Error continuing after login:', error);
      throw error;
    }
  }

  /**
   * Upload resume to Browserbase session
   */
  private async uploadResume(sessionId: string, resumeUrl: string): Promise<boolean> {
    try {
      console.log('Uploading resume from:', resumeUrl);
      const uploadedFileName = await this.uploadService.uploadResumeFromSupabase(
        sessionId,
        resumeUrl
      );
      this.uploadedResumes.set(sessionId, uploadedFileName);
      console.log('Resume uploaded successfully:', uploadedFileName);
      return true;
    } catch (error) {
      console.error('Failed to upload resume:', error);
      return false;
    }
  }

  /**
   * Handle automation errors
   */
  private async handleAutomationError(
    sessionId: string,
    error: any
  ): Promise<void> {
    try {
      const session = await this.linkedinSessionService.getSessionByBrowserbaseId(sessionId);
      if (session) {
        await this.linkedinSessionService.updateSessionStatus(
          session.id,
          'failed',
          new Date()
        );
      }

      // Clean up
      const stagehand = this.activeStagehand.get(sessionId);
      if (stagehand) {
        await stagehand.close();
        this.activeStagehand.delete(sessionId);
      }
      this.sessionProgress.delete(sessionId);
      this.uploadedResumes.delete(sessionId);
      
      // Clean up metrics and cache
      const metrics = this.metricsCollectors.get(sessionId);
      if (metrics) {
        metrics.dispose();
        this.metricsCollectors.delete(sessionId);
      }
      
      const cache = this.jobCaches.get(sessionId);
      if (cache) {
        cache.clear();
        this.jobCaches.delete(sessionId);
      }

      // Emit error event
      this.emit(AutomationEventType.ERROR, {
        sessionId,
        error: error.message || 'Unknown error'
      });
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
  }
}