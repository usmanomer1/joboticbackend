import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import { EventEmitter } from 'events';
import { AutomationEventType } from '../../types/automation.types';
import { ObserveCache } from './observeCache';

interface JobApplicationContext {
  jobTitle: string;
  company: string;
  jobUrl: string;
  isEasyApply: boolean;
  applicationData?: {
    resumeText?: string;
    userEmail?: string;
    userPhone?: string;
  };
}

interface AgentStep {
  action: string;
  element?: string;
  value?: string;
  timestamp: Date;
  success: boolean;
  error?: string;
}

/**
 * Specialized agent for handling job applications with real-time streaming
 */
export class JobApplicationAgent extends EventEmitter {
  private stagehand: Stagehand;
  private sessionId: string;
  private context: JobApplicationContext;
  private steps: AgentStep[] = [];
  private observeCache: ObserveCache;

  constructor(stagehand: Stagehand, sessionId: string, context: JobApplicationContext) {
    super();
    this.stagehand = stagehand;
    this.sessionId = sessionId;
    this.context = context;
    this.observeCache = new ObserveCache();
  }

  /**
   * Perform action using observe/act pattern with caching
   */
  private async performCachedAction(instruction: string): Promise<void> {
    try {
      let observeResult = this.observeCache.get(instruction);
      
      if (!observeResult) {
        const observeResults = await this.stagehand.page.observe({
          instruction,
          returnAction: true
        });
        
        if (observeResults && observeResults.length > 0) {
          observeResult = observeResults[0];
          this.observeCache.set(instruction, observeResult);
        }
      }
      
      if (observeResult) {
        await this.stagehand.page.act(observeResult);
      } else {
        await this.stagehand.page.act(instruction);
      }
    } catch (error) {
      await this.stagehand.page.act(instruction);
    }
  }

  /**
   * Handle Easy Apply job application with real-time updates
   */
  async applyToEasyApplyJob(): Promise<boolean> {
    try {
      this.emitStep('Starting Easy Apply application', { company: this.context.company });

      // Click Easy Apply button using cached observe/act
      await this.performAction('Click the Easy Apply button', async () => {
        await this.performCachedAction('Click the Easy Apply button');
      });

      // Wait for form to load
      await this.stagehand.page.waitForTimeout(2000);

      // Use agent to handle the application form
      const agentPrompt = this.buildEasyApplyAgentPrompt();
      
      // Start agent execution with step tracking
      const result = await this.executeAgentWithTracking(agentPrompt);

      if (result.success) {
        this.emitStep('Application submitted successfully');
        return true;
      } else {
        this.emitStep('Application failed', { error: result.error });
        return false;
      }
    } catch (error) {
      console.error('Easy Apply error:', error);
      this.emitStep('Error during Easy Apply', { error: error.message });
      return false;
    }
  }

  /**
   * Handle external job application with intervention support
   */
  async applyToExternalJob(): Promise<boolean> {
    const maxRetries = 2;
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        this.emitStep('Starting external application', { 
          company: this.context.company,
          attempt: retryCount + 1,
          maxAttempts: maxRetries + 1
        });

        // Get all pages before clicking
        const pagesBefore = this.stagehand.context.pages();
        const currentPage = this.stagehand.page;
        const initialUrl = await currentPage.url();

        // Click Apply button - this might open a new tab
        await this.performAction('Click the Apply button', async () => {
          // Try multiple methods to click the apply button
          const clickMethods = [
            async () => {
              // Method 1: Try Ctrl+click for new tab
              await this.stagehand.page.act('Hold Ctrl and click the Apply button to open in new tab');
            },
            async () => {
              // Method 2: Regular click
              await this.performCachedAction('Click the Apply button');
            },
            async () => {
              // Method 3: Direct act
              await this.stagehand.page.act('Click the Apply button for external application');
            }
          ];

          let clickSuccess = false;
          for (const [index, clickMethod] of clickMethods.entries()) {
            try {
              await clickMethod();
              clickSuccess = true;
              console.log(`Successfully clicked Apply button using method ${index + 1}`);
              break;
            } catch (error) {
              console.log(`Click method ${index + 1} failed:`, error.message);
              if (index === clickMethods.length - 1) {
                throw new Error('All click methods failed');
              }
            }
          }
        });

        // Wait for potential new tab or navigation
        await this.stagehand.page.waitForTimeout(3000);

        // Check if a new tab was opened
        const pagesAfter = this.stagehand.context.pages();
        let targetPage = currentPage;
        let isNewTab = false;
        
        if (pagesAfter.length > pagesBefore.length) {
          // New tab was opened
          targetPage = pagesAfter[pagesAfter.length - 1];
          isNewTab = true;
          
          try {
            await targetPage.bringToFront();
            this.emitStep('Switched to new tab for external application');
          } catch (error) {
            console.error('Error switching to new tab:', error);
            throw new Error('Failed to switch to new tab');
          }
        }

        // Check if we're on an external site
        let currentUrl: string;
        try {
          currentUrl = await targetPage.url();
        } catch (error) {
          console.error('Error getting URL from target page:', error);
          throw new Error('Target page is closed or inaccessible');
        }
        
        const isExternal = !currentUrl.includes('linkedin.com');
        const didNavigate = currentUrl !== initialUrl;

        if (isExternal) {
          this.emitStep('On external application site', { 
            url: currentUrl,
            isNewTab,
            company: this.context.company
          });

          // Emit external site detection
          this.emit(AutomationEventType.EXTERNAL_SITE_DETECTED, {
            sessionId: this.sessionId,
            company: this.context.company,
            jobUrl: currentUrl,
            isNewTab
          });

          // For now, we'll request manual intervention for all external applications
          // This avoids the page context issues when trying to automate external sites
          this.emitStep('External application requires manual intervention');
          
          this.emit(AutomationEventType.INTERVENTION_REQUIRED, {
            sessionId: this.sessionId,
            intervention: {
              type: 'external_application',
              message: `External application opened for ${this.context.company}`,
              instructions: 'Please complete the application on the external site. The automation will continue after you close this tab or navigate back.',
              url: currentUrl,
              metadata: {
                isNewTab,
                company: this.context.company,
                jobTitle: this.context.jobTitle
              }
            }
          });

          // Don't close the tab immediately - let the user complete the application
          // The automation will handle recovery when they come back
          return true;
        } else if (didNavigate) {
          // LinkedIn redirect page or navigation
          this.emitStep('LinkedIn navigation detected', { 
            from: initialUrl,
            to: currentUrl
          });
          
          // If it's in the same tab, go back
          if (!isNewTab) {
            try {
              await this.stagehand.page.goBack();
              await this.stagehand.page.waitForTimeout(2000);
            } catch (error) {
              console.error('Failed to go back:', error);
            }
          }
          
          return true;
        } else {
          // No navigation occurred
          this.emitStep('No navigation detected after clicking Apply', {
            url: currentUrl
          });
          return false;
        }
      } catch (error) {
        console.error(`External application error (attempt ${retryCount + 1}):`, error);
        this.emitStep('Error during external application', { 
          error: error.message,
          attempt: retryCount + 1,
          willRetry: retryCount < maxRetries
        });
        
        // Recovery attempt
        const recovered = await this.recoverFromExternalError(error);
        
        if (!recovered && retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying external application (attempt ${retryCount + 1})...`);
          await this.stagehand.page.waitForTimeout(2000);
          continue;
        }
        
        return false;
      }
    }
    
    return false;
  }

  /**
   * Recover from external application errors
   */
  private async recoverFromExternalError(error: Error): Promise<boolean> {
    try {
      console.log('Attempting to recover from external application error...');
      
      const pages = this.stagehand.context.pages();
      const mainPage = pages[0];
      
      // Close any extra tabs
      if (pages.length > 1) {
        console.log(`Found ${pages.length} open tabs, closing extras...`);
        for (let i = pages.length - 1; i > 0; i--) {
          try {
            const page = pages[i];
            if (page && !page.isClosed()) {
              await page.close();
              console.log(`Closed tab ${i}`);
            }
          } catch (closeError) {
            console.error(`Failed to close tab ${i}:`, closeError.message);
          }
        }
      }
      
      // Ensure we're on the main tab
      if (mainPage && !mainPage.isClosed()) {
        try {
          await mainPage.bringToFront();
          console.log('Successfully switched to main tab');
          
          // Check if we're still on LinkedIn
          const url = await mainPage.url();
          if (!url.includes('linkedin.com')) {
            console.log('Main tab is not on LinkedIn, navigating back...');
            await mainPage.goBack();
            await mainPage.waitForTimeout(2000);
          }
          
          return true;
        } catch (bringError) {
          console.error('Failed to bring main tab to front:', bringError);
        }
      }
      
      return false;
    } catch (recoveryError) {
      console.error('Recovery from external application error failed:', recoveryError);
      return false;
    }
  }

  /**
   * Execute agent with real-time step tracking
   */
  private async executeAgentWithTracking(prompt: string): Promise<{ success: boolean; error?: string }> {
    let stepCounter = 0;
    const maxSteps = 50;

    // Create a polling mechanism to get agent state
    const pollInterval = setInterval(async () => {
      try {
        // Emit current agent reasoning/thinking
        this.emit(AutomationEventType.AGENT_STEP_REALTIME, {
          sessionId: this.sessionId,
          step: stepCounter++,
          thinking: 'Agent is analyzing the page and determining next action...'
        });
      } catch (error) {
        console.error('Error polling agent state:', error);
      }
    }, 1000);

    try {
      // Create and execute the agent
      const agent = this.stagehand.agent({
        provider: "openai",
        model: "gpt-4o",
        instructions: "You are a helpful assistant filling out job applications. Be careful and accurate with form fields.",
        options: {
          apiKey: process.env.OPENAI_API_KEY,
        }
      });

      const result = await agent.execute(prompt);

      clearInterval(pollInterval);

      // Process and emit all agent actions
      if (result.actions && Array.isArray(result.actions)) {
        for (const action of result.actions) {
          this.emit(AutomationEventType.AGENT_STEP, {
            sessionId: this.sessionId,
            action: action.type,
            description: action.description || action.parameters,
            timestamp: new Date()
          });
        }
      }

      // Emit completion
      this.emit(AutomationEventType.AGENT_COMPLETE, {
        sessionId: this.sessionId,
        success: result.success,
        message: result.message,
        totalSteps: result.actions?.length || 0
      });

      return { success: result.success, message: result.message };
    } catch (error) {
      clearInterval(pollInterval);
      console.error('Agent execution error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Perform a single action with tracking
   */
  private async performAction(description: string, action: () => Promise<void>): Promise<void> {
    const step: AgentStep = {
      action: description,
      timestamp: new Date(),
      success: false
    };

    try {
      this.emit(AutomationEventType.ACTION_PERFORMED, {
        sessionId: this.sessionId,
        action: description,
        timestamp: step.timestamp
      });

      await action();
      
      step.success = true;
      this.steps.push(step);
    } catch (error) {
      step.success = false;
      step.error = error.message;
      this.steps.push(step);
      throw error;
    }
  }

  /**
   * Check if account creation is needed on external site
   */
  private async checkIfAccountCreationNeeded(): Promise<boolean> {
    try {
      // First check if we're on the correct page (targetPage might be different from stagehand.page)
      const pages = this.stagehand.context.pages();
      if (pages.length === 0) {
        console.error('No pages available in context');
        return false;
      }
      
      const targetPage = pages[pages.length - 1]; // Most recent page
      
      // Check if the page is still valid
      try {
        await targetPage.url();
      } catch (error) {
        console.error('Target page is closed or invalid');
        return false;
      }
      
      // We need to use the target page for extraction
      // Since Stagehand doesn't expose a way to change the page, we'll try with the current context
      const pageContent = await this.stagehand.page.extract({
        instruction: "Check if this page requires creating a new account or logging in",
        schema: z.object({
          hasLoginForm: z.boolean(),
          hasSignupForm: z.boolean(),
          hasCreateAccountButton: z.boolean(),
          isAlreadyLoggedIn: z.boolean()
        })
      });

      return !pageContent.isAlreadyLoggedIn && 
             (pageContent.hasLoginForm || pageContent.hasSignupForm || pageContent.hasCreateAccountButton);
    } catch (error) {
      console.error('Error checking for account creation:', error);
      // If we can't check, assume we can proceed
      return false;
    }
  }

  /**
   * Build agent prompt for Easy Apply
   */
  private buildEasyApplyAgentPrompt(): string {
    const { resumeText, userEmail, userPhone } = this.context.applicationData || {};
    
    return `You are applying to a job at ${this.context.company} for the position of ${this.context.jobTitle}.

OBJECTIVE: Complete the Easy Apply application form and submit it.

CONTEXT:
- This is a LinkedIn Easy Apply job application
- User email: ${userEmail || 'Use the email from the form if pre-filled'}
- User phone: ${userPhone || 'Use a valid US phone number format: (555) 123-4567'}
${resumeText ? `- Resume content is available and should be used to answer questions about experience and skills` : ''}

INSTRUCTIONS:
1. Fill out all required fields in the application form
2. For experience questions, use information from the resume if available
3. For salary expectations, provide competitive ranges based on the role and location
4. For availability, indicate "2 weeks notice" or similar
5. If asked about work authorization, indicate authorized to work
6. Upload resume if there's a file upload field (file is already prepared)
7. Review application if there's a review step
8. Click Submit or Send Application to complete

IMPORTANT:
- Be thorough but efficient
- If you encounter unexpected questions, make reasonable assumptions
- If there are multiple pages, navigate through all of them
- The goal is to successfully submit the application`;
  }

  /**
   * Build agent prompt for external applications
   */
  private buildExternalApplicationAgentPrompt(): string {
    const { resumeText, userEmail, userPhone } = this.context.applicationData || {};
    
    return `You are on an external company website to apply for a job at ${this.context.company} for the position of ${this.context.jobTitle}.

OBJECTIVE: Navigate the application process and fill out the application form.

CONTEXT:
- This is an external job application (not LinkedIn)
- User email: ${userEmail || 'use a professional email format'}
- User phone: ${userPhone || 'use a valid US phone number'}
${resumeText ? `- Resume content is available for answering questions` : ''}

INSTRUCTIONS:
1. Look for an "Apply" or "Apply Now" button and click it
2. If required to create an account, STOP and report that manual intervention is needed
3. Fill out the application form with all required information
4. Upload resume if requested (file is already prepared)
5. Complete all steps until you reach a confirmation page

CONSTRAINTS:
- Do NOT create new accounts
- Do NOT provide payment information
- If you encounter a login page without an option to apply as guest, STOP
- If the process seems unusually complex or asks for sensitive information, STOP

The goal is to complete as much of the application as possible without creating accounts.`;
  }

  /**
   * Emit a step update
   */
  private emitStep(action: string, metadata?: any): void {
    this.emit(AutomationEventType.AGENT_STEP, {
      sessionId: this.sessionId,
      action,
      metadata,
      timestamp: new Date()
    });
  }
}