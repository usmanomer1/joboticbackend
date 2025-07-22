import Redis from 'ioredis';
import { SupabaseAutomationService } from '../supabase/automationService';
import { SessionStatus, InterventionType, JobSearchConfig } from '../../types/automation.types';

// Type definitions
export interface SessionState {
  sessionId: string;
  userId: string;
  status: SessionStatus;
  config: JobSearchConfig;
  startedAt: Date;
  lastActiveAt: Date;
  currentStep?: string;
  stagehandReady: boolean;
}

export interface PauseState {
  pausedAt: Date;
  reason: InterventionType;
  currentUrl: string;
  pageContext?: any;
  resumeData?: any;
}

export interface AutomationProgress {
  totalJobs: number;
  processedJobs: number;
  appliedJobs: number;
  skippedJobs: number;
  failedJobs: number;
  currentPage: number;
  estimatedRemaining?: number;
}

export type ProgressMetrics = Omit<AutomationProgress, 'estimatedRemaining'>;

// TTL configurations (in seconds)
const TTL_CONFIG = {
  SESSION_STATE: 4 * 60 * 60,      // 4 hours
  PAUSE_STATE: 2 * 60 * 60,        // 2 hours
  USER_SESSION: 24 * 60 * 60,      // 24 hours
  APPLIED_JOBS: 7 * 24 * 60 * 60,  // 7 days
  SESSION_LOCK: 5 * 60             // 5 minutes
};

// Key prefixes
const KEY_PREFIX = {
  SESSION_STATE: 'session:state',
  SESSION_PAUSE: 'session:pause',
  SESSION_PROGRESS: 'session:progress',
  SESSION_LOCK: 'session:lock',
  USER_SESSIONS: 'user:sessions',
  USER_APPLIED: 'user:applied',
  USER_APPLIED_LIST: 'user:applied:list'
};

export class SessionStateManager {
  private redis: Redis | null = null;
  private memoryStore: Map<string, { value: any; expires?: number }> = new Map();
  private supabaseService: SupabaseAutomationService;
  private redisHealthy: boolean = true;
  private redisFailureCount: number = 0;
  private readonly MAX_REDIS_FAILURES = 3;
  private connectionCheckInterval?: NodeJS.Timeout;

  constructor(supabaseService: SupabaseAutomationService, redisUrl?: string) {
    this.supabaseService = supabaseService;
    
    if (redisUrl) {
      this.initializeRedis(redisUrl);
    } else {
      console.log('SessionStateManager: Running in memory-only mode');
    }
  }

  /**
   * Initialize Redis connection with error handling
   */
  private initializeRedis(redisUrl: string): void {
    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: true,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        reconnectOnError: (err) => {
          const targetError = 'READONLY';
          if (err.message.includes(targetError)) {
            return true;
          }
          return false;
        }
      });

      this.redis.on('connect', () => {
        console.log('SessionStateManager: Redis connected');
        this.redisHealthy = true;
        this.redisFailureCount = 0;
      });

      this.redis.on('error', (error) => {
        console.error('SessionStateManager: Redis error:', error);
        this.handleRedisFailure();
      });

      this.redis.on('close', () => {
        console.log('SessionStateManager: Redis connection closed');
        this.redisHealthy = false;
      });

      // Periodic health check
      this.connectionCheckInterval = setInterval(() => {
        this.checkRedisHealth();
      }, 30000); // Every 30 seconds

    } catch (error) {
      console.error('SessionStateManager: Failed to initialize Redis:', error);
      this.redis = null;
      this.redisHealthy = false;
    }
  }

  /**
   * Handle Redis connection failures
   */
  private handleRedisFailure(): void {
    this.redisFailureCount++;
    
    if (this.redisFailureCount >= this.MAX_REDIS_FAILURES) {
      console.error('SessionStateManager: Max Redis failures reached, switching to memory mode');
      this.redisHealthy = false;
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedisHealth(): Promise<void> {
    if (!this.redis || !this.redisHealthy) return;

    try {
      await this.redis.ping();
      this.redisHealthy = true;
      this.redisFailureCount = 0;
    } catch (error) {
      this.handleRedisFailure();
    }
  }

  /**
   * Get a key with namespace
   */
  private getKey(type: string, id: string): string {
    return `${type}:${id}`;
  }

  /**
   * Set value with TTL
   */
  private async setWithTTL(key: string, value: any, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);

    if (this.redis && this.redisHealthy) {
      try {
        if (ttl) {
          await this.redis.setex(key, ttl, serialized);
        } else {
          await this.redis.set(key, serialized);
        }
        return;
      } catch (error) {
        console.error('SessionStateManager: Redis set error:', error);
        this.handleRedisFailure();
      }
    }

    // Fallback to memory
    const expires = ttl ? Date.now() + (ttl * 1000) : undefined;
    this.memoryStore.set(key, { value: serialized, expires });
    
    // Clean up expired entries periodically
    this.cleanupMemoryStore();
  }

  /**
   * Get value
   */
  private async get(key: string): Promise<any> {
    if (this.redis && this.redisHealthy) {
      try {
        const value = await this.redis.get(key);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        console.error('SessionStateManager: Redis get error:', error);
        this.handleRedisFailure();
      }
    }

    // Fallback to memory
    const entry = this.memoryStore.get(key);
    if (!entry) return null;

    // Check expiration
    if (entry.expires && entry.expires < Date.now()) {
      this.memoryStore.delete(key);
      return null;
    }

    return JSON.parse(entry.value);
  }

  /**
   * Delete value
   */
  private async delete(key: string): Promise<void> {
    if (this.redis && this.redisHealthy) {
      try {
        await this.redis.del(key);
        return;
      } catch (error) {
        console.error('SessionStateManager: Redis delete error:', error);
        this.handleRedisFailure();
      }
    }

    // Fallback to memory
    this.memoryStore.delete(key);
  }

  /**
   * Clean up expired entries from memory store
   */
  private cleanupMemoryStore(): void {
    const now = Date.now();
    for (const [key, entry] of this.memoryStore.entries()) {
      if (entry.expires && entry.expires < now) {
        this.memoryStore.delete(key);
      }
    }

    // Limit memory store size
    const MAX_ENTRIES = 10000;
    if (this.memoryStore.size > MAX_ENTRIES) {
      const entriesToDelete = this.memoryStore.size - MAX_ENTRIES;
      const keys = Array.from(this.memoryStore.keys());
      for (let i = 0; i < entriesToDelete; i++) {
        this.memoryStore.delete(keys[i]);
      }
    }
  }

  // === Session State Management ===

  async saveSessionState(sessionId: string, state: SessionState): Promise<void> {
    const key = this.getKey(KEY_PREFIX.SESSION_STATE, sessionId);
    await this.setWithTTL(key, state, TTL_CONFIG.SESSION_STATE);

    // Sync critical state to Supabase
    this.syncToSupabase(sessionId, { status: state.status });
  }

  async getSessionState(sessionId: string): Promise<SessionState | null> {
    const key = this.getKey(KEY_PREFIX.SESSION_STATE, sessionId);
    const state = await this.get(key);
    
    if (state) {
      // Parse dates
      state.startedAt = new Date(state.startedAt);
      state.lastActiveAt = new Date(state.lastActiveAt);
    }
    
    return state;
  }

  async updateSessionState(sessionId: string, updates: Partial<SessionState>): Promise<void> {
    const current = await this.getSessionState(sessionId);
    if (!current) {
      throw new Error('Session state not found');
    }

    const updated = {
      ...current,
      ...updates,
      lastActiveAt: new Date()
    };

    await this.saveSessionState(sessionId, updated);
  }

  async deleteSessionState(sessionId: string): Promise<void> {
    const key = this.getKey(KEY_PREFIX.SESSION_STATE, sessionId);
    await this.delete(key);
  }

  // === Pause/Resume State ===

  async savePauseState(sessionId: string, pauseState: PauseState): Promise<void> {
    const key = this.getKey(KEY_PREFIX.SESSION_PAUSE, sessionId);
    await this.setWithTTL(key, pauseState, TTL_CONFIG.PAUSE_STATE);
  }

  async getPauseState(sessionId: string): Promise<PauseState | null> {
    const key = this.getKey(KEY_PREFIX.SESSION_PAUSE, sessionId);
    const state = await this.get(key);
    
    if (state) {
      state.pausedAt = new Date(state.pausedAt);
    }
    
    return state;
  }

  async clearPauseState(sessionId: string): Promise<void> {
    const key = this.getKey(KEY_PREFIX.SESSION_PAUSE, sessionId);
    await this.delete(key);
  }

  // === Progress Tracking ===

  async saveProgress(sessionId: string, progress: AutomationProgress): Promise<void> {
    const key = this.getKey(KEY_PREFIX.SESSION_PROGRESS, sessionId);
    await this.setWithTTL(key, progress, TTL_CONFIG.SESSION_STATE);
  }

  async getProgress(sessionId: string): Promise<AutomationProgress | null> {
    const key = this.getKey(KEY_PREFIX.SESSION_PROGRESS, sessionId);
    return await this.get(key);
  }

  async incrementProgress(sessionId: string, field: keyof ProgressMetrics): Promise<void> {
    const key = this.getKey(KEY_PREFIX.SESSION_PROGRESS, sessionId);

    if (this.redis && this.redisHealthy) {
      try {
        const fieldKey = `${key}:${field}`;
        await this.redis.incr(fieldKey);
        
        // Update the main progress object
        const progress = await this.getProgress(sessionId);
        if (progress) {
          progress[field] = (progress[field] || 0) + 1;
          await this.saveProgress(sessionId, progress);
        }
        return;
      } catch (error) {
        console.error('SessionStateManager: Redis increment error:', error);
        this.handleRedisFailure();
      }
    }

    // Fallback to memory
    const progress = await this.getProgress(sessionId);
    if (progress) {
      progress[field] = (progress[field] || 0) + 1;
      await this.saveProgress(sessionId, progress);
    }
  }

  // === User Session Tracking ===

  async trackUserSession(userId: string, sessionId: string): Promise<void> {
    const key = this.getKey(KEY_PREFIX.USER_SESSIONS, userId);

    if (this.redis && this.redisHealthy) {
      try {
        await this.redis.sadd(key, sessionId);
        await this.redis.expire(key, TTL_CONFIG.USER_SESSION);
        return;
      } catch (error) {
        console.error('SessionStateManager: Redis sadd error:', error);
        this.handleRedisFailure();
      }
    }

    // Fallback to memory
    const sessions = await this.get(key) || [];
    if (!sessions.includes(sessionId)) {
      sessions.push(sessionId);
      await this.setWithTTL(key, sessions, TTL_CONFIG.USER_SESSION);
    }
  }

  async getUserSessions(userId: string): Promise<string[]> {
    const key = this.getKey(KEY_PREFIX.USER_SESSIONS, userId);

    if (this.redis && this.redisHealthy) {
      try {
        const sessions = await this.redis.smembers(key);
        return sessions;
      } catch (error) {
        console.error('SessionStateManager: Redis smembers error:', error);
        this.handleRedisFailure();
      }
    }

    // Fallback to memory
    return await this.get(key) || [];
  }

  async removeUserSession(userId: string, sessionId: string): Promise<void> {
    const key = this.getKey(KEY_PREFIX.USER_SESSIONS, userId);

    if (this.redis && this.redisHealthy) {
      try {
        await this.redis.srem(key, sessionId);
        return;
      } catch (error) {
        console.error('SessionStateManager: Redis srem error:', error);
        this.handleRedisFailure();
      }
    }

    // Fallback to memory
    const sessions = await this.getUserSessions(userId);
    const updated = sessions.filter(id => id !== sessionId);
    await this.setWithTTL(key, updated, TTL_CONFIG.USER_SESSION);
  }

  async getUserActiveSessionCount(userId: string): Promise<number> {
    const sessions = await this.getUserSessions(userId);
    
    // Filter only active sessions
    let activeCount = 0;
    for (const sessionId of sessions) {
      const state = await this.getSessionState(sessionId);
      if (state && [SessionStatus.RUNNING, SessionStatus.PAUSED].includes(state.status)) {
        activeCount++;
      }
    }
    
    return activeCount;
  }

  // === Application Tracking ===

  async markJobAsApplied(userId: string, jobId: string): Promise<void> {
    const key = this.getKey(KEY_PREFIX.USER_APPLIED, `${userId}:${jobId}`);
    const listKey = this.getKey(KEY_PREFIX.USER_APPLIED_LIST, userId);

    await this.setWithTTL(key, true, TTL_CONFIG.APPLIED_JOBS);

    // Add to recent list
    if (this.redis && this.redisHealthy) {
      try {
        const score = Date.now();
        await this.redis.zadd(listKey, score, jobId);
        await this.redis.expire(listKey, TTL_CONFIG.APPLIED_JOBS);
        
        // Keep only last 1000 jobs
        await this.redis.zremrangebyrank(listKey, 0, -1001);
        return;
      } catch (error) {
        console.error('SessionStateManager: Redis zadd error:', error);
        this.handleRedisFailure();
      }
    }

    // Fallback to memory
    const recentJobs = await this.get(listKey) || [];
    recentJobs.unshift(jobId);
    if (recentJobs.length > 1000) {
      recentJobs.splice(1000);
    }
    await this.setWithTTL(listKey, recentJobs, TTL_CONFIG.APPLIED_JOBS);
  }

  async hasAppliedToJob(userId: string, jobId: string): Promise<boolean> {
    const key = this.getKey(KEY_PREFIX.USER_APPLIED, `${userId}:${jobId}`);
    const applied = await this.get(key);
    return applied === true;
  }

  async getRecentlyAppliedJobs(userId: string, limit: number = 100): Promise<string[]> {
    const listKey = this.getKey(KEY_PREFIX.USER_APPLIED_LIST, userId);

    if (this.redis && this.redisHealthy) {
      try {
        const jobs = await this.redis.zrevrange(listKey, 0, limit - 1);
        return jobs;
      } catch (error) {
        console.error('SessionStateManager: Redis zrevrange error:', error);
        this.handleRedisFailure();
      }
    }

    // Fallback to memory
    const jobs = await this.get(listKey) || [];
    return jobs.slice(0, limit);
  }

  // === Session Locks ===

  async acquireSessionLock(sessionId: string, ttl: number = TTL_CONFIG.SESSION_LOCK): Promise<boolean> {
    const key = this.getKey(KEY_PREFIX.SESSION_LOCK, sessionId);

    if (this.redis && this.redisHealthy) {
      try {
        const result = await this.redis.set(key, '1', 'NX', 'EX', ttl);
        return result === 'OK';
      } catch (error) {
        console.error('SessionStateManager: Redis lock error:', error);
        this.handleRedisFailure();
      }
    }

    // Fallback to memory
    const existing = this.memoryStore.get(key);
    if (existing && existing.expires && existing.expires > Date.now()) {
      return false;
    }

    await this.setWithTTL(key, '1', ttl);
    return true;
  }

  async releaseSessionLock(sessionId: string): Promise<void> {
    const key = this.getKey(KEY_PREFIX.SESSION_LOCK, sessionId);
    await this.delete(key);
  }

  async isSessionLocked(sessionId: string): Promise<boolean> {
    const key = this.getKey(KEY_PREFIX.SESSION_LOCK, sessionId);
    const lock = await this.get(key);
    return lock !== null;
  }

  // === Cleanup Operations ===

  async cleanupExpiredStates(ttlHours: number = 24): Promise<number> {
    const cutoffTime = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
    let cleanedCount = 0;

    if (this.redis && this.redisHealthy) {
      try {
        // Use Redis SCAN to find expired keys
        const stream = this.redis.scanStream({
          match: `${KEY_PREFIX.SESSION_STATE}:*`,
          count: 100
        });

        for await (const keys of stream) {
          for (const key of keys) {
            const state = await this.get(key);
            if (state && new Date(state.lastActiveAt) < cutoffTime) {
              await this.delete(key);
              cleanedCount++;
            }
          }
        }
      } catch (error) {
        console.error('SessionStateManager: Cleanup error:', error);
      }
    } else {
      // Memory cleanup
      for (const [key, entry] of this.memoryStore.entries()) {
        if (key.startsWith(KEY_PREFIX.SESSION_STATE)) {
          try {
            const state = JSON.parse(entry.value);
            if (new Date(state.lastActiveAt) < cutoffTime) {
              this.memoryStore.delete(key);
              cleanedCount++;
            }
          } catch (error) {
            // Skip invalid entries
          }
        }
      }
    }

    return cleanedCount;
  }

  async cleanupUserData(userId: string): Promise<void> {
    // Get all user sessions
    const sessions = await this.getUserSessions(userId);
    
    // Delete each session state
    for (const sessionId of sessions) {
      await this.deleteSessionState(sessionId);
      await this.clearPauseState(sessionId);
      await this.delete(this.getKey(KEY_PREFIX.SESSION_PROGRESS, sessionId));
      await this.releaseSessionLock(sessionId);
    }

    // Delete user session list
    await this.delete(this.getKey(KEY_PREFIX.USER_SESSIONS, userId));
    
    // Delete applied jobs list
    await this.delete(this.getKey(KEY_PREFIX.USER_APPLIED_LIST, userId));
  }

  /**
   * Sync critical data to Supabase (async, non-blocking)
   */
  private async syncToSupabase(sessionId: string, data: any): Promise<void> {
    // Fire and forget
    this.supabaseService.updateSession(sessionId, data).catch(error => {
      console.error('SessionStateManager: Failed to sync to Supabase:', error);
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    if (this.redis) {
      await this.redis.quit();
    }

    this.memoryStore.clear();
  }
}