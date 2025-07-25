# Frontend Session Fix - URGENT

## The Problem
You have **TWO SEPARATE** Browserbase sessions:
1. **Session A** - Created by the frontend (controls the iframe)
2. **Session B** - Created by the backend (runs the automation)

This is why you see two sessions in Browserbase UI!

## How We Know
- When you close Session A → Frontend stops, backend continues
- When you close Session B → Backend stops, frontend continues
- They're completely independent sessions

## Find Where Frontend Creates Sessions

### 1. Search Your Frontend Code For:
```bash
# Search for Browserbase references
grep -r "browserbase" src/
grep -r "Browserbase" src/
grep -r "BROWSERBASE" src/

# Search for potential SDK usage
grep -r "@browserbasehq" src/
grep -r "createSession" src/
grep -r "api.browserbase.com" src/
```

### 2. Check Environment Variables
Look in your `.env` or `.env.local` file for:
- `VITE_BROWSERBASE_API_KEY`
- `VITE_BROWSERBASE_PROJECT_ID`
- Any other Browserbase-related variables

### 3. Check package.json
```bash
# Look for Browserbase packages
grep -i browserbase package.json
```

### 4. Check How You Embed the Iframe

Look for code like:
```javascript
<iframe src={liveViewUrl} />
```

**IMPORTANT**: The `liveViewUrl` itself might be creating a new session!

### 5. Check Network Tab
1. Open Chrome DevTools → Network tab
2. Filter by "browserbase"
3. Start the automation
4. Look for ANY calls to `api.browserbase.com`

## Most Likely Causes

### Cause 1: Iframe URL Creates New Session
The `liveViewUrl` from the backend might be creating a new session when loaded.

**Test**: 
1. Copy the `liveViewUrl` from the API response
2. Open it in a new tab
3. Check if a new session appears in Browserbase dashboard

### Cause 2: Frontend Has Browserbase Config
Check if your frontend has:
```javascript
const browserbaseConfig = {
  apiKey: import.meta.env.VITE_BROWSERBASE_API_KEY,
  projectId: import.meta.env.VITE_BROWSERBASE_PROJECT_ID
};
```

### Cause 3: Different API Endpoint
Check if frontend calls a different endpoint that creates sessions.

## The Fix

### Option 1: Use Only Backend Session (RECOMMENDED)
```javascript
// GOOD - Use session from backend
const { sessionId, liveViewUrl } = await api.startJobSearch(...);
setSessionId(sessionId);
setLiveViewUrl(liveViewUrl);

// BAD - Don't create your own session
const session = await browserbase.createSession(...);
```

### Option 2: If Iframe Creates Sessions
You might need to use a different URL format or pass session ID as parameter.

### Option 3: Remove Frontend Browserbase Access
1. Remove any Browserbase API keys from frontend env
2. Remove any Browserbase SDK from package.json
3. Only use URLs provided by backend

## Immediate Action Items

1. **Search for Browserbase in your code**
2. **Check your .env files**
3. **Watch Network tab when starting**
4. **Test if the iframe URL creates sessions**
5. **Remove any frontend Browserbase configuration**

## How to Verify Fix

After fixing:
1. Start automation
2. Check Browserbase dashboard
3. You should see **ONLY ONE** session
4. That session should control both frontend iframe AND backend automation

The backend is working correctly - it creates one session. The issue is the frontend is creating a second session somehow.