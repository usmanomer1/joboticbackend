# PDF2HTMLEX Deployment Guide

## Overview
The resume editor HTML feature requires pdf2htmlEX for perfect layout preservation. However, pdf2htmlEX is not available in newer Debian/Alpine distributions. This guide provides multiple deployment options.

## Current Status
- **Debian Bookworm (Node:18)**: pdf2htmlEX NOT available ❌
- **Ubuntu 20.04**: pdf2htmlEX available ✅
- **Fallback mechanism**: Text extraction mode ✅

## Deployment Options

### Option 1: Use Fallback Mode (Current Default)
The application automatically falls back to text extraction when pdf2htmlEX is not available.

**Dockerfile**: `Dockerfile` (main)
- Uses Node.js 18 on Debian
- Sets `DISABLE_PDF2HTMLEX=true` by default
- Provides good-enough HTML output for AI suggestions

**Pros**:
- Works immediately
- No special configuration needed
- Stable and reliable

**Cons**:
- No exact layout preservation
- Basic formatting only

### Option 2: Use Ubuntu 20.04 (pdf2htmlEX Available)
Switch to Ubuntu-based image where pdf2htmlEX is available.

**Dockerfile**: `Dockerfile.ubuntu`
- Uses Ubuntu 20.04
- Installs pdf2htmlEX from official repositories
- Full layout preservation

**To deploy with Ubuntu**:
1. Update railway.toml:
```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "./Dockerfile.ubuntu"
```

2. Push and deploy:
```bash
git add railway.toml
git commit -m "Switch to Ubuntu dockerfile for pdf2htmlEX"
git push
railway up
```

**Pros**:
- Perfect layout preservation
- pdf2htmlEX works out of the box

**Cons**:
- Larger image size
- Ubuntu 20.04 is older

### Option 3: Build pdf2htmlEX from Source
Create a custom Dockerfile that builds pdf2htmlEX from source.

**Note**: This is complex and time-consuming. Not recommended unless absolutely necessary.

## Environment Variables

### DISABLE_PDF2HTMLEX
Controls whether to use pdf2htmlEX or fallback mode.

- `true`: Always use text extraction fallback
- `false`: Try pdf2htmlEX first, fallback if it fails
- Not set: Same as `false`

**Set in Railway**:
```bash
# Via dashboard: Add environment variable
DISABLE_PDF2HTMLEX=true

# Or in your .env file
DISABLE_PDF2HTMLEX=true
```

## Checking Current Mode

### Via API Response
The parse-for-edit endpoint returns the conversion method used:

```json
{
  "success": true,
  "data": {
    "conversionMethod": "text-extraction", // or "pdf2htmlEX"
    "fallbackUsed": true // or false
  }
}
```

### Via Logs
Look for these log messages:
- `[INFO] PDF_CONVERSION: Using fallback text extraction method`
- `[WARN] PDF_CONVERSION: pdf2htmlEX failed, attempting fallback`
- `[INFO] PDF_CONVERSION: START: Beginning PDF to HTML conversion`

## Recommendations

### For Production (Immediate)
1. Use the default Dockerfile with fallback mode
2. Set `DISABLE_PDF2HTMLEX=true` in environment
3. This provides immediate functionality

### For Production (Future)
1. Consider switching to Ubuntu-based image if layout preservation is critical
2. Monitor pdf2htmlEX availability in newer distributions
3. Evaluate alternative PDF-to-HTML tools

### For Development
1. Install pdf2htmlEX locally if available for your OS
2. Use Docker for consistent behavior
3. Test both modes (with and without pdf2htmlEX)

## Testing Fallback Mode

Force fallback mode for testing:
```javascript
// In your API call
const result = await pdfToHtmlService.convertWithFallback(pdfPath, {
  forceFallback: true
});
```

Or set environment variable:
```bash
DISABLE_PDF2HTMLEX=true npm start
```

## Troubleshooting

### "pdf2htmlEX: not found"
- Expected when using Debian Bookworm
- Application will automatically use fallback
- Set `DISABLE_PDF2HTMLEX=true` to suppress warnings

### Poor text layout in fallback mode
- This is expected behavior
- Fallback mode prioritizes text extraction over layout
- AI suggestions will still work correctly

### Want better layout preservation
- Switch to Ubuntu-based Dockerfile
- Or wait for pdf2htmlEX to be available in newer distributions