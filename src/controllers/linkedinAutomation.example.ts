/**
 * Example integration of LinkedIn Automation API with Express
 * Shows how to set up the routes and test the endpoints
 */

import express from 'express';
import cors from 'cors';
import linkedinAutomationRoutes from '../routes/linkedinAutomation.routes';

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount LinkedIn automation routes
app.use('/api/automation/linkedin', linkedinAutomationRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LinkedIn Automation API running on port ${PORT}`);
});

// Example API calls matching Browser Use interface

/**
 * 1. Start Automation
 * POST /api/automation/linkedin/start
 */
async function startAutomationExample() {
  const response = await fetch('http://localhost:3000/api/automation/linkedin/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_SUPABASE_JWT_TOKEN'
    },
    body: JSON.stringify({
      userId: 'user-uuid-here',
      config: {
        jobTitle: 'Software Engineer',
        location: 'San Francisco, CA',
        experience: ['MID_LEVEL', 'SENIOR_LEVEL'],
        filters: {
          datePosted: 'week',
          jobType: ['FULL_TIME'],
          remote: true,
          easyApplyOnly: true,
          keywords: ['typescript', 'react', 'node.js']
        },
        maxApplications: 20
      }
    })
  });

  const data = await response.json();
  console.log('Start response:', data);
  // Expected: { sessionId, liveViewUrl, status: 'running', taskId }
  return data;
}

/**
 * 2. Get Status
 * GET /api/automation/linkedin/status/:sessionId
 */
async function getStatusExample(sessionId: string) {
  const response = await fetch(`http://localhost:3000/api/automation/linkedin/status/${sessionId}`, {
    headers: {
      'Authorization': 'Bearer YOUR_SUPABASE_JWT_TOKEN'
    }
  });

  const data = await response.json();
  console.log('Status response:', data);
  // Expected: { status, progress, currentStep, interventionRequired?, liveViewUrl? }
  return data;
}

/**
 * 3. Pause Automation
 * PUT /api/automation/linkedin/pause/:sessionId
 */
async function pauseAutomationExample(sessionId: string) {
  const response = await fetch(`http://localhost:3000/api/automation/linkedin/pause/${sessionId}`, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer YOUR_SUPABASE_JWT_TOKEN'
    }
  });

  const data = await response.json();
  console.log('Pause response:', data);
  // Expected: { success: true, status: 'paused' }
  return data;
}

/**
 * 4. Resume Automation
 * PUT /api/automation/linkedin/resume/:sessionId
 */
async function resumeAutomationExample(sessionId: string) {
  const response = await fetch(`http://localhost:3000/api/automation/linkedin/resume/${sessionId}`, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer YOUR_SUPABASE_JWT_TOKEN'
    }
  });

  const data = await response.json();
  console.log('Resume response:', data);
  // Expected: { success: true, status: 'running' }
  return data;
}

/**
 * 5. Stop Automation
 * DELETE /api/automation/linkedin/stop/:sessionId
 */
async function stopAutomationExample(sessionId: string) {
  const response = await fetch(`http://localhost:3000/api/automation/linkedin/stop/${sessionId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': 'Bearer YOUR_SUPABASE_JWT_TOKEN'
    }
  });

  const data = await response.json();
  console.log('Stop response:', data);
  // Expected: { success: true, status: 'stopped' }
  return data;
}

/**
 * 6. Continue After Intervention
 * POST /api/automation/linkedin/continue/:sessionId
 */
async function continueAfterInterventionExample(sessionId: string) {
  const response = await fetch(`http://localhost:3000/api/automation/linkedin/continue/${sessionId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_SUPABASE_JWT_TOKEN'
    },
    body: JSON.stringify({
      interventionCompleted: true
    })
  });

  const data = await response.json();
  console.log('Continue response:', data);
  // Expected: { success: true, status: 'running' }
  return data;
}

/**
 * 7. Upload Resume
 * POST /api/automation/linkedin/upload
 */
async function uploadResumeExample(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('http://localhost:3000/api/automation/linkedin/upload', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_SUPABASE_JWT_TOKEN'
    },
    body: formData
  });

  const data = await response.json();
  console.log('Upload response:', data);
  // Expected: { fileUrl, fileId }
  return data;
}

/**
 * Complete workflow example
 */
async function completeWorkflowExample() {
  try {
    // 1. Start automation
    const { sessionId } = await startAutomationExample();
    console.log('Session started:', sessionId);

    // 2. Poll for status
    const pollInterval = setInterval(async () => {
      const status = await getStatusExample(sessionId);
      
      console.log(`Status: ${status.status}`);
      console.log(`Progress: ${status.progress.appliedJobs}/${status.progress.processedJobs} jobs`);

      // Check if intervention required
      if (status.interventionRequired) {
        console.log('Intervention required:', status.interventionRequired);
        console.log('Please complete the intervention at:', status.liveViewUrl);
        
        // Pause polling
        clearInterval(pollInterval);
        
        // In a real app, notify user and wait for them to complete intervention
        // Then call continueAfterIntervention
        setTimeout(async () => {
          await continueAfterInterventionExample(sessionId);
          console.log('Continued after intervention');
        }, 30000); // Wait 30 seconds
      }

      // Check if completed
      if (status.status === 'completed' || status.status === 'failed') {
        clearInterval(pollInterval);
        console.log('Automation finished:', status.status);
      }
    }, 5000); // Poll every 5 seconds

  } catch (error) {
    console.error('Workflow error:', error);
  }
}

/**
 * Test error handling
 */
async function testErrorHandling() {
  // Test unauthorized access
  try {
    const response = await fetch('http://localhost:3000/api/automation/linkedin/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // No Authorization header
      },
      body: JSON.stringify({ userId: 'test', config: {} })
    });
    
    const data = await response.json();
    console.log('Unauthorized response:', data);
    // Expected: { error: 'Unauthorized', message: '...' }
  } catch (error) {
    console.error('Error:', error);
  }

  // Test invalid request body
  try {
    const response = await fetch('http://localhost:3000/api/automation/linkedin/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_SUPABASE_JWT_TOKEN'
      },
      body: JSON.stringify({
        // Missing required fields
        config: {}
      })
    });
    
    const data = await response.json();
    console.log('Validation error response:', data);
    // Expected: { error: 'Bad Request', message: '...', details: {...} }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Export for testing
export {
  startAutomationExample,
  getStatusExample,
  pauseAutomationExample,
  resumeAutomationExample,
  stopAutomationExample,
  continueAfterInterventionExample,
  uploadResumeExample,
  completeWorkflowExample,
  testErrorHandling
};