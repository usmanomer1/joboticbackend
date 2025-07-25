# Duplicate Session Troubleshooting Guide

## The Problem
- Frontend calls ONE endpoint: `POST /api/linkedin/start`
- Backend creates ONE session (confirmed by logs)
- BUT: TWO sessions appear in Browserbase dashboard
- One session is connected to frontend iframe
- Other session is connected to backend automation

## Quick Diagnosis Steps

### 1. Clear Everything and Start Fresh
```bash
# 1. Stop all running processes
# 2. Clear all Browserbase sessions from dashboard
# 3. Clear browser cache and localStorage
# 4. Check Supabase for any active sessions:
```

```sql
-- Run in Supabase SQL editor
UPDATE linkedin_sessions 
SET status = 'expired' 
WHERE status = 'active';
```

### 2. Add Request Tracking

**Frontend - Add to your API service:**
```typescript
let requestId = 0;

async function callLinkedInAPI(endpoint: string, options: any) {
  const currentRequestId = ++requestId;
  console.log(`[REQUEST ${currentRequestId}] Starting: ${endpoint}`);
  
  try {
    const response = await fetch(endpoint, options);
    const data = await response.json();
    console.log(`[REQUEST ${currentRequestId}] Response:`, data);
    return data;
  } catch (error) {
    console.error(`[REQUEST ${currentRequestId}] Error:`, error);
    throw error;
  }
}
```

### 3. Check for Double Mounting (React StrictMode)

**In your index.js or App.js:**
```typescript
// Temporarily disable StrictMode
// Change this:
<React.StrictMode>
  <App />
</React.StrictMode>

// To this:
<App />
```

### 4. Add Session Creation Prevention

**Frontend - Prevent double clicks:**
```typescript
const [isStarting, setIsStarting] = useState(false);

const startAutomation = async () => {
  if (isStarting) {
    console.warn('Already starting automation, ignoring click');
    return;
  }
  
  setIsStarting(true);
  try {
    const result = await linkedInAPI.startJobSearch(config);
    // ... handle result
  } finally {
    setIsStarting(false);
  }
};
```

### 5. Check Browser Network Tab

1. Open DevTools → Network tab
2. Clear network log
3. Start automation
4. Look for:
   - How many requests to `/api/linkedin/start`?
   - Any preflight OPTIONS requests?
   - Any retries or duplicate calls?

### 6. Backend Session Tracking

**Add to your backend controller:**
```typescript
// At the top of your controller file
const recentSessions = new Map();

async startAutomation(req: Request, res: Response) {
  const userId = req.user.id;
  const now = Date.now();
  
  // Check for recent session creation
  const lastSessionTime = recentSessions.get(userId);
  if (lastSessionTime && (now - lastSessionTime) < 10000) { // 10 seconds
    console.error(`[DUPLICATE WARNING] User ${userId} created session ${now - lastSessionTime}ms ago`);
    
    // Return the existing session instead of creating new
    const existingSession = await linkedinSessionService.getActiveSession(userId);
    if (existingSession) {
      return res.json({
        success: true,
        data: existingSession,
        warning: 'Returned existing active session'
      });
    }
  }
  
  recentSessions.set(userId, now);
  
  // Continue with normal flow...
}
```

## Most Likely Causes

### 1. Frontend Making Multiple Requests
**Check:** Network tab shows multiple POST requests
**Fix:** Add request debouncing and disable button during request

### 2. React StrictMode Double Rendering
**Check:** Console logs show components mounting twice
**Fix:** Disable StrictMode in development

### 3. Browser Retry Logic
**Check:** Network tab shows failed request followed by retry
**Fix:** Add proper error handling and prevent automatic retries

### 4. Supabase RLS or Trigger
**Check:** Supabase logs for any triggers or functions
**Fix:** Review Supabase configuration

### 5. Frontend State Management Issue
**Check:** Frontend is storing/caching wrong session ID
**Fix:** Clear all state when starting new session

## Nuclear Option - Complete State Reset

If nothing else works, implement complete state reset:

```typescript
// Frontend
const resetAndStart = async () => {
  // 1. Clear all local state
  localStorage.clear();
  sessionStorage.clear();
  
  // 2. Sign out and sign in again
  await supabase.auth.signOut();
  await supabase.auth.signInWithPassword({ email, password });
  
  // 3. Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 4. Start fresh
  const result = await linkedInAPI.startJobSearch(config);
  console.log('Fresh start result:', result);
};
```

## Emergency Debug Mode

Add this to frontend for maximum visibility:

```typescript
// Debug mode - log EVERYTHING
window.DEBUG_MODE = true;

// Override fetch to log all requests
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  if (window.DEBUG_MODE) {
    console.log('[FETCH]', ...args);
  }
  const response = await originalFetch(...args);
  if (window.DEBUG_MODE) {
    const clone = response.clone();
    const body = await clone.json();
    console.log('[FETCH RESPONSE]', response.url, body);
  }
  return response;
};
```

## Contact Backend Team

If issue persists after trying above, provide:
1. Network tab screenshot showing all requests
2. Console logs from both frontend and backend
3. Browserbase dashboard screenshot
4. Exact reproduction steps