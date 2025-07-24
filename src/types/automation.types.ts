// LinkedIn Automation Types and Enums

export enum AutomationStatus {
  RUNNING = 'running',
  PAUSED = 'paused',
  INTERVENTION_REQUIRED = 'intervention_required',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum SessionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired'
}

export enum InterventionType {
  LOGIN = 'login',
  CAPTCHA = 'captcha',
  TWO_FA = 'two_fa',
  BLOCKED = 'blocked',
  RATE_LIMIT = 'rate_limit',
  ACCOUNT_CREATION = 'account_creation'
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

export enum AutomationEventType {
  SESSION_STARTED = 'session:started',
  SESSION_PAUSED = 'session:paused',
  SESSION_RESUMED = 'session:resumed',
  SESSION_STOPPED = 'session:stopped',
  SESSION_COMPLETED = 'session:completed',
  PROGRESS_UPDATED = 'progress:updated',
  INTERVENTION_REQUIRED = 'intervention:required',
  ERROR = 'error'
}

export interface JobSearchConfig {
  // Natural language search option
  searchPrompt?: string;
  
  // Traditional search fields (optional when using searchPrompt)
  jobTitle?: string;
  location?: string;
  experienceLevel?: string[];
  jobType?: string[];
  remote?: boolean;
  salary?: {
    min?: number;
    max?: number;
  };
  targetCount?: number;
  maxApplications?: number;  // Maximum number of applications to submit
  easyApplyOnly?: boolean;
  keywords?: string[];
  excludeKeywords?: string[];
  
  // Filters for job search
  filters?: {
    datePosted?: 'day' | 'week' | 'month';
    jobType?: string[];
    remote?: boolean;
    easyApplyOnly?: boolean;
    keywords?: string[];
  };
  datePosted?: 'day' | 'week' | 'month';  // When the job was posted
  
  // Resume handling
  resumeUrl?: string;  // Supabase Storage URL
  resumeMetadata?: {
    fileName: string;
    fileType: string;
    extractedText?: string;  // Pre-extracted text for form filling
  };
  
  // External application config
  externalApplicationConfig?: {
    autoCreateAccount?: boolean;
    defaultEmail?: string;
    defaultPassword?: string;
    pauseOnAccountCreation?: boolean;
  };
  
  // Context configuration for persistent authentication
  useContext?: boolean;
  createNewContext?: boolean;
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

export interface JobDetails {
  jobId: string;
  companyName: string;
  jobTitle: string;
  location: string;
  jobUrl: string;
  isEasyApply: boolean;
  jobDescription?: string;
  requirements?: string[];
  salary?: string;
  postedDate?: string;
}

export interface AppliedJob extends JobApplication {
  id: string;
  session_id: string;
  user_id: string;
  applied_at: Date;
  application_status: ApplicationStatus;
  error_message?: string;
  response_data?: any;
  job_details?: JobDetails;
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