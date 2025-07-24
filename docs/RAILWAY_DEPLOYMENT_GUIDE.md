# Railway Deployment Guide for Jobotic LinkedIn Automation Backend

This guide will walk you through deploying the Jobotic LinkedIn automation backend to Railway.

## Prerequisites

1. Railway account (sign up at https://railway.app)
2. All required API keys:
   - **BROWSERBASE_API_KEY**: Get from https://browserbase.com
   - **BROWSERBASE_PROJECT_ID**: From your Browserbase dashboard
   - **SUPABASE_URL**: Your Supabase project URL
   - **SUPABASE_ANON_KEY**: Your Supabase anonymous key
   - **SUPABASE_SERVICE_ROLE_KEY**: Your Supabase service role key
   - **RAPIDAPI_KEY**: For JSearch API access
   - **GEMINI_API_KEY**: For AI job matching
   - **API_KEY**: Your custom API key for authentication

## Step 1: Prepare Your Project

1. Ensure all changes are committed to your GitHub repository:
```bash
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

## Step 2: Deploy to Railway

### Option A: Deploy from GitHub (Recommended)

1. Go to https://railway.app and sign in
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Railway will automatically detect it as a Node.js app

### Option B: Deploy using Railway CLI

1. Install Railway CLI:
```bash
npm install -g @railway/cli
```

2. Login to Railway:
```bash
railway login
```

3. Initialize and deploy:
```bash
railway init
railway up
```

## Step 3: Configure Environment Variables

In your Railway project dashboard:

1. Click on your service
2. Go to "Variables" tab
3. Add all required environment variables:

```bash
# Node Environment
NODE_ENV=production
PORT=3001

# Browserbase Configuration
BROWSERBASE_API_KEY=your-browserbase-api-key
BROWSERBASE_PROJECT_ID=your-browserbase-project-id

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# API Keys
RAPIDAPI_KEY=your-rapidapi-key
GEMINI_API_KEY=your-gemini-api-key
API_KEY=your-custom-api-key

# Frontend Configuration
FRONTEND_URL=https://your-frontend-domain.com

# Optional Settings
CACHE_TTL=7200
LOG_LEVEL=info
```

## Step 4: Set Up Redis (for session management)

1. In Railway dashboard, click "New Service"
2. Select "Redis"
3. Copy the Redis URL from the Redis service
4. Add to your main service environment variables:
```
REDIS_URL=redis://default:password@host:port
```

## Step 5: Configure Domains

1. In your service settings, go to "Domains"
2. Railway provides a free domain like `your-app.up.railway.app`
3. Or add a custom domain:
   - Add your domain in Railway
   - Update your DNS records as instructed

## Step 6: Verify Deployment

1. Check deployment logs in Railway dashboard
2. Test the health endpoint:
```bash
curl https://your-app.up.railway.app/api/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": 1234567890,
    "environment": "production"
  }
}
```

## Step 7: Test LinkedIn Automation Endpoints

### Start Automation Session

#### Natural Language Search (Recommended)
```bash
curl -X POST https://your-app.up.railway.app/api/linkedin/start \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer user-jwt-token" \
  -d '{
    "userId": "user-uuid",
    "searchPrompt": "Software engineering jobs in San Francisco with React experience, posted this week",
    "resumeUrl": "https://your-supabase.supabase.co/storage/v1/object/public/resumes/user-resume.pdf",
    "resumeMetadata": {
      "fileName": "john-doe-resume.pdf",
      "fileType": "application/pdf"
    },
    "config": {
      "maxApplications": 20,
      "externalApplicationConfig": {
        "pauseOnAccountCreation": true,
        "defaultEmail": "user@example.com"
      }
    }
  }'
```

#### Traditional Search (Alternative)
```bash
curl -X POST https://your-app.up.railway.app/api/linkedin/start \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer user-jwt-token" \
  -d '{
    "userId": "user-uuid",
    "config": {
      "jobTitle": "Software Engineer",
      "location": "San Francisco, CA",
      "experienceLevel": ["ENTRY_LEVEL", "MID_LEVEL"],
      "filters": {
        "datePosted": "week",
        "remote": true,
        "easyApplyOnly": false
      },
      "maxApplications": 10,
      "externalApplicationConfig": {
        "autoCreateAccount": false,
        "pauseOnAccountCreation": true
      }
    },
    "resumeUrl": "https://your-supabase.supabase.co/storage/v1/object/public/resumes/user-resume.pdf"
  }'
```

### Check Session Status
```bash
curl https://your-app.up.railway.app/api/linkedin/status/{sessionId} \
  -H "X-API-Key: your-api-key"
```

## API Endpoints for Frontend Integration

Your frontend developer can use these endpoints:

### LinkedIn Automation Endpoints

- **POST** `/api/linkedin/start` - Start new automation session
  - Supports natural language job search: `"searchPrompt": "Software engineering jobs in Vancouver, BC"`
  - Supports resume upload from Supabase Storage
  - Handles both Easy Apply and external applications
- **GET** `/api/linkedin/status/:sessionId` - Get session status
- **PUT** `/api/linkedin/pause/:sessionId` - Pause automation
- **PUT** `/api/linkedin/resume/:sessionId` - Resume automation
- **DELETE** `/api/linkedin/stop/:sessionId` - Stop automation
- **POST** `/api/linkedin/continue/:sessionId` - Continue after intervention
- **POST** `/api/linkedin/upload` - Upload files for application

### New Features

1. **Natural Language Job Search**
   - Simply pass a `searchPrompt` instead of structured search criteria
   - Example: "Remote React developer jobs posted this week"

2. **External Application Support**
   - Automatically opens external job applications in new tabs
   - Supports account creation detection
   - Configuration options:
     - `autoCreateAccount`: Auto-create accounts with provided credentials
     - `pauseOnAccountCreation`: Pause for user to handle account creation
     - `defaultEmail` and `defaultPassword`: For auto-account creation

3. **Resume Handling**
   - Pass `resumeUrl` from Supabase Storage
   - Automatic resume upload to job application forms
   - Works with both Easy Apply and external applications

4. **Comprehensive Job Details Extraction**
   - Extracts and saves detailed job information
   - Includes salary, requirements, benefits, and more
   - Stored in `job_details` table for analysis

### Job Search Endpoints (existing)

- **POST** `/api/jobs/match` - Search jobs with AI matching
- **POST** `/api/jobs/search` - Basic job search
- **GET** `/api/jobs/:jobId` - Get job details
- **POST** `/api/jobs/salary-estimate` - Get salary estimate
- **GET** `/api/jobs/trending` - Get trending searches

## Monitoring & Maintenance

### View Logs
- Real-time logs available in Railway dashboard
- Filter by service to see specific logs

### Monitor Usage
- Railway shows CPU, memory, and network usage
- Set up alerts for high usage

### Scaling
- Railway automatically handles scaling
- Upgrade plan for more resources if needed

## Troubleshooting

### Common Issues

1. **TypeScript errors on deployment**
   - Ensure `ts-node` is in dependencies (not devDependencies)
   - Check that all TypeScript files compile locally

2. **Environment variables not loading**
   - Verify all variables are set in Railway dashboard
   - Check for typos in variable names

3. **Redis connection issues**
   - Ensure Redis service is running
   - Verify REDIS_URL is correctly formatted

4. **Browserbase connection errors**
   - Verify API key and project ID are correct
   - Check Browserbase service status

## Security Considerations

1. **API Authentication**: All endpoints require `X-API-Key` header
2. **Rate Limiting**: Configured for all endpoints
3. **CORS**: Only allows requests from configured frontend URL
4. **Data Encryption**: Sensitive data encrypted in transit and at rest

## Support

- Railway Documentation: https://docs.railway.app
- Browserbase Documentation: https://docs.browserbase.com
- Supabase Documentation: https://supabase.com/docs

## Next Steps

1. Share the API documentation with your frontend developer
2. Set up monitoring and alerts
3. Configure backup strategies for your database
4. Implement logging aggregation for better debugging