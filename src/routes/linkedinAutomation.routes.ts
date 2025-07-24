import { Router } from 'express';
import { LinkedInAutomationController } from '../controllers/linkedinAutomation.controller';

const router = Router();
const controller = new LinkedInAutomationController();

// Test endpoint - no middleware, placed BEFORE auth middleware
router.get('/test', (req, res) => {
  console.log('TEST ENDPOINT HIT - No middleware');
  res.json({ message: 'LinkedIn routes are working - no auth' });
});

router.post('/test-continue/:sessionId', (req, res) => {
  console.log('TEST CONTINUE ENDPOINT HIT:', {
    sessionId: req.params.sessionId,
    headers: req.headers,
    body: req.body
  });
  res.json({ message: 'Test continue endpoint working', sessionId: req.params.sessionId });
});

// Temporary: continue endpoint without auth for testing
router.post('/continue-noauth/:sessionId', async (req, res) => {
  console.log('CONTINUE NO AUTH - Request received:', {
    sessionId: req.params.sessionId,
    hasAuthHeader: !!req.headers.authorization,
    authHeaderStart: req.headers.authorization?.substring(0, 30)
  });
  
  try {
    // Call the controller method directly, bypassing auth
    const controller = new LinkedInAutomationController();
    // Fake the user for testing
    (req as any).user = { id: '27c01ed9-a739-45fc-a2aa-ac30c2749424' };
    await controller.continueAfterIntervention(req, res);
  } catch (error) {
    console.error('Continue no auth error:', error);
    res.status(500).json({ error: 'Internal error', message: error.message });
  }
});

// Apply authentication middleware to all routes
router.use(controller.validateAuth.bind(controller));

// Apply rate limiting middleware to all routes
router.use(controller.checkRateLimit.bind(controller));

// Define routes matching Browser Use interface
router.post('/start', controller.startAutomation.bind(controller));
router.get('/status/:sessionId', controller.getStatus.bind(controller));
router.put('/pause/:sessionId', controller.pauseAutomation.bind(controller));
router.put('/resume/:sessionId', controller.resumeAutomation.bind(controller));
router.delete('/stop/:sessionId', controller.stopAutomation.bind(controller));
router.post('/continue/:sessionId', controller.continueAfterIntervention.bind(controller));
router.post('/upload', controller.uploadFile.bind(controller));

export default router;