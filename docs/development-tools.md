# Resume Editor Development Tools

## Overview
This document describes the development tools and helpers available for the HTML-based resume editor system.

## Test Endpoints

### 1. Test PDF Conversion Pipeline
```
POST /api/resume-editor-test/test-conversion
```

Test the complete PDF to HTML conversion pipeline with detailed logging.

**Request**:
- `pdf` (file): PDF file to test
- `includeHtml` (boolean): Include HTML preview in response
- `includeStructure` (boolean): Include parsed structure
- `includeSuggestions` (boolean): Test text matching

**Response**:
```json
{
  "success": true,
  "data": {
    "file": {
      "name": "test-123456.pdf",
      "size": 54321
    },
    "conversion": {
      "success": true,
      "method": "pdf2htmlEX",
      "htmlPath": "temp/html/test-123456/test-123456.html"
    },
    "parsing": {
      "totalBlocks": 45,
      "sections": [
        { "type": "experience", "itemCount": 12 }
      ]
    },
    "timing": {
      "validation": 12,
      "conversion": 2341,
      "parsing": 156,
      "total": 2509
    },
    "logs": [
      "PDF validation: PASSED (12ms)",
      "PDF to HTML conversion: SUCCESS (2341ms)"
    ]
  }
}
```

### 2. System Information
```
GET /api/resume-editor-test/system-info
```

Get system configuration and dependencies status.

**Response**:
```json
{
  "node": "v18.0.0",
  "platform": "linux",
  "pdf2htmlex": {
    "installed": true,
    "version": "0.18.8.rc1"
  },
  "env": {
    "PDF2HTMLEX_PATH": "/usr/bin/pdf2htmlex",
    "TEMP_DIR": "./temp"
  }
}
```

## Logging System

### Logger Configuration
Configure logging via environment variables:
```env
LOG_LEVEL=debug          # error, warn, info, debug
LOG_TO_FILE=true        # Enable file logging
LOG_TO_CONSOLE=true     # Enable console output
LOG_DIR=./logs          # Log directory
```

### Log Categories
- `PDF_CONVERSION` - PDF to HTML conversion events
- `HTML_PARSING` - HTML parsing and structure extraction
- `AI_SUGGESTIONS` - AI suggestion generation
- `TEXT_MATCHING` - Text matching and confidence scores
- `CLEANUP` - File cleanup operations
- `PERFORMANCE` - Performance metrics

### Using the Logger
```javascript
const logger = require('./src/utils/logger');

// Log conversion start
logger.logConversion('START', 'Beginning PDF conversion', { 
  pdfPath: '/path/to/file.pdf' 
});

// Log performance
logger.logPerformance('PDF_CONVERSION', 2341, { 
  fileSize: 54321 
});

// Log text matching
logger.logTextMatching(
  'Original bullet text',
  'Matched text',
  0.95 // confidence
);
```

### Viewing Logs
Logs are output to console by default. Enable file logging for persistent logs:
```javascript
// Recent logs via API (dev only)
GET /api/resume-editor-test/logs?lines=100
```

## Cleanup Scheduler

### Automatic Cleanup
The cleanup scheduler runs automatically to remove old temporary files:
- **Uploads**: Cleaned after 2 hours
- **HTML files**: Cleaned after 24 hours
- **Exports**: Cleaned after 24 hours
- **Documents**: Cleaned after 7 days

### Manual Cleanup
```javascript
const { cleanup, getStats } = require('./src/utils/cleanupScheduler');

// Run manual cleanup
const results = await cleanup({
  force: false,
  directories: ['uploads', 'html', 'exports']
});

// Get current stats
const stats = await getStats();
console.log(stats);
// {
//   directories: {
//     'temp/uploads': { size: 1048576, count: 5 },
//     'temp/html': { size: 2097152, count: 10 }
//   },
//   totalSize: 3145728,
//   fileCount: 15
// }
```

## PDF Conversion Fallback

The system automatically falls back to text extraction if pdf2htmlEX fails:

### Fallback Detection
1. pdf2htmlEX command fails
2. PDF file is corrupted
3. pdf2htmlEX not installed

### Testing Fallback
```javascript
// Force fallback mode
const result = await pdfToHtmlService.convertWithFallback(pdfPath, {
  forceFallback: true
});

console.log(result);
// {
//   success: true,
//   method: 'text-extraction',
//   htmlPath: 'temp/html/resume-fallback/resume.html',
//   fallbackUsed: true
// }
```

### Fallback Limitations
- No exact layout preservation
- Basic positioning based on line breaks
- Limited formatting
- Shows "fallback mode" indicator

## Environment Variables

### Required
```env
RAPIDAPI_KEY=your_key           # JSearch API
GEMINI_API_KEY=your_key         # Google AI
```

### Optional PDF Processing
```env
PDF2HTMLEX_PATH=/usr/bin/pdf2htmlex     # pdf2htmlEX binary path
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser  # Chrome path
TEMP_DIR=./temp                         # Temporary files directory
MAX_FILE_SIZE=10485760                  # Max upload size (10MB)
```

### Optional Cleanup
```env
CLEANUP_INTERVAL=3600000    # Cleanup interval in ms (1 hour)
LOG_DIR=./logs             # Log file directory
LOG_TO_FILE=false          # Enable file logging
LOG_LEVEL=info             # Log level
```

## Debugging Tips

### 1. PDF Conversion Issues
- Check pdf2htmlEX installation: `pdf2htmlEX --version`
- Test with simple PDF first
- Check file permissions on temp directories
- Review conversion logs for command output

### 2. Text Matching Issues
- Enable debug logging: `LOG_LEVEL=debug`
- Check confidence scores in logs
- Verify text normalization is working
- Test with exact text matches first

### 3. Performance Issues
- Monitor conversion times in logs
- Check file sizes being processed
- Verify cleanup is running
- Use performance logs to identify bottlenecks

### 4. Memory Issues
- Large PDFs may consume significant memory
- Monitor process memory usage
- Adjust Puppeteer settings if needed
- Consider file size limits

## Testing Workflow

1. **Upload Test PDF**:
   ```bash
   curl -X POST http://localhost:3001/api/resume-editor-test/test-conversion \
     -H "X-API-Key: your-key" \
     -F "pdf=@test-resume.pdf" \
     -F "includeStructure=true"
   ```

2. **Check System**:
   ```bash
   curl http://localhost:3001/api/resume-editor-test/system-info \
     -H "X-API-Key: your-key"
   ```

3. **Monitor Logs**:
   - Watch console output
   - Check log files in `./logs`
   - Filter by category or level

4. **Verify Cleanup**:
   - Check temp directory sizes
   - Monitor cleanup logs
   - Verify old files are removed