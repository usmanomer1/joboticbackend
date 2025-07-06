# Frontend API Guide - Complete Job Data Reference

## 🚨 IMPORTANT UPDATE
We've fixed the backend to send ALL JSearch API fields. Previously, we were stripping out 16+ important fields. Now you get everything!

## API Endpoint
```
POST https://jobotic-backend.vercel.app/api/jobs/match
```

## Request Format
```json
{
  "resumeText": "Full resume text here...",
  "jobTitle": "software engineer",
  "location": "San Francisco, CA",
  "datePosted": "week",  // Options: "today", "3days", "week", "month"
  "remote": false,
  "employmentTypes": ["FULLTIME"],
  "page": 1
}
```

## Response Format - ALL Available Fields

### Each job object now contains ALL of these fields:

```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        // === BASIC INFORMATION ===
        "job_id": "unique-job-id",
        "job_title": "Senior Software Engineer",
        "employer_name": "Tech Corp",
        "employer_logo": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9...", // ✅ NOW INCLUDED
        "employer_website": "https://techcorp.com", // ✅ NOW INCLUDED
        "employer_company_type": "Private", // ✅ NOW INCLUDED
        
        // === LOCATION ===
        "job_city": "San Francisco",
        "job_state": "CA", 
        "job_country": "US",
        "job_is_remote": false,
        "job_latitude": 37.7749, // ✅ NOW INCLUDED
        "job_longitude": -122.4194, // ✅ NOW INCLUDED
        "location_display": "San Francisco, CA",
        
        // === APPLICATION INFO ===
        "job_apply_link": "https://careers.techcorp.com/apply/12345",
        "job_apply_is_direct": true,
        "job_apply_quality_score": 0.85, // ✅ NOW INCLUDED (0-1, higher is better)
        "job_google_link": "https://www.google.com/search?...", // ✅ NOW INCLUDED
        "job_publisher": "LinkedIn", // ✅ NOW INCLUDED
        
        // === COMPENSATION ===
        "job_min_salary": 150000,
        "job_max_salary": 200000,
        "job_salary_currency": "USD",
        "job_salary_period": "YEAR",
        "job_benefits": [
          "Health insurance",
          "401k matching",
          "Unlimited PTO"
        ],
        "salary_estimate": null, // Our additional estimate if available
        
        // === REQUIREMENTS ===
        "job_required_experience": {
          "no_experience_required": false,
          "required_experience_in_months": 60,
          "experience_mentioned": true,
          "experience_preferred": false
        },
        "job_required_skills": ["Python", "AWS", "Docker"],
        "job_required_education": {
          "postgraduate_degree": false,
          "professional_certification": false,
          "high_school": false,
          "associates_degree": false,
          "bachelors_degree": true,
          "degree_mentioned": true,
          "degree_preferred": false,
          "professional_certification_mentioned": false
        },
        "job_experience_in_place_of_education": false, // ✅ NOW INCLUDED
        
        // === TIMING ===
        "job_posted_at_timestamp": 1234567890,
        "job_posted_at_datetime_utc": "2024-07-01T12:00:00.000Z",
        "job_offer_expiration_timestamp": 1235567890, // ✅ NOW INCLUDED
        "job_offer_expiration_datetime_utc": "2024-07-15T12:00:00.000Z", // ✅ NOW INCLUDED
        "posted_days_ago": 3,
        "application_deadline_days": 11, // ✅ NOW INCLUDED
        
        // === CLASSIFICATION ===
        "job_employment_type": "FULLTIME",
        "job_onet_soc": "15-1252", // ✅ NOW INCLUDED (O*NET code)
        "job_onet_job_zone": "4", // ✅ NOW INCLUDED (1-5 complexity)
        "job_job_title": "software engineer", // ✅ NOW INCLUDED (normalized)
        "job_posting_language": "en", // ✅ NOW INCLUDED
        
        // === CONTENT ===
        "job_description": "<p>Full HTML description...</p>",
        "job_description_clean": "Plain text description for AI...", // Added by us
        "job_highlights": { // ✅ NOW INCLUDED - STRUCTURED DATA!
          "Qualifications": [
            "5+ years of software development experience",
            "Strong knowledge of Python and cloud platforms",
            "Experience with microservices architecture"
          ],
          "Responsibilities": [
            "Design and implement scalable backend services",
            "Lead technical architecture decisions",
            "Mentor junior developers"
          ],
          "Benefits": [
            "Comprehensive health coverage",
            "401(k) with 6% company match",
            "Flexible work arrangements"
          ]
        },
        
        // === AI MATCHING RESULTS ===
        "match_score": 85,
        "match_label": "STRONG MATCH",
        "match_reasons": [
          "Your 6 years of Python experience exceeds their 5-year requirement",
          "You have extensive AWS experience matching their cloud platform needs",
          "Your microservices projects align with their architecture"
        ],
        "missing_skills": ["Kubernetes", "GraphQL"],
        "key_strengths": ["Python expertise", "Cloud architecture", "Team leadership"],
        "extracted_requirements": ["5+ years experience", "Python", "AWS", "Microservices"],
        "match_error": false
      }
    ],
    "totalFound": 145,
    "totalMatched": 20,
    "currentPage": 1,
    "totalPages": 8,
    "searchCriteria": {
      "query": "software engineer San Francisco, CA",
      "jobTitle": "software engineer",
      "location": "San Francisco, CA",
      "datePosted": "week",
      "remote": false
    }
  }
}
```

## 🆕 Previously Missing Fields Now Available

These fields were being stripped before but are NOW INCLUDED:

1. **`employer_logo`** - Company logo URLs
2. **`employer_website`** - Company website
3. **`employer_company_type`** - Private/Public/Non-profit
4. **`job_highlights`** - Structured qualifications, responsibilities, benefits
5. **`job_apply_quality_score`** - Application quality (0-1)
6. **`job_offer_expiration_timestamp`** - When job expires
7. **`job_offer_expiration_datetime_utc`** - Human-readable expiration
8. **`job_onet_soc`** - O*NET occupation code for career matching
9. **`job_onet_job_zone`** - Job complexity level (1-5)
10. **`job_experience_in_place_of_education`** - If experience can substitute degree
11. **`job_google_link`** - Google Jobs URL
12. **`job_publisher`** - Original job board
13. **`job_latitude`** & **`job_longitude`** - GPS coordinates
14. **`job_posting_language`** - Language code
15. **`job_job_title`** - Normalized job title
16. **`application_deadline_days`** - Days until deadline

## 💡 UI Enhancement Opportunities

With these new fields, you can now:

### 1. Show Company Logos
```jsx
<img 
  src={job.employer_logo || '/default-company-logo.png'} 
  alt={job.employer_name}
  onError={(e) => { e.target.src = '/default-company-logo.png' }}
/>
```

### 2. Display Application Quality
```jsx
{job.job_apply_quality_score > 0.7 && (
  <Badge color="green">Easy Apply ⭐</Badge>
)}
```

### 3. Show Job Expiration
```jsx
{job.application_deadline_days && (
  <Text color="red">Expires in {job.application_deadline_days} days</Text>
)}
```

### 4. Use Structured Highlights
```jsx
<div>
  <h4>Key Qualifications:</h4>
  <ul>
    {job.job_highlights?.Qualifications?.map(qual => (
      <li key={qual}>{qual}</li>
    ))}
  </ul>
</div>
```

### 5. Show Job Complexity
```jsx
<div>
  Job Level: {['Entry', 'Some Experience', 'Medium', 'Considerable', 'Extensive'][job.job_onet_job_zone - 1]}
</div>
```

## ✅ Gemini AI Integration

**ALL these fields are now sent to Gemini for analysis**, including:
- Full job highlights for better requirement matching
- O*NET codes for career progression analysis
- Expiration dates for urgency scoring
- Company type for culture fit analysis
- Application quality for recommendation prioritization

The AI now has access to:
- Structured qualifications from `job_highlights`
- Career complexity from `job_onet_job_zone`
- Full compensation details
- Complete requirement objects
- Application metadata

This results in:
- More accurate match scores
- Better skill gap analysis
- Detailed match reasoning
- Career progression insights

## 🔧 Error Handling

```javascript
// Handle missing optional fields
const logo = job.employer_logo || '/default-logo.png';
const deadline = job.application_deadline_days 
  ? `${job.application_deadline_days} days left` 
  : 'No deadline specified';
const highlights = job.job_highlights || { 
  Qualifications: [], 
  Responsibilities: [], 
  Benefits: [] 
};
```

## 📝 Notes
- Not all jobs have all fields (e.g., some lack logos or salary info)
- O*NET fields require premium JSearch access
- Match scores and reasons are always included when using `/match` endpoint
- Use the `/search` endpoint for faster results without AI matching