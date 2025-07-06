#!/bin/bash

echo "🚀 Setting up Railway deployment for Jobotic Backend..."

# Install Railway CLI if not already installed
if ! command -v railway &> /dev/null; then
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Login to Railway
echo "🔐 Please login to Railway..."
railway login --browserless

# Initialize Railway project
echo "🏗️  Initializing Railway project..."
railway init

# Set environment variables
echo "⚙️  Setting environment variables..."

# Core environment variables
railway variables set NODE_ENV=production
railway variables set PORT=3001

# API Keys (using the values from Vercel)
railway variables set GEMINI_API_KEY=AIzaSyA1n7udLvDC6HdGbxg4pY6DaUWTeLzZ5kY
railway variables set RAPIDAPI_KEY=84cf68dc5bmsh8b9b02bc2466c18p15c6f9jsnbd07e9617777
railway variables set API_KEY=9f754142ac82d571e1cb8ed3c85d4f1d9a141f9345728fe382e611c3832d770c

# Frontend URL - update this after you know your Railway URL
railway variables set FRONTEND_URL=https://portal.jobotic.ai

# Supabase configuration
railway variables set SUPABASE_URL=https://fwtazrqqrtqmcsdzzdmi.supabase.co
railway variables set SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3dGF6cnFxcnRxbWNzZHp6ZG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE2MzEwNjQsImV4cCI6MjA2NzIwNzA2NH0.ks-Jta2Zx3ZfjU_69nG5auJczJCPVRCpcGAIdY_2_88

# Puppeteer configuration
railway variables set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
railway variables set PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Cache configuration
railway variables set CACHE_TTL=7200

echo "✅ Environment variables set!"

# Deploy
echo "🚀 Deploying to Railway..."
railway up

echo "
✅ Deployment initiated!

Next steps:
1. Railway will provide you with a URL (e.g., jobotic-backend.railway.app)
2. Update your frontend to use this new backend URL
3. Update CORS settings if needed
4. Monitor logs with: railway logs

Useful commands:
- View logs: railway logs
- Open dashboard: railway open
- Redeploy: railway up
- Add more env vars: railway variables set KEY=value
"