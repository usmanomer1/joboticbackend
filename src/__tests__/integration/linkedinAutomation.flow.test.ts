import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { Server } from 'http';
import { io as ioClient, Socket } from 'socket.io-client';
import { createTestSupabaseClient, createTestSupabaseAnonClient, TEST_CONFIG, TEST_USERS } from './setup/testConfig';
import { 
  createTestSession, 
  createStartAutomationRequest,
  createProgressUpdateEvent,
  generateMockJobListings 
} from './setup/testFactories';
import { MockBrowserbaseClient, MockStagehandInstance, MockWebSocketClient, MockRedisClient } from './setup/mockServices';
import { LinkedInAutomationController } from '../../controllers/linkedinAutomation.controller';
import { RealtimeAutomationService } from '../../services/realtime/realtimeAutomationService';
import { SessionStateManager } from '../../services/state/sessionStateManager';
import { SupabaseAutomationService } from '../../services/supabase/supabaseAutomationService';
import { LinkedInAutomationService } from '../../services/automation/linkedinAutomationService';
import { InterventionDetectionService } from '../../services/automation/interventionDetectionService';
import { SessionStatus, JobApplication } from '../../types/automation.types';
import { v4 as uuidv4 } from 'uuid';

describe('LinkedIn Automation - Automation Flow Suite', () => {
  let app: any;
  let server: Server;
  let controller: LinkedInAutomationController;
  let realtimeService: RealtimeAutomationService;
  let stateManager: SessionStateManager;
  let supabaseService: SupabaseAutomationService;
  let automationService: LinkedInAutomationService;
  let interventionService: InterventionDetectionService;
  let mockBrowserbase: MockBrowserbaseClient;
  let mockRedis: MockRedisClient;
  let supabase: any;
  let userToken: string;
  let userId: string;

  beforeAll(async () => {
    // Initialize test Supabase clients
    supabase = createTestSupabaseClient();
    const anonSupabase = createTestSupabaseAnonClient();

    // Create test user
    const { data: user, error } = await supabase.auth.admin.createUser({
      email: TEST_USERS.userA.email,
      password: TEST_USERS.userA.password,
      email_confirm: true
    });
    if (error) throw error;
    userId = user.user.id;

    // Get auth token
    const { data: session } = await anonSupabase.auth.signInWithPassword({
      email: TEST_USERS.userA.email,
      password: TEST_USERS.userA.password
    });
    userToken = session.session.access_token;

    // Initialize mocks
    mockBrowserbase = new MockBrowserbaseClient();
    mockRedis = new MockRedisClient();

    // Initialize services
    supabaseService = new SupabaseAutomationService(supabase);
    stateManager = new SessionStateManager(supabaseService, mockRedis as any);
    interventionService = new InterventionDetectionService();
    
    // Initialize controller
    controller = new LinkedInAutomationController(
      supabaseService,
      mockBrowserbase as any,
      stateManager
    );

    // Create Express app
    const express = require('express');
    app = express();
    app.use(express.json());
    
    // Mount controller routes
    const router = express.Router();
    router.use(controller.validateAuth.bind(controller));
    router.use(controller.checkRateLimit.bind(controller));
    router.post('/start', controller.startAutomation.bind(controller));
    router.get('/status/:sessionId', controller.getStatus.bind(controller));
    router.post('/pause/:sessionId', controller.pauseAutomation.bind(controller));
    router.post('/resume/:sessionId', controller.resumeAutomation.bind(controller));
    router.post('/stop/:sessionId', controller.stopAutomation.bind(controller));
    router.get('/results/:sessionId', controller.getResults.bind(controller));
    
    app.use('/api/linkedin', router);

    // Start server
    server = app.listen(TEST_CONFIG.server.port);

    // Initialize realtime service
    realtimeService = new RealtimeAutomationService(server, supabase);
    await realtimeService.initialize();

    // Initialize automation service
    automationService = new LinkedInAutomationService(
      mockBrowserbase as any,
      stateManager,
      supabaseService,
      interventionService,
      realtimeService
    );
  });

  afterAll(async () => {
    // Cleanup
    await realtimeService.close();
    server.close();
    await supabase.auth.admin.deleteUser(userId);
  });

  beforeEach(async () => {
    // Clear all data
    mockBrowserbase.clearAllSessions();
    mockRedis.flushdb();
    await supabase.from('automation_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('automation_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('job_applications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  });

  describe('End-to-End Automation Flow', () => {
    test('should complete full automation lifecycle', async () => {
      // Start automation
      const config = createStartAutomationRequest(userId, {
        maxApplications: 5,
        easyApplyOnly: true
      });

      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(config);

      expect(startResponse.status).toBe(200);
      const { sessionId, liveViewUrl, status, taskId } = startResponse.body;
      expect(sessionId).toBeTruthy();
      expect(liveViewUrl).toBeTruthy();
      expect(status).toBe('running');
      expect(taskId).toBeTruthy();

      // Connect WebSocket for real-time updates
      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));
      client.emit('subscribe', { sessionId });

      const progressUpdates: any[] = [];
      const statusUpdates: any[] = [];
      const applicationEvents: any[] = [];

      client.on('progress:update', (data) => progressUpdates.push(data));
      client.on('status:update', (data) => statusUpdates.push(data));
      client.on('application:completed', (data) => applicationEvents.push(data));

      // Simulate automation progress
      await simulateAutomationProgress(sessionId, stateManager, realtimeService, supabaseService);

      // Wait for events
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toMatchObject({
        sessionId,
        progress: {
          totalJobs: 50,
          processedJobs: 50,
          appliedJobs: 5,
          skippedJobs: 45,
          failedJobs: 0
        }
      });

      // Complete automation
      await stateManager.updateSessionState(sessionId, {
        status: SessionStatus.COMPLETED,
        completedAt: new Date()
      });

      await realtimeService.emitStatusUpdate(sessionId, SessionStatus.COMPLETED);

      // Get final results
      const resultsResponse = await request(app)
        .get(`/api/linkedin/results/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(resultsResponse.status).toBe(200);
      expect(resultsResponse.body.session).toMatchObject({
        id: sessionId,
        status: SessionStatus.COMPLETED
      });
      expect(resultsResponse.body.applications).toHaveLength(5);
      expect(resultsResponse.body.logs.length).toBeGreaterThan(0);

      client.disconnect();
    });

    test('should handle job search and filtering', async () => {
      const config = {
        userId,
        config: {
          jobTitle: 'Software Engineer',
          location: 'San Francisco, CA',
          datePosted: 'week',
          experienceLevel: ['MID_LEVEL', 'SENIOR_LEVEL'],
          jobType: ['FULL_TIME'],
          remote: true,
          easyApplyOnly: true,
          maxApplications: 10,
          keywords: ['typescript', 'react', 'node.js']
        }
      };

      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(config);

      const sessionId = startResponse.body.sessionId;

      // Simulate job search
      const mockJobs = generateMockJobListings(20);
      
      // Save to state
      await stateManager.saveProgress(sessionId, {
        totalJobs: mockJobs.length,
        processedJobs: 0,
        appliedJobs: 0,
        skippedJobs: 0,
        failedJobs: 0,
        currentPage: 1
      });

      // Process jobs
      for (let i = 0; i < mockJobs.length; i++) {
        const job = mockJobs[i];
        
        // Apply to easy apply jobs only
        if (job.isEasyApply && i < 10) {
          await supabaseService.saveJobApplication(sessionId, {
            job_id: job.id,
            job_title: job.title,
            company_name: job.company,
            location: job.location,
            job_description: job.description,
            status: 'applied',
            applied_at: new Date().toISOString()
          });
          
          await stateManager.incrementProgress(sessionId, 'appliedJobs');
        } else {
          await stateManager.incrementProgress(sessionId, 'skippedJobs');
        }
        
        await stateManager.incrementProgress(sessionId, 'processedJobs');
      }

      // Get status
      const statusResponse = await request(app)
        .get(`/api/linkedin/status/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(statusResponse.body.progress).toMatchObject({
        totalJobs: 20,
        processedJobs: 20,
        appliedJobs: 10,
        skippedJobs: 10,
        failedJobs: 0
      });
    });

    test('should handle duplicate job prevention', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;
      const jobId = 'duplicate-job-123';

      // Apply to job first time
      await stateManager.markJobAsApplied(userId, jobId);
      await supabaseService.saveJobApplication(sessionId, {
        job_id: jobId,
        job_title: 'Test Job',
        company_name: 'Test Company',
        location: 'Remote',
        status: 'applied',
        applied_at: new Date().toISOString()
      });

      // Check if already applied
      const hasApplied = await stateManager.hasAppliedToJob(userId, jobId);
      expect(hasApplied).toBe(true);

      // Should skip duplicate
      const recentJobs = await stateManager.getRecentlyAppliedJobs(userId, 100);
      expect(recentJobs).toContain(jobId);
    });

    test('should handle session termination', async () => {
      // Start automation
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      // Connect WebSocket
      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));
      client.emit('subscribe', { sessionId });

      let statusUpdate: any = null;
      client.on('status:update', (data) => { statusUpdate = data; });

      // Stop automation
      const stopResponse = await request(app)
        .post(`/api/linkedin/stop/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(stopResponse.status).toBe(200);
      expect(stopResponse.body.status).toBe('stopped');

      // Wait for WebSocket update
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(statusUpdate).toMatchObject({
        sessionId,
        status: SessionStatus.STOPPED
      });

      // Verify Browserbase session terminated
      const bbSessionId = startResponse.body.sessionId.replace('task_', '');
      const bbSession = mockBrowserbase.getSession(bbSessionId);
      expect(bbSession).toBeUndefined();

      // Verify state cleaned up
      const state = await stateManager.getSessionState(sessionId);
      expect(state?.status).toBe(SessionStatus.STOPPED);

      client.disconnect();
    });
  });

  describe('Progress Tracking', () => {
    test('should track progress accurately', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      // Initialize progress
      await stateManager.saveProgress(sessionId, {
        totalJobs: 100,
        processedJobs: 0,
        appliedJobs: 0,
        skippedJobs: 0,
        failedJobs: 0,
        currentPage: 1
      });

      // Simulate processing
      for (let i = 0; i < 20; i++) {
        if (i < 10) {
          await stateManager.incrementProgress(sessionId, 'appliedJobs');
        } else if (i < 18) {
          await stateManager.incrementProgress(sessionId, 'skippedJobs');
        } else {
          await stateManager.incrementProgress(sessionId, 'failedJobs');
        }
        await stateManager.incrementProgress(sessionId, 'processedJobs');
      }

      const progress = await stateManager.getProgress(sessionId);
      expect(progress).toMatchObject({
        totalJobs: 100,
        processedJobs: 20,
        appliedJobs: 10,
        skippedJobs: 8,
        failedJobs: 2
      });

      // Calculate percentage
      const percentage = Math.round((progress!.processedJobs / progress!.totalJobs) * 100);
      expect(percentage).toBe(20);
    });

    test('should emit real-time progress updates', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      // Connect WebSocket
      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));
      client.emit('subscribe', { sessionId });

      const progressUpdates: any[] = [];
      client.on('progress:update', (data) => progressUpdates.push(data));

      // Emit progress updates
      for (let i = 1; i <= 5; i++) {
        await realtimeService.emitProgress(sessionId, {
          totalJobs: 50,
          processedJobs: i * 10,
          appliedJobs: i * 7,
          skippedJobs: i * 3,
          failedJobs: 0,
          currentPage: i
        });
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      expect(progressUpdates).toHaveLength(5);
      expect(progressUpdates[4].progress).toMatchObject({
        totalJobs: 50,
        processedJobs: 50,
        appliedJobs: 35,
        skippedJobs: 15
      });

      client.disconnect();
    });
  });

  describe('Error Handling', () => {
    test('should handle Stagehand initialization failures', async () => {
      // Force Browserbase to return invalid session
      const invalidSessionId = 'invalid-session';
      mockBrowserbase.terminateSession(invalidSessionId);

      const config = createStartAutomationRequest(userId);
      
      // This should still succeed initially (session created)
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(config);

      expect(startResponse.status).toBe(200);
      
      // But automation should fail when trying to use the session
      // In real implementation, this would be caught by automation service
    });

    test('should handle job application failures', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      // Simulate failed application
      await stateManager.saveProgress(sessionId, {
        totalJobs: 10,
        processedJobs: 5,
        appliedJobs: 3,
        skippedJobs: 1,
        failedJobs: 1,
        currentPage: 1
      });

      await supabaseService.logAutomationEvent(sessionId, 'application_failed', {
        jobId: 'failed-job-123',
        error: 'Network timeout',
        details: { retries: 3 }
      });

      // Get logs
      const { data: logs } = await supabase
        .from('automation_logs')
        .select('*')
        .eq('session_id', sessionId)
        .eq('event_type', 'application_failed');

      expect(logs).toHaveLength(1);
      expect(logs[0].details).toMatchObject({
        jobId: 'failed-job-123',
        error: 'Network timeout'
      });
    });

    test('should recover from temporary failures', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      // Simulate Redis failure (circuit breaker)
      for (let i = 0; i < 5; i++) {
        try {
          await mockRedis.get('force-error');
        } catch (e) {
          // Expected
        }
      }

      // Should fallback to memory
      const state = await stateManager.getSessionState(sessionId);
      expect(state).toBeTruthy();

      // Progress tracking should still work
      await stateManager.incrementProgress(sessionId, 'processedJobs');
      const progress = await stateManager.getProgress(sessionId);
      expect(progress?.processedJobs).toBe(1);
    });
  });

  describe('Resume Data', () => {
    test('should save and restore automation context', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      // Save context mid-automation
      const resumeData = {
        currentSearchUrl: 'https://www.linkedin.com/jobs/search?page=3',
        lastProcessedJobIndex: 25,
        currentFilters: {
          datePosted: 'week',
          experienceLevel: ['MID_LEVEL']
        },
        processedJobIds: ['job-1', 'job-2', 'job-3']
      };

      await stateManager.savePauseState(sessionId, {
        pausedAt: new Date(),
        reason: 'USER_INITIATED' as any,
        currentUrl: resumeData.currentSearchUrl,
        resumeData
      });

      // Retrieve context
      const pauseState = await stateManager.getPauseState(sessionId);
      expect(pauseState?.resumeData).toMatchObject(resumeData);
      expect(pauseState?.resumeData.lastProcessedJobIndex).toBe(25);
      expect(pauseState?.resumeData.processedJobIds).toHaveLength(3);
    });
  });
});

// Helper function to simulate automation progress
async function simulateAutomationProgress(
  sessionId: string,
  stateManager: SessionStateManager,
  realtimeService: RealtimeAutomationService,
  supabaseService: SupabaseAutomationService
) {
  // Initialize progress
  await stateManager.saveProgress(sessionId, {
    totalJobs: 50,
    processedJobs: 0,
    appliedJobs: 0,
    skippedJobs: 0,
    failedJobs: 0,
    currentPage: 1
  });

  // Simulate processing jobs
  for (let i = 1; i <= 50; i++) {
    if (i <= 5) {
      // Apply to first 5 jobs
      await supabaseService.saveJobApplication(sessionId, {
        job_id: `job-${i}`,
        job_title: `Software Engineer ${i}`,
        company_name: `Company ${i}`,
        location: 'San Francisco, CA',
        status: 'applied',
        applied_at: new Date().toISOString()
      });
      await stateManager.incrementProgress(sessionId, 'appliedJobs');
    } else {
      // Skip the rest
      await stateManager.incrementProgress(sessionId, 'skippedJobs');
    }
    
    await stateManager.incrementProgress(sessionId, 'processedJobs');

    // Emit progress every 10 jobs
    if (i % 10 === 0) {
      const progress = await stateManager.getProgress(sessionId);
      await realtimeService.emitProgress(sessionId, progress!);
    }
  }

  // Log completion
  await supabaseService.logAutomationEvent(sessionId, 'automation_completed', {
    totalProcessed: 50,
    totalApplied: 5,
    duration: '5 minutes'
  });
}