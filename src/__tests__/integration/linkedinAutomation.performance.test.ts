import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { Server } from 'http';
import { io as ioClient, Socket } from 'socket.io-client';
import { createTestSupabaseClient, createTestSupabaseAnonClient, TEST_CONFIG, TEST_USERS } from './setup/testConfig';
import { 
  createStartAutomationRequest,
  createTestSession,
  createTestJobApplication,
  generateMockJobListings
} from './setup/testFactories';
import { MockBrowserbaseClient, MockRedisClient } from './setup/mockServices';
import { LinkedInAutomationController } from '../../controllers/linkedinAutomation.controller';
import { RealtimeAutomationService } from '../../services/realtime/realtimeAutomationService';
import { SessionStateManager } from '../../services/state/sessionStateManager';
import { SupabaseAutomationService } from '../../services/supabase/supabaseAutomationService';
import { SessionStatus } from '../../types/automation.types';
import { v4 as uuidv4 } from 'uuid';

describe('LinkedIn Automation - Performance & Scale Suite', () => {
  let app: any;
  let server: Server;
  let controller: LinkedInAutomationController;
  let realtimeService: RealtimeAutomationService;
  let stateManager: SessionStateManager;
  let supabaseService: SupabaseAutomationService;
  let mockBrowserbase: MockBrowserbaseClient;
  let mockRedis: MockRedisClient;
  let supabase: any;
  let testUsers: Array<{ id: string; token: string; email: string }> = [];

  beforeAll(async () => {
    // Initialize test Supabase clients
    supabase = createTestSupabaseClient();
    const anonSupabase = createTestSupabaseAnonClient();

    // Create multiple test users for scale testing
    for (let i = 0; i < 5; i++) {
      const email = `test-user-${i}@example.com`;
      const { data: user, error } = await supabase.auth.admin.createUser({
        email,
        password: 'test-password-123',
        email_confirm: true
      });
      
      if (error) throw error;

      const { data: session } = await anonSupabase.auth.signInWithPassword({
        email,
        password: 'test-password-123'
      });

      testUsers.push({
        id: user.user.id,
        token: session.session.access_token,
        email
      });
    }

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
    
    // Delete all test users
    for (const user of testUsers) {
      await supabase.auth.admin.deleteUser(user.id);
    }
  });

  beforeEach(async () => {
    // Clear all data
    mockBrowserbase.clearAllSessions();
    mockRedis.flushdb();
    await supabase.from('automation_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('automation_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('job_applications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  });

  describe('Load Testing', () => {
    test('should handle 50 concurrent sessions', async () => {
      const startTime = Date.now();
      const sessionPromises = [];

      // Create 50 sessions across 5 users (10 each)
      for (let i = 0; i < 50; i++) {
        const user = testUsers[i % 5];
        sessionPromises.push(
          request(app)
            .post('/api/linkedin/start')
            .set('Authorization', `Bearer ${user.token}`)
            .send(createStartAutomationRequest(user.id))
        );
      }

      const responses = await Promise.all(sessionPromises);
      const endTime = Date.now();

      // All should succeed
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBe(50);

      // Should complete within 10 seconds
      expect(endTime - startTime).toBeLessThan(10000);

      // Verify all sessions are in state manager
      const allSessions = [];
      for (const response of responses) {
        if (response.status === 200) {
          const state = await stateManager.getSessionState(response.body.sessionId);
          expect(state).toBeTruthy();
          allSessions.push(response.body.sessionId);
        }
      }

      expect(allSessions).toHaveLength(50);
    });

    test('should handle 1000 job applications across sessions', async () => {
      // Create 10 sessions
      const sessions = [];
      for (let i = 0; i < 10; i++) {
        const user = testUsers[i % 5];
        const response = await request(app)
          .post('/api/linkedin/start')
          .set('Authorization', `Bearer ${user.token}`)
          .send(createStartAutomationRequest(user.id));
        
        sessions.push({
          sessionId: response.body.sessionId,
          userId: user.id
        });
      }

      const startTime = Date.now();
      const applicationPromises = [];

      // Create 100 applications per session
      for (const session of sessions) {
        for (let i = 0; i < 100; i++) {
          applicationPromises.push(
            supabaseService.saveJobApplication(session.sessionId, {
              job_id: `job-${session.sessionId}-${i}`,
              job_title: `Position ${i}`,
              company_name: `Company ${i}`,
              location: 'Remote',
              status: 'applied',
              applied_at: new Date().toISOString()
            })
          );
        }
      }

      await Promise.all(applicationPromises);
      const endTime = Date.now();

      // Should complete within 30 seconds
      expect(endTime - startTime).toBeLessThan(30000);

      // Verify all applications saved
      const { count } = await supabase
        .from('job_applications')
        .select('*', { count: 'exact', head: true });

      expect(count).toBe(1000);
    });

    test('should handle high-frequency WebSocket updates', async () => {
      // Create session
      const user = testUsers[0];
      const response = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${user.token}`)
        .send(createStartAutomationRequest(user.id));

      const sessionId = response.body.sessionId;

      // Connect 20 WebSocket clients
      const clients = [];
      for (let i = 0; i < 20; i++) {
        const client = ioClient(TEST_CONFIG.websocket.url, {
          auth: { token: user.token },
          transports: ['websocket']
        });

        await new Promise(resolve => client.on('connect', resolve));
        client.emit('subscribe', { sessionId });
        clients.push(client);
      }

      const startTime = Date.now();
      const updatePromises = [];

      // Send 500 progress updates
      for (let i = 0; i < 500; i++) {
        updatePromises.push(
          realtimeService.emitProgress(sessionId, {
            totalJobs: 1000,
            processedJobs: i * 2,
            appliedJobs: i,
            skippedJobs: i,
            failedJobs: 0,
            currentPage: Math.floor(i / 50) + 1
          })
        );
      }

      await Promise.all(updatePromises);
      const endTime = Date.now();

      // Should complete within 5 seconds
      expect(endTime - startTime).toBeLessThan(5000);

      // Cleanup
      for (const client of clients) {
        client.disconnect();
      }
    });
  });

  describe('Resource Management', () => {
    test('should handle Redis failures gracefully', async () => {
      // Simulate Redis failure
      const originalPing = mockRedis.ping;
      mockRedis.ping = async () => { throw new Error('Redis down'); };

      // Should still work with memory fallback
      const user = testUsers[0];
      const response = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${user.token}`)
        .send(createStartAutomationRequest(user.id));

      expect(response.status).toBe(200);

      // State operations should work
      const sessionId = response.body.sessionId;
      await stateManager.saveProgress(sessionId, {
        totalJobs: 100,
        processedJobs: 50,
        appliedJobs: 30,
        skippedJobs: 20,
        failedJobs: 0,
        currentPage: 5
      });

      const progress = await stateManager.getProgress(sessionId);
      expect(progress?.processedJobs).toBe(50);

      // Restore Redis
      mockRedis.ping = originalPing;
    });

    test('should prevent memory leaks with proper cleanup', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create and destroy 100 sessions
      for (let i = 0; i < 100; i++) {
        const user = testUsers[i % 5];
        const response = await request(app)
          .post('/api/linkedin/start')
          .set('Authorization', `Bearer ${user.token}`)
          .send(createStartAutomationRequest(user.id));

        const sessionId = response.body.sessionId;

        // Add some data
        await stateManager.saveProgress(sessionId, {
          totalJobs: 100,
          processedJobs: 50,
          appliedJobs: 30,
          skippedJobs: 20,
          failedJobs: 0,
          currentPage: 5
        });

        // Stop and cleanup
        await request(app)
          .post(`/api/linkedin/stop/${sessionId}`)
          .set('Authorization', `Bearer ${user.token}`);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (< 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('should handle duplicate prevention at scale', async () => {
      const user = testUsers[0];
      const jobIds = Array.from({ length: 1000 }, (_, i) => `job-${i}`);

      const startTime = Date.now();

      // Mark all jobs as applied
      const markPromises = jobIds.map(jobId => 
        stateManager.markJobAsApplied(user.id, jobId)
      );
      await Promise.all(markPromises);

      // Check duplicates
      const checkPromises = jobIds.map(jobId =>
        stateManager.hasAppliedToJob(user.id, jobId)
      );
      const results = await Promise.all(checkPromises);

      const endTime = Date.now();

      // All should be marked as applied
      expect(results.every(r => r === true)).toBe(true);

      // Should complete within 5 seconds
      expect(endTime - startTime).toBeLessThan(5000);

      // Get all recently applied jobs
      const recentJobs = await stateManager.getRecentlyAppliedJobs(user.id, 1000);
      expect(recentJobs).toHaveLength(1000);
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent session state updates', async () => {
      const user = testUsers[0];
      const response = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${user.token}`)
        .send(createStartAutomationRequest(user.id));

      const sessionId = response.body.sessionId;

      // Perform 100 concurrent updates
      const updatePromises = [];
      for (let i = 0; i < 100; i++) {
        updatePromises.push(
          stateManager.incrementProgress(sessionId, 'processedJobs')
        );
      }

      await Promise.all(updatePromises);

      // Should have processed exactly 100
      const progress = await stateManager.getProgress(sessionId);
      expect(progress?.processedJobs).toBe(100);
    });

    test('should handle session locking correctly', async () => {
      const sessionId = uuidv4();
      const lockPromises = [];

      // Try to acquire 10 locks concurrently
      for (let i = 0; i < 10; i++) {
        lockPromises.push(
          stateManager.acquireSessionLock(sessionId)
        );
      }

      const results = await Promise.all(lockPromises);

      // Only one should succeed
      const successCount = results.filter(r => r === true).length;
      expect(successCount).toBe(1);

      // Release lock
      await stateManager.releaseSessionLock(sessionId);

      // Now another should be able to acquire
      const newLock = await stateManager.acquireSessionLock(sessionId);
      expect(newLock).toBe(true);

      await stateManager.releaseSessionLock(sessionId);
    });

    test('should handle rate limiting across multiple users', async () => {
      const rateTestPromises = [];

      // Each user makes 12 requests (2 over limit)
      for (const user of testUsers) {
        for (let i = 0; i < 12; i++) {
          rateTestPromises.push(
            request(app)
              .post('/api/linkedin/start')
              .set('Authorization', `Bearer ${user.token}`)
              .send(createStartAutomationRequest(user.id))
              .then(res => ({ userId: user.id, status: res.status }))
          );
        }
      }

      const results = await Promise.all(rateTestPromises);

      // Each user should have 10 successful and 2 rate limited
      for (const user of testUsers) {
        const userResults = results.filter(r => r.userId === user.id);
        const successCount = userResults.filter(r => r.status === 200).length;
        const rateLimitCount = userResults.filter(r => r.status === 429).length;

        expect(successCount).toBe(10);
        expect(rateLimitCount).toBe(2);
      }
    });
  });

  describe('Database Performance', () => {
    test('should efficiently query large result sets', async () => {
      // Create session with many applications
      const user = testUsers[0];
      const response = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${user.token}`)
        .send(createStartAutomationRequest(user.id));

      const sessionId = response.body.sessionId;

      // Add 500 job applications
      const applications = [];
      for (let i = 0; i < 500; i++) {
        applications.push({
          session_id: sessionId,
          job_id: `job-${i}`,
          job_title: `Position ${i}`,
          company_name: `Company ${i % 50}`,
          location: i % 2 === 0 ? 'Remote' : 'San Francisco, CA',
          status: 'applied',
          applied_at: new Date(Date.now() - i * 60000).toISOString() // Spread over time
        });
      }

      await supabase.from('job_applications').insert(applications);

      const startTime = Date.now();

      // Query results
      const resultsResponse = await request(app)
        .get(`/api/linkedin/results/${sessionId}`)
        .set('Authorization', `Bearer ${user.token}`);

      const endTime = Date.now();

      expect(resultsResponse.status).toBe(200);
      expect(resultsResponse.body.applications).toHaveLength(500);
      
      // Should complete within 2 seconds
      expect(endTime - startTime).toBeLessThan(2000);
    });

    test('should handle pagination efficiently', async () => {
      const user = testUsers[0];
      
      // Create 10 sessions
      const sessionIds = [];
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/api/linkedin/start')
          .set('Authorization', `Bearer ${user.token}`)
          .send(createStartAutomationRequest(user.id));
        
        sessionIds.push(response.body.sessionId);
      }

      // Query with pagination
      const { data: sessions, error } = await supabase
        .from('automation_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      expect(error).toBeNull();
      expect(sessions).toHaveLength(5);
    });
  });

  describe('Stress Testing', () => {
    test('should maintain performance under sustained load', async () => {
      const metrics = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        avgResponseTime: 0,
        responseTimes: [] as number[]
      };

      const testDuration = 10000; // 10 seconds
      const startTime = Date.now();
      const requestPromises = [];

      // Continuous requests for 10 seconds
      while (Date.now() - startTime < testDuration) {
        const user = testUsers[Math.floor(Math.random() * testUsers.length)];
        const requestStartTime = Date.now();

        const promise = request(app)
          .get(`/api/linkedin/status/task_${uuidv4()}`)
          .set('Authorization', `Bearer ${user.token}`)
          .then(res => {
            metrics.totalRequests++;
            const responseTime = Date.now() - requestStartTime;
            metrics.responseTimes.push(responseTime);
            
            if (res.status === 200 || res.status === 404) {
              metrics.successfulRequests++;
            } else {
              metrics.failedRequests++;
            }
          })
          .catch(() => {
            metrics.totalRequests++;
            metrics.failedRequests++;
          });

        requestPromises.push(promise);
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      await Promise.all(requestPromises);

      // Calculate average response time
      metrics.avgResponseTime = metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length;

      // Performance assertions
      expect(metrics.totalRequests).toBeGreaterThan(500);
      expect(metrics.failedRequests / metrics.totalRequests).toBeLessThan(0.01); // <1% failure rate
      expect(metrics.avgResponseTime).toBeLessThan(100); // <100ms average
    });

    test('should handle memory efficiently during long operations', async () => {
      const user = testUsers[0];
      const response = await request(app)
        .post('/api/linkedin/start')
        .set('Authorization', `Bearer ${user.token}`)
        .send(createStartAutomationRequest(user.id));

      const sessionId = response.body.sessionId;

      // Track memory usage
      const memorySnapshots = [];
      const interval = setInterval(() => {
        memorySnapshots.push(process.memoryUsage().heapUsed);
      }, 1000);

      // Simulate long-running automation
      for (let i = 0; i < 100; i++) {
        await stateManager.incrementProgress(sessionId, 'processedJobs');
        await realtimeService.emitProgress(sessionId, {
          totalJobs: 1000,
          processedJobs: i * 10,
          appliedJobs: i * 7,
          skippedJobs: i * 3,
          failedJobs: 0,
          currentPage: Math.floor(i / 10) + 1
        });
        
        // Add some applications
        if (i % 10 === 0) {
          await supabaseService.saveJobApplication(sessionId, {
            job_id: `job-${i}`,
            job_title: `Position ${i}`,
            company_name: `Company ${i}`,
            location: 'Remote',
            status: 'applied',
            applied_at: new Date().toISOString()
          });
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      clearInterval(interval);

      // Memory should not grow excessively
      const initialMemory = memorySnapshots[0];
      const finalMemory = memorySnapshots[memorySnapshots.length - 1];
      const memoryGrowth = finalMemory - initialMemory;

      // Should not grow more than 20MB
      expect(memoryGrowth).toBeLessThan(20 * 1024 * 1024);
    });
  });

  describe('Recovery and Resilience', () => {
    test('should recover from partial failures', async () => {
      const user = testUsers[0];
      const sessions = [];

      // Create 5 sessions
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/api/linkedin/start')
          .set('Authorization', `Bearer ${user.token}`)
          .send(createStartAutomationRequest(user.id));
        
        sessions.push(response.body.sessionId);
      }

      // Simulate partial Redis failure during updates
      const originalIncr = mockRedis.incr;
      let failureCount = 0;
      mockRedis.incr = async function(key: string) {
        failureCount++;
        if (failureCount % 3 === 0) {
          throw new Error('Redis temporary failure');
        }
        return originalIncr.call(this, key);
      };

      // Update all sessions
      const updatePromises = [];
      for (const sessionId of sessions) {
        for (let i = 0; i < 10; i++) {
          updatePromises.push(
            stateManager.incrementProgress(sessionId, 'processedJobs')
              .catch(() => {/* Ignore errors */})
          );
        }
      }

      await Promise.all(updatePromises);

      // Restore Redis
      mockRedis.incr = originalIncr;

      // Verify some updates succeeded despite failures
      for (const sessionId of sessions) {
        const progress = await stateManager.getProgress(sessionId);
        expect(progress?.processedJobs).toBeGreaterThan(0);
      }
    });

    test('should maintain data consistency under concurrent modifications', async () => {
      const user = testUsers[0];
      const sessionId = uuidv4();

      // Initialize session state
      await stateManager.saveSessionState(sessionId, {
        sessionId,
        userId: user.id,
        status: SessionStatus.RUNNING,
        config: {} as any,
        startedAt: new Date(),
        lastActiveAt: new Date(),
        stagehandReady: true
      });

      // Concurrent modifications
      const operations = [];
      
      // 50 status updates
      for (let i = 0; i < 50; i++) {
        operations.push(
          stateManager.updateSessionState(sessionId, {
            lastActiveAt: new Date(),
            currentStep: `step-${i}`
          })
        );
      }

      // 50 progress updates
      for (let i = 0; i < 50; i++) {
        operations.push(
          stateManager.incrementProgress(sessionId, 'processedJobs')
        );
      }

      await Promise.all(operations);

      // Verify final state is consistent
      const finalState = await stateManager.getSessionState(sessionId);
      const finalProgress = await stateManager.getProgress(sessionId);

      expect(finalState).toBeTruthy();
      expect(finalState?.status).toBe(SessionStatus.RUNNING);
      expect(finalProgress?.processedJobs).toBe(50);
    });
  });
});