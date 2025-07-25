# Complete Frontend-Backend Integration Guide for LinkedIn Automation

## Overview

This guide provides everything needed to integrate with the Jobotic backend LinkedIn automation system. Follow this step-by-step to ensure proper integration without duplicate sessions.

## Backend Architecture

```
Frontend → Backend API → Browserbase → LinkedIn
         ↓
      Supabase DB
```

## Authentication Setup

### 1. User Authentication (Supabase)

The backend uses Supabase for user authentication. The frontend must:

1. Authenticate users via Supabase Auth
2. Get the JWT token from Supabase
3. Send the token with every API request

```typescript
// Frontend auth setup
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

// Get current user and token
const { data: { user } } = await supabase.auth.getUser();
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;
```

## API Integration

### Base Configuration

```typescript
// api/linkedinClient.ts
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

class LinkedInAPI {
  private token: string | null = null;

  setAuthToken(token: string) {
    this.token = token;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    if (!this.token) {
      throw new Error('No auth token set');
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'API request failed');
    }

    return response.json();
  }
}
```

## LinkedIn Automation Endpoints

### 1. Start Job Search

**Endpoint:** `POST /api/linkedin/start`

**Purpose:** Starts a new LinkedIn job search automation session

**Request:**
```typescript
interface StartJobSearchRequest {
  config: {
    searches: Array<{
      keywords: string;
      location: string;
      remote?: boolean;
      experienceLevel?: string[];
      jobType?: string[];
      datePosted?: string;
      limit?: number;
    }>;
    totalLimit?: number;
    applyFilters?: {
      avoidCompanies?: string[];
      preferredCompanies?: string[];
      minSalary?: number;
      requiredKeywords?: string[];
      avoidKeywords?: string[];
    };
  };
}

// Example implementation
async startJobSearch(config: JobSearchConfig) {
  return this.request('/api/linkedin/start', {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
}
```

**Response:**
```typescript
interface StartJobSearchResponse {
  success: boolean;
  data: {
    sessionId: string;        // Browserbase session ID
    liveViewUrl: string;      // URL for iframe embedding
    status: 'active';
    createdAt: string;
  };
}
```

### 2. Resume Existing Session

**Endpoint:** `POST /api/linkedin/resume`

**Purpose:** Resumes a paused or interrupted session

**Request:**
```typescript
interface ResumeSessionRequest {
  sessionId: string;
}

async resumeSession(sessionId: string) {
  return this.request('/api/linkedin/resume', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}
```

### 3. Get Session Status

**Endpoint:** `GET /api/linkedin/sessions/:sessionId/status`

**Purpose:** Get current status of a session

**Response:**
```typescript
interface SessionStatusResponse {
  success: boolean;
  data: {
    status: 'active' | 'paused' | 'completed' | 'failed' | 'expired';
    progress: {
      jobsFound: number;
      jobsProcessed: number;
      applicationsSubmitted: number;
    };
    currentSearch?: {
      keywords: string;
      location: string;
      currentPage: number;
    };
  };
}
```

### 4. Stop Session

**Endpoint:** `POST /api/linkedin/sessions/:sessionId/stop`

**Purpose:** Stops an active session

```typescript
async stopSession(sessionId: string) {
  return this.request(`/api/linkedin/sessions/${sessionId}/stop`, {
    method: 'POST',
  });
}
```

### 5. Get User Sessions

**Endpoint:** `GET /api/linkedin/sessions`

**Purpose:** Get all sessions for the authenticated user

**Query Parameters:**
- `status`: Filter by status (active, completed, etc.)
- `limit`: Number of results
- `offset`: Pagination offset

**Response:**
```typescript
interface UserSessionsResponse {
  success: boolean;
  data: {
    sessions: Array<{
      id: string;
      browserbaseSessionId: string;
      status: string;
      config: JobSearchConfig;
      progress: SessionProgress;
      createdAt: string;
      updatedAt: string;
    }>;
    total: number;
  };
}
```

## Complete Frontend Implementation Example

```typescript
// LinkedInAutomationService.ts
import { createClient } from '@supabase/supabase-js';

class LinkedInAutomationService {
  private apiUrl: string;
  private supabase: any;
  private currentSessionId: string | null = null;

  constructor() {
    this.apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    this.supabase = createClient(
      process.env.REACT_APP_SUPABASE_URL!,
      process.env.REACT_APP_SUPABASE_ANON_KEY!
    );
  }

  private async getAuthToken(): Promise<string> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('User not authenticated');
    }
    return session.access_token;
  }

  private async apiRequest(endpoint: string, options: RequestInit = {}) {
    const token = await this.getAuthToken();
    
    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'API request failed');
    }

    return data;
  }

  async startJobSearch(config: JobSearchConfig) {
    const response = await this.apiRequest('/api/linkedin/start', {
      method: 'POST',
      body: JSON.stringify({ config }),
    });

    // Store the session ID
    this.currentSessionId = response.data.sessionId;
    
    return response.data;
  }

  async getSessionStatus(sessionId?: string) {
    const id = sessionId || this.currentSessionId;
    if (!id) throw new Error('No session ID provided');

    return this.apiRequest(`/api/linkedin/sessions/${id}/status`);
  }

  async stopSession(sessionId?: string) {
    const id = sessionId || this.currentSessionId;
    if (!id) throw new Error('No session ID provided');

    const response = await this.apiRequest(`/api/linkedin/sessions/${id}/stop`, {
      method: 'POST',
    });

    // Clear current session
    if (id === this.currentSessionId) {
      this.currentSessionId = null;
    }

    return response;
  }

  async getUserSessions(status?: string) {
    const params = new URLSearchParams();
    if (status) params.append('status', status);

    return this.apiRequest(`/api/linkedin/sessions?${params}`);
  }
}

export default LinkedInAutomationService;
```

## React Component Example

```typescript
// LinkedInAutomation.tsx
import React, { useState, useEffect } from 'react';
import LinkedInAutomationService from './services/LinkedInAutomationService';

const LinkedInAutomation: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const automationService = new LinkedInAutomationService();

  const startAutomation = async () => {
    setLoading(true);
    setError(null);

    try {
      const config = {
        searches: [{
          keywords: 'software engineer',
          location: 'San Francisco, CA',
          remote: true,
          experienceLevel: ['Entry level', 'Associate'],
          limit: 10
        }],
        totalLimit: 50
      };

      const sessionData = await automationService.startJobSearch(config);
      setSession(sessionData);

      // Start polling for status
      startStatusPolling(sessionData.sessionId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const startStatusPolling = (sessionId: string) => {
    const interval = setInterval(async () => {
      try {
        const statusData = await automationService.getSessionStatus(sessionId);
        setStatus(statusData.data);

        // Stop polling if session is no longer active
        if (!['active', 'paused'].includes(statusData.data.status)) {
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Status polling error:', err);
        clearInterval(interval);
      }
    }, 5000); // Poll every 5 seconds

    // Cleanup on unmount
    return () => clearInterval(interval);
  };

  const stopAutomation = async () => {
    if (!session?.sessionId) return;

    setLoading(true);
    try {
      await automationService.stopSession(session.sessionId);
      setSession(null);
      setStatus(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="linkedin-automation">
      <h2>LinkedIn Job Search Automation</h2>
      
      {error && (
        <div className="error-message">{error}</div>
      )}

      {!session ? (
        <button onClick={startAutomation} disabled={loading}>
          {loading ? 'Starting...' : 'Start Job Search'}
        </button>
      ) : (
        <div className="session-info">
          <h3>Session Active</h3>
          <p>Session ID: {session.sessionId}</p>
          
          {status && (
            <div className="status">
              <p>Status: {status.status}</p>
              <p>Jobs Found: {status.progress.jobsFound}</p>
              <p>Jobs Processed: {status.progress.jobsProcessed}</p>
              <p>Applications: {status.progress.applicationsSubmitted}</p>
            </div>
          )}

          <button onClick={stopAutomation} disabled={loading}>
            {loading ? 'Stopping...' : 'Stop Automation'}
          </button>

          {/* Browserbase Live View */}
          <div className="live-view">
            <h4>Live Browser View</h4>
            <iframe
              src={session.liveViewUrl}
              width="100%"
              height="600"
              style={{ border: '1px solid #ccc' }}
              title="LinkedIn Automation Live View"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default LinkedInAutomation;
```

## Important Database Schema

The backend uses these Supabase tables:

```sql
-- linkedin_sessions table
CREATE TABLE linkedin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  browserbase_session_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed', 'failed', 'expired')),
  config JSONB NOT NULL,
  progress JSONB DEFAULT '{"jobsFound": 0, "jobsProcessed": 0, "applicationsSubmitted": 0}'::jsonb,
  live_view_url TEXT,
  context_id TEXT, -- Browserbase context for session persistence
  error TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_linkedin_sessions_user_id ON linkedin_sessions(user_id);
CREATE INDEX idx_linkedin_sessions_status ON linkedin_sessions(status);
CREATE INDEX idx_linkedin_sessions_browserbase ON linkedin_sessions(browserbase_session_id);

-- RLS policies
ALTER TABLE linkedin_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions" ON linkedin_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON linkedin_sessions
  FOR UPDATE USING (auth.uid() = user_id);
```

## Best Practices

### 1. Session Management
- Only ONE active session per user at a time
- Always check for existing active sessions before starting new ones
- Properly close sessions when done

### 2. Error Handling
```typescript
try {
  const session = await automationService.startJobSearch(config);
} catch (error) {
  if (error.message.includes('SESSION_LIMIT_REACHED')) {
    // Handle session limit
    alert('Please complete or stop your current session first');
  } else if (error.message.includes('UNAUTHORIZED')) {
    // Handle auth error
    await supabase.auth.signOut();
    redirectToLogin();
  } else {
    // Generic error
    console.error('Automation error:', error);
  }
}
```

### 3. Status Polling
- Poll every 5-10 seconds for status updates
- Stop polling when session is completed/failed/expired
- Clean up intervals on component unmount

### 4. Authentication
- Always send the Supabase JWT token
- Handle token expiration gracefully
- Refresh tokens as needed

## Debugging Tips

### 1. Check Network Requests
```javascript
// Add to your API client
private async apiRequest(endpoint: string, options: RequestInit = {}) {
  console.log(`[API] Request to ${endpoint}`, options);
  
  const response = await fetch(...);
  const data = await response.json();
  
  console.log(`[API] Response from ${endpoint}`, data);
  
  return data;
}
```

### 2. Verify Authentication
```javascript
// Check if user is authenticated
const checkAuth = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  console.log('Current user:', user);
  
  const { data: { session } } = await supabase.auth.getSession();
  console.log('Session token:', session?.access_token);
};
```

### 3. Monitor Session State
```javascript
// Add session monitoring
useEffect(() => {
  console.log('[SESSION] Current session:', session);
  console.log('[SESSION] Current status:', status);
}, [session, status]);
```

## Common Issues and Solutions

### Issue: "Session limit reached"
**Solution:** User has too many active sessions. Either stop existing sessions or wait for them to expire.

### Issue: "Unauthorized"
**Solution:** Check that the Supabase JWT token is being sent correctly in the Authorization header.

### Issue: "Session not found"
**Solution:** The session may have expired or been terminated. Refresh the session list.

### Issue: Duplicate sessions
**Solution:** Ensure you're not calling the start endpoint multiple times. Add debouncing to the start button.

## Environment Variables

Frontend needs these environment variables:

```env
REACT_APP_API_URL=http://localhost:3001
REACT_APP_SUPABASE_URL=https://wqyquvgduwjkyadkumkl.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
```

## Support

For any issues or questions:
1. Check browser console for errors
2. Check network tab for API responses
3. Verify authentication status
4. Check backend logs for detailed error information