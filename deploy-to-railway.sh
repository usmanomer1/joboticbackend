#!/bin/bash

echo "🚀 Direct deployment to Railway..."

# Since you already have a service created with environment variables set,
# you just need to push the code directly to Railway

echo "📦 Deploying code to Railway..."
echo "Run these commands manually in your terminal:"
echo ""
echo "1. First, link to your existing Railway service:"
echo "   railway link"
echo "   (Select your project and service when prompted)"
echo ""
echo "2. Then deploy your code:"
echo "   railway up"
echo ""
echo "Railway will use the Dockerfile we created to build and deploy your app."
echo "The Dockerfile includes Chromium for Puppeteer support."
echo ""
echo "3. Monitor the deployment:"
echo "   railway logs"
echo ""
echo "4. Get your app URL:"
echo "   railway status"