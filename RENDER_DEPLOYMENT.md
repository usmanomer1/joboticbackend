# Render.com Deployment Guide for Jobotic Backend

## Prerequisites
- GitHub account with repository containing the backend code
- Render.com account (free tier available)
- Environment variables ready (API keys)

## Deployment Steps

### 1. Prepare Your Repository
Ensure these files exist in your repository root:
- ✅ `render.yaml` - Render configuration
- ✅ `package.json` - With Node.js engine >=18.0.0
- ✅ `.gitignore` - Excluding sensitive files
- ✅ `server.js` - With health check endpoint

### 2. Push to GitHub
```bash
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### 3. Deploy on Render

1. **Sign in to Render** at https://render.com

2. **Create New Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub account if not already connected
   - Select your `jobotic-backend` repository
   - Click "Connect"

3. **Configure Service**:
   - **Name**: jobotic-backend (or your preferred name)
   - **Region**: Choose closest to your users
   - **Branch**: main (or your default branch)
   - **Runtime**: Node
   - **Build Command**: `npm install` (auto-detected from render.yaml)
   - **Start Command**: `npm start` (auto-detected from render.yaml)

4. **Choose Instance Type**:
   - Free tier: Good for testing (spins down after 15 min of inactivity)
   - Starter ($7/month): Always on, better for production

### 4. Add Environment Variables

In Render dashboard → Environment → Add the following:

```env
# Required API Keys
RAPIDAPI_KEY=your_rapidapi_key_here
GEMINI_API_KEY=your_gemini_api_key_here

# Application Settings
FRONTEND_URL=https://your-frontend-url.com
CACHE_TTL=7200

# Optional (Render sets these automatically)
NODE_ENV=production
PORT=10000
```

### 5. Deploy
- Click "Create Web Service"
- Render will automatically:
  - Clone your repository
  - Install dependencies
  - Build your application
  - Start the server
  - Set up HTTPS/SSL

### 6. Monitor Deployment
- Watch the build logs in real-time
- Check for any errors during installation
- Verify "Live" status when deployment completes

### 7. Get Your API URL
Your backend will be available at:
```
https://[your-service-name].onrender.com
```

### 8. Test Your Deployment

1. **Health Check**:
   ```bash
   curl https://[your-service-name].onrender.com/api/health
   ```

2. **Test API Endpoints**:
   ```bash
   # Test job search
   curl -X POST https://[your-service-name].onrender.com/api/jobs/search \
     -H "Content-Type: application/json" \
     -d '{"query": "software engineer", "location": "San Francisco"}'
   ```

## Post-Deployment Configuration

### Custom Domain (Optional)
1. Go to Settings → Custom Domains
2. Add your domain
3. Update DNS records as instructed

### Auto-Deploy
- Render automatically deploys on every push to your main branch
- Disable in Settings → Build & Deploy if not desired

### Scaling
- Upgrade instance type for better performance
- Add more instances for horizontal scaling

## Monitoring & Maintenance

### Logs
- Access via Dashboard → Logs
- Filter by timestamp, level, or search

### Metrics
- CPU and Memory usage available in dashboard
- Set up alerts for high usage

### Health Monitoring
- Render automatically monitors `/api/health`
- Service restarts if health checks fail

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check Node version matches package.json
   - Verify all dependencies are in package.json
   - Check build logs for specific errors

2. **Environment Variables**
   - Ensure all required vars are set
   - No quotes needed in Render's env var inputs
   - Restart service after adding variables

3. **Memory Issues**
   - Puppeteer may need more memory
   - Upgrade to paid tier if needed

4. **Free Tier Spin-down**
   - Service sleeps after 15 min inactivity
   - First request after sleep takes ~30 seconds
   - Use external monitoring to keep alive

## Cost Optimization

### Free Tier Limitations
- 750 hours/month (enough for 1 service 24/7)
- Spins down after 15 min inactivity
- Limited CPU/Memory

### Recommended Setup
- Development: Free tier
- Production: Starter ($7/month) or Standard

## Security Best Practices

1. **Never commit** `.env` files
2. **Use Render's environment variables** for secrets
3. **Enable** rate limiting (already configured)
4. **Monitor** logs for suspicious activity
5. **Keep** dependencies updated

## Useful Commands

```bash
# View recent logs
render logs --tail

# Restart service
render restart

# Update environment variable
render env:set KEY=value
```

## Support Resources

- Render Documentation: https://render.com/docs
- Render Community: https://community.render.com
- Render Status: https://status.render.com
- Your app logs: Dashboard → Logs

---

Last Updated: ${new Date().toISOString().split('T')[0]}