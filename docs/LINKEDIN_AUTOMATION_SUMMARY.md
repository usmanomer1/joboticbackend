# LinkedIn Automation System - Complete Technical Summary

## Architecture Overview

### 1. **Browser Automation Stack**
- **Browserbase**: Cloud browser infrastructure (provides browser sessions)
- **Stagehand**: AI-powered automation library (uses Gemini for intelligent actions)
- **Gemini API**: Google's AI model for natural language understanding

### 2. **Session Management**
```
User → API → Stagehand → Browserbase Session → LinkedIn
         ↓
     Supabase DB (tracks session state, applications, config)
```

## How It Works

### Starting Automation

1. **Frontend calls POST /api/linkedin/start**
   ```json
   {
     "userId": "27c01ed9-...",
     "searchPrompt": "software engineer jobs in vancouver bc",
     "config": {
       "filters": { "easyApplyOnly": true },
       "maxApplications": 50
     }
   }
   ```

2. **Backend creates Stagehand instance**
   - Connects to existing Browserbase session OR creates new one
   - Gets actual session ID from Browserbase
   - Fetches debug URL via Browserbase API

3. **Returns session info to frontend**
   ```json
   {
     "sessionId": "8873fd53-90a6-466d-b650-74af9bd43754",
     "liveViewUrl": "https://www.browserbase.com/devtools/inspector.html?...",
     "status": "running",
     "taskId": "task_...",
     "browserbaseSessionId": "8873fd53-90a6-466d-b650-74af9bd43754"
   }
   ```

### Intervention Flow

1. **Bot navigates to LinkedIn**
2. **Detects login page using AI**
   ```typescript
   const pageState = await stagehand.page.extract({
     instruction: "Analyze if it's a login page...",
     schema: z.object({
       isLoginPage: z.boolean(),
       hasCaptcha: z.boolean(),
       // etc...
     })
   });
   ```

3. **Emits intervention event**
   - Updates DB status to 'intervention_required'
   - Stores intervention details in memory
   - Automation pauses (browser stays open)

4. **Frontend polls GET /api/linkedin/status/:sessionId**
   ```json
   {
     "status": "intervention_required",
     "intervention": {
       "required": true,
       "type": "login",
       "message": "LinkedIn login required",
       "instructions": "Please log in to your LinkedIn account...",
       "detectedAt": "2024-01-01T12:00:00Z"
     },
     "liveViewUrl": "https://www.browserbase.com/devtools/inspector.html?..."
   }
   ```

5. **User completes login in browser**

6. **Frontend calls POST /api/linkedin/continue/:sessionId**
   ```json
   {
     "interventionCompleted": true
   }
   ```

7. **Backend resumes automation**
   - Calls `resumeSession()` method
   - Checks current URL
   - Continues job search from where it left off

## Key Components

### Database Tables (Supabase)

**linkedin_sessions**
- Tracks automation sessions
- Stores config for resumption
- Status: active, completed, failed, expired, intervention_required

**job_applications**
- Records all job applications
- Prevents duplicates
- Links to session

### Services

**LinkedInAutomationService**
- Core automation logic
- Manages Stagehand instances
- Handles intervention detection
- Emits events for real-time updates

**InterventionDetectionService**
- AI-powered page analysis
- Detects: login, captcha, 2FA, blocked, rate limit
- Uses Stagehand's extract method with Zod schemas

**LinkedInSessionService**
- Database operations
- Session lifecycle management
- Usage tracking

**BrowserbaseSessionManager**
- Creates browser sessions
- Fetches debug URLs
- Manages session limits (3 per user)

### Event System
```typescript
AutomationEventType {
  SESSION_STARTED
  SESSION_PAUSED
  SESSION_RESUMED
  SESSION_STOPPED
  SESSION_COMPLETED
  PROGRESS_UPDATED
  INTERVENTION_REQUIRED
  ERROR
}
```

## Natural Language Filter Support

The system understands filters from prompts:
- "posted this week" → datePosted: 'week'
- "remote" → remote: true
- "easy apply only" → easyApplyOnly: true
- "senior level" → experienceLevel: ['SENIOR_LEVEL']

## Error Handling

1. **Intervention errors** are NOT failures - session stays active
2. **Network errors** trigger retry logic
3. **Session limits** prevent abuse (3 concurrent sessions)
4. **Rate limiting** on API endpoints

## Frontend Integration Points

### 1. Starting automation
- Show loading state
- Store sessionId for polling
- Open liveViewUrl in new tab/iframe

### 2. Status polling
- Poll every 2-3 seconds while active
- Check for intervention field
- Update progress metrics

### 3. Intervention handling
- Show modal with instructions
- Keep liveViewUrl accessible
- Call continue endpoint when done

### 4. Completion
- Stop polling
- Show final statistics
- Clear stored sessionId

## Live View URL

The correct format from Browserbase API:
```
https://www.browserbase.com/devtools/inspector.html?wss=connect.browserbase.com/debug/{sessionId}/devtools/page/{pageId}?debug=true
```

This URL provides:
- Live browser view
- DevTools access
- Real-time interaction
- Debug capabilities

## Common Issues & Solutions

1. **Frontend polling wrong session ID**
   - Use the sessionId from response, not stagehand- prefix

2. **Intervention not detected**
   - Check intervention field in status response
   - Don't treat as error - it's expected flow

3. **Automation doesn't resume**
   - Ensure continue endpoint is called
   - Check session is still active in DB

4. **Live view not working**
   - URL must come from Browserbase debug API
   - Session must be active

## Testing the Flow

1. Start automation with test account
2. Verify intervention detected on login page
3. Complete login manually
4. Call continue endpoint
5. Watch automation proceed to job search
6. Monitor progress through status polling