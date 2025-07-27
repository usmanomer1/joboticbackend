# Jobotic Backend Documentation

## Available Documentation

### 1. LinkedIn Automation Frontend Guide (2025)
**File**: `LINKEDIN_AUTOMATION_FRONTEND_GUIDE_2025.md`

Comprehensive guide for integrating with the LinkedIn automation backend API. Includes:
- Complete API endpoints documentation
- Frontend integration examples
- WebSocket event handling
- Session management
- Error handling patterns

### 2. Resume Data Table Schema
**File**: `RESUME_DATA_TABLE_SCHEMA.md`

Database schema documentation for resume-related tables in Supabase:
- Table structures
- Field descriptions
- Relationships
- Data types and constraints

## Project Structure

The backend uses the following key services:

### LinkedIn Automation
- **HybridJobSearchFlow**: Main automation flow using Stagehand and Browserbase
- **JobApplicationAgent**: Handles job application logic
- **JobDataCache**: Caches job data to avoid reprocessing
- **AutomationMetrics**: Tracks automation performance metrics
- **ObserveCache**: Caches Stagehand observe results for efficiency

### Core Services
- **Browserbase**: Browser automation infrastructure
- **Stagehand**: AI-powered browser automation
- **Supabase**: Database and authentication
- **Google Gemini**: AI for job matching

## Key Technologies
- Node.js with TypeScript
- Express.js for API
- Socket.IO for real-time updates
- Browserbase for browser automation
- Stagehand for AI-powered automation
- Supabase for database
- Google Gemini for AI matching