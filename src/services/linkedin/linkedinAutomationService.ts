import { Stagehand } from '@browserbase/stagehand';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { 
  AutomationSession, 
  JobSearchConfig, 
  InterventionType,
  SessionStatus,
  JobApplication,
  AutomationEventType
} from '../../types/automation.types';
import { BrowserbaseSessionManager } from '../browserbase/sessionManager';
import { SupabaseAutomationService } from '../supabase/automationService';
import { InterventionDetectionService } from '../stagehand/interventionDetectionService';

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
  private interventionDetector: InterventionDetectionService;
  private activeStagehand: Map<string, Stagehand> = new Map();

  constructor(
    browserbaseManager: BrowserbaseSessionManager,
    supabaseService: SupabaseAutomationService,
    config?: LinkedInAutomationConfig
  ) {
    super();
    this.browserbaseManager = browserbaseManager;
    this.supabaseService = supabaseService;
    this.interventionDetector = new InterventionDetectionService({
      confidenceThreshold: 0.7,
      verboseLogging: config?.verboseLogging
    });
    
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
      // Create or get existing session
      const session = await this.browserbaseManager.getOrCreateSession(userId, config);
      
      // Initialize Stagehand
      const stagehand = new Stagehand({
        env: 'BROWSERBASE',
        apiKey: process.env.BROWSERBASE_API_KEY,
        browserbaseSessionID: session.browserbase_session_id,
        verbose: this.config.verboseLogging
      });

      await stagehand.init();
      this.activeStagehand.set(session.id, stagehand);

      // Get debug URL
      const debugUrl = await this.browserbaseManager.getDebugUrl(session.browserbase_session_id);

      // Log session start
      await this.supabaseService.logActivity(
        session.id,
        'session_started',
        { config, debugUrl },
        'Job search automation started'
      );

      // Emit event
      this.emit(AutomationEventType.SESSION_STARTED, {
        sessionId: session.id,
        userId,
        debugUrl
      });

      // Start the automation in background
      this.executeJobSearch(session, config).catch(error => {
        console.error('Job search automation error:', error);
        this.handleAutomationError(session.id, error);
      });

      return { sessionId: session.id, debugUrl };
    } catch (error) {
      console.error('Error starting job search:', error);
      throw error;
    }
  }

  /**
   * Pause an active automation session
   */
  async pauseSession(sessionId: string): Promise<AutomationSession> {
    try {
      // Update session status
      const session = await this.browserbaseManager.pauseSession(sessionId);

      // Log activity
      await this.supabaseService.logActivity(
        sessionId,
        'session_paused',
        {},
        'Session paused by user'
      );

      // Emit event
      this.emit(AutomationEventType.SESSION_PAUSED, { sessionId });

      return session;
    } catch (error) {
      console.error('Error pausing session:', error);
      throw error;
    }
  }

  /**
   * Resume a paused automation session
   */
  async resumeSession(sessionId: string): Promise<{ debugUrl: string }> {
    try {
      // Get session details
      const session = await this.browserbaseManager.resumeSession(sessionId);

      // Re-initialize Stagehand if needed
      if (!this.activeStagehand.has(sessionId)) {
        const stagehand = new Stagehand({
          env: 'BROWSERBASE',
          apiKey: process.env.BROWSERBASE_API_KEY,
          browserbaseSessionID: session.browserbase_session_id,
          verbose: this.config.verboseLogging
        });

        await stagehand.init();
        this.activeStagehand.set(sessionId, stagehand);
      }

      // Get debug URL
      const debugUrl = await this.browserbaseManager.getDebugUrl(session.browserbase_session_id);

      // Log activity
      await this.supabaseService.logActivity(
        sessionId,
        'session_resumed',
        { debugUrl },
        'Session resumed by user'
      );

      // Emit event
      this.emit(AutomationEventType.SESSION_RESUMED, { sessionId });

      // Resume automation
      const config = session.job_search_config as JobSearchConfig;
      this.executeJobSearch(session, config).catch(error => {
        console.error('Resume automation error:', error);
        this.handleAutomationError(sessionId, error);
      });

      return { debugUrl };
    } catch (error) {
      console.error('Error resuming session:', error);
      throw error;
    }
  }

  /**
   * Stop and terminate an automation session
   */
  async stopSession(sessionId: string, reason?: string): Promise<void> {
    try {
      // Clean up Stagehand
      const stagehand = this.activeStagehand.get(sessionId);
      if (stagehand) {
        await stagehand.close();
        this.activeStagehand.delete(sessionId);
      }

      // Terminate session
      await this.browserbaseManager.terminateSession(sessionId, reason);

      // Log activity
      await this.supabaseService.logActivity(
        sessionId,
        'session_stopped',
        { reason },
        reason || 'Session stopped by user'
      );

      // Emit event
      this.emit(AutomationEventType.SESSION_STOPPED, { sessionId, reason });
    } catch (error) {
      console.error('Error stopping session:', error);
      throw error;
    }
  }

  /**
   * Get current automation progress
   */
  async getProgress(sessionId: string): Promise<AutomationProgress> {
    try {
      // Get applications count
      const applications = await this.supabaseService.getSessionApplications(sessionId);
      
      // Get latest progress from logs
      const logs = await this.supabaseService.getSessionLogs(sessionId, 1);
      const latestLog = logs[0];
      
      const progress: AutomationProgress = {
        totalJobs: 0,
        processedJobs: applications.length,
        appliedJobs: applications.filter(app => app.status === 'applied').length,
        skippedJobs: applications.filter(app => app.status === 'skipped').length,
        failedJobs: applications.filter(app => app.status === 'failed').length,
        currentPage: 1,
        lastProcessedJobId: applications[applications.length - 1]?.job_id
      };

      // Extract progress from latest log if available
      if (latestLog?.details && typeof latestLog.details === 'object') {
        const details = latestLog.details as any;
        if (details.progress) {
          Object.assign(progress, details.progress);
        }
      }

      return progress;
    } catch (error) {
      console.error('Error getting progress:', error);
      throw error;
    }
  }

  /**
   * Execute the job search automation
   */
  private async executeJobSearch(
    session: AutomationSession,
    config: JobSearchConfig
  ): Promise<void> {
    const stagehand = this.activeStagehand.get(session.id);
    if (!stagehand) {
      throw new Error('Stagehand not initialized');
    }

    const progress: AutomationProgress = {
      totalJobs: 0,
      processedJobs: 0,
      appliedJobs: 0,
      skippedJobs: 0,
      failedJobs: 0,
      currentPage: 1
    };

    try {
      // Navigate to LinkedIn Jobs
      await this.navigateToLinkedIn(stagehand, session.id);

      // Perform job search
      await this.performJobSearch(stagehand, session.id, config);

      // Process job listings
      let hasMoreJobs = true;
      while (hasMoreJobs && session.status === SessionStatus.RUNNING) {
        // Get current session status
        const currentSession = await this.supabaseService.getSession(session.id);
        if (currentSession?.status !== SessionStatus.RUNNING) {
          console.log('Session no longer running, stopping automation');
          break;
        }

        // Process jobs on current page
        const jobsProcessed = await this.processJobListings(
          stagehand,
          session.id,
          config,
          progress
        );

        if (jobsProcessed === 0) {
          hasMoreJobs = false;
        } else {
          // Check if we should continue to next page
          if (config.maxApplications && progress.appliedJobs >= config.maxApplications) {
            console.log('Reached max applications limit');
            break;
          }

          // Navigate to next page
          hasMoreJobs = await this.navigateToNextPage(stagehand, session.id);
          if (hasMoreJobs) {
            progress.currentPage++;
          }
        }

        // Save progress periodically
        if (progress.processedJobs % this.config.saveProgressInterval === 0) {
          await this.saveProgress(session.id, progress);
        }
      }

      // Final save and complete session
      await this.saveProgress(session.id, progress);
      await this.browserbaseManager.completeSession(session.id);

      // Log completion
      await this.supabaseService.logActivity(
        session.id,
        'session_completed',
        { progress },
        `Automation completed. Applied to ${progress.appliedJobs} jobs.`
      );

      // Emit completion event
      this.emit(AutomationEventType.SESSION_COMPLETED, {
        sessionId: session.id,
        progress
      });

    } catch (error) {
      console.error('Job search automation error:', error);
      await this.handleAutomationError(session.id, error);
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
    await this.logStep(sessionId, 'navigate_start', {}, 'Navigating to LinkedIn Jobs');

    try {
      await stagehand.page.goto('https://www.linkedin.com/jobs/', {
        waitUntil: 'networkidle'
      });

      // Check for interventions
      if (this.config.checkInterventionAfterActions) {
        await this.checkForIntervention(stagehand, sessionId);
      }

      await this.logStep(sessionId, 'navigate_complete', {}, 'Successfully navigated to LinkedIn Jobs');
    } catch (error) {
      await this.logStep(sessionId, 'navigate_failed', { error: error.message }, 'Failed to navigate to LinkedIn');
      throw error;
    }
  }

  /**
   * Perform job search with given criteria
   */
  private async performJobSearch(
    stagehand: Stagehand,
    sessionId: string,
    config: JobSearchConfig
  ): Promise<void> {
    await this.logStep(sessionId, 'search_start', { config }, 'Starting job search');

    try {
      // Enter job title
      if (config.jobTitle) {
        await this.retryAction(async () => {
          await stagehand.act({
            action: `Type "${config.jobTitle}" in the job title search box`
          });
        });
      }

      // Enter location
      if (config.location) {
        await this.retryAction(async () => {
          await stagehand.act({
            action: `Type "${config.location}" in the location search box`
          });
        });
      }

      // Click search button
      await this.retryAction(async () => {
        await stagehand.act({
          action: 'Click the search button to search for jobs'
        });
      });

      // Wait for results to load
      await stagehand.page.waitForTimeout(3000);

      // Apply filters
      await this.applySearchFilters(stagehand, sessionId, config);

      // Check for interventions
      if (this.config.checkInterventionAfterActions) {
        await this.checkForIntervention(stagehand, sessionId);
      }

      await this.logStep(sessionId, 'search_complete', {}, 'Job search completed');
    } catch (error) {
      await this.logStep(sessionId, 'search_failed', { error: error.message }, 'Job search failed');
      throw error;
    }
  }

  /**
   * Apply search filters based on config
   */
  private async applySearchFilters(
    stagehand: Stagehand,
    sessionId: string,
    config: JobSearchConfig
  ): Promise<void> {
    await this.logStep(sessionId, 'filters_start', { config }, 'Applying search filters');

    try {
      // Date posted filter
      if (config.datePosted) {
        await this.retryAction(async () => {
          await stagehand.act({
            action: `Click on the date posted filter and select "${config.datePosted}"`
          });
        });
      }

      // Experience level filter
      if (config.experienceLevel && config.experienceLevel.length > 0) {
        await this.retryAction(async () => {
          await stagehand.act({
            action: `Click on experience level filter and select ${config.experienceLevel.join(', ')}`
          });
        });
      }

      // Job type filter
      if (config.jobType && config.jobType.length > 0) {
        await this.retryAction(async () => {
          await stagehand.act({
            action: `Click on job type filter and select ${config.jobType.join(', ')}`
          });
        });
      }

      // Remote filter
      if (config.remote) {
        await this.retryAction(async () => {
          await stagehand.act({
            action: 'Click on remote job filter to show only remote positions'
          });
        });
      }

      // Easy Apply filter
      if (config.easyApplyOnly) {
        await this.retryAction(async () => {
          await stagehand.act({
            action: 'Click on Easy Apply filter to show only Easy Apply jobs'
          });
        });
      }

      await this.logStep(sessionId, 'filters_complete', {}, 'Search filters applied');
    } catch (error) {
      await this.logStep(sessionId, 'filters_failed', { error: error.message }, 'Failed to apply filters');
      throw error;
    }
  }

  /**
   * Process job listings on current page
   */
  private async processJobListings(
    stagehand: Stagehand,
    sessionId: string,
    config: JobSearchConfig,
    progress: AutomationProgress
  ): Promise<number> {
    await this.logStep(sessionId, 'process_listings_start', { page: progress.currentPage }, 'Processing job listings');

    try {
      // Extract job listings
      const jobs = await this.extractJobListings(stagehand);
      
      if (jobs.length === 0) {
        await this.logStep(sessionId, 'no_jobs_found', {}, 'No job listings found');
        return 0;
      }

      progress.totalJobs += jobs.length;
      await this.logStep(sessionId, 'jobs_found', { count: jobs.length }, `Found ${jobs.length} job listings`);

      // Process each job
      for (const job of jobs) {
        // Check session status
        const currentSession = await this.supabaseService.getSession(sessionId);
        if (currentSession?.status !== SessionStatus.RUNNING) {
          break;
        }

        // Check max applications limit
        if (config.maxApplications && progress.appliedJobs >= config.maxApplications) {
          break;
        }

        try {
          const applied = await this.processJob(stagehand, sessionId, job, config);
          progress.processedJobs++;

          if (applied) {
            progress.appliedJobs++;
          } else {
            progress.skippedJobs++;
          }

          // Save progress periodically
          if (progress.processedJobs % this.config.saveProgressInterval === 0) {
            await this.saveProgress(sessionId, progress);
          }

          // Emit progress event
          this.emit(AutomationEventType.PROGRESS_UPDATED, {
            sessionId,
            progress
          });

        } catch (error) {
          console.error(`Error processing job ${job.id}:`, error);
          progress.failedJobs++;
          await this.logStep(sessionId, 'job_process_failed', { 
            jobId: job.id, 
            error: error.message 
          }, `Failed to process job: ${job.title}`);
        }

        // Add delay between applications
        await stagehand.page.waitForTimeout(2000 + Math.random() * 3000);
      }

      await this.logStep(sessionId, 'process_listings_complete', { 
        processed: jobs.length,
        applied: progress.appliedJobs,
        skipped: progress.skippedJobs
      }, 'Finished processing job listings');

      return jobs.length;
    } catch (error) {
      await this.logStep(sessionId, 'process_listings_failed', { error: error.message }, 'Failed to process job listings');
      throw error;
    }
  }

  /**
   * Extract job listings from current page
   */
  private async extractJobListings(stagehand: Stagehand): Promise<Array<{
    id: string;
    title: string;
    company: string;
    location: string;
    isEasyApply: boolean;
  }>> {
    try {
      const jobData = await stagehand.extract({
        instruction: 'Extract all job listings on the page with their title, company, location, and whether they have Easy Apply',
        schema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              company: { type: 'string' },
              location: { type: 'string' },
              isEasyApply: { type: 'boolean' }
            },
            required: ['id', 'title', 'company']
          }
        }
      });

      return jobData || [];
    } catch (error) {
      console.error('Error extracting job listings:', error);
      return [];
    }
  }

  /**
   * Process individual job
   */
  private async processJob(
    stagehand: Stagehand,
    sessionId: string,
    job: any,
    config: JobSearchConfig
  ): Promise<boolean> {
    const jobId = uuidv4();
    
    await this.logStep(sessionId, 'job_process_start', { job }, `Processing job: ${job.title} at ${job.company}`);

    try {
      // Check if already applied
      const existingApplication = await this.supabaseService.checkDuplicateApplication(
        sessionId,
        job.title,
        job.company
      );

      if (existingApplication) {
        await this.logStep(sessionId, 'job_already_applied', { job }, 'Already applied to this job');
        return false;
      }

      // Check if Easy Apply only
      if (config.easyApplyOnly && !job.isEasyApply) {
        await this.logStep(sessionId, 'job_not_easy_apply', { job }, 'Skipping - not Easy Apply');
        await this.supabaseService.saveJobApplication(sessionId, {
          id: jobId,
          job_id: job.id,
          job_title: job.title,
          company_name: job.company,
          location: job.location,
          status: 'skipped',
          skip_reason: 'Not Easy Apply'
        });
        return false;
      }

      // Click on job listing
      await this.retryAction(async () => {
        await stagehand.act({
          action: `Click on the job listing for "${job.title}" at ${job.company}`
        });
      });

      // Wait for job details to load
      await stagehand.page.waitForTimeout(2000);

      // Extract job details
      const jobDetails = await this.extractJobDetails(stagehand);

      // Check job requirements if needed
      if (config.keywords && config.keywords.length > 0) {
        const hasKeywords = config.keywords.some(keyword => 
          jobDetails.description?.toLowerCase().includes(keyword.toLowerCase())
        );

        if (!hasKeywords) {
          await this.logStep(sessionId, 'job_no_keywords', { job }, 'Skipping - keywords not found');
          await this.supabaseService.saveJobApplication(sessionId, {
            id: jobId,
            job_id: job.id,
            job_title: job.title,
            company_name: job.company,
            location: job.location,
            status: 'skipped',
            skip_reason: 'Keywords not matched'
          });
          return false;
        }
      }

      // Apply to job
      const applied = await this.applyToJob(stagehand, sessionId, job, jobDetails);

      if (applied) {
        await this.supabaseService.saveJobApplication(sessionId, {
          id: jobId,
          job_id: job.id,
          job_title: job.title,
          company_name: job.company,
          location: job.location,
          job_description: jobDetails.description,
          status: 'applied',
          applied_at: new Date().toISOString()
        });

        await this.logStep(sessionId, 'job_applied', { job }, `Successfully applied to ${job.title}`);
        return true;
      } else {
        await this.supabaseService.saveJobApplication(sessionId, {
          id: jobId,
          job_id: job.id,
          job_title: job.title,
          company_name: job.company,
          location: job.location,
          status: 'failed',
          error_message: 'Failed to apply'
        });
        return false;
      }

    } catch (error) {
      console.error(`Error processing job ${job.title}:`, error);
      await this.supabaseService.saveJobApplication(sessionId, {
        id: jobId,
        job_id: job.id,
        job_title: job.title,
        company_name: job.company,
        location: job.location,
        status: 'failed',
        error_message: error.message
      });
      throw error;
    }
  }

  /**
   * Extract job details
   */
  private async extractJobDetails(stagehand: Stagehand): Promise<{
    description?: string;
    requirements?: string[];
    benefits?: string[];
  }> {
    try {
      const details = await stagehand.extract({
        instruction: 'Extract the job description, requirements, and benefits from the job details panel',
        schema: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            requirements: {
              type: 'array',
              items: { type: 'string' }
            },
            benefits: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      });

      return details || {};
    } catch (error) {
      console.error('Error extracting job details:', error);
      return {};
    }
  }

  /**
   * Apply to a job
   */
  private async applyToJob(
    stagehand: Stagehand,
    sessionId: string,
    job: any,
    jobDetails: any
  ): Promise<boolean> {
    try {
      // Check if Easy Apply button exists
      const hasEasyApply = await stagehand.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(btn => btn.textContent?.toLowerCase().includes('easy apply'));
      });

      if (!hasEasyApply) {
        await this.logStep(sessionId, 'no_easy_apply_button', { job }, 'No Easy Apply button found');
        return false;
      }

      // Click Easy Apply button
      await this.retryAction(async () => {
        await stagehand.act({
          action: 'Click the Easy Apply button'
        });
      });

      // Wait for modal to open
      await stagehand.page.waitForTimeout(2000);

      // Check for interventions (login, captcha, etc)
      if (this.config.checkInterventionAfterActions) {
        await this.checkForIntervention(stagehand, sessionId);
      }

      // Handle application form
      const completed = await this.handleApplicationForm(stagehand, sessionId);

      return completed;
    } catch (error) {
      console.error('Error applying to job:', error);
      return false;
    }
  }

  /**
   * Handle the application form flow
   */
  private async handleApplicationForm(
    stagehand: Stagehand,
    sessionId: string
  ): Promise<boolean> {
    let step = 1;
    const maxSteps = 10; // Safety limit

    while (step <= maxSteps) {
      await this.logStep(sessionId, 'application_step', { step }, `Application form step ${step}`);

      try {
        // Check what's on the current form
        const formElements = await stagehand.observe({
          instruction: 'Find all form fields, buttons, and questions in the application modal',
          returnAction: true
        });

        // Check if application is complete
        const isComplete = await stagehand.page.evaluate(() => {
          const text = document.body.textContent || '';
          return text.toLowerCase().includes('application sent') || 
                 text.toLowerCase().includes('application submitted');
        });

        if (isComplete) {
          await this.logStep(sessionId, 'application_complete', {}, 'Application submitted successfully');
          return true;
        }

        // Fill any required fields
        const filledSomething = await this.fillApplicationFields(stagehand, formElements);

        // Look for continue/submit button
        const hasNextButton = formElements.some(el => 
          el.description.toLowerCase().includes('continue') ||
          el.description.toLowerCase().includes('next') ||
          el.description.toLowerCase().includes('submit') ||
          el.description.toLowerCase().includes('review')
        );

        if (hasNextButton) {
          await this.retryAction(async () => {
            await stagehand.act({
              action: 'Click the continue, next, or submit button to proceed'
            });
          });

          await stagehand.page.waitForTimeout(2000);
          step++;
        } else {
          // No next button found, might be stuck
          await this.logStep(sessionId, 'application_no_next', { step }, 'No next button found');
          break;
        }

        // Check for interventions
        if (this.config.checkInterventionAfterActions) {
          const intervention = await this.checkForIntervention(stagehand, sessionId);
          if (intervention) {
            return false;
          }
        }

      } catch (error) {
        console.error(`Error on application step ${step}:`, error);
        await this.logStep(sessionId, 'application_step_error', { 
          step, 
          error: error.message 
        }, `Error on step ${step}`);
        return false;
      }
    }

    return false;
  }

  /**
   * Fill application form fields
   */
  private async fillApplicationFields(
    stagehand: Stagehand,
    formElements: any[]
  ): Promise<boolean> {
    let filledAny = false;

    for (const element of formElements) {
      const desc = element.description.toLowerCase();

      // Skip if not a fillable field
      if (element.method !== 'fill') continue;

      try {
        // Phone number
        if (desc.includes('phone') && !desc.includes('optional')) {
          await stagehand.act({
            action: `Fill in phone number field with a placeholder like "555-0123"`
          });
          filledAny = true;
        }

        // Years of experience
        if (desc.includes('years') && desc.includes('experience')) {
          await stagehand.act({
            action: `Fill in years of experience with "5"`
          });
          filledAny = true;
        }

        // Salary expectations
        if (desc.includes('salary') || desc.includes('compensation')) {
          await stagehand.act({
            action: `Fill in salary expectation with "Negotiable"`
          });
          filledAny = true;
        }

        // Start date
        if (desc.includes('start date') || desc.includes('available')) {
          await stagehand.act({
            action: `Fill in start date with "2 weeks"`
          });
          filledAny = true;
        }

      } catch (error) {
        console.error('Error filling field:', error);
      }
    }

    return filledAny;
  }

  /**
   * Navigate to next page of results
   */
  private async navigateToNextPage(
    stagehand: Stagehand,
    sessionId: string
  ): Promise<boolean> {
    try {
      await this.logStep(sessionId, 'next_page_start', {}, 'Navigating to next page');

      // Check if next button exists and is enabled
      const hasNextPage = await stagehand.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const nextButton = buttons.find(btn => 
          btn.getAttribute('aria-label')?.toLowerCase().includes('next') ||
          btn.textContent?.toLowerCase() === 'next'
        );
        return nextButton && !nextButton.disabled;
      });

      if (!hasNextPage) {
        await this.logStep(sessionId, 'no_next_page', {}, 'No more pages available');
        return false;
      }

      // Click next button
      await this.retryAction(async () => {
        await stagehand.act({
          action: 'Click the Next button to go to the next page of job listings'
        });
      });

      // Wait for page to load
      await stagehand.page.waitForTimeout(3000);

      await this.logStep(sessionId, 'next_page_complete', {}, 'Navigated to next page');
      return true;
    } catch (error) {
      console.error('Error navigating to next page:', error);
      await this.logStep(sessionId, 'next_page_failed', { error: error.message }, 'Failed to navigate to next page');
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
    const intervention = await this.interventionDetector.detectIntervention(stagehand);

    if (intervention) {
      console.log('Intervention detected:', intervention);

      // Get debug URL
      const debugUrl = await this.browserbaseManager.getDebugUrl(
        stagehand.browserbaseSessionId || ''
      );

      // Log intervention
      await this.supabaseService.logIntervention(
        sessionId,
        intervention.type,
        debugUrl,
        intervention.pageContext,
        intervention.message
      );

      // Update session status
      await this.browserbaseManager.pauseSession(sessionId);

      // Emit intervention event
      this.emit(AutomationEventType.INTERVENTION_REQUIRED, {
        sessionId,
        intervention,
        debugUrl
      });

      return true;
    }

    return false;
  }

  /**
   * Save automation progress
   */
  private async saveProgress(
    sessionId: string,
    progress: AutomationProgress
  ): Promise<void> {
    await this.supabaseService.logActivity(
      sessionId,
      'progress_saved',
      { progress },
      `Progress: ${progress.appliedJobs}/${progress.processedJobs} jobs applied`
    );

    // Emit progress event
    this.emit(AutomationEventType.PROGRESS_UPDATED, {
      sessionId,
      progress
    });
  }

  /**
   * Log automation step
   */
  private async logStep(
    sessionId: string,
    action: string,
    details: any,
    message: string
  ): Promise<void> {
    if (this.config.verboseLogging) {
      console.log(`[${sessionId}] ${action}: ${message}`);
    }

    await this.supabaseService.logActivity(sessionId, action, details, message);
  }

  /**
   * Retry an action with exponential backoff
   */
  private async retryAction<T>(
    action: () => Promise<T>,
    retries = this.config.maxRetries || 3
  ): Promise<T> {
    let lastError: any;

    for (let i = 0; i < retries; i++) {
      try {
        return await action();
      } catch (error) {
        lastError = error;
        console.error(`Action failed (attempt ${i + 1}/${retries}):`, error);

        if (i < retries - 1) {
          const delay = this.config.retryDelay || 2000;
          await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
      }
    }

    throw lastError;
  }

  /**
   * Handle automation errors
   */
  private async handleAutomationError(sessionId: string, error: any): Promise<void> {
    console.error('Automation error:', error);

    // Log error
    await this.supabaseService.logActivity(
      sessionId,
      'automation_error',
      { 
        error: error.message,
        stack: error.stack 
      },
      'Automation encountered an error'
    );

    // Update session status
    await this.browserbaseManager.failSession(sessionId, error.message);

    // Clean up Stagehand
    const stagehand = this.activeStagehand.get(sessionId);
    if (stagehand) {
      try {
        await stagehand.close();
      } catch (closeError) {
        console.error('Error closing Stagehand:', closeError);
      }
      this.activeStagehand.delete(sessionId);
    }

    // Emit error event
    this.emit(AutomationEventType.ERROR, {
      sessionId,
      error: error.message
    });
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Close all active Stagehand instances
    for (const [sessionId, stagehand] of this.activeStagehand) {
      try {
        await stagehand.close();
      } catch (error) {
        console.error(`Error closing Stagehand for session ${sessionId}:`, error);
      }
    }
    this.activeStagehand.clear();
  }
}