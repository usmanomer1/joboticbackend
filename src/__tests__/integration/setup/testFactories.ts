import { v4 as uuidv4 } from 'uuid';
import { 
  AutomationSession, 
  JobSearchConfig, 
  SessionStatus,
  InterventionType,
  JobApplication
} from '../../../types/automation.types';

/**
 * Test data factory functions
 */

export function createTestUser(overrides: Partial<any> = {}) {
  return {
    id: uuidv4(),
    email: `test-${uuidv4()}@example.com`,
    password: 'test-password-123',
    ...overrides
  };
}

export function createTestSession(userId: string, overrides: Partial<AutomationSession> = {}): Partial<AutomationSession> {
  const sessionId = uuidv4();
  return {
    id: sessionId,
    user_id: userId,
    status: SessionStatus.PENDING,
    job_search_config: createTestJobConfig(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    browserbase_session_id: `bb-${sessionId}`,
    ...overrides
  };
}

export function createTestJobConfig(overrides: Partial<JobSearchConfig> = {}): JobSearchConfig {
  return {
    jobTitle: 'Software Engineer',
    location: 'San Francisco, CA',
    datePosted: 'week',
    experienceLevel: ['MID_LEVEL'],
    jobType: ['FULL_TIME'],
    remote: false,
    easyApplyOnly: true,
    maxApplications: 10,
    keywords: ['typescript', 'react'],
    ...overrides
  };
}

export function createTestIntervention(sessionId: string, overrides: Partial<any> = {}) {
  return {
    id: uuidv4(),
    session_id: sessionId,
    type: InterventionType.LOGIN,
    debug_url: `https://browserbase.com/debug/${uuidv4()}`,
    message: 'LinkedIn login required',
    context: { url: 'https://www.linkedin.com/login' },
    resolved: false,
    created_at: new Date().toISOString(),
    ...overrides
  };
}

export function createTestJobApplication(sessionId: string, overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id: uuidv4(),
    session_id: sessionId,
    job_id: `job-${uuidv4()}`,
    job_title: 'Senior Software Engineer',
    company_name: 'Test Company Inc',
    location: 'San Francisco, CA',
    job_description: 'We are looking for a talented engineer...',
    status: 'applied',
    applied_at: new Date().toISOString(),
    ...overrides
  };
}

export function createTestLog(sessionId: string, eventType: string, overrides: Partial<any> = {}) {
  return {
    id: uuidv4(),
    session_id: sessionId,
    event_type: eventType,
    details: {},
    message: `Test log: ${eventType}`,
    created_at: new Date().toISOString(),
    ...overrides
  };
}

export function createTestApiLog(userId: string, endpoint: string, overrides: Partial<any> = {}) {
  return {
    id: uuidv4(),
    user_id: userId,
    endpoint,
    method: 'POST',
    request_body: {},
    timestamp: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Batch creation helpers
 */

export function createTestSessions(userId: string, count: number): Partial<AutomationSession>[] {
  return Array.from({ length: count }, () => createTestSession(userId));
}

export function createTestJobApplications(sessionId: string, count: number): JobApplication[] {
  return Array.from({ length: count }, (_, index) => 
    createTestJobApplication(sessionId, {
      job_id: `job-${index + 1}`,
      job_title: `Job Title ${index + 1}`,
      company_name: `Company ${index + 1}`
    })
  );
}

/**
 * Mock data generators
 */

export function generateMockJobListing(index: number = 1) {
  return {
    id: `job-listing-${index}`,
    title: `Software Engineer ${index}`,
    company: `Tech Company ${index}`,
    location: 'San Francisco, CA',
    isEasyApply: true,
    description: 'Join our amazing team...',
    postedDate: new Date().toISOString()
  };
}

export function generateMockJobListings(count: number) {
  return Array.from({ length: count }, (_, i) => generateMockJobListing(i + 1));
}

/**
 * WebSocket event generators
 */

export function createProgressUpdateEvent(sessionId: string, progress: Partial<any> = {}) {
  return {
    sessionId,
    progress: {
      totalJobs: 50,
      processedJobs: 10,
      appliedJobs: 7,
      skippedJobs: 3,
      failedJobs: 0,
      currentPage: 1,
      percentage: 14,
      ...progress
    },
    timestamp: new Date().toISOString()
  };
}

export function createInterventionEvent(sessionId: string, type: InterventionType = InterventionType.LOGIN) {
  return {
    sessionId,
    type,
    message: `${type} intervention required`,
    liveViewUrl: `https://browserbase.com/debug/${uuidv4()}`,
    context: { url: 'https://www.linkedin.com' },
    timestamp: new Date().toISOString()
  };
}

/**
 * API request/response generators
 */

export function createStartAutomationRequest(userId: string, config?: Partial<JobSearchConfig>) {
  return {
    userId,
    config: createTestJobConfig(config)
  };
}

export function createStartAutomationResponse(sessionId: string = uuidv4()) {
  return {
    sessionId,
    liveViewUrl: `https://browserbase.com/debug/${uuidv4()}`,
    status: 'running',
    taskId: `task_${uuidv4()}`
  };
}

export function createStatusResponse(sessionId: string, overrides: Partial<any> = {}) {
  return {
    status: 'running',
    progress: {
      totalJobs: 0,
      processedJobs: 0,
      appliedJobs: 0,
      skippedJobs: 0,
      failedJobs: 0,
      currentPage: 1
    },
    currentStep: 'initializing',
    ...overrides
  };
}