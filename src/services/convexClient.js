/**
 * Convex Client Service
 * Handles connection to Convex backend
 */

const { ConvexHttpClient } = require('convex/browser');
require('dotenv').config({ path: '.env.local' });

// Initialize Convex client (prefer server-side env var)
const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  console.error('❌ Missing CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL) in environment');
  console.log('Tip: set CONVEX_URL for backend usage. You can run `npx convex dev` locally.');
}

const convex = new ConvexHttpClient(convexUrl || '');

module.exports = {
  convex
};