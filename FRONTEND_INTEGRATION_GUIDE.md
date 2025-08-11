# Frontend Integration Guide for Jobotic Backend

## Overview
The Jobotic backend now supports two methods for job matching with Supabase authentication:
1. **Webhook-based** (`/api/jobs/match`) - Best for Convex integration
2. **SSE Streaming** (`/api/jobs/match/stream`) - Best for direct frontend real-time updates

## Authentication Setup

All endpoints now require Supabase authentication. Include the JWT token in the Authorization header:

```javascript
const headers = {
  'Authorization': `Bearer ${supabaseSession.access_token}`,
  'Content-Type': 'application/json'
};
```

## Method 1: Webhook-Based Integration (For Convex)

### Endpoint
`POST /api/jobs/match`

### Request Body
```javascript
{
  "resumeText": "Your resume content here...",
  "query": "Software Engineer",
  "location": "San Francisco, CA",
  "filters": {
    "datePosted": "week",
    "remote": false,
    "employmentTypes": ["FULLTIME"],
    "experienceLevel": ["ENTRY_LEVEL", "MID_LEVEL"],
    "radius": 50
  },
  "numJobs": 100,
  "callbackUrl": "https://your-convex-webhook-url.com/api/webhook",
  "sessionId": "unique-session-id-from-convex"
}
```

### Response (Immediate)
```javascript
{
  "success": true,
  "sessionId": "unique-session-id-from-convex",
  "totalFound": 87,
  "searchMetadata": {
    "query": "Software Engineer",
    "location": "San Francisco, CA",
    "filters": {...},
    "pagesReturned": 9,
    "fetchTime": 1234
  },
  "jobs": [],  // Empty when using callback
  "status": "processing",
  "message": "87 jobs are being processed and will be sent to your callback URL",
  "callbackUrl": "https://your-convex-webhook-url.com/api/webhook",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Webhook Payload (Sent to callbackUrl)
```javascript
{
  "sessionId": "unique-session-id-from-convex",
  "batchIndex": 0,
  "batchCount": 9,
  "jobs": [
    {
      // Original job data
      "job_id": "abc123",
      "job_title": "Senior Software Engineer",
      "employer_name": "Tech Corp",
      // ... other job fields
      
      // AI-enhanced fields
      "match_score": 0.92,
      "ai_summary": "Strong match based on your React experience...",
      "salary_estimate": {
        "min": 120000,
        "max": 180000,
        "median": 150000,
        "confidence": 0.85
      },
      "key_matches": ["React", "Node.js", "AWS"],
      "missing_skills": ["Kubernetes"],
      "growth_potential": 0.8
    }
    // ... more jobs in batch
  ],
  "isLastBatch": false,
  "processedCount": 10,
  "totalCount": 87,
  "userId": "user-uuid",
  "processingTime": 2341,
  "timestamp": "2024-01-15T10:30:05Z"
}
```

### Convex Integration Example
```javascript
// In your Convex action
import { action } from "./_generated/server";
import { v } from "convex/values";

export const searchJobs = action({
  args: {
    resumeText: v.string(),
    query: v.string(),
    location: v.string(),
    filters: v.object({
      datePosted: v.optional(v.string()),
      remote: v.optional(v.boolean()),
      // ... other filters
    })
  },
  handler: async (ctx, args) => {
    const sessionId = `convex-${Date.now()}-${Math.random()}`;
    
    // Get Supabase token for the user
    const supabaseToken = await ctx.auth.getSupabaseToken();
    
    // Call backend
    const response = await fetch('https://your-backend.com/api/jobs/match', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...args,
        callbackUrl: `${process.env.CONVEX_URL}/api/webhooks/jobs`,
        sessionId
      })
    });
    
    const data = await response.json();
    
    // Store session info in database
    await ctx.db.insert("jobSessions", {
      sessionId,
      userId: ctx.auth.getUserId(),
      status: "processing",
      totalFound: data.totalFound,
      createdAt: Date.now()
    });
    
    return { sessionId, ...data };
  }
});

// Webhook handler
export const jobWebhook = httpAction(async (ctx, request) => {
  const payload = await request.json();
  const { sessionId, batchIndex, jobs, isLastBatch } = payload;
  
  // Store jobs in database
  await ctx.runMutation(internal.jobs.storeBatch, {
    sessionId,
    batchIndex,
    jobs,
    isLastBatch
  });
  
  return new Response("OK", { status: 200 });
});
```

## Method 2: SSE Streaming (Direct Frontend)

### Endpoint
`POST /api/jobs/match/stream`

### Implementation Example
```javascript
// Frontend SSE implementation
async function streamJobSearch(resumeText, query, location, filters) {
  const supabase = createClient(/* your config */);
  const session = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('Not authenticated');
  }
  
  // First, initiate the SSE connection with a POST request
  const response = await fetch('/api/jobs/match/stream', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      resumeText,
      query,
      location,
      filters,
      numJobs: 100,
      sessionId: `frontend-${Date.now()}`
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to start job stream');
  }
  
  // Read the SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('event:')) {
        const event = line.slice(6).trim();
        // Handle different event types
      } else if (line.startsWith('data:')) {
        const data = JSON.parse(line.slice(5));
        handleSSEData(event, data);
      }
    }
  }
}

// Alternative: Using EventSource (cleaner but less control)
function streamJobSearchWithEventSource(resumeText, query, location, filters) {
  const supabase = createClient(/* your config */);
  const session = supabase.auth.getSession();
  
  // Note: EventSource doesn't support POST with body, so you'd need a workaround
  // Option 1: Create a session first, then use GET with sessionId
  // Option 2: Use fetch() with ReadableStream as shown above
  
  const params = new URLSearchParams({
    sessionId: `frontend-${Date.now()}`,
    // ... other params
  });
  
  const eventSource = new EventSource(
    `/api/jobs/match/stream?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    }
  );
  
  eventSource.addEventListener('connected', (e) => {
    const data = JSON.parse(e.data);
    console.log('Connected to job stream:', data.sessionId);
    updateUI({ status: 'connected', sessionId: data.sessionId });
  });
  
  eventSource.addEventListener('search_started', (e) => {
    const data = JSON.parse(e.data);
    console.log('Search started:', data);
    updateUI({ status: 'searching', query: data.query });
  });
  
  eventSource.addEventListener('jobs_found', (e) => {
    const data = JSON.parse(e.data);
    console.log(`Found ${data.totalFound} jobs in ${data.fetchTime}ms`);
    updateUI({ 
      status: 'processing', 
      totalJobs: data.totalFound,
      fetchTime: data.fetchTime 
    });
  });
  
  eventSource.addEventListener('batch', (e) => {
    const batch = JSON.parse(e.data);
    console.log(`Received batch ${batch.batchIndex + 1}/${batch.batchCount}`);
    
    // Add jobs to UI
    batch.jobs.forEach(job => {
      addJobToList(job);
    });
    
    // Update progress
    updateProgress({
      processed: batch.processedCount,
      total: batch.totalCount,
      percentage: (batch.processedCount / batch.totalCount) * 100
    });
    
    if (batch.isLastBatch) {
      console.log('All jobs received');
    }
  });
  
  eventSource.addEventListener('batch_error', (e) => {
    const error = JSON.parse(e.data);
    console.error(`Batch ${error.batchIndex} failed:`, error.error);
    showError(`Failed to process batch ${error.batchIndex + 1}`);
  });
  
  eventSource.addEventListener('complete', (e) => {
    const data = JSON.parse(e.data);
    console.log('Stream complete:', data);
    updateUI({ status: 'complete', totalProcessed: data.totalProcessed });
    eventSource.close();
  });
  
  eventSource.addEventListener('error', (e) => {
    if (e.readyState === EventSource.CLOSED) {
      console.log('Stream closed');
    } else {
      const error = JSON.parse(e.data);
      console.error('Stream error:', error);
      showError(error.error);
    }
    eventSource.close();
  });
  
  return eventSource;
}
```

## React Component Example

```jsx
import { useState, useEffect } from 'react';
import { useSupabase } from '@/hooks/useSupabase';

function JobSearch() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [status, setStatus] = useState('idle');
  const { session } = useSupabase();
  
  const searchJobs = async (resumeText, query, location, filters) => {
    setLoading(true);
    setJobs([]);
    setStatus('connecting');
    
    try {
      const response = await fetch('/api/jobs/match/stream', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          resumeText,
          query,
          location,
          filters,
          numJobs: 100
        })
      });
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          const eventMatch = line.match(/^event: (.+)$/m);
          const dataMatch = line.match(/^data: (.+)$/m);
          
          if (eventMatch && dataMatch) {
            const event = eventMatch[1];
            const data = JSON.parse(dataMatch[1]);
            
            switch (event) {
              case 'connected':
                setStatus('connected');
                break;
                
              case 'search_started':
                setStatus('searching');
                break;
                
              case 'jobs_found':
                setStatus('processing');
                setProgress({ current: 0, total: data.totalFound });
                break;
                
              case 'batch':
                setJobs(prev => [...prev, ...data.jobs]);
                setProgress({ 
                  current: data.processedCount, 
                  total: data.totalCount 
                });
                break;
                
              case 'complete':
                setStatus('complete');
                setLoading(false);
                break;
                
              case 'error':
                setStatus('error');
                setLoading(false);
                console.error('Stream error:', data.error);
                break;
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to search jobs:', error);
      setStatus('error');
      setLoading(false);
    }
  };
  
  return (
    <div>
      <div className="status-bar">
        Status: {status}
        {progress.total > 0 && (
          <div className="progress">
            Processing: {progress.current}/{progress.total} jobs
            ({Math.round((progress.current / progress.total) * 100)}%)
          </div>
        )}
      </div>
      
      <div className="job-list">
        {jobs.map(job => (
          <JobCard key={job.job_id} job={job} />
        ))}
      </div>
    </div>
  );
}
```

## Error Handling

Both methods include comprehensive error handling:

```javascript
// Webhook method error response
{
  "success": false,
  "sessionId": "unique-session-id",
  "error": "Error message here",
  "timestamp": "2024-01-15T10:30:00Z"
}

// SSE method error event
event: error
data: {"sessionId":"xxx","error":"Error message","timestamp":"2024-01-15T10:30:00Z"}
```

## Performance Considerations

1. **Batch Size**: Currently set to 10 jobs per batch for optimal performance
2. **AI Processing**: Each batch is enhanced with AI analysis (match scores, salary estimates)
3. **Delays**: 200ms delay between webhook calls, 100ms between SSE batches
4. **Timeouts**: 10-second timeout for webhook callbacks

## Testing with cURL

### Test Webhook Method
```bash
curl -X POST https://your-backend.com/api/jobs/match \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "resumeText": "Software engineer with React experience...",
    "query": "React Developer",
    "location": "New York, NY",
    "numJobs": 20,
    "callbackUrl": "https://webhook.site/your-unique-url",
    "sessionId": "test-session-123"
  }'
```

### Test SSE Stream
```bash
curl -X POST https://your-backend.com/api/jobs/match/stream \
  -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "resumeText": "Software engineer with React experience...",
    "query": "React Developer",
    "location": "New York, NY",
    "numJobs": 20
  }'
```

## Migration from Old API

If migrating from the old non-authenticated API:

1. **Add Authentication**: All requests now need Supabase JWT token
2. **Remove userId from body**: It's now extracted from the authenticated user
3. **Choose method**: Decide between webhook (for Convex) or SSE (for direct frontend)
4. **Update error handling**: New error formats as shown above

## Support

For issues or questions:
- Check Supabase authentication is properly configured
- Verify CORS settings allow your frontend domain
- Ensure webhook URLs are accessible from the backend
- Monitor console logs for detailed error messages