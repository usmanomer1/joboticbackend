import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { Server } from 'http';
import { createTestSupabaseClient, createTestSupabaseAnonClient, TEST_CONFIG, TEST_USERS } from './setup/testConfig';
import { 
  createStartAutomationRequest,
  createStartAutomationResponse,
  createStatusResponse,
  createTestJobApplication
} from './setup/testFactories';
import { MockBrowserbaseClient, MockRedisClient } from './setup/mockServices';
import { LinkedInAutomationController } from '../../controllers/linkedinAutomation.controller';
import { RealtimeAutomationService } from '../../services/realtime/realtimeAutomationService';
import { SessionStateManager } from '../../services/state/sessionStateManager';
import { SupabaseAutomationService } from '../../services/supabase/supabaseAutomationService';
import { SessionStatus } from '../../types/automation.types';
import { v4 as uuidv4 } from 'uuid';

describe('LinkedIn Automation - API Compatibility Suite', () => {
  let app: any;
  let server: Server;
  let controller: LinkedInAutomationController;
  let realtimeService: RealtimeAutomationService;
  let stateManager: SessionStateManager;
  let supabaseService: SupabaseAutomationService;
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

  describe('Browser Use API Compatibility', () => {
    test('POST /start should match Browser Use response format', async () => {
      const response = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      expect(response.status).toBe(200);
      
      // Exact Browser Use response format
      expect(response.body).toMatchObject({
        sessionId: expect.stringMatching(/^task_[a-f0-9-]+$/),
        liveViewUrl: expect.stringMatching(/^https:\/\/.*\/debug\//),
        status: 'running',
        taskId: expect.stringMatching(/^task_[a-f0-9-]+$/)
      });

      // Verify sessionId and taskId are the same (Browser Use compatibility)
      expect(response.body.sessionId).toBe(response.body.taskId);
    });

    test('GET /status/:sessionId should match Browser Use format', async () => {
      // Start automation
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      // Get status
      const statusResponse = await request(app)
        .get(`/api/linkedin/status/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(statusResponse.status).toBe(200);
      
      // Browser Use status format
      expect(statusResponse.body).toMatchObject({
        status: expect.stringMatching(/^(pending|running|paused|completed|stopped|failed)$/),
        progress: {
          totalJobs: expect.any(Number),
          processedJobs: expect.any(Number),
          appliedJobs: expect.any(Number),
          skippedJobs: expect.any(Number),
          failedJobs: expect.any(Number),
          currentPage: expect.any(Number)
        },
        currentStep: expect.any(String),
        liveViewUrl: expect.stringMatching(/^https:\/\/.*\/debug\//)
      });

      // Optional fields that Browser Use includes
      if (statusResponse.body.error) {
        expect(statusResponse.body.error).toMatchObject({
          message: expect.any(String),
          type: expect.any(String)
        });
      }
    });

    test('POST /pause/:sessionId should match Browser Use format', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      const pauseResponse = await request(app)
        .post(`/api/linkedin/pause/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(pauseResponse.status).toBe(200);
      expect(pauseResponse.body).toMatchObject({
        status: 'paused',
        message: expect.stringContaining('paused')
      });
    });

    test('POST /resume/:sessionId should match Browser Use format', async () => {
      // Start and pause
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      await request(app)
        .post(`/api/linkedin/pause/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Mark interventions as resolved
      await supabase
        .from('user_interventions')
        .update({ resolved: true })
        .eq('session_id', sessionId);

      const resumeResponse = await request(app)
        .post(`/api/linkedin/resume/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(resumeResponse.status).toBe(200);
      expect(resumeResponse.body).toMatchObject({
        status: 'running',
        message: expect.stringContaining('resumed')
      });
    });

    test('POST /stop/:sessionId should match Browser Use format', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      const stopResponse = await request(app)
        .post(`/api/linkedin/stop/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(stopResponse.status).toBe(200);
      expect(stopResponse.body).toMatchObject({
        status: 'stopped',
        message: expect.stringContaining('stopped')
      });
    });

    test('GET /results/:sessionId should match Browser Use format', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      // Add some applications
      for (let i = 0; i < 3; i++) {
        await supabaseService.saveJobApplication(sessionId, createTestJobApplication(sessionId, {
          job_id: `job-${i}`,
          job_title: `Job ${i}`,
          company_name: `Company ${i}`
        }));
      }

      const resultsResponse = await request(app)
        .get(`/api/linkedin/results/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(resultsResponse.status).toBe(200);
      
      // Browser Use results format
      expect(resultsResponse.body).toMatchObject({
        session: {
          id: sessionId,
          status: expect.any(String),
          job_search_config: expect.any(Object),
          created_at: expect.any(String),
          updated_at: expect.any(String)
        },
        applications: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            session_id: sessionId,
            job_id: expect.any(String),
            job_title: expect.any(String),
            company_name: expect.any(String),
            location: expect.any(String),
            status: expect.any(String),
            applied_at: expect.any(String)
          })
        ]),
        logs: expect.any(Array),
        summary: {
          totalApplications: 3,
          successfulApplications: 3,
          failedApplications: 0,
          totalJobsProcessed: expect.any(Number)
        }
      });
    });
  });

  describe('Request Validation', () => {
    test('should validate start automation request body', async () => {
      const invalidRequests = [
        {}, // Missing required fields
        { userId: userId }, // Missing config
        { 
          userId: userId,
          config: {} // Missing required config fields
        },
        {
          userId: userId,
          config: {
            jobTitle: '', // Empty job title
            location: 'SF'
          }
        }
      ];

      for (const invalidRequest of invalidRequests) {
        const response = await request(app)
          .post('/api/linkedin/start')
          .set('Authorization', `Bearer ${userToken}`)
          .send(invalidRequest);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      }
    });

    test('should accept valid start automation request', async () => {
      const validRequest = {
        userId: userId,
        config: {
          jobTitle: 'Software Engineer',
          location: 'San Francisco, CA',
          datePosted: 'week',
          experienceLevel: ['MID_LEVEL', 'SENIOR_LEVEL'],
          jobType: ['FULL_TIME', 'CONTRACT'],
          remote: true,
          easyApplyOnly: true,
          maxApplications: 50,
          keywords: ['typescript', 'react', 'node.js'],
          excludeKeywords: ['php', 'java'],
          salaryMin: 100000,
          companyBlacklist: ['Company A', 'Company B']
        }
      };

      const response = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessionId');
    });

    test('should validate sessionId format', async () => {
      const invalidSessionIds = [
        'invalid-id',
        '123',
        'session_123', // Wrong prefix
        ''
      ];

      for (const invalidId of invalidSessionIds) {
        const response = await request(app)
          .get(`/api/linkedin/status/${invalidId}`)
          .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid session ID');
      }
    });
  });

  describe('Error Responses', () => {
    test('should return 404 for non-existent session', async () => {
      const fakeSessionId = `task_${uuidv4()}`;
      
      const response = await request(app)
        .get(`/api/linkedin/status/${fakeSessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        error: 'Session not found'
      });
    });

    test('should return 400 for invalid state transitions', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const sessionId = startResponse.body.sessionId;

      // Stop the session
      await request(app)
        .post(`/api/linkedin/stop/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      // Try to pause a stopped session
      const pauseResponse = await request(app)
        .post(`/api/linkedin/pause/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(pauseResponse.status).toBe(400);
      expect(pauseResponse.body.error).toContain('Cannot pause');
    });

    test('should handle service unavailability gracefully', async () => {
      // Force Redis failure
      mockRedis.flushdb();
      Object.defineProperty(mockRedis, 'ping', {
        value: async () => { throw new Error('Redis unavailable'); }
      });

      // Should still work with fallback
      const response = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessionId');
    });
  });

  describe('Resume Upload', () => {
    test('should handle resume file upload', async () => {
      const fs = require('fs');
      const path = require('path');
      
      // Create test file
      const testResume = 'John Doe\nSoftware Engineer\nExperience: 5 years';
      const testFilePath = path.join(__dirname, 'test-resume.txt');
      fs.writeFileSync(testFilePath, testResume);

      const response = await request(app)
        .post('/api/linkedin/upload-resume')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('resume', testFilePath);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        resumeText: expect.stringContaining('John Doe')
      });

      // Cleanup
      fs.unlinkSync(testFilePath);
    });

    test('should reject invalid file types', async () => {
      const fs = require('fs');
      const path = require('path');
      
      // Create test file with invalid extension
      const testFilePath = path.join(__dirname, 'test-file.exe');
      fs.writeFileSync(testFilePath, 'invalid content');

      const response = await request(app)
        .post('/api/linkedin/upload-resume')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('resume', testFilePath);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid file type');

      // Cleanup
      fs.unlinkSync(testFilePath);
    });

    test('should enforce file size limits', async () => {
      const fs = require('fs');
      const path = require('path');
      
      // Create large file (>5MB)
      const largeContent = 'x'.repeat(6 * 1024 * 1024); // 6MB
      const testFilePath = path.join(__dirname, 'large-resume.pdf');
      fs.writeFileSync(testFilePath, largeContent);

      const response = await request(app)
        .post('/api/linkedin/upload-resume')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('resume', testFilePath);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('File too large');

      // Cleanup
      fs.unlinkSync(testFilePath);
    });
  });

  describe('Backward Compatibility', () => {
    test('should support legacy request format', async () => {
      // Legacy format used userId in body instead of from token
      const legacyRequest = {
        userId: userId,
        jobTitle: 'Software Engineer',
        location: 'San Francisco, CA',
        maxApplications: 10
      };

      // Should transform to new format internally
      const response = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(legacyRequest);

      // Should still work
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessionId');
    });

    test('should handle taskId for backward compatibility', async () => {
      const startResponse = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      const { sessionId, taskId } = startResponse.body;

      // Should accept both sessionId and taskId
      const statusResponse1 = await request(app)
        .get(`/api/linkedin/status/${sessionId}`)
        .set('Authorization', `Bearer ${userToken}`);

      const statusResponse2 = await request(app)
        .get(`/api/linkedin/status/${taskId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(statusResponse1.status).toBe(200);
      expect(statusResponse2.status).toBe(200);
      expect(statusResponse1.body).toEqual(statusResponse2.body);
    });
  });

  describe('Headers and CORS', () => {
    test('should include proper CORS headers', async () => {
      const response = await request(app)
        .options('/api/linkedin/start')
        .set('Origin', TEST_CONFIG.server.url);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-headers']).toContain('authorization');
    });

    test('should include rate limit headers', async () => {
      const response = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createStartAutomationRequest(userId));

      expect(response.headers['x-ratelimit-limit']).toBe('10');
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });
});