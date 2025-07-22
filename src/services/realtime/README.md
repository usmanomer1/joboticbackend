# Realtime Automation Service

A comprehensive real-time service that bridges Socket.io client connections with Supabase Realtime database events, providing live updates for LinkedIn automation sessions.

## Architecture Overview

```
Client (Socket.io) <-> RealtimeAutomationService <-> Supabase Realtime
                                |
                                └-> Database Tables:
                                    - automation_sessions
                                    - automation_interventions
                                    - applied_jobs
                                    - automation_logs
```

## Key Features

### 1. **Bidirectional Communication**
- Socket.io for client connections with authentication
- Supabase Realtime for database change subscriptions
- Event bridging between Socket.io and Supabase

### 2. **Authentication & Security**
- JWT token validation via Supabase Auth
- Session ownership verification
- Rate limiting (10 subscriptions per user per minute)
- Room-based isolation for user data

### 3. **Room Structure**
- `user:{userId}` - All sessions for a user
- `session:{sessionId}` - Specific session updates
- `global:{userId}` - User-wide notifications

### 4. **Supabase Realtime Channels**
- `session-updates` - automation_sessions table changes
- `intervention-alerts` - automation_interventions inserts
- `job-applications` - applied_jobs inserts
- `automation-logs` - important automation_logs events

## Setup

### Server Setup

```typescript
import { createServer } from 'http';
import { RealtimeAutomationService } from './services/realtime';

const httpServer = createServer(app);

const realtimeService = new RealtimeAutomationService(
  httpServer,
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

await realtimeService.initialize();

httpServer.listen(3000);
```

### Environment Variables

```env
FRONTEND_URL=http://localhost:3000
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Client Connection

### Socket.io Client Setup

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  },
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('Connected to realtime service');
});
```

### Subscribe to Session

```typescript
// Subscribe to a session
socket.emit('subscribe', { sessionId: 'session-123' });

// Wait for confirmation
socket.on('subscribed', (data) => {
  console.log('Subscribed to session:', data.sessionId);
});

// Listen for updates
socket.on('progress_update', (data) => {
  console.log('Progress:', data.progress);
});
```

## Event Types

### Client → Server Events

| Event | Description | Payload |
|-------|-------------|---------|
| `subscribe` | Subscribe to session updates | `{ sessionId: string }` |
| `unsubscribe` | Unsubscribe from session | `{ sessionId: string }` |
| `get_status` | Request current session status | `{ sessionId: string }` |

### Server → Client Events

| Event | Description | Payload |
|-------|-------------|---------|
| `connected` | Connection confirmed | `{ userId, timestamp }` |
| `session_update` | Session status changed | `{ sessionId, status, previousStatus }` |
| `intervention_required` | Human intervention needed | `{ sessionId, type, liveViewUrl }` |
| `progress_update` | Job processing progress | `{ sessionId, progress }` |
| `job_applied` | Successful job application | `{ sessionId, jobTitle, companyName }` |
| `step_update` | Current automation step | `{ sessionId, currentStep, details }` |
| `error` | Error occurred | `{ code, message, details }` |
| `log` | Important log message | `{ sessionId, level, message }` |

## Progress Update Structure

```typescript
interface ProgressUpdate {
  totalJobs: number;      // Total jobs found
  processedJobs: number;  // Jobs processed so far
  appliedJobs: number;    // Successfully applied
  skippedJobs: number;    // Skipped (didn't match criteria)
  failedJobs: number;     // Failed applications
  currentPage: number;    // Current page being processed
  percentage: number;     // Completion percentage
}
```

## Intervention Types

When intervention is required, the service emits an event with:

```typescript
interface InterventionEvent {
  sessionId: string;
  type: 'LOGIN' | 'CAPTCHA' | 'TWO_FA' | 'BLOCKED' | 'RATE_LIMIT';
  message: string;         // User-friendly message
  liveViewUrl: string;     // Browserbase debug URL
  context?: any;           // Additional context
  timestamp: string;
}
```

## Security Features

### 1. **Authentication**
- JWT tokens validated on connection
- Tokens must be from Supabase Auth
- Invalid tokens rejected immediately

### 2. **Authorization**
- Session ownership verified before subscription
- Users can only access their own sessions
- Admin roles can monitor all sessions

### 3. **Rate Limiting**
- 10 subscriptions per user per minute
- Prevents abuse and resource exhaustion
- Automatic cleanup on disconnect

## Integration with LinkedIn Automation

### Emit Progress from Service

```typescript
// In LinkedInAutomationService
this.on(AutomationEventType.PROGRESS_UPDATED, (data) => {
  realtimeService.emitProgress(data.sessionId, {
    totalJobs: data.progress.totalJobs,
    processedJobs: data.progress.processedJobs,
    appliedJobs: data.progress.appliedJobs,
    skippedJobs: data.progress.skippedJobs,
    failedJobs: data.progress.failedJobs,
    currentPage: data.progress.currentPage,
    percentage: calculatePercentage(data.progress)
  });
});
```

### Emit Custom Events

```typescript
// Step updates
realtimeService.emitStepUpdate(sessionId, 'searching_jobs', {
  query: 'Software Engineer',
  location: 'San Francisco'
});

// Errors
realtimeService.emitError(sessionId, {
  code: 'SEARCH_FAILED',
  message: 'Failed to search jobs',
  timestamp: new Date().toISOString()
});

// Custom events
realtimeService.emitCustomEvent(sessionId, 'filter_applied', {
  filterType: 'experience_level',
  value: 'MID_LEVEL'
});
```

## Frontend Integration

### React Hook Example

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

function useRealtimeAutomation(sessionId: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [progress, setProgress] = useState(null);
  const [intervention, setIntervention] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const newSocket = io(process.env.REACT_APP_WS_URL, {
      auth: {
        token: localStorage.getItem('supabase_token')
      }
    });

    newSocket.on('connect', () => {
      setConnected(true);
      newSocket.emit('subscribe', { sessionId });
    });

    newSocket.on('progress_update', (data) => {
      setProgress(data.progress);
    });

    newSocket.on('intervention_required', (data) => {
      setIntervention(data);
    });

    setSocket(newSocket);

    return () => {
      newSocket.emit('unsubscribe', { sessionId });
      newSocket.disconnect();
    };
  }, [sessionId]);

  return { socket, connected, progress, intervention };
}
```

### Vue 3 Composable Example

```typescript
import { ref, onMounted, onUnmounted } from 'vue';
import { io, Socket } from 'socket.io-client';

export function useRealtimeAutomation(sessionId: string) {
  const socket = ref<Socket | null>(null);
  const progress = ref(null);
  const intervention = ref(null);
  const connected = ref(false);

  onMounted(() => {
    socket.value = io(import.meta.env.VITE_WS_URL, {
      auth: {
        token: localStorage.getItem('supabase_token')
      }
    });

    socket.value.on('connect', () => {
      connected.value = true;
      socket.value.emit('subscribe', { sessionId });
    });

    socket.value.on('progress_update', (data) => {
      progress.value = data.progress;
    });

    socket.value.on('intervention_required', (data) => {
      intervention.value = data;
    });
  });

  onUnmounted(() => {
    if (socket.value) {
      socket.value.emit('unsubscribe', { sessionId });
      socket.value.disconnect();
    }
  });

  return { socket, connected, progress, intervention };
}
```

## Monitoring & Debugging

### Enable Debug Logging

```typescript
const realtimeService = new RealtimeAutomationService(httpServer, url, key);
realtimeService.enableDebugLogging = true;
```

### Monitor Active Connections

```typescript
// Get all connected sockets
const sockets = await io.fetchSockets();
console.log(`Active connections: ${sockets.length}`);

// Get sockets in a specific room
const sessionSockets = await io.in('session:123').fetchSockets();
console.log(`Users watching session: ${sessionSockets.length}`);
```

### Health Check Endpoint

```typescript
app.get('/health/realtime', async (req, res) => {
  const metrics = {
    connections: (await io.fetchSockets()).length,
    channels: realtimeService.getActiveChannels(),
    uptime: process.uptime()
  };
  res.json(metrics);
});
```

## Performance Optimization

### 1. **Connection Pooling**
- Reuse Socket.io connections for multiple sessions
- Single connection per user, multiple subscriptions

### 2. **Event Throttling**
- Progress updates throttled to every 2 seconds
- Log events filtered by importance level
- Batch multiple updates when possible

### 3. **Resource Cleanup**
- Automatic channel unsubscribe on disconnect
- Periodic cleanup of stale connections
- Memory-efficient room management

## Troubleshooting

### Connection Issues

1. **Authentication Failed**
   - Verify JWT token is valid
   - Check token hasn't expired
   - Ensure Supabase Auth is configured

2. **Subscription Denied**
   - Verify user owns the session
   - Check rate limits haven't been exceeded
   - Ensure session exists in database

3. **No Updates Received**
   - Check Supabase Realtime is enabled
   - Verify RLS policies allow reading
   - Ensure database triggers are set up

### Performance Issues

1. **High Memory Usage**
   - Reduce subscription count per user
   - Implement connection pooling
   - Clear old room memberships

2. **Delayed Updates**
   - Check database query performance
   - Optimize Supabase Realtime settings
   - Use event throttling for high-frequency updates

## Best Practices

1. **Always Unsubscribe**
   - Clean up subscriptions when done
   - Prevents memory leaks
   - Reduces server load

2. **Handle Disconnections**
   - Implement reconnection logic
   - Cache last known state
   - Show connection status to users

3. **Error Handling**
   - Listen for error events
   - Implement retry logic
   - Provide user feedback

4. **Security**
   - Validate all client inputs
   - Never trust client session IDs
   - Always verify ownership

## Future Enhancements

1. **Horizontal Scaling**
   - Redis adapter for Socket.io
   - Multiple server instances
   - Load balancing

2. **Advanced Features**
   - Message history/replay
   - Presence tracking
   - Custom event filtering

3. **Analytics**
   - Connection metrics
   - Event frequency tracking
   - Performance monitoring