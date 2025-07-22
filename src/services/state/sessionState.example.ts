/**
 * Example usage of SessionStateManager
 * Shows various state management scenarios
 */

import { SessionStateManager, SessionState, PauseState, AutomationProgress } from './sessionStateManager';
import { SupabaseAutomationService } from '../supabase/automationService';
import { SessionStatus, InterventionType } from '../../types/automation.types';

// Initialize the service
const supabaseService = new SupabaseAutomationService();
const stateManager = new SessionStateManager(
  supabaseService,
  process.env.REDIS_URL // Optional: falls back to memory if not provided
);

/**
 * Example 1: Basic session state management
 */
async function sessionStateExample() {
  const sessionId = 'session-123';
  const userId = 'user-456';

  // Save initial session state
  const sessionState: SessionState = {
    sessionId,
    userId,
    status: SessionStatus.RUNNING,
    config: {
      jobTitle: 'Software Engineer',
      location: 'San Francisco, CA',
      easyApplyOnly: true,
      maxApplications: 20
    },
    startedAt: new Date(),
    lastActiveAt: new Date(),
    currentStep: 'searching_jobs',
    stagehandReady: true
  };

  await stateManager.saveSessionState(sessionId, sessionState);
  console.log('Session state saved');

  // Retrieve session state
  const retrieved = await stateManager.getSessionState(sessionId);
  console.log('Retrieved state:', retrieved);

  // Update session state
  await stateManager.updateSessionState(sessionId, {
    currentStep: 'applying_to_jobs',
    status: SessionStatus.RUNNING
  });

  // Delete session state when done
  await stateManager.deleteSessionState(sessionId);
}

/**
 * Example 2: Handling pause/resume with intervention
 */
async function pauseResumeExample() {
  const sessionId = 'session-789';

  // Save pause state when intervention detected
  const pauseState: PauseState = {
    pausedAt: new Date(),
    reason: InterventionType.LOGIN,
    currentUrl: 'https://www.linkedin.com/login',
    pageContext: {
      title: 'LinkedIn Login',
      hasLoginForm: true
    },
    resumeData: {
      lastProcessedJobIndex: 5,
      currentSearchPage: 2
    }
  };

  await stateManager.savePauseState(sessionId, pauseState);
  console.log('Session paused due to login required');

  // Later, when resuming
  const savedPauseState = await stateManager.getPauseState(sessionId);
  if (savedPauseState) {
    console.log('Resuming from:', savedPauseState.resumeData);
    
    // Clear pause state after successful resume
    await stateManager.clearPauseState(sessionId);
  }
}

/**
 * Example 3: Progress tracking
 */
async function progressTrackingExample() {
  const sessionId = 'session-progress-123';

  // Initialize progress
  const initialProgress: AutomationProgress = {
    totalJobs: 50,
    processedJobs: 0,
    appliedJobs: 0,
    skippedJobs: 0,
    failedJobs: 0,
    currentPage: 1,
    estimatedRemaining: 50
  };

  await stateManager.saveProgress(sessionId, initialProgress);

  // Simulate job processing
  for (let i = 0; i < 10; i++) {
    // Process a job
    await stateManager.incrementProgress(sessionId, 'processedJobs');

    // Randomly apply, skip, or fail
    const outcome = Math.random();
    if (outcome < 0.6) {
      await stateManager.incrementProgress(sessionId, 'appliedJobs');
    } else if (outcome < 0.9) {
      await stateManager.incrementProgress(sessionId, 'skippedJobs');
    } else {
      await stateManager.incrementProgress(sessionId, 'failedJobs');
    }
  }

  // Get final progress
  const finalProgress = await stateManager.getProgress(sessionId);
  console.log('Final progress:', finalProgress);
}

/**
 * Example 4: User session management
 */
async function userSessionManagementExample() {
  const userId = 'user-multi-session';

  // Track multiple sessions for a user
  await stateManager.trackUserSession(userId, 'session-1');
  await stateManager.trackUserSession(userId, 'session-2');
  await stateManager.trackUserSession(userId, 'session-3');

  // Get all user sessions
  const userSessions = await stateManager.getUserSessions(userId);
  console.log('User sessions:', userSessions);

  // Get active session count
  const activeCount = await stateManager.getUserActiveSessionCount(userId);
  console.log('Active sessions:', activeCount);

  // Remove a session
  await stateManager.removeUserSession(userId, 'session-2');
  
  const updatedSessions = await stateManager.getUserSessions(userId);
  console.log('Updated sessions:', updatedSessions);
}

/**
 * Example 5: Duplicate job application prevention
 */
async function duplicatePreventionExample() {
  const userId = 'user-job-tracker';
  const jobIds = ['job-1', 'job-2', 'job-3'];

  // Mark jobs as applied
  for (const jobId of jobIds) {
    await stateManager.markJobAsApplied(userId, jobId);
    console.log(`Marked ${jobId} as applied`);
  }

  // Check if already applied
  const hasApplied1 = await stateManager.hasAppliedToJob(userId, 'job-1');
  const hasApplied4 = await stateManager.hasAppliedToJob(userId, 'job-4');
  
  console.log('Has applied to job-1:', hasApplied1); // true
  console.log('Has applied to job-4:', hasApplied4); // false

  // Get recently applied jobs
  const recentJobs = await stateManager.getRecentlyAppliedJobs(userId, 10);
  console.log('Recently applied jobs:', recentJobs);
}

/**
 * Example 6: Session locking for concurrent operations
 */
async function sessionLockingExample() {
  const sessionId = 'session-concurrent';

  // Try to acquire lock
  const lockAcquired = await stateManager.acquireSessionLock(sessionId);
  console.log('Lock acquired:', lockAcquired);

  if (lockAcquired) {
    // Perform critical operation
    console.log('Performing critical operation...');
    
    // Check if locked
    const isLocked = await stateManager.isSessionLocked(sessionId);
    console.log('Session is locked:', isLocked);

    // Simulate another process trying to acquire lock
    const secondLockAttempt = await stateManager.acquireSessionLock(sessionId);
    console.log('Second lock attempt:', secondLockAttempt); // false

    // Release lock when done
    await stateManager.releaseSessionLock(sessionId);
    console.log('Lock released');
  }
}

/**
 * Example 7: Complete automation workflow with state management
 */
async function completeWorkflowExample() {
  const sessionId = 'session-workflow';
  const userId = 'user-workflow';

  try {
    // 1. Initialize session
    const sessionState: SessionState = {
      sessionId,
      userId,
      status: SessionStatus.PENDING,
      config: {
        jobTitle: 'Full Stack Developer',
        location: 'Remote',
        easyApplyOnly: true,
        maxApplications: 30
      },
      startedAt: new Date(),
      lastActiveAt: new Date(),
      stagehandReady: false
    };

    await stateManager.saveSessionState(sessionId, sessionState);
    await stateManager.trackUserSession(userId, sessionId);

    // 2. Start automation
    await stateManager.updateSessionState(sessionId, {
      status: SessionStatus.RUNNING,
      stagehandReady: true,
      currentStep: 'navigating_to_linkedin'
    });

    // 3. Initialize progress
    await stateManager.saveProgress(sessionId, {
      totalJobs: 0,
      processedJobs: 0,
      appliedJobs: 0,
      skippedJobs: 0,
      failedJobs: 0,
      currentPage: 1
    });

    // 4. Simulate job processing
    for (let page = 1; page <= 3; page++) {
      await stateManager.updateSessionState(sessionId, {
        currentStep: `processing_page_${page}`
      });

      // Process 10 jobs per page
      for (let job = 1; job <= 10; job++) {
        const jobId = `job-${page}-${job}`;
        
        // Check if already applied
        const alreadyApplied = await stateManager.hasAppliedToJob(userId, jobId);
        
        if (!alreadyApplied) {
          await stateManager.incrementProgress(sessionId, 'processedJobs');
          
          // Simulate application
          if (Math.random() < 0.7) {
            await stateManager.incrementProgress(sessionId, 'appliedJobs');
            await stateManager.markJobAsApplied(userId, jobId);
          } else {
            await stateManager.incrementProgress(sessionId, 'skippedJobs');
          }
        }
      }

      // Update progress
      const currentProgress = await stateManager.getProgress(sessionId);
      console.log(`Page ${page} complete:`, currentProgress);
    }

    // 5. Complete session
    await stateManager.updateSessionState(sessionId, {
      status: SessionStatus.COMPLETED,
      currentStep: 'completed'
    });

    // 6. Get final stats
    const finalState = await stateManager.getSessionState(sessionId);
    const finalProgress = await stateManager.getProgress(sessionId);
    const appliedJobs = await stateManager.getRecentlyAppliedJobs(userId, 50);

    console.log('Final state:', finalState);
    console.log('Final progress:', finalProgress);
    console.log('Applied to jobs:', appliedJobs.length);

  } catch (error) {
    console.error('Workflow error:', error);
    
    // Update session to failed state
    await stateManager.updateSessionState(sessionId, {
      status: SessionStatus.FAILED
    });
  }
}

/**
 * Example 8: Cleanup operations
 */
async function cleanupExample() {
  // Clean up expired sessions (older than 24 hours)
  const cleanedCount = await stateManager.cleanupExpiredStates(24);
  console.log(`Cleaned up ${cleanedCount} expired sessions`);

  // Clean up all data for a specific user
  const userId = 'user-to-cleanup';
  await stateManager.cleanupUserData(userId);
  console.log(`Cleaned up all data for user ${userId}`);
}

/**
 * Example 9: Handling Redis failures gracefully
 */
async function failureHandlingExample() {
  const sessionId = 'session-failure-test';
  
  // Even if Redis is down, operations should work with memory fallback
  try {
    const state: SessionState = {
      sessionId,
      userId: 'test-user',
      status: SessionStatus.RUNNING,
      config: { jobTitle: 'Engineer', location: 'NYC' },
      startedAt: new Date(),
      lastActiveAt: new Date(),
      stagehandReady: true
    };

    // These operations will use memory if Redis fails
    await stateManager.saveSessionState(sessionId, state);
    const retrieved = await stateManager.getSessionState(sessionId);
    
    console.log('State saved and retrieved successfully:', retrieved !== null);
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

/**
 * Example 10: Performance testing with concurrent operations
 */
async function performanceTestExample() {
  const startTime = Date.now();
  const operations = [];

  // Simulate 100 concurrent operations
  for (let i = 0; i < 100; i++) {
    const sessionId = `perf-session-${i}`;
    const userId = `perf-user-${i % 10}`; // 10 users
    
    operations.push(
      stateManager.saveSessionState(sessionId, {
        sessionId,
        userId,
        status: SessionStatus.RUNNING,
        config: { jobTitle: 'Test', location: 'Test' },
        startedAt: new Date(),
        lastActiveAt: new Date(),
        stagehandReady: true
      }),
      stateManager.trackUserSession(userId, sessionId),
      stateManager.incrementProgress(sessionId, 'processedJobs')
    );
  }

  await Promise.all(operations);
  
  const duration = Date.now() - startTime;
  console.log(`Completed 300 operations in ${duration}ms`);
  console.log(`Average: ${(duration / 300).toFixed(2)}ms per operation`);
}

// Export examples
export {
  sessionStateExample,
  pauseResumeExample,
  progressTrackingExample,
  userSessionManagementExample,
  duplicatePreventionExample,
  sessionLockingExample,
  completeWorkflowExample,
  cleanupExample,
  failureHandlingExample,
  performanceTestExample
};