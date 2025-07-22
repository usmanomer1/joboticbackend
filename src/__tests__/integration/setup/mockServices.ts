import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

/**
 * Mock Browserbase Client
 */
export class MockBrowserbaseClient {
  private sessions: Map<string, any> = new Map();
  
  async createSession(contextId: string): Promise<{ sessionId: string; debugUrl: string }> {
    const sessionId = `mock-bb-${uuidv4()}`;
    const debugUrl = `https://mock.browserbase.com/debug/${sessionId}`;
    
    this.sessions.set(sessionId, {
      sessionId,
      contextId,
      debugUrl,
      status: 'active',
      createdAt: new Date()
    });
    
    return { sessionId, debugUrl };
  }
  
  async pauseSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'paused';
    }
  }
  
  async resumeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'active';
    }
  }
  
  async terminateSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
  
  async getSession(sessionId: string): Promise<any> {
    return this.sessions.get(sessionId);
  }
  
  getDebugUrl(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    return session?.debugUrl || '';
  }
  
  // Test helpers
  getAllSessions(): Map<string, any> {
    return this.sessions;
  }
  
  clearAllSessions(): void {
    this.sessions.clear();
  }
}

/**
 * Mock Stagehand Instance
 */
export class MockStagehandInstance extends EventEmitter {
  public page: MockPage;
  public browserbaseSessionId: string;
  private isInitialized: boolean = false;
  private interventionSimulation: any = null;
  
  constructor(config: { browserbaseSessionID: string }) {
    super();
    this.browserbaseSessionId = config.browserbaseSessionID;
    this.page = new MockPage();
  }
  
  async init(): Promise<void> {
    this.isInitialized = true;
    this.emit('initialized');
  }
  
  async close(): Promise<void> {
    this.isInitialized = false;
    this.emit('closed');
  }
  
  async act(instruction: { action: string }): Promise<void> {
    // Simulate action execution
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check for intervention simulation
    if (this.interventionSimulation) {
      throw new Error('Intervention required');
    }
  }
  
  async extract(config: { instruction: string; schema: any }): Promise<any> {
    // Return mock data based on instruction
    if (config.instruction.includes('job listings')) {
      return Array.from({ length: 10 }, (_, i) => ({
        id: `job-${i + 1}`,
        title: `Software Engineer ${i + 1}`,
        company: `Company ${i + 1}`,
        location: 'San Francisco, CA',
        isEasyApply: true
      }));
    }
    
    if (config.instruction.includes('job description')) {
      return {
        description: 'We are looking for a talented engineer...',
        requirements: ['5+ years experience', 'TypeScript', 'React'],
        benefits: ['Health insurance', '401k', 'Remote work']
      };
    }
    
    return {};
  }
  
  async observe(config: { instruction: string }): Promise<any[]> {
    // Return observations based on instruction
    if (this.interventionSimulation) {
      const { type, elements } = this.interventionSimulation;
      return elements;
    }
    
    return [];
  }
  
  // Test helpers
  simulateIntervention(type: string): void {
    const interventions: Record<string, any> = {
      login: {
        type: 'LOGIN',
        elements: [
          { selector: 'input[type="email"]', description: 'Email input field' },
          { selector: 'input[type="password"]', description: 'Password input field' },
          { selector: 'button', description: 'Sign in button', method: 'click' }
        ]
      },
      captcha: {
        type: 'CAPTCHA',
        elements: [
          { selector: 'div.recaptcha', description: 'ReCAPTCHA widget' },
          { selector: 'iframe', description: 'ReCAPTCHA iframe' }
        ]
      },
      twoFa: {
        type: 'TWO_FA',
        elements: [
          { selector: 'input[name="code"]', description: '6 digit code input' },
          { selector: 'button', description: 'Verify button', method: 'click' }
        ]
      }
    };
    
    this.interventionSimulation = interventions[type] || null;
  }
  
  clearIntervention(): void {
    this.interventionSimulation = null;
  }
}

/**
 * Mock Page object
 */
export class MockPage {
  private currentUrl: string = '';
  private pageTitle: string = 'Mock Page';
  
  async goto(url: string, options?: any): Promise<void> {
    this.currentUrl = url;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  async waitForTimeout(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async evaluate(fn: Function): Promise<any> {
    // Mock page evaluation
    return fn();
  }
  
  async title(): Promise<string> {
    return this.pageTitle;
  }
  
  url(): string {
    return this.currentUrl;
  }
  
  async waitForSelector(selector: string, options?: any): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Test helpers
  setUrl(url: string): void {
    this.currentUrl = url;
  }
  
  setTitle(title: string): void {
    this.pageTitle = title;
  }
}

/**
 * Mock WebSocket Client
 */
export class MockWebSocketClient extends EventEmitter {
  public connected: boolean = false;
  public rooms: Set<string> = new Set();
  public sentEvents: any[] = [];
  
  constructor(public url: string, public auth: { token: string }) {
    super();
  }
  
  connect(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.connected = true;
        this.emit('connect');
        resolve();
      }, 100);
    });
  }
  
  disconnect(): void {
    this.connected = false;
    this.rooms.clear();
    this.emit('disconnect');
  }
  
  emit(event: string, data?: any): boolean {
    this.sentEvents.push({ event, data, timestamp: new Date() });
    
    // Handle specific events
    if (event === 'subscribe' && data?.sessionId) {
      this.rooms.add(`session:${data.sessionId}`);
      setTimeout(() => {
        super.emit('subscribed', { sessionId: data.sessionId });
      }, 50);
    }
    
    if (event === 'unsubscribe' && data?.sessionId) {
      this.rooms.delete(`session:${data.sessionId}`);
      setTimeout(() => {
        super.emit('unsubscribed', { sessionId: data.sessionId });
      }, 50);
    }
    
    return super.emit(event, data);
  }
  
  // Test helpers
  simulateServerEvent(event: string, data: any): void {
    super.emit(event, data);
  }
  
  getEventHistory(): any[] {
    return this.sentEvents;
  }
  
  clearEventHistory(): void {
    this.sentEvents = [];
  }
}

/**
 * Mock Redis Client
 */
export class MockRedisClient {
  private store: Map<string, any> = new Map();
  private ttls: Map<string, number> = new Map();
  
  async get(key: string): Promise<string | null> {
    this.checkExpired(key);
    return this.store.get(key) || null;
  }
  
  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }
  
  async setex(key: string, ttl: number, value: string): Promise<'OK'> {
    this.store.set(key, value);
    this.ttls.set(key, Date.now() + (ttl * 1000));
    return 'OK';
  }
  
  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    this.ttls.delete(key);
    return existed ? 1 : 0;
  }
  
  async incr(key: string): Promise<number> {
    const current = parseInt(this.store.get(key) || '0');
    const newValue = current + 1;
    this.store.set(key, newValue.toString());
    return newValue;
  }
  
  async sadd(key: string, member: string): Promise<number> {
    const set = this.store.get(key) || new Set();
    const sizeBefore = set.size;
    set.add(member);
    this.store.set(key, set);
    return set.size - sizeBefore;
  }
  
  async smembers(key: string): Promise<string[]> {
    const set = this.store.get(key);
    return set ? Array.from(set) : [];
  }
  
  async srem(key: string, member: string): Promise<number> {
    const set = this.store.get(key);
    if (!set) return 0;
    const removed = set.delete(member);
    return removed ? 1 : 0;
  }
  
  async zadd(key: string, score: number, member: string): Promise<number> {
    let sortedSet = this.store.get(key) || [];
    sortedSet = sortedSet.filter((item: any) => item.member !== member);
    sortedSet.push({ score, member });
    sortedSet.sort((a: any, b: any) => a.score - b.score);
    this.store.set(key, sortedSet);
    return 1;
  }
  
  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    const sortedSet = this.store.get(key) || [];
    const reversed = [...sortedSet].reverse();
    return reversed.slice(start, stop + 1).map((item: any) => item.member);
  }
  
  async expire(key: string, ttl: number): Promise<number> {
    if (this.store.has(key)) {
      this.ttls.set(key, Date.now() + (ttl * 1000));
      return 1;
    }
    return 0;
  }
  
  async ping(): Promise<'PONG'> {
    return 'PONG';
  }
  
  // Test helpers
  private checkExpired(key: string): void {
    const expiry = this.ttls.get(key);
    if (expiry && expiry < Date.now()) {
      this.store.delete(key);
      this.ttls.delete(key);
    }
  }
  
  flushdb(): void {
    this.store.clear();
    this.ttls.clear();
  }
  
  getAllKeys(): string[] {
    return Array.from(this.store.keys());
  }
  
  getValue(key: string): any {
    return this.store.get(key);
  }
}