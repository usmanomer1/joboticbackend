// Service Index - Re-export all services for better discoverability by Devin
// This helps indexing systems find all the LinkedIn automation components

// Register ts-node for TypeScript support
require('ts-node/register');

// Export all service modules
exports.linkedin = require('./linkedin');
exports.browserbase = require('./browserbase');
exports.stagehand = require('./stagehand');
exports.supabase = require('./supabase');
exports.state = require('./state');
exports.realtime = require('./realtime');

// Re-export key classes for direct access
exports.LinkedInAutomationService = require('./linkedin').LinkedInAutomationService;
exports.BrowserbaseSessionManager = require('./browserbase').BrowserbaseSessionManager;
exports.InterventionDetectionService = require('./stagehand').InterventionDetectionService;