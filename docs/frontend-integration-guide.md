# Frontend Integration Guide for LinkedIn Automation

This guide is for integrating your React TypeScript frontend with the LinkedIn automation backend.

## Table of Contents
1. [Overview](#overview)
2. [Natural Language Prompts](#natural-language-prompts)
3. [API Endpoints](#api-endpoints)
4. [WebSocket Events](#websocket-events)
5. [Intervention Handling](#intervention-handling)
6. [Complete Integration Flow](#complete-integration-flow)
7. [Code Examples](#code-examples)

## Overview

The backend provides a comprehensive LinkedIn job automation service with:
- Natural language job search support
- Real-time WebSocket updates for live preview
- Persistent browser sessions (login once)
- Intervention handling for manual actions
- Rich event streaming for UI updates

## Natural Language Prompts

**YES! We fully support natural language prompts.** The backend is designed to handle both structured and natural language searches.

### How Natural Language Works

```typescript
// Frontend can send natural language directly
const searchConfig = {
  searchPrompt: "software engineer vancouver bc with react experience",
  // These fields are optional when using searchPrompt
  jobTitle: undefined,
  location: undefined
};
```

The backend will:
1. Pass the entire `searchPrompt` directly to LinkedIn's search bar
2. LinkedIn's smart search handles the parsing
3. No complex NLP needed on our end!

### Search Configuration

```typescript
interface JobSearchConfig {
  // Natural language search - PREFERRED method
  searchPrompt?: string;  // e.g., "senior react developer remote $150k+"
  
  // Traditional fields (optional, used as fallback)
  jobTitle?: string;
  location?: string;
  
  // Filters
  easyApplyOnly?: boolean;
  datePosted?: 'day' | 'week' | 'month';
  remote?: boolean;
  maxApplications?: number;
  
  // Resume data
  resumeUrl?: string;  // Supabase storage URL
  resumeMetadata?: {
    fileName: string;
    fileType: string;
    extractedText?: string;  // For form filling
  };
}
```

## API Endpoints

### 1. Check Context Status (Browser Session)
```typescript
GET /api/linkedin/context-status

Headers: {
  Authorization: 'Bearer <jwt_token>'
}

Response: {
  hasContext: boolean;
  contextId?: string;
  lastActivity?: string;
  needsLogin: boolean;
}
```

### 2. Start Job Search
```typescript
POST /api/linkedin/start-job-search

Headers: {
  Authorization: 'Bearer <jwt_token>',
  'Content-Type': 'application/json'
}

Body: {
  // Natural language approach (recommended)
  searchPrompt: "software engineer vancouver bc",
  
  // Optional filters
  easyApplyOnly: true,
  maxApplications: 50,
  datePosted: "week",
  
  // Resume info
  resumeId: "uuid-here",  // From your resume service
  
  // Profile links (for future use)
  profileLinks: {
    github: "https://github.com/username",
    linkedin: "https://linkedin.com/in/username"
  }
}

Response: {
  success: boolean;
  sessionId: string;
  liveViewUrl: string;  // For iframe embedding
  message: string;
}
```

### 3. Resume After Intervention
```typescript
POST /api/linkedin/resume-automation

Headers: {
  Authorization: 'Bearer <jwt_token>',
  'Content-Type': 'application/json'
}

Body: {
  sessionId: "current-session-id",
  interventionResolved: true
}

Response: {
  success: boolean;
  message: string;
}
```

### 4. Stop Automation
```typescript
POST /api/linkedin/stop-automation

Headers: {
  Authorization: 'Bearer <jwt_token>',
  'Content-Type': 'application/json'
}

Body: {
  sessionId: "current-session-id"
}
```

## WebSocket Events

Connect to WebSocket for real-time updates:

```typescript
const ws = new WebSocket('wss://your-backend/ws');

// Subscribe to user's events
ws.send(JSON.stringify({
  type: 'subscribe',
  userId: 'user-uuid'
}));
```

### Event Types

```typescript
// Context events
'context:status'         // Browser session status
'context:first_login'    // User needs to log in
'context:created'        // New session created

// Action events (for live preview)
'action:performed'       // Any navigation action
'agent:step:realtime'    // Agent's reasoning steps
'agent:reasoning'        // Agent's thought process

// Application events
'job:found'             // New job discovered
'application:started'   // Starting to apply
'application:submitted' // Successfully applied
'job:skipped'          // Job skipped (with reason)

// Intervention events
'intervention:required' // Manual action needed
'intervention:resolved' // User completed action

// Metrics events
'metrics:updated'       // Real-time performance stats
```

### Event Examples

```typescript
// Agent reasoning event
{
  type: 'agent:step:realtime',
  data: {
    sessionId: 'xxx',
    step: 'Analyzing job requirements',
    reasoning: 'Found 5 required skills, matching with resume...',
    timestamp: '2024-01-20T10:30:00Z'
  }
}

// Intervention required event
{
  type: 'intervention:required',
  data: {
    sessionId: 'xxx',
    interventionType: 'login',
    message: 'Please log in to LinkedIn',
    liveViewUrl: 'https://browserbase.com/live/xxx',
    actionRequired: 'Complete LinkedIn login'
  }
}

// Job found event
{
  type: 'job:found',
  data: {
    sessionId: 'xxx',
    job: {
      jobId: '123',
      company: 'Tech Corp',
      jobTitle: 'Software Engineer',
      location: 'Vancouver, BC',
      isEasyApply: true
    }
  }
}
```

## Intervention Handling

### Intervention Flow

1. **Backend detects intervention needed**
   - Login required
   - CAPTCHA
   - Account creation for external application

2. **Frontend receives intervention event**
   ```typescript
   ws.on('message', (event) => {
     const data = JSON.parse(event.data);
     if (data.type === 'intervention:required') {
       // Show intervention UI
       showInterventionModal({
         title: 'Action Required',
         message: data.data.message,
         liveViewUrl: data.data.liveViewUrl,
         onResolved: () => resumeAutomation(data.data.sessionId)
       });
     }
   });
   ```

3. **User completes action in live view**
   - The iframe shows the actual browser
   - User logs in or completes required action

4. **Frontend calls resume endpoint**
   ```typescript
   async function resumeAutomation(sessionId: string) {
     await fetch('/api/linkedin/resume-automation', {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'application/json'
       },
       body: JSON.stringify({
         sessionId,
         interventionResolved: true
       })
     });
   }
   ```

### Auto-Detection vs Manual Resume

The backend supports both:

1. **Auto-detection** (default): Backend polls to check if intervention is resolved
2. **Manual resume**: Frontend explicitly calls resume endpoint (recommended)

## Complete Integration Flow

### 1. Initial Setup
```typescript
// Check if user has existing browser context
const contextStatus = await checkContextStatus();

if (!contextStatus.hasContext) {
  // First time user - they'll need to login
  showOnboardingMessage("You'll need to log in to LinkedIn once");
}
```

### 2. Start Automation
```typescript
// User enters: "software engineer vancouver bc"
const startAutomation = async (prompt: string) => {
  const response = await fetch('/api/linkedin/start-job-search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      searchPrompt: prompt,  // Direct natural language!
      easyApplyOnly: true,
      maxApplications: 50,
      resumeId: selectedResumeId
    })
  });
  
  const data = await response.json();
  
  // Show live view in iframe
  setLiveViewUrl(data.liveViewUrl);
  setSessionId(data.sessionId);
  
  // Start listening to WebSocket events
  subscribeToEvents(data.sessionId);
};
```

### 3. Handle Real-time Updates
```typescript
// Update UI based on events
ws.on('message', (event) => {
  const { type, data } = JSON.parse(event.data);
  
  switch (type) {
    case 'agent:step:realtime':
      updateAgentReasoning(data.reasoning);
      break;
      
    case 'job:found':
      addJobToList(data.job);
      break;
      
    case 'application:submitted':
      markJobAsApplied(data.job);
      updateSuccessCount();
      break;
      
    case 'intervention:required':
      showInterventionModal(data);
      break;
      
    case 'metrics:updated':
      updatePerformanceStats(data.metrics);
      break;
  }
});
```

## Code Examples

### Complete React Component Example

```typescript
interface AutomationState {
  isRunning: boolean;
  sessionId: string | null;
  liveViewUrl: string | null;
  agentReasoning: string[];
  jobsFound: Job[];
  metrics: AutomationMetrics;
  intervention: InterventionData | null;
}

function LinkedInAutomation() {
  const [state, setState] = useState<AutomationState>({
    isRunning: false,
    sessionId: null,
    liveViewUrl: null,
    agentReasoning: [],
    jobsFound: [],
    metrics: {},
    intervention: null
  });
  
  const startSearch = async (prompt: string) => {
    try {
      // Start automation with natural language
      const response = await api.startJobSearch({
        searchPrompt: prompt,
        easyApplyOnly: true,
        resumeId: selectedResume.id
      });
      
      setState(prev => ({
        ...prev,
        isRunning: true,
        sessionId: response.sessionId,
        liveViewUrl: response.liveViewUrl
      }));
      
      // Connect WebSocket
      connectWebSocket(response.sessionId);
      
    } catch (error) {
      showError('Failed to start automation');
    }
  };
  
  const handleIntervention = () => {
    // Show modal with live view
    return (
      <InterventionModal
        liveViewUrl={state.intervention.liveViewUrl}
        message={state.intervention.message}
        onResolved={() => {
          api.resumeAutomation(state.sessionId);
          setState(prev => ({ ...prev, intervention: null }));
        }}
      />
    );
  };
  
  return (
    <div className="automation-container">
      {/* Search Input */}
      <SearchBar
        onSearch={startSearch}
        placeholder="e.g., software engineer vancouver bc"
      />
      
      {/* Split View */}
      <div className="split-view">
        {/* Live Preview */}
        <div className="live-preview">
          {state.liveViewUrl && (
            <iframe
              src={state.liveViewUrl}
              title="LinkedIn Automation"
              className="browser-view"
            />
          )}
        </div>
        
        {/* Agent Reasoning */}
        <div className="agent-panel">
          <h3>Agent Reasoning</h3>
          <div className="reasoning-feed">
            {state.agentReasoning.map((step, i) => (
              <div key={i} className="reasoning-step">
                {step}
              </div>
            ))}
          </div>
          
          {/* Metrics */}
          <div className="metrics">
            <h4>Progress</h4>
            <p>Jobs Found: {state.jobsFound.length}</p>
            <p>Applied: {state.metrics.successfulApplications || 0}</p>
            <p>Success Rate: {state.metrics.successRate || 0}%</p>
          </div>
        </div>
      </div>
      
      {/* Intervention Modal */}
      {state.intervention && handleIntervention()}
    </div>
  );
}
```

### WebSocket Handler Example

```typescript
class AutomationWebSocket {
  private ws: WebSocket;
  private handlers: Map<string, Function>;
  
  connect(sessionId: string) {
    this.ws = new WebSocket(WS_URL);
    
    this.ws.onopen = () => {
      // Subscribe to session events
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        sessionId
      }));
    };
    
    this.ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      const handler = this.handlers.get(type);
      if (handler) {
        handler(data);
      }
    };
  }
  
  on(eventType: string, handler: Function) {
    this.handlers.set(eventType, handler);
  }
  
  disconnect() {
    this.ws?.close();
  }
}

// Usage
const ws = new AutomationWebSocket();
ws.on('agent:step:realtime', (data) => {
  console.log('Agent thinking:', data.reasoning);
});
ws.on('intervention:required', (data) => {
  showInterventionUI(data);
});
ws.connect(sessionId);
```

## Best Practices

1. **Always use natural language prompts** - Let LinkedIn do the parsing
2. **Handle interventions gracefully** - Show clear instructions to users
3. **Update UI in real-time** - Use WebSocket events for smooth experience
4. **Cache context status** - Don't check on every request
5. **Show agent reasoning** - Users love seeing the AI think
6. **Handle errors properly** - Network issues, auth failures, etc.

## Support & Troubleshooting

Common issues and solutions:

1. **User logged out**: Backend will emit `intervention:required` with type `login`
2. **Rate limiting**: Backend handles this automatically with delays
3. **Session expired**: Check context status and create new if needed
4. **WebSocket disconnects**: Implement auto-reconnect with exponential backoff