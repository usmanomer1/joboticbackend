# JSearch API Field Analysis

## Complete List of Fields from JSearch API (transformJobResponse method)

The `transformJobResponse` method in `jobSearch.service.js` (lines 623-674) receives and processes ALL of these fields from the JSearch API:

### Core Job Information
1. `job_id` - Unique identifier
2. `employer_name` - Company name
3. `employer_logo` - Company logo URL
4. `employer_website` - Company website
5. `employer_company_type` - Type of company
6. `job_publisher` - Where the job was published
7. `job_employment_type` - Full-time, part-time, etc.
8. `job_title` - Job title
9. `job_apply_link` - Application URL
10. `job_apply_is_direct` - Direct application or through aggregator
11. `job_apply_quality_score` - Quality score of the application process
12. `job_description` - Full job description
13. `job_is_remote` - Remote job flag
14. `job_posted_at_timestamp` - Unix timestamp
15. `job_posted_at_datetime_utc` - UTC datetime

### Location Fields
16. `job_city` - City
17. `job_state` - State
18. `job_country` - Country
19. `job_latitude` - GPS latitude
20. `job_longitude` - GPS longitude

### Compensation & Benefits
21. `job_benefits` - Array of benefits
22. `job_min_salary` - Minimum salary
23. `job_max_salary` - Maximum salary
24. `job_salary_currency` - Currency code
25. `job_salary_period` - YEAR, MONTH, HOUR, etc.

### Requirements & Qualifications
26. `job_required_experience` - Experience requirements object
27. `job_required_skills` - Array of required skills
28. `job_required_education` - Education requirements object
29. `job_experience_in_place_of_education` - Boolean

### Additional Metadata
30. `job_google_link` - Google Jobs link
31. `job_offer_expiration_datetime_utc` - When the job expires
32. `job_offer_expiration_timestamp` - Expiration unix timestamp
33. `job_highlights` - Object with Qualifications, Responsibilities, Benefits sections
34. `job_job_title` - Normalized job title
35. `job_posting_language` - Language of the posting
36. `job_onet_soc` - O*NET SOC code
37. `job_onet_job_zone` - O*NET job zone

### Fields Added by Our System
38. `match_score` - AI matching score
39. `match_label` - Match quality label
40. `match_reasons` - Array of matching reasons
41. `missing_skills` - Skills candidate lacks
42. `salary_estimate` - Enriched salary data
43. `application_deadline_days` - Days until deadline
44. `posted_days_ago` - Days since posted
45. `location_display` - Formatted location string

## Fields Being Stripped in searchJobsForMatching

The `searchJobsForMatching` method (lines 374-408) **REMOVES** the following fields:

### Stripped Fields:
1. `job_publisher` - Where the job was published
2. `job_apply_is_direct` - Whether application is direct
3. `job_apply_quality_score` - Quality score of application
4. `job_posted_at_datetime_utc` - Human-readable posting date
5. `job_latitude` - GPS coordinates
6. `job_longitude` - GPS coordinates  
7. `job_google_link` - Link to Google Jobs
8. `job_offer_expiration_datetime_utc` - Human-readable expiration
9. `job_offer_expiration_timestamp` - Unix expiration timestamp
10. `job_highlights` - **CRITICAL: This contains structured Qualifications, Responsibilities, Benefits**
11. `job_job_title` - Normalized job title
12. `job_posting_language` - Language of posting
13. `job_onet_soc` - O*NET classification
14. `job_onet_job_zone` - O*NET job zone
15. `job_experience_in_place_of_education` - Important for matching
16. `application_deadline_days` - Calculated deadline info

## Impact Analysis

### Critical Data Loss:
1. **job_highlights** - This is processed into `extracted_requirements` but the original structured data is lost
2. **job_offer_expiration_timestamp** - Users can't see when jobs expire
3. **job_apply_quality_score** - Could help users prioritize better application experiences
4. **job_onet_soc** and **job_onet_job_zone** - Valuable for career matching and progression

### Moderate Impact:
5. **job_google_link** - Alternative application path
6. **job_publisher** - Source transparency
7. **job_posting_language** - Important for international users
8. **GPS coordinates** - Could enable map features

## Other Filtering Locations

1. **AI Matching Service** (`aiMatching.service.js`): 
   - Preserves all fields passed to it using spread operator (`...job`)
   - Only adds matching fields, doesn't remove anything

2. **Routes** (`jobs.routes.js`):
   - `/search` endpoint: Returns full job data from `searchJobs`
   - `/match` endpoint: Returns filtered data from `searchJobsForMatching`
   - `/:jobId` endpoint: Returns full job details

## Recommendations

1. **Remove the filtering in searchJobsForMatching** - The AI can handle full data
2. **Keep job_highlights in addition to extracted_requirements** - Both are valuable
3. **Include all timestamp fields** - Important for job freshness and deadlines
4. **Preserve O*NET data** - Valuable for career matching
5. **Keep quality scores** - Helps users make better application decisions

The user is paying for full API access but receiving a subset of available data. This filtering reduces the value proposition of the premium JSearch API access.