/**
 * Example usage of InterventionDetectionService with LinkedIn automation
 * Demonstrates how to detect and handle various intervention scenarios
 */

import { Stagehand } from '@browserbase/stagehand';
import { InterventionDetectionService } from './interventionDetectionService';
import { automationService } from '../supabase';
import { browserbaseSessionManager } from '../browserbase';
import { InterventionType } from '../../types/automation.types';

// Example 1: Basic intervention detection during automation
async function detectInterventionExample(stagehand: Stagehand, sessionId: string) {
  const detector = new InterventionDetectionService({
    confidenceThreshold: 0.7,
    verboseLogging: true
  });

  try {
    // Navigate to LinkedIn
    await stagehand.page.goto('https://www.linkedin.com/jobs/');

    // Check for interventions
    const intervention = await detector.detectIntervention(stagehand);

    if (intervention) {
      console.log(`Intervention detected: ${intervention.type}`);
      console.log(`Confidence: ${intervention.confidence}`);
      console.log(`Message: ${intervention.message}`);
      console.log(`Instructions: ${intervention.instructions}`);

      // Log intervention in database
      const debugUrl = await browserbaseSessionManager.getDebugUrl(
        stagehand.browserbaseSessionId
      );

      await automationService.logIntervention(
        sessionId,
        intervention.type,
        debugUrl,
        intervention.pageContext,
        intervention.message,
        intervention.pageContext.url
      );

      // Pause automation
      await browserbaseSessionManager.pauseSession(sessionId);

      return intervention;
    }

    console.log('No intervention detected, continuing automation...');
    return null;
  } catch (error) {
    console.error('Error in intervention detection:', error);
    throw error;
  }
}

// Example 2: Continuous monitoring with periodic checks
async function continuousMonitoring(
  stagehand: Stagehand,
  sessionId: string,
  checkIntervalMs = 5000
) {
  const detector = new InterventionDetectionService({
    confidenceThreshold: 0.6, // Lower threshold for continuous monitoring
    enableMultipleDetection: true
  });

  let isRunning = true;
  const interventions: any[] = [];

  // Start monitoring
  const monitoringInterval = setInterval(async () => {
    if (!isRunning) {
      clearInterval(monitoringInterval);
      return;
    }

    try {
      const intervention = await detector.detectIntervention(stagehand);
      
      if (intervention) {
        interventions.push({
          timestamp: new Date(),
          ...intervention
        });

        // Handle based on intervention type
        await handleInterventionByType(
          intervention.type,
          stagehand,
          sessionId,
          intervention
        );
      }
    } catch (error) {
      console.error('Monitoring error:', error);
    }
  }, checkIntervalMs);

  // Return control function
  return {
    stop: () => {
      isRunning = false;
      clearInterval(monitoringInterval);
    },
    getInterventions: () => interventions
  };
}

// Example 3: Custom pattern detection
async function customPatternExample(stagehand: Stagehand) {
  const detector = new InterventionDetectionService();

  // Add custom pattern for LinkedIn-specific scenarios
  detector.addCustomPattern({
    type: InterventionType.BLOCKED,
    keywords: ['commercial use', 'automated activity', 'terms of use violation'],
    weight: 0.9,
    contextClues: ['review our terms', 'contact us', 'appeal this decision']
  });

  // Detect with custom patterns
  const intervention = await detector.detectIntervention(stagehand);
  return intervention;
}

// Example 4: Handle specific intervention types
async function handleInterventionByType(
  type: InterventionType,
  stagehand: Stagehand,
  sessionId: string,
  intervention: any
) {
  const debugUrl = await browserbaseSessionManager.getDebugUrl(
    stagehand.browserbaseSessionId
  );

  switch (type) {
    case InterventionType.LOGIN:
      console.log('Login required - notifying user...');
      // Could send email/notification to user
      await notifyUser({
        type: 'LOGIN_REQUIRED',
        message: 'Please log in to LinkedIn to continue',
        actionUrl: debugUrl
      });
      break;

    case InterventionType.CAPTCHA:
      console.log('CAPTCHA detected - waiting for user...');
      // Wait for user to solve CAPTCHA
      await waitForCaptchaSolution(stagehand, 300000); // 5 min timeout
      break;

    case InterventionType.TWO_FA:
      console.log('2FA required - waiting for code...');
      await notifyUser({
        type: '2FA_REQUIRED',
        message: 'Please enter your 2FA code',
        actionUrl: debugUrl
      });
      break;

    case InterventionType.RATE_LIMIT:
      console.log('Rate limit hit - implementing backoff...');
      // Automatic wait without user intervention
      const waitTime = calculateBackoffTime();
      await stagehand.page.waitForTimeout(waitTime);
      break;

    case InterventionType.BLOCKED:
      console.log('Account blocked - stopping automation...');
      // Terminate session
      await browserbaseSessionManager.terminateSession(
        sessionId,
        'Account blocked by LinkedIn'
      );
      break;
  }
}

// Example 5: Integration with automation workflow
async function automationWithInterventionDetection(
  userId: string,
  config: any
) {
  const detector = new InterventionDetectionService({
    confidenceThreshold: 0.7,
    verboseLogging: true
  });

  let stagehand: Stagehand | null = null;
  let monitoring: any = null;

  try {
    // Create session
    const session = await browserbaseSessionManager.createUserSession(userId, config);

    // Initialize Stagehand
    stagehand = new Stagehand({
      env: 'BROWSERBASE',
      apiKey: process.env.BROWSERBASE_API_KEY,
      browserbaseSessionID: session.browserbase_session_id
    });

    await stagehand.init();

    // Start continuous monitoring
    monitoring = await continuousMonitoring(stagehand, session.id);

    // Navigate to LinkedIn
    await stagehand.page.goto('https://www.linkedin.com/jobs/');

    // Initial intervention check
    const initialCheck = await detector.detectIntervention(stagehand);
    if (initialCheck) {
      console.log('Initial intervention detected:', initialCheck.type);
      return { session, intervention: initialCheck };
    }

    // Continue with automation
    // ... your automation logic here ...

    // Example: Search for jobs
    await stagehand.page.act("Type 'software engineer' in the job search box");
    await stagehand.page.act("Click the search button");

    // Check again after action
    const postActionCheck = await detector.detectIntervention(stagehand);
    if (postActionCheck) {
      console.log('Post-action intervention detected:', postActionCheck.type);
      return { session, intervention: postActionCheck };
    }

    // Continue with more automation...

  } catch (error) {
    console.error('Automation error:', error);
    throw error;
  } finally {
    // Cleanup
    if (monitoring) {
      monitoring.stop();
      console.log('Total interventions detected:', monitoring.getInterventions().length);
    }
    if (stagehand) {
      await stagehand.close();
    }
  }
}

// Helper functions
async function notifyUser(notification: any) {
  // Implement your notification logic here
  console.log('Notifying user:', notification);
  // Could use email, SMS, push notifications, etc.
}

async function waitForCaptchaSolution(stagehand: Stagehand, timeoutMs: number) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    // Check if CAPTCHA is still present
    const captchaStillPresent = await stagehand.page.observe({
      instruction: "Check if CAPTCHA is still visible on the page"
    });

    if (captchaStillPresent.length === 0) {
      console.log('CAPTCHA solved!');
      return true;
    }

    // Wait 2 seconds before checking again
    await stagehand.page.waitForTimeout(2000);
  }

  throw new Error('CAPTCHA solution timeout');
}

function calculateBackoffTime(): number {
  // Implement exponential backoff
  const baseWait = 60000; // 1 minute
  const jitter = Math.random() * 30000; // 0-30 seconds
  return baseWait + jitter;
}

// Example 6: Testing intervention detection
async function testInterventionDetection() {
  const detector = new InterventionDetectionService({
    verboseLogging: true
  });

  // Test login detection
  const loginTest = await detector.checkForLogin(
    "please sign in with your email and password to continue",
    [
      { selector: "input[type='email']", description: "Email input field" },
      { selector: "input[type='password']", description: "Password input field" },
      { selector: "button", description: "Sign in button", method: "click" }
    ]
  );
  console.log('Login detection test:', loginTest);

  // Test CAPTCHA detection
  const captchaTest = await detector.checkForCaptcha(
    "please complete the security check to verify you're human",
    [
      { selector: "div.recaptcha", description: "ReCAPTCHA widget" },
      { selector: "iframe", description: "ReCAPTCHA iframe" }
    ]
  );
  console.log('CAPTCHA detection test:', captchaTest);

  // Test messages
  console.log('\nIntervention Messages:');
  for (const type of Object.values(InterventionType)) {
    console.log(`${type}: ${detector.getInterventionMessage(type)}`);
    console.log(`Instructions: ${detector.getInterventionInstructions(type)}`);
    console.log('---');
  }
}

// Export example functions
export {
  detectInterventionExample,
  continuousMonitoring,
  customPatternExample,
  automationWithInterventionDetection,
  testInterventionDetection
};