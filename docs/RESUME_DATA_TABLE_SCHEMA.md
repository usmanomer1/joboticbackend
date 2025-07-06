# Resume Data Table Schema Documentation

## Overview
The `resume_data` table in Supabase stores parsed resume information with dynamic sections, allowing flexible resume formats without hardcoded categories.

## Table Structure

### Table: `public.resume_data`

| Column | Type | Default | Nullable | Description |
|--------|------|---------|----------|-------------|
| `id` | UUID | `gen_random_uuid()` | NO | Primary key, auto-generated UUID |
| `user_id` | UUID | NULL | YES | Foreign key to auth.users, UNIQUE constraint ensures one resume per user |
| `profile_id` | UUID | NULL | YES | Optional foreign key to profiles table |
| `sections` | JSONB | `'{}'::jsonb` | YES | Stores dynamically parsed resume sections |
| `schema` | JSONB | `'{}'::jsonb` | YES | Frontend form schema for editing UI |
| `resume_text` | TEXT | NULL | YES | Plain text version of the resume |
| `pdf_url` | TEXT | NULL | YES | URL to generated PDF in Supabase storage |
| `docx_url` | TEXT | NULL | YES | URL to generated DOCX file |
| `last_edited_at` | TIMESTAMPTZ | `NOW()` | YES | Timestamp of last edit operation |
| `created_at` | TIMESTAMPTZ | `NOW()` | YES | Initial creation timestamp |
| `updated_at` | TIMESTAMPTZ | `NOW()` | YES | Auto-updated on any change |
| `version` | INTEGER | 1 | YES | Auto-incremented version number |

## Indexes
- `idx_resume_data_user_id` - Index on user_id for fast user lookups
- `idx_resume_data_profile_id` - Index on profile_id for profile relationships
- `idx_resume_data_last_edited_at` - Index for cleanup queries

## Relationships
- `user_id` → `auth.users(id)` - Each resume belongs to one user (CASCADE DELETE)
- `profile_id` → `public.profiles(id)` - Optional link to user profile (SET NULL on delete)

## Row Level Security (RLS)
RLS is enabled with the following policies:
- **SELECT**: Users can only view their own resume data
- **INSERT**: Users can only insert their own resume data
- **UPDATE**: Users can only update their own resume data
- **DELETE**: Users can only delete their own resume data

## Triggers
1. **set_updated_at**: Updates `updated_at` timestamp on any row update
2. **increment_resume_version**: Increments `version` and updates `last_edited_at` when `sections` or `resume_text` changes

## JSONB Structure Examples

### `sections` Column Structure
```json
{
  "personalInfo": {
    "name": "John Doe",
    "title": "Software Engineer",
    "email": "john@example.com",
    "phone": "+1-555-0123",
    "location": "San Francisco, CA",
    "linkedin": "linkedin.com/in/johndoe",
    "github": "github.com/johndoe",
    "website": "johndoe.com"
  },
  "professional_summary": {
    "title": "Professional Summary",
    "type": "paragraph",
    "content": "Experienced software engineer with 8+ years..."
  },
  "work_experience": {
    "title": "Work Experience",
    "type": "experience",
    "items": [
      {
        "title": "Senior Software Engineer",
        "organization": "Tech Corp",
        "dateRange": "2020 - Present",
        "location": "San Francisco, CA",
        "description": ["Led team of 5 engineers", "Architected microservices"]
      }
    ]
  },
  "technical_skills": {
    "title": "Technical Skills",
    "type": "skills",
    "categories": [
      {"name": "Languages", "skills": "Python, JavaScript, Go"},
      {"name": "Frameworks", "skills": "React, Django, Express"},
      {"name": "Databases", "skills": "PostgreSQL, MongoDB, Redis"}
    ]
  },
  "education": {
    "title": "Education",
    "type": "education",
    "items": [
      {
        "degree": "B.S. Computer Science",
        "institution": "Stanford University",
        "date": "2016",
        "location": "Stanford, CA",
        "details": ["GPA: 3.8/4.0", "Dean's List"]
      }
    ]
  }
}
```

### `schema` Column Structure
```json
{
  "sections": [
    {
      "id": "personal",
      "title": "Personal Information",
      "type": "single",
      "fields": [
        {"name": "fullName", "type": "text", "value": "John Doe", "label": "Full Name"},
        {"name": "title", "type": "text", "value": "Software Engineer", "label": "Professional Title"},
        {"name": "email", "type": "email", "value": "john@example.com", "label": "Email"}
      ]
    },
    {
      "id": "technical_skills",
      "title": "Technical Skills",
      "type": "grouped",
      "groups": [
        {"name": "languages", "label": "Languages", "values": ["Python", "JavaScript"], "type": "tags"},
        {"name": "frameworks", "label": "Frameworks", "values": ["React", "Django"], "type": "tags"}
      ]
    }
  ]
}
```

## Section Types
The system dynamically detects and categorizes sections into these types:
- **paragraph**: Text blocks (summaries, objectives)
- **list**: Bullet point lists (awards, certifications)
- **experience**: Work/project entries with dates
- **education**: Academic entries
- **skills**: Categorized skill groups

## Usage Notes

1. **One Resume Per User**: The UNIQUE constraint on `user_id` ensures each user has only one resume record
2. **Version Tracking**: The `version` field auto-increments on content changes for history tracking
3. **Flexible Schema**: The JSONB columns allow storing any resume format without schema migrations
4. **Cleanup**: Records without a `profile_id` and not edited recently can be cleaned up (temporary sessions)

## Integration with Services

The `resumeEditorSupabase.service.js` uses this table to:
- Parse and store resumes dynamically
- Generate edit schemas for frontend forms
- Track changes and versions
- Generate PDFs and store URLs
- Support section reordering and custom sections

## Performance Considerations

1. JSONB indexes can be added for specific queries:
   ```sql
   CREATE INDEX idx_sections_personal_info ON resume_data ((sections->'personalInfo'->>'email'));
   ```

2. The cleanup process targets records where:
   - `profile_id IS NULL` (temporary sessions)
   - `last_edited_at < NOW() - INTERVAL '1 hour'`

## Future Enhancements

Potential additions to the schema:
- `is_public` BOOLEAN - For public resume sharing
- `share_token` TEXT - For private resume sharing links
- `ai_insights` JSONB - For storing AI-generated insights
- `optimization_history` JSONB[] - Array of past optimizations
- `tags` TEXT[] - For categorization and search