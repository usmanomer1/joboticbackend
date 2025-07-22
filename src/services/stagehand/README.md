# Intervention Detection Service

The InterventionDetectionService uses Stagehand's `observe()` method to intelligently detect when human intervention is needed during browser automation. It provides confidence-based detection for various intervention types common in web automation scenarios.

## Key Features

### 1. **AI-Powered Detection**
- Uses Stagehand's observe() to understand page context
- Natural language analysis of page elements
- Confidence scoring (0-1) for each detection
- Multi-pattern matching with weighted scoring

### 2. **Intervention Types**
- **LOGIN**: Sign-in forms, authentication pages
- **CAPTCHA**: Human verification challenges
- **TWO_FA**: Two-factor authentication prompts
- **BLOCKED**: Account restrictions or bans
- **RATE_LIMIT**: Too many requests warnings

### 3. **Smart Pattern Matching**
- Keyword-based detection with context clues
- Element analysis (forms, buttons, inputs)
- Configurable confidence thresholds
- Custom pattern support

## How It Works

The service uses Stagehand's `observe()` method in two ways:

1. **General observation**: Finds all interactive elements and messages
2. **Targeted observation**: Specifically looks for intervention indicators

```typescript
// General observation
const observations = await page.observe({
  instruction: "Find all interactive elements, forms, messages, alerts...",
  returnAction: true
});

// Targeted observation
const interventionObservations = await page.observe({
  instruction: "Find any login forms, captcha elements, verification codes...",
  returnAction: true
});
```

## Usage

### Basic Detection

```typescript
import { InterventionDetectionService } from './services/stagehand';

const detector = new InterventionDetectionService({
  confidenceThreshold: 0.7,
  verboseLogging: true
});

// Detect intervention
const intervention = await detector.detectIntervention(stagehand);

if (intervention) {
  console.log(`Type: ${intervention.type}`);
  console.log(`Confidence: ${intervention.confidence}`);
  console.log(`Instructions: ${intervention.instructions}`);
}
```

### Continuous Monitoring

```typescript
// Monitor for interventions every 5 seconds
const monitoring = await continuousMonitoring(stagehand, sessionId, 5000);

// Stop monitoring when done
monitoring.stop();

// Get all detected interventions
const allInterventions = monitoring.getInterventions();
```

### Custom Patterns

```typescript
// Add LinkedIn-specific pattern
detector.addCustomPattern({
  type: InterventionType.BLOCKED,
  keywords: ['commercial use', 'automated activity'],
  weight: 0.9,
  contextClues: ['review our terms', 'appeal this decision']
});
```

## Detection Patterns

### Login Detection
- Keywords: "sign in", "log in", "email and password", "username"
- Elements: Email/password inputs, sign-in buttons
- Context: "forgot password", "remember me", "create account"

### CAPTCHA Detection
- Keywords: "captcha", "verify you're human", "select all images"
- Elements: ReCAPTCHA widgets, security check frames
- Context: "i am not a robot", "security verification"

### 2FA Detection
- Keywords: "verification code", "two-factor", "enter code"
- Elements: Code input fields, authenticator prompts
- Context: "6 digit code", "sent to your phone"

### Block Detection
- Keywords: "unusual activity", "account restricted", "suspended"
- Elements: Error messages, warning banners
- Context: "terms of service", "contact support"

### Rate Limit Detection
- Keywords: "too many requests", "try again later", "rate limit"
- Elements: Wait messages, countdown timers
- Context: "please wait", "retry after", "cooldown period"

## Configuration Options

```typescript
interface InterventionDetectionConfig {
  // Minimum confidence required to report intervention (0-1)
  confidenceThreshold?: number; // default: 0.7
  
  // Allow detection of multiple interventions
  enableMultipleDetection?: boolean; // default: false
  
  // Add custom detection patterns
  customPatterns?: InterventionPattern[];
  
  // Enable detailed logging
  verboseLogging?: boolean; // default: false
}
```

## Integration Example

```typescript
// Full automation with intervention handling
async function automateWithDetection(userId: string) {
  const detector = new InterventionDetectionService();
  const session = await browserbaseSessionManager.createUserSession(userId, config);
  
  const stagehand = new Stagehand({
    env: 'BROWSERBASE',
    browserbaseSessionID: session.browserbase_session_id
  });
  
  await stagehand.init();
  
  // Check for interventions after navigation
  await stagehand.page.goto('https://linkedin.com/jobs/');
  const intervention = await detector.detectIntervention(stagehand);
  
  if (intervention) {
    // Log to database
    await automationService.logIntervention(
      session.id,
      intervention.type,
      debugUrl,
      intervention.pageContext,
      intervention.message
    );
    
    // Pause and notify user
    await browserbaseSessionManager.pauseSession(session.id);
    await notifyUser(intervention);
  }
}
```

## Response Structure

```typescript
interface InterventionResult {
  type: InterventionType;
  confidence: number; // 0-1
  message: string; // User-friendly message
  instructions: string; // Detailed instructions
  pageContext: {
    url?: string;
    title?: string;
    observedElements: ObserveResult[];
    relevantText?: string[];
  };
  detectedPatterns: PatternMatch[];
}
```

## Best Practices

1. **Set appropriate confidence thresholds**
   - 0.6-0.7 for continuous monitoring
   - 0.7-0.8 for standard detection
   - 0.8+ for critical operations

2. **Use custom patterns for specific sites**
   - Add site-specific keywords
   - Adjust weights based on accuracy

3. **Handle interventions appropriately**
   - LOGIN/CAPTCHA/2FA: Pause and wait for user
   - RATE_LIMIT: Automatic backoff
   - BLOCKED: Terminate session

4. **Monitor continuously for dynamic pages**
   - Check after major actions
   - Use reasonable intervals (5-10 seconds)

5. **Log all interventions**
   - Track patterns over time
   - Improve detection accuracy

## Troubleshooting

### Low Detection Rate
- Lower confidence threshold
- Add more keywords/patterns
- Check observe() instructions

### False Positives
- Increase confidence threshold
- Refine keyword patterns
- Add negative patterns

### Performance Issues
- Increase monitoring interval
- Cache observe() results
- Limit observation scope