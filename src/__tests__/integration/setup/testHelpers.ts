import { SupabaseClient } from '@supabase/supabase-js';
import { createTestSupabaseClient, TEST_USERS } from './testConfig';
import { v4 as uuidv4 } from 'uuid';

/**
 * Test helper utilities
 */

export class TestHelpers {
  private supabase: SupabaseClient;

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase || createTestSupabaseClient();
  }

  /**
   * Clean up all test data
   */
  async cleanupTestData(options: {
    sessions?: boolean;
    applications?: boolean;
    logs?: boolean;
    interventions?: boolean;
    users?: boolean;
  } = {}) {
    const {
      sessions = true,
      applications = true,
      logs = true,
      interventions = true,
      users = false
    } = options;

    const promises = [];

    if (sessions) {
      promises.push(
        this.supabase
          .from('automation_sessions')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000')
      );
    }

    if (applications) {
      promises.push(
        this.supabase
          .from('job_applications')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000')
      );
    }

    if (logs) {
      promises.push(
        this.supabase
          .from('automation_logs')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000')
      );
    }

    if (interventions) {
      promises.push(
        this.supabase
          .from('user_interventions')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000')
      );
    }

    await Promise.all(promises);

    if (users) {
      await this.cleanupTestUsers();
    }
  }

  /**
   * Clean up test users
   */
  async cleanupTestUsers() {
    const emails = Object.values(TEST_USERS).map(u => u.email);
    
    for (const email of emails) {
      try {
        const { data: users } = await this.supabase.auth.admin.listUsers();
        const user = users?.users.find(u => u.email === email);
        if (user) {
          await this.supabase.auth.admin.deleteUser(user.id);
        }
      } catch (error) {
        // User might not exist
      }
    }
  }

  /**
   * Create a test user with authentication
   */
  async createAuthenticatedUser(email?: string, password?: string) {
    const userEmail = email || `test-${uuidv4()}@example.com`;
    const userPassword = password || 'test-password-123';

    const { data: user, error } = await this.supabase.auth.admin.createUser({
      email: userEmail,
      password: userPassword,
      email_confirm: true
    });

    if (error) throw error;

    // Get auth token
    const { data: session } = await this.supabase.auth.signInWithPassword({
      email: userEmail,
      password: userPassword
    });

    return {
      user: user.user,
      token: session?.session?.access_token || '',
      email: userEmail,
      password: userPassword
    };
  }

  /**
   * Wait for a condition to be met
   */
  static async waitFor(
    condition: () => Promise<boolean> | boolean,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const result = await condition();
      if (result) return;
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error('Timeout waiting for condition');
  }

  /**
   * Wait for WebSocket event
   */
  static waitForEvent(
    socket: any,
    eventName: string,
    timeout: number = 5000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(eventName);
        reject(new Error(`Timeout waiting for event: ${eventName}`));
      }, timeout);

      socket.once(eventName, (data: any) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  /**
   * Create multiple test sessions
   */
  async createTestSessions(userId: string, count: number) {
    const sessions = [];
    
    for (let i = 0; i < count; i++) {
      const sessionId = uuidv4();
      const { error } = await this.supabase
        .from('automation_sessions')
        .insert({
          id: sessionId,
          user_id: userId,
          status: 'pending',
          job_search_config: {
            jobTitle: 'Software Engineer',
            location: 'San Francisco, CA',
            easyApplyOnly: true,
            maxApplications: 10
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (!error) {
        sessions.push(sessionId);
      }
    }

    return sessions;
  }

  /**
   * Simulate automation progress
   */
  async simulateProgress(
    sessionId: string,
    totalJobs: number,
    applyRate: number = 0.7
  ) {
    const updates = [];

    for (let i = 1; i <= totalJobs; i++) {
      const progress = {
        totalJobs,
        processedJobs: i,
        appliedJobs: Math.floor(i * applyRate),
        skippedJobs: i - Math.floor(i * applyRate),
        failedJobs: 0,
        currentPage: Math.ceil(i / 10)
      };

      updates.push(progress);

      // Update in database
      await this.supabase
        .from('automation_sessions')
        .update({ 
          progress,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);
    }

    return updates;
  }

  /**
   * Create test job applications
   */
  async createTestApplications(sessionId: string, count: number) {
    const applications = [];

    for (let i = 0; i < count; i++) {
      applications.push({
        id: uuidv4(),
        session_id: sessionId,
        job_id: `job-${i + 1}`,
        job_title: `Software Engineer ${i + 1}`,
        company_name: `Company ${i + 1}`,
        location: i % 2 === 0 ? 'Remote' : 'San Francisco, CA',
        job_description: 'Great opportunity for a talented engineer...',
        status: 'applied',
        applied_at: new Date(Date.now() - i * 60000).toISOString()
      });
    }

    const { error } = await this.supabase
      .from('job_applications')
      .insert(applications);

    if (error) throw error;

    return applications;
  }

  /**
   * Create test intervention
   */
  async createTestIntervention(sessionId: string, type: string, resolved: boolean = false) {
    const intervention = {
      id: uuidv4(),
      session_id: sessionId,
      type,
      message: `${type} intervention required`,
      debug_url: `https://browserbase.com/debug/${uuidv4()}`,
      context: { url: 'https://www.linkedin.com' },
      resolved,
      created_at: new Date().toISOString()
    };

    const { error } = await this.supabase
      .from('user_interventions')
      .insert(intervention);

    if (error) throw error;

    return intervention;
  }

  /**
   * Verify session ownership
   */
  async verifySessionOwnership(sessionId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('automation_sessions')
      .select('user_id')
      .eq('id', sessionId)
      .single();

    return !error && data?.user_id === userId;
  }

  /**
   * Get session progress
   */
  async getSessionProgress(sessionId: string) {
    const { data, error } = await this.supabase
      .from('automation_sessions')
      .select('progress')
      .eq('id', sessionId)
      .single();

    if (error) throw error;
    return data?.progress;
  }

  /**
   * Measure operation performance
   */
  static async measurePerformance<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const startTime = performance.now();
    const result = await operation();
    const duration = performance.now() - startTime;

    return { result, duration };
  }

  /**
   * Generate mock job listings
   */
  static generateMockJobListings(count: number, options: {
    easyApplyRate?: number;
    remoteRate?: number;
  } = {}) {
    const { easyApplyRate = 0.7, remoteRate = 0.3 } = options;
    const listings = [];

    for (let i = 0; i < count; i++) {
      listings.push({
        id: `job-${i + 1}`,
        title: `Software Engineer ${i + 1}`,
        company: `Company ${i + 1}`,
        location: Math.random() < remoteRate ? 'Remote' : 'San Francisco, CA',
        isEasyApply: Math.random() < easyApplyRate,
        description: 'Join our amazing team...',
        postedDate: new Date(Date.now() - i * 3600000).toISOString(),
        salary: '$100k - $150k',
        experienceLevel: ['Mid-level', 'Senior'][Math.floor(Math.random() * 2)],
        employmentType: 'Full-time'
      });
    }

    return listings;
  }

  /**
   * Assert WebSocket connected
   */
  static assertWebSocketConnected(socket: any): void {
    if (!socket.connected) {
      throw new Error('WebSocket is not connected');
    }
  }

  /**
   * Create rate limit test helper
   */
  static async testRateLimit(
    makeRequest: () => Promise<any>,
    limit: number,
    expectedStatus: { success: number; limited: number }
  ) {
    const results = [];

    for (let i = 0; i < limit + 5; i++) {
      try {
        const response = await makeRequest();
        results.push({ status: response.status });
      } catch (error: any) {
        results.push({ status: error.response?.status || 500 });
      }
    }

    const successCount = results.filter(r => r.status === expectedStatus.success).length;
    const limitedCount = results.filter(r => r.status === expectedStatus.limited).length;

    return { successCount, limitedCount, total: results.length };
  }

  /**
   * Monitor memory usage
   */
  static monitorMemory(interval: number = 1000): {
    start: () => void;
    stop: () => { snapshots: number[]; peak: number; average: number };
  } {
    let timer: NodeJS.Timeout;
    const snapshots: number[] = [];

    return {
      start: () => {
        timer = setInterval(() => {
          snapshots.push(process.memoryUsage().heapUsed);
        }, interval);
      },
      stop: () => {
        clearInterval(timer);
        const peak = Math.max(...snapshots);
        const average = snapshots.reduce((a, b) => a + b, 0) / snapshots.length;
        return { snapshots, peak, average };
      }
    };
  }
}

/**
 * Test assertion helpers
 */
export const assertions = {
  /**
   * Assert API response format matches Browser Use
   */
  assertBrowserUseFormat(response: any, type: 'start' | 'status' | 'pause' | 'resume' | 'stop' | 'results') {
    switch (type) {
      case 'start':
        expect(response).toMatchObject({
          sessionId: expect.stringMatching(/^task_[a-f0-9-]+$/),
          liveViewUrl: expect.stringMatching(/^https:\/\/.*\/debug\//),
          status: 'running',
          taskId: expect.stringMatching(/^task_[a-f0-9-]+$/)
        });
        break;

      case 'status':
        expect(response).toMatchObject({
          status: expect.stringMatching(/^(pending|running|paused|completed|stopped|failed)$/),
          progress: {
            totalJobs: expect.any(Number),
            processedJobs: expect.any(Number),
            appliedJobs: expect.any(Number),
            skippedJobs: expect.any(Number),
            failedJobs: expect.any(Number),
            currentPage: expect.any(Number)
          },
          currentStep: expect.any(String)
        });
        break;

      case 'pause':
      case 'resume':
      case 'stop':
        expect(response).toMatchObject({
          status: expect.any(String),
          message: expect.any(String)
        });
        break;

      case 'results':
        expect(response).toMatchObject({
          session: expect.any(Object),
          applications: expect.any(Array),
          logs: expect.any(Array),
          summary: {
            totalApplications: expect.any(Number),
            successfulApplications: expect.any(Number),
            failedApplications: expect.any(Number),
            totalJobsProcessed: expect.any(Number)
          }
        });
        break;
    }
  },

  /**
   * Assert progress is valid
   */
  assertValidProgress(progress: any) {
    expect(progress).toMatchObject({
      totalJobs: expect.any(Number),
      processedJobs: expect.any(Number),
      appliedJobs: expect.any(Number),
      skippedJobs: expect.any(Number),
      failedJobs: expect.any(Number),
      currentPage: expect.any(Number)
    });

    // Sanity checks
    expect(progress.processedJobs).toBeLessThanOrEqual(progress.totalJobs);
    expect(progress.appliedJobs + progress.skippedJobs + progress.failedJobs).toBeLessThanOrEqual(progress.processedJobs);
    expect(progress.currentPage).toBeGreaterThan(0);
  },

  /**
   * Assert intervention format
   */
  assertInterventionFormat(intervention: any) {
    expect(intervention).toMatchObject({
      type: expect.stringMatching(/^(LOGIN|CAPTCHA|TWO_FA|PHONE_VERIFICATION|SECURITY_CHALLENGE|OTHER)$/),
      message: expect.any(String),
      debugUrl: expect.stringMatching(/^https:\/\//),
      context: expect.any(Object)
    });
  }
};

/**
 * Performance benchmarks
 */
export const benchmarks = {
  API_RESPONSE_TIME: 200, // ms
  WEBSOCKET_EVENT_LATENCY: 100, // ms
  DATABASE_QUERY_TIME: 50, // ms
  REDIS_OPERATION_TIME: 10, // ms
  MEMORY_GROWTH_LIMIT: 50 * 1024 * 1024, // 50MB
  CONCURRENT_SESSIONS_LIMIT: 100,
  RATE_LIMIT_WINDOW: 3600000, // 1 hour
  MAX_WEBSOCKET_CLIENTS: 1000
};