# Railway Deployment Guide

## Why Railway?

Railway provides:
- ✅ Native Puppeteer/Chromium support
- ✅ Zero-config deployment
- ✅ Automatic SSL certificates
- ✅ Built-in environment variable management
- ✅ GitHub integration
- ✅ Better pricing than Vercel for backends

## Quick Deploy

### Option 1: Using the Setup Script (Recommended)

```bash
./setup-railway.sh
```

This script will:
1. Install Railway CLI
2. Login to Railway
3. Initialize project
4. Set all environment variables
5. Deploy your app

### Option 2: Manual Setup

1. **Install Railway CLI**:
```bash
npm install -g @railway/cli
```

2. **Login**:
```bash
railway login
```

3. **Initialize project**:
```bash
railway init
```

4. **Set environment variables**:
```bash
# Core
railway variables set NODE_ENV=production
railway variables set PORT=3001

# API Keys
railway variables set GEMINI_API_KEY=AIzaSyA1n7udLvDC6HdGbxg4pY6DaUWTeLzZ5kY
railway variables set RAPIDAPI_KEY=84cf68dc5bmsh8b9b02bc2466c18p15c6f9jsnbd07e9617777
railway variables set API_KEY=9f754142ac82d571e1cb8ed3c85d4f1d9a141f9345728fe382e611c3832d770c

# Frontend
railway variables set FRONTEND_URL=https://portal.jobotic.ai

# Supabase
railway variables set SUPABASE_URL=https://fwtazrqqrtqmcsdzzdmi.supabase.co
railway variables set SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3dGF6cnFxcnRxbWNzZHp6ZG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2MzEwNjQsImV4cCI6MjA2NzIwNzA2NH0.ks-Jta2Zx3ZfjU_69nG5auJczJCPVRCpcGAIdY_2_88

# Puppeteer
railway variables set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
railway variables set PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Cache
railway variables set CACHE_TTL=7200
```

5. **Deploy**:
```bash
railway up
```

## Post-Deployment

1. **Get your URL**:
   - Railway will provide: `https://your-app.railway.app`

2. **Update Frontend**:
   - Change API URL from Vercel to Railway URL

3. **Monitor**:
   ```bash
   railway logs
   ```

4. **Open dashboard**:
   ```bash
   railway open
   ```

## GitHub Integration (Optional)

1. Connect GitHub in Railway dashboard
2. Enable automatic deploys on push to main
3. Railway will deploy on every commit

## Costs

- **Hobby Plan**: $5/month (includes $5 usage)
- **Usage**: ~$0.000463/GB RAM/hour
- **Estimate**: Backend should cost $5-10/month

## Troubleshooting

### Puppeteer Issues
The `nixpacks.toml` file ensures Chromium is installed. If PDFs fail:
```bash
railway logs -n 100
```

### Environment Variables
View all variables:
```bash
railway variables
```

### Redeploy
```bash
railway up
```

### Connect Custom Domain
```bash
railway domain
```

## Files Created for Railway

1. `railway.json` - Deployment configuration
2. `nixpacks.toml` - Build configuration with Chromium
3. `setup-railway.sh` - Automated setup script

## Next Steps

1. Run `./setup-railway.sh`
2. Update your frontend to use the new Railway URL
3. Test PDF generation
4. Monitor logs for any issues

Railway is production-ready and handles Puppeteer much better than Vercel!