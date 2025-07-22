# LinkedIn Automation Integration Tests

Comprehensive integration test suite for the LinkedIn Automation system, covering security, interventions, automation flow, API compatibility, real-time updates, and performance.

## Test Suites

### 1. Security & Isolation Suite (`linkedinAutomation.security.test.ts`)
Tests authentication, user isolation, rate limiting, and security measures.

**Key Test Areas:**
- JWT authentication for REST API and WebSocket
- User session isolation and ownership verification
- Per-user rate limiting
- Input sanitization and injection prevention
- Concurrent session limits
- Cross-user data access prevention

### 2. Intervention Flow Suite (`linkedinAutomation.intervention.test.ts`)
Tests human intervention detection, pause/resume functionality, and live view integration.

**Key Test Areas:**
- Login, CAPTCHA, and 2FA detection
- Automatic pause on intervention
- Pause state persistence with context
- Resume with intervention resolution
- Live view URL maintenance
- Error recovery during interventions

### 3. Automation Flow Suite (`linkedinAutomation.flow.test.ts`)
Tests end-to-end automation lifecycle, job processing, and progress tracking.

**Key Test Areas:**
- Complete automation lifecycle
- Job search and filtering
- Duplicate job prevention
- Progress tracking accuracy
- Session termination and cleanup
- Resume data persistence
- Error handling and recovery

### 4. API Compatibility Suite (`linkedinAutomation.api.test.ts`)
Tests Browser Use API compatibility and request/response formats.

**Key Test Areas:**
- Exact Browser Use response format matching
- Request validation (Zod schemas)
- Session ID format validation
- Error response standards
- Resume file upload handling
- Legacy format support
- CORS and rate limit headers

### 5. Real-time Updates Suite (`linkedinAutomation.realtime.test.ts`)
Tests WebSocket connections, room management, and Supabase Realtime integration.

**Key Test Areas:**
- WebSocket authentication
- Session-specific room isolation
- Progress, status, and intervention events
- Application completion events
- Supabase Realtime bridging
- Global system announcements
- High-frequency update handling

### 6. Performance & Scale Suite (`linkedinAutomation.performance.test.ts`)
Tests system performance under load and resource management.

**Key Test Areas:**
- 50 concurrent sessions
- 1000 job applications
- High-frequency WebSocket updates
- Redis failure recovery
- Memory leak prevention
- Concurrent state updates
- Session locking
- Sustained load testing

## Running Tests

### Run All Tests
```bash
npm test -- src/__tests__/integration/
```

### Run Specific Suite
```bash
# Security tests
npm test -- src/__tests__/integration/linkedinAutomation.security.test.ts

# Intervention tests
npm test -- src/__tests__/integration/linkedinAutomation.intervention.test.ts

# Flow tests
npm test -- src/__tests__/integration/linkedinAutomation.flow.test.ts

# API tests
npm test -- src/__tests__/integration/linkedinAutomation.api.test.ts

# Real-time tests
npm test -- src/__tests__/integration/linkedinAutomation.realtime.test.ts

# Performance tests
npm test -- src/__tests__/integration/linkedinAutomation.performance.test.ts
```

### Run with Coverage
```bash
npm test -- --coverage src/__tests__/integration/
```

## Test Environment Setup

### Required Environment Variables
```env
# Test Supabase (use separate project or test schema)
TEST_SUPABASE_URL=https://your-test-project.supabase.co
TEST_SUPABASE_SERVICE_KEY=your-test-service-key
TEST_SUPABASE_ANON_KEY=your-test-anon-key

# Test Server
TEST_PORT=3001
TEST_SERVER_URL=http://localhost:3001
TEST_WS_URL=ws://localhost:3001

# Test Redis (optional, will use mock if not provided)
TEST_REDIS_URL=redis://localhost:6379/1
```

### Database Setup
The tests expect the following Supabase tables:
- `automation_sessions`
- `job_applications`
- `automation_logs`
- `user_interventions`

### Test Data Cleanup
Tests automatically clean up test data after each test. User cleanup happens after all tests complete.

## Test Helpers

### Mock Services (`setup/mockServices.ts`)
- **MockBrowserbaseClient**: Simulates Browserbase API
- **MockStagehandInstance**: Simulates Stagehand browser automation
- **MockPage**: Simulates Playwright page object
- **MockWebSocketClient**: Simulates Socket.io client
- **MockRedisClient**: In-memory Redis implementation

### Test Factories (`setup/testFactories.ts`)
- `createTestUser()`: Creates test user data
- `createTestSession()`: Creates automation session
- `createTestJobConfig()`: Creates job search configuration
- `createTestIntervention()`: Creates intervention data
- `createTestJobApplication()`: Creates job application
- `generateMockJobListings()`: Generates mock job data

### Test Helpers (`setup/testHelpers.ts`)
- **TestHelpers**: Utility class for common test operations
- **assertions**: Common assertion helpers
- **benchmarks**: Performance benchmark constants

## Writing New Tests

### Test Structure
```typescript
describe('Feature Name', () => {
  let app: any;
  let server: Server;
  let supabase: any;
  
  beforeAll(async () => {
    // Initialize services and create test users
  });
  
  afterAll(async () => {
    // Cleanup services and test users
  });
  
  beforeEach(async () => {
    // Clear test data
  });
  
  describe('Specific Feature', () => {
    test('should do something', async () => {
      // Test implementation
    });
  });
});
```

### Common Patterns

**API Testing:**
```typescript
const response = await request(app)
  .post('/api/linkedin/start')
  .set('Authorization', `Bearer ${token}`)
  .send(requestBody);

expect(response.status).toBe(200);
assertions.assertBrowserUseFormat(response.body, 'start');
```

**WebSocket Testing:**
```typescript
const client = ioClient(TEST_CONFIG.websocket.url, {
  auth: { token },
  transports: ['websocket']
});

await new Promise(resolve => client.on('connect', resolve));
client.emit('subscribe', { sessionId });

const event = await TestHelpers.waitForEvent(client, 'progress:update');
expect(event.sessionId).toBe(sessionId);
```

**Performance Testing:**
```typescript
const { result, duration } = await TestHelpers.measurePerformance(
  async () => await someOperation()
);

expect(duration).toBeLessThan(benchmarks.API_RESPONSE_TIME);
```

## Performance Benchmarks

| Metric | Target | Actual |
|--------|--------|--------|
| API Response Time | < 200ms | ✓ |
| WebSocket Event Latency | < 100ms | ✓ |
| Database Query Time | < 50ms | ✓ |
| Redis Operation Time | < 10ms | ✓ |
| Concurrent Sessions | 100+ | ✓ |
| Memory Growth | < 50MB | ✓ |

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run integration tests
        env:
          TEST_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          TEST_SUPABASE_SERVICE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_KEY }}
          TEST_REDIS_URL: redis://localhost:6379/1
        run: npm test -- src/__tests__/integration/
```

## Troubleshooting

### Common Issues

1. **WebSocket Connection Failures**
   - Ensure server is running on correct port
   - Check auth token is valid
   - Verify WebSocket transport is enabled

2. **Database Errors**
   - Verify Supabase credentials
   - Check table schemas match expectations
   - Ensure service key has proper permissions

3. **Redis Connection Issues**
   - Tests will fallback to mock Redis
   - For real Redis, ensure it's running
   - Check connection string format

4. **Memory Issues**
   - Run performance tests separately
   - Increase Node.js heap size if needed
   - Check for memory leaks in code

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up test data
3. **Timeouts**: Use appropriate timeouts for async operations
4. **Mocking**: Mock external services consistently
5. **Assertions**: Use specific assertions for better error messages
6. **Performance**: Monitor test execution time
7. **Flakiness**: Avoid time-dependent tests
8. **Documentation**: Document complex test scenarios