# Resume Editor HTML API Documentation

## Overview
The Resume Editor HTML API uses pdf2htmlEX for perfect layout preservation when editing resumes. This system converts PDFs to HTML, applies AI suggestions while maintaining exact positioning, and exports back to PDF.

## Base URL
```
https://jobotic-backend-production.up.railway.app/api/resume-editor-html
```

## Authentication
All endpoints require API key authentication:
```
Headers: {
  'X-API-Key': 'your-api-key',
  'Content-Type': 'application/json' // or 'multipart/form-data' for file uploads
}
```

## Endpoints

### 1. Parse PDF for Editing
```
POST /api/resume-editor-html/parse-for-edit
```

**Purpose**: Upload a PDF resume and convert it to editable HTML with AI suggestions.

**Request**:
- Content-Type: `multipart/form-data`
- Body:
  - `resume` (file, required): PDF file to upload
  - `userId` (string, optional): User identifier
  - `jobDescription` (string, optional): Job description for targeted suggestions

**Response**:
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "htmlContent": "<html>...</html>",
    "suggestions": [
      {
        "blockId": "text-0-3",
        "originalText": "Developed web applications",
        "suggestedText": "Developed 5+ scalable web applications serving 100K+ users",
        "type": "bullet",
        "confidence": "high",
        "matchScore": 0.95
      }
    ],
    "documentStructure": {
      "name": { "text": "John Doe" },
      "contact": [...],
      "sections": [
        {
          "type": "experience",
          "title": "EXPERIENCE",
          "items": [...]
        }
      ]
    },
    "stats": {
      "totalBlocks": 45,
      "totalSuggestions": 8,
      "sections": [
        { "type": "experience", "itemCount": 12 }
      ]
    }
  }
}
```

### 2. Apply Individual Suggestion
```
POST /api/resume-editor-html/apply-suggestion
```

**Purpose**: Accept or reject a single AI suggestion.

**Request Body**:
```json
{
  "sessionId": "uuid",
  "suggestionId": "suggestion-123456-1",
  "action": "accept" // or "reject"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "htmlContent": "<html>updated...</html>",
    "stats": {
      "total": 8,
      "accepted": 3,
      "rejected": 1,
      "pending": 4
    }
  }
}
```

### 3. Apply All Suggestions
```
POST /api/resume-editor-html/apply-all
```

**Purpose**: Accept or reject all suggestions at once.

**Request Body**:
```json
{
  "sessionId": "uuid",
  "action": "accept" // or "reject"
}
```

### 4. Revert All Changes
```
POST /api/resume-editor-html/revert
```

**Purpose**: Revert all changes and restore original resume.

**Request Body**:
```json
{
  "sessionId": "uuid"
}
```

### 5. Export to PDF
```
POST /api/resume-editor-html/export-pdf
```

**Purpose**: Generate final PDF from edited resume.

**Request Body**:
```json
{
  "sessionId": "uuid",
  "format": "Letter", // "Letter", "A4", "Legal"
  "includeMargins": false
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "fileId": "uuid",
    "filename": "resume-john-doe-1234567890.pdf",
    "size": 54321,
    "downloadUrl": "/api/resume-editor-html/download/uuid",
    "publicUrl": "https://storage.url/resume.pdf" // if uploaded to cloud
  }
}
```

### 6. Download PDF
```
GET /api/resume-editor-html/download/:fileId
```

**Purpose**: Download the exported PDF file.

**Response**: Binary PDF file with appropriate headers.

### 7. Get Preview
```
GET /api/resume-editor-html/preview/:sessionId
```

**Purpose**: Get current HTML content and statistics.

**Response**:
```json
{
  "success": true,
  "data": {
    "htmlContent": "<html>...</html>",
    "stats": {
      "total": 8,
      "accepted": 5,
      "rejected": 1,
      "pending": 2
    },
    "documentStructure": {...}
  }
}
```

## Frontend Implementation Guide

### 1. File Upload Flow
```javascript
// Upload PDF and get suggestions
const formData = new FormData();
formData.append('resume', pdfFile);
formData.append('jobDescription', jobDescriptionText);

const response = await fetch('/api/resume-editor-html/parse-for-edit', {
  method: 'POST',
  headers: { 'X-API-Key': apiKey },
  body: formData
});

const { sessionId, htmlContent, suggestions } = response.data;
```

### 2. Display HTML with Suggestions
```javascript
// Display HTML in iframe or div
<div dangerouslySetInnerHTML={{ __html: htmlContent }} />

// Or use iframe for better isolation
<iframe srcDoc={htmlContent} />
```

### 3. Handle Suggestion Actions
```javascript
// Accept a suggestion
await fetch('/api/resume-editor-html/apply-suggestion', {
  method: 'POST',
  headers: {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    sessionId,
    suggestionId: 'suggestion-123',
    action: 'accept'
  })
});
```

### 4. Export Final PDF
```javascript
// Export and download
const exportResponse = await fetch('/api/resume-editor-html/export-pdf', {
  method: 'POST',
  headers: {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    sessionId,
    format: 'Letter'
  })
});

const { downloadUrl } = exportResponse.data;
window.open(downloadUrl, '_blank');
```

## Visual Styling

The HTML includes CSS classes for suggestion highlighting:
- `.ai-suggestion` - Green background for pending suggestions
- `.ai-suggestion.accepted` - Transparent (accepted)
- `.ai-suggestion.rejected` - Red with strikethrough

## Session Management

- Sessions expire after 24 hours
- Each session stores the original PDF, current HTML state, and all suggestions
- Multiple users can have concurrent sessions

## Error Handling

All endpoints return consistent error responses:
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "statusCode": 400
  }
}
```

Common errors:
- 400: Invalid request (missing file, invalid parameters)
- 404: Session not found or expired
- 500: Server error (PDF conversion failed, etc.)

## Best Practices

1. **Show Loading States**: PDF conversion can take 2-5 seconds
2. **Auto-save**: Periodically save suggestion decisions
3. **Preview Updates**: Update preview after each suggestion action
4. **Batch Operations**: Use apply-all for better UX when many suggestions
5. **Error Recovery**: Store sessionId locally to recover from disconnections