/**
 * Example usage of RealtimeAutomationService
 * Shows both server-side setup and client-side connection examples
 */

import express from 'express';
import { createServer } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { RealtimeAutomationService } from './realtimeAutomationService';
import { LinkedInAutomationService } from '../linkedin/linkedinAutomationService';
import { AutomationEventType } from '../../types/automation.types';

// ===== SERVER SETUP EXAMPLE =====

/**
 * Setup Express server with Realtime service
 */
async function setupServer() {
  const app = express();
  const httpServer = createServer(app);

  // Initialize Realtime service
  const realtimeService = new RealtimeAutomationService(
    httpServer,
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  await realtimeService.initialize();

  // Example: Integrate with LinkedIn Automation Service
  const linkedinService = new LinkedInAutomationService(
    {} as any, // browserbaseManager
    {} as any  // supabaseService
  );

  // Forward LinkedIn automation events to Socket.io
  linkedinService.on(AutomationEventType.PROGRESS_UPDATED, (data) => {
    const { sessionId, progress } = data;
    
    // Calculate percentage
    const percentage = progress.processedJobs > 0 
      ? Math.round((progress.appliedJobs / progress.processedJobs) * 100)
      : 0;

    // Emit via realtime service
    realtimeService.emitProgress(sessionId, {
      ...progress,
      percentage
    });
  });

  linkedinService.on(AutomationEventType.SESSION_STARTED, (data) => {
    realtimeService.emitStepUpdate(data.sessionId, 'initializing', {
      message: 'LinkedIn automation started'
    });
  });

  linkedinService.on(AutomationEventType.ERROR, (data) => {
    realtimeService.emitError(data.sessionId, {
      code: 'AUTOMATION_ERROR',
      message: data.error,
      timestamp: new Date().toISOString()
    });
  });

  // Start server
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
  });

  return { app, httpServer, realtimeService };
}

// ===== CLIENT CONNECTION EXAMPLES =====

/**
 * Example Socket.io client for frontend
 */
class AutomationRealtimeClient {
  private socket: ClientSocket | null = null;
  private token: string;
  private url: string;
  private listeners: Map<string, Set<Function>> = new Map();

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  /**
   * Connect to realtime service
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = ioClient(this.url, {
        auth: {
          token: this.token
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      this.socket.on('connect', () => {
        console.log('Connected to realtime service');
        this.setupEventHandlers();
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        reject(error);
      });

      this.socket.on('error', (error) => {
        console.error('Socket error:', error);
        this.emit('error', error);
      });
    });
  }

  /**
   * Disconnect from service
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Subscribe to a session
   */
  async subscribe(sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.emit('subscribe', { sessionId });

      this.socket.once('subscribed', (data) => {
        console.log('Subscribed to session:', data.sessionId);
        resolve();
      });

      this.socket.once('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Unsubscribe from a session
   */
  async unsubscribe(sessionId: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve();
        return;
      }

      this.socket.emit('unsubscribe', { sessionId });
      this.socket.once('unsubscribed', () => {
        resolve();
      });
    });
  }

  /**
   * Get session status
   */
  async getStatus(sessionId: string): Promise<void> {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    this.socket.emit('get_status', { sessionId });
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connected', (data) => {
      this.emit('connected', data);
    });

    // Session events
    this.socket.on('session_update', (data) => {
      this.emit('session_update', data);
    });

    this.socket.on('session_status_changed', (data) => {
      this.emit('session_status_changed', data);
    });

    // Progress events
    this.socket.on('progress_update', (data) => {
      this.emit('progress_update', data);
    });

    this.socket.on('progress_summary', (data) => {
      this.emit('progress_summary', data);
    });

    // Step updates
    this.socket.on('step_update', (data) => {
      this.emit('step_update', data);
    });

    // Status updates
    this.socket.on('status_update', (data) => {
      this.emit('status_update', data);
    });

    // Intervention events
    this.socket.on('intervention_required', (data) => {
      this.emit('intervention_required', data);
    });

    this.socket.on('intervention_alert', (data) => {
      this.emit('intervention_alert', data);
    });

    // Job events
    this.socket.on('job_applied', (data) => {
      this.emit('job_applied', data);
    });

    // Log events
    this.socket.on('log', (data) => {
      this.emit('log', data);
    });

    // Error events
    this.socket.on('error', (data) => {
      this.emit('error', data);
    });

    this.socket.on('critical_error', (data) => {
      this.emit('critical_error', data);
    });
  }

  /**
   * Add event listener
   */
  on(event: string, handler: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  /**
   * Remove event listener
   */
  off(event: string, handler?: Function): void {
    if (!this.listeners.has(event)) return;

    if (handler) {
      this.listeners.get(event)!.delete(handler);
    } else {
      this.listeners.delete(event);
    }
  }

  /**
   * Emit event to listeners
   */
  private emit(event: string, data: any): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }
}

// ===== USAGE EXAMPLES =====

/**
 * Example 1: Basic client usage
 */
async function basicClientExample() {
  const client = new AutomationRealtimeClient(
    'http://localhost:3000',
    'your-jwt-token'
  );

  try {
    // Connect to service
    await client.connect();

    // Subscribe to a session
    const sessionId = 'session-123';
    await client.subscribe(sessionId);

    // Listen for progress updates
    client.on('progress_update', (data) => {
      console.log(`Progress: ${data.progress.appliedJobs}/${data.progress.processedJobs} jobs`);
      console.log(`Percentage: ${data.progress.percentage}%`);
    });

    // Listen for interventions
    client.on('intervention_required', (data) => {
      console.log('Intervention needed:', data.type);
      console.log('Live view:', data.liveViewUrl);
      // Show notification to user
    });

    // Listen for job applications
    client.on('job_applied', (data) => {
      console.log(`Applied to ${data.jobTitle} at ${data.companyName}`);
    });

    // Get current status
    await client.getStatus(sessionId);

  } catch (error) {
    console.error('Client error:', error);
  }
}

/**
 * Example 2: React Hook for realtime updates
 */
function useAutomationRealtime(sessionId: string | null) {
  const [connected, setConnected] = React.useState(false);
  const [progress, setProgress] = React.useState<any>(null);
  const [intervention, setIntervention] = React.useState<any>(null);
  const [logs, setLogs] = React.useState<any[]>([]);
  
  const clientRef = React.useRef<AutomationRealtimeClient | null>(null);

  React.useEffect(() => {
    if (!sessionId) return;

    const client = new AutomationRealtimeClient(
      process.env.REACT_APP_WS_URL!,
      localStorage.getItem('supabase_token')!
    );

    clientRef.current = client;

    // Setup event handlers
    client.on('connected', () => setConnected(true));
    client.on('progress_update', (data) => setProgress(data.progress));
    client.on('intervention_required', (data) => setIntervention(data));
    client.on('log', (data) => setLogs(prev => [...prev, data]));

    // Connect and subscribe
    client.connect()
      .then(() => client.subscribe(sessionId))
      .catch(console.error);

    // Cleanup
    return () => {
      client.disconnect();
    };
  }, [sessionId]);

  return {
    connected,
    progress,
    intervention,
    logs,
    client: clientRef.current
  };
}

/**
 * Example 3: Multiple session monitoring
 */
async function multiSessionExample() {
  const client = new AutomationRealtimeClient(
    'http://localhost:3000',
    'your-jwt-token'
  );

  await client.connect();

  // Track multiple sessions
  const sessions = ['session-1', 'session-2', 'session-3'];
  const sessionProgress = new Map();

  // Subscribe to all sessions
  for (const sessionId of sessions) {
    await client.subscribe(sessionId);
    sessionProgress.set(sessionId, { appliedJobs: 0, processedJobs: 0 });
  }

  // Update progress for all sessions
  client.on('progress_update', (data) => {
    sessionProgress.set(data.sessionId, data.progress);
    
    // Log summary
    console.log('\nAll Sessions Progress:');
    sessionProgress.forEach((progress, id) => {
      console.log(`${id}: ${progress.appliedJobs}/${progress.processedJobs} jobs`);
    });
  });

  // Global intervention handler
  client.on('intervention_alert', (data) => {
    console.log(`\n⚠️ Intervention needed for ${data.sessionId}`);
    // Send notification to user
  });
}

/**
 * Example 4: Error handling and reconnection
 */
async function errorHandlingExample() {
  const client = new AutomationRealtimeClient(
    'http://localhost:3000',
    'your-jwt-token'
  );

  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;

  async function connectWithRetry() {
    try {
      await client.connect();
      reconnectAttempts = 0;
      console.log('Connected successfully');
    } catch (error) {
      reconnectAttempts++;
      console.error(`Connection failed (attempt ${reconnectAttempts}):`, error);
      
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        console.log(`Retrying in ${delay}ms...`);
        setTimeout(connectWithRetry, delay);
      }
    }
  }

  // Handle connection errors
  client.on('error', (error) => {
    console.error('Socket error:', error);
    
    if (error.code === 'FORBIDDEN') {
      console.log('Session access denied');
    } else if (error.code === 'RATE_LIMIT') {
      console.log('Rate limit exceeded, slow down subscriptions');
    }
  });

  // Start connection
  await connectWithRetry();
}

/**
 * Example 5: Admin dashboard monitoring all users
 */
async function adminDashboardExample() {
  const client = new AutomationRealtimeClient(
    'http://localhost:3000',
    'admin-jwt-token'
  );

  await client.connect();

  // Track all active sessions
  const activeSessions = new Map<string, {
    userId: string;
    progress: any;
    status: string;
    interventions: any[];
  }>();

  // Listen to all events (admin privileges required)
  client.on('session_update', (data) => {
    if (!activeSessions.has(data.sessionId)) {
      activeSessions.set(data.sessionId, {
        userId: '',
        progress: {},
        status: data.status,
        interventions: []
      });
    }
    
    activeSessions.get(data.sessionId)!.status = data.status;
  });

  client.on('intervention_required', (data) => {
    const session = activeSessions.get(data.sessionId);
    if (session) {
      session.interventions.push({
        type: data.type,
        timestamp: data.timestamp
      });
    }
  });

  // Display dashboard
  setInterval(() => {
    console.clear();
    console.log('=== LinkedIn Automation Dashboard ===\n');
    console.log(`Active Sessions: ${activeSessions.size}`);
    
    activeSessions.forEach((session, id) => {
      console.log(`\nSession ${id}:`);
      console.log(`  Status: ${session.status}`);
      console.log(`  Progress: ${session.progress.appliedJobs || 0} applications`);
      console.log(`  Interventions: ${session.interventions.length}`);
    });
  }, 5000);
}

// Export examples
export {
  setupServer,
  AutomationRealtimeClient,
  basicClientExample,
  useAutomationRealtime,
  multiSessionExample,
  errorHandlingExample,
  adminDashboardExample
};

// Also export React component example
export const RealtimeDemo: React.FC = () => {
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const { connected, progress, intervention, logs } = useAutomationRealtime(sessionId);

  return (
    <div>
      <h2>Realtime Automation Monitor</h2>
      
      <div>
        <input
          type="text"
          placeholder="Enter session ID"
          onChange={(e) => setSessionId(e.target.value)}
        />
      </div>

      <div>
        <p>Status: {connected ? 'Connected' : 'Disconnected'}</p>
        
        {progress && (
          <div>
            <h3>Progress</h3>
            <p>Applied: {progress.appliedJobs}/{progress.processedJobs}</p>
            <progress value={progress.percentage} max="100" />
          </div>
        )}

        {intervention && (
          <div className="alert">
            <h3>Intervention Required!</h3>
            <p>{intervention.message}</p>
            <a href={intervention.liveViewUrl} target="_blank">
              Open Browser View
            </a>
          </div>
        )}

        <div>
          <h3>Recent Logs</h3>
          {logs.slice(-10).map((log, i) => (
            <div key={i} className={`log-${log.level}`}>
              {log.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};