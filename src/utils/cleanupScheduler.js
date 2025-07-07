/**
 * Cleanup Scheduler
 * Manages periodic cleanup of temporary files and expired sessions
 */

const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

class CleanupScheduler {
  constructor() {
    this.intervals = {};
    this.cleanupInterval = parseInt(process.env.CLEANUP_INTERVAL || '3600000'); // 1 hour default
    this.tempDir = process.env.TEMP_DIR || './temp';
    this.maxFileAge = {
      uploads: 2 * 60 * 60 * 1000,    // 2 hours
      html: 24 * 60 * 60 * 1000,      // 24 hours
      exports: 24 * 60 * 60 * 1000,    // 24 hours
      documents: 7 * 24 * 60 * 60 * 1000  // 7 days
    };
  }

  /**
   * Start all cleanup jobs
   */
  startAll() {
    logger.info('CLEANUP', 'Starting cleanup scheduler', { 
      interval: this.cleanupInterval,
      tempDir: this.tempDir 
    });
    
    // Schedule periodic cleanups
    this.intervals.main = setInterval(() => {
      this.runCleanup().catch(error => {
        logger.error('CLEANUP', 'Cleanup job failed', { error: error.message });
      });
    }, this.cleanupInterval);
    
    // Run initial cleanup
    this.runCleanup().catch(console.error);
    
    // Schedule log cleanup (daily)
    this.intervals.logs = setInterval(() => {
      logger.clearOldLogs(7).catch(console.error);
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * Stop all cleanup jobs
   */
  stopAll() {
    Object.values(this.intervals).forEach(interval => clearInterval(interval));
    this.intervals = {};
    logger.info('CLEANUP', 'Cleanup scheduler stopped');
  }

  /**
   * Run cleanup for all temp directories
   */
  async runCleanup() {
    logger.info('CLEANUP', 'Starting cleanup cycle');
    const startTime = Date.now();
    const results = {
      uploads: 0,
      html: 0,
      exports: 0,
      documents: 0,
      total: 0
    };
    
    try {
      // Clean each subdirectory
      results.uploads = await this.cleanDirectory('temp/uploads', this.maxFileAge.uploads);
      results.html = await this.cleanDirectory('temp/html', this.maxFileAge.html);
      results.exports = await this.cleanDirectory('temp/exports', this.maxFileAge.exports);
      results.documents = await this.cleanDirectory('temp/documents', this.maxFileAge.documents);
      results.total = results.uploads + results.html + results.exports + results.documents;
      
      const duration = Date.now() - startTime;
      logger.logCleanup('files', results.total, { 
        ...results, 
        duration 
      });
      
      return results;
    } catch (error) {
      logger.error('CLEANUP', 'Cleanup cycle failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Clean a specific directory
   */
  async cleanDirectory(dirPath, maxAge) {
    try {
      const fullPath = path.resolve(dirPath);
      
      // Ensure directory exists
      if (!await fs.pathExists(fullPath)) {
        return 0;
      }
      
      const now = Date.now();
      let removedCount = 0;
      const items = await fs.readdir(fullPath);
      
      for (const item of items) {
        // Skip .gitkeep files
        if (item === '.gitkeep') continue;
        
        const itemPath = path.join(fullPath, item);
        const stats = await fs.stat(itemPath);
        const age = now - stats.mtimeMs;
        
        if (age > maxAge) {
          try {
            if (stats.isDirectory()) {
              await fs.remove(itemPath);
              logger.debug('CLEANUP', `Removed old directory: ${item}`, { age: Math.round(age / 1000 / 60) + ' minutes' });
            } else {
              await fs.unlink(itemPath);
              logger.debug('CLEANUP', `Removed old file: ${item}`, { age: Math.round(age / 1000 / 60) + ' minutes' });
            }
            removedCount++;
          } catch (error) {
            logger.error('CLEANUP', `Failed to remove ${item}`, { error: error.message });
          }
        }
      }
      
      if (removedCount > 0) {
        logger.info('CLEANUP', `Cleaned ${removedCount} items from ${dirPath}`);
      }
      
      return removedCount;
    } catch (error) {
      logger.error('CLEANUP', `Failed to clean directory ${dirPath}`, { error: error.message });
      return 0;
    }
  }

  /**
   * Clean specific file types
   */
  async cleanFilesByPattern(dirPath, pattern, maxAge) {
    try {
      const fullPath = path.resolve(dirPath);
      if (!await fs.pathExists(fullPath)) return 0;
      
      const now = Date.now();
      let removedCount = 0;
      const items = await fs.readdir(fullPath);
      
      for (const item of items) {
        if (!item.match(pattern)) continue;
        
        const itemPath = path.join(fullPath, item);
        const stats = await fs.stat(itemPath);
        const age = now - stats.mtimeMs;
        
        if (age > maxAge) {
          await fs.unlink(itemPath);
          removedCount++;
        }
      }
      
      return removedCount;
    } catch (error) {
      logger.error('CLEANUP', `Failed to clean files by pattern`, { error: error.message, pattern });
      return 0;
    }
  }

  /**
   * Get cleanup statistics
   */
  async getStats() {
    const stats = {
      directories: {},
      totalSize: 0,
      fileCount: 0
    };
    
    const dirs = ['temp/uploads', 'temp/html', 'temp/exports', 'temp/documents'];
    
    for (const dir of dirs) {
      try {
        const fullPath = path.resolve(dir);
        if (await fs.pathExists(fullPath)) {
          const dirStats = await this.getDirectoryStats(fullPath);
          stats.directories[dir] = dirStats;
          stats.totalSize += dirStats.size;
          stats.fileCount += dirStats.count;
        }
      } catch (error) {
        stats.directories[dir] = { error: error.message };
      }
    }
    
    return stats;
  }

  /**
   * Get directory statistics
   */
  async getDirectoryStats(dirPath) {
    let totalSize = 0;
    let fileCount = 0;
    let oldestFile = null;
    let newestFile = null;
    
    const items = await fs.readdir(dirPath);
    
    for (const item of items) {
      if (item === '.gitkeep') continue;
      
      const itemPath = path.join(dirPath, item);
      const stats = await fs.stat(itemPath);
      
      if (stats.isFile()) {
        totalSize += stats.size;
        fileCount++;
        
        if (!oldestFile || stats.mtimeMs < oldestFile.time) {
          oldestFile = { name: item, time: stats.mtimeMs };
        }
        if (!newestFile || stats.mtimeMs > newestFile.time) {
          newestFile = { name: item, time: stats.mtimeMs };
        }
      }
    }
    
    return {
      size: totalSize,
      count: fileCount,
      sizeFormatted: this.formatBytes(totalSize),
      oldest: oldestFile,
      newest: newestFile
    };
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Manual cleanup trigger
   */
  async manualCleanup(options = {}) {
    const { 
      force = false, 
      directories = ['uploads', 'html', 'exports', 'documents'] 
    } = options;
    
    logger.info('CLEANUP', 'Manual cleanup triggered', { force, directories });
    
    const results = {};
    for (const dir of directories) {
      const dirPath = `temp/${dir}`;
      const maxAge = force ? 0 : this.maxFileAge[dir];
      results[dir] = await this.cleanDirectory(dirPath, maxAge);
    }
    
    return results;
  }
}

// Create singleton instance
const cleanupScheduler = new CleanupScheduler();

// Export instance and also cleanup function for direct use
module.exports = {
  scheduler: cleanupScheduler,
  
  // Convenience function for one-time cleanup
  cleanup: async (options) => {
    return cleanupScheduler.manualCleanup(options);
  },
  
  // Get current stats
  getStats: async () => {
    return cleanupScheduler.getStats();
  }
};