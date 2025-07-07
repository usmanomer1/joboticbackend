# Resume Editor HTML API Documentation

## Overview
The Resume Editor HTML API provides endpoints for converting PDFs to HTML with perfect layout preservation using pdf2htmlEX, applying AI suggestions, and exporting back to PDF.

## Common Issues & Solutions

### Issue: "Only PDF files are allowed" with empty body
**Cause**: The frontend is not correctly sending the file as multipart/form-data.

**Solutions**:

1. **Wrong Content-Type**: Ensure you're NOT setting Content-Type manually. Let FormData set it.
```javascript
// ❌ WRONG
fetch('/api/resume-editor-html/parse-for-edit', {
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data', // Don't do this!
    'X-API-Key': 'your-key'
  },
  body: formData
});

// ✅ CORRECT
fetch('/api/resume-editor-html/parse-for-edit', {
  method: 'POST',
  headers: {
    'X-API-Key': 'your-key' // Only set necessary headers
  },
  body: formData // FormData sets content-type automatically
});
```

2. **Wrong Field Name**: The file must be uploaded with field name `resume`.
```javascript
// ❌ WRONG
formData.append('file', pdfFile);
formData.append('pdf', pdfFile);
formData.append('document', pdfFile);

// ✅ CORRECT
formData.append('resume', pdfFile);
```

3. **Sending JSON instead of FormData**:
```javascript
// ❌ WRONG - Don't send base64 or JSON
const body = {
  resume: base64Data,
  userId: '123'
};
fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

// ✅ CORRECT - Use FormData
const formData = new FormData();
formData.append('resume', fileInput.files[0]);
formData.append('userId', '123');
formData.append('jobDescription', 'optional job description');

fetch(url, {
  method: 'POST',
  headers: { 'X-API-Key': 'your-key' },
  body: formData
});
```

## Endpoints

### 1. Parse PDF for Editing
**Endpoint**: `POST /api/resume-editor-html/parse-for-edit`

**Purpose**: Convert PDF to HTML and optionally get AI suggestions.

**Request**:
- Method: `POST`
- Content-Type: `multipart/form-data` (set automatically by FormData)
- Fields:
  - `resume` (required): PDF or text file
  - `userId` (optional): User identifier
  - `jobDescription` (optional): Job description for AI suggestions

**Example**:
```javascript
const formData = new FormData();
formData.append('resume', fileInput.files[0]); // File from <input type="file">
formData.append('userId', '12345');
formData.append('jobDescription', 'Senior Software Engineer position...');

const response = await fetch('/api/resume-editor-html/parse-for-edit', {
  method: 'POST',
  headers: {
    'X-API-Key': 'your-api-key'
  },
  body: formData
});

const result = await response.json();
```

**Success Response**:
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid-here",
    "htmlContent": "<html>...</html>",
    "suggestions": [
      {
        "blockId": "text-0-1",
        "originalText": "Managed team of 5 developers",
        "suggestedText": "Led cross-functional team of 5 developers, improving delivery speed by 30%",
        "confidence": "high",
        "type": "bullet"
      }
    ],
    "documentStructure": {
      "sections": [
        {
          "type": "experience",
          "items": [...]
        }
      ]
    },
    "conversionMethod": "pdf2htmlEX",
    "stats": {
      "totalBlocks": 45,
      "totalSuggestions": 8,
      "sections": [...]
    }
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "No file uploaded",
  "details": {
    "expectedFieldName": "resume",
    "receivedFields": ["userId", "jobDescription"],
    "contentType": "application/json",
    "hint": "Ensure you are using multipart/form-data and the file field is named \"resume\"",
    "example": {
      "frontend": "formData.append(\"resume\", file);",
      "curl": "curl -X POST -F \"resume=@file.pdf\" http://api/endpoint"
    }
  }
}
```

### 2. Debug Endpoint (Development Only)
**Endpoint**: `POST /api/resume-editor-html/parse-for-edit-debug`

**Purpose**: Diagnose file upload issues by accepting any field name.

**Example**:
```javascript
const formData = new FormData();
formData.append('anyFieldName', file); // Will work with any field name

const response = await fetch('/api/resume-editor-html/parse-for-edit-debug', {
  method: 'POST',
  headers: { 'X-API-Key': 'your-key' },
  body: formData
});
```

**Response** will tell you:
- What field name was used
- What field name should be used
- File details received
- Specific guidance for fixing

### 3. Flexible Endpoint (Accepts Common Field Names)
**Endpoint**: `POST /api/resume-editor-html/parse-for-edit-flexible`

**Purpose**: More forgiving endpoint that accepts common field names.

**Accepted field names**:
- `resume` (recommended)
- `file`
- `pdf`
- `document`
- `upload`
- `resumeFile`
- `resume_file`

### 4. Apply Individual Suggestion
**Endpoint**: `POST /api/resume-editor-html/apply-suggestion`

**Request Body** (JSON):
```json
{
  "sessionId": "uuid-from-parse",
  "suggestionId": "text-0-1",
  "action": "accept" // or "reject"
}
```

### 5. Export to PDF
**Endpoint**: `POST /api/resume-editor-html/export-pdf`

**Request Body** (JSON):
```json
{
  "sessionId": "uuid-from-parse",
  "format": "Letter", // or "A4", "Legal"
  "includeMargins": true
}
```

## Complete Working Example

```javascript
// Step 1: File selection
const fileInput = document.getElementById('resume-upload');
const file = fileInput.files[0];

if (!file) {
  alert('Please select a file');
  return;
}

// Step 2: Prepare FormData
const formData = new FormData();
formData.append('resume', file); // MUST be 'resume'
formData.append('userId', 'user123');
formData.append('jobDescription', 'Looking for a senior developer...');

// Step 3: Upload and parse
try {
  const response = await fetch('/api/resume-editor-html/parse-for-edit', {
    method: 'POST',
    headers: {
      'X-API-Key': 'your-api-key'
      // Do NOT set Content-Type - FormData handles it
    },
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Upload failed:', error);
    alert(error.details?.hint || error.error);
    return;
  }

  const result = await response.json();
  console.log('Success:', result);
  
  // Save sessionId for later use
  const sessionId = result.data.sessionId;
  
  // Display HTML content
  document.getElementById('preview').innerHTML = result.data.htmlContent;
  
  // Show suggestions
  result.data.suggestions.forEach(suggestion => {
    console.log('Suggestion:', suggestion);
  });
  
} catch (error) {
  console.error('Request failed:', error);
  alert('Failed to upload file. Check console for details.');
}
```

## Testing with cURL

```bash
# Test the main endpoint
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -F "resume=@path/to/resume.pdf" \
  -F "userId=test123" \
  -F "jobDescription=Senior developer position" \
  http://localhost:3001/api/resume-editor-html/parse-for-edit

# Test the debug endpoint
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -F "wrongFieldName=@path/to/resume.pdf" \
  http://localhost:3001/api/resume-editor-html/parse-for-edit-debug

# Test the flexible endpoint
curl -X POST \
  -H "X-API-Key: your-api-key" \
  -F "file=@path/to/resume.pdf" \
  http://localhost:3001/api/resume-editor-html/parse-for-edit-flexible
```

## Troubleshooting Checklist

1. ✅ Using FormData, not JSON
2. ✅ File field named `resume`
3. ✅ NOT setting Content-Type header manually
4. ✅ Including X-API-Key header
5. ✅ File is actually selected before sending
6. ✅ Using POST method
7. ✅ Correct endpoint URL
8. ✅ File size under 10MB

## File Types Supported

- **PDF files**: `.pdf` with mimetypes:
  - `application/pdf`
  - `application/x-pdf`
  - `text/pdf`
  
- **Text files**: `.txt` with mimetypes:
  - `text/plain`
  - `application/txt`

## Notes

- Sessions expire after 24 hours
- Maximum file size: 10MB
- pdf2htmlEX must be installed on the server for best results
- Fallback to text extraction if pdf2htmlEX fails
- All endpoints require API key authentication