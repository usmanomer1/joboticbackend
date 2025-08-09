const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');

// Load environment variables first
dotenv.config();

// Import middleware
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');
const { generalLimiter } = require('./src/middleware/rateLimiter');
const { authenticateApiKey } = require('./src/middleware/auth');
const { requestIdMiddleware } = require('./src/middleware/requestId');

// Import routes
const jobRoutes = require('./src/routes/jobs.routes');

// Import services for validation
const geminiClient = require('./src/utils/geminiClient');

// Create Express app
const app = express();

// Request logging middleware (simplified)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`${req.method} ${req.url}`);
  }
  next();
});

// Trust proxy if behind reverse proxy (for rate limiting)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

/**
 * Middleware Setup (order matters!)
 */

// 1. Request ID middleware (should be first)
app.use(requestIdMiddleware);

// 2. Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// 3. CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',  // Vite alternative port
  'https://portal.jobotic.ai',
  'https://jobotic.ai',
  'https://www.jobotic.ai',
  'https://veracious-meadowlark-646.convex.cloud'  // Convex deployment
];

app.use(cors({
  origin: function (origin, callback) {
    // Log the origin for debugging
    console.log('CORS check - Request origin:', origin);
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      console.log('✅ CORS allowed for:', origin);
      callback(null, true);
    } else {
      console.log('❌ CORS blocked for:', origin);
      console.log('Allowed origins:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key', 'X-Request-ID', 'Accept'],
  // Expose custom headers to frontend for streaming detection
  exposedHeaders: ['Content-Type', 'X-Stream-Format', 'X-Response-Type', 'X-Request-ID']
}));

// 4. Body parsing middleware with increased limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Timeout configuration for streaming endpoints
app.use((req, res, next) => {
  // Set longer timeout for job matching endpoint (5 minutes)
  if (req.path === '/api/jobs/match') {
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000); // 5 minutes
  } else {
    // Default timeout for other endpoints (2 minutes)
    req.setTimeout(120000); // 2 minutes
    res.setTimeout(120000); // 2 minutes
  }
  next();
});

// 6. General rate limiter for all API routes
app.use('/api', generalLimiter);

// 7. Health check endpoint (before other routes)
app.get('/api/health', (req, res) => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: Date.now(),
      environment: process.env.NODE_ENV || 'development',
      // Only expose service details in development
      ...(isDevelopment && {
        services: {
          rapidapi: !!process.env.RAPIDAPI_KEY,
          gemini: !!process.env.GEMINI_API_KEY,
          port: process.env.PORT || 3001
        }
      })
    }
  });
});

// Debug headers endpoint (development only)
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/headers', (req, res) => {
    res.json({
      success: true,
      data: {
        method: req.method,
        url: req.url,
        headers: req.headers,
        headersReceived: {
          authorization: req.headers.authorization || 'NOT FOUND',
          'x-api-key': req.headers['x-api-key'] || 'NOT FOUND',
          'content-type': req.headers['content-type'] || 'NOT FOUND',
          origin: req.headers.origin || 'NOT FOUND'
        },
        tips: [
          'If headers are missing, try lowercase names: authorization, x-api-key',
          'Railway may strip certain headers. Try alternative names like x-auth-token',
          'Ensure CORS is properly configured for your frontend domain',
          'Check Railway logs for the RAW HEADERS DEBUG output'
        ]
      }
    });
  });
  
  app.post('/api/debug/headers', (req, res) => {
    res.json({
      success: true,
      data: {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
        headersReceived: {
          authorization: req.headers.authorization || 'NOT FOUND',
          'x-api-key': req.headers['x-api-key'] || 'NOT FOUND',
          'content-type': req.headers['content-type'] || 'NOT FOUND',
          origin: req.headers.origin || 'NOT FOUND'
        }
      }
    });
  });
}

// 7. API Authentication - REMOVED for /api/jobs routes
// app.use('/api/jobs', authenticateApiKey);  // Commented out - no auth needed

// 8. Mount API routes
app.use('/api/jobs', jobRoutes);

// 9. 404 handler (after all routes)
app.use(notFoundHandler);

// 10. Global error handler (must be last!)
app.use(errorHandler);

/**
 * Startup Validation
 */
async function validateStartup() {
  console.log('=== Startup Validation ===');
  
  // Check required environment variables
  const requiredEnvVars = ['RAPIDAPI_KEY', 'GEMINI_API_KEY'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars.join(', '));
    console.error('Please set these variables in your .env file');
    process.exit(1);
  }
  
  console.log('✅ All required environment variables are set');
  
  // Test Gemini connection
  console.log('Testing Gemini AI connection...');
  const geminiConnected = await geminiClient.validateConnection();
  if (geminiConnected) {
    console.log('✅ Gemini AI connection successful');
  } else {
    console.warn('⚠️  Gemini AI connection failed - AI features will be limited');
  }
  
  // Log startup information
  console.log('\n=== Server Configuration ===');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Port: ${process.env.PORT || 3001}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`Cache TTL: ${process.env.CACHE_TTL || 7200} seconds`);
  console.log('========================\n');
}

// Local development or Railway deployment
  /**
   * Server Instance
   */
  let server;

  /**
   * Start Server
   */
  async function startServer() {
    try {
      // Run startup validation
      await validateStartup();
      
      // Start server
      const PORT = process.env.PORT || 3001;
      server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server is running on port ${PORT}`);
        console.log(`📍 API endpoints available at http://localhost:${PORT}/api`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔧 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
        
        if (process.env.NODE_ENV === 'production') {
          console.log('🔒 Running in PRODUCTION mode');
        } else {
          console.log('🛠️  Running in DEVELOPMENT mode');
        }
      });
      
      // Handle server errors
      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${PORT} is already in use`);
          process.exit(1);
        } else {
          console.error('❌ Server error:', error);
          process.exit(1);
        }
      });
      
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful Shutdown
   */
  function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    
    // Stop accepting new connections
    if (server) {
      server.close(() => {
        console.log('✅ HTTP server closed');
        
        // Exit process
        console.log('👋 Goodbye!');
        process.exit(0);
      });
      
      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error('❌ Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    } else {
      process.exit(0);
    }
  }

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    // Log the error but don't shut down for development
    if (process.env.NODE_ENV === 'production') {
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    } else {
      console.error('⚠️  Continuing despite error in development mode');
    }
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    // Log the error but don't shut down for development
    if (process.env.NODE_ENV === 'production') {
      gracefulShutdown('UNHANDLED_REJECTION');
    } else {
      console.error('⚠️  Continuing despite error in development mode');
    }
  });

// Start the server
startServer();

// Export app for testing
module.exports = app;