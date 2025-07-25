import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import { LinkedInAutomationService } from '../services/linkedin/linkedinAutomationService';
import { SupabaseAutomationService } from '../services/supabase/automationService';
import { BrowserbaseSessionManager } from '../services/browserbase/sessionManager';
import { 
  JobSearchConfig, 
  SessionStatus,
  AutomationEventType,
  InterventionType 
} from '../types/automation.types';
import { LinkedInSessionService } from '../services/supabase/linkedinSessionService';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Request validation schemas
const startAutomationSchema = z.object({
  userId: z.string().uuid(),
  // Natural language search option
  searchPrompt: z.string().optional(),
  // Resume from Supabase Storage
  resumeUrl: z.string().url().optional(),
  resumeMetadata: z.object({
    fileName: z.string(),
    fileType: z.string(),
    extractedText: z.string().optional()
  }).optional(),
  // Configuration (optional when using searchPrompt)
  config: z.object({
    jobTitle: z.string().min(1).optional(),
    location: z.string().min(1).optional(),
    experience: z.array(z.enum(['INTERNSHIP', 'ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR_LEVEL', 'DIRECTOR', 'EXECUTIVE'])).optional(),
    filters: z.object({
      datePosted: z.enum(['day', 'week', 'month']).optional(),
      jobType: z.array(z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP'])).optional(),
      remote: z.boolean().optional(),
      easyApplyOnly: z.boolean().optional(),
      keywords: z.array(z.string()).optional()
    }).optional(),
    maxApplications: z.number().min(1).max(100).optional(),
    externalApplicationConfig: z.object({
      autoCreateAccount: z.boolean().optional(),
      defaultEmail: z.string().email().optional(),
      defaultPassword: z.string().optional(),
      pauseOnAccountCreation: z.boolean().optional()
    }).optional()
  }).optional()
}).refine((data) => {
  // Either searchPrompt or jobTitle must be provided
  return data.searchPrompt || data.config?.jobTitle;
}, {
  message: "Either searchPrompt or config.jobTitle must be provided"
});

const continueInterventionSchema = z.object({
  interventionCompleted: z.boolean()
});

// File upload configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and Word documents are allowed.'));
    }
  }
});

// Rate limiting storage (in production, use Redis)
const userRateLimits = new Map<string, { count: number; resetAt: Date }>();

export class LinkedInAutomationController {
  private automationService: LinkedInAutomationService;
  private supabaseService: SupabaseAutomationService;
  private linkedinSessionService: LinkedInSessionService;
  private sessionTaskMap = new Map<string, string>(); // sessionId -> taskId mapping

  constructor() {
    // Check if environment variables are set
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Missing required environment variables for LinkedIn automation');
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    
    this.supabaseService = new SupabaseAutomationService(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Create the new LinkedIn session service
    this.linkedinSessionService = new LinkedInSessionService(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const browserbaseManager = new BrowserbaseSessionManager(
      this.linkedinSessionService,
      process.env.BROWSERBASE_API_KEY!,
      process.env.BROWSERBASE_PROJECT_ID!
    );
    
    this.automationService = new LinkedInAutomationService(
      browserbaseManager,
      this.supabaseService,
      {
        checkInterventionAfterActions: true,
        verboseLogging: true
      }
    );

    // Setup event listeners for session updates
    this.setupEventListeners();
  }

  /**
   * Middleware to validate user authentication
   */
  async validateAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      console.log('LinkedIn Auth validation:', {
        path: req.path,
        method: req.method,
        hasAuthHeader: !!req.headers.authorization,
        authHeaderStart: req.headers.authorization?.substring(0, 20)
      });
      
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('Auth failed - missing or invalid header');
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Missing or invalid authorization header'
        });
        return;
      }

      const token = authHeader.split(' ')[1];
      
      // Verify JWT with Supabase
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        console.log('Auth failed - invalid token:', error?.message);
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid authentication token'
        });
        return;
      }
      
      console.log('Auth successful for user:', user.id);

      // Attach user to request
      (req as any).user = user;
      next();
    } catch (error) {
      console.error('Auth validation error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to validate authentication'
      });
    }
  }

  /**
   * Middleware to check rate limits
   */
  async checkRateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Skip rate limiting for status checks
    if (req.path.includes('/status/')) {
      next();
      return;
    }
    
    const userId = (req as any).user?.id;
    if (!userId) {
      next();
      return;
    }

    const now = new Date();
    const userLimit = userRateLimits.get(userId);

    if (!userLimit || userLimit.resetAt < now) {
      // Reset rate limit
      userRateLimits.set(userId, {
        count: 1,
        resetAt: new Date(now.getTime() + 60 * 60 * 1000) // 1 hour
      });
      next();
      return;
    }

    if (userLimit.count >= 100) { // 100 requests per hour
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((userLimit.resetAt.getTime() - now.getTime()) / 1000)
      });
      return;
    }

    userLimit.count++;
    next();
  }

  /**
   * POST /api/automation/linkedin/start
   * Start a new LinkedIn automation session
   */
  async startAutomation(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const validation = startAutomationSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid request body',
          details: validation.error.flatten()
        });
        return;
      }

      const { userId, searchPrompt, resumeUrl, resumeMetadata, config } = validation.data;
      const authenticatedUserId = (req as any).user?.id;

      // Verify user is starting automation for themselves
      if (userId !== authenticatedUserId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You can only start automation for your own account'
        });
        return;
      }

      // Log API call
      await this.logApiCall(userId, 'start_automation', { searchPrompt, config });

      // Transform config to match internal format
      let jobSearchConfig: JobSearchConfig = {
        searchPrompt,
        jobTitle: config?.jobTitle,
        location: config?.location,
        experienceLevel: config?.experience,
        datePosted: config?.filters?.datePosted,
        jobType: config?.filters?.jobType,
        remote: config?.filters?.remote,
        easyApplyOnly: config?.filters?.easyApplyOnly ?? false, // Default to false to apply to all jobs
        keywords: config?.filters?.keywords,
        maxApplications: config?.maxApplications ?? 50,
        resumeUrl,
        resumeMetadata,
        externalApplicationConfig: config?.externalApplicationConfig
      };

      // If only searchPrompt is provided, optionally parse it for filters
      // This is optional - Stagehand can handle natural language directly
      if (searchPrompt && !config?.jobTitle) {
        console.log('Using natural language prompt for job search:', searchPrompt);
        // The automation service will handle filter extraction from the prompt
      }

      // Start automation
      const { sessionId, debugUrl } = await this.automationService.startJobSearch(
        userId,
        jobSearchConfig
      );

      // Generate task ID for Browser Use compatibility
      const taskId = `task_${uuidv4()}`;
      this.sessionTaskMap.set(sessionId, taskId);

      // Return Browser Use compatible response
      res.status(200).json({
        sessionId, // This is the actual Browserbase session ID
        liveViewUrl: debugUrl,
        status: 'running',
        taskId,
        // Also include for backward compatibility
        browserbaseSessionId: sessionId
      });

    } catch (error) {
      console.error('Start automation error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to start automation',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/automation/linkedin/status/:sessionId
   * Get automation session status
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = (req as any).user?.id;

      // Get session from new LinkedIn service
      const linkedinSession = await this.linkedinSessionService.getSessionByBrowserbaseId(sessionId);
      if (!linkedinSession) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Session not found'
        });
        return;
      }

      if (linkedinSession.user_id !== userId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have access to this session'
        });
        return;
      }

      // Get usage stats
      const stats = await this.linkedinSessionService.getUserUsageStats(userId);

      // Map status
      const statusMap: Record<string, string> = {
        'active': 'running',
        'completed': 'completed',
        'failed': 'failed',
        'expired': 'failed',
        'intervention_required': 'intervention_required'
      };

      // Build response
      const response: any = {
        status: statusMap[linkedinSession.status] || 'unknown',
        progress: {
          totalApplications: stats.total_applications,
          applicationsToday: stats.applications_today,
          applicationsThisWeek: stats.applications_this_week,
          applicationsThisMonth: stats.applications_this_month,
          totalTimeSeconds: stats.total_time_seconds,
          sessionDurationSeconds: linkedinSession.duration_seconds || 0
        }
      };

      // Add live view URL if session is active or needs intervention
      if ((linkedinSession.status === 'active' || linkedinSession.status === 'intervention_required') && linkedinSession.live_view_url) {
        response.liveViewUrl = linkedinSession.live_view_url;
      }

      // Check if there's an intervention state for this session
      const interventionStates = (this as any).interventionStates;
      if (interventionStates && interventionStates.has(sessionId)) {
        const intervention = interventionStates.get(sessionId);
        response.intervention = {
          required: true,
          type: intervention.type,
          message: intervention.message,
          instructions: intervention.instructions,
          detectedAt: intervention.detectedAt,
          pageUrl: intervention.url
        };
      } else if (linkedinSession.status === 'intervention_required') {
        // If status is intervention_required but we don't have details, provide generic message
        response.intervention = {
          required: true,
          type: 'unknown',
          message: 'Manual intervention required',
          instructions: 'Please check the browser session and complete any required actions',
          detectedAt: linkedinSession.updated_at
        };
      }

      res.status(200).json(response);

    } catch (error) {
      console.error('Get status error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get session status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * PUT /api/automation/linkedin/pause/:sessionId
   * Pause automation session
   */
  async pauseAutomation(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = (req as any).user?.id;

      // Get session from new LinkedIn service
      const linkedinSession = await this.linkedinSessionService.getSessionByBrowserbaseId(sessionId);
      if (!linkedinSession) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Session not found'
        });
        return;
      }

      if (linkedinSession.user_id !== userId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have access to this session'
        });
        return;
      }

      // Log API call
      await this.logApiCall(userId, 'pause_automation', { sessionId });

      // For now, mark as completed since we don't have pause functionality
      await this.linkedinSessionService.updateSessionStatus(
        linkedinSession.id,
        'completed',
        new Date()
      );

      res.status(200).json({
        success: true,
        status: 'paused'
      });

    } catch (error) {
      console.error('Pause automation error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to pause automation',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * PUT /api/automation/linkedin/resume/:sessionId
   * Resume automation session
   */
  async resumeAutomation(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = (req as any).user?.id;

      // Verify session ownership
      const session = await this.supabaseService.getSession(sessionId);
      if (!session) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Session not found'
        });
        return;
      }

      if (session.user_id !== userId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have access to this session'
        });
        return;
      }

      // Log API call
      await this.logApiCall(userId, 'resume_automation', { sessionId });

      // Resume the session
      await this.automationService.resumeSession(sessionId);

      res.status(200).json({
        success: true,
        status: 'running'
      });

    } catch (error) {
      console.error('Resume automation error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to resume automation',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/automation/linkedin/stop/:sessionId
   * Stop automation session
   */
  async stopAutomation(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const userId = (req as any).user?.id;

      // Get session from new LinkedIn service
      const linkedinSession = await this.linkedinSessionService.getSessionByBrowserbaseId(sessionId);
      if (!linkedinSession) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Session not found'
        });
        return;
      }

      if (linkedinSession.user_id !== userId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have access to this session'
        });
        return;
      }

      // Log API call
      await this.logApiCall(userId, 'stop_automation', { sessionId });

      // Update session status
      await this.linkedinSessionService.updateSessionStatus(
        linkedinSession.id,
        'completed',
        new Date()
      );

      // Try to stop the automation service
      try {
        await this.automationService.stopSession(sessionId, 'User requested stop');
      } catch (error) {
        console.warn('Failed to stop automation service:', error);
      }

      res.status(200).json({
        success: true,
        status: 'stopped'
      });

    } catch (error) {
      console.error('Stop automation error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to stop automation',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/automation/linkedin/continue/:sessionId
   * Continue after intervention
   */
  async continueAfterIntervention(req: Request, res: Response): Promise<void> {
    try {
      console.log('Continue endpoint called:', {
        sessionId: req.params.sessionId,
        userId: (req as any).user?.id,
        method: req.method,
        path: req.path,
        bodyKeys: Object.keys(req.body || {})
      });
      
      const { sessionId } = req.params;
      const userId = (req as any).user?.id;

      // Validate request body (optional for manual continue)
      if (req.body && Object.keys(req.body).length > 0) {
        const validation = continueInterventionSchema.safeParse(req.body);
        if (!validation.success) {
          res.status(400).json({
            error: 'Bad Request',
            message: 'Invalid request body',
            details: validation.error.flatten()
          });
          return;
        }
      }

      // Get LinkedIn session details
      const linkedinSession = await this.linkedinSessionService.getSessionByBrowserbaseId(sessionId);
      if (!linkedinSession) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Session not found'
        });
        return;
      }

      if (linkedinSession.user_id !== userId) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have access to this session'
        });
        return;
      }

      // Log API call
      await this.logApiCall(userId, 'continue_intervention', { sessionId });

      // Clear intervention state
      const interventionStates = (this as any).interventionStates;
      if (interventionStates) {
        interventionStates.delete(sessionId);
      }

      // Log intervention completion
      // TODO: Implement logActivity method in supabaseService
      // await this.supabaseService.logActivity(
      //   sessionId,
      //   'intervention_completed',
      //   { completed_by: userId },
      //   'User completed intervention'
      // );
      console.log('Intervention completed by user:', userId);

      // Resume the automation using the improved resume method or manual continue
      try {
        // Check if it's a login intervention
        if (linkedinSession.status === 'intervention_required') {
          // Use the manual continue method for login cases
          await this.automationService.continueAfterLogin(sessionId);
        } else {
          // Use regular resume for other cases
          await this.automationService.resumeSession(sessionId);
        }
        
        res.status(200).json({
          success: true,
          status: 'running',
          message: 'Session resumed after intervention'
        });
      } catch (resumeError) {
        console.error('Failed to resume session:', resumeError);
        
        // Update status to failed if resume fails
        await this.linkedinSessionService.updateSessionStatus(
          linkedinSession.id,
          'failed',
          new Date()
        );
        
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to resume session after intervention',
          details: resumeError instanceof Error ? resumeError.message : 'Unknown error'
        });
      }

    } catch (error) {
      console.error('Continue intervention error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to continue after intervention',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/automation/linkedin/upload
   * Upload resume file
   */
  async uploadFile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;

      // Handle file upload with multer middleware
      upload.single('file')(req, res, async (err) => {
        if (err) {
          res.status(400).json({
            error: 'Bad Request',
            message: err.message || 'File upload failed'
          });
          return;
        }

        if (!req.file) {
          res.status(400).json({
            error: 'Bad Request',
            message: 'No file provided'
          });
          return;
        }

        try {
          // Log API call
          await this.logApiCall(userId, 'upload_file', { 
            filename: req.file.originalname,
            size: req.file.size 
          });

          // Generate file ID
          const fileId = `resume_${userId}_${Date.now()}`;
          const fileName = `${fileId}_${req.file.originalname}`;

          // Upload to Supabase Storage
          const { data, error } = await supabase.storage
            .from('resumes')
            .upload(fileName, req.file.buffer, {
              contentType: req.file.mimetype,
              upsert: false
            });

          if (error) {
            throw error;
          }

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('resumes')
            .getPublicUrl(fileName);

          res.status(200).json({
            fileUrl: publicUrl,
            fileId
          });

        } catch (uploadError) {
          console.error('File upload error:', uploadError);
          res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to upload file',
            details: uploadError instanceof Error ? uploadError.message : 'Unknown error'
          });
        }
      });

    } catch (error) {
      console.error('Upload file error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to process upload',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Setup event listeners for automation service
   */
  private setupEventListeners(): void {
    // Store intervention states for sessions
    const interventionStates = new Map<string, any>();

    this.automationService.on(AutomationEventType.INTERVENTION_REQUIRED, (data) => {
      const { sessionId, intervention } = data;
      interventionStates.set(sessionId, {
        ...intervention,
        detectedAt: new Date().toISOString()
      });
      console.log(`Intervention required for session ${sessionId}:`, intervention);
    });

    this.automationService.on(AutomationEventType.SESSION_RESUMED, (data) => {
      const { sessionId } = data;
      // Clear intervention state when session resumes
      interventionStates.delete(sessionId);
      console.log(`Session resumed after intervention: ${sessionId}`);
    });

    this.automationService.on(AutomationEventType.SESSION_COMPLETED, (data) => {
      const { sessionId } = data;
      interventionStates.delete(sessionId);
      this.sessionTaskMap.delete(sessionId);
    });

    this.automationService.on(AutomationEventType.ERROR, (data) => {
      const { sessionId } = data;
      interventionStates.delete(sessionId);
      this.sessionTaskMap.delete(sessionId);
    });

    // Store intervention states on the instance for access in other methods
    (this as any).interventionStates = interventionStates;
  }

  /**
   * POST /api/automation/linkedin/setup-context
   * Setup persistent authentication context for a user
   */
  async setupContext(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated'
        });
        return;
      }

      // Get the browserbase manager from the automation service
      const browserbaseManager = (this.automationService as any).browserbaseManager;
      
      // Create a new context for the user
      const contextId = await browserbaseManager.createUserContext(userId);
      
      res.status(200).json({
        success: true,
        contextId,
        message: 'Context created successfully. Your next session will use this context to persist login.',
        instructions: 'When you start your next automation, you will need to log in once. After that, all future sessions will remain logged in automatically.'
      });

    } catch (error) {
      console.error('Setup context error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to setup context',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/automation/linkedin/reset-context
   * Reset user's context (forces fresh login)
   */
  async resetContext(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated'
        });
        return;
      }

      // Clear the context by creating a new one on next session
      await this.linkedinSessionService.updateUserContext(userId, '');
      
      res.status(200).json({
        success: true,
        message: 'Context reset successfully. Your next session will require a fresh login.'
      });

    } catch (error) {
      console.error('Reset context error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to reset context',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/automation/linkedin/context-status
   * Check if user has a persistent context for LinkedIn sessions
   */
  async getContextStatus(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      const userId = (req as any).user?.id;

      if (!userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated'
        });
        return;
      }

      // Get user's context status
      const contextId = await this.linkedinSessionService.getUserContext(userId);
      
      // Get last session info to determine when context was last used
      let lastUsed: Date | null = null;
      if (contextId) {
        try {
          const lastSession = await this.linkedinSessionService.getLastSessionForUser(userId);
          if (lastSession) {
            lastUsed = lastSession.created_at;
          }
        } catch (error) {
          console.error('Error getting last session:', error);
        }
      }

      res.status(200).json({
        hasContext: !!contextId,
        contextId: contextId || undefined,
        requiresLogin: !contextId,
        lastUsed: lastUsed ? (lastUsed instanceof Date ? lastUsed.toISOString() : lastUsed) : undefined,
        message: contextId 
          ? 'You have a saved LinkedIn session. No login required.'
          : 'First-time users need to log in to LinkedIn once.'
      });

    } catch (error) {
      console.error('Get context status error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get context status',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Log API calls to Supabase
   */
  private async logApiCall(userId: string, action: string, details: any): Promise<void> {
    try {
      // Simply skip logging for now as it's not critical
      console.log(`API Call: ${action}`, { userId, details });
    } catch (error) {
      console.error('Error logging API call:', error);
      // Don't throw - logging should not break the main flow
    }
  }
}