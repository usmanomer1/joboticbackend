# OpenAI GPT-4o Migration Guide

## Overview

The LinkedIn automation service has been updated to use OpenAI's GPT-4o model instead of Google Gemini for better performance and reliability.

## Environment Variable Changes

### Previous Configuration (Gemini)
```bash
GEMINI_API_KEY=your-gemini-api-key
```

### New Configuration (OpenAI)
```bash
OPENAI_API_KEY=your-openai-api-key
```

## How to Get Your OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in to your account
3. Navigate to [API Keys](https://platform.openai.com/api-keys)
4. Click "Create new secret key"
5. Copy the key and add it to your `.env` file

## Model Benefits

### GPT-4o Advantages
- **Better Natural Language Understanding**: More accurate parsing of job search queries
- **Improved Web Navigation**: Better at understanding complex web interfaces
- **Higher Success Rate**: More reliable for automation tasks
- **Faster Response Times**: Optimized for speed

## Code Changes

The automation service now uses:
```javascript
modelName: 'openai/gpt-4o',
modelClientOptions: {
  apiKey: process.env.OPENAI_API_KEY
}
```

## Job Search Improvements

### Previous Behavior
- Dumped entire search query into one field
- Example: "software engineer in vancouver bc" all in job title field

### New Behavior
- Properly separates job title and location
- Job Title: "software engineer" → Job title field
- Location: "vancouver bc" → Location field
- Better filter application

## Natural Language Search Examples

The system now better understands queries like:
- "software engineer in San Francisco"
- "remote python developer jobs"
- "senior frontend engineer in New York"
- "data scientist positions in Seattle"

## Migration Steps

1. **Get OpenAI API Key**
   ```bash
   # Add to your .env file
   OPENAI_API_KEY=sk-...your-key-here...
   ```

2. **Remove Old Configuration**
   ```bash
   # Remove or comment out
   # GEMINI_API_KEY=...
   ```

3. **Restart Service**
   ```bash
   npm run dev
   # or
   npm start
   ```

## Cost Considerations

- GPT-4o pricing: ~$5.00 per 1M input tokens, $15.00 per 1M output tokens
- Typical automation session: ~10,000-50,000 tokens
- Estimated cost per session: $0.05-$0.25

## Troubleshooting

### Common Issues

1. **"Missing OPENAI_API_KEY"**
   - Ensure the environment variable is set
   - Check spelling: `OPENAI_API_KEY` (not `OPENAI_KEY`)

2. **"Invalid API Key"**
   - Verify key starts with `sk-`
   - Check for extra spaces or quotes

3. **Rate Limiting**
   - GPT-4o has generous rate limits
   - If hit, implement exponential backoff

## Rollback Instructions

If you need to switch back to Gemini:

1. Update `linkedinAutomationService.ts`:
   ```javascript
   modelName: 'google/gemini-2.0-flash',
   modelClientOptions: {
     apiKey: process.env.GEMINI_API_KEY
   }
   ```

2. Update `.env`:
   ```bash
   GEMINI_API_KEY=your-gemini-key
   # OPENAI_API_KEY=...
   ```

## Future Improvements

With GPT-4o, we can now:
- Better understand complex job requirements
- More accurately fill out application forms
- Handle multi-step application processes
- Better detect and handle edge cases