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

    await this.performCachedAction('Navigate to LinkedIn Jobs page');
    await this.stagehand.page.waitForTimeout(3000);
  }

  /**
   * Perform job search using cached observe/act pattern
   */
  private async performSearch(): Promise<void> {
    const searchQuery = this.config.searchPrompt || 
                       `${this.config.jobTitle} ${this.config.location}`.trim();

    this.emit(AutomationEventType.ACTION_PERFORMED, {
      sessionId: this.session.browserbase_session_id,
      action: `Searching for: ${searchQuery}`,
      timestamp: new Date()
    });

    // Click search bar and enter query using cached actions
    await this.performCachedAction('Click on the job search input field');
    await this.stagehand.page.waitForTimeout(500);
    
    await this.performCachedAction('Clear the search field');
    await this.stagehand.page.waitForTimeout(500);
    
    // For dynamic content like search query, we still use regular act
    await this.stagehand.page.act(`Type "${searchQuery}" in the search field`);
    await this.stagehand.page.waitForTimeout(1000);
    
    await this.performCachedAction('Press Enter or click Search to perform the search');
    await this.stagehand.page.waitForTimeout(3000);
  }

  /**
   * Apply search filters using cached observe/act pattern
   */
  private async applyFilters(): Promise<void> {
    if (this.config.easyApplyOnly) {
      this.emit(AutomationEventType.ACTION_PERFORMED, {
        sessionId: this.session.browserbase_session_id,
        action: 'Applying Easy Apply filter',
        timestamp: new Date()
      });
      
      await this.performCachedAction('Click on the Easy Apply filter toggle');
      await this.stagehand.page.waitForTimeout(2000);
    }

    if (this.config.datePosted) {
      this.emit(AutomationEventType.ACTION_PERFORMED, {
        sessionId: this.session.browserbase_session_id,
        action: `Applying date filter: ${this.config.datePosted}`,
        timestamp: new Date()
      });
      
      await this.performCachedAction('Click on the Date Posted filter');
      await this.stagehand.page.waitForTimeout(1000);
      // Dynamic content, use regular act
      await this.stagehand.page.act(`Select "${this.config.datePosted}" from the date options`);
      await this.stagehand.page.waitForTimeout(2000);
    }

    if (this.config.remote) {
      this.emit(AutomationEventType.ACTION_PERFORMED, {
        sessionId: this.session.browserbase_session_id,
        action: 'Applying Remote filter',
        timestamp: new Date()
      });
      
      await this.performCachedAction('Click on the Remote filter toggle');
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
      })
    });

    // Ensure we have valid data
    if (!jobsData || !jobsData.jobs) {
      console.warn('No jobs data extracted');
      return [];
    }

    // Cache the job data
    for (const job of jobsData.jobs) {
      // Ensure the job data matches CachedJobData interface
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

    return jobsData.jobs;
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