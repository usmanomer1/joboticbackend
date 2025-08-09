// Service Index - Re-export all services for better discoverability

// Export all service modules
module.exports = {
  jobSearchService: require('./jobSearch.service'),
  aiMatchingService: require('./aiMatching.service'),
  usageTrackingService: require('./usageTracking.service')
};