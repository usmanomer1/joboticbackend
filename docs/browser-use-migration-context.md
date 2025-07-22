# Browser Use to Stagehand/Browserbase Migration Guide

## Executive Summary

This document provides a comprehensive handoff for migrating the LinkedIn automation functionality from Browser Use API to Stagehand + Browserbase. The migration will be implemented in the backend repository, with the frontend connecting to new backend endpoints once ready.

**Critical Note**: Do NOT remove Browser Use code from the frontend until the backend migration is complete and new endpoints are provided.

## Current Architecture Overview

### Browser Use Implementation

**API Client**: `src/lib/browserUseClient.ts`
- Manages all Browser Use API interactions
- Handles task creation, monitoring, pause/resume, and termination
- Implements file upload for resume/document processing
- **CRITICAL SECURITY ISSUE**: `save_browser_data` is hardcoded to `false` because all users share the same API key, preventing session persistence

**Main UI Component**: `src/components/LinkedInAutomationBot.tsx`
- Complex multi-step form for LinkedIn automation
- Live browser preview via WebSocket connection
- Pause/resume functionality
- Handles both Easy Apply and external job applications
- Voice-guided setup option (ElevenLabs integration)

**Session Management**: `src/lib/sessionManager.ts`
- Local tracking of login state (not actual session persistence)
- 7-day session validity estimation
- Manual session clearing capability

## Key Features to Replicate

### 1. LinkedIn Job Automation
- **Login Flow**: First-time users manually login while AI observes
- **Job Search**: Navigate to jobs page, apply filters, search for positions
- **Application Types**:
  - Easy Apply: Direct LinkedIn applications
  - External Applications: Navigate to company sites and fill forms
- **Multi-step Process**: Each application involves multiple AI-driven steps
- **Error Recovery**: Retry logic for failed applications

### 2. Live Browser Preview
- Real-time browser view via WebSocket connection
- Shows user what the AI is doing
- Essential for user trust and debugging

### 3. Task Control
- **Pause/Resume**: Critical for user control
- **Stop**: Immediate task termination
- **Status Tracking**: Running, paused, completed, failed states

### 4. File Upload Support
- Resume upload for job applications
- Document processing integration
- Presigned URL pattern for secure uploads

### 5. Comprehensive Task Instructions
The AI receives detailed instructions including:
- User's job preferences and experience
- How to handle different application scenarios
- Error recovery procedures
- External site navigation guidelines

## Migration Architecture with Stagehand + Browserbase

### Browserbase Setup

```typescript
// Backend implementation example
import { Browserbase } from '@browserbase/sdk';
import StagehandConfig from 'stagehand';

const browserbase = new Browserbase({
  apiKey: process.env.BROWSERBASE_API_KEY
});

// Create isolated session per user
async function createUserSession(userId: string) {
  const session = await browserbase.createSession({
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    // Each user gets their own isolated browser session
    metadata: { userId },
    // Enable live view
    liveView: true,
    // Keep session alive for reuse
    keepAlive: true,
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
  });
  
  return session;
}
```

### Stagehand Integration

```typescript
import { Stagehand } from 'stagehand';

async function createLinkedInAutomation(sessionId: string, config: AutomationConfig) {
  const stagehand = new Stagehand({
    env: 'BROWSERBASE',
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    sessionId: sessionId,
    modelName: 'gpt-4o', // or 'claude-3-sonnet'
    modelApiKey: process.env.OPENAI_API_KEY,
    debugDom: true,
    headless: false,
    logger: (message: string) => {
      console.log(`[Stagehand] ${message}`);
      // Send to frontend via WebSocket
    },
  });

  await stagehand.init();
  return stagehand;
}
```

### Task Execution Pattern

```typescript
async function executeLinkedInTask(userId: string, taskConfig: TaskConfig) {
  // 1. Get or create user's browser session
  const session = await getOrCreateUserSession(userId);
  
  // 2. Initialize Stagehand with the session
  const stagehand = await createLinkedInAutomation(session.id, taskConfig);
  
  // 3. Execute automation steps
  try {
    // Navigate to LinkedIn
    await stagehand.page.goto('https://www.linkedin.com/jobs');
    
    // Use Stagehand's AI-powered actions
    await stagehand.act({
      action: 'click',
      element: 'Jobs navigation link'
    });
    
    // Fill search criteria
    await stagehand.act({
      action: 'fill',
      element: 'job search input',
      value: taskConfig.jobTitle
    });
    
    // Continue with application flow...
    
  } catch (error) {
    // Error handling
  } finally {
    // Keep session alive for reuse
    if (!taskConfig.endSession) {
      await stagehand.close();
    }
  }
}
```

## Key Migration Mappings

### Browser Use → Stagehand/Browserbase

| Browser Use Feature | Stagehand/Browserbase Equivalent |
|-------------------|----------------------------------|
| `save_browser_data: false` | Browserbase isolated sessions per user |
| Task creation API | Stagehand instance initialization |
| `live_url` for preview | Browserbase `session.liveViewUrl` |
| Task pause/resume | Custom implementation with session persistence |
| Task status polling | WebSocket or polling on session state |
| File upload | Direct page.upload or presigned URL pattern |
| Multi-step instructions | Stagehand `.act()` with natural language |
| Error recovery | Try-catch with Stagehand error details |

### API Endpoint Mappings

Current Browser Use endpoints to implement in backend:

1. **POST /api/automation/linkedin/start**
   - Create Browserbase session
   - Initialize Stagehand
   - Start automation task
   - Return session ID and live view URL

2. **GET /api/automation/linkedin/status/:sessionId**
   - Check Browserbase session status
   - Return current automation state

3. **PUT /api/automation/linkedin/pause/:sessionId**
   - Implement pause logic (save state)
   - Keep Browserbase session alive

4. **PUT /api/automation/linkedin/resume/:sessionId**
   - Restore saved state
   - Continue automation

5. **DELETE /api/automation/linkedin/stop/:sessionId**
   - Stop automation
   - Optionally close Browserbase session

6. **POST /api/automation/linkedin/upload**
   - Handle file uploads for resumes
   - Return file reference for use in automation

## Implementation Considerations

### 1. Session Persistence (SOLVED!)
Browserbase provides true session isolation per user, solving Browser Use's critical security issue where all users shared sessions.

### 2. Cost Optimization
- Browserbase charges per minute of browser time
- Implement intelligent session reuse
- Set appropriate timeouts
- Consider session pooling for cost efficiency

### 3. Live Preview
Browserbase provides `liveViewUrl` which can be embedded in an iframe or opened in a new tab:

```typescript
// Backend returns this to frontend
return {
  sessionId: session.id,
  liveViewUrl: session.liveViewUrl,
  status: 'running'
};
```

### 4. Enhanced Capabilities with Stagehand

Stagehand provides superior AI-powered browser automation:

```typescript
// Natural language actions
await stagehand.act({ 
  action: "click", 
  element: "Easy Apply button" 
});

// Extract structured data
const jobDetails = await stagehand.extract({
  instruction: "Extract job title, company, and requirements",
  schema: z.object({
    title: z.string(),
    company: z.string(),
    requirements: z.array(z.string())
  })
});

// Take screenshots for debugging
const screenshot = await stagehand.page.screenshot();
```

### 5. Error Handling and Recovery

```typescript
class LinkedInAutomationService {
  async executeWithRetry(action: () => Promise<any>, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await action();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        
        // Log error and retry
        console.error(`Attempt ${i + 1} failed:`, error);
        await this.wait(2000 * (i + 1)); // Exponential backoff
      }
    }
  }
  
  async handleApplicationError(stagehand: Stagehand, error: Error) {
    // Take screenshot for debugging
    const screenshot = await stagehand.page.screenshot();
    
    // Save error context
    await this.saveErrorContext({
      error: error.message,
      screenshot,
      url: await stagehand.page.url(),
      timestamp: new Date()
    });
    
    // Attempt recovery based on error type
    if (error.message.includes('timeout')) {
      await stagehand.page.reload();
    }
  }
}
```

## Migration Checklist

### Backend Tasks
- [ ] Set up Browserbase account and API keys
- [ ] Implement user session management
- [ ] Create API endpoints matching current Browser Use functionality
- [ ] Implement Stagehand automation logic
- [ ] Add WebSocket support for real-time updates
- [ ] Implement pause/resume state management
- [ ] Add comprehensive error handling
- [ ] Create file upload handling
- [ ] Add usage tracking and logging

### Frontend Tasks (After Backend Ready)
- [ ] Update API client to use new backend endpoints
- [ ] Replace Browser Use live preview with Browserbase live view
- [ ] Update status polling to match new API
- [ ] Adapt error handling to new error formats
- [ ] Test all automation flows
- [ ] Remove Browser Use dependencies

### Testing Requirements
- [ ] Test session isolation between users
- [ ] Verify pause/resume functionality
- [ ] Test error recovery scenarios
- [ ] Validate file upload flow
- [ ] Performance testing with multiple concurrent users
- [ ] Cost analysis and optimization

## Security Improvements

The migration to Browserbase solves the critical security issue:

1. **Session Isolation**: Each user gets a completely isolated browser session
2. **No Shared State**: Users cannot access each other's LinkedIn sessions
3. **Secure Storage**: Browserbase handles secure session data storage
4. **Audit Trail**: Better logging and monitoring capabilities

## Code Examples for Backend Implementation

### Complete Task Execution Flow

```typescript
// backend/services/LinkedInAutomationService.ts
export class LinkedInAutomationService {
  private browserbase: Browserbase;
  private sessions: Map<string, SessionInfo> = new Map();

  constructor() {
    this.browserbase = new Browserbase({
      apiKey: process.env.BROWSERBASE_API_KEY!
    });
  }

  async startAutomation(userId: string, config: AutomationConfig) {
    // Create or reuse session
    const session = await this.getOrCreateSession(userId);
    
    // Initialize Stagehand
    const stagehand = new Stagehand({
      env: 'BROWSERBASE',
      sessionId: session.id,
      modelName: 'gpt-4o',
      modelApiKey: process.env.OPENAI_API_KEY!,
    });

    await stagehand.init();

    // Store session info
    this.sessions.set(userId, {
      sessionId: session.id,
      stagehand,
      status: 'running',
      liveViewUrl: session.liveViewUrl
    });

    // Execute automation in background
    this.runAutomation(userId, stagehand, config).catch(error => {
      console.error('Automation error:', error);
      this.updateStatus(userId, 'failed', error.message);
    });

    return {
      sessionId: session.id,
      liveViewUrl: session.liveViewUrl,
      status: 'running'
    };
  }

  private async runAutomation(
    userId: string, 
    stagehand: Stagehand, 
    config: AutomationConfig
  ) {
    try {
      // Navigate to LinkedIn
      await stagehand.page.goto('https://www.linkedin.com/jobs');
      
      // Check if login required
      const isLoggedIn = await stagehand.page.evaluate(() => {
        return !document.querySelector('[data-test-id="login-form"]');
      });

      if (!isLoggedIn) {
        // Handle login flow
        await this.handleLogin(stagehand, config);
      }

      // Execute job search and applications
      await this.searchAndApplyToJobs(stagehand, config);
      
      this.updateStatus(userId, 'completed');
    } catch (error) {
      this.updateStatus(userId, 'failed', error.message);
      throw error;
    }
  }

  async pauseAutomation(userId: string) {
    const sessionInfo = this.sessions.get(userId);
    if (!sessionInfo) throw new Error('No active session');

    // Save current state
    const currentUrl = await sessionInfo.stagehand.page.url();
    const cookies = await sessionInfo.stagehand.page.cookies();
    
    // Store state for resume
    sessionInfo.pausedState = {
      url: currentUrl,
      cookies,
      timestamp: Date.now()
    };
    
    sessionInfo.status = 'paused';
    return { status: 'paused' };
  }

  async resumeAutomation(userId: string) {
    const sessionInfo = this.sessions.get(userId);
    if (!sessionInfo || !sessionInfo.pausedState) {
      throw new Error('No paused session to resume');
    }

    // Restore state
    await sessionInfo.stagehand.page.goto(sessionInfo.pausedState.url);
    await sessionInfo.stagehand.page.setCookies(sessionInfo.pausedState.cookies);
    
    sessionInfo.status = 'running';
    
    // Continue automation
    // ... resume logic
    
    return { status: 'running' };
  }
}
```

## Conclusion

The migration from Browser Use to Stagehand + Browserbase will provide:

1. **Better Security**: True session isolation per user
2. **Enhanced Capabilities**: More powerful AI-driven automation
3. **Improved Reliability**: Better error handling and recovery
4. **Cost Efficiency**: Pay-per-use model with session reuse
5. **Better Developer Experience**: Modern SDKs and documentation

The frontend code should remain unchanged until the backend implementation is complete and tested. Once new endpoints are provided, the frontend migration will be straightforward - primarily updating API calls and preview URLs.