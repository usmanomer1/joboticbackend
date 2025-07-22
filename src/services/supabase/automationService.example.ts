/**
 * Example usage of SupabaseAutomationService
 * This demonstrates how to use the service in your LinkedIn automation backend
 */

import { automationService } from './index';
import {
  AutomationStatus,
  InterventionType,
  ApplicationStatus,
  LogLevel,
  JobSearchConfig
} from '../../types/automation.types';

// Example: Starting a new automation session
async function startAutomation(userId: string, browserbaseSessionId: string) {
  try {
    // Define job search configuration
    const config: JobSearchConfig = {
      jobTitle: 'Software Engineer',
      location: 'San Francisco, CA',
      experienceLevel: ['Entry', 'Mid'],
      jobType: ['Full-time'],
      remote: true,
      salary: { min: 100000, max: 150000 },
      targetCount: 50,
      easyApplyOnly: true,
      keywords: ['React', 'Node.js', 'TypeScript'],
      excludeKeywords: ['Senior', 'Lead', 'Principal']
    };

    // Create automation session
    const session = await automationService.createAutomationSession(
      userId,
      browserbaseSessionId,
      config,
      'https://browserbase.com/live/abc123', // Live view URL
      'https://browserbase.com/debug/abc123'  // Debug URL
    );

    console.log('Session created:', session.id);

    // Log the start event
    await automationService.logAutomationEvent(
      session.id,
      LogLevel.INFO,
      'Automation started',
      { config },
      'initialization',
      1
    );

    // Subscribe to session status changes
    const unsubscribe = automationService.subscribeToSessionStatus(
      session.id,
      (newStatus) => {
        console.log('Session status changed:', newStatus);
      }
    );

    return { session, unsubscribe };
  } catch (error) {
    console.error('Failed to start automation:', error);
    throw error;
  }
}

// Example: Handling intervention detection
async function handleInterventionDetected(
  sessionId: string,
  type: InterventionType,
  pageUrl: string
) {
  try {
    // Log the intervention
    const intervention = await automationService.logIntervention(
      sessionId,
      type,
      'https://browserbase.com/live/abc123',
      { 
        url: pageUrl,
        timestamp: Date.now(),
        screenshot: 'base64...' 
      },
      `Please ${type === InterventionType.LOGIN ? 'log in to LinkedIn' : 'complete the CAPTCHA'}`,
      pageUrl
    );

    console.log('Intervention logged:', intervention.id);

    // The session status is automatically updated to INTERVENTION_REQUIRED
    return intervention;
  } catch (error) {
    console.error('Failed to log intervention:', error);
    throw error;
  }
}

// Example: Recording job applications
async function recordJobApplication(
  sessionId: string,
  userId: string,
  jobData: any
) {
  try {
    // Check if already applied
    const alreadyApplied = await automationService.checkIfAlreadyApplied(
      userId,
      jobData.jobId
    );

    if (alreadyApplied) {
      console.log('Already applied to this job');
      return null;
    }

    // Record the application
    const application = await automationService.recordJobApplication(
      sessionId,
      userId,
      {
        job_id: jobData.jobId,
        company: jobData.company,
        title: jobData.title,
        location: jobData.location,
        job_url: jobData.url,
        application_type: jobData.isEasyApply ? 'easy_apply' : 'external'
      },
      ApplicationStatus.SUCCESS,
      undefined,
      { applicationId: jobData.applicationId }
    );

    // Log the event
    await automationService.logAutomationEvent(
      sessionId,
      LogLevel.INFO,
      `Applied to ${jobData.title} at ${jobData.company}`,
      { jobData },
      'application',
      jobData.applicationNumber
    );

    return application;
  } catch (error) {
    if (error.code === 'DUPLICATE_APPLICATION') {
      console.log('Duplicate application detected');
      return null;
    }
    throw error;
  }
}

// Example: Resolving an intervention
async function resolveIntervention(interventionId: string) {
  try {
    const resolved = await automationService.resolveIntervention(
      interventionId,
      {
        resolvedBy: 'user',
        timestamp: Date.now(),
        action: 'manual_login_completed'
      }
    );

    console.log('Intervention resolved, automation resumed');
    return resolved;
  } catch (error) {
    console.error('Failed to resolve intervention:', error);
    throw error;
  }
}

// Example: Getting user statistics
async function getUserStats(userId: string) {
  try {
    // Get active sessions
    const activeSessions = await automationService.getActiveSessionsCount(userId);
    console.log(`Active sessions: ${activeSessions}`);

    // Get unresolved interventions
    const interventions = await automationService.getActiveInterventions(userId);
    console.log(`Unresolved interventions: ${interventions.length}`);

    // Get application statistics
    const stats = await automationService.getUserAutomationStats(userId, 30);
    console.log('Application stats (last 30 days):', stats);

    // Get recent applied jobs
    const { jobs, total } = await automationService.getAppliedJobs(
      userId,
      undefined,
      { page: 1, limit: 10, orderBy: 'applied_at', orderDirection: 'desc' }
    );
    console.log(`Recent applications: ${jobs.length} of ${total}`);

    return { activeSessions, interventions, stats, recentJobs: jobs };
  } catch (error) {
    console.error('Failed to get user stats:', error);
    throw error;
  }
}

// Example: Real-time monitoring
async function setupRealtimeMonitoring(userId: string, sessionId: string) {
  // Subscribe to interventions for the user
  const unsubscribeInterventions = automationService.subscribeToInterventions(
    userId,
    (intervention) => {
      console.log('New intervention detected:', intervention);
      // Notify user via WebSocket or push notification
    }
  );

  // Subscribe to applications for the session
  const unsubscribeApplications = automationService.subscribeToApplications(
    sessionId,
    (application) => {
      console.log('New application submitted:', application);
      // Update UI with new application
    }
  );

  // Return cleanup function
  return () => {
    unsubscribeInterventions();
    unsubscribeApplications();
  };
}

// Example: Complete automation workflow
async function runAutomationWorkflow(userId: string, browserbaseSessionId: string) {
  let cleanup: (() => void) | null = null;

  try {
    // 1. Start automation
    const { session, unsubscribe } = await startAutomation(userId, browserbaseSessionId);
    
    // 2. Set up monitoring
    cleanup = setupRealtimeMonitoring(userId, session.id);

    // 3. Simulate job applications
    for (let i = 0; i < 5; i++) {
      await recordJobApplication(session.id, userId, {
        jobId: `job_${i}`,
        company: `Company ${i}`,
        title: 'Software Engineer',
        location: 'San Francisco, CA',
        url: `https://linkedin.com/jobs/${i}`,
        isEasyApply: true,
        applicationNumber: i + 1
      });

      // Log progress
      await automationService.logAutomationEvent(
        session.id,
        LogLevel.INFO,
        `Progress: ${i + 1}/5 applications submitted`,
        { progress: (i + 1) / 5 * 100 },
        'progress',
        i + 1
      );
    }

    // 4. Complete the session
    await automationService.updateSessionStatus(
      session.id,
      AutomationStatus.COMPLETED
    );

    console.log('Automation completed successfully');
  } catch (error) {
    console.error('Automation workflow failed:', error);
    throw error;
  } finally {
    // Clean up subscriptions
    if (cleanup) cleanup();
    automationService.cleanup();
  }
}

// Export example functions for testing
export {
  startAutomation,
  handleInterventionDetected,
  recordJobApplication,
  resolveIntervention,
  getUserStats,
  setupRealtimeMonitoring,
  runAutomationWorkflow
};