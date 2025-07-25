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
    try {
      this.emitStep('Starting external application', { company: this.context.company });

      // Click Apply button using cached observe/act
      await this.performAction('Click the Apply button', async () => {
        await this.performCachedAction('Click the Apply button');
      });

      // Wait for new tab/window or redirect
      await this.stagehand.page.waitForTimeout(3000);

      // Check if we're on an external site
      const currentUrl = await this.stagehand.page.url();
      const isExternal = !currentUrl.includes('linkedin.com');

      if (isExternal) {
        this.emitStep('Navigated to external application site', { url: currentUrl });

        // Check if account creation is needed
        const needsAccount = await this.checkIfAccountCreationNeeded();
        
        if (needsAccount) {
          this.emit(AutomationEventType.INTERVENTION_REQUIRED, {
            sessionId: this.sessionId,
            intervention: {
              type: 'account_creation',
              message: 'Account creation required for external application',
              instructions: 'Please create an account on the company website to continue with the application',
              url: currentUrl
            }
          });
          return false;
        }

        // Use agent to handle external application
        const agentPrompt = this.buildExternalApplicationAgentPrompt();
        const result = await this.executeAgentWithTracking(agentPrompt);

        return result.success;
      } else {
        // It's a LinkedIn external redirect page
        this.emitStep('LinkedIn external application page detected');
        return true;
      }
    } catch (error) {
      console.error('External application error:', error);
      this.emitStep('Error during external application', { error: error.message });
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
      // Execute the agent
      const result = await this.stagehand.page.agent({
        prompt,
        maxSteps
      });

      clearInterval(pollInterval);

      // Process and emit all agent steps
      if (result.steps && Array.isArray(result.steps)) {
        for (const step of result.steps) {
          this.emit(AutomationEventType.AGENT_STEP, {
            sessionId: this.sessionId,
            action: step.action,
            element: step.element,
            timestamp: new Date()
          });
        }
      }

      // Emit completion
      this.emit(AutomationEventType.AGENT_COMPLETE, {
        sessionId: this.sessionId,
        success: result.success,
        totalSteps: result.steps?.length || 0
      });

      return { success: result.success };
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