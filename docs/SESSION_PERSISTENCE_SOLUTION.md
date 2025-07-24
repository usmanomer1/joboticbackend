# LinkedIn Session Persistence Solution

## Problem Overview

The session cookies aren't persisting between automation runs, requiring users to log in every time they start a new automation session. This happens even though the Browserbase context system is implemented.

## Root Causes

1. **Context Creation Timing**: The context isn't being created before the first session
2. **Context ID Format**: Using a predictable format that might not be properly stored
3. **Localhost Development**: Running on localhost can affect cookie persistence
4. **Context Configuration**: The context might not be properly configured in Browserbase

## Solution Implementation

### 1. Ensure Context Creation on First Use

Update the `BrowserbaseSessionManager` to create context on first session:

```typescript
// In browserbaseSessionManager.ts
async createUserSession(userId: string, config: JobSearchConfig): Promise<LinkedInSession> {
  try {
    // Check if user has reached session limit
    const activeCount = await this.sessionService.getActiveSessionsCount(userId);
    
    if (activeCount >= this.maxActiveSessions) {
      throw new AutomationError(
        'Session limit reached. Please complete or terminate existing sessions.',
        'SESSION_LIMIT_REACHED',
        { userId, limit: this.maxActiveSessions, currentActive: activeCount }
      );
    }

    // Get or create a context for this user
    let contextId = await this.getOrCreateUserContext(userId);
    
    // If no context exists and useContext is enabled, create one
    if (!contextId && config.useContext !== false) {
      console.log(`Creating new context for user ${userId}`);
      contextId = await this.createUserContext(userId);
    }
    
    const useContext = config.useContext !== false && contextId; // Default to true if context exists

    // Rest of the method...
  }
}
```

### 2. Update Frontend to Enable Context

Ensure the frontend passes `useContext: true` in the job search config:

```typescript
// Frontend request
const response = await fetch('/api/linkedin/automation/start', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    config: {
      jobTitle: 'Software Engineer',
      location: 'San Francisco, CA',
      useContext: true, // Enable context for session persistence
      resumeUrl: 'https://your-supabase-url/storage/v1/object/public/resumes/user-resume.pdf'
    }
  })
});
```

### 3. Handle Context in Database

Create a table to store user contexts:

```sql
-- Create user_contexts table
CREATE TABLE IF NOT EXISTS user_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  browserbase_context_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
  CONSTRAINT unique_user_context UNIQUE (user_id)
);

-- Create index for faster lookups
CREATE INDEX idx_user_contexts_user_id ON user_contexts(user_id);
```

### 4. Update LinkedInSessionService

Add methods to handle context persistence:

```typescript
// In linkedinSessionService.ts
async updateUserContext(userId: string, contextId: string): Promise<void> {
  try {
    const { error } = await this.supabase
      .from('user_contexts')
      .upsert({
        user_id: userId,
        browserbase_context_id: contextId,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      console.error('Failed to update user context:', error);
      throw error;
    }
  } catch (error) {
    console.error('Update user context error:', error);
    throw error;
  }
}

async getUserContext(userId: string): Promise<string | null> {
  try {
    const { data, error } = await this.supabase
      .from('user_contexts')
      .select('browserbase_context_id')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.browserbase_context_id;
  } catch (error) {
    console.error('Get user context error:', error);
    return null;
  }
}
```

### 5. Cookie Domain Issues (Localhost)

When running on localhost, cookies might not persist properly. Solutions:

1. **Use a custom domain**: Add to `/etc/hosts`:
   ```
   127.0.0.1 local.jobotic.com
   ```
   Then access your app via `http://local.jobotic.com:3000`

2. **Set proper cookie attributes** in your frontend:
   ```javascript
   // When setting cookies
   document.cookie = `session=${sessionId}; path=/; SameSite=Lax; Secure`;
   ```

3. **For production**: Ensure both frontend and backend are on the same domain or configure CORS properly

### 6. Verify Context Persistence

Add logging to verify context is being used:

```typescript
// In browserbaseSessionManager.ts
if (useContext && contextId) {
  sessionOptions.contextId = contextId;
  sessionOptions.persist = true;
  console.log(`Creating session with existing context ${contextId} for user ${userId}`);
  console.log('This should preserve LinkedIn login cookies');
} else {
  console.log(`Creating session without context for user ${userId}`);
  console.log('User will need to log in to LinkedIn');
}
```

## Testing the Solution

1. **First Run**: User logs in to LinkedIn manually
2. **Subsequent Runs**: User should remain logged in
3. **Verify in Browserbase Dashboard**: Check if context is being created and reused

## Additional Considerations

1. **Context Expiration**: Browserbase contexts may expire after a period of inactivity
2. **Security**: Each user should have their own context to prevent session mixing
3. **Cleanup**: Implement context cleanup for users who haven't used the service in 30+ days

## Troubleshooting

If sessions still don't persist:

1. Check Browserbase logs for context-related errors
2. Verify the context ID is being passed correctly in API calls
3. Ensure cookies aren't being cleared by browser automation
4. Check if LinkedIn has additional security measures preventing persistence
5. Try using a different browser profile in Browserbase