import { Router } from 'express';
import { LinkedInAutomationController } from '../controllers/linkedinAutomation.controller';

const router = Router();
const controller = new LinkedInAutomationController();

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