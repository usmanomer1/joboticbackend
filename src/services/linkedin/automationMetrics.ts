import { EventEmitter } from 'events';
import { AutomationEventType } from '../../types/automation.types';

interface MetricSnapshot {
  timestamp: Date;
  totalJobs: number;
  successfulApplications: number;
  failedApplications: number;
  skippedJobs: number;
  averageTimePerApplication: number;
  currentRate: number; // applications per minute
}

interface ApplicationMetrics {
  jobId: string;
  company: string;
  startTime: Date;
  endTime?: Date;
  duration?: number; // in seconds
  success: boolean;
  failureReason?: string;
  isEasyApply: boolean;
}

/**
 * Real-time metrics collection for LinkedIn automation
 */
export class AutomationMetrics extends EventEmitter {
  private sessionId: string;
  private startTime: Date;
  private applications: ApplicationMetrics[] = [];
  private totalJobsViewed: number = 0;
  private lastMetricUpdate: Date;
  private updateInterval: NodeJS.Timeout;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
    this.startTime = new Date();
    this.lastMetricUpdate = new Date();

    // Emit metrics every 10 seconds
    this.updateInterval = setInterval(() => {
      this.emitMetrics();
    }, 10000);
  }

  /**
   * Record that a job was viewed
   */
  recordJobView(): void {
    this.totalJobsViewed++;
  }

  /**
   * Start tracking an application
   */
  startApplication(jobId: string, company: string, isEasyApply: boolean): void {
    const metric: ApplicationMetrics = {
      jobId,
      company,
      startTime: new Date(),
      success: false,
      isEasyApply
    };
    this.applications.push(metric);
  }

  /**
   * Complete an application tracking
   */
  completeApplication(jobId: string, success: boolean, failureReason?: string): void {
    const application = this.applications.find(a => a.jobId === jobId && !a.endTime);
    if (application) {
      application.endTime = new Date();
      application.duration = (application.endTime.getTime() - application.startTime.getTime()) / 1000;
      application.success = success;
      application.failureReason = failureReason;
      
      // Emit immediate update for completed applications
      this.emitMetrics();
    }
  }

  /**
   * Get current metrics snapshot
   */
  getSnapshot(): MetricSnapshot {
    const now = new Date();
    const totalDuration = (now.getTime() - this.startTime.getTime()) / 1000; // seconds
    const completedApplications = this.applications.filter(a => a.endTime);
    const successfulApplications = completedApplications.filter(a => a.success);
    const failedApplications = completedApplications.filter(a => !a.success);
    
    // Calculate average time per application
    const totalApplicationTime = completedApplications.reduce((sum, app) => sum + (app.duration || 0), 0);
    const averageTimePerApplication = completedApplications.length > 0 
      ? totalApplicationTime / completedApplications.length 
      : 0;

    // Calculate current rate (applications per minute)
    const currentRate = totalDuration > 0 
      ? (successfulApplications.length / totalDuration) * 60 
      : 0;

    return {
      timestamp: now,
      totalJobs: this.totalJobsViewed,
      successfulApplications: successfulApplications.length,
      failedApplications: failedApplications.length,
      skippedJobs: this.totalJobsViewed - completedApplications.length,
      averageTimePerApplication,
      currentRate
    };
  }

  /**
   * Get detailed application breakdown
   */
  getApplicationBreakdown(): {
    easyApply: { success: number; failed: number };
    external: { success: number; failed: number };
    byCompany: Map<string, { success: number; failed: number }>;
    failureReasons: Map<string, number>;
  } {
    const completedApplications = this.applications.filter(a => a.endTime);
    
    const easyApplyApps = completedApplications.filter(a => a.isEasyApply);
    const externalApps = completedApplications.filter(a => !a.isEasyApply);
    
    const byCompany = new Map<string, { success: number; failed: number }>();
    const failureReasons = new Map<string, number>();

    for (const app of completedApplications) {
      // Company breakdown
      if (!byCompany.has(app.company)) {
        byCompany.set(app.company, { success: 0, failed: 0 });
      }
      const companyStats = byCompany.get(app.company)!;
      if (app.success) {
        companyStats.success++;
      } else {
        companyStats.failed++;
      }

      // Failure reasons
      if (!app.success && app.failureReason) {
        failureReasons.set(app.failureReason, (failureReasons.get(app.failureReason) || 0) + 1);
      }
    }

    return {
      easyApply: {
        success: easyApplyApps.filter(a => a.success).length,
        failed: easyApplyApps.filter(a => !a.success).length
      },
      external: {
        success: externalApps.filter(a => a.success).length,
        failed: externalApps.filter(a => !a.success).length
      },
      byCompany,
      failureReasons
    };
  }

  /**
   * Emit current metrics
   */
  private emitMetrics(): void {
    const snapshot = this.getSnapshot();
    const breakdown = this.getApplicationBreakdown();

    this.emit(AutomationEventType.METRICS_UPDATED, {
      sessionId: this.sessionId,
      metrics: {
        snapshot,
        breakdown,
        runTime: (new Date().getTime() - this.startTime.getTime()) / 1000,
        estimatedCompletion: this.estimateCompletion()
      }
    });

    this.lastMetricUpdate = new Date();
  }

  /**
   * Estimate time to completion
   */
  private estimateCompletion(): { remainingJobs: number; estimatedMinutes: number } | null {
    const snapshot = this.getSnapshot();
    
    if (snapshot.currentRate === 0) {
      return null;
    }

    // This would need target count from config
    // For now, return null
    return null;
  }

  /**
   * Clean up
   */
  dispose(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}