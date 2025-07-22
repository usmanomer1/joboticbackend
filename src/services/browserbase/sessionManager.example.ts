/**
 * Example usage of BrowserbaseSessionManager with LinkedIn automation
 * This demonstrates the integration between Browserbase and Supabase
 */

import { chromium } from 'playwright-core';
import { createBrowserbaseSessionManager } from './sessionManager';
import { automationService } from '../supabase';
import { AutomationHelpers } from '../supabase/automationHelpers';
import { 
  JobSearchConfig, 
  InterventionType,
  ApplicationStatus,
  LogLevel 
} from '../../types/automation.types';

// Example: Complete LinkedIn automation workflow
async function runLinkedInAutomation(userId: string) {
  // Initialize the session manager
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
  const helpers = new AutomationHelpers(automationService.supabase);
  const sessionManager = createBrowserbaseSessionManager(automationService, helpers);

  let browser = null;
  let automationSession = null;

  try {
    // 1. Define job search configuration
    const config: JobSearchConfig = {
      jobTitle: 'Software Engineer',
      location: 'San Francisco, CA',
      experienceLevel: ['Entry', 'Mid'],
      jobType: ['Full-time'],
      remote: true,
      salary: { min: 120000, max: 180000 },
      targetCount: 20,
      easyApplyOnly: true,
      keywords: ['React', 'Node.js', 'TypeScript'],
      excludeKeywords: ['Senior', 'Lead', 'Principal']
    };

    // 2. Create or resume a session
    console.log('Creating automation session...');
    automationSession = await sessionManager.getOrCreateSession(userId, config);
    console.log(`Session created: ${automationSession.id}`);

    // 3. Connect to Browserbase using Playwright
    const connectionUrl = sessionManager.getConnectionUrl(
      automationSession.browserbase_session_id,
      { enableProxy: true }
    );

    console.log('Connecting to browser...');
    browser = await chromium.connectOverCDP(connectionUrl);
    
    // Get the default context and page
    const defaultContext = browser.contexts()[0];
    const page = defaultContext.pages()[0];

    // 4. Set up real-time monitoring
    const unsubscribeStatus = automationService.subscribeToSessionStatus(
      automationSession.id,
      (newStatus) => {
        console.log(`Session status changed to: ${newStatus.status}`);
      }
    );

    const unsubscribeInterventions = automationService.subscribeToInterventions(
      userId,
      async (intervention) => {
        console.log('Intervention required:', intervention);
        // Notify user about intervention
        await notifyUserOfIntervention(intervention);
      }
    );

    // 5. Navigate to LinkedIn
    console.log('Navigating to LinkedIn...');
    await page.goto('https://www.linkedin.com/jobs/search/', {
      waitUntil: 'domcontentloaded'
    });

    // 6. Check if login is required
    const isLoggedIn = await checkIfLoggedIn(page);
    
    if (!isLoggedIn) {
      // Pause automation and request user intervention
      console.log('Login required, pausing for user intervention...');
      
      // Get debug URL for user
      const debugUrl = await sessionManager.getDebugUrl(automationSession.browserbase_session_id);
      
      // Log intervention
      const intervention = await automationService.logIntervention(
        automationSession.id,
        InterventionType.LOGIN,
        debugUrl,
        { currentUrl: page.url() },
        'Please log in to LinkedIn to continue automation',
        page.url()
      );

      // Pause session
      await sessionManager.pauseSession(automationSession.id);
      
      console.log(`Please complete login at: ${debugUrl}`);
      console.log('Waiting for login completion...');

      // Wait for user to complete login
      await page.waitForSelector('[data-test-id="job-card"]', {
        timeout: 300000 // 5 minutes
      });

      // Resolve intervention and resume
      await automationService.resolveIntervention(
        intervention.id,
        { method: 'manual_login', timestamp: Date.now() }
      );

      // Resume session
      automationSession = await sessionManager.resumeSession(automationSession.id);
      console.log('Login completed, resuming automation...');
    }

    // 7. Perform job search
    await performJobSearch(page, config);

    // 8. Process job listings
    const jobsApplied = await processJobListings(
      page,
      automationSession,
      userId,
      config.targetCount || 20
    );

    console.log(`Successfully applied to ${jobsApplied} jobs`);

    // 9. Complete the session
    await automationService.updateSessionStatus(
      automationSession.id,
      'completed'
    );

  } catch (error) {
    console.error('Automation failed:', error);
    
    // Log error
    if (automationSession) {
      await automationService.logAutomationEvent(
        automationSession.id,
        LogLevel.ERROR,
        'Automation failed with error',
        { error: error.message, stack: error.stack },
        'error'
      );

      // Mark session as failed
      await sessionManager.terminateSession(
        automationSession.id,
        `Error: ${error.message}`
      );
    }

    throw error;
  } finally {
    // Clean up
    if (browser) {
      await browser.close();
    }
    automationService.cleanup();
  }
}

// Helper function: Check if logged in to LinkedIn
async function checkIfLoggedIn(page: any): Promise<boolean> {
  try {
    // Check for presence of job search elements
    await page.waitForSelector('[data-test-id="job-card"]', { timeout: 5000 });
    return true;
  } catch {
    // Check for login form
    const loginForm = await page.$('form[data-id="sign-in-form"]');
    return !loginForm;
  }
}

// Helper function: Perform job search
async function performJobSearch(page: any, config: JobSearchConfig) {
  // Enter job title
  await page.fill('[aria-label="Search by title, skill, or company"]', config.jobTitle);
  
  // Enter location
  await page.fill('[aria-label="City, state, or zip code"]', config.location);
  
  // Click search
  await page.click('button[type="submit"]');
  
  // Wait for results
  await page.waitForSelector('[data-test-id="job-card"]');
  
  // Apply filters
  if (config.easyApplyOnly) {
    await page.click('button[aria-label="Easy Apply filter."]');
  }
  
  if (config.remote) {
    await page.click('button[aria-label="Remote filter."]');
  }
}

// Helper function: Process job listings
async function processJobListings(
  page: any,
  session: any,
  userId: string,
  targetCount: number
): Promise<number> {
  let appliedCount = 0;
  
  while (appliedCount < targetCount) {
    // Get all job cards on current page
    const jobCards = await page.$$('[data-test-id="job-card"]');
    
    for (const jobCard of jobCards) {
      if (appliedCount >= targetCount) break;
      
      try {
        // Click job card
        await jobCard.click();
        await page.waitForTimeout(1000);
        
        // Extract job details
        const jobDetails = await extractJobDetails(page);
        
        // Check if already applied
        const alreadyApplied = await automationService.checkIfAlreadyApplied(
          userId,
          jobDetails.jobId
        );
        
        if (alreadyApplied) {
          console.log(`Already applied to ${jobDetails.title} at ${jobDetails.company}`);
          continue;
        }
        
        // Check for Easy Apply button
        const easyApplyButton = await page.$('button[aria-label*="Easy Apply"]');
        
        if (easyApplyButton) {
          // Click Easy Apply
          await easyApplyButton.click();
          
          // Handle application flow
          const applied = await handleEasyApply(page);
          
          if (applied) {
            // Record application
            await automationService.recordJobApplication(
              session.id,
              userId,
              {
                job_id: jobDetails.jobId,
                company: jobDetails.company,
                title: jobDetails.title,
                location: jobDetails.location,
                job_url: jobDetails.url,
                application_type: 'easy_apply'
              },
              ApplicationStatus.SUCCESS
            );
            
            appliedCount++;
            console.log(`Applied to ${jobDetails.title} at ${jobDetails.company} (${appliedCount}/${targetCount})`);
          }
        }
        
      } catch (error) {
        console.error('Error processing job:', error);
        // Continue with next job
      }
    }
    
    // Check if there's a next page
    const nextButton = await page.$('button[aria-label="View next page"]');
    if (nextButton && await nextButton.isEnabled()) {
      await nextButton.click();
      await page.waitForSelector('[data-test-id="job-card"]');
    } else {
      break;
    }
  }
  
  return appliedCount;
}

// Helper function: Extract job details from page
async function extractJobDetails(page: any) {
  const title = await page.$eval('h1', (el: any) => el.textContent.trim());
  const company = await page.$eval('.job-details-jobs-unified-top-card__company-name', (el: any) => el.textContent.trim());
  const location = await page.$eval('.job-details-jobs-unified-top-card__bullet', (el: any) => el.textContent.trim());
  const url = page.url();
  const jobId = url.match(/jobs\/view\/(\d+)/)?.[1] || Date.now().toString();
  
  return { jobId, title, company, location, url };
}

// Helper function: Handle Easy Apply flow
async function handleEasyApply(page: any): Promise<boolean> {
  try {
    // Wait for modal to open
    await page.waitForSelector('.jobs-easy-apply-modal');
    
    // Click through application steps
    let hasNext = true;
    while (hasNext) {
      // Fill any required fields
      // This is simplified - real implementation would handle various input types
      
      // Look for next/submit button
      const nextButton = await page.$('button[aria-label="Continue to next step"]');
      const submitButton = await page.$('button[aria-label="Submit application"]');
      
      if (submitButton) {
        await submitButton.click();
        await page.waitForTimeout(2000);
        hasNext = false;
      } else if (nextButton) {
        await nextButton.click();
        await page.waitForTimeout(1000);
      } else {
        hasNext = false;
      }
    }
    
    // Check for success message
    const successMessage = await page.$('.artdeco-modal__dismiss');
    if (successMessage) {
      await successMessage.click();
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Easy Apply error:', error);
    return false;
  }
}

// Helper function: Notify user of intervention
async function notifyUserOfIntervention(intervention: any) {
  // This would integrate with your notification system
  console.log('User notification:', {
    type: intervention.type,
    message: intervention.message,
    liveViewUrl: intervention.live_view_url
  });
}

// Example: Session management operations
async function sessionManagementExamples(userId: string) {
  const helpers = new AutomationHelpers(automationService.supabase);
  const sessionManager = createBrowserbaseSessionManager(automationService, helpers);

  // Example 1: Pause and resume a session
  const session = await sessionManager.createUserSession(userId, {
    jobTitle: 'Software Engineer',
    location: 'Remote',
    targetCount: 10
  });

  // Pause the session
  await sessionManager.pauseSession(session.id);
  console.log('Session paused');

  // Resume later
  const resumedSession = await sessionManager.resumeSession(session.id);
  console.log('Session resumed');

  // Example 2: Handle session cleanup
  const cleanedCount = await sessionManager.cleanupStaleSessions(24);
  console.log(`Cleaned up ${cleanedCount} stale sessions`);

  // Example 3: Get debug URL for user support
  const debugUrl = await sessionManager.getDebugUrl(session.browserbase_session_id);
  console.log(`Debug URL: ${debugUrl}`);
}

// Export example functions
export {
  runLinkedInAutomation,
  sessionManagementExamples
};