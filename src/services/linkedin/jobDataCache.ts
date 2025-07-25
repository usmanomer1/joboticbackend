import { LRUCache } from 'lru-cache';
import { EventEmitter } from 'events';
import { AutomationEventType } from '../../types/automation.types';

interface CachedJobData {
  jobId: string;
  company: string;
  jobTitle: string;
  location: string;
  jobUrl: string;
  isEasyApply: boolean;
  jobDescription?: string;
  requirements?: string[];
  salary?: string;
  postedDate?: string;
  extractedAt: Date;
  applicationUrl?: string;
}

interface CachedCompanyData {
  company: string;
  hasExternalPortal: boolean;
  portalUrl?: string;
  requiresAccount: boolean;
  lastChecked: Date;
}

/**
 * Cache for job and company data to avoid re-extraction
 */
export class JobDataCache extends EventEmitter {
  private jobCache: LRUCache<string, CachedJobData>;
  private companyCache: LRUCache<string, CachedCompanyData>;
  private sessionId: string;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
    
    // Configure job cache (max 500 jobs, TTL 2 hours)
    this.jobCache = new LRUCache<string, CachedJobData>({
      max: 500,
      ttl: 1000 * 60 * 60 * 2, // 2 hours
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });

    // Configure company cache (max 200 companies, TTL 24 hours)
    this.companyCache = new LRUCache<string, CachedCompanyData>({
      max: 200,
      ttl: 1000 * 60 * 60 * 24, // 24 hours
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });
  }

  /**
   * Get cached job data
   */
  getJob(jobId: string): CachedJobData | undefined {
    const cached = this.jobCache.get(jobId);
    if (cached) {
      this.emit(AutomationEventType.CACHE_HIT, {
        sessionId: this.sessionId,
        type: 'job',
        key: jobId
      });
    } else {
      this.emit(AutomationEventType.CACHE_MISS, {
        sessionId: this.sessionId,
        type: 'job',
        key: jobId
      });
    }
    return cached;
  }

  /**
   * Cache job data
   */
  setJob(jobData: CachedJobData): void {
    this.jobCache.set(jobData.jobId, jobData);
  }

  /**
   * Get cached company data
   */
  getCompany(company: string): CachedCompanyData | undefined {
    const cached = this.companyCache.get(company);
    if (cached) {
      this.emit(AutomationEventType.CACHE_HIT, {
        sessionId: this.sessionId,
        type: 'company',
        key: company
      });
    } else {
      this.emit(AutomationEventType.CACHE_MISS, {
        sessionId: this.sessionId,
        type: 'company',
        key: company
      });
    }
    return cached;
  }

  /**
   * Cache company data
   */
  setCompany(companyData: CachedCompanyData): void {
    this.companyCache.set(companyData.company, companyData);
  }

  /**
   * Check if a job has been applied to (by checking if it's in cache with application data)
   */
  hasAppliedToJob(jobId: string): boolean {
    const job = this.jobCache.get(jobId);
    return !!job && !!job.applicationUrl;
  }

  /**
   * Mark a job as applied
   */
  markJobAsApplied(jobId: string, applicationUrl?: string): void {
    const job = this.jobCache.get(jobId);
    if (job) {
      job.applicationUrl = applicationUrl || 'applied';
      this.jobCache.set(jobId, job);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { jobs: number; companies: number; hitRate: number } {
    return {
      jobs: this.jobCache.size,
      companies: this.companyCache.size,
      hitRate: this.calculateHitRate()
    };
  }

  /**
   * Calculate cache hit rate
   */
  private calculateHitRate(): number {
    // This would need to track hits/misses over time
    // For now, return a placeholder
    return 0;
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.jobCache.clear();
    this.companyCache.clear();
  }
}