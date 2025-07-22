# LinkedIn Automation Service

The LinkedInAutomationService is the main orchestration service that coordinates browser automation, session management, intervention detection, and data persistence for LinkedIn job search automation.

## Architecture Overview

```
LinkedInAutomationService
    ├── BrowserbaseSessionManager (Session & browser management)
    ├── SupabaseAutomationService (Data persistence)
    ├── InterventionDetectionService (Human intervention detection)
    └── Stagehand (AI-powered browser automation)
```

## Key Features

### 1. **Complete Automation Orchestration**
- Manages entire job search workflow from start to finish
- Coordinates between all services seamlessly
- Handles complex multi-step application processes

### 2. **Smart Intervention Handling**
- Checks for interventions after EVERY significant action
- Automatically pauses when human input needed
- Provides debug URLs for manual intervention

### 3. **Progress Tracking**
- Real-time progress updates via events
- Periodic progress saves to database
- Detailed logging of every action

### 4. **Resilient Error Handling**
- Retry logic with exponential backoff
- Graceful degradation on failures
- Session recovery after interruptions

### 5. **Event-Driven Architecture**
- Real-time updates via EventEmitter
- Frontend can subscribe to automation events
- Complete visibility into automation state

## Core Methods

### `startJobSearch(userId, config)`
Starts a new job search automation session.

```typescript
const { sessionId, debugUrl } = await automationService.startJobSearch(userId, {
  jobTitle: 'Software Engineer',
  location: 'San Francisco, CA',
  datePosted: 'week',
  experienceLevel: ['ENTRY_LEVEL', 'MID_LEVEL'],
  jobType: ['FULL_TIME'],
  remote: false,
  easyApplyOnly: true,
  maxApplications: 10,
  keywords: ['typescript', 'react']
});
```

### `pauseSession(sessionId)`
Pauses an active automation session.

```typescript
await automationService.pauseSession(sessionId);
```

### `resumeSession(sessionId)`
Resumes a paused automation session.

```typescript
const { debugUrl } = await automationService.resumeSession(sessionId);
```

### `stopSession(sessionId, reason?)`
Stops and terminates an automation session.

```typescript
await automationService.stopSession(sessionId, 'User requested stop');
```

### `getProgress(sessionId)`
Gets current automation progress.

```typescript
const progress = await automationService.getProgress(sessionId);
console.log(`Applied to ${progress.appliedJobs} out of ${progress.processedJobs} jobs`);
```

## Event System

### Available Events

```typescript
enum AutomationEventType {
  SESSION_STARTED = 'session_started',
  SESSION_PAUSED = 'session_paused',
  SESSION_RESUMED = 'session_resumed',
  SESSION_STOPPED = 'session_stopped',
  SESSION_COMPLETED = 'session_completed',
  PROGRESS_UPDATED = 'progress_updated',
  INTERVENTION_REQUIRED = 'intervention_required',
  ERROR = 'error'
}
```

### Event Listeners

```typescript
// Progress updates
automationService.on(AutomationEventType.PROGRESS_UPDATED, (data) => {
  const { sessionId, progress } = data;
  console.log(`Progress: ${progress.appliedJobs}/${progress.processedJobs}`);
});

// Intervention required
automationService.on(AutomationEventType.INTERVENTION_REQUIRED, (data) => {
  const { sessionId, intervention, debugUrl } = data;
  console.log(`${intervention.type} intervention needed at ${debugUrl}`);
});

// Session completed
automationService.on(AutomationEventType.SESSION_COMPLETED, (data) => {
  const { sessionId, progress } = data;
  console.log(`Completed! Applied to ${progress.appliedJobs} jobs`);
});
```

## Automation Workflow

### 1. **Navigation Phase**
- Navigate to LinkedIn Jobs
- Check for login/intervention
- Log navigation status

### 2. **Search Phase**
- Enter job title and location
- Apply search filters
- Check for interventions

### 3. **Processing Phase**
- Extract job listings from page
- Process each job individually
- Check for duplicates
- Apply based on criteria

### 4. **Application Phase**
- Click Easy Apply button
- Fill application form
- Handle multi-step forms
- Submit application

### 5. **Progress Phase**
- Save progress periodically
- Navigate to next page
- Continue until complete

## Configuration Options

```typescript
interface LinkedInAutomationConfig {
  // Maximum retry attempts for failed actions
  maxRetries?: number; // default: 3
  
  // Delay between retries (ms)
  retryDelay?: number; // default: 2000
  
  // Save progress every N jobs
  saveProgressInterval?: number; // default: 10
  
  // Check for interventions after actions
  checkInterventionAfterActions?: boolean; // default: true
  
  // Enable detailed logging
  verboseLogging?: boolean; // default: false
}
```

## Job Search Configuration

```typescript
interface JobSearchConfig {
  // Search criteria
  jobTitle: string;
  location: string;
  
  // Filters
  datePosted?: 'day' | 'week' | 'month';
  experienceLevel?: Array<'INTERNSHIP' | 'ENTRY_LEVEL' | 'MID_LEVEL' | 'SENIOR_LEVEL' | 'DIRECTOR' | 'EXECUTIVE'>;
  jobType?: Array<'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'TEMPORARY' | 'INTERNSHIP'>;
  remote?: boolean;
  
  // Application settings
  easyApplyOnly?: boolean;
  maxApplications?: number;
  
  // Keywords to match in job descriptions
  keywords?: string[];
}
```

## Error Handling

### Retry Logic
- Actions are retried up to 3 times with exponential backoff
- Each retry doubles the wait time (2s, 4s, 8s)
- Critical actions have additional validation

### Error Recovery
- Sessions can be resumed after errors
- Progress is saved periodically
- Failed applications are logged

### Intervention Handling
- Automation pauses immediately
- User is notified with debug URL
- Session can be resumed after intervention

## Usage Examples

### Basic Usage

```typescript
// Initialize service
const automationService = new LinkedInAutomationService(
  browserbaseManager,
  supabaseService
);

// Start automation
const { sessionId, debugUrl } = await automationService.startJobSearch(userId, {
  jobTitle: 'Software Engineer',
  location: 'San Francisco, CA',
  easyApplyOnly: true,
  maxApplications: 10
});

// Monitor progress
automationService.on(AutomationEventType.PROGRESS_UPDATED, (data) => {
  console.log('Progress:', data.progress);
});
```

### Handling Interventions

```typescript
automationService.on(AutomationEventType.INTERVENTION_REQUIRED, async (data) => {
  const { intervention, debugUrl } = data;
  
  switch (intervention.type) {
    case InterventionType.LOGIN:
      // Notify user to log in
      await sendEmail(userId, 'Please log in to LinkedIn', debugUrl);
      break;
      
    case InterventionType.CAPTCHA:
      // Notify user to solve CAPTCHA
      await sendNotification(userId, 'CAPTCHA required', debugUrl);
      break;
  }
});
```

### Complete Workflow

```typescript
// Setup event handlers
setupEventListeners(automationService);

// Start automation
const { sessionId } = await automationService.startJobSearch(userId, config);

// Wait for completion
await new Promise((resolve, reject) => {
  automationService.once(AutomationEventType.SESSION_COMPLETED, resolve);
  automationService.once(AutomationEventType.ERROR, reject);
});

// Cleanup
await automationService.cleanup();
```

## Best Practices

### 1. **Always Handle Events**
- Subscribe to intervention events
- Monitor progress updates
- Handle errors gracefully

### 2. **Use Appropriate Filters**
- Start with `easyApplyOnly: true`
- Set reasonable `maxApplications`
- Use keywords to filter relevant jobs

### 3. **Monitor Resource Usage**
- Each session uses a browser instance
- Clean up completed sessions
- Use `cleanup()` when done

### 4. **Handle Interventions Promptly**
- Notify users immediately
- Provide clear instructions
- Resume sessions after intervention

### 5. **Log Everything**
- Enable verbose logging for debugging
- Monitor automation logs
- Track success/failure rates

## Troubleshooting

### Session Won't Start
- Check Browserbase API key
- Verify Supabase connection
- Ensure user has valid config

### Applications Failing
- Check if logged into LinkedIn
- Verify Easy Apply is available
- Check for rate limiting

### Progress Not Updating
- Verify event listeners are set up
- Check database connectivity
- Ensure session is running

### Interventions Not Detected
- Lower confidence threshold
- Check Stagehand connection
- Verify page is loading

## Integration with Frontend

### WebSocket Updates
```typescript
// Frontend WebSocket connection
socket.on('automation:progress', (data) => {
  updateProgressBar(data.progress);
});

socket.on('automation:intervention', (data) => {
  showInterventionModal(data);
});
```

### REST API Endpoints
```typescript
// Start automation
POST /api/automation/start
Body: { userId, config }

// Get progress
GET /api/automation/progress/:sessionId

// Pause session
POST /api/automation/pause/:sessionId

// Resume session
POST /api/automation/resume/:sessionId
```

## Security Considerations

1. **User Isolation**: Each user has separate browser context
2. **Session Security**: Sessions are tied to user IDs
3. **Data Privacy**: No credentials stored, only job application data
4. **Rate Limiting**: Built-in delays prevent detection
5. **Debug URLs**: Temporary and session-specific

## Performance Optimization

1. **Batch Processing**: Jobs processed in batches
2. **Smart Delays**: Random delays between actions
3. **Progress Caching**: Periodic saves reduce DB writes
4. **Event Throttling**: Progress events throttled
5. **Resource Cleanup**: Automatic session cleanup

## Future Enhancements

1. **Resume Upload**: Custom resumes per application
2. **Answer Templates**: Pre-filled application answers
3. **Advanced Filters**: Salary range, company size
4. **Analytics**: Success rate tracking
5. **Scheduling**: Automated daily searches