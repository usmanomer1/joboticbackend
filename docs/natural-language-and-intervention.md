# Natural Language Support & Intervention Handling

## Natural Language Prompts ✅

**YES, we fully support natural language prompts!**

### How it works:
1. Frontend sends `searchPrompt` field with natural language query
2. Backend passes it directly to LinkedIn's search bar
3. LinkedIn's smart search handles all parsing and interpretation

### Example:
```javascript
// Frontend sends:
{
  searchPrompt: "software engineer vancouver bc with 5 years experience $150k+ remote"
}

// Backend code (hybridJobSearchFlow.ts:214):
const searchQuery = this.config.searchPrompt || 
                   `${this.config.jobTitle} ${this.config.location}`.trim();

// Then types it directly into LinkedIn search:
await this.stagehand.page.act(`Type "${searchQuery}" in the search field`);
```

### Benefits:
- No complex NLP needed
- Supports salary ranges, experience levels, skills, etc.
- Works with LinkedIn's advanced search operators
- Users can type exactly what they'd search on LinkedIn

## Intervention Flow & Resume Endpoint ✅

**YES, we have a resume endpoint!**

### Endpoint:
```
PUT /api/linkedin/resume/:sessionId
```

### Flow:
1. **Backend detects intervention** (login, CAPTCHA, account creation)
2. **Emits WebSocket event**: `intervention:required`
3. **Frontend shows intervention UI** with live browser view
4. **User completes action** in the iframe
5. **Frontend calls resume endpoint**:
   ```javascript
   PUT /api/linkedin/resume/session-123
   ```
6. **Backend resumes automation** from where it left off

### Auto-detection:
- Backend polls to check if intervention is resolved
- But manual resume via endpoint is more reliable and recommended

## Key Implementation Details

### Search Query Priority:
```typescript
// In JobSearchConfig interface:
searchPrompt?: string;      // Primary - natural language
jobTitle?: string;          // Fallback if no searchPrompt
location?: string;          // Fallback if no searchPrompt
```

### The Magic Line:
```typescript
// hybridJobSearchFlow.ts - performSearch()
const searchQuery = this.config.searchPrompt || 
                   `${this.config.jobTitle} ${this.config.location}`.trim();
```

This means:
- If `searchPrompt` is provided → use it directly
- If not → fall back to combining jobTitle + location
- Either way → LinkedIn handles the interpretation

### Frontend Best Practice:
```javascript
// Just send what the user types!
const startSearch = async (userInput: string) => {
  await api.startJobSearch({
    searchPrompt: userInput,  // "software engineer vancouver bc"
    // Optional filters still work:
    easyApplyOnly: true,
    maxApplications: 50
  });
};
```