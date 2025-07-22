// LinkedIn Automation Types and Enums

export enum AutomationStatus {
  RUNNING = 'running',
  PAUSED = 'paused',
  INTERVENTION_REQUIRED = 'intervention_required',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum InterventionType {
  LOGIN = 'login',
  CAPTCHA = 'captcha',
  TWO_FA = 'two_fa',
  BLOCKED = 'blocked',
  RATE_LIMIT = 'rate_limit'
}

export enum ApplicationStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  ALREADY_APPLIED = 'already_applied'
}

export enum LogLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error'
}

export interface JobSearchConfig {
  jobTitle: string;
  location: string;
  experienceLevel?: string[];
  jobType?: string[];
  remote?: boolean;
  salary?: {
    min?: number;
    max?: number;
  };
  targetCount?: number;
  easyApplyOnly?: boolean;
  keywords?: string[];
  excludeKeywords?: string[];
}

export interface AutomationSession {
  id: string;
  user_id: string;
  browserbase_session_id: string;
  browserbase_context_id: string;
  status: AutomationStatus;
  config: JobSearchConfig;
  job_title?: string;
  location?: string;
  target_count: number;
  applications_submitted: number;
  live_view_url?: string;
  debug_url?: string;
  started_at: Date;
  completed_at?: Date;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AutomationIntervention {
  id: string;
  session_id: string;
  type: InterventionType;
  detected_at: Date;
  resolved_at?: Date;
  live_view_url: string;
  message?: string;
  page_url?: string;
  page_state?: any;
  resolution_data?: any;
  created_at: Date;
}

export interface JobApplication {
  job_id: string;
  company: string;
  title: string;
  location?: string;
  job_url?: string;
  application_type?: 'easy_apply' | 'external';
}

export interface AppliedJob extends JobApplication {
  id: string;
  session_id: string;
  user_id: string;
  applied_at: Date;
  application_status: ApplicationStatus;
  error_message?: string;
  response_data?: any;
  created_at: Date;
}

export interface AutomationLog {
  id: string;
  session_id: string;
  level: LogLevel;
  message: string;
  metadata?: any;
  step_name?: string;
  step_number?: number;
  created_at: Date;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export interface UserAutomationStats {
  total_applications: number;
  successful_applications: number;
  failed_applications: number;
  companies_applied: number;
  avg_per_day: number;
}

export interface ActiveSessionInfo {
  session_id: string;
  browserbase_session_id: string;
  status: AutomationStatus;
  job_title?: string;
  location?: string;
  applications_submitted: number;
  started_at: Date;
  live_view_url?: string;
}

export interface UnresolvedIntervention {
  intervention_id: string;
  session_id: string;
  type: InterventionType;
  detected_at: Date;
  live_view_url: string;
  message?: string;
  job_title?: string;
}

// Error types
export class AutomationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AutomationError';
  }
}

export class SessionNotFoundError extends AutomationError {
  constructor(sessionId: string) {
    super(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND', { sessionId });
  }
}

export class DuplicateApplicationError extends AutomationError {
  constructor(jobId: string, userId: string) {
    super(`Already applied to job ${jobId}`, 'DUPLICATE_APPLICATION', { jobId, userId });
  }
}

export class InvalidStateTransitionError extends AutomationError {
  constructor(from: AutomationStatus, to: AutomationStatus) {
    super(`Invalid state transition from ${from} to ${to}`, 'INVALID_STATE_TRANSITION', { from, to });
  }
}