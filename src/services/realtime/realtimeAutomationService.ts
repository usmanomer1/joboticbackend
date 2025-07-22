import { Server, Socket } from 'socket.io';
import { createServer } from 'http';
import { SupabaseClient, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { 
  SessionStatus,
  InterventionType,
  AutomationEventType 
} from '../../types/automation.types';

// Type definitions
interface ProgressUpdate {
  totalJobs: number;
  processedJobs: number;
  appliedJobs: number;
  skippedJobs: number;
  failedJobs: number;
  currentPage: number;
  percentage: number;
}

interface ErrorInfo {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
}

interface SocketData {
  userId?: string;
  sessionIds?: string[];
  authenticated?: boolean;
}

interface AuthenticatedSocket extends Socket {
  data: SocketData;
}

// Rate limiting interface
interface RateLimitInfo {
  subscriptions: number;
  lastReset: Date;
  windowStart: Date;
}

export class RealtimeAutomationService {
  private io: Server;
  private supabase: SupabaseClient;
  private channels: Map<string, RealtimeChannel> = new Map();
  private userSessions: Map<string, Set<string>> = new Map();
  private userRateLimits: Map<string, RateLimitInfo> = new Map();
  
  // Configuration
  private readonly MAX_SUBSCRIPTIONS_PER_USER = 10;
  private readonly RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
  private readonly HEARTBEAT_INTERVAL = 25000; // 25 seconds

  constructor(httpServer: any, supabaseUrl: string, supabaseKey: string) {
    // Initialize Socket.io with CORS
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || '*',
        methods: ['GET', 'POST'],
        credentials: true
      },
      pingInterval: this.HEARTBEAT_INTERVAL,
      pingTimeout: 60000,
      transports: ['websocket', 'polling']
    });

    // Initialize Supabase client
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    console.log('Initializing Realtime Automation Service...');
    
    // Setup Socket.io middleware and handlers
    this.setupSocketMiddleware();
    this.setupSocketHandlers();
    
    // Setup Supabase Realtime subscriptions
    await this.setupDatabaseSubscriptions();
    
    console.log('Realtime Automation Service initialized');
  }

  /**
   * Setup Socket.io middleware
   */
  private setupSocketMiddleware(): void {
    // Authentication middleware
    this.io.use(async (socket: Socket, next) => {
      await this.authenticateSocket(socket, next);
    });

    // Rate limiting middleware
    this.io.use(async (socket: Socket, next) => {
      const userId = (socket as AuthenticatedSocket).data?.userId;
      if (!userId) {
        return next();
      }

      const rateLimit = this.getUserRateLimit(userId);
      if (rateLimit.subscriptions >= this.MAX_SUBSCRIPTIONS_PER_USER) {
        return next(new Error('Subscription limit exceeded'));
      }

      next();
    });
  }

  /**
   * Setup Socket.io event handlers
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', async (socket: Socket) => {
      await this.handleConnection(socket as AuthenticatedSocket);
    });
  }

  /**
   * Authenticate socket connection
   */
  private async authenticateSocket(socket: Socket, next: Function): Promise<void> {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Verify JWT with Supabase
      const { data: { user }, error } = await this.supabase.auth.getUser(token);
      
      if (error || !user) {
        return next(new Error('Invalid authentication token'));
      }

      // Attach user data to socket
      (socket as AuthenticatedSocket).data = {
        userId: user.id,
        sessionIds: [],
        authenticated: true
      };

      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  }

  /**
   * Handle new socket connection
   */
  private async handleConnection(socket: AuthenticatedSocket): Promise<void> {
    const userId = socket.data.userId!;
    
    console.log(`User ${userId} connected via Socket.io`);

    // Join user's global room
    socket.join(`global:${userId}`);
    
    // Initialize user session tracking
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }

    // Setup event handlers
    socket.on('subscribe', async (data) => {
      await this.handleSubscribe(socket, data);
    });

    socket.on('unsubscribe', async (data) => {
      await this.handleUnsubscribe(socket, data);
    });

    socket.on('get_status', async (data) => {
      await this.handleGetStatus(socket, data);
    });

    socket.on('disconnect', async () => {
      await this.handleDisconnection(socket);
    });

    // Send connection acknowledgment
    socket.emit('connected', {
      userId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle socket disconnection
   */
  private async handleDisconnection(socket: AuthenticatedSocket): Promise<void> {
    const userId = socket.data.userId!;
    const sessionIds = socket.data.sessionIds || [];

    console.log(`User ${userId} disconnected`);

    // Leave all session rooms
    for (const sessionId of sessionIds) {
      socket.leave(`session:${sessionId}`);
      socket.leave(`user:${userId}`);
    }

    // Clean up user sessions if no more connections
    const userSockets = await this.io.in(`global:${userId}`).fetchSockets();
    if (userSockets.length === 0) {
      this.userSessions.delete(userId);
      this.userRateLimits.delete(userId);
    }
  }

  /**
   * Handle session subscription
   */
  private async handleSubscribe(socket: AuthenticatedSocket, data: { sessionId: string }): Promise<void> {
    try {
      const { sessionId } = data;
      const userId = socket.data.userId!;

      // Verify session ownership
      const isOwner = await this.verifySessionOwnership(userId, sessionId);
      if (!isOwner) {
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: 'You do not have access to this session'
        });
        return;
      }

      // Check rate limit
      const rateLimit = this.getUserRateLimit(userId);
      if (rateLimit.subscriptions >= this.MAX_SUBSCRIPTIONS_PER_USER) {
        socket.emit('error', {
          code: 'RATE_LIMIT',
          message: 'Subscription limit exceeded'
        });
        return;
      }

      // Join session rooms
      socket.join(`session:${sessionId}`);
      socket.join(`user:${userId}`);
      
      // Track session subscription
      socket.data.sessionIds = socket.data.sessionIds || [];
      socket.data.sessionIds.push(sessionId);
      
      const userSessions = this.userSessions.get(userId) || new Set();
      userSessions.add(sessionId);
      this.userSessions.set(userId, userSessions);

      // Update rate limit
      rateLimit.subscriptions++;

      // Send current session status
      await this.sendSessionStatus(socket, sessionId);

      socket.emit('subscribed', {
        sessionId,
        timestamp: new Date().toISOString()
      });

      console.log(`User ${userId} subscribed to session ${sessionId}`);
    } catch (error) {
      console.error('Subscribe error:', error);
      socket.emit('error', {
        code: 'SUBSCRIPTION_ERROR',
        message: 'Failed to subscribe to session'
      });
    }
  }

  /**
   * Handle session unsubscription
   */
  private async handleUnsubscribe(socket: AuthenticatedSocket, data: { sessionId: string }): Promise<void> {
    try {
      const { sessionId } = data;
      const userId = socket.data.userId!;

      // Leave session room
      socket.leave(`session:${sessionId}`);
      
      // Update tracking
      socket.data.sessionIds = socket.data.sessionIds?.filter(id => id !== sessionId) || [];
      
      const userSessions = this.userSessions.get(userId);
      if (userSessions) {
        userSessions.delete(sessionId);
      }

      // Update rate limit
      const rateLimit = this.getUserRateLimit(userId);
      rateLimit.subscriptions = Math.max(0, rateLimit.subscriptions - 1);

      socket.emit('unsubscribed', {
        sessionId,
        timestamp: new Date().toISOString()
      });

      console.log(`User ${userId} unsubscribed from session ${sessionId}`);
    } catch (error) {
      console.error('Unsubscribe error:', error);
    }
  }

  /**
   * Handle get status request
   */
  private async handleGetStatus(socket: AuthenticatedSocket, data: { sessionId: string }): Promise<void> {
    try {
      const { sessionId } = data;
      const userId = socket.data.userId!;

      // Verify ownership
      const isOwner = await this.verifySessionOwnership(userId, sessionId);
      if (!isOwner) {
        socket.emit('error', {
          code: 'FORBIDDEN',
          message: 'You do not have access to this session'
        });
        return;
      }

      await this.sendSessionStatus(socket, sessionId);
    } catch (error) {
      console.error('Get status error:', error);
      socket.emit('error', {
        code: 'STATUS_ERROR',
        message: 'Failed to get session status'
      });
    }
  }

  /**
   * Setup Supabase Realtime subscriptions
   */
  private async setupDatabaseSubscriptions(): Promise<void> {
    console.log('Setting up Supabase Realtime subscriptions...');

    // Subscribe to session changes
    this.subscribeToSessionChanges();
    
    // Subscribe to intervention alerts
    this.subscribeToInterventions();
    
    // Subscribe to job applications
    this.subscribeToApplications();
    
    // Subscribe to automation logs
    this.subscribeToLogs();
  }

  /**
   * Subscribe to automation_sessions table changes
   */
  private subscribeToSessionChanges(): void {
    const channel = this.supabase
      .channel('session-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'automation_sessions'
        },
        (payload) => this.handleSessionUpdate(payload)
      )
      .subscribe((status) => {
        console.log('Session updates subscription status:', status);
      });

    this.channels.set('session-updates', channel);
  }

  /**
   * Subscribe to automation_interventions inserts
   */
  private subscribeToInterventions(): void {
    const channel = this.supabase
      .channel('intervention-alerts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'automation_interventions'
        },
        (payload) => this.handleNewIntervention(payload)
      )
      .subscribe((status) => {
        console.log('Intervention alerts subscription status:', status);
      });

    this.channels.set('intervention-alerts', channel);
  }

  /**
   * Subscribe to applied_jobs inserts
   */
  private subscribeToApplications(): void {
    const channel = this.supabase
      .channel('job-applications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'applied_jobs'
        },
        (payload) => this.handleNewApplication(payload)
      )
      .subscribe((status) => {
        console.log('Job applications subscription status:', status);
      });

    this.channels.set('job-applications', channel);
  }

  /**
   * Subscribe to automation_logs inserts (important events only)
   */
  private subscribeToLogs(): void {
    const channel = this.supabase
      .channel('automation-logs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'automation_logs',
          filter: `event_type=in.(session_started,session_completed,intervention_detected,job_applied,automation_error)`
        },
        (payload) => this.handleNewLog(payload)
      )
      .subscribe((status) => {
        console.log('Automation logs subscription status:', status);
      });

    this.channels.set('automation-logs', channel);
  }

  /**
   * Handle session update from database
   */
  private handleSessionUpdate(payload: RealtimePostgresChangesPayload<any>): void {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    const sessionId = newRecord?.id || oldRecord?.id;

    if (!sessionId) return;

    console.log(`Session update: ${eventType} for session ${sessionId}`);

    // Emit to session room
    this.io.to(`session:${sessionId}`).emit('session_update', {
      eventType,
      sessionId,
      status: newRecord?.status,
      previousStatus: oldRecord?.status,
      updatedAt: newRecord?.updated_at,
      details: {
        progress: newRecord?.progress,
        jobSearchConfig: newRecord?.job_search_config
      }
    });

    // Also emit to user room if status changed significantly
    if (newRecord?.status !== oldRecord?.status) {
      const userId = newRecord?.user_id || oldRecord?.user_id;
      if (userId) {
        this.io.to(`user:${userId}`).emit('session_status_changed', {
          sessionId,
          status: newRecord?.status,
          previousStatus: oldRecord?.status
        });
      }
    }
  }

  /**
   * Handle new intervention from database
   */
  private handleNewIntervention(payload: RealtimePostgresChangesPayload<any>): void {
    const intervention = payload.new;
    if (!intervention) return;

    const { session_id, type, debug_url, message, context } = intervention;

    console.log(`New intervention: ${type} for session ${session_id}`);

    // Emit to session room
    this.io.to(`session:${session_id}`).emit('intervention_required', {
      sessionId: session_id,
      type,
      message,
      liveViewUrl: debug_url,
      context,
      timestamp: intervention.created_at
    });

    // Also emit to user room for notifications
    this.getUserIdFromSession(session_id).then(userId => {
      if (userId) {
        this.io.to(`global:${userId}`).emit('intervention_alert', {
          sessionId: session_id,
          type,
          message,
          liveViewUrl: debug_url
        });
      }
    });
  }

  /**
   * Handle new job application from database
   */
  private handleNewApplication(payload: RealtimePostgresChangesPayload<any>): void {
    const application = payload.new;
    if (!application) return;

    const { session_id, job_title, company_name, status, applied_at } = application;

    console.log(`New job application: ${job_title} at ${company_name}`);

    // Only emit for successful applications
    if (status === 'applied') {
      this.io.to(`session:${session_id}`).emit('job_applied', {
        sessionId: session_id,
        jobTitle: job_title,
        companyName: company_name,
        appliedAt: applied_at,
        details: {
          jobId: application.job_id,
          location: application.location
        }
      });
    }
  }

  /**
   * Handle new log entry from database
   */
  private handleNewLog(payload: RealtimePostgresChangesPayload<any>): void {
    const log = payload.new;
    if (!log) return;

    const { session_id, event_type, message, details } = log;

    // Emit log to session room
    this.io.to(`session:${session_id}`).emit('log', {
      sessionId: session_id,
      level: this.getLogLevel(event_type),
      message,
      eventType: event_type,
      details,
      timestamp: log.created_at
    });
  }

  /**
   * Public method to emit progress updates
   */
  emitProgress(sessionId: string, progress: ProgressUpdate): void {
    this.io.to(`session:${sessionId}`).emit('progress_update', {
      sessionId,
      progress,
      timestamp: new Date().toISOString()
    });

    // Also emit to user room
    this.getUserIdFromSession(sessionId).then(userId => {
      if (userId) {
        this.io.to(`user:${userId}`).emit('progress_summary', {
          sessionId,
          percentage: progress.percentage,
          appliedJobs: progress.appliedJobs
        });
      }
    });
  }

  /**
   * Public method to emit step updates
   */
  emitStepUpdate(sessionId: string, step: string, details?: any): void {
    this.io.to(`session:${sessionId}`).emit('step_update', {
      sessionId,
      currentStep: step,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Public method to emit errors
   */
  emitError(sessionId: string, error: ErrorInfo): void {
    this.io.to(`session:${sessionId}`).emit('error', {
      sessionId,
      error,
      timestamp: error.timestamp || new Date().toISOString()
    });

    // Also emit to user room for critical errors
    if (error.code?.startsWith('CRITICAL_')) {
      this.getUserIdFromSession(sessionId).then(userId => {
        if (userId) {
          this.io.to(`global:${userId}`).emit('critical_error', {
            sessionId,
            error
          });
        }
      });
    }
  }

  /**
   * Public method to emit custom events
   */
  emitCustomEvent(sessionId: string, event: string, data: any): void {
    this.io.to(`session:${sessionId}`).emit(event, {
      sessionId,
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get user ID from session
   */
  private async getUserIdFromSession(sessionId: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('automation_sessions')
        .select('user_id')
        .eq('id', sessionId)
        .single();

      if (error || !data) {
        return null;
      }

      return data.user_id;
    } catch (error) {
      console.error('Error getting user ID from session:', error);
      return null;
    }
  }

  /**
   * Verify session ownership
   */
  private async verifySessionOwnership(userId: string, sessionId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('automation_sessions')
        .select('user_id')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

      return !error && data !== null;
    } catch (error) {
      console.error('Error verifying session ownership:', error);
      return false;
    }
  }

  /**
   * Get socket rooms for user and session
   */
  private getSocketRooms(userId: string, sessionId: string): string[] {
    return [
      `user:${userId}`,
      `session:${sessionId}`,
      `global:${userId}`
    ];
  }

  /**
   * Send current session status to socket
   */
  private async sendSessionStatus(socket: AuthenticatedSocket, sessionId: string): Promise<void> {
    try {
      const { data: session, error } = await this.supabase
        .from('automation_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error || !session) {
        throw new Error('Session not found');
      }

      // Get latest progress
      const { data: applications } = await this.supabase
        .from('applied_jobs')
        .select('status')
        .eq('session_id', sessionId);

      const progress = {
        totalJobs: 0,
        processedJobs: applications?.length || 0,
        appliedJobs: applications?.filter(a => a.status === 'applied').length || 0,
        skippedJobs: applications?.filter(a => a.status === 'skipped').length || 0,
        failedJobs: applications?.filter(a => a.status === 'failed').length || 0,
        currentPage: 1,
        percentage: 0
      };

      // Check for active interventions
      const { data: interventions } = await this.supabase
        .from('automation_interventions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(1);

      const activeIntervention = interventions?.[0];

      socket.emit('status_update', {
        sessionId,
        status: session.status,
        progress,
        intervention: activeIntervention ? {
          type: activeIntervention.type,
          message: activeIntervention.message,
          liveViewUrl: activeIntervention.debug_url
        } : null,
        startedAt: session.created_at,
        updatedAt: session.updated_at
      });
    } catch (error) {
      console.error('Error sending session status:', error);
      socket.emit('error', {
        code: 'STATUS_ERROR',
        message: 'Failed to get session status'
      });
    }
  }

  /**
   * Get user rate limit info
   */
  private getUserRateLimit(userId: string): RateLimitInfo {
    const now = new Date();
    let rateLimit = this.userRateLimits.get(userId);

    if (!rateLimit || now.getTime() - rateLimit.windowStart.getTime() > this.RATE_LIMIT_WINDOW) {
      // Reset rate limit window
      rateLimit = {
        subscriptions: 0,
        lastReset: now,
        windowStart: now
      };
      this.userRateLimits.set(userId, rateLimit);
    }

    return rateLimit;
  }

  /**
   * Get log level from event type
   */
  private getLogLevel(eventType: string): string {
    const errorEvents = ['automation_error', 'intervention_detected'];
    const warnEvents = ['session_paused', 'job_skipped', 'job_failed'];
    const infoEvents = ['session_started', 'session_completed', 'job_applied'];

    if (errorEvents.includes(eventType)) return 'error';
    if (warnEvents.includes(eventType)) return 'warn';
    if (infoEvents.includes(eventType)) return 'info';
    return 'debug';
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log('Cleaning up Realtime Automation Service...');

    // Unsubscribe from all channels
    for (const [name, channel] of this.channels) {
      try {
        await channel.unsubscribe();
        console.log(`Unsubscribed from channel: ${name}`);
      } catch (error) {
        console.error(`Error unsubscribing from channel ${name}:`, error);
      }
    }
    this.channels.clear();

    // Close all socket connections
    this.io.disconnectSockets();

    // Clear tracking maps
    this.userSessions.clear();
    this.userRateLimits.clear();

    console.log('Realtime Automation Service cleanup complete');
  }
}