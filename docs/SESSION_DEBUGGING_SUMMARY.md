# Session Debugging Summary

## What We've Done

1. **Added Comprehensive Logging** throughout the backend to trace session creation:
   - Request ID tracking in controller
   - Service call tracking with unique IDs
   - Database insertion logging
   - Timing information at each step

2. **Created Test Script** (`test-duplicate-sessions.js`) to reproduce the issue

3. **Cleaned Up Documentation** - Only use `LINKEDIN_AUTOMATION_FRONTEND_GUIDE_2025.md`

## How to Debug

### 1. Run the Backend with Logging
```bash
npm run dev
```

### 2. Watch for Patterns in Logs
Look for patterns like:
```
[REQUEST-abc123] ==> START AUTOMATION REQUEST at 2025-07-25T18:45:00.000Z
[SERVICE-xyz789] >>> startJobSearch called at 2025-07-25T18:45:00.100Z
[BROWSERBASE-def456] >>>> createUserSession called at 2025-07-25T18:45:00.200Z
[DB-ghi789] >>>>> Creating LinkedIn session in database at 2025-07-25T18:45:00.300Z
```

If you see TWO of these sequences, the backend is creating two sessions.
If you see ONE sequence but the frontend shows two sessions, it's a frontend issue.

### 3. For Frontend Developer

**Most Likely Cause: React StrictMode**

Add this guard to prevent duplicate API calls:

```javascript
// In your component
const isStartingRef = useRef(false);
const lastStartTime = useRef(0);

const handleStart = async () => {
  // Prevent duplicate calls within 2 seconds
  const now = Date.now();
  if (now - lastStartTime.current < 2000) {
    console.log('[FRONTEND] Ignoring duplicate start request');
    return;
  }
  
  if (isStartingRef.current) {
    console.log('[FRONTEND] Already starting, ignoring');
    return;
  }
  
  isStartingRef.current = true;
  lastStartTime.current = now;
  
  try {
    console.log('[FRONTEND] Making API call to /api/linkedin/start');
    const result = await linkedInJobSearchApi.startJobSearch(...);
    console.log('[FRONTEND] Got session:', result.sessionId);
  } finally {
    isStartingRef.current = false;
  }
};
```

### 4. Check These Things

1. **Network Tab**: Are there actually TWO requests to `/api/linkedin/start`?
2. **Console Logs**: Add timestamps to see if component is mounting twice
3. **Session Storage**: Check what's in localStorage/state before and after
4. **React StrictMode**: Temporarily disable to test

### 5. The Correct Flow

1. Frontend calls `POST /api/linkedin/start` ONCE
2. Backend creates ONE Browserbase session
3. Backend creates ONE database record
4. Backend returns ONE sessionId
5. Frontend stores and displays ONE session

## Current Status

- Backend is instrumented with detailed logging
- Frontend guide is updated and consolidated
- Test script is available to reproduce the issue
- Most likely cause: React StrictMode or frontend state management

## Next Steps

1. Run the backend with the new logging
2. Have frontend developer add the guards above
3. Watch the logs to see if it's actually creating two sessions
4. If backend only shows one session creation, it's definitely a frontend issue