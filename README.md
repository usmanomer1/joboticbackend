# Jobotic Backend

AI-powered job matching platform backend that helps job seekers find perfect matches and optimize their resumes for specific positions.

## 🚀 Features

- **Job Search & Aggregation**: Search jobs from 20+ job boards via JSearch API
- **AI-Powered Matching**: Score job-resume compatibility using Google Gemini AI
- **Resume Analysis**: Detailed analysis of resume strengths and gaps
- **Resume Optimization**: AI-driven resume improvements for specific jobs
- **Document Generation**: Export optimized resumes as PDF or DOCX
- **Smart Caching**: Efficient caching to reduce API calls and improve performance

## 📋 Prerequisites

- Node.js 16+ and npm
- RapidAPI account for JSearch API access
- Google Cloud account for Gemini AI API
- MongoDB (optional, for future features)

## 🛠️ Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/jobotic-backend.git
cd jobotic-backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Copy the example environment file
cp .env.example .env
```

4. Add your actual API keys to `.env`:
```env
RAPIDAPI_KEY=your_rapidapi_key_here
GEMINI_API_KEY=your_google_gemini_api_key_here
PORT=3001
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
CACHE_TTL=7200
```

**⚠️ IMPORTANT: Never commit the `.env` file!** It contains sensitive API keys and should remain local to your machine.

## 🏃‍♂️ Running the Application

### Development Mode
```bash
npm run dev
```
This starts the server with nodemon for auto-reloading on changes.

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3001` (or the PORT specified in .env).

## 📚 API Documentation

### Base URL
```
http://localhost:3001/api
```

### Authentication
Currently, the API does not require authentication. In production, add API key authentication.

### Rate Limiting
- General endpoints: 100 requests per 15 minutes per IP
- AI endpoints: 10 requests per minute per IP

---

## 🔍 API Endpoints

### 1. Health Check

Check if the server is running and services are available.

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": 1705762800000,
    "environment": "development",
    "services": {
      "rapidapi": true,
      "gemini": true,
      "port": 3001
    }
  }
}
```

**cURL Example:**
```bash
curl http://localhost:3001/api/health
```

---

### 2. Match Jobs with Resume (AI-Powered)

Search for jobs and get AI-generated match scores based on resume compatibility.

**Endpoint:** `POST /api/jobs/match`

**Headers:**
- `Content-Type: application/json`

**Request Body:**
```json
{
  "resumeText": "John Doe\nSoftware Engineer\n\nEXPERIENCE\nSenior Developer at TechCorp...",
  "preferences": {
    "jobTitle": "backend engineer",
    "location": "San Francisco, CA",
    "keywords": ["python", "aws", "microservices"],
    "datePosted": "week"
  },
  "page": 1,
  "remote_jobs_only": true,
  "employment_types": ["FULLTIME"],
  "job_requirements": ["more_than_3_years_experience"]
}
```

**Alternative Format (Legacy):**
```json
{
  "resume": "Resume content...",
  "jobTitle": "software engineer",
  "location": "Remote",
  "date_posted": "week",
  "remote_jobs_only": true
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "job_id": "xyz123abc",
        "employer_name": "TechCorp",
        "job_title": "Senior Backend Engineer",
        "job_description": "We are looking for...",
        "job_apply_link": "https://careers.techcorp.com/apply/xyz123",
        "job_is_remote": true,
        "job_city": "San Francisco",
        "job_state": "CA",
        "job_posted_at_datetime_utc": "2024-01-15T10:00:00Z",
        "job_employment_type": "FULLTIME",
        "job_required_skills": ["Python", "AWS", "Docker"],
        "job_min_salary": 150000,
        "job_max_salary": 200000,
        "match_score": 85,
        "match_label": "STRONG MATCH",
        "match_reasons": [
          "8+ years Python experience matches senior level requirement",
          "Strong AWS and cloud architecture background",
          "Previous experience with microservices"
        ],
        "missing_skills": ["Kubernetes", "Golang"],
        "key_strengths": ["Python expertise", "System design", "Team leadership"]
      }
    ],
    "totalFound": 45,
    "totalMatched": 20,
    "currentPage": 1,
    "totalPages": 2,
    "searchCriteria": {
      "query": "backend engineer San Francisco, CA",
      "jobTitle": "backend engineer",
      "location": "San Francisco, CA",
      "datePosted": "week",
      "remote": true
    },
    "timestamp": "2024-01-20T15:30:00Z"
  },
  "timing": {
    "total": 2500,
    "search": 800,
    "matching": "completed",
    "fromCache": false
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/jobs/match \
  -H "Content-Type: application/json" \
  -d '{
    "resumeText": "Your resume content here...",
    "preferences": {
      "jobTitle": "software engineer",
      "location": "San Francisco, CA"
    }
  }'
```

---

### 3. Search Jobs (Without AI Matching)

Search for jobs without AI matching scores.

**Endpoint:** `POST /api/jobs/search`

**Request Body:**
```json
{
  "jobTitle": "data scientist",
  "location": "New York, NY",
  "page": 1,
  "num_pages": 1,
  "date_posted": "3days",
  "remote_jobs_only": false,
  "employment_types": ["FULLTIME", "CONTRACTOR"],
  "job_requirements": ["no_degree"]
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "job_id": "abc456def",
        "employer_name": "DataCorp",
        "job_title": "Data Scientist",
        "job_description": "Join our data team...",
        "job_apply_link": "https://datacorp.com/careers/abc456",
        "job_is_remote": false,
        "job_city": "New York",
        "job_state": "NY",
        "job_employment_type": "FULLTIME",
        "job_required_skills": ["Python", "SQL", "Machine Learning"]
      }
    ],
    "totalFound": 125,
    "currentPage": 1,
    "totalPages": 13,
    "query": "data scientist New York, NY",
    "filters": {
      "datePosted": "3days",
      "remote": false,
      "employmentTypes": ["FULLTIME", "CONTRACTOR"]
    }
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/jobs/search \
  -H "Content-Type: application/json" \
  -d '{
    "jobTitle": "frontend developer",
    "location": "Austin, TX",
    "remote_jobs_only": true
  }'
```

---

### 4. Analyze Resume

Get detailed analysis of how well a resume matches a specific job.

**Endpoint:** `POST /api/resume/analyze`

**Request Body:**
```json
{
  "resumeText": "Your complete resume text...",
  "jobId": "xyz123abc",
  "jobDescription": "We are seeking a Senior Software Engineer with 5+ years experience...",
  "jobTitle": "Senior Software Engineer",
  "employerName": "TechCorp"
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "analysis": {
      "currentScore": 6.5,
      "maxPossibleScore": 10,
      "matchPercentage": 65,
      "scoreBreakdown": {
        "skills": {
          "score": 3,
          "max": 4,
          "missing": ["Kubernetes", "GraphQL"],
          "present": ["Python", "AWS", "Docker"]
        },
        "experience": {
          "score": 2.5,
          "max": 3,
          "gaps": ["No team leadership experience", "Limited cloud architecture"],
          "strengths": ["5+ years development experience", "Strong backend skills"]
        },
        "keywords": {
          "score": 1,
          "max": 3,
          "missing": ["scalable", "microservices", "agile"],
          "present": ["software", "development", "engineer"]
        }
      },
      "criticalMissing": {
        "skills": ["Kubernetes", "GraphQL", "Redis"],
        "keywords": ["team leadership", "architecture", "scalable systems"],
        "experience": ["Leading development teams", "System design at scale"]
      },
      "improvements": {
        "immediate": "Add Kubernetes and Docker certifications to skills section",
        "summary": "Rewrite summary to emphasize leadership and architecture experience",
        "experience": "Quantify team size and project impact in previous roles",
        "skills": "Group skills by category and highlight cloud technologies first",
        "keywords": "Include 'scalable', 'microservices', and 'team lead' throughout"
      },
      "estimatedImprovement": 2.5,
      "improvementPotential": {
        "currentScore": 6.5,
        "potentialScore": 9,
        "achievability": "HIGH"
      },
      "quickWins": [
        {
          "type": "keywords",
          "action": "Add missing keywords to resume",
          "impact": "HIGH",
          "effort": "LOW"
        }
      ]
    },
    "jobInfo": {
      "jobId": "xyz123abc",
      "jobTitle": "Senior Software Engineer",
      "employerName": "TechCorp"
    }
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/resume/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "resumeText": "Your resume here...",
    "jobId": "job123",
    "jobDescription": "Job description...",
    "jobTitle": "Software Engineer"
  }'
```

---

### 5. Optimize Resume

Get an AI-optimized version of your resume tailored for a specific job.

**Endpoint:** `POST /api/resume/optimize`

**Request Body:**
```json
{
  "resumeText": "Current resume content...",
  "jobData": {
    "job_title": "Senior Backend Engineer",
    "job_description": "We need someone with Python, AWS, and Kubernetes...",
    "employer_name": "TechCorp",
    "job_required_skills": ["Python", "AWS", "Kubernetes", "Docker"]
  },
  "options": {
    "sections": {
      "summary": true,
      "skills": true,
      "experience": true
    },
    "addSkills": ["Kubernetes", "Docker"],
    "quickEdit": false
  }
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "optimizedResume": "John Doe\nSenior Software Engineer\n\nPROFESSIONAL SUMMARY\nAccomplished Senior Software Engineer with 8+ years building scalable cloud-native applications...",
    "changes": {
      "summary": {
        "before": "Experienced software engineer...",
        "after": "Accomplished Senior Software Engineer with 8+ years building scalable cloud-native applications...",
        "keywordsAdded": ["scalable", "cloud-native", "Python", "AWS"]
      },
      "skills": {
        "added": ["Kubernetes", "Docker", "Terraform"],
        "removed": ["PHP"],
        "reorganized": true,
        "categories": ["Cloud & DevOps", "Languages", "Frameworks"]
      },
      "experience": [
        {
          "position": "Senior Developer at TechCorp",
          "before": "Developed applications",
          "after": "Led development of microservices handling 1M+ requests/day, improving performance by 40%",
          "improvementType": "quantified"
        }
      ]
    },
    "scores": {
      "before": 6.5,
      "after": 9.0,
      "improvement": 2.5,
      "improvementPercentage": 38
    },
    "qualityReport": {
      "passed": true,
      "checks": {
        "skillsAdded": { "requested": 2, "added": 2, "allAdded": true },
        "readability": { "acceptable": true },
        "keywordDensity": { "ratio": 3.2, "acceptable": true }
      }
    }
  },
  "message": "Resume optimized successfully! Score improved from 6.5 to 9.0"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/resume/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "resumeText": "Your current resume...",
    "jobData": {
      "job_title": "Software Engineer",
      "job_description": "Looking for Python developer..."
    }
  }'
```

---

### 6. Generate Resume Document

Generate a PDF or DOCX file of your resume with optimization details.

**Endpoint:** `POST /api/resume/download`

**Request Body:**
```json
{
  "resumeText": "Optimized resume content...",
  "format": "pdf",
  "metadata": {
    "score": 8.5,
    "jobTitle": "Senior Software Engineer",
    "company": "TechCorp",
    "improvements": [
      "Added quantified achievements",
      "Included cloud architecture keywords",
      "Emphasized leadership experience"
    ],
    "changes": {
      "keywordsIntegrated": ["scalable", "microservices", "AWS"]
    }
  }
}
```

**Success Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "fileId": "550e8400-e29b-41d4-a716-446655440000",
    "filename": "resume_senior_software_engineer_techcorp_2024-01-20.pdf",
    "format": "pdf",
    "size": 125432,
    "downloadUrl": "/api/download/550e8400-e29b-41d4-a716-446655440000",
    "expiresIn": 3600,
    "expiresAt": "2024-01-20T16:30:00Z"
  },
  "message": "PDF document generated successfully"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3001/api/resume/download \
  -H "Content-Type: application/json" \
  -d '{
    "resumeText": "Your optimized resume...",
    "format": "pdf",
    "metadata": {
      "score": 8.5,
      "jobTitle": "Software Engineer"
    }
  }'
```

---

### 7. Download Generated File

Download a previously generated PDF or DOCX file.

**Endpoint:** `GET /api/download/:fileId`

**Parameters:**
- `fileId` (required): UUID of the generated file

**Success Response:** `200 OK`
- Returns file as binary data
- Headers:
  - `Content-Type`: `application/pdf` or `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `Content-Disposition`: `attachment; filename="resume_software_engineer_2024-01-20.pdf"`

**cURL Example:**
```bash
# Download file
curl -O -J http://localhost:3001/api/download/550e8400-e29b-41d4-a716-446655440000

# Or save with specific filename
curl http://localhost:3001/api/download/550e8400-e29b-41d4-a716-446655440000 \
  --output my-optimized-resume.pdf
```

---

## ❌ Error Responses

All endpoints return consistent error responses:

### Validation Error (400)
```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "resumeText": ["Resume must be at least 100 characters"],
    "jobTitle": ["Job title is required when query is not provided"]
  }
}
```

### Not Found Error (404)
```json
{
  "success": false,
  "error": "Resource not found",
  "details": {
    "resource": "job",
    "id": "invalid-job-id"
  }
}
```

### Rate Limit Error (429)
```json
{
  "success": false,
  "error": "Too many requests from this IP, please try again after 15 minutes",
  "details": {
    "retryAfter": "15 minutes",
    "limit": 100,
    "remaining": 0,
    "resetTime": "2024-01-20T16:00:00Z"
  }
}
```

### Server Error (500)
```json
{
  "success": false,
  "error": "Internal server error",
  "details": {
    "message": "An unexpected error occurred"
  }
}
```

---

## 🧪 Testing with cURL

### Quick Test Script
```bash
#!/bin/bash
# test-api.sh

BASE_URL="http://localhost:3001/api"

# Test health
echo "Testing health endpoint..."
curl -s $BASE_URL/health | jq '.'

# Test job search
echo -e "\n\nTesting job search..."
curl -s -X POST $BASE_URL/jobs/search \
  -H "Content-Type: application/json" \
  -d '{
    "jobTitle": "software engineer",
    "location": "San Francisco, CA"
  }' | jq '.'

# Add more tests...
```

---

## 📮 Postman Collection

### Import Instructions

1. Open Postman
2. Click "Import" → "Raw text"
3. Paste this collection:

```json
{
  "info": {
    "name": "Jobotic API",
    "description": "AI-powered job matching API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Health Check",
      "request": {
        "method": "GET",
        "header": [],
        "url": "{{baseUrl}}/health"
      }
    },
    {
      "name": "Match Jobs",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"resumeText\": \"Your resume here...\",\n  \"preferences\": {\n    \"jobTitle\": \"software engineer\",\n    \"location\": \"Remote\"\n  }\n}"
        },
        "url": "{{baseUrl}}/jobs/match"
      }
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3001/api",
      "type": "string"
    }
  ]
}
```

### Environment Variables
Create a Postman environment with:
- `baseUrl`: `http://localhost:3001/api`
- `resumeText`: Your test resume content
- `jobId`: A valid job ID for testing

---

## 🔗 Related Links

- [JSearch API Documentation](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch)
- [Google Gemini AI Documentation](https://ai.google.dev/docs)
- [Express.js Documentation](https://expressjs.com/)

## 🧪 Testing

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Run tests with coverage:
```bash
npm run test:coverage
```

### Test Structure
```
tests/
├── fixtures/        # Sample test data
├── setup.js        # Test configuration
├── health.test.js  # Health endpoint tests
└── *.test.js       # Other test files
```

## 📁 Project Structure

```
jobotic-backend/
├── src/
│   ├── routes/          # API endpoint definitions
│   ├── services/        # Business logic
│   ├── middleware/      # Express middleware
│   └── utils/          # Helper utilities
├── tests/              # Test files
├── temp/               # Temporary file storage
├── .env.example        # Environment variables template
├── server.js           # Main application entry
└── package.json        # Dependencies and scripts
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3001 |
| `NODE_ENV` | Environment (development/production) | development |
| `RAPIDAPI_KEY` | RapidAPI key for JSearch | Required |
| `GEMINI_API_KEY` | Google Gemini AI API key | Required |
| `FRONTEND_URL` | Frontend application URL | http://localhost:3000 |
| `CACHE_TTL` | Cache time-to-live in seconds | 7200 |

### Rate Limiting

- General endpoints: 100 requests per 15 minutes
- AI endpoints: 10 requests per minute
- Download endpoints: General rate limit applies

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the ISC License.

## 🆘 Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Find process using port 3001
   lsof -i :3001
   # Kill the process
   kill -9 <PID>
   ```

2. **API Key errors**
   - Ensure your `.env` file has valid API keys
   - Check API key permissions and quotas

3. **Memory issues with Puppeteer**
   - Increase Node.js memory: `NODE_OPTIONS="--max-old-space-size=4096" npm start`

### Debug Mode
Set `DEBUG=jobotic:*` environment variable for detailed logs:
```bash
DEBUG=jobotic:* npm run dev
```

## 📞 Support

For issues and questions:
- Create an issue on GitHub
- Check existing issues for solutions
- Review API documentation

---

Built with ❤️ using Node.js, Express, and AI