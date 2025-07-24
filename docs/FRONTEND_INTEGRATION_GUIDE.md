# LinkedIn Automation Frontend Integration Guide

## Overview
This guide explains how to integrate with the LinkedIn automation backend API to provide a real-time, interactive automation experience.

## Key Concepts

### Session Lifecycle
1. **Active**: Automation is running
2. **Intervention Required**: User action needed (login, captcha, etc.)
3. **Completed**: Automation finished successfully
4. **Failed**: Automation encountered an error
5. **Expired**: Session timed out

### Real-time Updates
The system uses a polling mechanism to get real-time updates. Frontend should poll the status endpoint every 2-3 seconds while a session is active.

## API Endpoints

### 1. Start Automation
```typescript
POST /api/linkedin/start
Headers: {
  'Authorization': 'Bearer <jwt-token>',
  'Content-Type': 'application/json'
}
Body: {
  userId: string,
  searchPrompt?: string, // Natural language search
  config?: {
    jobTitle?: string,
    location?: string,
    experience?: string[],
    filters?: {
      datePosted?: 'day' | 'week' | 'month',
      jobType?: string[],
      remote?: boolean,
      easyApplyOnly?: boolean,
      keywords?: string[]
    },
    maxApplications?: number
  }
}

Response: {
  sessionId: string,
  liveViewUrl: string, // Browserbase debug URL
  status: 'running',
  taskId: string
}
```

### 2. Get Status (Poll this endpoint)
```typescript
GET /api/linkedin/status/:sessionId
Headers: {
  'Authorization': 'Bearer <jwt-token>'
}

Response: {
  status: 'running' | 'completed' | 'failed' | 'intervention_required',
  progress: {
    totalApplications: number,
    applicationsToday: number,
    applicationsThisWeek: number,
    applicationsThisMonth: number,
    totalTimeSeconds: number,
    sessionDurationSeconds: number
  },
  liveViewUrl?: string,
  
  // This field is present when intervention is needed
  intervention?: {
    required: boolean,
    type: 'login' | 'captcha' | 'two_fa' | 'blocked' | 'rate_limit',
    message: string,
    instructions: string,
    detectedAt: string,
    pageUrl?: string
  }
}
```

### 3. Continue After Intervention
```typescript
POST /api/linkedin/continue/:sessionId
Headers: {
  'Authorization': 'Bearer <jwt-token>',
  'Content-Type': 'application/json'
}
Body: {
  interventionCompleted: true
}

Response: {
  success: true,
  status: 'running',
  message: 'Session resumed after intervention'
}
```

### 4. Pause Automation
```typescript
PUT /api/linkedin/pause/:sessionId
Headers: {
  'Authorization': 'Bearer <jwt-token>'
}

Response: {
  success: true,
  status: 'paused'
}
```

### 5. Stop Automation
```typescript
DELETE /api/linkedin/stop/:sessionId
Headers: {
  'Authorization': 'Bearer <jwt-token>'
}

Response: {
  success: true,
  status: 'stopped'
}
```

## Frontend Implementation Flow

### 1. Starting Automation
```javascript
// Start automation
const response = await fetch('/api/linkedin/start', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: currentUser.id,
    searchPrompt: "Software engineer jobs in San Francisco",
    config: {
      maxApplications: 50,
      filters: {
        easyApplyOnly: true,
        datePosted: 'week'
      }
    }
  })
});

const { sessionId, liveViewUrl } = await response.json();

// Store sessionId for polling
localStorage.setItem('activeSessionId', sessionId);

// Show live view in iframe or new window
window.open(liveViewUrl, '_blank');
```

### 2. Polling for Updates
```javascript
let pollInterval;

function startPolling(sessionId) {
  pollInterval = setInterval(async () => {
    const response = await fetch(`/api/linkedin/status/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    const data = await response.json();
    
    // Update UI with progress
    updateProgressUI(data.progress);
    
    // Check for intervention
    if (data.intervention) {
      handleIntervention(data.intervention, sessionId);
    }
    
    // Stop polling if session is complete
    if (['completed', 'failed'].includes(data.status)) {
      clearInterval(pollInterval);
      handleSessionComplete(data);
    }
  }, 3000); // Poll every 3 seconds
}
```

### 3. Handling Interventions
```javascript
function handleIntervention(intervention, sessionId) {
  // Show intervention modal/notification
  showInterventionModal({
    type: intervention.type,
    message: intervention.message,
    instructions: intervention.instructions,
    
    // When user clicks "I've completed the action"
    onComplete: async () => {
      await fetch(`/api/linkedin/continue/${sessionId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          interventionCompleted: true
        })
      });
      
      // Resume polling
      hideInterventionModal();
    }
  });
}
```

## Intervention Types and UI

### Login Required
```javascript
{
  type: 'login',
  message: 'LinkedIn login required',
  instructions: 'Please log in to your LinkedIn account to continue the automation. Enter your email/username and password, then click Sign In.'
}
```
**UI**: Show a prominent notification with a button to open the live view URL where user can complete login.

### CAPTCHA
```javascript
{
  type: 'captcha',
  message: 'CAPTCHA verification needed',
  instructions: 'Please complete the CAPTCHA verification. This may involve selecting images, solving a puzzle, or checking a box to prove you\'re human.'
}
```
**UI**: Alert user to complete CAPTCHA in the browser window.

### Two-Factor Authentication
```javascript
{
  type: 'two_fa',
  message: 'Two-factor authentication required',
  instructions: 'Enter the verification code from your authenticator app or the code sent to your email/phone.'
}
```
**UI**: Show 2FA notification with live view link.

### Account Blocked
```javascript
{
  type: 'blocked',
  message: 'Account access restricted',
  instructions: 'Your account appears to be restricted. Please check for any security notifications from LinkedIn.'
}
```
**UI**: Show error state with instructions to resolve.

### Rate Limited
```javascript
{
  type: 'rate_limit',
  message: 'Rate limit detected - please wait',
  instructions: 'LinkedIn has temporarily limited your activity. Please wait a few minutes before continuing.'
}
```
**UI**: Show waiting state with timer.

## Progress Tracking UI

Display real-time metrics:
- Total applications submitted
- Applications today/week/month
- Session duration
- Current status

```javascript
function updateProgressUI(progress) {
  document.getElementById('totalApplications').textContent = progress.totalApplications;
  document.getElementById('applicationsToday').textContent = progress.applicationsToday;
  document.getElementById('sessionDuration').textContent = formatDuration(progress.sessionDurationSeconds);
  // etc...
}
```

## Error Handling

```javascript
// Handle API errors
try {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json();
    if (response.status === 429) {
      // Rate limited
      showRateLimitError(error.retryAfter);
    } else if (response.status === 401) {
      // Unauthorized
      redirectToLogin();
    } else {
      // Other errors
      showErrorNotification(error.message);
    }
  }
} catch (error) {
  // Network error
  showNetworkError();
}
```

## Best Practices

1. **Session Management**
   - Store active session ID in localStorage
   - Clear on logout or session completion
   - Handle page refresh gracefully

2. **Live View Display**
   - Open in new window/tab for better visibility
   - Consider embedding in iframe for integrated experience
   - Provide clear instructions for intervention

3. **User Experience**
   - Show clear progress indicators
   - Provide immediate feedback on actions
   - Allow easy access to live browser view
   - Show intervention instructions prominently

4. **Performance**
   - Poll only when session is active
   - Clear intervals on component unmount
   - Handle network failures gracefully

## Testing Scenarios

1. **Happy Path**: Start → Progress Updates → Completion
2. **Login Intervention**: Start → Login Required → User Logs In → Continue → Completion
3. **Multiple Interventions**: Login → CAPTCHA → Continue → Completion
4. **Error Recovery**: Network failure → Retry → Success
5. **Session Limits**: Handle "session limit reached" errors

## WebSocket Alternative (Future Enhancement)

Currently using polling, but the backend emits events that could be exposed via WebSocket:
- SESSION_STARTED
- INTERVENTION_REQUIRED
- PROGRESS_UPDATED
- SESSION_COMPLETED
- ERROR

This would provide real-time updates without polling.