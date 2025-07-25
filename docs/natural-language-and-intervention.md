# Natural Language Support & Intervention Handling

## Natural Language Prompts ✅

**YES, we fully support natural language prompts!**

### How it works:
1. Frontend sends `searchPrompt` field with natural language query
2. Backend intelligently adds filter keywords if not present:
   - Appends "remote" if `remote: true` and not in prompt
   - Appends "easy apply" if `easyApplyOnly: true` and not in prompt
3. Backend passes the enhanced query to LinkedIn's search bar
4. LinkedIn's smart search handles all parsing and interpretation
5. Additional filters (Date Posted, etc.) are applied via UI buttons

### Example:
```javascript
// Frontend sends:
{
  searchPrompt: "software engineer vancouver bc",
  remote: true,
  easyApplyOnly: true
}

// Backend enhances it:
let searchQuery = "software engineer vancouver bc";
// Adds "remote" because remote: true
searchQuery += " remote";
// Adds "easy apply" because easyApplyOnly: true  
searchQuery += " easy apply";
// Final: "software engineer vancouver bc remote easy apply"

// Then types it into LinkedIn search:
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

### Search Query Building:
```typescript
// hybridJobSearchFlow.ts - performSearch()
// Build search query with filters included
let searchQuery = this.config.searchPrompt || 
                  `${this.config.jobTitle} ${this.config.location}`.trim();

// Add filter keywords directly to search query if not already included
if (this.config.remote && !searchQuery.toLowerCase().includes('remote')) {
  searchQuery += ' remote';
}

if (this.config.easyApplyOnly && !searchQuery.toLowerCase().includes('easy apply')) {
  searchQuery += ' easy apply';
}
```

### Intervention Deduplication:
```typescript
// linkedinAutomationService.ts
private interventionCache = new Map<string, number>();
private readonly INTERVENTION_COOLDOWN = 5000; // 5 seconds

private emitInterventionWithDedup(sessionId: string, data: any): void {
  const key = `${sessionId}-${data.intervention.type}`;
  const lastEmit = this.interventionCache.get(key);
  const now = Date.now();
  
  // Skip if same intervention was emitted recently
  if (lastEmit && (now - lastEmit) < this.INTERVENTION_COOLDOWN) {
    console.log(`Skipping duplicate intervention event for ${key}`);
    return;
  }
  
  this.interventionCache.set(key, now);
  this.emit(AutomationEventType.INTERVENTION_REQUIRED, data);
}
```

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