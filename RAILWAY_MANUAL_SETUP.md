# Railway Manual Setup Guide

Since the automated script encountered some interactive prompts, here's how to complete the Railway deployment manually:

## 1. Open Railway Dashboard

Visit https://railway.app and log in to your account.

## 2. Connect Your Service

In your Railway project dashboard:
1. Click on your project "jobotic-backend"
2. Click "New Service" → "GitHub Repo" or "Empty Service"
3. If using GitHub, connect your repository

## 3. Set Environment Variables

In the service settings, add these environment variables:

```
NODE_ENV=production
PORT=3001
GEMINI_API_KEY=your_gemini_api_key_here
RAPIDAPI_KEY=your_rapidapi_key_here
API_KEY=your_backend_api_key_here
FRONTEND_URL=https://portal.jobotic.ai
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
CACHE_TTL=7200
```

## 4. Deploy Using Dockerfile

Railway will automatically detect and use the Dockerfile we created. The deployment should:
1. Install Alpine Linux with Chromium
2. Install Node.js dependencies
3. Start the server

## 5. Monitor Deployment

1. Watch the build logs in Railway dashboard
2. Once deployed, Railway will provide a URL like: `jobotic-backend-production.up.railway.app`

## 6. Update Frontend

Update your frontend to use the new Railway backend URL instead of the Vercel URL.

## 7. Test the Deployment

Test critical endpoints:
- Health check: `https://your-app.railway.app/api/health`
- Resume parsing with PDF generation
- Job matching functionality

## Troubleshooting

If Puppeteer fails:
1. Check logs for Chromium path errors
2. The Dockerfile should handle Chromium installation
3. Environment variable `PUPPETEER_EXECUTABLE_PATH` points to Alpine's Chromium

## Alternative: Use Railway CLI Later

Once the service is created via dashboard, you can use CLI:

```bash
# Link to existing service
railway link

# Then deploy updates
railway up

# View logs
railway logs

# Manage variables
railway variables
```

## Files Created for Deployment

1. **nixpacks.toml** - Simplified to just include Chromium
2. **Dockerfile** - Alpine-based image with Chromium pre-installed
3. **Updated pdfGenerator.js** - Handles multiple Chromium paths
4. **setup-railway-v2.sh** - Automated script (requires manual completion)

The deployment is configured to work with Railway's infrastructure and includes all necessary dependencies for Puppeteer-based PDF generation.