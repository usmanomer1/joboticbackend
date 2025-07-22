# LinkedIn Automation Controller

This controller provides a REST API that matches Browser Use's interface exactly for seamless frontend compatibility. It handles LinkedIn job search automation with proper authentication, rate limiting, and error handling.

## Features

### 1. **Browser Use Compatible API**
- Response format matches Browser Use exactly
- Same endpoint structure and naming
- Compatible error responses
- Maintains taskId mapping

### 2. **Security Features**
- Supabase JWT authentication
- User session ownership verification
- Rate limiting (10 requests/hour per user)
- API call logging

### 3. **File Upload Support**
- Resume upload with validation
- File type restrictions (PDF, DOC, DOCX)
- 5MB size limit
- Supabase Storage integration

## API Endpoints

### Authentication
All endpoints require a valid Supabase JWT token in the Authorization header:
```
Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN
```

### 1. Start Automation
```http
POST /api/automation/linkedin/start
```

**Request Body:**
```json
{
  "userId": "uuid",
  "config": {
    "jobTitle": "Software Engineer",
    "location": "San Francisco, CA",
    "experience": ["MID_LEVEL", "SENIOR_LEVEL"],
    "filters": {
      "datePosted": "week",
      "jobType": ["FULL_TIME"],
      "remote": true,
      "easyApplyOnly": true,
      "keywords": ["typescript", "react"]
    },
    "resumeUrl": "https://example.com/resume.pdf",
    "maxApplications": 20
  }
}
```

**Response:**
```json
{
  "sessionId": "session_uuid",
  "liveViewUrl": "https://browserbase.com/debug/...",
  "status": "running",
  "taskId": "task_uuid"
}
```

### 2. Get Status
```http
GET /api/automation/linkedin/status/:sessionId
```

**Response:**
```json
{
  "status": "running",
  "progress": {
    "totalJobs": 50,
    "processedJobs": 10,
    "appliedJobs": 7,
    "skippedJobs": 3,
    "failedJobs": 0,
    "currentPage": 2
  },
  "currentStep": "processing_jobs_2",
  "interventionRequired": {
    "type": "LOGIN",
    "message": "LinkedIn login required",
    "debugUrl": "https://browserbase.com/debug/..."
  },
  "liveViewUrl": "https://browserbase.com/debug/..."
}
```

### 3. Pause Automation
```http
PUT /api/automation/linkedin/pause/:sessionId
```

**Response:**
```json
{
  "success": true,
  "status": "paused"
}
```

### 4. Resume Automation
```http
PUT /api/automation/linkedin/resume/:sessionId
```

**Response:**
```json
{
  "success": true,
  "status": "running"
}
```

### 5. Stop Automation
```http
DELETE /api/automation/linkedin/stop/:sessionId
```

**Response:**
```json
{
  "success": true,
  "status": "stopped"
}
```

### 6. Continue After Intervention
```http
POST /api/automation/linkedin/continue/:sessionId
```

**Request Body:**
```json
{
  "interventionCompleted": true
}
```

**Response:**
```json
{
  "success": true,
  "status": "running"
}
```

### 7. Upload Resume
```http
POST /api/automation/linkedin/upload
```

**Request:** Multipart form data with file field

**Response:**
```json
{
  "fileUrl": "https://supabase.storage.url/resume.pdf",
  "fileId": "resume_userId_timestamp"
}
```

## Error Responses

All errors follow Browser Use format:

```json
{
  "error": "Error Type",
  "message": "Human readable message",
  "details": "Additional error details"
}
```

Common errors:
- `401 Unauthorized` - Missing or invalid auth token
- `403 Forbidden` - User doesn't own the session
- `404 Not Found` - Session not found
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

## Configuration

### Environment Variables
```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
BROWSERBASE_API_KEY=your_browserbase_api_key
```

### Rate Limiting
- Default: 10 requests per hour per user
- Configurable in the controller
- Uses in-memory storage (use Redis in production)

### File Upload
- Max size: 5MB
- Allowed types: PDF, DOC, DOCX
- Storage: Supabase Storage bucket named 'resumes'

## Integration Example

```typescript
import express from 'express';
import linkedinAutomationRoutes from './routes/linkedinAutomation.routes';

const app = express();

// Middleware
app.use(express.json());

// Mount routes
app.use('/api/automation/linkedin', linkedinAutomationRoutes);

// Start server
app.listen(3000);
```

## Frontend Integration

### Starting Automation
```javascript
const startAutomation = async (config) => {
  const response = await fetch('/api/automation/linkedin/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      userId: currentUser.id,
      config
    })
  });
  
  const data = await response.json();
  return data;
};
```

### Polling for Status
```javascript
const pollStatus = async (sessionId) => {
  const interval = setInterval(async () => {
    const response = await fetch(`/api/automation/linkedin/status/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });
    
    const status = await response.json();
    updateUI(status);
    
    if (status.interventionRequired) {
      showInterventionModal(status.interventionRequired);
    }
    
    if (['completed', 'failed', 'stopped'].includes(status.status)) {
      clearInterval(interval);
    }
  }, 5000);
};
```

## Security Best Practices

1. **Always verify user ownership** before any session operation
2. **Use environment variables** for sensitive configuration
3. **Implement proper rate limiting** in production (Redis)
4. **Validate all inputs** with Zod schemas
5. **Log all API calls** for auditing
6. **Use HTTPS** in production
7. **Sanitize file uploads** before storage

## Database Schema

### API Logs Table
```sql
CREATE TABLE api_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  request_body JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

## Testing

### Unit Tests
```typescript
describe('LinkedInAutomationController', () => {
  it('should require authentication', async () => {
    const response = await request(app)
      .post('/api/automation/linkedin/start')
      .send({ userId: 'test', config: {} });
    
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Unauthorized');
  });
  
  it('should validate request body', async () => {
    const response = await request(app)
      .post('/api/automation/linkedin/start')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ userId: 'test' }); // Missing config
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Bad Request');
  });
});
```

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check JWT token is valid
   - Ensure Authorization header format is correct

2. **403 Forbidden**
   - User doesn't own the session
   - Check userId matches authenticated user

3. **429 Rate Limit**
   - User exceeded 10 requests/hour
   - Wait for rate limit reset

4. **File Upload Fails**
   - Check file size (<5MB)
   - Verify file type (PDF/DOC/DOCX)
   - Ensure Supabase Storage bucket exists

## Performance Considerations

1. **Use caching** for frequently accessed data
2. **Implement Redis** for rate limiting in production
3. **Use database indexes** on user_id and session_id
4. **Implement request queuing** for heavy loads
5. **Monitor API response times**

## Future Enhancements

1. **WebSocket support** for real-time updates
2. **Batch operations** for multiple sessions
3. **Advanced filtering** and search
4. **Analytics dashboard** for success rates
5. **Webhook notifications** for events