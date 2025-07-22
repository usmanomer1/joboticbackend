import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { Server } from 'http';
import { io as ioClient, Socket } from 'socket.io-client';
import { createTestSupabaseClient, createTestSupabaseAnonClient, TEST_CONFIG, TEST_USERS } from './setup/testConfig';
import { createTestUser, createTestSession, createStartAutomationRequest } from './setup/testFactories';
import { MockBrowserbaseClient, MockStagehandInstance, MockWebSocketClient, MockRedisClient } from './setup/mockServices';
import { LinkedInAutomationController } from '../../controllers/linkedinAutomation.controller';
import { RealtimeAutomationService } from '../../services/realtime/realtimeAutomationService';
import { SessionStateManager } from '../../services/state/sessionStateManager';
import { SupabaseAutomationService } from '../../services/supabase/supabaseAutomationService';
import { v4 as uuidv4 } from 'uuid';

describe('LinkedIn Automation - Security & Isolation Suite', () => {
  let app: any;
  let server: Server;
  let controller: LinkedInAutomationController;
  let realtimeService: RealtimeAutomationService;
  let stateManager: SessionStateManager;
  let supabaseService: SupabaseAutomationService;
  let mockBrowserbase: MockBrowserbaseClient;
  let mockRedis: MockRedisClient;
  let supabase: any;
  let anonSupabase: any;
  let userAToken: string;
  let userBToken: string;

  beforeAll(async () => {
    // Initialize test Supabase clients
    supabase = createTestSupabaseClient();
    anonSupabase = createTestSupabaseAnonClient();

    // Create test users
    const { data: userA, error: errorA } = await supabase.auth.admin.createUser({
      email: TEST_USERS.userA.email,
      password: TEST_USERS.userA.password,
      email_confirm: true
    });
    if (errorA) throw errorA;
    TEST_USERS.userA.id = userA.user.id;

    const { data: userB, error: errorB } = await supabase.auth.admin.createUser({
      email: TEST_USERS.userB.email,
      password: TEST_USERS.userB.password,
      email_confirm: true
    });
    if (errorB) throw errorB;
    TEST_USERS.userB.id = userB.user.id;

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
    
    // Initialize controller with mocks
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
    router.post('/upload-resume', controller.uploadResume.bind(controller));
    
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
    
    // Delete test users
    await supabase.auth.admin.deleteUser(TEST_USERS.userA.id);
    await supabase.auth.admin.deleteUser(TEST_USERS.userB.id);
  });

  beforeEach(async () => {
    // Clear all data
    mockBrowserbase.clearAllSessions();
    mockRedis.flushdb();
    await supabase.from('automation_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('automation_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  });

  describe('Authentication', () => {
    test('should reject requests without auth token', async () => {
      const response = await request(app)
        .post('/api/linkedin/start')
        .send(createStartAutomationRequest(TEST_USERS.userA.id));

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Missing authorization header');
    });

    test('should reject requests with invalid auth token', async () => {
      const response = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', 'Bearer invalid-token')
        .send(createStartAutomationRequest(TEST_USERS.userA.id));

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');
    });

    test('should accept requests with valid auth token', async () => {
      const response = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(TEST_USERS.userA.id));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessionId');
    });

    test('should reject WebSocket connections without auth', async () => {
      const client = ioClient(TEST_CONFIG.websocket.url, {
        autoConnect: false,
        transports: ['websocket']
      });

      let connected = false;
      let error: any = null;

      client.on('connect', () => { connected = true; });
      client.on('connect_error', (err) => { error = err; });

      client.connect();
      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(connected).toBe(false);
      expect(error).toBeTruthy();

      client.disconnect();
    });

    test('should accept WebSocket connections with valid auth', async () => {
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
  });

  describe('User Isolation', () => {
    test('should prevent user A from accessing user B sessions', async () => {
      // User B creates a session
      const createResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userBToken}`)
        .send(createStartAutomationRequest(TEST_USERS.userB.id));

      const sessionId = createResponse.body.sessionId;

      // User A tries to access it
      const statusResponse = await request(app)
        .get(`/api/linkedin/status/${sessionId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(statusResponse.status).toBe(403);
      expect(statusResponse.body.error).toBe('Unauthorized access to session');
    });

    test('should prevent user A from pausing user B sessions', async () => {
      // User B creates a session
      const createResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userBToken}`)
        .send(createStartAutomationRequest(TEST_USERS.userB.id));

      const sessionId = createResponse.body.sessionId;

      // User A tries to pause it
      const pauseResponse = await request(app)
        .post(`/api/linkedin/pause/${sessionId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(pauseResponse.status).toBe(403);
      expect(pauseResponse.body.error).toBe('Unauthorized access to session');
    });

    test('should isolate WebSocket rooms between users', async () => {
      // Create sessions for both users
      const sessionA = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(TEST_USERS.userA.id));

      const sessionB = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userBToken}`)
        .send(createStartAutomationRequest(TEST_USERS.userB.id));

      // Connect both users to WebSocket
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

      // Subscribe to sessions
      clientA.emit('subscribe', { sessionId: sessionA.body.sessionId });
      clientB.emit('subscribe', { sessionId: sessionB.body.sessionId });

      // User A should not receive events from User B's session
      const receivedEvents: any[] = [];
      clientA.on('progress:update', (data) => receivedEvents.push(data));

      // Emit progress for User B's session
      realtimeService.emitProgress(sessionB.body.sessionId, {
        totalJobs: 10,
        processedJobs: 5,
        appliedJobs: 3,
        skippedJobs: 2,
        failedJobs: 0,
        currentPage: 1
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(receivedEvents).toHaveLength(0);

      clientA.disconnect();
      clientB.disconnect();
    });

    test('should prevent cross-user data access in state manager', async () => {
      // User A saves state
      const sessionA = uuidv4();
      await stateManager.saveSessionState(sessionA, {
        sessionId: sessionA,
        userId: TEST_USERS.userA.id,
        status: 'running' as any,
        config: {} as any,
        startedAt: new Date(),
        lastActiveAt: new Date(),
        stagehandReady: true
      });

      // User B tries to access via session ownership check
      const userSessions = await stateManager.getUserSessions(TEST_USERS.userB.id);
      expect(userSessions).not.toContain(sessionA);

      // Verify User A can access their own session
      const userASession = await stateManager.getUserSessions(TEST_USERS.userA.id);
      expect(userASession).toContain(sessionA);
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce per-user rate limits', async () => {
      // Make requests up to the limit
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/linkedin/start')
            .set('Authorization', `Bearer ${userAToken}`)
            .send(createStartAutomationRequest(TEST_USERS.userA.id))
        );
      }

      const responses = await Promise.all(promises);
      expect(responses.every(r => r.status === 200)).toBe(true);

      // 11th request should be rate limited
      const rateLimitedResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(TEST_USERS.userA.id));

      expect(rateLimitedResponse.status).toBe(429);
      expect(rateLimitedResponse.body.error).toContain('Rate limit exceeded');
    });

    test('should not share rate limits between users', async () => {
      // User A hits rate limit
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/linkedin/start')
            .set('Authorization', `Bearer ${userAToken}`)
            .send(createStartAutomationRequest(TEST_USERS.userA.id))
        );
      }
      await Promise.all(promises);

      // User B can still make requests
      const userBResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userBToken}`)
        .send(createStartAutomationRequest(TEST_USERS.userB.id));

      expect(userBResponse.status).toBe(200);
    });
  });

  describe('Session Security', () => {
    test('should validate session ownership for all operations', async () => {
      // Create session for User B
      const createResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userBToken}`)
        .send(createStartAutomationRequest(TEST_USERS.userB.id));

      const sessionId = createResponse.body.sessionId;
      const operations = [
        { method: 'get', path: `/api/linkedin/status/${sessionId}` },
        { method: 'post', path: `/api/linkedin/pause/${sessionId}` },
        { method: 'post', path: `/api/linkedin/resume/${sessionId}` },
        { method: 'post', path: `/api/linkedin/stop/${sessionId}` },
        { method: 'get', path: `/api/linkedin/results/${sessionId}` }
      ];

      // User A tries all operations
      for (const op of operations) {
        const response = await (request(app) as any)[op.method](op.path)
          .set('Authorization', `Bearer ${userAToken}`);

        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Unauthorized access to session');
      }
    });

    test('should prevent session hijacking via WebSocket', async () => {
      // User B creates a session
      const createResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userBToken}`)
        .send(createStartAutomationRequest(TEST_USERS.userB.id));

      const sessionId = createResponse.body.sessionId;

      // User A connects to WebSocket
      const clientA = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userAToken },
        transports: ['websocket']
      });

      await new Promise(resolve => clientA.on('connect', resolve));

      // User A tries to subscribe to User B's session
      let subscribed = false;
      let error: any = null;

      clientA.on('subscribed', () => { subscribed = true; });
      clientA.on('error', (err) => { error = err; });

      clientA.emit('subscribe', { sessionId });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(subscribed).toBe(false);
      expect(error).toBeTruthy();
      expect(error.message).toContain('Unauthorized');

      clientA.disconnect();
    });

    test('should sanitize user input to prevent injection attacks', async () => {
      const maliciousConfig = {
        userId: TEST_USERS.userA.id,
        config: {
          jobTitle: '<script>alert("xss")</script>',
          location: '"; DROP TABLE users; --',
          keywords: ['${process.env.API_KEY}', '{{constructor.constructor("return process")()}}']
        }
      };

      const response = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(maliciousConfig);

      expect(response.status).toBe(200);
      
      // Verify data was sanitized in database
      const { data: session } = await supabase
        .from('automation_sessions')
        .select('job_search_config')
        .eq('id', response.body.sessionId)
        .single();

      expect(session.job_search_config.jobTitle).not.toContain('<script>');
      expect(session.job_search_config.location).not.toContain('DROP TABLE');
    });
  });

  describe('Concurrent Session Limits', () => {
    test('should enforce maximum concurrent sessions per user', async () => {
      // Create 3 sessions (assuming limit is 3)
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/api/linkedin/start')
          .set('Authorization', `Bearer ${userAToken}`)
          .send(createStartAutomationRequest(TEST_USERS.userA.id));
        
        expect(response.status).toBe(200);
        sessions.push(response.body.sessionId);
      }

      // 4th session should fail
      const response = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(createStartAutomationRequest(TEST_USERS.userA.id));

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Maximum concurrent sessions');
    });

    test('should not count completed sessions towards limit', async () => {
      // Create and complete 2 sessions
      for (let i = 0; i < 2; i++) {
        const response = await request(app)
          .post('/api/linkedin/start')
          .set('Authorization', `Bearer ${userAToken}`)
          .send(createStartAutomationRequest(TEST_USERS.userA.id));

        await request(app)
          .post(`/api/linkedin/stop/${response.body.sessionId}`)
          .set('Authorization', `Bearer ${userAToken}`);
      }

      // Should be able to create 3 more
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/api/linkedin/start')
          .set('Authorization', `Bearer ${userAToken}`)
          .send(createStartAutomationRequest(TEST_USERS.userA.id));
        
        expect(response.status).toBe(200);
        sessions.push(response.body.sessionId);
      }
    });
  });
});