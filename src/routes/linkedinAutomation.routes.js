// CommonJS wrapper for TypeScript LinkedIn automation routes
// This allows server.js to require() the TypeScript route file

// Register ts-node to handle TypeScript files
require('ts-node/register');

// Export the TypeScript module
module.exports = require('./linkedinAutomation.routes.ts').default;