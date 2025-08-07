# Frontend Integration Guide - Progressive Job Loading with Convex

## Overview

This guide explains how to integrate with the new progressive job loading backend that uses Convex for real-time data synchronization and Supabase for authentication.

## Key Changes

### Authentication
- **REMOVED**: API Key authentication (`X-API-Key` header)
- **REQUIRED**: Supabase Bearer token authentication
- All `/api/v2/jobs/*` endpoints require Bearer token in Authorization header

### New Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/v2/jobs/match` | POST | Progressive job search with AI matching | ✅ Yes |
| `/api/v2/jobs/session/:sessionId` | GET | Get session status and jobs | ✅ Yes |

### Old Endpoints (Still Available)
- `/api/jobs/*` endpoints still work with API key authentication for backward compatibility

## Authentication Setup

### 1. Get Supabase Token

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Get the current session token
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;
```

### 2. Include Token in Requests

```javascript
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}` // Required for all /api/v2/jobs endpoints
};
```

## Progressive Job Loading Implementation

### Initial Search Request

```javascript
async function searchJobs(query, location, resumeText) {
  const response = await fetch('/api/v2/jobs/match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      query,
      location,
      resumeText,
      offset: 0,
      limit: 10 // Get first 10 jobs instantly
    })
  });

  const data = await response.json();
  
  /* Response structure:
  {
    success: true,
    jobs: [...], // First 10 jobs with AI scores
    total: 127,  // Total jobs found
    offset: 0,
    hasMore: true,
    sessionId: "abc123...", // Important: Save this for pagination
    message: "Processing 127 jobs in background..."
  }
  */
  
  return data;
}
```

### Loading More Jobs (Pagination)

```javascript
async function loadMoreJobs(sessionId, currentOffset = 0) {
  const response = await fetch('/api/v2/jobs/match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      sessionId, // Use the sessionId from initial search
      offset: currentOffset + 10,
      limit: 10
    })
  });

  const data = await response.json();
  
  /* Response:
  {
    success: true,
    jobs: [...], // Next 10 jobs
    total: 127,
    offset: 10,
    hasMore: true,
    sessionId: "abc123..."
  }
  */
  
  return data;
}
```

### Check Session Status

```javascript
async function checkSessionStatus(sessionId) {
  const response = await fetch(`/api/v2/jobs/session/${sessionId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();
  
  /* Response:
  {
    success: true,
    session: {
      status: "processing", // or "completed", "failed"
      processedCount: 45,
      totalJobs: 127,
      createdAt: 1234567890
    },
    jobs: [...], // Requested page of jobs
    total: 45,
    offset: 0,
    hasMore: true
  }
  */
  
  return data;
}
```

## Complete React Implementation Example

```jsx
import { useState, useEffect } from 'react';
import { useAuth } from './useAuth'; // Your Supabase auth hook

function JobSearch() {
  const { token } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  // Initial search
  const handleSearch = async (query, location, resumeText) => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/v2/jobs/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query,
          location,
          resumeText,
          offset: 0,
          limit: 10
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setJobs(data.jobs);
        setSessionId(data.sessionId);
        setHasMore(data.hasMore);
        setTotal(data.total);
        setOffset(0);
        
        // Start polling for background processing updates
        if (data.hasMore) {
          startPolling(data.sessionId);
        }
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load more jobs
  const loadMore = async () => {
    if (!sessionId || !hasMore || loading) return;
    
    setLoading(true);
    
    try {
      const response = await fetch('/api/v2/jobs/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sessionId,
          offset: offset + 10,
          limit: 10
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setJobs(prev => [...prev, ...data.jobs]);
        setOffset(data.offset);
        setHasMore(data.hasMore);
      }
    } catch (error) {
      console.error('Load more failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // Poll for processing status
  const startPolling = (sessionId) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/v2/jobs/session/${sessionId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const data = await response.json();
        
        if (data.session.status === 'completed') {
          clearInterval(pollInterval);
          console.log('All jobs processed!');
        }
        
        // Update progress indicator
        updateProgress(data.session.processedCount, data.session.totalJobs);
        
      } catch (error) {
        console.error('Polling failed:', error);
      }
    }, 5000); // Poll every 5 seconds
    
    // Clean up on unmount
    return () => clearInterval(pollInterval);
  };

  return (
    <div>
      {/* Search form */}
      <SearchForm onSearch={handleSearch} />
      
      {/* Job list */}
      <JobList jobs={jobs} />
      
      {/* Load more button */}
      {hasMore && (
        <button onClick={loadMore} disabled={loading}>
          {loading ? 'Loading...' : `Load More (${jobs.length} of ${total})`}
        </button>
      )}
      
      {/* Progress indicator */}
      <ProgressBar current={jobs.length} total={total} />
    </div>
  );
}
```

## Using Convex Client Directly (Optional)

For real-time updates without polling, you can use the Convex client directly:

```javascript
import { ConvexProvider, useQuery } from "convex/react";
import { ConvexReactClient } from "convex/react";
import { api } from "./convex/_generated/api";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL);

function JobSearchWithConvex() {
  const [sessionId, setSessionId] = useState(null);
  
  // Real-time subscription to job updates
  const processedJobs = useQuery(
    api.jobs.getProcessedJobs,
    sessionId ? { sessionId, offset: 0, limit: 100 } : "skip"
  );
  
  // Session status subscription
  const sessionStatus = useQuery(
    api.jobs.getSessionStatus,
    sessionId ? { sessionId } : "skip"
  );

  // Jobs will automatically update as they're processed
  return (
    <div>
      {processedJobs?.jobs.map(job => (
        <JobCard key={job._id} job={job} />
      ))}
      
      {sessionStatus && (
        <div>
          Processing: {sessionStatus.processedCount}/{sessionStatus.totalJobs}
        </div>
      )}
    </div>
  );
}

// Wrap your app with ConvexProvider
<ConvexProvider client={convex}>
  <JobSearchWithConvex />
</ConvexProvider>
```

## Migration Checklist

- [ ] Remove API key from environment variables and requests
- [ ] Add Supabase authentication to all job search requests
- [ ] Update endpoint from `/api/jobs/match` to `/api/v2/jobs/match`
- [ ] Implement session-based pagination using `sessionId`
- [ ] Add progress indicators for background processing
- [ ] Handle the new response structure with instant first batch
- [ ] Optional: Integrate Convex client for real-time updates

## Response Structures

### Success Response
```javascript
{
  success: true,
  jobs: [
    {
      job_id: "abc123",
      job_title: "Software Engineer",
      employer_name: "Tech Corp",
      job_city: "San Francisco",
      job_state: "CA",
      job_description: "...",
      job_apply_link: "https://...",
      employer_logo: "https://...",
      job_posted_at_datetime_utc: "2024-01-01",
      job_min_salary: 100000,
      job_max_salary: 150000,
      match_score: 85,
      match_label: "EXCELLENT",
      match_reasons: ["Strong skills match", "..."],
      missing_skills: ["Kubernetes"],
      key_strengths: ["React", "Node.js"]
    }
  ],
  total: 127,
  offset: 0,
  hasMore: true,
  sessionId: "k1d_jobSearchSessions:abc123",
  message: "Processing 127 jobs in background..."
}
```

### Error Response
```javascript
{
  success: false,
  error: "Invalid or expired authentication token"
}
```

## Performance Benefits

1. **Instant First Results**: First 10 jobs return in 2-3 seconds
2. **No Timeouts**: Background processing avoids Netlify function timeouts
3. **Progressive Loading**: Users see results immediately while more load
4. **Reactive Updates**: With Convex client, updates happen automatically
5. **Session Persistence**: Results cached for 1 hour, instant pagination

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Ensure Bearer token is included in Authorization header
   - Check if Supabase session is valid
   - Refresh token if expired

2. **Session Not Found**
   - Sessions expire after 1 hour
   - Start a new search if session is expired

3. **Slow Processing**
   - Background processing handles 30 jobs/minute
   - Large searches (100+ jobs) may take 3-4 minutes to fully process

4. **Missing Jobs**
   - Check session status to see if processing is complete
   - Some jobs may fail AI processing and get default scores

## Support

For issues or questions:
- Check Convex dashboard: https://dashboard.convex.dev
- Backend logs for processing errors
- Ensure Supabase authentication is properly configured