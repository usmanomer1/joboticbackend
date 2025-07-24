# Frontend Status Fix - Simple Implementation

## Problem
The frontend keeps showing "Login required" even after you've logged in, and shows duplicate status messages.

## Solution

Here's a simple React component that properly tracks status changes:

```jsx
import React, { useState, useEffect, useRef } from 'react';

const LinkedInAutomation = () => {
  const [session, setSession] = useState({
    id: null,
    status: null,
    lastStatus: null,
    intervention: null,
    progress: null
  });
  
  const [messages, setMessages] = useState([]);
  const statusCheckInterval = useRef(null);
  
  // Start automation
  const startAutomation = async () => {
    try {
      const response = await fetch('/api/linkedin/start', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: currentUser.id,
          searchPrompt: 'software engineer in vancouver bc',
          config: {
            filters: { easyApplyOnly: true },
            maxApplications: 50
          }
        })
      });
      
      const data = await response.json();
      
      setSession(prev => ({
        ...prev,
        id: data.sessionId,
        status: 'starting'
      }));
      
      addMessage('🚀 Starting LinkedIn automation...');
      
      // Start polling for status
      startStatusPolling(data.sessionId);
      
    } catch (error) {
      console.error('Failed to start automation:', error);
      addMessage('❌ Failed to start automation');
    }
  };
  
  // Poll for status updates
  const startStatusPolling = (sessionId) => {
    // Clear any existing interval
    if (statusCheckInterval.current) {
      clearInterval(statusCheckInterval.current);
    }
    
    // Check status every 3 seconds
    statusCheckInterval.current = setInterval(() => {
      checkStatus(sessionId);
    }, 3000);
    
    // Initial check
    checkStatus(sessionId);
  };
  
  // Check session status
  const checkStatus = async (sessionId) => {
    try {
      const response = await fetch(`/api/linkedin/status/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      // Update session state
      setSession(prev => {
        // Check if status actually changed
        const statusChanged = prev.status !== data.status;
        const interventionChanged = JSON.stringify(prev.intervention) !== 
                                   JSON.stringify(data.intervention);
        
        // Add message only if something significant changed
        if (statusChanged) {
          handleStatusChange(prev.status, data.status, data);
        } else if (interventionChanged && data.intervention?.required) {
          handleInterventionChange(data.intervention);
        }
        
        return {
          ...prev,
          status: data.status,
          lastStatus: prev.status,
          intervention: data.intervention,
          progress: data.progress,
          liveViewUrl: data.liveViewUrl
        };
      });
      
      // Stop polling if session is complete or failed
      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(statusCheckInterval.current);
        statusCheckInterval.current = null;
      }
      
    } catch (error) {
      console.error('Status check failed:', error);
    }
  };
  
  // Handle status changes
  const handleStatusChange = (oldStatus, newStatus, data) => {
    console.log(`Status changed: ${oldStatus} → ${newStatus}`);
    
    switch (newStatus) {
      case 'running':
        if (oldStatus === 'intervention_required' || oldStatus === 'starting') {
          addMessage('✅ LinkedIn session active! Starting job search...');
        }
        break;
        
      case 'intervention_required':
        // Don't add message here - let intervention handler do it
        break;
        
      case 'completed':
        const apps = data.progress?.totalApplications || 0;
        addMessage(`✅ Automation completed! Applied to ${apps} jobs.`);
        break;
        
      case 'failed':
        addMessage('❌ Automation failed. Please try again.');
        break;
    }
  };
  
  // Handle intervention changes
  const handleInterventionChange = (intervention) => {
    if (!intervention || !intervention.required) return;
    
    switch (intervention.type) {
      case 'login':
        addMessage('🔐 Please log in to LinkedIn in the browser window');
        break;
      case 'captcha':
        addMessage('🤖 Please complete the security check');
        break;
      case 'two_fa':
        addMessage('📱 Please complete two-factor authentication');
        break;
      default:
        addMessage(`⚠️ ${intervention.message || 'Manual action required'}`);
    }
  };
  
  // Add message with timestamp
  const addMessage = (text) => {
    const timestamp = new Date().toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    setMessages(prev => {
      // Don't add duplicate messages
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.text === text) {
        return prev;
      }
      
      return [...prev, {
        id: Date.now(),
        text,
        timestamp
      }];
    });
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (statusCheckInterval.current) {
        clearInterval(statusCheckInterval.current);
      }
    };
  }, []);
  
  return (
    <div className="linkedin-automation">
      <h2>LinkedIn Job Automation</h2>
      
      {!session.id ? (
        <button onClick={startAutomation}>
          Start Automation
        </button>
      ) : (
        <>
          <div className="status">
            Status: {session.status || 'Unknown'}
            {session.progress && (
              <div className="progress">
                Applications: {session.progress.totalApplications}
              </div>
            )}
          </div>
          
          {session.intervention?.required && (
            <div className="intervention-alert">
              <h3>Action Required</h3>
              <p>{session.intervention.message}</p>
              {session.liveViewUrl && (
                <a 
                  href={session.liveViewUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  Open Browser Session
                </a>
              )}
            </div>
          )}
          
          <div className="messages">
            {messages.map(msg => (
              <div key={msg.id} className="message">
                <span className="time">{msg.timestamp}</span>
                <span className="text">{msg.text}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default LinkedInAutomation;
```

## Key Improvements

1. **Status Tracking**: Only shows messages when status actually changes
2. **No Duplicates**: Checks last message before adding new ones
3. **Clear Messages**: Different messages for different state transitions
4. **Auto-Resume Detection**: When status changes from `intervention_required` to `running`, it shows "LinkedIn session active!"
5. **Stop Polling**: Automatically stops polling when session completes

## How It Works

1. User starts automation
2. Frontend polls `/api/linkedin/status/:sessionId` every 3 seconds
3. Only adds messages when:
   - Status changes (e.g., `intervention_required` → `running`)
   - New intervention is detected
   - Session completes or fails
4. Avoids duplicate messages by checking the last message
5. Shows clear, actionable messages for each state

## Testing

1. Start automation
2. You should see: "🚀 Starting LinkedIn automation..."
3. When login required: "🔐 Please log in to LinkedIn in the browser window"
4. After you log in: "✅ LinkedIn session active! Starting job search..."
5. No more duplicate "Automation is running..." messages
6. When complete: "✅ Automation completed! Applied to X jobs."