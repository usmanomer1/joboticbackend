# Browserbase Session Manager

The BrowserbaseSessionManager integrates Browserbase's cloud browser infrastructure with Supabase for comprehensive session management, providing user isolation, intervention handling, and session persistence.

## Key Features

### 1. **Complete User Isolation**
- Each user gets a dedicated Browserbase context: `user_${userId}_linkedin_context`
- No shared browser sessions between users
- Secure, isolated browsing environments

### 2. **Session State Management**
- States: `running`, `paused`, `intervention_required`, `completed`, `failed`
- Seamless pause/resume functionality
- Session persistence across automation runs

### 3. **Human-in-the-Loop Interventions**
- Automatic detection of intervention needs (login, CAPTCHA, 2FA)
- Live browser access URLs for manual intervention
- Real-time status updates via WebSocket

### 4. **Cost Optimization**
- Session reuse for the same user
- Automatic cleanup of stale sessions
- Configurable session limits per user

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│                 │     │                  │     │                 │
│  Frontend/API   │────▶│ SessionManager   │────▶│   Browserbase   │
│                 │     │                  │     │   Cloud Browser │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │                           │
                               ▼                           │
                        ┌──────────────────┐               │
                        │                  │               │
                        │    Supabase      │◀──────────────┘
                        │   (PostgreSQL)   │    Session State
                        └──────────────────┘
```

## Usage

### Basic Session Creation

```typescript
import { browserbaseSessionManager } from './services/browserbase';

// Create a new session
const session = await browserbaseSessionManager.createUserSession(userId, {
  jobTitle: 'Software Engineer',
  location: 'San Francisco, CA',
  experienceLevel: ['Entry', 'Mid'],
  remote: true,
  targetCount: 50,
  easyApplyOnly: true
});

// Connect with Playwright
import { chromium } from 'playwright-core';

const connectionUrl = browserbaseSessionManager.getConnectionUrl(
  session.browserbase_session_id,
  { enableProxy: true }
);

const browser = await chromium.connectOverCDP(connectionUrl);
```

### Session Reuse

```typescript
// Get existing session or create new one
const session = await browserbaseSessionManager.getOrCreateSession(userId, config);
```

### Handling Interventions

```typescript
// When login is required
const intervention = await automationService.logIntervention(
  session.id,
  InterventionType.LOGIN,
  liveViewUrl,
  { currentUrl: page.url() },
  'Please log in to continue'
);

// Pause session for user intervention
await browserbaseSessionManager.pauseSession(session.id);

// Get debug URL for user
const debugUrl = await browserbaseSessionManager.getDebugUrl(
  session.browserbase_session_id
);

// After user completes intervention
await automationService.resolveIntervention(intervention.id);
await browserbaseSessionManager.resumeSession(session.id);
```

### Real-time Monitoring

```typescript
// Subscribe to session status changes
const unsubscribe = automationService.subscribeToSessionStatus(
  session.id,
  (newStatus) => {
    console.log('Status changed:', newStatus);
  }
);

// Subscribe to interventions
const unsubscribeInterventions = automationService.subscribeToInterventions(
  userId,
  (intervention) => {
    // Notify user
    sendNotification(intervention);
  }
);
```

### Session Cleanup

```typescript
// Terminate a session
await browserbaseSessionManager.terminateSession(
  session.id,
  'User requested termination'
);

// Clean up stale sessions (runs automatically)
const cleaned = await browserbaseSessionManager.cleanupStaleSessions(24);
```

## API Reference

### createUserSession(userId, config)
Creates a new browser session for a user with the specified configuration.

### getOrCreateSession(userId, config)
Gets an existing paused session or creates a new one if none exists.

### pauseSession(sessionId)
Pauses an active session without terminating the browser instance.

### resumeSession(sessionId)
Resumes a paused session if the browser instance is still valid.

### terminateSession(sessionId, reason?)
Terminates a session and releases the browser resources.

### cleanupStaleSessions(hours?)
Cleans up sessions that have been inactive for the specified hours.

### getConnectionUrl(sessionId, options?)
Returns the WebSocket URL for connecting to the browser session.

### getDebugUrl(sessionId)
Returns the debug URL for live viewing and manual intervention.

## Environment Variables

```bash
# Required
BROWSERBASE_API_KEY=your_api_key
BROWSERBASE_PROJECT_ID=your_project_id
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
```

## Error Handling

The session manager includes comprehensive error handling:

- `SESSION_LIMIT_REACHED`: User has too many active sessions
- `SESSION_NOT_FOUND`: Requested session doesn't exist
- `INVALID_SESSION_STATE`: Invalid state transition attempted
- `BROWSER_SESSION_EXPIRED`: Browserbase session has expired
- `BROWSERBASE_API_ERROR`: API communication error

## Best Practices

1. **Always use session reuse** - Call `getOrCreateSession` instead of `createUserSession`
2. **Handle interventions gracefully** - Provide clear UI for users to complete manual steps
3. **Monitor real-time updates** - Subscribe to status changes and interventions
4. **Clean up properly** - Always terminate sessions when done
5. **Set reasonable timeouts** - Default is 1 hour per session
6. **Implement rate limiting** - Check application rates before processing

## Integration with Stagehand

The session manager is designed to work seamlessly with Stagehand for AI-powered automation:

```typescript
import { Stagehand } from '@browserbase/stagehand';

// Create Stagehand instance with existing session
const stagehand = new Stagehand({
  env: 'BROWSERBASE',
  apiKey: process.env.BROWSERBASE_API_KEY,
  sessionId: session.browserbase_session_id
});

// Use Stagehand for automation
await stagehand.page.goto('https://linkedin.com');
await stagehand.act('Click on Jobs tab');
```

## Troubleshooting

### Session Won't Resume
- Check if browser session is still valid
- Verify session state is `paused`
- Ensure Browserbase session hasn't expired

### High Resource Usage
- Implement session limits per user
- Run cleanup regularly
- Set appropriate session timeouts

### Intervention Detection Issues
- Implement proper selectors for detection
- Add timeout handling
- Provide fallback mechanisms