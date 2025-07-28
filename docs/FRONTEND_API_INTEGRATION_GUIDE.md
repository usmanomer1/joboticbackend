# Jobotic Backend - Frontend API Integration Guide

## Base Configuration

```javascript
const API_BASE_URL = 'http://localhost:3001/api'
const WS_URL = 'ws://localhost:3001'
```

## Authentication

All endpoints require authentication token in headers:
```javascript
headers: {
  'Authorization': 'Bearer YOUR_SUPABASE_JWT_TOKEN',
  'Content-Type': 'application/json'
}
```

## LinkedIn Automation Endpoints

### 1. Start LinkedIn Job Search Session

**Endpoint:** `POST /api/linkedin/start`

**Request Body:**
```json
{
  "userId": "27c01ed9-a739-45fc-a2aa-ac30c2749424",
  "searchPrompt": "software engineer intern canada on site",
  "resumeUrl": "https://your-supabase-storage.com/resumes/file.pdf",
  "resumeMetadata": {
    "fileName": "resume.pdf",
    "fileType": "application/pdf",
    "extractedText": "Resume content text..."
  },
  "filters": {
    "datePosted": "week",
    "easyApplyOnly": false,
    "under10Applicants": true,
    "inMyNetwork": false,
    "company": "Microsoft"
  },
  "userProfile": {
    "fullName": "John Doe",
    "email": "john.doe@example.com",
    "phone": "+1-555-123-4567",
    "location": "Vancouver, BC",
    "linkedinUrl": "https://linkedin.com/in/johndoe",
    "currentPosition": "Software Engineering Student",
    "currentCompany": "University of British Columbia"
  },
  "maxApplications": 20,
  "externalApplicationConfig": {
    "autoCreateAccount": false,
    "defaultEmail": "john.doe@example.com",
    "defaultPassword": "secure_password",
    "pauseOnAccountCreation": true
  }
}
```

**Note:** The `searchPrompt` field is required and should contain a natural language search query. LinkedIn can extract location and job type from this query automatically.

**Minimal Request Example:**
```json
{
  "userId": "27c01ed9-a739-45fc-a2aa-ac30c2749424",
  "searchPrompt": "software engineer vancouver bc"
}
```

**Field Details:**
- `userId`: Must match the authenticated user's ID from Supabase Auth
- `searchPrompt`: Natural language search query (e.g., "software engineer intern canada on site")
- `filters`: LinkedIn UI filters (all optional):
  - `datePosted`: One of: `day`, `week`, `month`
  - `easyApplyOnly`: Show only Easy Apply jobs
  - `under10Applicants`: Jobs with fewer than 10 applicants
  - `inMyNetwork`: Jobs from connections
  - `company`: Specific company name
- `userProfile`: User information for form filling (optional but recommended)
- `maxApplications`: Number between 1-100 (default: 50)

**Response:**
```json
{
  "sessionId": "abc123-session-id",
  "liveViewUrl": "https://www.browserbase.com/sessions/abc123/debug",
  "status": "running",
  "taskId": "task_uuid-here",
  "browserbaseSessionId": "abc123-session-id"
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Bad Request",
  "message": "Invalid request body",
  "details": {
    "fieldErrors": {
      "userId": ["Expected string, received undefined"],
      "searchPrompt": ["Required"]
    },
    "formErrors": []
  }
}
```

**Error Response (401 Unauthorized):**
```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid authorization header"
}
```

**Error Response (500 Server Error):**
```json
{
  "error": "Internal Server Error",
  "message": "Failed to start automation",
  "details": "Session limit reached. Please complete or terminate existing sessions."
}
```

### 2. Continue Session After Login

**Endpoint:** `POST /api/linkedin/continue/:sessionId`

**URL Params:**
- `sessionId`: The session ID from start response

**Response:**
```json
{
  "success": true,
  "message": "Automation resumed"
}
```

### 3. Get Session Progress

**Endpoint:** `GET /api/linkedin/progress/:sessionId`

**URL Params:**
- `sessionId`: The session ID

**Response:**
```json
{
  "success": true,
  "progress": {
    "totalJobs": 150,
    "processedJobs": 45,
    "appliedJobs": 12,
    "skippedJobs": 33,
    "failedJobs": 0,
    "currentPage": 3
  }
}
```

### 4. Pause Session

**Endpoint:** `POST /api/linkedin/pause/:sessionId`

**URL Params:**
- `sessionId`: The session ID

**Response:**
```json
{
  "success": true,
  "message": "Session paused"
}
```

### 5. Resume Session

**Endpoint:** `POST /api/linkedin/resume/:sessionId`

**URL Params:**
- `sessionId`: The session ID

**Response:**
```json
{
  "success": true,
  "message": "Session resumed"
}
```

### 6. Stop Session

**Endpoint:** `POST /api/linkedin/stop/:sessionId`

**URL Params:**
- `sessionId`: The session ID

**Response:**
```json
{
  "success": true,
  "message": "Session stopped"
}
```

### 7. Get User Sessions

**Endpoint:** `GET /api/linkedin/sessions`

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "id": "session-uuid",
      "browserbase_session_id": "browserbase-id",
      "status": "active",
      "config": {
        "jobTitle": "Software Engineer",
        "location": "Remote"
      },
      "created_at": "2025-01-15T10:00:00Z",
      "started_at": "2025-01-15T10:01:00Z",
      "completed_at": null,
      "live_view_url": "https://browserbase.com/sessions/xyz/live"
    }
  ]
}
```

## WebSocket Events

### Connection

```javascript
const socket = io(WS_URL, {
  auth: {
    token: 'YOUR_SUPABASE_JWT_TOKEN'
  }
});

// Join session room
socket.emit('join-session', { sessionId: 'abc123-session-id' });
```

### Events You'll Receive

#### 1. Session Started
```javascript
socket.on('session_started', (data) => {
  // data: {
  //   sessionId: 'abc123',
  //   userId: 'user-id',
  //   config: { jobTitle, location, etc },
  //   debugUrl: 'https://browserbase.com/sessions/abc123/debug'
  // }
});
```

#### 2. Intervention Required
```javascript
socket.on('intervention_required', (data) => {
  // data: {
  //   sessionId: 'abc123',
  //   intervention: {
  //     type: 'login', // or 'captcha', 'two_fa', 'blocked', 'rate_limit'
  //     confidence: 0.95,
  //     message: 'LinkedIn login required',
  //     instructions: 'Please log in to your LinkedIn account...',
  //     url: 'https://www.linkedin.com/login',
  //     liveViewUrl: 'https://browserbase.com/sessions/abc123/live'
  //   }
  // }
});
```

#### 3. Action Performed
```javascript
socket.on('action_performed', (data) => {
  // data: {
  //   sessionId: 'abc123',
  //   action: 'Searching for: software engineer remote',
  //   timestamp: '2025-01-15T10:05:00Z'
  // }
});
```

#### 4. Job Found
```javascript
socket.on('job_found', (data) => {
  // data: {
  //   sessionId: 'abc123',
  //   job: {
  //     jobId: 'job-123',
  //     company: 'Tech Corp',
  //     jobTitle: 'Senior Software Engineer',
  //     location: 'Remote',
  //     jobUrl: 'https://linkedin.com/jobs/view/123',
  //     isEasyApply: true
  //   }
  // }
});
```

#### 5. Application Started
```javascript
socket.on('application_started', (data) => {
  // data: {
  //   sessionId: 'abc123',
  //   job: { jobId, company, jobTitle, etc }
  // }
});
```

#### 6. Application Submitted
```javascript
socket.on('application_submitted', (data) => {
  // data: {
  //   sessionId: 'abc123',
  //   job: { jobId, company, jobTitle, etc },
  //   success: true
  // }
});
```

#### 7. Job Skipped
```javascript
socket.on('job_skipped', (data) => {
  // data: {
  //   sessionId: 'abc123',
  //   reason: 'already_applied', // or 'not_easy_apply', 'not_matching'
  //   job: { jobId, company, jobTitle, etc }
  // }
});
```

#### 8. Session Completed
```javascript
socket.on('session_completed', (data) => {
  // data: {
  //   sessionId: 'abc123',
  //   totalApplications: 15,
  //   metrics: {
  //     totalJobsViewed: 150,
  //     applicationsSubmitted: 15,
  //     applicationsSuccessful: 14,
  //     applicationsFailed: 1,
  //     averageApplicationTime: 45.2
  //   }
  // }
});
```

#### 9. Error Event
```javascript
socket.on('error', (data) => {
  // data: {
  //   sessionId: 'abc123',
  //   error: 'Error message here'
  // }
});
```

## Job Search Endpoints

### 1. Search Jobs

**Endpoint:** `POST /api/jobs/search`

**Request Body:**
```json
{
  "query": "software engineer",
  "location": "San Francisco",
  "employmentTypes": ["FULLTIME"],
  "remoteFilter": "remote",
  "datePosted": "month",
  "experienceLevel": ["ENTRY", "MID"],
  "radius": 50,
  "page": 1,
  "numPages": 1
}
```

**Response:**
```json
{
  "data": [
    {
      "job_id": "abc123",
      "employer_name": "Tech Company",
      "job_title": "Software Engineer",
      "job_apply_link": "https://company.com/apply",
      "job_description": "Full job description...",
      "job_posted_at_datetime_utc": "2025-01-15T10:00:00Z",
      "job_city": "San Francisco",
      "job_state": "CA",
      "job_country": "US",
      "job_is_remote": true,
      "job_min_salary": 120000,
      "job_max_salary": 180000,
      "job_salary_currency": "USD",
      "job_salary_period": "YEAR"
    }
  ],
  "total_results": 150
}
```

### 2. Get Job Details

**Endpoint:** `GET /api/jobs/:jobId`

**URL Params:**
- `jobId`: The job ID from search results

**Response:**
```json
{
  "data": {
    "job_id": "abc123",
    "employer_name": "Tech Company",
    "employer_logo": "https://logo.url",
    "job_title": "Software Engineer",
    "job_description": "Full description...",
    "job_highlights": {
      "Qualifications": ["3+ years experience", "Bachelor's degree"],
      "Responsibilities": ["Develop features", "Code reviews"],
      "Benefits": ["Health insurance", "401k match"]
    },
    "job_required_skills": ["JavaScript", "React", "Node.js"],
    "job_required_experience": {
      "required_experience_in_months": 36
    }
  }
}
```

### 3. Estimate Salary

**Endpoint:** `POST /api/jobs/estimate-salary`

**Request Body:**
```json
{
  "job_title": "Software Engineer",
  "location": "San Francisco, CA",
  "radius": 50
}
```

**Response:**
```json
{
  "data": [
    {
      "location": "San Francisco, CA",
      "min_salary": 120000,
      "max_salary": 180000,
      "median_salary": 150000,
      "publisher_name": "JSearch",
      "currency": "USD",
      "salary_period": "YEAR"
    }
  ]
}
```

### 4. Match Job to Resume

**Endpoint:** `POST /api/jobs/match`

**Request Body:**
```json
{
  "jobId": "abc123",
  "jobDescription": "Full job description text...",
  "jobTitle": "Software Engineer",
  "resumeText": "Resume content text...",
  "resumeMetadata": {
    "fileName": "resume.pdf",
    "skills": ["JavaScript", "React"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "matchScore": 85,
  "analysis": {
    "strengths": [
      "Strong technical skills match",
      "Relevant experience level"
    ],
    "gaps": [
      "Missing AWS experience mentioned in job"
    ],
    "suggestions": [
      "Highlight your cloud experience",
      "Add any DevOps projects"
    ]
  }
}
```

## Iframe Embedding

To embed the Browserbase session in an iframe:

```html
<iframe 
  src="${liveViewUrl}"
  width="100%"
  height="600px"
  frameborder="0"
  allow="clipboard-read; clipboard-write"
/>
```

**Important Notes:**
- The `liveViewUrl` from the start session response is used for iframe embedding
- The iframe will show the live browser session
- Users can interact directly with the browser through the iframe
- The session will timeout after 1 hour of inactivity

## Error Handling

All endpoints follow this error format:

```json
{
  "success": false,
  "error": "Error message here",
  "code": "ERROR_CODE",
  "details": {
    // Additional error context
  }
}
```

Common error codes:
- `SESSION_LIMIT_REACHED`: User has too many active sessions
- `SESSION_NOT_FOUND`: Invalid session ID
- `AUTHENTICATION_FAILED`: Invalid or missing auth token
- `RATE_LIMITED`: Too many requests
- `INTERVENTION_REQUIRED`: Manual action needed in browser

## Rate Limits

- Start session: 3 concurrent sessions per user
- API calls: 100 requests per minute per user
- WebSocket events: No limit (real-time updates)

## Best Practices

1. **Session Management**
   - Always stop sessions when done to free up resources
   - Monitor intervention_required events and prompt users
   - Use the continue endpoint after users complete login

2. **Error Recovery**
   - Implement retry logic for transient failures
   - Show meaningful error messages to users
   - Allow users to manually intervene when needed

3. **WebSocket Handling**
   - Implement reconnection logic
   - Handle connection drops gracefully
   - Unsubscribe from events when component unmounts

4. **Performance**
   - Cache job search results locally
   - Implement pagination for large result sets
   - Debounce search inputs