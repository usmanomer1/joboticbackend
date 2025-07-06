# Resume Editor API Guide - Supabase Integration

## Overview
The resume editor now integrates with Supabase for persistent storage. It dynamically parses any resume format and creates sections on the fly, no hardcoded categories.

## Key Features
- **Dynamic Section Detection**: Automatically detects sections like "Publications", "Volunteer Work", "Honors", etc.
- **Persistent Storage**: All changes saved to Supabase `resume_data` table
- **PDF Generation**: PDFs stored in Supabase storage bucket
- **Flexible Schema**: Form fields generated based on detected content
- **Add/Remove Sections**: Users can add custom sections or remove existing ones
- **Reorder Sections**: Drag-and-drop section ordering

## Base URL
```
https://jobotic-backend.vercel.app/api/resume-editor
```

## Authentication
- API Key: `x-api-key` header
- User ID: Pass the Supabase auth user ID in requests

## Main Endpoints

### 1. Parse Resume for Editing
```
POST /parse-for-edit
```

**Request:**
```json
{
  "userId": "uuid-from-supabase-auth",
  "resumeText": "John Doe\nSoftware Engineer\n...",
  "jobId": "optional-job-id"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "resumeId": "resume-uuid",
    "pdfUrl": "https://supabase-storage-url/resume.pdf",
    "sections": {
      "personalInfo": {
        "name": "John Doe",
        "title": "Software Engineer",
        "email": "john@example.com"
      },
      "professional_summary": {
        "title": "Professional Summary",
        "type": "paragraph",
        "content": "Experienced engineer..."
      },
      "work_experience": {
        "title": "Work Experience",
        "type": "experience",
        "items": [...]
      },
      "technical_expertise": {
        "title": "Technical Expertise",
        "type": "skills",
        "categories": [...]
      },
      "publications": {
        "title": "Publications",
        "type": "list",
        "items": ["Published in IEEE...", "Co-authored..."]
      }
      // Any other detected sections...
    },
    "schema": {
      // Dynamic form schema based on detected sections
    }
  }
}
```

### 2. Update Section
```
POST /update-section
```

Updates a section and regenerates PDF in Supabase.

**Request:**
```json
{
  "userId": "user-uuid",
  "sectionId": "technical_expertise",
  "data": {
    "title": "Technical Expertise",
    "type": "skills",
    "categories": [
      { "name": "Languages", "skills": "Python, JavaScript, Go" },
      { "name": "Cloud", "skills": "AWS, GCP, Kubernetes" }
    ]
  }
}
```

### 3. Add Custom Section
```
POST /add-section
```

**Request:**
```json
{
  "userId": "user-uuid",
  "sectionKey": "volunteer_experience",
  "sectionTitle": "Volunteer Experience",
  "sectionType": "experience" // or "list", "paragraph", "skills"
}
```

### 4. Remove Section
```
POST /remove-section
```

**Request:**
```json
{
  "userId": "user-uuid",
  "sectionId": "publications"
}
```

### 5. Reorder Sections
```
POST /reorder-sections
```

**Request:**
```json
{
  "userId": "user-uuid",
  "sectionOrder": ["professional_summary", "technical_expertise", "work_experience", "education", "projects"]
}
```

### 6. Get Resume Data
```
POST /get-resume
```

Fetches existing resume data from Supabase.

**Request:**
```json
{
  "userId": "user-uuid"
}
```

### 7. Get Section Templates
```
GET /section-templates
```

Returns available section types and their icons for "Add Section" UI.

## Dynamic Section Types

The parser automatically detects and categorizes sections:

1. **paragraph**: Summary, objective, about sections
2. **list**: Bullet points (awards, certifications, publications)
3. **experience**: Work/project entries with dates and descriptions
4. **education**: Academic entries
5. **skills**: Categorized skills (Languages: Python, Java)

## Schema Structure

The schema tells the frontend how to render forms:

```json
{
  "sectionKey": {
    "title": "Display Title",
    "type": "paragraph|list|array|skillCategories",
    "fields": { /* for simple sections */ },
    "itemSchema": { /* for array sections */ },
    "categorySchema": { /* for skills */ }
  }
}
```

## Frontend Implementation

### Rendering Dynamic Sections
```jsx
{Object.entries(sections).map(([key, section]) => {
  switch (section.type) {
    case 'paragraph':
      return <TextArea value={section.content} />
    case 'list':
      return <ListEditor items={section.items} />
    case 'experience':
      return <ExperienceEditor items={section.items} />
    case 'skills':
      return <SkillsEditor categories={section.categories} />
  }
})}
```

### Adding Sections
```jsx
const templates = await fetch('/api/resume-editor/section-templates')
// Show modal with available templates
// User selects one and provides title
await addSection(userId, sectionKey, title, type)
```

## Database Schema

Supabase `resume_data` table:
- `sections`: JSONB with all dynamic sections
- `schema`: JSONB with form rendering instructions
- `resume_text`: Plain text version
- `pdf_url`: Latest PDF in storage
- `version`: Auto-increments on updates

## Key Benefits

1. **No Hardcoding**: Works with any resume format
2. **Persistent**: Changes saved to Supabase, not temp storage
3. **Bidirectional**: Updates from editor reflect in profile and vice versa
4. **Flexible**: Users can add sections like "Research", "Patents", "Speaking", etc.
5. **Version Tracking**: Automatic versioning on each update

## Example: Detected Sections

For a professor's resume:
- Research Interests
- Publications
- Teaching Experience
- Grants and Funding
- Conference Presentations
- Graduate Students Supervised

For a designer's resume:
- Design Philosophy
- Portfolio Highlights
- Client Work
- Exhibitions
- Tools & Software

All automatically detected and editable!