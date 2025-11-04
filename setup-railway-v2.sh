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

# Create environment variables file
echo "⚙️  Creating environment variables file..."
cat > .env.railway << 'EOF'
NODE_ENV=production
PORT=3001

# API Keys
GEMINI_API_KEY=your_gemini_api_key_here
RAPIDAPI_KEY=your_rapidapi_key_here
API_KEY=your_backend_api_key_here

# Frontend
FRONTEND_URL=https://portal.jobotic.ai

# Supabase
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Puppeteer
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Cache
CACHE_TTL=7200
EOF

# Import environment variables from file
echo "📥 Importing environment variables to Railway..."
railway variables set < .env.railway

# Clean up
rm .env.railway

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
- View variables: railway variables
"