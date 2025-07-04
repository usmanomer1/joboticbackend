/**
 * Cache utility using node-cache for in-memory caching
 * @module utils/cache
 */

const NodeCache = require('node-cache');

/**
 * Create cache instance with default TTL of 2 hours (7200 seconds)
 * Can be overridden with CACHE_TTL environment variable
 */
const cache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL) || 7200, // 2 hours default
  checkperiod: 600, // Check for expired keys every 10 minutes
  useClones: false, // Don't clone objects for better performance
  deleteOnExpire: true // Automatically delete expired keys
});

/**
 * Debug logger for cache operations
 * @param {string} operation - Operation type (hit, miss, set, delete, etc.)
 * @param {string} key - Cache key
 * @param {*} details - Additional details to log
 */
const logCacheOperation = (operation, key, details = {}) => {
  if (process.env.DEBUG && process.env.DEBUG.includes('cache')) {
    console.log(`[CACHE ${operation.toUpperCase()}]`, {
      timestamp: new Date().toISOString(),
      key,
      ...details
    });
  }
};

/**
 * Cache wrapper with error handling and logging
 */
const cacheWrapper = {
  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or null if not found/error
   */
  get(key) {
    try {
      const value = cache.get(key);
      
      if (value !== undefined) {
        logCacheOperation('hit', key, { 
          found: true,
          ttl: cache.getTtl(key) 
        });
        return value;
      }
      
      logCacheOperation('miss', key, { found: false });
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      logCacheOperation('error', key, { 
        operation: 'get',
        error: error.message 
      });
      return null;
    }
  },

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} [customTTL] - Optional custom TTL in seconds
   * @returns {boolean} Success status
   */
  set(key, value, customTTL) {
    try {
      const ttl = customTTL || cache.options.stdTTL;
      const success = cache.set(key, value, ttl);
      
      logCacheOperation('set', key, { 
        success,
        ttl,
        customTTL: !!customTTL,
        valueType: typeof value,
        size: JSON.stringify(value).length
      });
      
      return success;
    } catch (error) {
      console.error('Cache set error:', error);
      logCacheOperation('error', key, { 
        operation: 'set',
        error: error.message 
      });
      return false;
    }
  },

  /**
   * Delete specific key from cache
   * @param {string} key - Cache key to delete
   * @returns {number} Number of deleted keys (0 or 1)
   */
  del(key) {
    try {
      const deleted = cache.del(key);
      
      logCacheOperation('delete', key, { 
        deleted,
        success: deleted > 0 
      });
      
      return deleted;
    } catch (error) {
      console.error('Cache delete error:', error);
      logCacheOperation('error', key, { 
        operation: 'delete',
        error: error.message 
      });
      return 0;
    }
  },

  /**
   * Clear all cache entries
   * @returns {boolean} Success status
   */
  flush() {
    try {
      cache.flushAll();
      
      logCacheOperation('flush', 'all', { 
        success: true,
        previousKeys: cache.getStats().keys 
      });
      
      return true;
    } catch (error) {
      console.error('Cache flush error:', error);
      logCacheOperation('error', 'all', { 
        operation: 'flush',
        error: error.message 
      });
      return false;
    }
  },

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists
   */
  has(key) {
    try {
      const exists = cache.has(key);
      
      logCacheOperation('check', key, { exists });
      
      return exists;
    } catch (error) {
      console.error('Cache has error:', error);
      logCacheOperation('error', key, { 
        operation: 'has',
        error: error.message 
      });
      return false;
    }
  },

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    try {
      const stats = cache.getStats();
      
      logCacheOperation('stats', 'cache', stats);
      
      return stats;
    } catch (error) {
      console.error('Cache stats error:', error);
      return {
        hits: 0,
        misses: 0,
        keys: 0,
        ksize: 0,
        vsize: 0
      };
    }
  },

  /**
   * Get all keys in cache
   * @returns {string[]} Array of cache keys
   */
  keys() {
    try {
      const keys = cache.keys();
      
      logCacheOperation('keys', 'cache', { 
        count: keys.length 
      });
      
      return keys;
    } catch (error) {
      console.error('Cache keys error:', error);
      return [];
    }
  },

  /**
   * Get remaining TTL for a key
   * @param {string} key - Cache key
   * @returns {number|null} TTL in milliseconds or null if not found
   */
  getTtl(key) {
    try {
      const ttl = cache.getTtl(key);
      
      if (ttl) {
        const remaining = ttl - Date.now();
        logCacheOperation('ttl', key, { 
          ttl,
          remaining,
          remainingSeconds: Math.round(remaining / 1000)
        });
        return remaining;
      }
      
      return null;
    } catch (error) {
      console.error('Cache TTL error:', error);
      return null;
    }
  },

  /**
   * Create a cache key from multiple parts
   * @param {...string} parts - Parts to join into cache key
   * @returns {string} Cache key
   */
  makeKey(...parts) {
    return parts.filter(Boolean).join(':');
  }
};

// Event listeners for cache events
cache.on('expired', (key, value) => {
  logCacheOperation('expired', key, { 
    valueType: typeof value 
  });
});

cache.on('flush', () => {
  logCacheOperation('flushed', 'all', { 
    timestamp: Date.now() 
  });
});

cache.on('set', (key, value) => {
  logCacheOperation('event-set', key, { 
    valueType: typeof value 
  });
});

cache.on('del', (key, value) => {
  logCacheOperation('event-delete', key, { 
    hadValue: value !== undefined 
  });
});

// Export singleton instance
module.exports = cacheWrapper;