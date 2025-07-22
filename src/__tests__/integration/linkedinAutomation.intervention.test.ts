import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { Server } from 'http';
import { io as ioClient, Socket } from 'socket.io-client';
import { createTestSupabaseClient, createTestSupabaseAnonClient, TEST_CONFIG, TEST_USERS } from './setup/testConfig';
import { createTestSession, createStartAutomationRequest, createInterventionEvent } from './setup/testFactories';
import { MockBrowserbaseClient, MockStagehandInstance, MockWebSocketClient, MockRedisClient } from './setup/mockServices';
import { LinkedInAutomationController } from '../../controllers/linkedinAutomation.controller';
import { RealtimeAutomationService } from '../../services/realtime/realtimeAutomationService';
import { SessionStateManager } from '../../services/state/sessionStateManager';
import { SupabaseAutomationService } from '../../services/supabase/supabaseAutomationService';
import { LinkedInAutomationService } from '../../services/automation/linkedinAutomationService';
import { InterventionDetectionService } from '../../services/automation/interventionDetectionService';
import { InterventionType, SessionStatus } from '../../types/automation.types';
import { v4 as uuidv4 } from 'uuid';

describe('LinkedIn Automation - Intervention Flow Suite', () => {
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
    
    app.use('/api/linkedin', router);

    // Start server
    server = app.listen(TEST_CONFIG.server.port);

    // Initialize realtime service
    realtimeService = new RealtimeAutomationService(server, supabase);
    await realtimeService.initialize();

    // Initialize automation service with mocks
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
    await supabase.from('user_interventions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  });

  describe('Intervention Detection', () => {
    test('should detect login intervention and pause automation', async () => {
      // Start automation
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      // Connect WebSocket client
      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));
      client.emit('subscribe', { sessionId });

      // Set up intervention listener
      let interventionReceived = false;
      let interventionData: any = null;

      client.on('intervention:required', (data) => {
        interventionReceived = true;
        interventionData = data;
      });

      // Get mock Stagehand instance and simulate login intervention
      const bbSession = mockBrowserbase.getSession(startResponse.body.sessionId.replace('task_', ''));
      const mockStagehand = new MockStagehandInstance({ 
        browserbaseSessionID: bbSession.sessionId 
      });
      mockStagehand.simulateIntervention('login');

      // Trigger intervention check
      const elements = await mockStagehand.observe({ instruction: 'Check for login' });
      const detected = await interventionService.detectIntervention(
        elements,
        mockStagehand.page,
        'checking_login'
      );

      expect(detected).toBeTruthy();
      expect(detected?.type).toBe(InterventionType.LOGIN);

      // Simulate automation service detecting and handling intervention
      await automationService.handleIntervention(sessionId, detected!);

      // Wait for WebSocket event
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(interventionReceived).toBe(true);
      expect(interventionData).toMatchObject({
        sessionId,
        type: InterventionType.LOGIN,
        message: expect.stringContaining('login')
      });

      // Verify session is paused
      const statusResponse = await request(app)
        .get(`/api/linkedin/status/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(statusResponse.body.status).toBe(SessionStatus.PAUSED);

      client.disconnect();
    });

    test('should detect CAPTCHA intervention', async () => {
      const mockStagehand = new MockStagehandInstance({ 
        browserbaseSessionID: 'test-session' 
      });
      mockStagehand.simulateIntervention('captcha');

      const elements = await mockStagehand.observe({ instruction: 'Check for CAPTCHA' });
      const detected = await interventionService.detectIntervention(
        elements,
        mockStagehand.page,
        'checking_captcha'
      );

      expect(detected).toBeTruthy();
      expect(detected?.type).toBe(InterventionType.CAPTCHA);
      expect(detected?.elements).toHaveLength(2);
    });

    test('should detect Two-Factor Authentication intervention', async () => {
      const mockStagehand = new MockStagehandInstance({ 
        browserbaseSessionID: 'test-session' 
      });
      mockStagehand.simulateIntervention('twoFa');

      const elements = await mockStagehand.observe({ instruction: 'Check for 2FA' });
      const detected = await interventionService.detectIntervention(
        elements,
        mockStagehand.page,
        'checking_2fa'
      );

      expect(detected).toBeTruthy();
      expect(detected?.type).toBe(InterventionType.TWO_FA);
    });

    test('should save intervention to database', async () => {
      // Start automation
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      // Create intervention
      const intervention = {
        type: InterventionType.LOGIN,
        message: 'LinkedIn login required',
        debugUrl: mockBrowserbase.getDebugUrl(sessionId),
        context: { url: 'https://www.linkedin.com/login' },
        elements: [
          { selector: 'input[type="email"]', description: 'Email field' },
          { selector: 'input[type="password"]', description: 'Password field' }
        ]
      };

      await supabaseService.saveIntervention(sessionId, intervention);

      // Verify saved to database
      const { data, error } = await supabase
        .from('user_interventions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      expect(error).toBeNull();
      expect(data).toMatchObject({
        session_id: sessionId,
        type: InterventionType.LOGIN,
        message: 'LinkedIn login required',
        resolved: false
      });
    });
  });

  describe('Pause and Resume Flow', () => {
    test('should pause automation on intervention', async () => {
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

      // Trigger pause via API
      const pauseResponse = await request(app)
        .post(`/api/linkedin/pause/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(pauseResponse.status).toBe(200);
      expect(pauseResponse.body.status).toBe('paused');

      // Wait for WebSocket update
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(statusUpdate).toMatchObject({
        sessionId,
        status: SessionStatus.PAUSED
      });

      // Verify Browserbase session is paused
      const bbSessionId = startResponse.body.sessionId.replace('task_', '');
      const bbSession = mockBrowserbase.getSession(bbSessionId);
      expect(bbSession.status).toBe('paused');

      client.disconnect();
    });

    test('should save pause state with context', async () => {
      // Start automation
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      // Save pause state
      const pauseState = {
        pausedAt: new Date(),
        reason: InterventionType.LOGIN,
        currentUrl: 'https://www.linkedin.com/login',
        pageContext: {
          title: 'LinkedIn Login',
          cookies: []
        },
        resumeData: {
          lastProcessedJobIndex: 5,
          currentSearchPage: 2
        }
      };

      await stateManager.savePauseState(sessionId, pauseState);

      // Retrieve pause state
      const savedState = await stateManager.getPauseState(sessionId);
      expect(savedState).toMatchObject({
        reason: InterventionType.LOGIN,
        currentUrl: 'https://www.linkedin.com/login',
        resumeData: {
          lastProcessedJobIndex: 5,
          currentSearchPage: 2
        }
      });
    });

    test('should resume automation from pause state', async () => {
      // Start automation
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      // Pause automation
      await request(app)
        .post(`/api/linkedin/pause/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Save pause state
      await stateManager.savePauseState(sessionId, {
        pausedAt: new Date(),
        reason: InterventionType.LOGIN,
        currentUrl: 'https://www.linkedin.com/jobs',
        resumeData: {
          lastProcessedJobIndex: 10,
          currentSearchPage: 3
        }
      });

      // Mark intervention as resolved
      await supabase
        .from('user_interventions')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('session_id', sessionId);

      // Resume automation
      const resumeResponse = await request(app)
        .post(`/api/linkedin/resume/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(resumeResponse.status).toBe(200);
      expect(resumeResponse.body.status).toBe('running');

      // Verify Browserbase session is resumed
      const bbSessionId = startResponse.body.sessionId.replace('task_', '');
      const bbSession = mockBrowserbase.getSession(bbSessionId);
      expect(bbSession.status).toBe('active');

      // Verify pause state is cleared
      const pauseState = await stateManager.getPauseState(sessionId);
      expect(pauseState).toBeNull();
    });

    test('should prevent resume if intervention not resolved', async () => {
      // Start and pause automation
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      await request(app)
        .post(`/api/linkedin/pause/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Create unresolved intervention
      await supabaseService.saveIntervention(sessionId, {
        type: InterventionType.LOGIN,
        message: 'Login required',
        debugUrl: 'https://debug.url',
        context: {}
      });

      // Try to resume
      const resumeResponse = await request(app)
        .post(`/api/linkedin/resume/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(resumeResponse.status).toBe(400);
      expect(resumeResponse.body.error).toContain('unresolved intervention');
    });
  });

  describe('Live View Integration', () => {
    test('should provide correct debug URL on intervention', async () => {
      // Start automation
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;
      const liveViewUrl = startResponse.body.liveViewUrl;

      expect(liveViewUrl).toMatch(/^https:\/\/mock\.browserbase\.com\/debug\//);

      // Trigger intervention
      const client = ioClient(TEST_CONFIG.websocket.url, {
        auth: { token: userToken },
        transports: ['websocket']
      });

      await new Promise(resolve => client.on('connect', resolve));
      client.emit('subscribe', { sessionId });

      let interventionData: any = null;
      client.on('intervention:required', (data) => {
        interventionData = data;
      });

      // Simulate intervention
      await automationService.handleIntervention(sessionId, {
        type: InterventionType.LOGIN,
        message: 'Login required',
        elements: [],
        context: {}
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      expect(interventionData).toBeTruthy();
      expect(interventionData.liveViewUrl).toBe(liveViewUrl);

      client.disconnect();
    });

    test('should maintain debug URL across pause/resume', async () => {
      // Start automation
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;
      const originalUrl = startResponse.body.liveViewUrl;

      // Pause
      await request(app)
        .post(`/api/linkedin/pause/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Resume
      await supabase
        .from('user_interventions')
        .update({ resolved: true })
        .eq('session_id', sessionId);

      const resumeResponse = await request(app)
        .post(`/api/linkedin/resume/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Debug URL should remain the same
      const statusResponse = await request(app)
        .get(`/api/linkedin/status/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(statusResponse.body.liveViewUrl).toBe(originalUrl);
    });
  });

  describe('Intervention Types', () => {
    const interventionTypes = [
      {
        type: 'login',
        expectedType: InterventionType.LOGIN,
        elements: ['email input', 'password input', 'sign in button']
      },
      {
        type: 'captcha',
        expectedType: InterventionType.CAPTCHA,
        elements: ['recaptcha widget', 'iframe']
      },
      {
        type: 'twoFa',
        expectedType: InterventionType.TWO_FA,
        elements: ['code input', 'verify button']
      }
    ];

    interventionTypes.forEach(({ type, expectedType, elements }) => {
      test(`should handle ${type} intervention correctly`, async () => {
        const mockStagehand = new MockStagehandInstance({ 
          browserbaseSessionID: 'test-session' 
        });
        mockStagehand.simulateIntervention(type);

        const detectedElements = await mockStagehand.observe({ 
          instruction: `Check for ${type}` 
        });
        
        const intervention = await interventionService.detectIntervention(
          detectedElements,
          mockStagehand.page,
          `checking_${type}`
        );

        expect(intervention).toBeTruthy();
        expect(intervention?.type).toBe(expectedType);
        expect(intervention?.elements.length).toBeGreaterThan(0);
        
        elements.forEach(elem => {
          expect(
            intervention?.elements.some(e => 
              e.description.toLowerCase().includes(elem)
            )
          ).toBe(true);
        });
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle intervention detection errors gracefully', async () => {
      const mockStagehand = new MockStagehandInstance({ 
        browserbaseSessionID: 'test-session' 
      });

      // Force an error by passing invalid data
      const intervention = await interventionService.detectIntervention(
        null as any,
        mockStagehand.page,
        'error_test'
      );

      expect(intervention).toBeNull();
    });

    test('should recover from pause/resume failures', async () => {
      // Start automation
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      // Force Browserbase to fail
      const bbSessionId = startResponse.body.sessionId.replace('task_', '');
      mockBrowserbase.terminateSession(bbSessionId);

      // Pause should still work (state saved)
      const pauseResponse = await request(app)
        .post(`/api/linkedin/pause/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(pauseResponse.status).toBe(200);

      // Verify state is saved despite Browserbase failure
      const state = await stateManager.getSessionState(sessionId);
      expect(state?.status).toBe(SessionStatus.PAUSED);
    });
  });
});