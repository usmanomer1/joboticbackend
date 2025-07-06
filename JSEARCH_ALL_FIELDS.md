# JSearch API - Complete Field Reference

Now that we're preserving ALL fields from JSearch API, here's what's available in every job object:

## Basic Information
- `job_id` - Unique identifier for the job
- `job_title` - Job position title
- `employer_name` - Company name
- `employer_logo` - Company logo URL
- `employer_website` - Company website URL
- `employer_company_type` - Type of company (e.g., "Private", "Public")

## Location Data
- `job_city` - City where job is located
- `job_state` - State/province
- `job_country` - Country
- `job_is_remote` - Boolean indicating if remote work is available
- `job_latitude` - GPS latitude coordinate
- `job_longitude` - GPS longitude coordinate
- `location_display` - Formatted location string

## Application Information
- `job_apply_link` - Direct application URL
- `job_apply_is_direct` - Boolean if application is direct to employer
- `job_apply_quality_score` - Quality score of the application process (0-1)
- `job_google_link` - Google Jobs URL
- `job_publisher` - Where the job was originally posted

## Compensation & Benefits
- `job_min_salary` - Minimum salary (if provided)
- `job_max_salary` - Maximum salary (if provided)
- `job_salary_currency` - Currency for salary (e.g., "USD")
- `job_salary_period` - Pay period (e.g., "YEAR", "HOUR")
- `job_benefits` - Array of job benefits
- `salary_estimate` - Our calculated salary estimate

## Requirements
- `job_required_experience` - Experience requirements object
- `job_required_skills` - Array of required skills
- `job_required_education` - Education requirements object
- `job_experience_in_place_of_education` - Boolean if experience can substitute education
- `extracted_requirements` - Our AI-extracted requirements

## Timing Information
- `job_posted_at_timestamp` - Unix timestamp when posted
- `job_posted_at_datetime_utc` - ISO datetime when posted
- `job_offer_expiration_timestamp` - Unix timestamp when job expires
- `job_offer_expiration_datetime_utc` - ISO datetime when job expires
- `posted_days_ago` - Calculated days since posting
- `application_deadline_days` - Calculated days until deadline

## Classification & Metadata
- `job_employment_type` - Type of employment (e.g., "FULLTIME", "PARTTIME")
- `job_onet_soc` - O*NET Standard Occupational Classification code
- `job_onet_job_zone` - O*NET Job Zone (1-5, complexity level)
- `job_job_title` - Normalized job title
- `job_posting_language` - Language of the job posting

## Content
- `job_description` - Full HTML job description
- `job_description_clean` - HTML-stripped description for AI processing
- `job_highlights` - Structured object with:
  - `Qualifications` - Array of qualification requirements
  - `Responsibilities` - Array of job responsibilities
  - `Benefits` - Array of benefits (detailed)

## AI Matching Results
- `match_score` - AI-calculated match score (0-100)
- `match_label` - Match category (e.g., "STRONG MATCH")
- `match_reasons` - Array of reasons for the match
- `missing_skills` - Skills the candidate lacks
- `key_strengths` - Candidate's relevant strengths
- `match_error` - Boolean indicating if AI matching failed

## Example Response
```json
{
  "job_id": "abc123",
  "employer_name": "Tech Corp",
  "employer_logo": "https://...",
  "job_title": "Senior Software Engineer",
  "job_highlights": {
    "Qualifications": [
      "5+ years of experience",
      "Strong Python skills"
    ],
    "Responsibilities": [
      "Design scalable systems",
      "Lead technical initiatives"
    ],
    "Benefits": [
      "Health insurance",
      "401(k) matching"
    ]
  },
  "job_apply_quality_score": 0.85,
  "job_onet_soc": "15-1252",
  "job_onet_job_zone": "4",
  "job_offer_expiration_timestamp": 1234567890,
  // ... all other fields
}
```

## Notes
- All fields are preserved from the JSearch API response
- Some fields may be null if not provided by the employer
- Premium JSearch features like O*NET classification require higher tier API access
- The `job_description_clean` field is added by us for AI processing