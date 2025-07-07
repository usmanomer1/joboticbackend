/**
 * Logger utility for resume editor pipeline
 */

const fs = require('fs-extra');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = process.env.LOG_DIR || 'logs';
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.logToFile = process.env.LOG_TO_FILE === 'true';
    this.logToConsole = process.env.LOG_TO_CONSOLE !== 'false'; // Default true
    
    // Ensure log directory exists
    if (this.logToFile) {
      fs.ensureDirSync(this.logDir);
    }
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  /**
   * Get current log file path
   */
  getLogFile() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `resume-editor-${date}.log`);
  }

  /**
   * Format log message
   */
  formatMessage(level, category, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      category,
      message,
      ...(data && { data })
    };
    
    return JSON.stringify(logEntry);
  }

  /**
   * Write log entry
   */
  async writeLog(level, category, message, data) {
    // Check log level
    if (this.levels[level] > this.levels[this.logLevel]) {
      return;
    }
    
    const formattedMessage = this.formatMessage(level, category, message, data);
    
    // Console output
    if (this.logToConsole) {
      const colorMap = {
        error: '\x1b[31m', // Red
        warn: '\x1b[33m',  // Yellow
        info: '\x1b[36m',  // Cyan
        debug: '\x1b[90m'  // Gray
      };
      const reset = '\x1b[0m';
      
      console.log(`${colorMap[level]}[${level.toUpperCase()}]${reset} ${category}: ${message}`);
      if (data) {
        console.log(JSON.stringify(data, null, 2));
      }
    }
    
    // File output
    if (this.logToFile) {
      try {
        await fs.appendFile(this.getLogFile(), formattedMessage + '\n');
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
    }
  }

  // Log level methods
  error(category, message, data) {
    return this.writeLog('error', category, message, data);
  }

  warn(category, message, data) {
    return this.writeLog('warn', category, message, data);
  }

  info(category, message, data) {
    return this.writeLog('info', category, message, data);
  }

  debug(category, message, data) {
    return this.writeLog('debug', category, message, data);
  }

  // Specialized logging methods for resume editor pipeline
  
  /**
   * Log PDF conversion process
   */
  logConversion(stage, message, data) {
    return this.info('PDF_CONVERSION', `${stage}: ${message}`, data);
  }

  /**
   * Log HTML parsing process
   */
  logParsing(stage, message, data) {
    return this.info('HTML_PARSING', `${stage}: ${message}`, data);
  }

  /**
   * Log AI suggestion generation
   */
  logAISuggestions(stage, message, data) {
    return this.info('AI_SUGGESTIONS', `${stage}: ${message}`, data);
  }

  /**
   * Log text matching process
   */
  logTextMatching(originalText, matchedText, confidence) {
    return this.debug('TEXT_MATCHING', 'Text match result', {
      original: originalText.substring(0, 50) + '...',
      matched: matchedText.substring(0, 50) + '...',
      confidence,
      confidenceLevel: confidence > 0.85 ? 'HIGH' : confidence > 0.7 ? 'MEDIUM' : 'LOW'
    });
  }

  /**
   * Log performance metrics
   */
  logPerformance(operation, duration, metadata = {}) {
    return this.info('PERFORMANCE', `${operation} completed in ${duration}ms`, {
      operation,
      duration,
      ...metadata
    });
  }

  /**
   * Log cleanup operations
   */
  logCleanup(type, count, details) {
    return this.info('CLEANUP', `Cleaned up ${count} ${type}`, details);
  }

  /**
   * Get recent logs
   */
  async getRecentLogs(lines = 100, filter = null) {
    if (!this.logToFile) {
      return { error: 'File logging is not enabled' };
    }
    
    try {
      const logFile = this.getLogFile();
      const exists = await fs.pathExists(logFile);
      
      if (!exists) {
        return { logs: [] };
      }
      
      const content = await fs.readFile(logFile, 'utf-8');
      const allLogs = content.trim().split('\n').filter(Boolean);
      
      let logs = allLogs.slice(-lines).map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return { raw: line };
        }
      });
      
      // Apply filter if provided
      if (filter) {
        logs = logs.filter(log => {
          if (filter.level && log.level !== filter.level) return false;
          if (filter.category && log.category !== filter.category) return false;
          if (filter.search && !JSON.stringify(log).toLowerCase().includes(filter.search.toLowerCase())) return false;
          return true;
        });
      }
      
      return { logs };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Clear old log files
   */
  async clearOldLogs(daysToKeep = 7) {
    if (!this.logToFile) return;
    
    try {
      const files = await fs.readdir(this.logDir);
      const now = Date.now();
      const maxAge = daysToKeep * 24 * 60 * 60 * 1000;
      let removed = 0;
      
      for (const file of files) {
        if (!file.startsWith('resume-editor-') || !file.endsWith('.log')) continue;
        
        const filePath = path.join(this.logDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtimeMs > maxAge) {
          await fs.remove(filePath);
          removed++;
        }
      }
      
      this.info('CLEANUP', `Removed ${removed} old log files`);
      return removed;
    } catch (error) {
      this.error('CLEANUP', 'Failed to clear old logs', { error: error.message });
      return 0;
    }
  }
}

module.exports = new Logger();