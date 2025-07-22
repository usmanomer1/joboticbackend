import { Socket } from 'socket.io';

// Socket event types
export enum RealtimeEventType {
  // Client -> Server
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  GET_STATUS = 'get_status',
  
  // Server -> Client
  CONNECTED = 'connected',
  SUBSCRIBED = 'subscribed',
  UNSUBSCRIBED = 'unsubscribed',
  SESSION_UPDATE = 'session_update',
  INTERVENTION_REQUIRED = 'intervention_required',
  PROGRESS_UPDATE = 'progress_update',
  JOB_APPLIED = 'job_applied',
  STEP_UPDATE = 'step_update',
  STATUS_UPDATE = 'status_update',
  SESSION_STATUS_CHANGED = 'session_status_changed',
  INTERVENTION_ALERT = 'intervention_alert',
  PROGRESS_SUMMARY = 'progress_summary',
  CRITICAL_ERROR = 'critical_error',
  ERROR = 'error',
  LOG = 'log'
}

// Room types
export enum RoomType {
  USER = 'user',         // user:{userId}
  SESSION = 'session',   // session:{sessionId}
  GLOBAL = 'global'      // global:{userId}
}

// Client request types
export interface SubscribeRequest {
  sessionId: string;
}

export interface UnsubscribeRequest {
  sessionId: string;
}

export interface GetStatusRequest {
  sessionId: string;
}

// Server response types
export interface ConnectedResponse {
  userId: string;
  timestamp: string;
}

export interface SubscribedResponse {
  sessionId: string;
  timestamp: string;
}

export interface UnsubscribedResponse {
  sessionId: string;
  timestamp: string;
}

export interface SessionUpdateEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  sessionId: string;
  status?: string;
  previousStatus?: string;
  updatedAt?: string;
  details: {
    progress?: any;
    jobSearchConfig?: any;
  };
}

export interface InterventionRequiredEvent {
  sessionId: string;
  type: string;
  message: string;
  liveViewUrl: string;
  context?: any;
  timestamp: string;
}

export interface ProgressUpdateEvent {
  sessionId: string;
  progress: {
    totalJobs: number;
    processedJobs: number;
    appliedJobs: number;
    skippedJobs: number;
    failedJobs: number;
    currentPage: number;
    percentage: number;
  };
  timestamp: string;
}

export interface JobAppliedEvent {
  sessionId: string;
  jobTitle: string;
  companyName: string;
  appliedAt: string;
  details: {
    jobId?: string;
    location?: string;
  };
}

export interface StepUpdateEvent {
  sessionId: string;
  currentStep: string;
  details?: any;
  timestamp: string;
}

export interface StatusUpdateEvent {
  sessionId: string;
  status: string;
  progress: {
    totalJobs: number;
    processedJobs: number;
    appliedJobs: number;
    skippedJobs: number;
    failedJobs: number;
    currentPage: number;
    percentage: number;
  };
  intervention?: {
    type: string;
    message: string;
    liveViewUrl: string;
  } | null;
  startedAt: string;
  updatedAt: string;
}

export interface ErrorEvent {
  code: string;
  message: string;
  details?: any;
}

export interface LogEvent {
  sessionId: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  eventType: string;
  details?: any;
  timestamp: string;
}

// Extended Socket interface with user data
export interface AuthenticatedSocket extends Socket {
  data: {
    userId?: string;
    sessionIds?: string[];
    authenticated?: boolean;
  };
}

// Rate limiting
export interface RateLimitInfo {
  subscriptions: number;
  lastReset: Date;
  windowStart: Date;
}

// Client SDK types for frontend usage
export interface RealtimeClient {
  connect(token: string): Promise<void>;
  disconnect(): void;
  subscribe(sessionId: string): Promise<void>;
  unsubscribe(sessionId: string): Promise<void>;
  getStatus(sessionId: string): Promise<void>;
  on(event: RealtimeEventType, handler: (data: any) => void): void;
  off(event: RealtimeEventType, handler?: (data: any) => void): void;
}