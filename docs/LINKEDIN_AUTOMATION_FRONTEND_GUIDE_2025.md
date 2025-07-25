# LinkedIn Automation Frontend Integration Guide - 2025

**IMPORTANT**: This is the ONLY guide you should follow for LinkedIn automation integration. All other guides are outdated.

## Overview

The LinkedIn automation feature uses:
- **Browserbase** for browser automation
- **Stagehand** for AI-powered browser control
- **HybridJobSearchFlow** as the ONLY automation flow
- **Supabase** for authentication and session storage

## API Endpoint

There is **ONLY ONE** endpoint for LinkedIn automation:

```
POST /api/linkedin/start
```

## Authentication

Use Supabase JWT token in the Authorization header:

```javascript
{
  "Authorization": "Bearer YOUR_SUPABASE_JWT_TOKEN",
  "Content-Type": "application/json"
}
```

## Request Format

```javascript
{
  "userId": "user-uuid-from-supabase-auth",  // REQUIRED
  "searchPrompt": "software engineer vancouver bc",  // Natural language search
  "resumeUrl": "https://...",  // Supabase storage URL (optional)
  "resumeMetadata": {  // Optional
    "fileName": "resume.pdf",
    "fileType": "application/pdf",
    "extractedText": "..."  // Optional, for better matching
  },
  "config": {  // Optional - can use searchPrompt instead
    "jobTitle": "software engineer",
    "location": "Vancouver, BC",
    "maxApplications": 50,  // Default: 50
    "filters": {
      "datePosted": "week",  // Options: "day", "week", "month"
      "remote": true,
      "easyApplyOnly": false,  // Default: false (applies to all jobs)
      "keywords": ["python", "django"]
    }
  }
}
```

### Important Notes:
- Either `searchPrompt` OR `config.jobTitle` must be provided
- `userId` MUST match the authenticated user's ID
- `resumeUrl` should point to a file in Supabase storage

## Response Format

```javascript
{
  "sessionId": "browserbase-session-id",
  "liveViewUrl": "https://api.browserbase.com/v1/sessions/xxx/debug",
  "status": "running",
  "taskId": "task_xxx",
  "browserbaseSessionId": "same-as-sessionId"  // For backward compatibility
}
```

## Real-time Updates via Polling

Poll the status endpoint every 2-5 seconds:

```
GET /api/linkedin/status/{sessionId}
```

Response:
```javascript
{
  "status": "running" | "completed" | "failed" | "intervention_required",
  "progress": {
    "totalApplications": 10,
    "applicationsToday": 5,
    "applicationsThisWeek": 20,
    "applicationsThisMonth": 50,
    "totalTimeSeconds": 3600,
    "sessionDurationSeconds": 1800
  },
  "liveViewUrl": "https://...",  // Only when active
  "intervention": {  // Only when intervention_required
    "required": true,
    "type": "LOGIN" | "CAPTCHA" | "TWO_FA" | "BLOCKED" | "RATE_LIMIT",
    "message": "Please log in to your LinkedIn account",
    "instructions": "...",
    "url": "current-page-url",
    "liveViewUrl": "browserbase-debug-url"
  }
}
```

## Handling Interventions

When `status` is `intervention_required`:

1. Show the user the intervention message
2. Embed the `liveViewUrl` in an iframe for user to complete the action
3. Once user completes the intervention, call:

```
POST /api/linkedin/continue/{sessionId}
{
  "interventionCompleted": true
}
```

## Session Management

### Stop a session:
```
DELETE /api/linkedin/stop/{sessionId}
```

### Pause a session:
```
PUT /api/linkedin/pause/{sessionId}
```

### Resume a paused session:
```
PUT /api/linkedin/resume/{sessionId}
```

## Context Management (First-time Users)

### Check if user has LinkedIn context:
```
GET /api/linkedin/context-status
```

Response:
```javascript
{
  "hasContext": false,  // true if user has logged in before
  "contextId": null,    // or "context_xxx" if exists
  "lastUsed": null      // ISO date of last use
}
```

If `hasContext` is false, the user will need to log in during their first session.

## Complete Frontend Example

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Start automation
async function startLinkedInAutomation(searchPrompt, resumeUrl) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/api/linkedin/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session.access_token}`
    },
    body: JSON.stringify({
      userId: user.id,
      searchPrompt,
      resumeUrl,
      config: {
        maxApplications: 50,
        filters: {
          easyApplyOnly: true,
          remote: true
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to start: ${response.statusText}`);
  }

  const { sessionId, liveViewUrl } = await response.json();
  
  // Store session ID
  localStorage.setItem('activeSessionId', sessionId);
  
  // Start polling for status
  startPolling(sessionId);
  
  return { sessionId, liveViewUrl };
}

// Poll for status updates
function startPolling(sessionId) {
  const interval = setInterval(async () => {
    try {
      const status = await getSessionStatus(sessionId);
      
      // Update UI with status
      updateUI(status);
      
      // Stop polling if session is done
      if (['completed', 'failed'].includes(status.status)) {
        clearInterval(interval);
      }
      
      // Handle intervention
      if (status.status === 'intervention_required') {
        showInterventionModal(status.intervention);
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 3000); // Poll every 3 seconds
}

// Get session status
async function getSessionStatus(sessionId) {
  const response = await fetch(`${API_BASE_URL}/api/linkedin/status/${sessionId}`, {
    headers: {
      'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session.access_token}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get status');
  }
  
  return response.json();
}

// Continue after intervention
async function continueAfterIntervention(sessionId) {
  const response = await fetch(`${API_BASE_URL}/api/linkedin/continue/${sessionId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session.access_token}`
    },
    body: JSON.stringify({
      interventionCompleted: true
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to continue');
  }
  
  // Resume polling
  startPolling(sessionId);
}
```

## Embedding the Live View

```html
<iframe 
  src={liveViewUrl}
  width="100%"
  height="600"
  style={{ border: 'none' }}
  title="LinkedIn Automation"
/>
```

## Error Handling

Common errors:

1. **401 Unauthorized**: Invalid or missing JWT token
2. **403 Forbidden**: userId doesn't match authenticated user
3. **400 Bad Request**: Missing required fields
4. **429 Too Many Requests**: Rate limit exceeded (10 sessions per hour)
5. **500 Internal Server Error**: Check error message for details

## Important Notes

1. **Session Limits**: Users can have max 3 active sessions
2. **Rate Limits**: 10 new sessions per hour per user
3. **Session Duration**: Sessions expire after 2 hours
4. **First-time Users**: Will see intervention_required for login
5. **Resume Upload**: Upload to Supabase storage first, then pass the URL

## What NOT to Do

1. **DON'T** use any other endpoints or flows
2. **DON'T** create multiple sessions simultaneously
3. **DON'T** bypass authentication
4. **DON'T** poll more frequently than every 2 seconds
5. **DON'T** ignore intervention requirements

## Debugging Tips

1. Check browser DevTools Network tab for actual API calls
2. Verify the JWT token is valid and not expired
3. Ensure userId matches the authenticated user
4. Check for React StrictMode causing double renders
5. Clear localStorage before starting new sessions

## Support

For issues:
1. Check the Network tab for API errors
2. Verify authentication is working
3. Check browser console for JavaScript errors
4. Ensure you're using the latest API endpoint