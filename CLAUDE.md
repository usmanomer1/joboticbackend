# Jobotic Backend - AI Assistant Instructions

This is a focused job search and matching backend service. It provides job search functionality through JSearch API integration and AI-powered job matching using Google Gemini.

Important: you are never supposed to run the development server with npm run dev. 

## Core Functionality

This service focuses exclusively on:
- Job search across multiple job boards
- AI-powered job-to-resume matching
- Salary estimation
- Job details retrieval

**Note**: Resume generation and editing functionality has been moved to a separate Python service.

## API Endpoints

### Jobs
- `POST /api/jobs/match` - Search jobs and get AI match scores
- `POST /api/jobs/search` - Basic job search without matching
- `GET /api/jobs/:jobId` - Get detailed job information
- `POST /api/jobs/salary-estimate` - Get salary estimate for a position
- `GET /api/jobs/trending` - Get trending job searches

## JSearch API Endpoints Used

- **Search Jobs**: GET /search - Search across 20+ job boards
  - Parameters: query, page, num_pages, date_posted, remote_jobs_only, employment_types, job_requirements
- **Job Details**: GET /job-details - Get complete job information
  - Parameters: job_id, country
- **Salary Estimate**: GET /estimated-salary - Get salary data
  - Parameters: job_title, location, location_type
- **Company Salary**: GET /company-job-salary - Get company-specific salary data
  - Parameters: company, job_title, location_type

## Data Flow

1. Client sends search preferences (job title, location, filters) + resume text
2. Backend constructs search query and calls JSearch API (with caching)
3. Enriches results with salary data when available
4. AI service scores each job against resume (in batches of 10)
5. Results sorted by match score with match reasons
6. Returns matched jobs with scores and missing skills

## API Request/Response Examples

### Job Search Request
```json
POST /api/jobs/search
{
  "query": "software engineer Chicago",
  "jobTitle": "software engineer",
  "location": "Chicago, IL",
  "datePosted": "week",
  "remote": false,
  "employmentTypes": ["FULLTIME"],
  "page": 1
}
```

### Job Match Request
```json
POST /api/jobs/match
{
  "resumeText": "Full resume text here...",
  "jobTitle": "software engineer",
  "location": "Chicago, IL",
  "datePosted": "week",
  "limit": 10
}
```

### Job Match Response
```json
{
  "success": true,
  "data": {
    "jobs": [{
      "job_id": "xyz123",
      "employer_name": "Tech Corp",
      "job_title": "Senior Software Engineer",
      "job_apply_link": "https://...",
      "match_score": 85,
      "match_label": "STRONG MATCH",
      "match_reasons": ["5+ years experience matches", "Python skills align"],
      "missing_skills": ["Kubernetes", "AWS"],
      // ... other JSearch fields
    }],
    "totalFound": 45,
    "currentPage": 1
  }
}
```

## Caching Strategy

- Job search results: Cached for 2 hours (configurable via CACHE_TTL)
- Job details: Cached for 24 hours
- Salary estimates: Cached for 7 days

## Rate Limiting

- General endpoints: 100 requests per 15 minutes
- AI matching endpoints: 20 requests per 15 minutes

## Environment Variables

Required:
- `RAPIDAPI_KEY` - For JSearch API access
- `GEMINI_API_KEY` - For AI matching
- `API_KEY` - For API authentication

Optional:
- `PORT` - Server port (default: 3001)
- `CACHE_TTL` - Cache duration in seconds (default: 7200)
- `NODE_ENV` - Environment mode
- `FRONTEND_URL` - Allowed frontend origin

## Development Guidelines

1. All job data comes from JSearch API - do not store job data locally
2. Use caching to minimize API calls and costs
3. Batch AI requests when possible (current batch size: 10)
4. Always return match scores and reasons for transparency
5. Handle API errors gracefully with fallbacks

## Error Handling

- JSearch API errors: Return cached results if available
- AI service errors: Return jobs without match scores
- Rate limit errors: Return 429 with retry-after header

## Testing

Test the API with:
```bash
curl -X POST http://localhost:3001/api/jobs/search \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "software engineer",
    "location": "San Francisco, CA",
    "limit": 5
  }'
```