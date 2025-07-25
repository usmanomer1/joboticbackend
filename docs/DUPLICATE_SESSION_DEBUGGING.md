# Debugging Duplicate Session Issue

## The Problem
- Frontend shows 2 sessions: `354de6fa-3567-48c8-800e-16555f44af1b` and `73cc0cd5-3aab-4a97-abfc-2f19b2d28a51`
- Backend logs only show creation of ONE session: `73cc0cd5-3aab-4a97-abfc-2f19b2d28a51`
- The first session ID doesn't appear anywhere in backend logs

## What This Means
The backend is working correctly - it's only creating one session per API call. The duplicate is a frontend issue.

## Possible Causes

### 1. Old Session Data Still Displayed
The first session (`354de6fa...`) might be from a previous attempt that's still in:
- React state
- localStorage
- Session list component
- Redux/Zustand/Context store

### 2. React StrictMode (Most Likely)
In development, React StrictMode causes components to mount twice, which can trigger:
- Double API calls if not properly guarded
- Duplicate state updates
- Multiple effect runs

### 3. Multiple API Calls
Check if the frontend is actually making TWO calls to `/api/linkedin/start`

## How to Debug

### 1. Add Console Logs with Timestamps
```javascript
console.log(`[${new Date().toISOString()}] Starting LinkedIn automation`);
const response = await linkedInJobSearchApi.startJobSearch(...);
console.log(`[${new Date().toISOString()}] Session created:`, response.sessionId);
```

### 2. Check Network Tab
1. Open Chrome DevTools → Network tab
2. Clear the network log
3. Click "Start Automation"
4. Look for calls to `/api/linkedin/start`
5. If you see 2 calls, that's the issue

### 3. Check for StrictMode
Look in your `main.tsx` or `index.tsx` for:
```jsx
<React.StrictMode>
  <App />
</React.StrictMode>
```

### 4. Add Request Guard
```javascript
const isStartingRef = useRef(false);

const handleStart = async () => {
  if (isStartingRef.current) {
    console.log('Already starting, ignoring duplicate call');
    return;
  }
  isStartingRef.current = true;
  
  try {
    // ... your API call
  } finally {
    setTimeout(() => {
      isStartingRef.current = false;
    }, 1000);
  }
};
```

### 5. Check Session Storage
```javascript
// Before starting new session
console.log('Sessions in localStorage:', localStorage.getItem('sessions'));
console.log('Active session:', localStorage.getItem('activeSessionId'));

// After API call
console.log('New session stored:', sessionId);
```

## The Fix

If it's React StrictMode (most likely), use a ref to prevent duplicate calls:

```javascript
const [sessionId, setSessionId] = useState(null);
const isStartingRef = useRef(false);
const startTimeRef = useRef(null);

const handleStart = async () => {
  // Prevent duplicate calls within 2 seconds
  const now = Date.now();
  if (startTimeRef.current && (now - startTimeRef.current) < 2000) {
    console.log('Ignoring duplicate start request');
    return;
  }
  
  if (isStartingRef.current) return;
  
  isStartingRef.current = true;
  startTimeRef.current = now;
  
  try {
    // Clear any old sessions first
    setSessionId(null);
    localStorage.removeItem('activeSessionId');
    
    const result = await linkedInJobSearchApi.startJobSearch(...);
    setSessionId(result.sessionId);
    localStorage.setItem('activeSessionId', result.sessionId);
  } finally {
    isStartingRef.current = false;
  }
};
```

## To Verify the Fix

1. Add the guards above
2. Clear all browser storage
3. Restart the app
4. Try starting automation
5. Check if only one session appears

The backend is definitely only creating one session - the issue is how the frontend is calling the API or displaying the results.