# Frontend Context Integration Guide

## Overview

The LinkedIn automation backend now supports manual continuation after login. When the system detects a login is required, the frontend can display a button for the user to click after they've logged in.

## Flow

1. **Automation Starts** → Backend detects login required → Status: `intervention_required`
2. **Frontend Shows Login UI** → User logs into LinkedIn in the live view
3. **User Clicks "Continue" Button** → Frontend calls the continue endpoint
4. **Backend Resumes Automation** → Job search and application process continues

## API Endpoint

### Continue After Login

```javascript
POST /api/linkedin/continue/{sessionId}
Headers: {
  'X-API-Key': 'your-api-key',
  'Content-Type': 'application/json'
}
Body: {} // Empty body for manual continue
```

**Response:**
```json
{
  "success": true,
  "status": "running",
  "message": "Session resumed after intervention"
}
```

## Frontend Implementation Example

```javascript
// Check status periodically
const checkStatus = async (sessionId) => {
  const response = await fetch(`/api/linkedin/status/${sessionId}`, {
    headers: {
      'X-API-Key': apiKey
    }
  });
  
  const data = await response.json();
  
  if (data.status === 'intervention_required' && data.intervention?.type === 'login') {
    // Show login UI with continue button
    showLoginUI(data.intervention.liveViewUrl, sessionId);
  }
};

// When user clicks "I've logged in" button
const handleContinueAfterLogin = async (sessionId) => {
  try {
    const response = await fetch(`/api/linkedin/continue/${sessionId}`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({}) // Empty body
    });
    
    if (response.ok) {
      // Hide login UI, show progress
      hideLoginUI();
      showProgressUI();
    } else {
      const error = await response.json();
      console.error('Failed to continue:', error);
    }
  } catch (error) {
    console.error('Error continuing automation:', error);
  }
};
```

## UI Suggestions

When status is `intervention_required` with type `login`:

```jsx
<div className="intervention-ui">
  <h3>Login Required</h3>
  <p>Please log into LinkedIn in the browser window below:</p>
  
  <iframe 
    src={liveViewUrl} 
    style={{ width: '100%', height: '600px' }}
  />
  
  <button 
    onClick={() => handleContinueAfterLogin(sessionId)}
    className="continue-btn"
  >
    I've Logged In - Continue Automation
  </button>
</div>
```

## Status Flow

1. **`active`** - Automation is running
2. **`intervention_required`** - User action needed (check `intervention.type`)
3. **`completed`** - Automation finished successfully
4. **`failed`** - Automation encountered an error

## Error Handling

The continue endpoint may return errors if:
- Session not found (404)
- User doesn't own the session (403)
- Still on login page (500 with specific message)

Check the error message to provide appropriate feedback to the user.

## Important Notes

1. The backend will NOT automatically detect login completion - it waits for manual continuation
2. The continue endpoint verifies the user is actually logged in before proceeding
3. Progress updates will resume after successful continuation
4. The automation will remain paused until the user clicks the "Continue" button