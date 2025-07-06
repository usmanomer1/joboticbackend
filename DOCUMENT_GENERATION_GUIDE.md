# Document Generation API Guide

## Overview
The backend properly generates real PDF and DOCX files. Here's how to use it correctly:

## 1. Generate Document

**Endpoint:** `POST /api/download/generate`

**Request:**
```json
{
  "resumeText": "John Doe\nSoftware Engineer\n...",
  "format": "pdf",  // or "docx"
  "metadata": {
    "score": 8.5,
    "jobTitle": "Senior Software Engineer",
    "company": "Tech Corp",
    "improvements": [
      "Added React experience",
      "Highlighted leadership skills"
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "fileId": "123e4567-e89b-12d3-a456-426614174000",
    "filename": "resume_optimized.pdf",
    "format": "pdf",
    "size": 45678,
    "downloadUrl": "/api/download/123e4567-e89b-12d3-a456-426614174000",
    "expiresIn": 3600,
    "expiresAt": "2024-01-10T15:30:00Z"
  }
}
```

## 2. Download the File

**Endpoint:** `GET /api/download/{fileId}`

This returns the actual PDF/DOCX file with proper headers:
- `Content-Type: application/pdf` (or docx)
- `Content-Disposition: attachment; filename="resume.pdf"`

## 3. Frontend Implementation

### Generate and Download
```javascript
// Step 1: Generate document
const generateResponse = await fetch('/api/download/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify({
    resumeText: resumeContent,
    format: 'pdf',
    metadata: { score, jobTitle, company }
  })
});

const { data } = await generateResponse.json();

// Step 2: Download file
window.location.href = `${API_BASE_URL}${data.downloadUrl}`;
// OR use fetch for more control
```

### PDF Preview
```javascript
// Option 1: Direct iframe preview
<iframe 
  src={`${API_BASE_URL}${data.downloadUrl}`}
  width="100%" 
  height="600px"
  title="Resume Preview"
/>

// Option 2: PDF.js integration
const loadPdf = async (downloadUrl) => {
  const response = await fetch(`${API_BASE_URL}${downloadUrl}`, {
    headers: { 'X-API-Key': 'your-api-key' }
  });
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  
  // Use with PDF.js or browser's built-in PDF viewer
  return objectUrl;
};
```

### Preview with Download Button
```jsx
const ResumePreview = ({ fileData }) => {
  const [previewUrl, setPreviewUrl] = useState(null);
  
  useEffect(() => {
    // Create blob URL for preview
    fetch(`${API_BASE_URL}${fileData.downloadUrl}`, {
      headers: { 'X-API-Key': apiKey }
    })
    .then(res => res.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    });
    
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [fileData]);
  
  return (
    <div>
      {previewUrl && (
        <iframe 
          src={previewUrl} 
          width="100%" 
          height="600px"
          title="Resume Preview"
        />
      )}
      <button 
        onClick={() => window.location.href = `${API_BASE_URL}${fileData.downloadUrl}`}
      >
        Download {fileData.format.toUpperCase()}
      </button>
    </div>
  );
};
```

## 4. Check File Status

**Endpoint:** `GET /api/download/status/{fileId}`

Check if file still exists before downloading:
```javascript
const checkFile = async (fileId) => {
  const response = await fetch(`/api/download/status/${fileId}`, {
    headers: { 'X-API-Key': apiKey }
  });
  const { data } = await response.json();
  
  if (data.isExpired) {
    // Regenerate the document
    return false;
  }
  
  return data;
};
```

## Important Notes

1. **Files expire after 1 hour** - Store the fileId if you need to re-download
2. **Actual file generation** - The backend uses Puppeteer for PDFs and docx library for Word documents
3. **Preview in browser** - PDFs can be previewed directly, DOCX files will download
4. **API Key required** - Include X-API-Key header in all requests

## Example: Complete Flow

```javascript
const OptimizedResumeDownload = ({ resumeText, jobData }) => {
  const [loading, setLoading] = useState(false);
  const [fileData, setFileData] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  
  const generateResume = async (format) => {
    setLoading(true);
    try {
      // Generate document
      const response = await fetch('/api/download/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.REACT_APP_API_KEY
        },
        body: JSON.stringify({
          resumeText,
          format,
          metadata: {
            score: jobData.score,
            jobTitle: jobData.title,
            company: jobData.company
          }
        })
      });
      
      const result = await response.json();
      setFileData(result.data);
      
      // Create preview for PDF
      if (format === 'pdf') {
        const fileResponse = await fetch(`${API_BASE_URL}${result.data.downloadUrl}`, {
          headers: { 'X-API-Key': process.env.REACT_APP_API_KEY }
        });
        const blob = await fileResponse.blob();
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      }
    } catch (error) {
      console.error('Failed to generate document:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const downloadFile = () => {
    if (fileData) {
      window.location.href = `${API_BASE_URL}${fileData.downloadUrl}`;
    }
  };
  
  return (
    <div>
      <div>
        <button onClick={() => generateResume('pdf')} disabled={loading}>
          Generate PDF
        </button>
        <button onClick={() => generateResume('docx')} disabled={loading}>
          Generate DOCX
        </button>
      </div>
      
      {previewUrl && (
        <div>
          <h3>Preview</h3>
          <iframe src={previewUrl} width="100%" height="600px" />
          <button onClick={downloadFile}>Download {fileData.format.toUpperCase()}</button>
        </div>
      )}
    </div>
  );
};
```

## Testing the API

```bash
# Generate PDF
curl -X POST http://localhost:3001/api/download/generate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "resumeText": "John Doe\nSoftware Engineer\nExperienced developer...",
    "format": "pdf"
  }'

# Download file (use the fileId from response)
curl -O http://localhost:3001/api/download/123e4567-e89b-12d3-a456-426614174000 \
  -H "X-API-Key: your-api-key"
```