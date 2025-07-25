# Troubleshooting: LinkedIn Automation Session Not Starting

## Issue
"Auth successful but session not starting" - The authentication works but the automation doesn't begin.

## Root Cause
The frontend was using the wrong endpoint URL. The correct endpoint is `/api/linkedin/start`, not `/api/linkedin/start-job-search`.

## Solution

### 1. Update Frontend API Calls

Replace any calls to `/api/linkedin/start-job-search` with `/api/linkedin/start`:

```typescript
// ❌ WRONG
const response = await fetch('/api/linkedin/start-job-search', {
  method: 'POST',
  // ...
});

// ✅ CORRECT
const response = await fetch('/api/linkedin/start', {
  method: 'POST',
  // ...
});
```

### 2. Correct Request Body Format

The request body structure should match the controller's expectations:

```typescript
{
  // Required fields
  userId: "user-uuid-here",           // The authenticated user's ID
  searchPrompt: "software engineer vancouver bc",  // Natural language search
  
  // Resume information (optional but recommended)
  resumeUrl: "https://your-supabase.supabase.co/storage/v1/object/public/resumes/file.pdf",
  resumeMetadata: {
    fileName: "resume.pdf",
    fileType: "application/pdf",
    extractedText: "..."  // Optional, helps with form filling
  },
  
  // Optional configuration
  config: {
    filters: {
      easyApplyOnly: true,    // Optional
      remote: true,           // Optional
      datePosted: "week"      // Optional: "day", "week", or "month"
    },
    maxApplications: 50       // Default: 50
  }
}
```

### 3. Complete API Endpoint Reference

| Action | Method | Endpoint | Description |
|--------|--------|----------|-------------|
| Check Context | GET | `/api/linkedin/context-status` | Check if user has saved login |
| Start Search | POST | `/api/linkedin/start` | Begin job search automation |
| Get Status | GET | `/api/linkedin/status/:sessionId` | Check session status |
| Continue | POST | `/api/linkedin/continue/:sessionId` | Resume after intervention |
| Stop | DELETE | `/api/linkedin/stop/:sessionId` | Stop automation |

### 4. Response Format

The successful response from `/api/linkedin/start` will be:

```typescript
{
  sessionId: "browserbase-session-id",
  liveViewUrl: "https://api.browserbase.com/live/session-id",
  status: "running",
  taskId: "task_uuid",
  browserbaseSessionId: "browserbase-session-id"  // Same as sessionId
}
```

### 5. Common Issues

1. **Missing userId**: The `userId` field is required and must match the authenticated user
2. **Wrong endpoint**: Using `/start-job-search` instead of `/start`
3. **Missing authentication**: Ensure the `Authorization: Bearer <token>` header is present
4. **Incorrect body structure**: The filters must be nested under `config.filters`

### 6. Debugging Steps

1. Check browser console for the exact request being sent
2. Verify the endpoint URL is `/api/linkedin/start`
3. Confirm the request body includes `userId` and `searchPrompt`
4. Check the response status code and body for error messages
5. Look at server logs for any error messages during session creation

### 7. Server Log Analysis

When debugging, look for these log messages:

```
POST /api/linkedin/start
[sessionId] Auth successful for user: <userId>
Created Browserbase session with context: { sessionId, hasContext, contextId }
Stagehand initialized successfully
```

If you see "Auth successful" but no further logs, it usually means:
- The endpoint URL is wrong (404 error)
- The request body validation failed (400 error)
- A server error occurred during session creation (500 error)