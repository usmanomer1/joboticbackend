#!/bin/bash

echo "Testing job search API for employer logos..."
echo ""

# Make API call and save response
curl -s -X POST http://localhost:3001/api/jobs/match \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "resumeText": "Software Engineer with 5 years experience",
    "jobTitle": "software engineer", 
    "location": "San Francisco"
  }' | jq '.data.jobs[0:3] | .[] | {employer_name, employer_logo, job_title}' 2>/dev/null || echo "Server not running or jq not installed"

echo ""
echo "If you see employer_logo fields above, the backend is working correctly."