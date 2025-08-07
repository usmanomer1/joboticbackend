/**
 * Convex Client Service
 * Handles connection to Convex backend
 */

const { ConvexHttpClient } = require('convex/browser');
require('dotenv').config({ path: '.env.local' });

// Initialize Convex client
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  console.error('❌ Missing NEXT_PUBLIC_CONVEX_URL in .env.local');
  console.log('Please run: npx convex dev');
}

const convex = new ConvexHttpClient(convexUrl || '');

module.exports = {
  convex
};