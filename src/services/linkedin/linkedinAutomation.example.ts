/**
 * Example usage of LinkedInAutomationService
 * Demonstrates complete automation workflow with intervention handling
 */

import { LinkedInAutomationService } from './linkedinAutomationService';
import { BrowserbaseSessionManager } from '../browserbase/sessionManager';
import { SupabaseAutomationService } from '../supabase/automationService';
import { 
  JobSearchConfig, 
  AutomationEventType,
  InterventionType 
} from '../../types/automation.types';

// Initialize services
const browserbaseManager = new BrowserbaseSessionManager();
const supabaseService = new SupabaseAutomationService();

// Create automation service
const automationService = new LinkedInAutomationService(
  browserbaseManager,
  supabaseService,
  {
    maxRetries: 3,
    retryDelay: 2000,
    saveProgressInterval: 5,
    checkInterventionAfterActions: true,
    verboseLogging: true
  }
);

// Example 1: Basic job search automation
async function basicJobSearchExample(userId: string) {
  const config: JobSearchConfig = {
    jobTitle: 'Software Engineer',
    location: 'San Francisco, CA',
    datePosted: 'week',
    experienceLevel: ['ENTRY_LEVEL', 'MID_LEVEL'],
    jobType: ['FULL_TIME'],
    remote: false,
    easyApplyOnly: true,
    maxApplications: 10,
    keywords: ['typescript', 'react', 'node.js']
  };

  try {
    // Start automation
    const { sessionId, debugUrl } = await automationService.startJobSearch(userId, config);
    
    console.log('Automation started');
    console.log('Session ID:', sessionId);
    console.log('Debug URL:', debugUrl);
    console.log('You can watch the automation in real-time at:', debugUrl);

    return { sessionId, debugUrl };
  } catch (error) {
    console.error('Failed to start automation:', error);
    throw error;
  }
}

// Example 2: Setup event listeners for real-time updates
function setupEventListeners(automationService: LinkedInAutomationService) {
  // Session started
  automationService.on(AutomationEventType.SESSION_STARTED, (data) => {
    console.log('🚀 Session started:', data.sessionId);
  });

  // Progress updates
  automationService.on(AutomationEventType.PROGRESS_UPDATED, (data) => {
    const { progress } = data;
    console.log(`📊 Progress: ${progress.appliedJobs}/${progress.processedJobs} jobs processed`);
    console.log(`   Applied: ${progress.appliedJobs}, Skipped: ${progress.skippedJobs}, Failed: ${progress.failedJobs}`);
  });

  // Intervention required
  automationService.on(AutomationEventType.INTERVENTION_REQUIRED, async (data) => {
    const { sessionId, intervention, debugUrl } = data;
    
    console.log('⚠️ Intervention required!');
    console.log(`Type: ${intervention.type}`);
    console.log(`Message: ${intervention.message}`);
    console.log(`Instructions: ${intervention.instructions}`);
    console.log(`Debug URL: ${debugUrl}`);

    // Handle based on intervention type
    switch (intervention.type) {
      case InterventionType.LOGIN:
        console.log('Please log in to LinkedIn at:', debugUrl);
        // Send email/notification to user
        break;
        
      case InterventionType.CAPTCHA:
        console.log('Please solve the CAPTCHA at:', debugUrl);
        break;
        
      case InterventionType.TWO_FA:
        console.log('Please enter your 2FA code at:', debugUrl);
        break;
        
      case InterventionType.RATE_LIMIT:
        console.log('Rate limit detected. Automation will resume automatically.');
        break;
        
      case InterventionType.BLOCKED:
        console.log('Account appears to be blocked. Please check LinkedIn.');
        break;
    }
  });

  // Session completed
  automationService.on(AutomationEventType.SESSION_COMPLETED, (data) => {
    const { sessionId, progress } = data;
    console.log('✅ Session completed!');
    console.log(`Total jobs processed: ${progress.processedJobs}`);
    console.log(`Successfully applied: ${progress.appliedJobs}`);
  });

  // Errors
  automationService.on(AutomationEventType.ERROR, (data) => {
    console.error('❌ Error occurred:', data.error);
  });

  // Session paused
  automationService.on(AutomationEventType.SESSION_PAUSED, (data) => {
    console.log('⏸️ Session paused:', data.sessionId);
  });

  // Session resumed
  automationService.on(AutomationEventType.SESSION_RESUMED, (data) => {
    console.log('▶️ Session resumed:', data.sessionId);
  });
}

// Example 3: Pause and resume automation
async function pauseResumeExample(sessionId: string) {
  try {
    // Pause the session
    console.log('Pausing session...');
    await automationService.pauseSession(sessionId);
    
    // Do something while paused (e.g., wait for user to handle intervention)
    console.log('Session paused. Waiting 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Resume the session
    console.log('Resuming session...');
    const { debugUrl } = await automationService.resumeSession(sessionId);
    console.log('Session resumed. Debug URL:', debugUrl);
    
  } catch (error) {
    console.error('Error in pause/resume:', error);
  }
}

// Example 4: Monitor progress
async function monitorProgressExample(sessionId: string) {
  const checkInterval = setInterval(async () => {
    try {
      const progress = await automationService.getProgress(sessionId);
      
      console.log('Current Progress:');
      console.log(`- Total jobs found: ${progress.totalJobs}`);
      console.log(`- Jobs processed: ${progress.processedJobs}`);
      console.log(`- Applied: ${progress.appliedJobs}`);
      console.log(`- Skipped: ${progress.skippedJobs}`);
      console.log(`- Failed: ${progress.failedJobs}`);
      console.log(`- Current page: ${progress.currentPage}`);
      
      // Stop monitoring if completed
      if (progress.processedJobs === progress.totalJobs && progress.totalJobs > 0) {
        clearInterval(checkInterval);
        console.log('Automation completed!');
      }
    } catch (error) {
      console.error('Error checking progress:', error);
      clearInterval(checkInterval);
    }
  }, 10000); // Check every 10 seconds
}

// Example 5: Complete workflow with intervention handling
async function completeWorkflowExample(userId: string) {
  // Setup event listeners
  setupEventListeners(automationService);
  
  const config: JobSearchConfig = {
    jobTitle: 'Frontend Developer',
    location: 'Remote',
    datePosted: 'week',
    experienceLevel: ['MID_LEVEL', 'SENIOR_LEVEL'],
    jobType: ['FULL_TIME'],
    remote: true,
    easyApplyOnly: true,
    maxApplications: 20,
    keywords: ['react', 'typescript', 'tailwind']
  };

  try {
    // Start automation
    const { sessionId, debugUrl } = await automationService.startJobSearch(userId, config);
    
    console.log('\n🚀 LinkedIn Job Automation Started');
    console.log('================================');
    console.log('Session ID:', sessionId);
    console.log('Debug URL:', debugUrl);
    console.log('\nSearching for:', config.jobTitle);
    console.log('Location:', config.location);
    console.log('Max applications:', config.maxApplications);
    console.log('\nMonitoring progress...\n');

    // Monitor progress
    await monitorProgressExample(sessionId);

    // Handle intervention scenarios
    automationService.once(AutomationEventType.INTERVENTION_REQUIRED, async (data) => {
      const { intervention } = data;
      
      if (intervention.type === InterventionType.LOGIN) {
        console.log('\n⚠️ Login required!');
        console.log('Please log in to LinkedIn at:', debugUrl);
        console.log('Once logged in, the automation will resume automatically.\n');
        
        // In a real app, you might send an email or push notification here
        // await sendEmailToUser(userId, 'LinkedIn login required', debugUrl);
      }
    });

    // Wait for completion or timeout
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Automation timeout'));
      }, 3600000); // 1 hour timeout

      automationService.once(AutomationEventType.SESSION_COMPLETED, (data) => {
        clearTimeout(timeout);
        resolve(data);
      });

      automationService.once(AutomationEventType.ERROR, (data) => {
        clearTimeout(timeout);
        reject(new Error(data.error));
      });
    });

    console.log('\n✅ Automation completed successfully!');

  } catch (error) {
    console.error('\n❌ Automation failed:', error);
    
    // Cleanup on error
    try {
      await automationService.cleanup();
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }
  }
}

// Example 6: Stop automation
async function stopAutomationExample(sessionId: string) {
  try {
    console.log('Stopping automation...');
    await automationService.stopSession(sessionId, 'User requested stop');
    console.log('Automation stopped successfully');
  } catch (error) {
    console.error('Error stopping automation:', error);
  }
}

// Example 7: Handle multiple users
async function multiUserExample() {
  const users = [
    { id: 'user1', config: { jobTitle: 'Backend Engineer', location: 'New York, NY' } },
    { id: 'user2', config: { jobTitle: 'DevOps Engineer', location: 'Austin, TX' } },
    { id: 'user3', config: { jobTitle: 'Full Stack Developer', location: 'Seattle, WA' } }
  ];

  // Start automation for each user
  const sessions = await Promise.all(
    users.map(async (user) => {
      const config: JobSearchConfig = {
        jobTitle: user.config.jobTitle,
        location: user.config.location,
        datePosted: 'week',
        experienceLevel: ['MID_LEVEL'],
        jobType: ['FULL_TIME'],
        remote: false,
        easyApplyOnly: true,
        maxApplications: 5
      };

      const { sessionId, debugUrl } = await automationService.startJobSearch(user.id, config);
      return { userId: user.id, sessionId, debugUrl };
    })
  );

  console.log('Started automation for all users:');
  sessions.forEach(session => {
    console.log(`- User ${session.userId}: ${session.debugUrl}`);
  });

  // Monitor all sessions
  const monitoringInterval = setInterval(async () => {
    for (const session of sessions) {
      try {
        const progress = await automationService.getProgress(session.sessionId);
        console.log(`User ${session.userId}: ${progress.appliedJobs}/${progress.processedJobs} jobs`);
      } catch (error) {
        console.error(`Error monitoring ${session.userId}:`, error);
      }
    }
  }, 30000); // Check every 30 seconds

  // Cleanup after 1 hour
  setTimeout(async () => {
    clearInterval(monitoringInterval);
    await automationService.cleanup();
  }, 3600000);
}

// Main execution
async function main() {
  const userId = 'test-user-123';

  // Example 1: Basic automation
  await basicJobSearchExample(userId);

  // Example 2: Complete workflow with monitoring
  // await completeWorkflowExample(userId);

  // Example 3: Multi-user automation
  // await multiUserExample();
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

// Export functions for testing
export {
  basicJobSearchExample,
  setupEventListeners,
  pauseResumeExample,
  monitorProgressExample,
  completeWorkflowExample,
  stopAutomationExample,
  multiUserExample
};