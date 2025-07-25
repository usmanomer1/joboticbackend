import { LRUCache } from 'lru-cache';

export interface ObserveResult {
  selector: string;
  description: string;
  method: string;
  arguments: any;
}

/**
 * Cache for Stagehand observe results to avoid repeated LLM inference
 * Used for predictable navigation actions
 */
export class ObserveCache {
  private cache: LRUCache<string, ObserveResult>;
  
  constructor() {
    this.cache = new LRUCache<string, ObserveResult>({
      max: 50, // Max 50 cached navigation actions
      ttl: 1000 * 60 * 60 * 2, // 2 hour TTL (session length)
    });
  }
  
  /**
   * Get cached observe result
   */
  get(instruction: string): ObserveResult | undefined {
    return this.cache.get(instruction);
  }
  
  /**
   * Cache observe result
   */
  set(instruction: string, result: ObserveResult): void {
    if (result && result.selector) {
      this.cache.set(instruction, result);
    }
  }
  
  /**
   * Check if instruction is cached
   */
  has(instruction: string): boolean {
    return this.cache.has(instruction);
  }
  
  /**
   * Clear all cached results
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: 50
    };
  }
}