# Resume Editor API Guide

## Overview
The resume editor provides real-time editing with live PDF preview. The frontend should show a PDF viewer on the left and editable form fields on the right.

## Base URL
```
https://jobotic-backend.vercel.app/api/resume-editor
```

## Authentication
All endpoints require the `x-api-key` header.

## Endpoints

### 1. Initialize Editing Session
```
POST /parse-for-edit
```

**Request:**
```json
{
  "resumeText": "John Doe\nSoftware Engineer\n...",
  "jobId": "optional-job-id" // If editing for specific job
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid-here",
    "pdfUrl": "/api/resume-editor/preview/uuid-here",
    "sections": {
      "personalInfo": {
        "name": "John Doe",
        "title": "Software Engineer",
        "email": "john@example.com",
        "phone": "(555) 123-4567",
        "location": "San Francisco, CA",
        "linkedin": "linkedin.com/in/johndoe",
        "github": "github.com/johndoe",
        "website": "johndoe.dev"
      },
      "summary": "Experienced software engineer...",
      "skills": [
        { "category": "Languages", "skills": "JavaScript, Python, Java" },
        { "category": "Frameworks", "skills": "React, Node.js, Django" }
      ],
      "experience": [
        {
          "title": "Senior Software Engineer",
          "company": "Tech Corp",
          "location": "San Francisco, CA",
          "startDate": "Jan 2020",
          "endDate": "Present",
          "bullets": [
            "Led development of microservices",
            "Implemented CI/CD pipelines"
          ]
        }
      ],
      "projects": [...],
      "education": [...],
      "certifications": [...]
    },
    "schema": {
      // Form schema - see below
    }
  }
}
```

### 2. Update Section
```
POST /update-section
```

**Request:**
```json
{
  "sessionId": "uuid-from-parse",
  "sectionId": "personalInfo", // or skills, experience, etc.
  "data": {
    // Updated section data
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "pdfUrl": "/api/resume-editor/preview/uuid?v=timestamp",
    "updated": true,
    "sectionId": "personalInfo"
  }
}
```

### 3. Finalize Resume
```
POST /finalize
```

**Request:**
```json
{
  "sessionId": "uuid-from-parse",
  "format": "pdf" // or "docx"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "downloadUrl": "/api/resume-editor/download/file-uuid",
    "filename": "resume_2024-07-06.pdf",
    "format": "pdf",
    "expiresIn": 3600
  }
}
```

### 4. Get Empty Schema
```
GET /schema
```

Use this for creating new resumes from scratch.

## Form Schema Structure

The schema defines how to render form fields:

```json
{
  "personalInfo": {
    "title": "Personal Information",
    "fields": {
      "name": { "type": "text", "label": "Full Name", "required": true },
      "title": { "type": "text", "label": "Professional Title", "required": false },
      "email": { "type": "email", "label": "Email", "required": true },
      "phone": { "type": "tel", "label": "Phone", "required": false },
      "location": { "type": "text", "label": "Location", "required": false },
      "linkedin": { "type": "url", "label": "LinkedIn", "required": false },
      "github": { "type": "url", "label": "GitHub", "required": false },
      "website": { "type": "url", "label": "Website", "required": false }
    }
  },
  "skills": {
    "title": "Skills",
    "type": "array",
    "itemSchema": {
      "category": { "type": "text", "label": "Category", "placeholder": "e.g., Languages" },
      "skills": { "type": "text", "label": "Skills", "placeholder": "e.g., JavaScript, Python" }
    }
  },
  "experience": {
    "title": "Work Experience",
    "type": "array",
    "itemSchema": {
      "title": { "type": "text", "label": "Job Title", "required": true },
      "company": { "type": "text", "label": "Company", "required": true },
      "location": { "type": "text", "label": "Location", "required": false },
      "startDate": { "type": "text", "label": "Start Date", "placeholder": "MMM YYYY" },
      "endDate": { "type": "text", "label": "End Date", "placeholder": "MMM YYYY or Present" },
      "bullets": { "type": "array", "label": "Accomplishments", "itemType": "text" }
    }
  }
  // ... similar for projects, education, certifications
}
```

## Frontend Implementation

### 1. PDF Preview
```jsx
<iframe 
  src={`${API_URL}${pdfUrl}`}
  width="100%"
  height="100%"
  title="Resume Preview"
/>
```

### 2. Form Rendering
```jsx
// For simple fields
<input
  type={field.type}
  value={sectionData[fieldName]}
  onChange={(e) => updateField(fieldName, e.target.value)}
  placeholder={field.placeholder}
  required={field.required}
/>

// For array sections (skills, experience, etc.)
{sectionData.map((item, index) => (
  <div key={index}>
    {/* Render fields based on itemSchema */}
  </div>
))}
```

### 3. Auto-save on Change
```jsx
const updateSection = debounce(async (sectionId, data) => {
  const response = await fetch('/api/resume-editor/update-section', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    },
    body: JSON.stringify({ sessionId, sectionId, data })
  });
  
  const result = await response.json();
  // Update PDF URL to refresh preview
  setPdfUrl(result.data.pdfUrl);
}, 500);
```

## Important Notes

1. **Session Duration**: Sessions expire after 1 hour
2. **Real-time Updates**: Each update regenerates the PDF
3. **Validation**: Backend validates all inputs
4. **Section IDs**: Valid values are: personalInfo, summary, skills, experience, projects, education, certifications
5. **PDF Caching**: Add timestamp to PDF URL to force refresh: `${pdfUrl}?v=${Date.now()}`

## Example Flow

1. User uploads/pastes resume → Call `parse-for-edit`
2. Display PDF preview in iframe
3. Render form fields based on schema
4. On field change → Call `update-section` (debounced)
5. Update PDF iframe src with new URL
6. When done → Call `finalize` to get download link

## Error Handling

All errors return:
```json
{
  "success": false,
  "error": "Error message",
  "details": {} // Optional validation errors
}
```

Common errors:
- 404: Session expired or not found
- 400: Invalid input data
- 500: Server error