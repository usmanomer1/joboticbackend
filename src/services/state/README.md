# Session State Manager

A robust state management service for LinkedIn automation that uses Redis for distributed systems and falls back to in-memory storage for development environments.

## Features

### 1. **Dual Storage Strategy**
- Redis for production (distributed, persistent)
- In-memory fallback for development
- Automatic failover with circuit breaker pattern
- Graceful degradation on Redis failures

### 2. **Session State Management**
- Complete session lifecycle tracking
- Atomic updates with optimistic locking
- TTL-based expiration (4 hours)
- Critical state sync to Supabase

### 3. **Progress Tracking**
- Real-time progress updates
- Atomic increment operations
- Metric aggregation
- Estimated remaining calculations

### 4. **User Session Management**
- Track multiple sessions per user
- Active session counting
- Session ownership validation
- Bulk cleanup operations

### 5. **Duplicate Prevention**
- Job application deduplication
- Recently applied jobs tracking
- Efficient lookups with Redis sets
- 7-day retention period

### 6. **Distributed Locking**
- Session-level locks for concurrent operations
- TTL-based auto-release (5 minutes)
- SETNX pattern for atomicity
- Lock status checking

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Application   │────▶│ SessionStateManager │────▶│     Redis       │
│    Services     │     │                   │     │  (Production)   │
└─────────────────┘     │   - Save State   │     └─────────────────┘
                        │   - Get Progress  │              │
                        │   - Track Users   │              │ Fallback
                        │   - Lock Sessions │              ▼
                        └───────────────────┘     ┌─────────────────┐
                                │                 │  Memory Store   │
                                │ Sync            │  (Development)  │
                                ▼                 └─────────────────┘
                        ┌─────────────────┐
                        │    Supabase     │
                        │   (Critical)    │
                        └─────────────────┘
```

## Setup

### Installation

```bash
npm install ioredis
```

### Configuration

```typescript
import { SessionStateManager } from './services/state';
import { SupabaseAutomationService } from './services/supabase';

// With Redis (production)
const stateManager = new SessionStateManager(
  supabaseService,
  process.env.REDIS_URL
);

// Without Redis (development)
const stateManager = new SessionStateManager(supabaseService);
```

### Environment Variables

```env
REDIS_URL=redis://localhost:6379  # Optional
```

## Usage Examples

### Session State Management

```typescript
// Save session state
const sessionState: SessionState = {
  sessionId: 'session-123',
  userId: 'user-456',
  status: SessionStatus.RUNNING,
  config: {
    jobTitle: 'Software Engineer',
    location: 'San Francisco, CA',
    easyApplyOnly: true,
    maxApplications: 20
  },
  startedAt: new Date(),
  lastActiveAt: new Date(),
  currentStep: 'searching_jobs',
  stagehandReady: true
};

await stateManager.saveSessionState(sessionId, sessionState);

// Update session state
await stateManager.updateSessionState(sessionId, {
  currentStep: 'applying_to_jobs',
  status: SessionStatus.RUNNING
});

// Get session state
const state = await stateManager.getSessionState(sessionId);
```

### Pause/Resume Handling

```typescript
// Save pause state
const pauseState: PauseState = {
  pausedAt: new Date(),
  reason: InterventionType.LOGIN,
  currentUrl: 'https://www.linkedin.com/login',
  pageContext: { /* page data */ },
  resumeData: {
    lastProcessedJobIndex: 5,
    currentSearchPage: 2
  }
};

await stateManager.savePauseState(sessionId, pauseState);

// Resume session
const savedPauseState = await stateManager.getPauseState(sessionId);
if (savedPauseState) {
  // Use resumeData to continue where left off
  await stateManager.clearPauseState(sessionId);
}
```

### Progress Tracking

```typescript
// Initialize progress
await stateManager.saveProgress(sessionId, {
  totalJobs: 50,
  processedJobs: 0,
  appliedJobs: 0,
  skippedJobs: 0,
  failedJobs: 0,
  currentPage: 1
});

// Increment metrics
await stateManager.incrementProgress(sessionId, 'processedJobs');
await stateManager.incrementProgress(sessionId, 'appliedJobs');

// Get current progress
const progress = await stateManager.getProgress(sessionId);
```

### User Session Tracking

```typescript
// Track user session
await stateManager.trackUserSession(userId, sessionId);

// Get all user sessions
const sessions = await stateManager.getUserSessions(userId);

// Get active session count
const activeCount = await stateManager.getUserActiveSessionCount(userId);

// Remove session
await stateManager.removeUserSession(userId, sessionId);
```

### Duplicate Job Prevention

```typescript
// Mark job as applied
await stateManager.markJobAsApplied(userId, jobId);

// Check if already applied
const hasApplied = await stateManager.hasAppliedToJob(userId, jobId);

if (!hasApplied) {
  // Apply to job
}

// Get recently applied jobs
const recentJobs = await stateManager.getRecentlyAppliedJobs(userId, 100);
```

### Session Locking

```typescript
// Acquire lock for critical operation
const lockAcquired = await stateManager.acquireSessionLock(sessionId);

if (lockAcquired) {
  try {
    // Perform critical operation
    await performCriticalOperation();
  } finally {
    // Always release lock
    await stateManager.releaseSessionLock(sessionId);
  }
} else {
  // Handle lock already taken
  console.log('Session is locked by another process');
}
```

## Data Types

### SessionState
```typescript
interface SessionState {
  sessionId: string;
  userId: string;
  status: SessionStatus;
  config: JobSearchConfig;
  startedAt: Date;
  lastActiveAt: Date;
  currentStep?: string;
  stagehandReady: boolean;
}
```

### PauseState
```typescript
interface PauseState {
  pausedAt: Date;
  reason: InterventionType;
  currentUrl: string;
  pageContext?: any;
  resumeData?: any;
}
```

### AutomationProgress
```typescript
interface AutomationProgress {
  totalJobs: number;
  processedJobs: number;
  appliedJobs: number;
  skippedJobs: number;
  failedJobs: number;
  currentPage: number;
  estimatedRemaining?: number;
}
```

## TTL Configuration

| Data Type | TTL | Description |
|-----------|-----|-------------|
| Session State | 4 hours | Active session data |
| Pause State | 2 hours | Intervention pause data |
| User Sessions | 24 hours | User-session mappings |
| Applied Jobs | 7 days | Job application history |
| Session Locks | 5 minutes | Distributed locks |

## Key Naming Convention

All keys follow a consistent naming pattern:

```
session:state:{sessionId}
session:pause:{sessionId}
session:progress:{sessionId}
session:lock:{sessionId}
user:sessions:{userId}
user:applied:{userId}:{jobId}
user:applied:list:{userId}
```

## Performance Optimizations

### 1. **Connection Pooling**
- ioredis handles connection pooling automatically
- Configurable retry strategies
- Automatic reconnection on failures

### 2. **Batch Operations**
- Pipeline support for multiple operations
- Atomic increments for progress tracking
- Efficient set operations for user sessions

### 3. **Memory Management**
- LRU-style eviction for memory store
- Max 10,000 entries in memory
- Periodic cleanup of expired entries

### 4. **Circuit Breaker**
- Tracks Redis failures
- Auto-switches to memory after 3 failures
- Periodic health checks every 30 seconds

## Error Handling

### Redis Failures
```typescript
// Automatic fallback to memory
try {
  await redis.get(key);
} catch (error) {
  // Fallback to memory store
  return memoryStore.get(key);
}
```

### Graceful Degradation
- Operations continue with memory store
- No data loss for active sessions
- Sync to Supabase for persistence

### Error Propagation
- Detailed error logging
- Proper error messages
- Non-blocking sync operations

## Cleanup Operations

### Expired Sessions
```typescript
// Clean up sessions older than 24 hours
const cleaned = await stateManager.cleanupExpiredStates(24);
console.log(`Cleaned ${cleaned} expired sessions`);
```

### User Data Cleanup
```typescript
// Remove all data for a user
await stateManager.cleanupUserData(userId);
```

### Memory Store Cleanup
- Automatic cleanup of expired entries
- Size-based eviction (>10,000 entries)
- Periodic maintenance

## Monitoring

### Health Checks
- Redis connection status
- Memory store size
- Failed operation count
- Sync queue length

### Metrics to Track
- Average operation latency
- Cache hit/miss ratio
- Lock contention rate
- Memory usage

## Best Practices

1. **Always Release Locks**
   ```typescript
   try {
     await acquireLock();
     // Do work
   } finally {
     await releaseLock();
   }
   ```

2. **Handle State Not Found**
   ```typescript
   const state = await getSessionState(id);
   if (!state) {
     // Handle missing state
   }
   ```

3. **Use Appropriate TTLs**
   - Short TTLs for locks
   - Longer TTLs for state data
   - Consider cleanup frequency

4. **Monitor Redis Health**
   - Check connection status
   - Monitor memory usage
   - Track operation latency

## Troubleshooting

### Redis Connection Issues
1. Check Redis URL format
2. Verify network connectivity
3. Check Redis server status
4. Review connection logs

### Memory Growth
1. Check cleanup frequency
2. Verify TTL settings
3. Monitor entry count
4. Review eviction policy

### Lock Contention
1. Reduce lock duration
2. Implement retry logic
3. Use shorter TTLs
4. Add lock metrics

## Future Enhancements

1. **Redis Cluster Support**
   - Sharding by user ID
   - Read replicas
   - Automatic failover

2. **Advanced Caching**
   - Write-through cache
   - Cache warming
   - Predictive caching

3. **Monitoring Integration**
   - Prometheus metrics
   - Grafana dashboards
   - Alert rules

4. **Data Analytics**
   - Session duration tracking
   - Success rate metrics
   - User behavior analysis