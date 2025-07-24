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
      // Check if user has reached session limit before creating Stagehand
      const activeCount = await this.linkedinSessionService.getActiveSessionsCount(userId);
      if (activeCount >= 10) { // Temporarily increased for testing
        throw new AutomationError(
          'Session limit reached. Please complete or terminate existing sessions.',
          'SESSION_LIMIT_REACHED',
          { userId, limit: 10, currentActive: activeCount }
        );
      }
      
      // Initialize Stagehand with Browserbase and OpenAI GPT-4o
      // Let Stagehand manage the browser session
      const stagehand = new Stagehand({
        env: 'BROWSERBASE',
        browserbaseApiKey: process.env.BROWSERBASE_API_KEY!,
        projectId: process.env.BROWSERBASE_PROJECT_ID!,
        verbose: this.config.verboseLogging ? 1 : 0,  // Convert boolean to number
        modelName: 'openai/gpt-4o' as any,
        openaiApiKey: process.env.OPENAI_API_KEY!,
        // Enable proxies for Browserbase sessions
        // Note: proxies are enabled by default in Browserbase
        // Only specify if you need to customize proxy settings
        domSettleTimeoutMs: 30000
      });

      let sessionId: string;
      let session: LinkedInSession;

      try {
        console.log('Initializing Stagehand with config:', {
          env: 'BROWSERBASE',
          projectId: process.env.BROWSERBASE_PROJECT_ID,
          browserbaseApiKey: process.env.BROWSERBASE_API_KEY ? 'present' : 'missing',
          modelName: 'openai/gpt-4o',
          openaiApiKey: process.env.OPENAI_API_KEY ? 'present' : 'missing',
          verbose: this.config.verboseLogging ? 1 : 0
        });
        
        const initResult = await stagehand.init();
        console.log('Stagehand initialized successfully', initResult);
        
        // Get the browserbase session ID from Stagehand
        // Stagehand should provide the session ID after initialization
        const browserbaseSessionId = (stagehand as any).browserbaseSessionID || 
                                   (stagehand as any).sessionId || 
                                   (initResult as any)?.sessionId ||
                                   `stagehand-${uuidv4()}`;
        
        sessionId = browserbaseSessionId;
        
        // Get proper debug URLs from Browserbase API
        let liveViewUrl = '';
        try {
          const debugUrls = await this.browserbaseManager.getSessionDebugUrls(sessionId);
          liveViewUrl = debugUrls.debuggerUrl; // Use the debugger URL as the live view URL
          console.log('Got Browserbase debug URLs:', debugUrls);
        } catch (error) {
          console.error('Failed to get debug URLs, using fallback:', error);
          // Fallback URL format
          liveViewUrl = `https://www.browserbase.com/sessions/${sessionId}`;
        }
        
        console.log('Browserbase session created:', { sessionId, liveViewUrl });
        
        // Create session record in our database with config
        session = await this.linkedinSessionService.createSession(
          userId,
          sessionId,
          liveViewUrl,
          config // Store the job search config for later resumption
        );
        
        this.activeStagehand.set(sessionId, stagehand);
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
      this.sessionProgress.set(sessionId, progress);

      // Emit event
      this.emit(AutomationEventType.SESSION_STARTED, {
        sessionId: sessionId,
        userId,
        config,
        debugUrl: session.live_view_url
      });

      // Start the automation process asynchronously
      this.runAutomation(session, stagehand, config).catch(error => {
        console.error('Automation process error:', error);
        // Don't handle intervention errors as failures
        if (error instanceof Error && !error.message.includes('Intervention required')) {
          this.handleAutomationError(sessionId, error);
        }
      });

      return {
        sessionId: sessionId,
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
      // We need to determine where we were in the process
      const currentUrl = await stagehand.page.url();
      
      if (currentUrl.includes('linkedin.com/jobs')) {
        // We're on the jobs page, continue with job search
        await this.performJobSearch(stagehand, sessionId, config);
        
        // Continue with the rest of the automation
        this.runAutomation(session, stagehand, config).catch(error => {
          console.error('Error resuming automation:', error);
          this.handleAutomationError(sessionId, error);
        });
      } else {
        // We're not on the jobs page, navigate there first
        await this.navigateToLinkedIn(stagehand, sessionId);
        
        // Then continue with the full automation
        this.runAutomation(session, stagehand, config).catch(error => {
          console.error('Error resuming automation:', error);
          this.handleAutomationError(sessionId, error);
        });
      }
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
        'completed',
        new Date()
      );

      // Clean up login monitor if exists
      if (this.loginMonitors.has(sessionId)) {
        clearInterval(this.loginMonitors.get(sessionId));
        this.loginMonitors.delete(sessionId);
      }

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
      
      // Execute the comprehensive job application flow
      await this.executeJobApplicationFlow(stagehand, session, config);

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
   * Perform job search with given criteria
   * @deprecated Use executeJobApplicationFlow instead
   */
  private async performJobSearch(
    stagehand: Stagehand,
    sessionId: string,
    config: JobSearchConfig
  ): Promise<void> {
    try {
      // First check we're actually on the jobs page
      const currentUrl = await stagehand.page.url();
      console.log('Current URL before job search:', currentUrl);
      
      // If we're on a login page or not on jobs page, wait or navigate
      if (currentUrl.includes('login') || currentUrl.includes('sign-in') || !currentUrl.includes('linkedin.com/jobs')) {
        console.log('Not on jobs page, navigating...');
        
        // Navigate to jobs page
        await stagehand.page.goto('https://www.linkedin.com/jobs/', {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
        await stagehand.page.waitForTimeout(5000); // Give more time for page to load
      }

      // Parse the search prompt if it's a natural language query
      let jobTitle = config.jobTitle;
      let location = config.location;
      
      if (config.searchPrompt && !jobTitle && !location) {
        // Extract job title and location from natural language prompt
        const parsed = this.parseSearchPrompt(config.searchPrompt);
        jobTitle = parsed.jobTitle || jobTitle;
        location = parsed.location || location;
        console.log('Parsed search prompt:', { original: config.searchPrompt, jobTitle, location });
      }

      // Search for job title in the appropriate field
      if (jobTitle) {
        console.log('Entering job title:', jobTitle);
        // Clear any existing text first
        await stagehand.page.act('Click on the job search input field that says "Search by title, skill, or company" or has placeholder text about job titles');
        await stagehand.page.waitForTimeout(500);
        // Clear the field
        await stagehand.page.act('Select all text in the currently focused input field and delete it');
        await stagehand.page.waitForTimeout(500);
        // Type the job title
        await stagehand.page.act(`Type "${jobTitle}" into the currently focused input field`);
        await stagehand.page.waitForTimeout(1000);
      }

      // Set location in the location field separately
      if (location) {
        console.log('Entering location:', location);
        // Click on the location field
        await stagehand.page.act('Click on the location input field that says "City, state, or zip code" or has placeholder text about location');
        await stagehand.page.waitForTimeout(500);
        // Clear the field
        await stagehand.page.act('Select all text in the currently focused input field and delete it');
        await stagehand.page.waitForTimeout(500);
        // Type the location
        await stagehand.page.act(`Type "${location}" into the currently focused input field`);
        await stagehand.page.waitForTimeout(1000);
      }

      // Click search button or press Enter
      await stagehand.page.act('Click the search button or press Enter to search for jobs');

      // Wait for results to load
      await stagehand.page.waitForTimeout(3000);

      // Apply filters if configured
      await this.applySearchFilters(stagehand, sessionId, config);

    } catch (error) {
      console.error('Failed to perform job search:', error);
      throw error;
    }
  }

  /**
   * Process job listings on current page
   * @deprecated Use executeJobApplicationFlow instead
   */
  private async processJobListings(
    stagehand: Stagehand,
    session: LinkedInSession,
    config: JobSearchConfig,
    progress: AutomationProgress
  ): Promise<number> {
    try {
      // Extract job listings using Stagehand's extract method
      console.log('Extracting job listings...');
      
      // Define the schema for job listings
      const jobSchema = z.object({
        jobId: z.string().optional(),
        title: z.string(),
        company: z.string(),
        location: z.string(),
        jobUrl: z.string().optional(),
        isEasyApply: z.boolean()
      });
      
      // Extract jobs - use z.array() for multiple items
      const jobs = await stagehand.page.extract({
        instruction: 'Extract all job listings visible on this page. For each job, get the job title, company name, location, job URL if available, and whether it has an Easy Apply button.',
        schema: z.array(jobSchema)
      }) as any[];

      if (!jobs || jobs.length === 0) {
        return 0;
      }

      progress.totalJobs += jobs.length;

      // Process each job
      for (const job of jobs) {
        try {
          // Check if already applied
          const alreadyApplied = await this.linkedinSessionService.hasAppliedToJob(
            session.user_id,
            job.jobUrl
          );

          if (alreadyApplied) {
            progress.skippedJobs++;
            continue;
          }

          // Check if should apply (based on config)
          if (config.easyApplyOnly && !job.isEasyApply) {
            progress.skippedJobs++;
            continue;
          }

          // Apply to job (simplified for now - the comprehensive prompt handles this)
          // In the new flow, applications are handled by executeJobApplicationFlow
          const applied = false; // This method is deprecated
          
          if (applied) {
            progress.appliedJobs++;
            
            // Record application
            await this.linkedinSessionService.recordJobApplication(
              session.id,
              session.user_id,
              {
                job_url: job.jobUrl,
                job_id: job.jobId,
                company_name: job.company,
                job_title: job.title,
                location: job.location,
                application_type: job.isEasyApply ? 'easy_apply' : 'external',
                success: true
              }
            );
          } else {
            progress.failedJobs++;
          }

          progress.processedJobs++;

          // Check max applications
          if (config.maxApplications && progress.appliedJobs >= config.maxApplications) {
            break;
          }

        } catch (error) {
          console.error('Error processing job:', error);
          progress.failedJobs++;
          progress.processedJobs++;
        }
      }

      return jobs.length;
    } catch (error) {
      console.error('Failed to process job listings:', error);
      return 0;
    }
  }


  /**
   * Apply search filters using natural language understanding
   */
  private async applySearchFilters(
    stagehand: Stagehand,
    sessionId: string,
    config: JobSearchConfig
  ): Promise<void> {
    try {
      // If we have a natural language prompt, let Stagehand figure out the filters
      if (config.searchPrompt) {
        // Extract filter requirements from the prompt
        const filterInstructions = this.buildFilterInstructions(config.searchPrompt);
        
        if (filterInstructions) {
          console.log('Applying filters from natural language prompt:', filterInstructions);
          await stagehand.page.act(filterInstructions);
          await stagehand.page.waitForTimeout(2000);
        }
      }
      
      // Apply explicit filters if provided
      // Date posted filter
      if (config.datePosted) {
        await stagehand.page.act('Click the Date posted filter');
        await stagehand.page.act(`Select "${config.datePosted}" from the date posted options`);
        await stagehand.page.waitForTimeout(1000);
      }

      // Easy Apply filter
      if (config.easyApplyOnly) {
        await stagehand.page.act('Enable the Easy Apply filter by clicking its toggle or checkbox');
        await stagehand.page.waitForTimeout(1000);
      }

      // Remote filter
      if (config.remote) {
        await stagehand.page.act('Enable the Remote filter by clicking its toggle or checkbox');
        await stagehand.page.waitForTimeout(1000);
      }

      // Experience level filter
      if (config.experienceLevel && config.experienceLevel.length > 0) {
        await stagehand.page.act('Click on the Experience level filter');
        await stagehand.page.waitForTimeout(500);
        for (const level of config.experienceLevel) {
          const readableLevel = this.getReadableExperienceLevel(level);
          await stagehand.page.act(`Select "${readableLevel}" from the experience level options`);
          await stagehand.page.waitForTimeout(500);
        }
      }

      // Job type filter
      if (config.jobType && config.jobType.length > 0) {
        await stagehand.page.act('Click on the Job type filter');
        await stagehand.page.waitForTimeout(500);
        for (const type of config.jobType) {
          const readableType = this.getReadableJobType(type);
          await stagehand.page.act(`Select "${readableType}" from the job type options`);
          await stagehand.page.waitForTimeout(500);
        }
      }
    } catch (error) {
      console.error('Failed to apply filters:', error);
      // Don't throw - continue without filters
    }
  }

  /**
   * Parse natural language search prompt to extract job title and location
   */
  private parseSearchPrompt(prompt: string): { jobTitle?: string; location?: string } {
    // Common patterns for extracting job title and location
    const result: { jobTitle?: string; location?: string } = {};
    
    // Remove common words that aren't part of job title or location
    const cleanPrompt = prompt.replace(/\b(jobs?|position|role|opportunity|opportunities|in|at|near|around)\b/gi, ' ').trim();
    
    // Try to extract location patterns
    const locationPatterns = [
      // City, State format
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+([A-Z]{2})\b/,
      // City, State/Province, Country
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s+([A-Z][a-z]+),?\s+([A-Z][a-z]+)\b/,
      // Just city name (common cities)
      /\b(San Francisco|Los Angeles|New York|Chicago|Seattle|Boston|Austin|Denver|Portland|Vancouver|Toronto|London|Berlin|Paris|Tokyo|Singapore)\b/i,
    ];
    
    let location = '';
    let remainingText = cleanPrompt;
    
    // Try each location pattern
    for (const pattern of locationPatterns) {
      const match = cleanPrompt.match(pattern);
      if (match) {
        location = match[0];
        // Remove the location from the remaining text
        remainingText = cleanPrompt.replace(match[0], '').trim();
        break;
      }
    }
    
    // Check for "in [location]" pattern
    const inLocationMatch = prompt.match(/\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:,?\s+[A-Z]{2})?)\b/);
    if (inLocationMatch && !location) {
      location = inLocationMatch[1];
      remainingText = remainingText.replace(inLocationMatch[0], '').trim();
    }
    
    // What's left should be the job title
    if (remainingText) {
      // Clean up extra spaces and common filler words
      result.jobTitle = remainingText
        .replace(/\s+/g, ' ')
        .replace(/^\s*for\s+/, '')
        .replace(/\s+for\s*$/, '')
        .trim();
    }
    
    if (location) {
      result.location = location.trim();
    }
    
    // If we couldn't parse it well, just use the whole prompt as job title
    if (!result.jobTitle && !result.location) {
      result.jobTitle = prompt;
    }
    
    return result;
  }

  /**
   * Build filter instructions from natural language prompt
   */
  private buildFilterInstructions(prompt: string): string | null {
    const instructions = [];
    
    // Check for date filters
    if (/today|past 24 hours/i.test(prompt)) {
      instructions.push('Set the date posted filter to "Past 24 hours"');
    } else if (/this week|past week/i.test(prompt)) {
      instructions.push('Set the date posted filter to "Past week"');
    } else if (/this month|past month/i.test(prompt)) {
      instructions.push('Set the date posted filter to "Past month"');
    }
    
    // Check for remote
    if (/remote|work from home|wfh/i.test(prompt)) {
      instructions.push('Enable the Remote work filter');
    }
    
    // Check for Easy Apply
    if (/easy apply|quick apply/i.test(prompt)) {
      instructions.push('Enable the Easy Apply filter');
    }
    
    // Check for experience level
    if (/entry level|junior/i.test(prompt)) {
      instructions.push('Set experience level filter to include "Entry level"');
    }
    if (/senior/i.test(prompt)) {
      instructions.push('Set experience level filter to include "Senior level"');
    }
    if (/intern/i.test(prompt)) {
      instructions.push('Set experience level filter to include "Internship"');
    }
    
    // Check for job type
    if (/full time|full-time/i.test(prompt)) {
      instructions.push('Set job type filter to "Full-time"');
    }
    if (/contract/i.test(prompt)) {
      instructions.push('Set job type filter to include "Contract"');
    }
    
    return instructions.length > 0 
      ? `Apply the following filters: ${instructions.join('. ')}. Click each filter button and select the appropriate options.`
      : null;
  }

  /**
   * Convert experience level enum to readable text
   */
  private getReadableExperienceLevel(level: string): string {
    const map: Record<string, string> = {
      'INTERNSHIP': 'Internship',
      'ENTRY_LEVEL': 'Entry level',
      'MID_LEVEL': 'Mid-Senior level',
      'SENIOR_LEVEL': 'Senior level',
      'DIRECTOR': 'Director',
      'EXECUTIVE': 'Executive'
    };
    return map[level] || level;
  }

  /**
   * Convert job type enum to readable text
   */
  private getReadableJobType(type: string): string {
    const map: Record<string, string> = {
      'FULL_TIME': 'Full-time',
      'PART_TIME': 'Part-time',
      'CONTRACT': 'Contract',
      'TEMPORARY': 'Temporary',
      'INTERNSHIP': 'Internship'
    };
    return map[type] || type;
  }

  /**
   * Navigate to next page of results
   */
  private async navigateToNextPage(
    stagehand: Stagehand,
    sessionId: string
  ): Promise<boolean> {
    try {
      // Check if there's a next page button by extracting page info
      const pageInfo = await stagehand.page.extract({
        instruction: 'Check if there is a "Next" or pagination button that is enabled and clickable. Return an object with hasNextButton property.',
        schema: z.object({
          hasNextButton: z.boolean()
        })
      }) as { hasNextButton: boolean };
      
      const hasNextButton = pageInfo.hasNextButton;

      if (hasNextButton) {
        await stagehand.page.act('Click the Next page button');
        await stagehand.page.waitForTimeout(3000);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to navigate to next page:', error);
      return false;
    }
  }

  /**
   * Check for interventions
   */
  private async checkForIntervention(
    stagehand: Stagehand,
    sessionId: string
  ): Promise<boolean> {
    try {
      const detection = await this.interventionDetector.detectIntervention(stagehand);
      
      if (detection && detection.confidence > 0.7) {
        // Emit intervention event
        this.emit(AutomationEventType.INTERVENTION_REQUIRED, {
          sessionId,
          intervention: {
            type: detection.type,
            message: detection.message,
            url: detection.pageContext?.url
          }
        });

        // Don't close the session, just pause the automation workflow
        // The session should stay alive for manual intervention
        console.log('Intervention detected, pausing automation workflow...');
        
        // Update session status to indicate intervention needed
        const session = await this.linkedinSessionService.getSessionByBrowserbaseId(sessionId);
        if (session) {
          await this.linkedinSessionService.updateSessionStatus(
            session.id,
            'intervention_required',
            null
          );
        }
        
        // If it's a login intervention, start monitoring for successful login
        if (detection.type === 'login') {
          this.startLoginMonitoring(stagehand, sessionId, session);
        }
        
        // Return true to indicate intervention is required
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to check for intervention:', error);
      return false;
    }
  }

  /**
   * Monitor for successful login completion
   * NOTE: This method is deprecated - we now wait for manual continuation
   */
  private async startLoginMonitoring(
    stagehand: Stagehand,
    sessionId: string,
    session: any
  ): Promise<void> {
    // Disabled automatic login monitoring - we now wait for manual continuation via API
    console.log('Login intervention detected for session:', sessionId);
    console.log('Waiting for manual continuation via /continue endpoint');
    
    // Clear any existing monitor for this session
    if (this.loginMonitors.has(sessionId)) {
      clearInterval(this.loginMonitors.get(sessionId));
      this.loginMonitors.delete(sessionId);
    }
    
    // Don't start automatic monitoring - wait for manual continue
  }

  /**
   * Build comprehensive prompt for job application
   */
  private buildComprehensivePrompt(config: JobSearchConfig): string {
    const searchQuery = config.searchPrompt || `${config.jobTitle} in ${config.location}`;
    const maxApplications = config.maxApplications || 50;
    const easyApplyOnly = config.easyApplyOnly !== false;
    
    return `
You are an AI assistant helping with LinkedIn job applications. 
The user wants to find and apply to jobs matching: "${searchQuery}"

Target: Apply to ${maxApplications} jobs ${easyApplyOnly ? 'using Easy Apply only' : 'including external applications'}

COMPLETE WORKFLOW:

1. JOB SEARCH:
   a) Click on LinkedIn's job search bar at the top of the page
   b) Clear any existing text in the search bar
   c) Type exactly: ${searchQuery}
   d) Press the Enter key to search
   e) Wait for job results page to load completely
   ${config.filters ? `- Apply these filters: ${JSON.stringify(config.filters)}` : ''}

2. JOB APPLICATION PROCESS:
   For each job listing (continue until ${maxApplications} applications):
   
   a) Click on the job to view details
   b) Note the company name and job title for tracking
   c) Look for ${easyApplyOnly ? 'Easy Apply button' : 'Apply or Easy Apply button'}
   d) ${easyApplyOnly ? 'Skip jobs without Easy Apply' : 'Click any available apply button'}
   
   For Easy Apply:
   - Fill out all required fields in the application form
   - For multi-step forms: Complete each step and click Next/Continue
   - CRITICAL: Always scroll down to find Submit button (it's never visible without scrolling)
   - Upload resume if prompted: ${config.resumeUrl || 'use most recent'}
   - Make educated guesses for fields without specific data:
     * Years of experience: Base on job level (entry=1-2, mid=3-5, senior=5+)
     * Salary expectations: Research typical ranges for the role/location
     * Availability: "2 weeks notice" or "Available immediately"
   - Click Submit to complete the application
   
   ${!easyApplyOnly ? `
   For External Applications:
   - Click will open new tab - IMMEDIATELY switch to that tab
   - Look at browser tabs and click on the new non-LinkedIn tab
   - Create account if needed
   - Fill application form on external site
   - Submit application
   - Close external tab and return to LinkedIn tab
   - Continue with next job
   ` : ''}
   
   e) After each successful application, announce: "APPLIED TO: [Company] - [Job Title]"
   f) Continue to next job

3. IMPORTANT BEHAVIORS:
   - ALWAYS scroll down when looking for buttons (especially Submit)
   - The submit button is ALWAYS at the bottom - keep scrolling until you find it
   - Keep accurate count of successful applications
   - If a form fails, note it and move to the next job
   - Stop when you reach ${maxApplications} successful applications
   - For required fields without data, make reasonable guesses based on context

4. HANDLING PAGINATION:
   - When you run out of jobs on current page, look for "See more jobs" or pagination
   - Click to load more jobs and continue applying
   - Only stop when you've reached ${maxApplications} or no more jobs available

5. COMPLETION:
   - Summarize: "Completed X applications out of ${maxApplications} target"
   - List all successful applications with company and job title

Remember: The goal is to complete ${maxApplications} job applications efficiently while maintaining accuracy in form filling.`;
  }

  /**
   * Build application prompt (without search part)
   */
  private buildApplicationPrompt(config: JobSearchConfig): string {
    const maxApplications = config.maxApplications || 50;
    const easyApplyOnly = config.easyApplyOnly !== false;
    
    return `
You are on LinkedIn's job search results page. Your task is to apply to jobs.

Target: Apply to ${maxApplications} jobs ${easyApplyOnly ? 'using Easy Apply only' : 'including external applications'}

JOB APPLICATION PROCESS:
For each job listing visible on the page (continue until ${maxApplications} applications):

1. Click on a job listing to view its details
2. Note the company name and job title for tracking
3. Look for the Easy Apply button
4. ${easyApplyOnly ? 'Skip this job if it does not have Easy Apply' : 'Apply to all jobs'}

For Easy Apply jobs:
- Click the Easy Apply button
- Fill out all required fields in the application form
- For multi-step forms: Complete each step and click Next/Continue
- CRITICAL: Always scroll down to find Submit button (it's never visible without scrolling)
- Upload resume if prompted: ${config.resumeUrl || 'use most recent'}
- Make educated guesses for fields without specific data:
  * Years of experience: Base on job level (entry=1-2, mid=3-5, senior=5+)
  * Salary expectations: Research typical ranges for the role/location
  * Availability: "2 weeks notice" or "Available immediately"
- Click Submit to complete the application

${!easyApplyOnly ? `
For External Applications:
- Click will open new tab - IMMEDIATELY switch to that tab
- Look at browser tabs and click on the new non-LinkedIn tab
- Create account if needed
- Fill application form on external site
- Submit application
- Close external tab and return to LinkedIn tab
- Continue with next job
` : ''}

After each successful application:
- Announce: "APPLIED TO: [Company] - [Job Title]"
- Continue to next job in the list

IMPORTANT BEHAVIORS:
- ALWAYS scroll down when looking for buttons (especially Submit)
- The submit button is ALWAYS at the bottom - keep scrolling until you find it
- Keep accurate count of successful applications
- If a form fails, note it and move to the next job
- Stop when you reach ${maxApplications} successful applications

HANDLING PAGINATION:
- When you run out of jobs on current page, look for "See more jobs" or pagination
- Click to load more jobs and continue applying
- Only stop when you've reached ${maxApplications} or no more jobs available

COMPLETION:
- Summarize: "Completed X applications out of ${maxApplications} target"
- List all successful applications with company and job title`;
  }

  /**
   * Fill out job application form
   */
  private async fillApplicationForm(stagehand: Stagehand, config: JobSearchConfig): Promise<void> {
    try {
      const formFields = await stagehand.page.extract({
        instruction: "Extract all form fields that need to be filled, including their labels and types",
        schema: z.object({
          hasResume: z.boolean(),
          hasPhone: z.boolean(),
          hasEmail: z.boolean(),
          hasExperience: z.boolean(),
          hasSalary: z.boolean(),
          hasAvailability: z.boolean(),
          otherFields: z.array(z.string())
        })
      });

      // Handle resume upload if needed
      if (formFields.hasResume) {
        const sessionId = Array.from(this.activeStagehand.entries())
          .find(([_, sh]) => sh === stagehand)?.[0];
        
        if (sessionId && this.uploadedResumes.has(sessionId)) {
          const resumeFileName = this.uploadedResumes.get(sessionId);
          console.log('Uploading resume file:', resumeFileName);
          
          try {
            // Find the file input element
            await stagehand.page.act('Click on the resume upload button or file input field');
            await stagehand.page.waitForTimeout(1000);
            
            // Use the uploaded file
            const fileInput = await stagehand.page.$('input[type="file"]');
            if (fileInput) {
              // The file is already uploaded to the session, we just need to reference it
              await fileInput.setInputFiles(resumeFileName!);
              console.log('Resume attached successfully');
            } else {
              console.log('Could not find file input, trying alternative approach');
              await stagehand.page.act(`Upload the file named "${resumeFileName}" for the resume field`);
            }
          } catch (error) {
            console.error('Failed to upload resume in form:', error);
          }
        } else {
          console.log('No resume uploaded for this session, skipping resume field');
        }
      }

      // Fill phone if needed
      if (formFields.hasPhone) {
        await stagehand.page.act('Fill in the phone number field with a valid phone number');
      }

      // Fill email if needed
      if (formFields.hasEmail) {
        await stagehand.page.act('Fill in the email field with the user email address');
      }

      // Fill experience if needed
      if (formFields.hasExperience) {
        await stagehand.page.act('Fill in years of experience based on the job level - entry level: 2 years, mid level: 5 years, senior: 8 years');
      }
      
      // Fill salary if needed
      if (formFields.hasSalary) {
        await stagehand.page.act('Fill in salary expectations with a reasonable range for the position and location');
      }
      
      // Fill availability if needed
      if (formFields.hasAvailability) {
        await stagehand.page.act('Fill in availability with "2 weeks notice" or select the appropriate option');
      }
      
      // Handle multi-step forms
      const hasNext = await stagehand.page.extract({
        instruction: "Check if there is a Next or Continue button",
        schema: z.object({ hasNext: z.boolean() })
      });
  
      if (hasNext.hasNext) {
        await stagehand.page.act('Click the Next or Continue button');
        await stagehand.page.waitForTimeout(2000);
        // Recursively fill the next step
        await this.fillApplicationForm(stagehand, config);
      }
      
    } catch (error) {
      console.error('Error filling application form:', error);
      throw error;
    }
  }

  /**
   * Execute comprehensive job application flow
   */
  private async executeJobApplicationFlow(
    stagehand: Stagehand,
    session: LinkedInSession,
    config: JobSearchConfig
  ): Promise<void> {
    try {
      console.log('Starting job application flow using Stagehand');
      
      // First, perform the job search
      const searchQuery = config.searchPrompt || `${config.jobTitle} in ${config.location}`;
      console.log('Performing job search for:', searchQuery);
      
      // Search for jobs
      await stagehand.page.act(`Click on the job search bar and type "${searchQuery}"`);
      await stagehand.page.waitForTimeout(1000);
      
      // Press Enter to search
      await stagehand.page.act('Press Enter to search for jobs');
      await stagehand.page.waitForTimeout(3000); // Wait for results to load
      
      // Apply filters if specified
      if (config.easyApplyOnly) {
        await stagehand.page.act('Click on the Easy Apply filter button');
        await stagehand.page.waitForTimeout(2000);
      }
      
      // Start applying to jobs
      const maxApplications = config.maxApplications || 50;
      let applicationsCompleted = 0;
      const appliedJobs: Array<{company: string, jobTitle: string}> = [];
      
      console.log(`Starting to apply to ${maxApplications} jobs`);
      
      // Main application loop
      while (applicationsCompleted < maxApplications) {
        try {
          // Click on a job listing
          await stagehand.page.act(`Click on job listing number ${applicationsCompleted + 1} in the results`);
          await stagehand.page.waitForTimeout(2000);
          
          // Extract job details
          const jobDetails = await stagehand.page.extract({
            instruction: "Extract the company name and job title from the job posting",
            schema: z.object({
              company: z.string(),
              jobTitle: z.string(),
              hasEasyApply: z.boolean()
            })
          });
          
          console.log(`Checking job: ${jobDetails.company} - ${jobDetails.jobTitle}`);
          
          // Check if it has Easy Apply
          if (config.easyApplyOnly && !jobDetails.hasEasyApply) {
            console.log('Skipping - no Easy Apply button');
            continue;
          }
          
          // Click Easy Apply button
          await stagehand.page.act('Click the Easy Apply button');
          await stagehand.page.waitForTimeout(2000);
          
          // Check if we're still on the right page
          const currentUrl = await stagehand.page.url();
          console.log('Current URL after Easy Apply click:', currentUrl);
          
          // Fill out the application form
          await this.fillApplicationForm(stagehand, config);
          
          // Submit the application
          console.log('Looking for submit button...');
          await stagehand.page.act('Scroll down to find and click the Submit Application or Submit button');
          await stagehand.page.waitForTimeout(3000);
          
          // Record successful application
          applicationsCompleted++;
          appliedJobs.push({
            company: jobDetails.company,
            jobTitle: jobDetails.jobTitle
          });
          
          console.log(`APPLIED TO: ${jobDetails.company} - ${jobDetails.jobTitle} (${applicationsCompleted}/${maxApplications})`);
          
          // Go back to job listings
          await stagehand.page.act('Click the X or Close button to return to job listings');
          await stagehand.page.waitForTimeout(2000);
          
        } catch (error) {
          console.error('Error applying to job:', error);
          
          // Check if the error is due to browser being closed
          if (error.message?.includes('Target page, context or browser has been closed')) {
            console.error('Browser session was closed. Stopping job applications.');
            break;
          }
          
          // Try to recover by going back to listings
          try {
            await stagehand.page.act('Close any open modals or click X button to return to job listings');
            await stagehand.page.waitForTimeout(2000);
          } catch (recoveryError) {
            console.error('Failed to recover, continuing to next job');
          }
        }
        
        // Check if we need to load more jobs
        if (applicationsCompleted < maxApplications && applicationsCompleted % 10 === 0) {
          await stagehand.page.act('Scroll to the bottom of the page');
          await stagehand.page.act('Click "See more jobs" button if visible');
          await stagehand.page.waitForTimeout(3000);
        }
      }
      
      // Log completion
      console.log(`Completed ${applicationsCompleted} applications out of ${maxApplications} target`);
      console.log('Applied to the following positions:');
      appliedJobs.forEach((job, index) => {
        console.log(`${index + 1}. ${job.company} - ${job.jobTitle}`);
      });
      
      // Give some time for the page to settle after applications
      await stagehand.page.waitForTimeout(3000);
      
      // Save applied jobs to database
      console.log('Saving applied jobs data to database');
      
      // Save to database
      for (const job of appliedJobs) {
        try {
          await this.linkedinSessionService.recordJobApplication(
            session.id,
            session.user_id,
            {
              job_url: `https://www.linkedin.com/jobs/view/${Date.now()}`, // Generate a placeholder URL
              job_id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              company_name: job.company,
              job_title: job.jobTitle,
              location: config.location || 'Not specified',
              application_type: 'easy_apply',
              success: true
            }
          );
        } catch (error) {
          console.error('Failed to save job application:', error);
        }
      }
      
      // Update progress
      const progress = {
        totalJobs: applicationsCompleted,
        processedJobs: applicationsCompleted,
        appliedJobs: appliedJobs.length,
        skippedJobs: 0,
        failedJobs: 0,
        currentPage: 1
      };
      
      this.sessionProgress.set(session.browserbase_session_id, progress);
      
      this.emit(AutomationEventType.PROGRESS_UPDATED, {
        sessionId: session.browserbase_session_id,
        progress
      });
      
      // Mark session as completed
      await this.linkedinSessionService.updateSessionStatus(
        session.id,
        'completed',
        new Date()
      );
      
      this.emit(AutomationEventType.SESSION_COMPLETED, {
        sessionId: session.browserbase_session_id,
        progress
      });
      
    } catch (error) {
      console.error('Job application flow error:', error);
      throw error;
    }
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
        
        // Execute the job application flow
        await this.executeJobApplicationFlow(stagehand, session, session.config || {});
      } else {
        throw new Error('Still on login page. Please complete login first.');
      }
    } catch (error) {
      console.error('Error continuing after login:', error);
      throw error;
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