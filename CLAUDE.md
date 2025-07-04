Update CLAUDE.md with the following changes based on actual JSearch API endpoints:

1. In the API Endpoints section, add more detailed endpoints:

### Jobs
- POST /api/jobs/match - Search jobs and get AI match scores
- POST /api/jobs/search - Basic job search without matching
- GET /api/jobs/:jobId - Get detailed job information
- POST /api/jobs/salary-estimate - Get salary estimate for a position

2. Add a new section after "External Services" called "JSearch API Endpoints Used":

### JSearch API Endpoints Used
- **Search Jobs**: GET /search - Search across 20+ job boards
  - Parameters: query, page, num_pages, date_posted, remote_jobs_only, employment_types, job_requirements
- **Job Details**: GET /job-details - Get complete job information
  - Parameters: job_id, country
- **Salary Estimate**: GET /estimated-salary - Get salary data
  - Parameters: job_title, location, location_type
- **Company Salary**: GET /company-job-salary - Get company-specific salary data
  - Parameters: company, job_title, location_type

3. Update the "Data Flow" section to be more specific:

## Data Flow
1. Client sends resume + search preferences (job title, location, filters)
2. Backend constructs search query and calls JSearch API (with caching)
3. Enriches results with salary data when available
4. AI service scores each job against resume (in batches of 10)
5. Results sorted by match score with match reasons
6. Client can request resume optimization for specific job
7. Optimized resume generated with tracked changes
8. PDF/DOCX created with optimization metadata

4. Add a new section "API Request/Response Examples" before "Development Guidelines":

## API Request/Response Examples

### Job Search Request
POST /api/jobs/search
{
  "query": "software engineer Chicago", // OR use jobTitle + location
  "jobTitle": "software engineer",
  "location": "Chicago, IL",
  "datePosted": "week",
  "remote": false,
  "employmentTypes": ["FULLTIME"],
  "page": 1
}

### Job Match Response
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

