# Deployment Checklist for Jobotic Backend

## Pre-Deployment Setup ✅

### 1. Environment Configuration
- [x] Create `.gitignore` file with proper exclusions
- [x] Add Node.js engine requirement (`>=18.0.0`) to `package.json`
- [x] Ensure `start` script exists in `package.json`
- [x] Create `railway.json` configuration file
- [x] Update `server.js` for production environment
  - [x] Use `process.env.PORT || 3001`
  - [x] Add production trust proxy setting
  - [x] CORS configured to use environment variable

### 2. Environment Variables Required
Configure these in your deployment platform (Railway/Render/etc.):

```env
# API Keys (Required)
RAPIDAPI_KEY=your_rapidapi_key
GEMINI_API_KEY=your_gemini_api_key

# Application Settings
NODE_ENV=production
PORT=3001  # Railway/Render will override this
FRONTEND_URL=https://your-frontend-domain.com

# Optional Settings
CACHE_TTL=7200  # Cache time in seconds (default: 2 hours)
JSEARCH_HOST=jsearch.p.rapidapi.com  # Default JSearch host
```

### 3. Deployment Steps

#### Using Railway:
1. Push code to GitHub repository
2. Connect Railway to your GitHub repo
3. Railway will auto-detect Node.js and use `railway.json`
4. Add environment variables in Railway dashboard
5. Deploy and check logs

#### Using Render:
1. Push code to GitHub repository
2. Create new Web Service on Render
3. Connect to your GitHub repo
4. Set build command: `npm install`
5. Set start command: `npm start`
6. Add environment variables
7. Deploy

#### Using Heroku:
1. Create `Procfile` with: `web: node server.js`
2. Push to Heroku: `git push heroku main`
3. Set environment variables: `heroku config:set KEY=value`
4. Scale dynos: `heroku ps:scale web=1`

### 4. Post-Deployment Verification

- [ ] Check health endpoint: `GET /api/health`
- [ ] Verify CORS is working with frontend
- [ ] Test job search endpoint: `POST /api/jobs/search`
- [ ] Test resume optimization: `POST /api/resume/optimize`
- [ ] Monitor logs for any errors
- [ ] Check rate limiting is functioning
- [ ] Verify file downloads work properly

### 5. Security Checklist

- [x] Environment variables not hardcoded
- [x] Rate limiting configured
- [x] CORS properly configured
- [x] Input validation on all endpoints
- [x] Error messages don't expose sensitive info
- [ ] SSL/TLS enabled (handled by deployment platform)
- [ ] Monitor for suspicious activity

### 6. Performance Optimization

- [x] Caching implemented for API calls
- [x] Response size limits configured
- [x] Cleanup jobs for temporary files
- [ ] Consider CDN for static assets (if any)
- [ ] Monitor memory usage and adjust if needed

### 7. Monitoring Setup

Recommended monitoring:
- Application logs (built into deployment platform)
- Uptime monitoring (e.g., UptimeRobot)
- Error tracking (e.g., Sentry - optional)
- Performance monitoring (deployment platform metrics)

### 8. Backup and Recovery

- [ ] GitHub repository as code backup
- [ ] Document environment variables securely
- [ ] Test rollback procedure on deployment platform
- [ ] Keep local `.env.example` updated

## Common Issues and Solutions

### Port Issues
- Railway/Render automatically assigns PORT
- Don't hardcode port numbers

### Memory Issues
- Puppeteer may need more memory
- Increase dyno/instance size if needed

### Timeout Issues
- Long-running PDF generation may timeout
- Consider background job processing for large files

### CORS Issues
- Ensure `FRONTEND_URL` matches exactly
- Include protocol (https://) in URL
- Check for trailing slashes

## Emergency Contacts

- Deployment platform support
- GitHub repository issues
- Team communication channel

---

Last Updated: ${new Date().toISOString().split('T')[0]}