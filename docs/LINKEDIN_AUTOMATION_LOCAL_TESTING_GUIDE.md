# LinkedIn Automation Local Testing Guide

## Overview

This guide will help you test the LinkedIn Automation feature locally with both backend and frontend running on your machine.

## Prerequisites

1. Node.js (v18+)
2. PostgreSQL database (local or cloud)
3. Supabase account (for authentication and storage)
4. Browserbase account (for browser automation)
5. All required API keys

## Backend Setup

### 1. Environment Variables

Create or update your `.env` file in the backend directory:

```bash
# Existing variables you already have
NODE_ENV=development
PORT=3001
DATABASE_URL=your-database-url
RAPIDAPI_KEY=your-rapidapi-key
GEMINI_API_KEY=your-gemini-api-key
API_KEY=your-api-key
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-supabase-service-key
FRONTEND_URL=http://localhost:3000

# New LinkedIn Automation variables
BROWSERBASE_API_KEY=your-browserbase-api-key
BROWSERBASE_PROJECT_ID=your-browserbase-project-id
```

### 2. Database Setup

Run the migration to create LinkedIn automation tables:

```bash
# From the backend directory
cd src/migrations
node createLinkedInTables.js
```

This will create:
- `linkedin_automation_sessions` table
- `linkedin_job_applications` table
- `linkedin_job_details` table
- `linkedin_external_accounts` table

### 3. Start Backend Server

```bash
# From the backend directory
npm install
npm run dev
```

The backend should now be running on `http://localhost:3001`

### 4. Verify Backend is Running

```bash
curl http://localhost:3001/api/health
```

Should return: `{"status":"ok","timestamp":"..."}`

## Frontend Setup

### 1. Create a Test Frontend

If you don't have a frontend yet, create a simple React app:

```bash
npx create-react-app jobotic-frontend
cd jobotic-frontend
npm install @supabase/supabase-js
```

### 2. Frontend Environment Variables

Create `.env` in your frontend directory:

```bash
REACT_APP_API_URL=http://localhost:3001
REACT_APP_API_KEY=your-api-key
REACT_APP_SUPABASE_URL=your-supabase-url
REACT_APP_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Add LinkedIn Automation Component

Create `src/LinkedInAutomation.js` and copy the complete implementation from the Frontend Guide:

```javascript
// Copy the complete implementation from 
// docs/LINKEDIN_AUTOMATION_FRONTEND_GUIDE.md
// (lines 478-723)
```

### 4. Update App.js

```javascript
import './App.css';
import LinkedInAutomation from './LinkedInAutomation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

function App() {
  return (
    <div className="App">
      <LinkedInAutomation />
    </div>
  );
}

export default App;
```

### 5. Start Frontend

```bash
npm start
```

Frontend will run on `http://localhost:3000`

## Testing the Complete Flow

### 1. User Authentication

First, create a test user:

```bash
# Using curl to create a user via your backend
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123"
  }'
```

### 2. Upload a Test Resume

You can test resume upload via Supabase directly or through the UI:

```javascript
// Test script to upload resume
const uploadTestResume = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  
  // Create a test PDF file or use an existing one
  const file = new File(['Test resume content'], 'test-resume.pdf', {
    type: 'application/pdf'
  });
  
  const { data, error } = await supabase.storage
    .from('resumes')
    .upload(`${user.id}/test-resume.pdf`, file);
    
  console.log('Upload result:', { data, error });
};
```

### 3. Test API Endpoints Directly

#### Start Automation Session

```bash
# Get auth token first
AUTH_TOKEN="your-supabase-jwt-token"

# Start automation with natural language
curl -X POST http://localhost:3001/api/linkedin/start \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "userId": "your-user-id",
    "searchPrompt": "Software engineer jobs in San Francisco",
    "resumeUrl": "https://your-supabase.supabase.co/storage/v1/object/public/resumes/test-resume.pdf",
    "resumeMetadata": {
      "fileName": "test-resume.pdf",
      "fileType": "application/pdf"
    }
  }'
```

#### Check Session Status

```bash
SESSION_ID="returned-session-id"

curl http://localhost:3001/api/linkedin/status/$SESSION_ID \
  -H "X-API-Key: your-api-key" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

### 4. Monitor Browser Automation

When automation starts, you'll receive a `debugUrl` that opens the Browserbase dashboard where you can:
- Watch the browser in real-time
- See console logs
- Debug any issues
- Take control if needed

### 5. Test Intervention Handling

To test intervention scenarios:

1. **Trigger Manual Login**: Clear LinkedIn cookies before starting
2. **Test CAPTCHA**: Run multiple sessions quickly
3. **Test External Applications**: Search for jobs that aren't Easy Apply

## Common Test Scenarios

### Scenario 1: Basic Job Search

```javascript
// Test natural language search
const testBasicSearch = async () => {
  const response = await fetch('http://localhost:3001/api/linkedin/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.REACT_APP_API_KEY,
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      userId: user.id,
      searchPrompt: "Entry level React developer jobs remote",
      resumeUrl: resumeData.url,
      resumeMetadata: resumeData.metadata
    })
  });
  
  const result = await response.json();
  console.log('Session started:', result);
};
```

### Scenario 2: Test with Filters

```javascript
// Test with specific filters
const testWithFilters = async () => {
  const response = await fetch('http://localhost:3001/api/linkedin/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.REACT_APP_API_KEY,
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      userId: user.id,
      config: {
        jobTitle: "Software Engineer",
        location: "New York, NY",
        experienceLevel: ["ENTRY_LEVEL", "MID_LEVEL"],
        filters: {
          datePosted: "week",
          remote: true,
          easyApplyOnly: true
        },
        maxApplications: 5
      },
      resumeUrl: resumeData.url,
      resumeMetadata: resumeData.metadata
    })
  });
  
  const result = await response.json();
  console.log('Session started with filters:', result);
};
```

### Scenario 3: Test External Applications

```javascript
// Test external application handling
const testExternalApplications = async () => {
  const response = await fetch('http://localhost:3001/api/linkedin/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.REACT_APP_API_KEY,
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      userId: user.id,
      searchPrompt: "Senior software engineer at Google", // Often external
      resumeUrl: resumeData.url,
      resumeMetadata: resumeData.metadata,
      config: {
        maxApplications: 3,
        externalApplicationConfig: {
          pauseOnAccountCreation: true,
          autoCreateAccount: false
        }
      }
    })
  });
  
  const result = await response.json();
  console.log('External application test:', result);
};
```

## Debugging Tips

### 1. Enable Debug Logging

Add to your backend `.env`:

```bash
DEBUG=linkedin:*
LOG_LEVEL=debug
```

### 2. Monitor Supabase Logs

Check Supabase dashboard for:
- Authentication logs
- Storage access logs
- Database query logs

### 3. Browserbase Debugging

In the Browserbase dashboard:
- Enable console log capture
- Take screenshots at key steps
- Use browser DevTools remotely

### 4. Common Issues and Solutions

**Issue: "No browser context available"**
- Solution: Check Browserbase API key and project ID
- Verify Browserbase session is active

**Issue: "Resume upload failed"**
- Solution: Check Supabase storage bucket permissions
- Ensure bucket is public or has proper RLS policies

**Issue: "Rate limit exceeded"**
- Solution: LinkedIn limits requests, wait 1 hour
- Use fewer applications per session

**Issue: "Session not found"**
- Solution: Session may have expired (30 min timeout)
- Start a new session

### 5. Test Database Queries

Check your automation data:

```sql
-- View all sessions
SELECT * FROM linkedin_automation_sessions 
WHERE user_id = 'your-user-id'
ORDER BY created_at DESC;

-- View job applications
SELECT * FROM linkedin_job_applications
WHERE session_id = 'your-session-id';

-- Check for errors
SELECT * FROM linkedin_automation_sessions
WHERE status = 'FAILED';
```

## Performance Testing

### Load Testing

Test with multiple concurrent sessions:

```javascript
// Test concurrent sessions
const loadTest = async () => {
  const promises = [];
  
  for (let i = 0; i < 3; i++) {
    promises.push(
      fetch('http://localhost:3001/api/linkedin/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.REACT_APP_API_KEY,
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId: user.id,
          searchPrompt: `Test search ${i}`,
          resumeUrl: resumeData.url,
          resumeMetadata: resumeData.metadata,
          config: {
            maxApplications: 2
          }
        })
      })
    );
  }
  
  const results = await Promise.all(promises);
  console.log('Load test results:', results);
};
```

### Monitor Resource Usage

```bash
# Monitor Node.js process
top -pid $(pgrep -f "node.*jobotic")

# Monitor PostgreSQL connections
psql -c "SELECT count(*) FROM pg_stat_activity;"
```

## Security Testing

### 1. Test Authentication

```bash
# Test without auth token (should fail)
curl -X POST http://localhost:3001/api/linkedin/start \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"userId": "test"}'

# Test with invalid API key (should fail)
curl -X POST http://localhost:3001/api/linkedin/start \
  -H "Content-Type: application/json" \
  -H "X-API-Key: invalid-key" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"userId": "test"}'
```

### 2. Test Rate Limiting

```bash
# Run multiple requests quickly
for i in {1..15}; do
  curl -X POST http://localhost:3001/api/linkedin/start \
    -H "Content-Type: application/json" \
    -H "X-API-Key: your-api-key" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d '{"userId": "test"}' &
done
```

## Next Steps

After successful local testing:

1. **Document Working Configuration**: Save all working API keys and settings
2. **Create Test Cases**: Document successful test scenarios
3. **Prepare for Deployment**: Update Railway environment variables
4. **Monitor Production**: Set up logging and monitoring

## Troubleshooting Checklist

- [ ] Backend server running on port 3001
- [ ] Frontend server running on port 3000
- [ ] PostgreSQL database accessible
- [ ] All environment variables set correctly
- [ ] Supabase authentication working
- [ ] Resume upload successful
- [ ] Browserbase connection established
- [ ] API endpoints responding
- [ ] WebSocket connections (if any) working
- [ ] Rate limiting functioning correctly

This completes the local testing setup. Follow these steps to ensure everything works before deploying to production.