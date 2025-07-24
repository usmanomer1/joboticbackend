# LinkedIn Automation Frontend Integration Guide

## Overview

This guide provides everything a frontend engineer needs to integrate with the LinkedIn Automation backend API. The system allows users to automate job searches and applications on LinkedIn using natural language prompts.

## Table of Contents
1. [Authentication](#authentication)
2. [Resume Management](#resume-management)
3. [API Endpoints](#api-endpoints)
4. [Error Handling](#error-handling)
5. [Complete Implementation Example](#complete-implementation-example)
6. [UI/UX Best Practices](#uiux-best-practices)

## Authentication

All API endpoints require authentication using Supabase Auth JWT tokens.

### Setup Supabase Client

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
)
```

### User Authentication Flow

```javascript
// Sign up new user
const { data: { user, session }, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure-password'
})

// Sign in existing user
const { data: { user, session }, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'secure-password'
})

// Get current session
const { data: { session } } = await supabase.auth.getSession()

// Use session.access_token for API calls
```

## API Base Configuration

```javascript
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001'
const API_KEY = process.env.REACT_APP_API_KEY

const apiHeaders = {
  'Content-Type': 'application/json',
  'X-API-Key': API_KEY,
  'Authorization': `Bearer ${session.access_token}`
}
```

## Resume Management

Before starting automation, users need to upload their resume to Supabase Storage.

### Upload Resume

```javascript
const uploadResume = async (file) => {
  // Validate file
  const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  if (!validTypes.includes(file.type)) {
    throw new Error('Please upload a PDF or Word document')
  }

  // Upload to Supabase Storage
  const fileName = `${user.id}/${Date.now()}-${file.name}`
  const { data, error } = await supabase.storage
    .from('resumes')
    .upload(fileName, file)

  if (error) throw error

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('resumes')
    .getPublicUrl(fileName)

  return {
    url: publicUrl,
    metadata: {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    }
  }
}
```

## API Endpoints

### 1. Start Automation Session

**Endpoint**: `POST /api/linkedin/start`

**Request Body**:

```javascript
// Option 1: Natural Language Search (Recommended)
{
  "userId": "user-uuid-from-supabase",
  "searchPrompt": "Senior React developer jobs in San Francisco with good benefits",
  "resumeUrl": "https://your-supabase.supabase.co/storage/v1/object/public/resumes/user-id/resume.pdf",
  "resumeMetadata": {
    "fileName": "john-doe-resume.pdf",
    "fileType": "application/pdf"
  },
  "config": {
    "maxApplications": 50,              // Optional: Max jobs to apply to
    "keywords": ["React", "TypeScript"], // Optional: Must-have keywords
    "externalApplicationConfig": {
      "pauseOnAccountCreation": true,   // Pause if account creation needed
      "autoCreateAccount": false,        // Auto-create accounts
      "defaultEmail": "user@example.com", // Email for auto-creation
      "defaultPassword": "secure-pass"   // Password for auto-creation
    }
  }
}

// Option 2: Traditional Structured Search
{
  "userId": "user-uuid-from-supabase",
  "config": {
    "jobTitle": "Software Engineer",
    "location": "San Francisco, CA",
    "experienceLevel": ["ENTRY_LEVEL", "MID_LEVEL", "SENIOR_LEVEL"],
    "jobType": ["FULL_TIME", "CONTRACT"],
    "filters": {
      "datePosted": "week",    // "24h", "week", "month"
      "remote": true,
      "easyApplyOnly": false
    },
    "maxApplications": 20
  },
  "resumeUrl": "https://...",
  "resumeMetadata": {
    "fileName": "resume.pdf",
    "fileType": "application/pdf"
  }
}
```

**Response**:

```javascript
{
  "success": true,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "liveViewUrl": "https://app.browserbase.com/debug/session-id",
  "debugUrl": "https://app.browserbase.com/debug/session-id"
}
```

**Implementation Example**:

```javascript
const startAutomation = async (searchPrompt, resumeData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/linkedin/start`, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({
        userId: user.id,
        searchPrompt: searchPrompt,
        resumeUrl: resumeData.url,
        resumeMetadata: resumeData.metadata,
        config: {
          maxApplications: 50,
          externalApplicationConfig: {
            pauseOnAccountCreation: true
          }
        }
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to start automation')
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Start automation error:', error)
    throw error
  }
}
```

### 2. Get Session Status

**Endpoint**: `GET /api/linkedin/status/:sessionId`

**Response**:

```javascript
{
  "success": true,
  "session": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "RUNNING", // RUNNING, PAUSED, INTERVENTION_REQUIRED, COMPLETED, FAILED
    "progress": {
      "totalJobs": 150,
      "processedJobs": 45,
      "appliedJobs": 38,
      "skippedJobs": 5,
      "failedJobs": 2,
      "currentPage": 3
    },
    "currentJob": {
      "title": "Senior React Developer",
      "company": "Tech Corp",
      "location": "San Francisco, CA"
    },
    "interventionRequired": false,
    "interventionDetails": null
  },
  "recentLogs": [
    {
      "timestamp": "2024-01-20T10:30:00Z",
      "message": "Successfully applied to Senior React Developer at Tech Corp",
      "level": "info"
    }
  ]
}
```

**Status Values**:
- `RUNNING`: Automation is actively processing jobs
- `PAUSED`: User paused the automation
- `INTERVENTION_REQUIRED`: User action needed (login, CAPTCHA, etc.)
- `COMPLETED`: All jobs processed or limit reached
- `FAILED`: Automation encountered an error

**Polling Implementation**:

```javascript
const pollStatus = (sessionId, onUpdate) => {
  const interval = setInterval(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/linkedin/status/${sessionId}`, {
        headers: apiHeaders
      })

      const data = await response.json()
      onUpdate(data.session)

      // Stop polling if session is complete or failed
      if (['COMPLETED', 'FAILED'].includes(data.session.status)) {
        clearInterval(interval)
      }
    } catch (error) {
      console.error('Status polling error:', error)
    }
  }, 5000) // Poll every 5 seconds

  return () => clearInterval(interval)
}
```

### 3. Handle Interventions

When the automation requires user intervention (login, CAPTCHA, etc.), the status will be `INTERVENTION_REQUIRED`.

**Intervention Types**:
- `LOGIN_REQUIRED`: User needs to log into LinkedIn
- `CAPTCHA`: CAPTCHA verification needed
- `TWO_FACTOR_AUTH`: 2FA code required
- `ACCOUNT_CREATION`: External job site account creation
- `RATE_LIMIT`: LinkedIn rate limiting detected

**Get Intervention Details**:

```javascript
{
  "status": "INTERVENTION_REQUIRED",
  "interventionRequired": true,
  "interventionDetails": {
    "type": "LOGIN_REQUIRED",
    "message": "Please log in to LinkedIn to continue",
    "liveViewUrl": "https://app.browserbase.com/debug/session-id",
    "timestamp": "2024-01-20T10:30:00Z"
  }
}
```

**Show Intervention Modal**:

```javascript
const InterventionModal = ({ intervention, sessionId }) => {
  const [loading, setLoading] = useState(false)

  const handleContinue = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/linkedin/continue/${sessionId}`, {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({
          interventionCompleted: true
        })
      })
      
      if (response.ok) {
        // Close modal and resume polling
        onClose()
      }
    } catch (error) {
      alert('Error continuing automation')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal>
      <h2>Action Required</h2>
      <p>{intervention.message}</p>
      <iframe 
        src={intervention.liveViewUrl}
        style={{ width: '100%', height: '600px', border: '1px solid #ccc' }}
        title="LinkedIn Automation Browser"
      />
      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <button 
          onClick={handleContinue} 
          disabled={loading}
          style={{ padding: '10px 20px' }}
        >
          {loading ? 'Processing...' : "I've completed the action - Continue"}
        </button>
      </div>
    </Modal>
  )
}
```

### 4. Pause/Resume Session

**Pause Endpoint**: `PUT /api/linkedin/pause/:sessionId`

```javascript
const pauseSession = async (sessionId) => {
  const response = await fetch(`${API_BASE_URL}/api/linkedin/pause/${sessionId}`, {
    method: 'PUT',
    headers: apiHeaders
  })
  
  if (!response.ok) {
    throw new Error('Failed to pause session')
  }
  
  return response.json()
}
```

**Resume Endpoint**: `PUT /api/linkedin/resume/:sessionId`

```javascript
const resumeSession = async (sessionId) => {
  const response = await fetch(`${API_BASE_URL}/api/linkedin/resume/${sessionId}`, {
    method: 'PUT',
    headers: apiHeaders
  })
  
  if (!response.ok) {
    throw new Error('Failed to resume session')
  }
  
  return response.json()
}
```

### 5. Stop Session

**Endpoint**: `DELETE /api/linkedin/stop/:sessionId`

```javascript
const stopSession = async (sessionId, reason = 'User requested stop') => {
  const response = await fetch(`${API_BASE_URL}/api/linkedin/stop/${sessionId}`, {
    method: 'DELETE',
    headers: apiHeaders,
    body: JSON.stringify({ reason })
  })
  
  if (!response.ok) {
    throw new Error('Failed to stop session')
  }
  
  return response.json()
}
```

### 6. Get Applied Jobs

**Endpoint**: `GET /api/linkedin/jobs/:sessionId`

**Query Parameters**:
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 50)

**Response**:

```javascript
{
  "success": true,
  "jobs": [
    {
      "id": "job-uuid",
      "jobId": "linkedin-job-id",
      "title": "Senior React Developer",
      "company": "Tech Corp",
      "location": "San Francisco, CA",
      "applicationStatus": "SUCCESS", // SUCCESS, FAILED, ALREADY_APPLIED
      "appliedAt": "2024-01-20T10:30:00Z",
      "jobUrl": "https://linkedin.com/jobs/view/123",
      "isEasyApply": true,
      "errorMessage": null // Present if status is FAILED
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 38,
    "totalPages": 1
  }
}
```

## Error Handling

All endpoints return errors in this format:

```javascript
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details if available"
}
```

**Common Error Codes**:
- `400`: Bad request (invalid parameters)
- `401`: Invalid or missing authentication
- `403`: Insufficient permissions
- `429`: Rate limit exceeded (10 requests per hour for automation endpoints)
- `500`: Server error

**Error Handling Example**:

```javascript
const handleApiError = (error) => {
  if (error.status === 429) {
    return 'Rate limit exceeded. Please try again later.'
  } else if (error.status === 401) {
    // Redirect to login
    return 'Please log in to continue'
  } else {
    return error.message || 'An unexpected error occurred'
  }
}
```

## Complete Implementation Example

```javascript
import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'

const LinkedInAutomation = () => {
  const [user, setUser] = useState(null)
  const [automationSession, setAutomationSession] = useState(null)
  const [status, setStatus] = useState(null)
  const [showIntervention, setShowIntervention] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [appliedJobs, setAppliedJobs] = useState([])

  useEffect(() => {
    // Get current user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })
  }, [])

  // Start automation
  const handleStart = async () => {
    try {
      setIsLoading(true)
      
      // Get resume file
      const fileInput = document.getElementById('resume-upload')
      const file = fileInput.files[0]
      
      if (!file) {
        alert('Please upload a resume')
        return
      }
      
      // Upload resume
      const resumeData = await uploadResume(file)
      
      // Get search prompt
      const searchPrompt = document.getElementById('search-prompt').value
      
      if (!searchPrompt) {
        alert('Please enter a job search query')
        return
      }
      
      // Start automation
      const result = await startAutomation(searchPrompt, resumeData)
      
      setAutomationSession(result)
      
      // Start polling for status
      const stopPolling = pollStatus(result.sessionId, (newStatus) => {
        setStatus(newStatus)
        
        if (newStatus.interventionRequired) {
          setShowIntervention(true)
        }
        
        // Load applied jobs when complete
        if (newStatus.status === 'COMPLETED') {
          loadAppliedJobs(result.sessionId)
        }
      })
      
      // Store cleanup function
      window.stopPolling = stopPolling
      
    } catch (error) {
      alert('Error: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Load applied jobs
  const loadAppliedJobs = async (sessionId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/linkedin/jobs/${sessionId}`, {
        headers: apiHeaders
      })
      
      const data = await response.json()
      setAppliedJobs(data.jobs)
    } catch (error) {
      console.error('Error loading jobs:', error)
    }
  }

  // Handle pause/resume
  const handlePauseResume = async () => {
    try {
      if (status.status === 'RUNNING') {
        await pauseSession(automationSession.sessionId)
      } else if (status.status === 'PAUSED') {
        await resumeSession(automationSession.sessionId)
      }
    } catch (error) {
      alert('Error: ' + error.message)
    }
  }

  // Handle stop
  const handleStop = async () => {
    if (confirm('Are you sure you want to stop the automation?')) {
      try {
        await stopSession(automationSession.sessionId)
        window.stopPolling && window.stopPolling()
        setAutomationSession(null)
        setStatus(null)
      } catch (error) {
        alert('Error: ' + error.message)
      }
    }
  }

  return (
    <div className="linkedin-automation">
      <h1>LinkedIn Job Automation</h1>
      
      {!automationSession ? (
        <div className="start-form">
          <div className="form-group">
            <label>Upload Resume (PDF or Word)</label>
            <input 
              type="file" 
              id="resume-upload" 
              accept=".pdf,.doc,.docx"
              disabled={isLoading}
            />
          </div>
          
          <div className="form-group">
            <label>What jobs are you looking for?</label>
            <input
              type="text"
              id="search-prompt"
              placeholder="e.g., Senior React developer jobs in San Francisco with good benefits"
              style={{ width: '100%', padding: '10px' }}
              disabled={isLoading}
            />
          </div>
          
          <button 
            onClick={handleStart}
            disabled={isLoading || !user}
            className="start-button"
          >
            {isLoading ? 'Starting...' : 'Start Job Search'}
          </button>
          
          {!user && (
            <p className="warning">Please log in to start automation</p>
          )}
        </div>
      ) : (
        <div className="automation-status">
          <div className="status-header">
            <h2>Status: <span className={`status-${status?.status}`}>{status?.status}</span></h2>
            <a 
              href={automationSession.liveViewUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="live-view-link"
            >
              View Live Browser →
            </a>
          </div>
          
          <div className="progress-section">
            <h3>Progress</h3>
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ 
                  width: `${(status?.progress.appliedJobs / status?.progress.totalJobs) * 100}%` 
                }}
              />
            </div>
            <div className="progress-stats">
              <span>Applied: {status?.progress.appliedJobs}</span>
              <span>Skipped: {status?.progress.skippedJobs}</span>
              <span>Failed: {status?.progress.failedJobs}</span>
              <span>Total: {status?.progress.totalJobs}</span>
            </div>
          </div>
          
          {status?.currentJob && (
            <div className="current-job">
              <h3>Currently Processing</h3>
              <p>{status.currentJob.title} at {status.currentJob.company}</p>
              <p>{status.currentJob.location}</p>
            </div>
          )}
          
          <div className="controls">
            <button 
              onClick={handlePauseResume}
              disabled={!['RUNNING', 'PAUSED'].includes(status?.status)}
            >
              {status?.status === 'RUNNING' ? 'Pause' : 'Resume'}
            </button>
            <button 
              onClick={handleStop}
              className="stop-button"
            >
              Stop Automation
            </button>
          </div>
          
          {status?.status === 'COMPLETED' && appliedJobs.length > 0 && (
            <div className="applied-jobs">
              <h3>Applied Jobs ({appliedJobs.length})</h3>
              <div className="jobs-list">
                {appliedJobs.map(job => (
                  <div key={job.id} className="job-item">
                    <h4>{job.title}</h4>
                    <p>{job.company} - {job.location}</p>
                    <p className={`status-${job.applicationStatus}`}>
                      {job.applicationStatus}
                    </p>
                    <a 
                      href={job.jobUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      View Job →
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {showIntervention && status?.interventionDetails && (
        <InterventionModal 
          intervention={status.interventionDetails}
          sessionId={automationSession.sessionId}
          onClose={() => setShowIntervention(false)}
        />
      )}
    </div>
  )
}

export default LinkedInAutomation
```

## UI/UX Best Practices

### 1. User Onboarding
- Explain the automation process clearly
- Set expectations about timing (can take 30-60 minutes)
- Warn about LinkedIn rate limits

### 2. Progress Indicators
- Show real-time progress with visual indicators
- Display current job being processed
- Use colors to indicate status (green = success, yellow = warning, red = error)

### 3. Intervention Handling
- Make intervention modals prominent and clear
- Provide instructions on what the user needs to do
- Auto-resume after intervention is complete

### 4. Error States
- Show friendly error messages
- Provide actionable next steps
- Include support contact for persistent issues

### 5. Mobile Considerations
- The live browser view may not work well on mobile
- Suggest using desktop for best experience
- Provide mobile-friendly status updates

### 6. Rate Limiting
- Show remaining automation attempts
- Display when rate limit resets
- Suggest optimal times to run automation

### 7. Data Privacy
- Clearly explain what data is collected
- Show where resume is stored
- Provide option to delete automation data

## Testing Checklist

Before deploying, test these scenarios:

1. ✅ User authentication flow
2. ✅ Resume upload with different file types
3. ✅ Natural language search queries
4. ✅ Status polling and updates
5. ✅ Intervention handling
6. ✅ Pause/resume functionality
7. ✅ Stop automation mid-process
8. ✅ Error handling for network issues
9. ✅ Rate limiting behavior
10. ✅ Applied jobs display

## Support & Debugging

### Common Issues

1. **"Rate limit exceeded"**
   - Solution: Wait 1 hour before trying again
   - Limit: 10 automation sessions per hour

2. **"Intervention required" stuck**
   - Solution: Ensure user completes action in live view
   - Click "Continue" only after action is complete

3. **"Session not found"**
   - Solution: Session may have expired or been stopped
   - Start a new automation session

### Debug Information

Include these in bug reports:
- Session ID
- User ID
- Timestamp of issue
- Browser console errors
- Network request/response logs

## Future Enhancements

Planned features for future releases:

1. **WebSocket Support**: Real-time updates without polling
2. **Batch Operations**: Apply to multiple saved searches
3. **Application Templates**: Save and reuse application preferences
4. **Analytics Dashboard**: Success rates and application insights
5. **Calendar Integration**: Schedule automation runs
6. **Email Notifications**: Get notified when automation completes