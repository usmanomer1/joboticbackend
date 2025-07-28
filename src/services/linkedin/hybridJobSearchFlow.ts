import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import { EventEmitter } from 'events';
import { 
  JobSearchConfig, 
  AutomationEventType
} from '../../types/automation.types';
import type { LinkedInSession } from '../supabase/linkedinSessionService';
import { JobApplicationAgent } from './jobApplicationAgent';
import { JobDataCache } from './jobDataCache';
import { AutomationMetrics } from './automationMetrics';
import { LinkedInSessionService } from '../supabase/linkedinSessionService';
import { ObserveCache, ObserveResult } from './observeCache';

interface JobListing {
  jobId: string;
  company: string;
  jobTitle: string;
  location: string;
  jobUrl: string;
  isEasyApply: boolean;
  alreadyApplied?: boolean;
}

/**
 * Hybrid job search flow using act() for navigation and agent() for complex tasks
 */
export class HybridJobSearchFlow extends EventEmitter {
  private stagehand: Stagehand;
  private session: LinkedInSession;
  private config: JobSearchConfig;
  private cache: JobDataCache;
  private metrics: AutomationMetrics;
  private linkedinSessionService: LinkedInSessionService;
  private applicationAgent: JobApplicationAgent;
  private observeCache: ObserveCache;

  constructor(
    stagehand: Stagehand,
    session: LinkedInSession,
    config: JobSearchConfig,
    cache: JobDataCache,
    metrics: AutomationMetrics,
    linkedinSessionService: LinkedInSessionService
  ) {
    super();
    this.stagehand = stagehand;
    this.session = session;
    this.config = config;
    this.cache = cache;
    this.metrics = metrics;
    this.linkedinSessionService = linkedinSessionService;
    this.observeCache = new ObserveCache();

    // Create application agent
    this.applicationAgent = new JobApplicationAgent(stagehand, session.browserbase_session_id, {
      jobTitle: config.jobTitle || '',
      company: '',
      jobUrl: '',
      isEasyApply: true,
      applicationData: {
        resumeText: config.resumeMetadata?.extractedText,
        userEmail: config.externalApplicationConfig?.defaultEmail,
        userPhone: undefined // Could be added to config
      }
    });

    // Forward agent events
    this.applicationAgent.on(AutomationEventType.AGENT_STEP, (data) => this.emit(AutomationEventType.AGENT_STEP, data));
    this.applicationAgent.on(AutomationEventType.AGENT_STEP_REALTIME, (data) => this.emit(AutomationEventType.AGENT_STEP_REALTIME, data));
    this.applicationAgent.on(AutomationEventType.ACTION_PERFORMED, (data) => this.emit(AutomationEventType.ACTION_PERFORMED, data));
    this.applicationAgent.on(AutomationEventType.AGENT_COMPLETE, (data) => this.emit(AutomationEventType.AGENT_COMPLETE, data));
  }

  /**
   * Perform action using observe/act pattern with caching
   * Falls back to regular act() if observe fails
   */
  private async performCachedAction(instruction: string): Promise<void> {
    try {
      // Check cache first
      let observeResult = this.observeCache.get(instruction);
      
      if (!observeResult) {
        // No cache hit, perform observe
        console.log(`Observing action: ${instruction}`);
        const observeResults = await this.stagehand.page.observe({
          instruction,
          returnAction: true
        });
        
        if (observeResults && observeResults.length > 0) {
          observeResult = observeResults[0];
          // Cache the result for future use
          this.observeCache.set(instruction, observeResult);
          console.log(`Cached observe result for: ${instruction}`);
        }
      } else {
        console.log(`Using cached observe result for: ${instruction}`);
      }
      
      // Use observe result if available, otherwise fall back to regular act
      if (observeResult) {
        await this.stagehand.page.act(observeResult);
      } else {
        console.log(`Falling back to regular act for: ${instruction}`);
        await this.stagehand.page.act(instruction);
      }
      
    } catch (error) {
      console.error(`Error in performCachedAction: ${error.message}, falling back to regular act`);
      // Fall back to regular act on any error
      await this.stagehand.page.act(instruction);
    }
  }

  /**
   * Execute the hybrid job search flow
   */
  async execute(): Promise<void> {
    try {
      console.log('Starting hybrid job search flow');
      
      // Navigate to jobs page using act()
      await this.navigateToJobs();
      
      // Perform search using act()
      await this.performSearch();
      
      // Apply filters using act()
      await this.applyFilters();
      
      // Process job listings
      let page = 1;
      let hasMorePages = true;
      let totalApplications = 0;
      const maxApplications = this.config.maxApplications || 50;

      while (hasMorePages && totalApplications < maxApplications) {
        console.log(`Processing page ${page}`);
        
        // Extract job listings
        const jobs = await this.extractJobListings();
        
        if (jobs.length === 0) {
          console.log('No more jobs found');
          break;
        }

        // Process each job
        for (const job of jobs) {
          if (totalApplications >= maxApplications) {
            console.log('Reached maximum applications limit');
            break;
          }

          // Check cache first
          const cachedJob = this.cache.getJob(job.jobId);
          if (cachedJob && cachedJob.applicationUrl) {
            console.log(`Skipping already applied job: ${job.company} - ${job.jobTitle}`);
            this.emit(AutomationEventType.JOB_SKIPPED, {
              sessionId: this.session.browserbase_session_id,
              reason: 'already_applied',
              job
            });
            continue;
          }

          // Process this job
          const applied = await this.processJob(job);
          if (applied) {
            totalApplications++;
          }
        }

        // Navigate to next page
        hasMorePages = await this.navigateToNextPage();
        page++;
      }

      console.log(`Completed job search. Total applications: ${totalApplications}`);
      
      // Final metrics update
      this.emit(AutomationEventType.SESSION_COMPLETED, {
        sessionId: this.session.browserbase_session_id,
        totalApplications,
        metrics: this.metrics.getSnapshot()
      });

    } catch (error) {
      console.error('Hybrid job search flow error:', error);
      throw error;
    }
  }

  /**
   * Navigate to LinkedIn jobs page using cached observe/act pattern
   */
  private async navigateToJobs(): Promise<void> {
    this.emit(AutomationEventType.ACTION_PERFORMED, {
      sessionId: this.session.browserbase_session_id,
      action: 'Navigating to LinkedIn Jobs',
      timestamp: new Date()
    });

    // Navigate directly to LinkedIn Jobs URL
    try {
      console.log('Navigating to LinkedIn Jobs URL...');
      await this.stagehand.page.goto('https://www.linkedin.com/jobs/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      console.log('Successfully navigated to LinkedIn Jobs');
      await this.stagehand.page.waitForTimeout(3000);
      
      // Check if we need to log in
      const currentUrl = await this.stagehand.page.url();
      console.log('Current URL after navigation:', currentUrl);
      
      // Check for login indicators on the page
      const loginRequired = await this.checkIfLoginRequired();
      
      if (loginRequired || currentUrl.includes('/login') || currentUrl.includes('authwall')) {
        console.log('Login required - emitting intervention event');
        
        // Emit intervention required event
        this.emit(AutomationEventType.INTERVENTION_REQUIRED, {
          sessionId: this.session.browserbase_session_id,
          intervention: {
            type: 'login',
            confidence: 1.0,
            message: 'LinkedIn login required',
            instructions: 'Please log in to your LinkedIn account to continue the automation.',
            url: currentUrl,
            liveViewUrl: this.session.live_view_url
          }
        });
        
        // Update session status
        await this.linkedinSessionService.updateSessionStatus(
          this.session.id,
          'intervention_required',
          null
        );
        
        // Throw error to stop the flow
        throw new Error('Intervention required: LinkedIn login needed');
      }
    } catch (error) {
      console.error('Failed to navigate to LinkedIn Jobs:', error);
      throw error;
    }
  }

  /**
   * Check if login is required by looking for login elements on the page
   */
  private async checkIfLoginRequired(): Promise<boolean> {
    try {
      // First check the URL - if we're on the jobs page, we're likely logged in
      const currentUrl = await this.stagehand.page.url();
      console.log('Checking login status on URL:', currentUrl);
      
      if (currentUrl.includes('/jobs/') || currentUrl.includes('/jobs?')) {
        console.log('Already on jobs page, assuming logged in');
        return false;
      }
      
      // Try a simpler extraction without text that might have Unicode issues
      try {
        const simpleCheck = await this.stagehand.page.extract({
          instruction: "Check if there is a Sign In button or login form visible on the page",
          schema: z.object({
            hasSignInButton: z.boolean(),
            hasLoginForm: z.boolean()
          }),
          useTextExtract: false // Don't extract text to avoid Unicode issues
        });
        
        console.log('Simple login check results:', simpleCheck);
        return simpleCheck.hasSignInButton || simpleCheck.hasLoginForm;
        
      } catch (extractError) {
        console.error('Extract failed, checking page title instead:', extractError);
        
        // Fallback: check page title using evaluate
        try {
          const pageTitle = await this.stagehand.page.evaluate(() => document.title);
          console.log('Page title:', pageTitle);
          
          const titleLower = pageTitle.toLowerCase();
          return titleLower.includes('sign in') || 
                 titleLower.includes('login') || 
                 titleLower.includes('join linkedin');
        } catch (evalError) {
          console.error('Page title check failed:', evalError);
          
          // Final fallback: check if URL suggests login page
          return currentUrl.includes('/login') || 
                 currentUrl.includes('authwall') || 
                 currentUrl.includes('/uas/');
        }
      }
    } catch (error) {
      console.error('Error in login check:', error);
      // If all checks fail, assume we're okay to proceed
      return false;
    }
  }

  /**
   * Perform job search using cached observe/act pattern
   */
  private async performSearch(): Promise<void> {
    // Use ONLY the searchPrompt or jobTitle + location
    // Do NOT add filters to the search text - LinkedIn can parse location and job type from natural language
    const searchQuery = this.config.searchPrompt || 
                       `${this.config.jobTitle} ${this.config.location}`.trim();

    this.emit(AutomationEventType.ACTION_PERFORMED, {
      sessionId: this.session.browserbase_session_id,
      action: `Searching for: ${searchQuery}`,
      timestamp: new Date()
    });

    try {
      // Check if there's a separate location input field
      const hasLocationField = await this.stagehand.page.extract({
        instruction: "Check if there's a separate location input field next to the job search field",
        schema: z.object({
          hasLocationField: z.boolean(),
          jobFieldSelector: z.string().optional(),
          locationFieldSelector: z.string().optional()
        })
      });

      if (hasLocationField.hasLocationField && this.config.searchPrompt) {
        // Extract job title and location from the search prompt
        const parts = searchQuery.split(/\b(?:in|at|near)\b/i);
        const jobTitle = parts[0]?.trim() || searchQuery;
        const location = parts[1]?.trim() || '';

        // Type in job field
        await this.performCachedAction('Click on the job search input field');
        await this.stagehand.page.waitForTimeout(500);
        await this.performCachedAction('Clear the search field');
        await this.stagehand.page.waitForTimeout(500);
        await this.stagehand.page.act(`Type "${jobTitle}" in the job search field`);
        await this.stagehand.page.waitForTimeout(500);

        // Type in location field if location was extracted
        if (location) {
          await this.performCachedAction('Click on the location input field');
          await this.stagehand.page.waitForTimeout(500);
          await this.performCachedAction('Clear the location field');
          await this.stagehand.page.waitForTimeout(500);
          await this.stagehand.page.act(`Type "${location}" in the location field`);
          await this.stagehand.page.waitForTimeout(500);
        }
      } else {
        // Single search field - type the full query
        await this.performCachedAction('Click on the job search input field');
        await this.stagehand.page.waitForTimeout(500);
        await this.performCachedAction('Clear the search field');
        await this.stagehand.page.waitForTimeout(500);
        await this.stagehand.page.act(`Type "${searchQuery}" in the search field`);
        await this.stagehand.page.waitForTimeout(1000);
      }

      // Try multiple methods to execute the search
      try {
        // Method 1: Press Enter using Playwright keyboard API
        await this.stagehand.page.keyboard.press('Enter');
        await this.stagehand.page.waitForTimeout(3000);
      } catch (error) {
        console.log('Failed to press Enter, trying to click search button');
        // Method 2: Click the search button
        try {
          await this.performCachedAction('Click the search button');
          await this.stagehand.page.waitForTimeout(3000);
        } catch (error2) {
          console.log('Failed to click search button, trying act with Enter');
          // Method 3: Use act to press Enter
          await this.stagehand.page.act('Press Enter to search');
          await this.stagehand.page.waitForTimeout(3000);
        }
      }
    } catch (error) {
      console.error('Error during search:', error);
      // Fallback to simple search
      await this.performCachedAction('Click on the job search input field');
      await this.stagehand.page.waitForTimeout(500);
      await this.stagehand.page.act(`Type "${searchQuery}" and press Enter`);
      await this.stagehand.page.waitForTimeout(3000);
    }
  }

  /**
   * Apply search filters using cached observe/act pattern
   * Only applies UI filters requested by the frontend
   */
  private async applyFilters(): Promise<void> {
    // Apply Date Posted filter
    if (this.config.datePosted) {
      this.emit(AutomationEventType.ACTION_PERFORMED, {
        sessionId: this.session.browserbase_session_id,
        action: `Applying date filter: ${this.config.datePosted}`,
        timestamp: new Date()
      });
      
      await this.performCachedAction('Click on the Date Posted filter');
      await this.stagehand.page.waitForTimeout(1000);
      await this.stagehand.page.act(`Select "${this.config.datePosted}" from the date options`);
      await this.stagehand.page.waitForTimeout(2000);
    }

    // Apply Easy Apply filter
    if (this.config.easyApplyOnly) {
      this.emit(AutomationEventType.ACTION_PERFORMED, {
        sessionId: this.session.browserbase_session_id,
        action: 'Applying Easy Apply filter',
        timestamp: new Date()
      });
      
      await this.performCachedAction('Click on the Easy Apply filter toggle');
      await this.stagehand.page.waitForTimeout(2000);
    }

    // Apply Under 10 applicants filter
    if (this.config.under10Applicants) {
      this.emit(AutomationEventType.ACTION_PERFORMED, {
        sessionId: this.session.browserbase_session_id,
        action: 'Applying Under 10 applicants filter',
        timestamp: new Date()
      });
      
      await this.performCachedAction('Click on the Under 10 applicants filter');
      await this.stagehand.page.waitForTimeout(2000);
    }

    // Apply In my network filter
    if (this.config.inMyNetwork) {
      this.emit(AutomationEventType.ACTION_PERFORMED, {
        sessionId: this.session.browserbase_session_id,
        action: 'Applying In my network filter',
        timestamp: new Date()
      });
      
      await this.performCachedAction('Click on the In my network filter');
      await this.stagehand.page.waitForTimeout(2000);
    }

    // Apply Company filter
    if (this.config.company) {
      this.emit(AutomationEventType.ACTION_PERFORMED, {
        sessionId: this.session.browserbase_session_id,
        action: `Applying Company filter: ${this.config.company}`,
        timestamp: new Date()
      });
      
      await this.performCachedAction('Click on the Company filter');
      await this.stagehand.page.waitForTimeout(1000);
      await this.stagehand.page.act(`Type "${this.config.company}" in the company filter field`);
      await this.stagehand.page.waitForTimeout(1000);
      await this.performCachedAction('Select the matching company from the dropdown');
      await this.stagehand.page.waitForTimeout(2000);
    }
  }

  /**
   * Extract job listings from current page
   */
  private async extractJobListings(): Promise<JobListing[]> {
    this.emit(AutomationEventType.EXTRACTION_RESULT, {
      sessionId: this.session.browserbase_session_id,
      type: 'job_listings',
      timestamp: new Date()
    });

    const jobsData = await this.stagehand.page.extract({
      instruction: "Extract all job listings visible on the page",
      schema: z.object({
        jobs: z.array(z.object({
          jobId: z.string().describe("The job ID from the data attributes or URL"),
          company: z.string().describe("Company name"),
          jobTitle: z.string().describe("Job title"),
          location: z.string().describe("Job location"),
          jobUrl: z.string().describe("Link to the job posting"),
          isEasyApply: z.boolean().describe("Has Easy Apply button"),
          alreadyApplied: z.boolean().optional().describe("Shows 'Applied' label")
        }))
      }),
      useTextExtract: false
    });

    // Ensure we have valid data
    if (!jobsData || !jobsData.jobs) {
      console.warn('No jobs data extracted');
      return [];
    }

    // Filter out any invalid jobs and ensure all required fields are present
    const validJobs: JobListing[] = jobsData.jobs.filter(job => 
      job.jobId && 
      job.company && 
      job.jobTitle && 
      job.location && 
      job.jobUrl &&
      typeof job.isEasyApply === 'boolean'
    ).map(job => ({
      jobId: job.jobId,
      company: job.company,
      jobTitle: job.jobTitle,
      location: job.location,
      jobUrl: job.jobUrl,
      isEasyApply: job.isEasyApply,
      alreadyApplied: job.alreadyApplied
    }));

    // Cache the job data
    for (const job of validJobs) {
      const jobDataToCache = {
        jobId: job.jobId,
        company: job.company,
        jobTitle: job.jobTitle,
        location: job.location,
        jobUrl: job.jobUrl,
        isEasyApply: job.isEasyApply,
        extractedAt: new Date()
      };
      
      this.cache.setJob(jobDataToCache);
      
      this.emit(AutomationEventType.JOB_FOUND, {
        sessionId: this.session.browserbase_session_id,
        job
      });
    }

    return validJobs;
  }

  /**
   * Process a single job listing
   */
  private async processJob(job: JobListing): Promise<boolean> {
    try {
      // Skip if already applied
      if (job.alreadyApplied) {
        this.emit(AutomationEventType.JOB_SKIPPED, {
          sessionId: this.session.browserbase_session_id,
          reason: 'already_applied',
          job
        });
        return false;
      }

      // Skip external jobs if configured for Easy Apply only
      if (this.config.easyApplyOnly && !job.isEasyApply) {
        this.emit(AutomationEventType.JOB_SKIPPED, {
          sessionId: this.session.browserbase_session_id,
          reason: 'not_easy_apply',
          job
        });
        return false;
      }

      this.metrics.recordJobView();
      this.metrics.startApplication(job.jobId, job.company, job.isEasyApply);

      this.emit(AutomationEventType.APPLICATION_STARTED, {
        sessionId: this.session.browserbase_session_id,
        job
      });

      // Click on the job listing using act()
      await this.stagehand.page.act(`Click on the job listing for "${job.jobTitle}" at "${job.company}"`);
      await this.stagehand.page.waitForTimeout(2000);

      // Update application agent context
      this.applicationAgent = new JobApplicationAgent(this.stagehand, this.session.browserbase_session_id, {
        jobTitle: job.jobTitle,
        company: job.company,
        jobUrl: job.jobUrl,
        isEasyApply: job.isEasyApply,
        applicationData: {
          resumeText: this.config.resumeMetadata?.extractedText,
          userEmail: this.config.externalApplicationConfig?.defaultEmail,
          userPhone: undefined
        }
      });

      // Apply to the job using the appropriate method
      let success = false;
      if (job.isEasyApply) {
        success = await this.applicationAgent.applyToEasyApplyJob();
      } else if (!this.config.easyApplyOnly) {
        success = await this.applicationAgent.applyToExternalJob();
      }

      // Record the result
      this.metrics.completeApplication(job.jobId, success);

      if (success) {
        // Save to database
        await this.saveApplication(job);
        
        // Mark in cache
        this.cache.markJobAsApplied(job.jobId);

        this.emit(AutomationEventType.APPLICATION_SUBMITTED, {
          sessionId: this.session.browserbase_session_id,
          job,
          success: true
        });
      }

      // Return to job listings using cached action
      await this.performCachedAction('Go back to job listings by clicking the back button or X');
      await this.stagehand.page.waitForTimeout(2000);

      return success;

    } catch (error) {
      console.error(`Error processing job ${job.jobId}:`, error);
      
      this.metrics.completeApplication(job.jobId, false, error instanceof Error ? error.message : String(error));
      
      // Try to recover and go back to listings using cached action
      try {
        await this.performCachedAction('Close any open modals or go back to job listings');
        await this.stagehand.page.waitForTimeout(2000);
      } catch (recoveryError) {
        console.error('Failed to recover:', recoveryError);
      }
      
      return false;
    }
  }

  /**
   * Navigate to next page of results
   */
  private async navigateToNextPage(): Promise<boolean> {
    try {
      const hasNext = await this.stagehand.page.extract({
        instruction: "Check if there is a Next or pagination button to go to the next page",
        schema: z.object({
          hasNextButton: z.boolean(),
          isDisabled: z.boolean()
        })
      });

      if (hasNext.hasNextButton && !hasNext.isDisabled) {
        this.emit(AutomationEventType.ACTION_PERFORMED, {
          sessionId: this.session.browserbase_session_id,
          action: 'Navigating to next page',
          timestamp: new Date()
        });

        await this.performCachedAction('Click the Next page button');
        await this.stagehand.page.waitForTimeout(3000);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error navigating to next page:', error);
      return false;
    }
  }

  /**
   * Save application to database
   */
  private async saveApplication(job: JobListing): Promise<void> {
    try {
      await this.linkedinSessionService.recordJobApplication(
        this.session.id,
        this.session.user_id,
        {
          job_url: job.jobUrl,
          job_id: job.jobId,
          company_name: job.company,
          job_title: job.jobTitle,
          location: job.location,
          application_type: job.isEasyApply ? 'easy_apply' : 'external',
          success: true
        }
      );

      this.emit(AutomationEventType.APPLICATION_SAVED, {
        sessionId: this.session.browserbase_session_id,
        job
      });
    } catch (error) {
      console.error('Failed to save application:', error);
    }
  }
}