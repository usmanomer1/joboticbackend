# LinkedIn Automation Production Deployment Guide

## Table of Contents
1. [Environment Setup](#1-environment-setup)
2. [Infrastructure Requirements](#2-infrastructure-requirements)
3. [Security Checklist](#3-security-checklist)
4. [Deployment Steps](#4-deployment-steps)
5. [Monitoring & Alerts](#5-monitoring--alerts)
6. [Scaling Guidelines](#6-scaling-guidelines)
7. [Backup & Recovery](#7-backup--recovery)
8. [Troubleshooting Guide](#8-troubleshooting-guide)
9. [Maintenance Procedures](#9-maintenance-procedures)
10. [API Documentation](#10-api-documentation)
11. [Deployment Checklist](#11-deployment-checklist)

---

## 1. Environment Setup

### Required Environment Variables

Create a `.env.production` file with the following variables:

```bash
# Node Environment
NODE_ENV=production
PORT=3001

# API Keys
API_KEY=your-secure-api-key-min-32-chars
RAPIDAPI_KEY=your-rapidapi-key
GEMINI_API_KEY=your-gemini-api-key

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Browserbase Configuration
BROWSERBASE_API_KEY=your-browserbase-api-key
BROWSERBASE_PROJECT_ID=your-project-id

# Redis Configuration
REDIS_URL=redis://username:password@your-redis-host:6379/0
REDIS_TLS_URL=rediss://username:password@your-redis-host:6380/0

# Security
JWT_SECRET=your-jwt-secret-min-64-chars
CORS_ORIGIN=https://your-frontend-domain.com
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX_REQUESTS=10

# SSL/TLS
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
SSL_CA_PATH=/path/to/ca.pem

# Monitoring
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
LOG_LEVEL=info
LOG_FORMAT=json

# Performance
MAX_CONCURRENT_SESSIONS=3
CACHE_TTL=7200
WS_PING_INTERVAL=30000
WS_PING_TIMEOUT=10000
```

### Supabase Project Configuration

1. **Create Production Project**:
```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Create new project
supabase projects create linkedin-automation-prod \
  --org-id your-org-id \
  --plan pro \
  --region us-east-1
```

2. **Configure Database**:
```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Configure connection pooling
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET work_mem = '16MB';
```

3. **Apply Migrations**:
```bash
# Run migrations from supabase directory
cd supabase
supabase db push --db-url postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
```

4. **Configure Row Level Security**:
```sql
-- Enable RLS on all tables
ALTER TABLE automation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interventions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can only access own sessions"
  ON automation_sessions
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can only access own applications"
  ON job_applications
  FOR ALL
  USING (
    session_id IN (
      SELECT id FROM automation_sessions 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can only access own logs"
  ON automation_logs
  FOR ALL
  USING (
    session_id IN (
      SELECT id FROM automation_sessions 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can only access own interventions"
  ON user_interventions
  FOR ALL
  USING (
    session_id IN (
      SELECT id FROM automation_sessions 
      WHERE user_id = auth.uid()
    )
  );
```

### Browserbase Project Setup

1. **Create Production Context**:
```bash
curl -X POST https://api.browserbase.com/v1/contexts \
  -H "Authorization: Bearer $BROWSERBASE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "linkedin-automation-prod",
    "settings": {
      "viewport": { "width": 1920, "height": 1080 },
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "locale": "en-US",
      "timezone": "America/New_York",
      "geolocation": null,
      "blockAds": true,
      "blockTrackers": true,
      "recordVideo": true,
      "recordNetworkActivity": true
    },
    "sessionLimit": 100,
    "sessionTTL": 14400
  }'
```

### Redis Configuration (Production)

1. **Redis Configuration File**:
```bash
# redis.conf
bind 0.0.0.0
protected-mode yes
port 6379
tcp-backlog 511
timeout 300
tcp-keepalive 60

# Persistence
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb

# Memory Management
maxmemory 2gb
maxmemory-policy allkeys-lru
maxmemory-samples 5

# Security
requirepass your-secure-redis-password
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG ""

# SSL/TLS
tls-port 6380
tls-cert-file /path/to/redis.crt
tls-key-file /path/to/redis.key
tls-ca-cert-file /path/to/ca.crt
```

### SSL/TLS Requirements

1. **Generate SSL Certificates**:
```bash
# Using Let's Encrypt
sudo certbot certonly --standalone \
  -d api.yourdomain.com \
  -d ws.yourdomain.com \
  --non-interactive \
  --agree-tos \
  --email admin@yourdomain.com
```

2. **Configure HTTPS Server**:
```javascript
// server.js
const https = require('https');
const fs = require('fs');

const httpsOptions = {
  cert: fs.readFileSync(process.env.SSL_CERT_PATH),
  key: fs.readFileSync(process.env.SSL_KEY_PATH),
  ca: fs.readFileSync(process.env.SSL_CA_PATH)
};

const server = https.createServer(httpsOptions, app);
```

---

## 2. Infrastructure Requirements

### Server Specifications

#### Minimum Requirements (10-50 concurrent users):
```yaml
Application Server:
  CPU: 4 vCPUs (2.4 GHz+)
  RAM: 8 GB
  Storage: 50 GB SSD
  Network: 1 Gbps
  OS: Ubuntu 22.04 LTS

Load Balancer:
  Type: Application Load Balancer (ALB)
  Listeners: HTTPS (443), WSS (443)
  Health Check: /health
  Sticky Sessions: Enabled for WebSocket
```

#### Recommended Requirements (50-200 concurrent users):
```yaml
Application Servers (3x):
  CPU: 8 vCPUs (3.0 GHz+)
  RAM: 16 GB
  Storage: 100 GB SSD
  Network: 10 Gbps
  Auto-scaling: 3-10 instances

Redis Cluster:
  Type: Redis 7.0+ Cluster
  Nodes: 3 masters + 3 replicas
  RAM: 8 GB per node
  Persistence: AOF + RDB
  Backups: Daily snapshots
```

### Database Sizing for Supabase

```javascript
// Estimated storage requirements
const storageCalculation = {
  users: 10000,
  sessionsPerUser: 100,
  applicationsPerSession: 50,
  logsPerSession: 200,
  
  // Storage per record
  sessionSize: 2048,      // 2KB per session
  applicationSize: 1024,  // 1KB per application
  logSize: 512,          // 0.5KB per log
  interventionSize: 1024, // 1KB per intervention
  
  // Total calculations
  totalSessions: 10000 * 100,                    // 1M sessions
  totalApplications: 10000 * 100 * 50,           // 50M applications
  totalLogs: 10000 * 100 * 200,                 // 100M logs
  totalInterventions: 10000 * 100 * 10,         // 10M interventions
  
  // Storage in GB
  sessionStorage: (1000000 * 2048) / (1024**3),     // ~2GB
  applicationStorage: (50000000 * 1024) / (1024**3), // ~47GB
  logStorage: (100000000 * 512) / (1024**3),        // ~48GB
  interventionStorage: (10000000 * 1024) / (1024**3), // ~10GB
  
  // Total with 30% index overhead
  totalStorage: Math.ceil((2 + 47 + 48 + 10) * 1.3) // ~140GB
};

// Recommended Supabase Plan: Pro ($25/month)
// Database Size: 500GB included
// Connections: 200 direct + 3,000 pooled
// Compute: 2-8 CPUs, 1-32GB RAM (auto-scaling)
```

### Redis Memory Requirements

```javascript
// Memory calculation per session
const memoryPerSession = {
  sessionState: 2048,        // 2KB
  pauseState: 1024,         // 1KB
  progress: 512,            // 0.5KB
  userSessions: 256,        // 0.25KB per session reference
  appliedJobs: 64 * 1000,   // 64B * 1000 jobs
  locks: 128,               // 128B
  total: 68000              // ~68KB per active session
};

// Total Redis memory calculator
const calculateRedisMemory = (concurrentSessions) => {
  const sessionMemory = concurrentSessions * memoryPerSession.total;
  const overhead = sessionMemory * 0.25; // 25% Redis overhead
  const buffer = sessionMemory * 0.5;    // 50% buffer
  return (sessionMemory + overhead + buffer) / (1024 * 1024 * 1024); // GB
};

// Examples:
// 100 sessions: ~10GB Redis
// 500 sessions: ~51GB Redis
// 1000 sessions: ~102GB Redis
```

### Cost Estimation Calculator

```javascript
const calculateMonthlyCost = (users, sessionsPerUser) => {
  const costs = {
    // Infrastructure (AWS)
    servers: {
      application: 3 * 150,  // 3x t3.xlarge ($150/month each)
      loadBalancer: 25,      // ALB
      bandwidth: users * 10 * 0.09 // 10GB per user * $0.09/GB
    },
    
    // Supabase Pro Plan
    database: {
      base: 25,              // Pro plan base cost
      storage: Math.ceil((users * sessionsPerUser * 0.2) / 1000) * 125, // Additional storage
      bandwidth: users * 5 * 0.09 // 5GB per user * $0.09/GB
    },
    
    // Redis (AWS ElastiCache)
    redis: {
      nodes: 6 * 50,         // 6x cache.t3.medium ($50/month each)
      backup: 20             // Backup storage
    },
    
    // Browserbase Growth Plan
    browserbase: {
      base: 99,              // Growth plan base
      additionalSessions: Math.max(0, (users * sessionsPerUser - 10000) * 0.01)
    },
    
    // Monitoring & Tools
    monitoring: {
      sentry: 26,            // Team plan
      datadog: 50,           // Infrastructure monitoring
      cloudwatch: 30         // AWS CloudWatch
    }
  };
  
  const total = Object.values(costs).reduce((sum, category) => 
    sum + Object.values(category).reduce((s, v) => s + v, 0), 0
  );
  
  return {
    breakdown: costs,
    total,
    perUser: total / users
  };
};

// Example: 1000 users, 10 sessions/month
// Total: ~$1,500/month ($1.50 per user)
```

---

## 3. Security Checklist

### Database Security
- [x] **Supabase RLS policies enabled** ✓
- [x] **Database connections encrypted** ✓
- [x] **Connection pooling configured** ✓
- [x] **Backup encryption enabled** ✓

### API Security
- [x] **API rate limiting configured**
  ```javascript
  const rateLimit = require('express-rate-limit');
  const RedisStore = require('rate-limit-redis');
  
  const limiter = rateLimit({
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:',
    }),
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 requests per hour
    message: 'Rate limit exceeded',
    standardHeaders: true,
  });
  ```

- [x] **JWT verification active**
  ```javascript
  const verifyJWT = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Missing token' });
    }
    
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error) throw error;
      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
  ```

### Network Security
- [x] **HTTPS enforced**
  ```javascript
  // Force HTTPS redirect
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
  ```

- [x] **Environment variables secured**
  ```bash
  # Use AWS Secrets Manager
  aws secretsmanager create-secret \
    --name linkedin-automation/production \
    --secret-string file://secrets.json
  ```

### Application Security
- [x] **Browserbase contexts isolated**
- [x] **Session ownership verified**
- [x] **Input validation active** (Zod schemas)
- [x] **Error messages sanitized**
- [x] **Logs don't contain sensitive data**

---

## 4. Deployment Steps

### Database Migration Process

1. **Backup existing data**:
```bash
# Backup current database
pg_dump $SUPABASE_DB_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

2. **Run migrations**:
```bash
# Apply migrations from supabase directory
cd supabase
supabase db push --db-url $PRODUCTION_DB_URL
```

3. **Verify migration**:
```sql
-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- Verify RLS policies
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public';
```

### Application Deployment (Docker)

1. **Create Dockerfile**:
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production
RUN npm install -g typescript

# Copy source code
COPY src ./src
COPY .env.production ./.env

# Build TypeScript
RUN npm run build

# Production image
FROM node:18-alpine

RUN apk add --no-cache tini

WORKDIR /app

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD node healthcheck.js

EXPOSE 3001

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/server.js"]
```

2. **Kubernetes Deployment**:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: linkedin-automation
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: linkedin-automation
  template:
    metadata:
      labels:
        app: linkedin-automation
    spec:
      containers:
      - name: app
        image: your-registry.com/linkedin-automation:v1.0.0
        ports:
        - containerPort: 3001
        envFrom:
        - secretRef:
            name: linkedin-automation-secrets
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 60
        readinessProbe:
          httpGet:
            path: /ready
            port: 3001
          initialDelaySeconds: 30
```

### Health Check Setup

```javascript
// healthcheck.js
const express = require('express');
const router = express.Router();

// Liveness probe
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness probe
router.get('/ready', async (req, res) => {
  const checks = {
    database: false,
    redis: false,
    browserbase: false
  };

  try {
    // Check Supabase
    const { error } = await supabase.from('automation_sessions').select('id').limit(1);
    checks.database = !error;

    // Check Redis
    const pong = await redis.ping();
    checks.redis = pong === 'PONG';

    // Check Browserbase
    const response = await fetch('https://api.browserbase.com/v1/health');
    checks.browserbase = response.ok;

    const allHealthy = Object.values(checks).every(v => v);
    res.status(allHealthy ? 200 : 503).json({ checks });
  } catch (error) {
    res.status(503).json({ error: error.message, checks });
  }
});

module.exports = router;
```

---

## 5. Monitoring & Alerts

### Key Metrics to Track

```yaml
Application Metrics:
  - Request rate (req/sec)
  - Response time (p50, p95, p99)
  - Error rate (4xx, 5xx)
  - Active sessions count
  - WebSocket connections
  - Job applications/hour
  - Intervention rate

Infrastructure Metrics:
  - CPU utilization (%)
  - Memory usage (%)
  - Disk I/O (read/write)
  - Network throughput (in/out)
  - Container restarts
  - Pod autoscaling events

Database Metrics:
  - Connection pool usage
  - Query execution time
  - Storage usage
  - Cache hit ratio

Redis Metrics:
  - Memory usage
  - Hit/miss ratio
  - Connected clients
  - Commands/sec

Browserbase Metrics:
  - Active sessions
  - Session creation time
  - API rate limits
```

### Alert Thresholds

```javascript
const alertRules = {
  critical: {
    errorRate: { threshold: 0.05, duration: '5m' }, // >5% errors
    responseTime: { threshold: 2000, duration: '5m' }, // >2s
    availability: { threshold: 0.99, duration: '1m' }, // <99%
    diskSpace: { threshold: 0.9, duration: '5m' }, // >90% used
  },
  
  warning: {
    errorRate: { threshold: 0.02, duration: '10m' }, // >2% errors
    responseTime: { threshold: 1000, duration: '10m' }, // >1s
    memoryUsage: { threshold: 0.8, duration: '10m' }, // >80%
    cpuUsage: { threshold: 0.7, duration: '15m' }, // >70%
  }
};
```

### Error Tracking (Sentry)

```javascript
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app }),
  ],
  tracesSampleRate: 0.1,
});

// Error boundary
app.use(Sentry.Handlers.errorHandler());
```

---

## 6. Scaling Guidelines

### Horizontal Scaling Approach

```yaml
# Horizontal Pod Autoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: linkedin-automation-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: linkedin-automation
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Database Connection Pooling

```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    db: {
      schema: 'public'
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        'x-connection-pool': 'linkedin-automation'
      }
    }
  }
);
```

### WebSocket Scaling Strategy

```javascript
const Redis = require('ioredis');
const { createAdapter } = require('@socket.io/redis-adapter');

// Redis adapter for Socket.io
const pubClient = new Redis(process.env.REDIS_URL);
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

---

## 7. Backup & Recovery

### Supabase Backup Strategy

```bash
#!/bin/bash
# supabase-backup.sh

SUPABASE_DB_URL="postgresql://postgres:password@db.your-project.supabase.co:5432/postgres"
BACKUP_BUCKET="linkedin-automation-backups"

# Create backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="supabase_backup_$TIMESTAMP.sql.gz"

pg_dump $SUPABASE_DB_URL | gzip > /tmp/$BACKUP_FILE

# Upload to S3
aws s3 cp /tmp/$BACKUP_FILE \
  s3://$BACKUP_BUCKET/daily/$BACKUP_FILE

# Cleanup local file
rm /tmp/$BACKUP_FILE
```

### Redis Persistence Config

```bash
# redis.conf
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
save 900 1
save 300 10
save 60 10000
```

### GDPR Compliance

```javascript
// Data export endpoint
router.get('/gdpr/export/:userId', async (req, res) => {
  const { userId } = req.params;
  
  const userData = {
    sessions: await getUserSessions(userId),
    applications: await getUserApplications(userId),
    logs: await getUserLogs(userId)
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=user_data_${userId}.json`);
  res.send(JSON.stringify(userData, null, 2));
});

// Data deletion endpoint
router.delete('/gdpr/delete/:userId', async (req, res) => {
  await deleteUserData(req.params.userId);
  res.json({ message: 'User data deleted successfully' });
});
```

---

## 8. Troubleshooting Guide

### Common Error Patterns

#### Session Stuck in Running State
```javascript
// Find stuck sessions
const stuckSessions = await supabase
  .from('automation_sessions')
  .select('*')
  .eq('status', 'running')
  .lt('updated_at', new Date(Date.now() - 3600000).toISOString());

// Mark as failed
for (const session of stuckSessions.data) {
  await supabase
    .from('automation_sessions')
    .update({ 
      status: 'failed',
      error: 'Session timeout'
    })
    .eq('id', session.id);
}
```

#### WebSocket Connection Issues
```javascript
// Client reconnection strategy
const socket = io({
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 20000
});
```

### Debug Mode Activation

```javascript
// Enable debug logging
const debugMode = {
  enable: async (sessionId) => {
    await supabase
      .from('automation_sessions')
      .update({ debug_mode: true })
      .eq('id', sessionId);
      
    return {
      debugUrl: `https://browserbase.com/debug/${sessionId}`,
      logStreamUrl: `/api/debug/${sessionId}/logs`
    };
  }
};
```

---

## 9. Maintenance Procedures

### Cleanup Job Schedules

```javascript
const cron = require('node-cron');

// Daily cleanup - 2 AM
cron.schedule('0 2 * * *', async () => {
  // Clean old logs
  await supabase
    .from('automation_logs')
    .delete()
    .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  // Clean completed sessions older than 30 days
  await supabase
    .from('automation_sessions')
    .delete()
    .eq('status', 'completed')
    .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
});
```

### Certificate Renewal

```bash
#!/bin/bash
# cert-renewal.sh

# Check certificate expiry
check_cert_expiry() {
    local domain=$1
    local cert_file="/etc/letsencrypt/live/$domain/cert.pem"
    
    if [ -f "$cert_file" ]; then
        local expiry_date=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
        local days_left=$(( ($(date -d "$expiry_date" +%s) - $(date +%s)) / 86400 ))
        
        if [ $days_left -lt 30 ]; then
            certbot renew --standalone
            systemctl reload nginx
        fi
    fi
}

check_cert_expiry "api.yourdomain.com"
```

---

## 10. API Documentation

### OpenAPI/Swagger Spec

```yaml
openapi: 3.0.0
info:
  title: LinkedIn Automation API
  version: 1.0.0
  description: API for automated LinkedIn job applications

servers:
  - url: https://api.yourdomain.com
    description: Production server

security:
  - bearerAuth: []

paths:
  /api/linkedin/start:
    post:
      summary: Start automation session
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/StartAutomationRequest'
      responses:
        '200':
          description: Session started successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/StartAutomationResponse'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

  schemas:
    StartAutomationRequest:
      type: object
      required:
        - userId
        - config
      properties:
        userId:
          type: string
          format: uuid
        config:
          $ref: '#/components/schemas/JobSearchConfig'

    JobSearchConfig:
      type: object
      required:
        - jobTitle
        - location
        - maxApplications
      properties:
        jobTitle:
          type: string
          minLength: 1
          maxLength: 100
        location:
          type: string
          minLength: 1
          maxLength: 100
        maxApplications:
          type: integer
          minimum: 1
          maximum: 100
        easyApplyOnly:
          type: boolean
          default: true

    StartAutomationResponse:
      type: object
      properties:
        sessionId:
          type: string
          pattern: '^task_[a-f0-9-]+$'
        liveViewUrl:
          type: string
          format: uri
        status:
          type: string
          enum: [running]
        taskId:
          type: string
          pattern: '^task_[a-f0-9-]+$'
```

### Rate Limit Details

| Tier | Requests/Hour | Concurrent Sessions |
|------|---------------|-------------------|
| Free | 5 | 1 |
| Pro | 20 | 3 |
| Enterprise | 100 | 10 |

### WebSocket Protocol

```javascript
// Connect to WebSocket
const socket = io('wss://api.yourdomain.com', {
  auth: { token: 'your-jwt-token' }
});

// Subscribe to session updates
socket.emit('subscribe', { sessionId: 'task_123' });

// Handle events
socket.on('progress:update', (data) => {
  console.log(`Progress: ${data.progress.appliedJobs}/${data.progress.totalJobs}`);
});

socket.on('intervention:required', (data) => {
  console.log(`Intervention needed: ${data.type}`);
  window.open(data.liveViewUrl, '_blank');
});
```

---

## 11. Deployment Checklist

### Pre-Deployment Checklist

#### Code Preparation
- [ ] All tests passing locally
  ```bash
  npm test && npm run test:integration
  ```
- [ ] Linting and type checking pass
  ```bash
  npm run lint && npm run type-check
  ```
- [ ] Security audit clean
  ```bash
  npm audit
  ```
- [ ] Version bumped and tagged
  ```bash
  npm version patch
  git push origin main --tags
  ```

#### Environment Verification
- [ ] Production environment variables reviewed
- [ ] SSL certificates valid for >30 days
- [ ] Database migrations tested on staging
- [ ] Redis cluster healthy
- [ ] Browserbase quota sufficient

#### Backup Creation
- [ ] Database backup completed
  ```bash
  pg_dump $PRODUCTION_DB_URL | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
  ```
- [ ] Redis backup completed
  ```bash
  redis-cli BGSAVE
  ```
- [ ] Backup verification completed

### Deployment Steps

#### Database Migration
- [ ] Run database migrations
  ```bash
  cd supabase && supabase db push
  ```
- [ ] Verify migrations completed
- [ ] Test critical queries

#### Application Deployment
- [ ] Build and push Docker image
  ```bash
  docker build -t your-registry.com/linkedin-automation:v1.0.0 .
  docker push your-registry.com/linkedin-automation:v1.0.0
  ```
- [ ] Update Kubernetes deployment
  ```bash
  kubectl set image deployment/linkedin-automation app=your-registry.com/linkedin-automation:v1.0.0
  ```
- [ ] Monitor rollout status
  ```bash
  kubectl rollout status deployment/linkedin-automation
  ```

#### Service Verification
- [ ] Health check passing
- [ ] API endpoints responding
- [ ] WebSocket connections working
- [ ] Rate limiting active

### Post-Deployment Verification

- [ ] No error spike in logs
- [ ] Metrics within normal range
- [ ] Functional testing passed
- [ ] Performance validation completed
- [ ] Security verification completed

### Rollback Procedures

#### Immediate Rollback
1. [ ] Announce rollback
2. [ ] Rollback Kubernetes deployment
   ```bash
   kubectl rollout undo deployment/linkedin-automation
   ```
3. [ ] Verify rollback completed
4. [ ] Run health checks

#### Database Rollback
1. [ ] Stop application
2. [ ] Restore database backup
3. [ ] Verify data integrity
4. [ ] Restart with previous version

### Emergency Contacts

- **On-Call Engineer**: +1-xxx-xxx-xxxx
- **DevOps Lead**: +1-xxx-xxx-xxxx
- **Database Admin**: +1-xxx-xxx-xxxx

---

## Conclusion

This comprehensive production deployment guide provides all the necessary information and procedures for successfully deploying and maintaining the LinkedIn Automation system in a production environment. Follow the checklists carefully and maintain regular updates to this documentation as the system evolves.

For additional support, refer to the troubleshooting section or contact the development team.