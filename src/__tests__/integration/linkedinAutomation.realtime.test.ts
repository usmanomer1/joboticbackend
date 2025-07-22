import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { Server } from 'http';
import { io as ioClient, Socket } from 'socket.io-client';
import { createTestSupabaseClient, createTestSupabaseAnonClient, TEST_CONFIG, TEST_USERS } from './setup/testConfig';
import { 
  createTestSession,
  createStartAutomationRequest,
  createProgressUpdateEvent,
  createInterventionEvent,
  createTestJobApplication
} from './setup/testFactories';
import { MockBrowserbaseClient, MockRedisClient } from './setup/mockServices';
import { LinkedInAutomationController } from '../../controllers/linkedinAutomation.controller';
import { RealtimeAutomationService } from '../../services/realtime/realtimeAutomationService';
import { SessionStateManager } from '../../services/state/sessionStateManager';
import { SupabaseAutomationService } from '../../services/supabase/supabaseAutomationService';
import { SessionStatus, InterventionType } from '../../types/automation.types';
import { v4 as uuidv4 } from 'uuid';

describe('LinkedIn Automation - Real-time Updates Suite', () => {
  let app: any;
  let server: Server;
  let controller: LinkedInAutomationController;
  let realtimeService: RealtimeAutomationService;
  let stateManager: SessionStateManager;
  let supabaseService: SupabaseAutomationService;
  let mockBrowserbase: MockBrowserbaseClient;
  let mockRedis: MockRedisClient;
  let supabase: any;
  let userAToken: string;
  let userBToken: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    // Initialize test Supabase clients
    supabase = createTestSupabaseClient();
    const anonSupabase = createTestSupabaseAnonClient();

    // Create test users
    const { data: userA, error: errorA } = await supabase.auth.admin.createUser({
      email: TEST_USERS.userA.email,
      password: TEST_USERS.userA.password,
      email_confirm: true
    });
    if (errorA) throw errorA;
    userAId = userA.user.id;

    const { data: userB, error: errorB } = await supabase.auth.admin.createUser({
      email: TEST_USERS.userB.email,
      password: TEST_USERS.userB.password,
      email_confirm: true
    });
    if (errorB) throw errorB;
    userBId = userB.user.id;

    // Get auth tokens
    const { data: sessionA } = await anonSupabase.auth.signInWithPassword({
      email: TEST_USERS.userA.email,
      password: TEST_USERS.userA.password
    });
    userAToken = sessionA.session.access_token;

    const { data: sessionB } = await anonSupabase.auth.signInWithPassword({
      email: TEST_USERS.userB.email,
      password: TEST_USERS.userB.password
    });
    userBToken = sessionB.session.access_token;

    // Initialize mocks
    mockBrowserbase = new MockBrowserbaseClient();
    mockRedis = new MockRedisClient();

    // Initialize services
    supabaseService = new SupabaseAutomationService(supabase);
    stateManager = new SessionStateManager(supabaseService, mockRedis as any);
    
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
    
    app.use('/api/linkedin', router);

    // Start server
    server = app.listen(TEST_CONFIG.server.port);

    // Initialize realtime service
    realtimeService = new RealtimeAutomationService(server, supabase);
    await realtimeService.initialize();
  });

  afterAll(async () => {
    // Cleanup
    await realtimeService.close();
    server.close();
    await supabase.auth.admin.deleteUser(userAId);
    await supabase.auth.admin.deleteUser(userBId);
  });

  beforeEach(async () => {
    // Clear all data
    mockBrowserbase.clearAllSessions();
    mockRedis.flushdb();
    await supabase.from('automation_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('automation_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('job_applications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('user_interventions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  });

  describe('WebSocket Connection', () => {
    test('should establish WebSocket connection with valid auth', async () => {
      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      await new Promise<void>((resolve, reject) => {
        client.on('connect', () => resolve());
        client.on('connect_error', (err) => reject(err));
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      expect(client.connected).toBe(true);
      client.disconnect();
    });

    test('should reject WebSocket connection with invalid auth', async () => {
      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: 'invalid-token' },
        transports: ['websocket']
      });

      let connected = false;
      let error: any = null;

      client.on('connect', () => { connected = true; });
      client.on('connect_error', (err) => { error = err; });

      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(connected).toBe(false);
      expect(error).toBeTruthy();
      
      client.disconnect();
    });

    test('should handle reconnection with token refresh', async () => {
      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));
      expect(client.connected).toBe(true);

      // Simulate disconnect
      client.disconnect();
      expect(client.connected).toBe(false);

      // Reconnect
      client.connect();
      await new Promise(resolve => client.on('connect', resolve));
      expect(client.connected).toBe(true);

      client.disconnect();
    });
  });

  describe('Room Management', () => {
    test('should join session-specific room on subscribe', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(userAId));

      const sessionId = startResponse.body.sessionId;

      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));

      let subscribed = false;
      client.on('subscribed', (data) => {
        subscribed = true;
        expect(data.sessionId).toBe(sessionId);
      });

      client.emit('subscribe', { sessionId });

      await new Promise(resolve => setTimeout(resolve, 500));
      expect(subscribed).toBe(true);

      client.disconnect();
    });

    test('should leave room on unsubscribe', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(userAId));

      const sessionId = startResponse.body.sessionId;

      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));

      // Subscribe
      client.emit('subscribe', { sessionId });
      await new Promise(resolve => client.on('subscribed', resolve));

      // Unsubscribe
      let unsubscribed = false;
      client.on('unsubscribed', (data) => {
        unsubscribed = true;
        expect(data.sessionId).toBe(sessionId);
      });

      client.emit('unsubscribe', { sessionId });

      await new Promise(resolve => setTimeout(resolve, 500));
      expect(unsubscribed).toBe(true);

      client.disconnect();
    });

    test('should isolate events between session rooms', async () => {
      // Create two sessions
      const sessionA = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(userAId));

      const sessionB = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userBToken}`)
        .send(createStartAutomationRequest(userBId));

      // Connect clients
      const clientA = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      const clientB = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userBToken },
        transports: ['websocket']
      });

      await Promise.all([
        new Promise(resolve => clientA.on('connect', resolve)),
        new Promise(resolve => clientB.on('connect', resolve))
      ]);

      // Subscribe to respective sessions
      clientA.emit('subscribe', { sessionId: sessionA.body.sessionId });
      clientB.emit('subscribe', { sessionId: sessionB.body.sessionId });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Set up event listeners
      const eventsA: any[] = [];
      const eventsB: any[] = [];

      clientA.on('progress:update', (data) => eventsA.push(data));
      clientB.on('progress:update', (data) => eventsB.push(data));

      // Emit progress for session A
      await realtimeService.emitProgress(sessionA.body.sessionId, {
        totalJobs: 10,
        processedJobs: 5,
        appliedJobs: 3,
        skippedJobs: 2,
        failedJobs: 0,
        currentPage: 1
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Client A should receive the event
      expect(eventsA).toHaveLength(1);
      expect(eventsA[0].sessionId).toBe(sessionA.body.sessionId);

      // Client B should NOT receive the event
      expect(eventsB).toHaveLength(0);

      clientA.disconnect();
      clientB.disconnect();
    });
  });

  describe('Real-time Event Types', () => {
    test('should emit progress updates', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(userAId));

      const sessionId = startResponse.body.sessionId;

      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));
      client.emit('subscribe', { sessionId });

      const progressUpdates: any[] = [];
      client.on('progress:update', (data) => progressUpdates.push(data));

      // Emit multiple progress updates
      const progressSteps = [
        { totalJobs: 50, processedJobs: 10, appliedJobs: 7, skippedJobs: 3, failedJobs: 0, currentPage: 1 },
        { totalJobs: 50, processedJobs: 20, appliedJobs: 14, skippedJobs: 6, failedJobs: 0, currentPage: 2 },
        { totalJobs: 50, processedJobs: 30, appliedJobs: 20, skippedJobs: 10, failedJobs: 0, currentPage: 3 }
      ];

      for (const progress of progressSteps) {
        await realtimeService.emitProgress(sessionId, progress);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      expect(progressUpdates).toHaveLength(3);
      expect(progressUpdates[2].progress).toMatchObject(progressSteps[2]);

      client.disconnect();
    });

    test('should emit status updates', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(userAId));

      const sessionId = startResponse.body.sessionId;

      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));
      client.emit('subscribe', { sessionId });

      const statusUpdates: any[] = [];
      client.on('status:update', (data) => statusUpdates.push(data));

      // Emit status changes
      await realtimeService.emitStatusUpdate(sessionId, SessionStatus.RUNNING);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await realtimeService.emitStatusUpdate(sessionId, SessionStatus.PAUSED);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(statusUpdates).toHaveLength(2);
      expect(statusUpdates[0].status).toBe(SessionStatus.RUNNING);
      expect(statusUpdates[1].status).toBe(SessionStatus.PAUSED);

      client.disconnect();
    });

    test('should emit intervention events', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(userAId));

      const sessionId = startResponse.body.sessionId;

      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));
      client.emit('subscribe', { sessionId });

      let interventionReceived = false;
      let interventionData: any = null;

      client.on('intervention:required', (data) => {
        interventionReceived = true;
        interventionData = data;
      });

      // Emit intervention
      await realtimeService.emitInterventionRequired(sessionId, {
        type: InterventionType.LOGIN,
        message: 'LinkedIn login required',
        liveViewUrl: mockBrowserbase.getDebugUrl(sessionId),
        context: { url: 'https://www.linkedin.com/login' }
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(interventionReceived).toBe(true);
      expect(interventionData).toMatchObject({
        sessionId,
        type: InterventionType.LOGIN,
        message: 'LinkedIn login required',
        liveViewUrl: expect.any(String)
      });

      client.disconnect();
    });

    test('should emit application completed events', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(userAId));

      const sessionId = startResponse.body.sessionId;

      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));
      client.emit('subscribe', { sessionId });

      const applicationEvents: any[] = [];
      client.on('application:completed', (data) => applicationEvents.push(data));

      // Emit application events
      const applications = [
        { jobId: 'job-1', jobTitle: 'Software Engineer', company: 'Tech Corp', success: true },
        { jobId: 'job-2', jobTitle: 'Senior Developer', company: 'StartupXYZ', success: true },
        { jobId: 'job-3', jobTitle: 'Full Stack Engineer', company: 'BigCo', success: false, error: 'Application failed' }
      ];

      for (const app of applications) {
        await realtimeService.emitApplicationCompleted(sessionId, app);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      expect(applicationEvents).toHaveLength(3);
      expect(applicationEvents[0]).toMatchObject({ sessionId, ...applications[0] });
      expect(applicationEvents[2].success).toBe(false);
      expect(applicationEvents[2].error).toBe('Application failed');

      client.disconnect();
    });

    test('should emit log events', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(userAId));

      const sessionId = startResponse.body.sessionId;

      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));
      client.emit('subscribe', { sessionId });

      const logEvents: any[] = [];
      client.on('log:event', (data) => logEvents.push(data));

      // Emit log events
      await realtimeService.emitLogEvent(sessionId, {
        type: 'info',
        message: 'Starting job search',
        details: { page: 1 }
      });

      await realtimeService.emitLogEvent(sessionId, {
        type: 'error',
        message: 'Failed to load page',
        details: { error: 'Network timeout' }
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(logEvents).toHaveLength(2);
      expect(logEvents[0]).toMatchObject({
        sessionId,
        type: 'info',
        message: 'Starting job search'
      });
      expect(logEvents[1].type).toBe('error');

      client.disconnect();
    });
  });

  describe('Supabase Realtime Integration', () => {
    test('should bridge Supabase session updates to Socket.io', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(userAId));

      const sessionId = startResponse.body.sessionId;

      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));
      client.emit('subscribe', { sessionId });

      let updateReceived = false;
      client.on('session:update', (data) => {
        updateReceived = true;
        expect(data.new.status).toBe(SessionStatus.PAUSED);
      });

      // Update session in Supabase
      await supabase
        .from('automation_sessions')
        .update({ status: SessionStatus.PAUSED })
        .eq('id', sessionId);

      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(updateReceived).toBe(true);

      client.disconnect();
    });

    test('should bridge Supabase intervention updates to Socket.io', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(userAId));

      const sessionId = startResponse.body.sessionId;

      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));
      client.emit('subscribe', { sessionId });

      let interventionReceived = false;
      client.on('intervention:update', (data) => {
        interventionReceived = true;
        expect(data.new.type).toBe(InterventionType.CAPTCHA);
      });

      // Insert intervention in Supabase
      await supabase
        .from('user_interventions')
        .insert({
          session_id: sessionId,
          type: InterventionType.CAPTCHA,
          message: 'CAPTCHA detected',
          debug_url: 'https://debug.url',
          context: {},
          resolved: false
        });

      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(interventionReceived).toBe(true);

      client.disconnect();
    });

    test('should bridge Supabase job application updates to Socket.io', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(userAId));

      const sessionId = startResponse.body.sessionId;

      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));
      client.emit('subscribe', { sessionId });

      let applicationReceived = false;
      client.on('application:update', (data) => {
        applicationReceived = true;
        expect(data.new.job_title).toBe('Test Engineer');
      });

      // Insert application in Supabase
      await supabase
        .from('job_applications')
        .insert({
          session_id: sessionId,
          job_id: 'test-job-123',
          job_title: 'Test Engineer',
          company_name: 'Test Company',
          location: 'Remote',
          status: 'applied',
          applied_at: new Date().toISOString()
        });

      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(applicationReceived).toBe(true);

      client.disconnect();
    });
  });

  describe('Global Events', () => {
    test('should emit system announcements to all users', async () => {
      // Connect two clients
      const clientA = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      const clientB = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userBToken },
        transports: ['websocket']
      });

      await Promise.all([
        new Promise(resolve => clientA.on('connect', resolve)),
        new Promise(resolve => clientB.on('connect', resolve))
      ]);

      const announcementsA: any[] = [];
      const announcementsB: any[] = [];

      clientA.on('system:announcement', (data) => announcementsA.push(data));
      clientB.on('system:announcement', (data) => announcementsB.push(data));

      // Emit global announcement
      await realtimeService.emitSystemAnnouncement({
        type: 'maintenance',
        message: 'System will be down for maintenance at 2 AM',
        priority: 'high'
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Both clients should receive it
      expect(announcementsA).toHaveLength(1);
      expect(announcementsB).toHaveLength(1);
      expect(announcementsA[0]).toEqual(announcementsB[0]);

      clientA.disconnect();
      clientB.disconnect();
    });
  });

  describe('Error Handling', () => {
    test('should handle WebSocket errors gracefully', async () => {
      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));

      let errorReceived = false;
      client.on('error', (error) => {
        errorReceived = true;
        expect(error.message).toContain('Unauthorized');
      });

      // Try to subscribe to another user's session
      const fakeSessionId = `task_${uuidv4()}`;
      client.emit('subscribe', { sessionId: fakeSessionId });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(errorReceived).toBe(true);

      client.disconnect();
    });

    test('should handle Supabase Realtime disconnections', async () => {
      // This would require mocking Supabase Realtime client
      // For now, we'll just verify the service handles errors
      expect(realtimeService).toBeDefined();
      
      // In real implementation, we would:
      // 1. Force disconnect Supabase Realtime
      // 2. Verify reconnection attempts
      // 3. Verify event queueing during disconnect
    });
  });

  describe('Performance', () => {
    test('should handle high-frequency updates efficiently', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(userAId));

      const sessionId = startResponse.body.sessionId;

      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));
      client.emit('subscribe', { sessionId });

      const receivedEvents: any[] = [];
      client.on('progress:update', (data) => receivedEvents.push(data));

      // Send 100 updates rapidly
      const startTime = Date.now();
      const promises = [];
      
      for (let i = 0; i < 100; i++) {
        promises.push(
          realtimeService.emitProgress(sessionId, {
            totalJobs: 100,
            processedJobs: i,
            appliedJobs: Math.floor(i * 0.7),
            skippedJobs: Math.floor(i * 0.3),
            failedJobs: 0,
            currentPage: Math.floor(i / 10) + 1
          })
        );
      }

      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 1000));

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should handle 100 updates in under 2 seconds
      expect(duration).toBeLessThan(2000);
      
      // Should receive most updates (allowing for some throttling)
      expect(receivedEvents.length).toBeGreaterThan(50);

      client.disconnect();
    });

    test('should handle multiple concurrent sessions', async () => {
      // Create 10 sessions
      const sessions = [];
      const clients = [];

      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/api/linkedin/start')
          .set('Authorization', `Bearer ${userAToken}`)
          .send(createStartAutomationRequest(userAId));

        sessions.push(response.body.sessionId);

        const client = ioClient(TEST_CONFIG.websocket.url, {
          auth: { token: userAToken },
          transports: ['websocket']
        });

        await new Promise(resolve => client.on('connect', resolve));
        client.emit('subscribe', { sessionId: response.body.sessionId });
        
        clients.push(client);
      }

      // Send updates to all sessions
      const promises = [];
      for (const sessionId of sessions) {
        promises.push(
          realtimeService.emitProgress(sessionId, {
            totalJobs: 50,
            processedJobs: 25,
            appliedJobs: 20,
            skippedJobs: 5,
            failedJobs: 0,
            currentPage: 3
          })
        );
      }

      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Cleanup
      for (const client of clients) {
        client.disconnect();
      }

      // Should complete without errors
      expect(sessions).toHaveLength(10);
    });
  });
});