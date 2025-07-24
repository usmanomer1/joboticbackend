# Clear Active Sessions Guide

## Quick Fix for Session Limit

You're hitting the 3 session limit because there are active/intervention_required sessions in the database.

## Option 1: Direct Database Update (Recommended)

Go to your Supabase dashboard and run this SQL query:

```sql
-- View your active sessions first
SELECT id, user_id, status, started_at, browserbase_session_id 
FROM linkedin_sessions 
WHERE user_id = 'YOUR_USER_ID' 
AND status IN ('active', 'intervention_required')
ORDER BY started_at DESC;

-- Mark all sessions as completed for testing
UPDATE linkedin_sessions 
SET status = 'completed', 
    ended_at = NOW(),
    duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
WHERE user_id = 'YOUR_USER_ID' 
AND status IN ('active', 'intervention_required');
```

Replace `YOUR_USER_ID` with your actual user ID.

## Option 2: Temporary Code Change

In `linkedinAutomationService.ts`, temporarily comment out the session limit check:

```javascript
// Around line 80-87
const activeCount = await this.linkedinSessionService.getActiveSessionsCount(userId);
// if (activeCount >= 3) { // Comment this out temporarily
//   throw new AutomationError(
//     'Session limit reached. Please complete or terminate existing sessions.',
//     'SESSION_LIMIT_REACHED',
//     { userId, limit: 3, currentActive: activeCount }
//   );
// }
```

## Option 3: Add a Cleanup Method

Add this method to `LinkedInSessionService`:

```javascript
async clearActiveSessions(userId: string): Promise<void> {
  const { error } = await this.supabase
    .from('linkedin_sessions')
    .update({ 
      status: 'completed',
      ended_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .in('status', ['active', 'intervention_required']);
    
  if (error) {
    console.error('Failed to clear sessions:', error);
    throw error;
  }
  
  console.log('Cleared active sessions for user:', userId);
}
```

Then call it before starting a new session.

## Understanding the Issue

The session limit is there to prevent:
1. Multiple browser sessions running simultaneously
2. Resource exhaustion
3. LinkedIn rate limiting

For testing, it's fine to clear sessions, but in production, users should properly complete or stop their sessions.