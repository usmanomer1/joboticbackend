# Frontend Status Handling Guide

## Overview

This guide explains how to properly handle status updates from the LinkedIn automation backend to avoid duplicate messages and provide a smooth user experience.

## The Problem

Currently, the frontend shows repeated messages like:
```
Automation is running... 2:43 AM
Automation is running... 2:43 AM
Automation is running... 2:43 AM
```

This happens because the frontend is polling the status endpoint every few seconds and displaying a message each time, even when the status hasn't changed.

## The Solution

### 1. Track Previous Status

Store the previous status and only show updates when it changes:

```javascript
// Status tracking component
const LinkedInAutomation = () => {
  const [sessionId, setSessionId] = useState(null);
  const [previousStatus, setPreviousStatus] = useState(null);
  const [messages, setMessages] = useState([]);
  
  const checkStatus = async () => {
    if (!sessionId) return;
    
    try {
      const response = await fetch(`/api/linkedin/status/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      // Only add message if status changed
      if (data.status !== previousStatus) {
        setPreviousStatus(data.status);
        addStatusMessage(data);
      }
      
      // Always update progress, but don't add duplicate messages
      updateProgress(data.progress);
      
    } catch (error) {
      console.error('Status check error:', error);
    }
  };
  
  const addStatusMessage = (data) => {
    const timestamp = new Date().toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    let message = '';
    
    switch (data.status) {
      case 'running':
        if (data.intervention?.required) {
          message = getInterventionMessage(data.intervention);
        } else if (!previousStatus) {
          message = 'Automation started! Navigating to LinkedIn...';
        } else if (previousStatus === 'intervention_required') {
          message = 'Login detected! Automation resuming...';
        } else {
          message = 'Automation is processing jobs...';
        }
        break;
        
      case 'intervention_required':
        message = 'Action required: ' + data.intervention?.message || 'Please check the browser';
        break;
        
      case 'completed':
        message = `Automation completed! Applied to ${data.progress?.totalApplications || 0} jobs.`;
        break;
        
      case 'failed':
        message = 'Automation failed. Please try again.';
        break;
        
      default:
        message = `Status: ${data.status}`;
    }
    
    // Only add if message is different from the last one
    setMessages(prev => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage?.text === message) {
        return prev; // Don't add duplicate
      }
      return [...prev, { text: message, timestamp, status: data.status }];
    });
  };
  
  // Poll every 3 seconds
  useEffect(() => {
    if (sessionId) {
      checkStatus(); // Initial check
      const interval = setInterval(checkStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [sessionId]);
  
  return (
    // Your UI here...
  );
};
```

### 2. Intervention-Specific Messages

Handle intervention states with clear, actionable messages:

```javascript
const getInterventionMessage = (intervention) => {
  switch (intervention.type) {
    case 'login':
      return '🔐 Please log in to LinkedIn in the browser window';
    case 'captcha':
      return '🤖 Please complete the security check';
    case 'two_fa':
      return '📱 Please complete two-factor authentication';
    default:
      return intervention.message || 'Manual action required';
  }
};
```

### 3. Progress Updates Without Messages

Update progress indicators without adding new messages:

```javascript
const updateProgress = (progress) => {
  if (!progress) return;
  
  // Update UI elements without adding messages
  setApplicationCount(progress.totalApplications);
  setProgressPercentage(calculatePercentage(progress));
  
  // Only show progress in existing message if actively running
  if (currentStatus === 'running' && !isIntervention) {
    updateLastMessage(`Processing... (${progress.totalApplications} applications submitted)`);
  }
};
```

### 4. Smart Message Management

Implement intelligent message handling:

```javascript
const MessageManager = {
  // Deduplicate similar messages within time window
  shouldAddMessage: (newMessage, messages, timeWindowMs = 60000) => {
    const recent = messages.filter(m => 
      Date.now() - m.timestamp < timeWindowMs
    );
    
    return !recent.some(m => 
      m.text === newMessage || 
      (m.status === newMessage.status && !isSignificantChange(m, newMessage))
    );
  },
  
  // Determine if status change is significant
  isSignificantChange: (oldStatus, newStatus) => {
    const significantTransitions = [
      ['intervention_required', 'running'], // Login completed
      ['running', 'completed'],             // Job done
      ['running', 'intervention_required'], // Need action
      ['running', 'failed']                 // Error
    ];
    
    return significantTransitions.some(([from, to]) => 
      oldStatus === from && newStatus === to
    );
  }
};
```

### 5. Complete Implementation Example

```javascript
const LinkedInAutomationStatus = () => {
  const [session, setSession] = useState({
    id: null,
    status: null,
    intervention: null,
    progress: null,
    lastUpdate: null
  });
  
  const [messages, setMessages] = useState([]);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  
  const checkStatus = async () => {
    if (!session.id) return;
    
    try {
      const response = await fetch(`/api/linkedin/status/${session.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await response.json();
      const now = Date.now();
      
      // Detect changes
      const statusChanged = data.status !== session.status;
      const interventionChanged = JSON.stringify(data.intervention) !== 
                                  JSON.stringify(session.intervention);
      
      // Update session state
      setSession(prev => ({
        ...prev,
        status: data.status,
        intervention: data.intervention,
        progress: data.progress,
        lastUpdate: now
      }));
      
      // Add message only on significant changes
      if (isFirstLoad) {
        addMessage('Automation started! Setting up LinkedIn session...');
        setIsFirstLoad(false);
      } else if (statusChanged) {
        handleStatusChange(session.status, data.status, data);
      } else if (interventionChanged && data.intervention?.required) {
        addMessage(getInterventionMessage(data.intervention));
      }
      
    } catch (error) {
      console.error('Status check failed:', error);
    }
  };
  
  const handleStatusChange = (oldStatus, newStatus, data) => {
    switch (newStatus) {
      case 'running':
        if (oldStatus === 'intervention_required') {
          addMessage('✅ Login successful! Resuming automation...');
        } else if (!oldStatus) {
          addMessage('🚀 Automation is now running');
        }
        break;
        
      case 'intervention_required':
        addMessage(`⚠️ ${data.intervention?.message || 'Action required'}`);
        break;
        
      case 'completed':
        const apps = data.progress?.totalApplications || 0;
        addMessage(`✅ Completed! Applied to ${apps} job${apps !== 1 ? 's' : ''}`);
        break;
        
      case 'failed':
        addMessage('❌ Automation failed. Please try again.');
        break;
    }
  };
  
  const addMessage = (text) => {
    const timestamp = new Date().toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    setMessages(prev => {
      // Avoid duplicate consecutive messages
      if (prev[prev.length - 1]?.text === text) {
        return prev;
      }
      
      return [...prev, { 
        id: Date.now(), 
        text, 
        timestamp 
      }];
    });
  };
  
  // Polling effect
  useEffect(() => {
    if (session.id) {
      const interval = setInterval(checkStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [session.id]);
  
  return (
    <div className="automation-status">
      <div className="message-list">
        {messages.map(msg => (
          <div key={msg.id} className="status-message">
            <span className="timestamp">{msg.timestamp}</span>
            <span className="message">{msg.text}</span>
          </div>
        ))}
      </div>
      
      {session.status === 'running' && session.progress && (
        <div className="progress-bar">
          <div className="progress-info">
            Applications: {session.progress.totalApplications}
          </div>
          <div className="progress-track">
            <div 
              className="progress-fill" 
              style={{ width: `${getProgressPercentage()}%` }}
            />
          </div>
        </div>
      )}
      
      {session.intervention?.required && (
        <InterventionPrompt 
          intervention={session.intervention}
          liveViewUrl={session.liveViewUrl}
        />
      )}
    </div>
  );
};
```

## Best Practices

### 1. Status Message Guidelines

- **Be Specific**: "Searching for software engineer jobs..." vs "Automation running"
- **Show Progress**: Include counts when available
- **Use Timestamps**: Help users understand timing
- **Emoji Indicators**: Visual cues for different states

### 2. Polling Optimization

```javascript
// Adaptive polling based on status
const getPollingInterval = (status) => {
  switch (status) {
    case 'intervention_required':
      return 2000;  // 2s - Check frequently for user action
    case 'running':
      return 5000;  // 5s - Normal operation
    case 'completed':
    case 'failed':
      return null;  // Stop polling
    default:
      return 3000;  // 3s - Default
  }
};
```

### 3. Error Handling

```javascript
const [errorCount, setErrorCount] = useState(0);

const checkStatusWithRetry = async () => {
  try {
    await checkStatus();
    setErrorCount(0); // Reset on success
  } catch (error) {
    setErrorCount(prev => prev + 1);
    
    if (errorCount > 3) {
      addMessage('⚠️ Connection lost. Please refresh the page.');
      clearInterval(pollingInterval);
    }
  }
};
```

## Summary

By implementing these patterns, you'll achieve:

1. **No Duplicate Messages**: Only show updates when status actually changes
2. **Clear Communication**: Users understand what's happening at each stage
3. **Smooth Experience**: Progress updates without message spam
4. **Smart Polling**: Adaptive intervals based on current state
5. **Better UX**: Actionable messages with visual indicators