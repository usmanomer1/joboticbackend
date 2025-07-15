/**
 * Usage tracking service for job search limits
 * @module services/usageTracking
 */

const { supabaseAdmin } = require('../utils/supabaseAdmin');
const { 
  PLAN_LIMITS, 
  PLAN_NAMES, 
  getPlanLimit, 
  getPlanName,
  isUnlimitedPlan 
} = require('../config/planLimits');
const { AppError } = require('../middleware/errorHandler');

class UsageTrackingService {
  /**
   * Get user's current subscription plan
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Plan details
   */
  async getUserPlan(userId) {
    try {
      // Get active subscription from stripe_user_subscriptions
      const { data: subscription, error } = await supabaseAdmin
        .from('stripe_user_subscriptions')
        .select('price_id, subscription_status')
        .eq('user_id', userId)
        .eq('subscription_status', 'active')
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Error fetching subscription:', error);
        throw new AppError('Failed to fetch subscription data', 500);
      }
      
      const priceId = subscription?.price_id || 'default';
      
      return {
        priceId,
        name: getPlanName(priceId),
        limit: getPlanLimit(priceId),
        isUnlimited: isUnlimitedPlan(priceId),
        isActive: !!subscription
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('getUserPlan error:', error);
      throw new AppError('Failed to get user plan', 500);
    }
  }
  
  /**
   * Get user's job search usage for current month
   * @param {string} userId - User ID
   * @returns {Promise<number>} Total jobs viewed this month
   */
  async getCurrentMonthUsage(userId) {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      
      // Use the aggregated view for performance
      const { data, error } = await supabaseAdmin
        .from('job_search_monthly_usage')
        .select('total_jobs_viewed')
        .eq('user_id', userId)
        .eq('month_year', currentMonth)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Error fetching usage:', error);
        throw new AppError('Failed to fetch usage data', 500);
      }
      
      return data?.total_jobs_viewed || 0;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('getCurrentMonthUsage error:', error);
      throw new AppError('Failed to get usage data', 500);
    }
  }
  
  /**
   * Track job usage for a user
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID for grouping requests
   * @param {string} query - Search query used
   * @param {number} jobsViewed - Number of jobs viewed
   * @param {Object} metadata - Additional metadata to store
   * @returns {Promise<void>}
   */
  async trackJobUsage(userId, sessionId, query, jobsViewed, metadata = {}) {
    try {
      const { error } = await supabaseAdmin
        .from('job_search_usage')
        .insert({
          user_id: userId,
          session_id: sessionId,
          query: query || 'No query provided',
          jobs_viewed: jobsViewed,
          metadata: {
            ...metadata,
            timestamp: new Date().toISOString()
          }
        });
      
      if (error) {
        console.error('Failed to track usage:', error);
        // Don't throw - we don't want tracking failures to break the flow
        // Could implement a queue for retry later
      }
    } catch (error) {
      console.error('trackJobUsage error:', error);
      // Silent failure for tracking
    }
  }
  
  /**
   * Check if user can view requested number of jobs
   * @param {string} userId - User ID
   * @param {number} requestedJobs - Number of jobs requested
   * @returns {Promise<Object>} Limit check result
   */
  async checkUserLimit(userId, requestedJobs = 0) {
    try {
      // Fetch plan and usage in parallel for performance
      const [plan, currentUsage] = await Promise.all([
        this.getUserPlan(userId),
        this.getCurrentMonthUsage(userId)
      ]);
      
      // Unlimited plan - always allowed
      if (plan.isUnlimited) {
        return { 
          allowed: true, 
          plan, 
          currentUsage,
          remaining: 'unlimited',
          canViewMore: true
        };
      }
      
      const remaining = Math.max(0, plan.limit - currentUsage);
      
      // Check if user would exceed limit
      if (currentUsage >= plan.limit) {
        return {
          allowed: false,
          plan,
          currentUsage,
          remaining: 0,
          canViewMore: false,
          limitReached: true
        };
      }
      
      // Check if this request would exceed limit
      if (requestedJobs > 0 && currentUsage + requestedJobs > plan.limit) {
        return {
          allowed: true, // Allow partial fulfillment
          plan,
          currentUsage,
          remaining,
          canViewMore: true,
          partialFulfillment: true,
          maxAllowed: remaining
        };
      }
      
      return {
        allowed: true,
        plan,
        currentUsage,
        remaining,
        canViewMore: remaining > 0
      };
    } catch (error) {
      console.error('checkUserLimit error:', error);
      // On error, allow the request but log for monitoring
      return {
        allowed: true,
        error: true,
        plan: { name: 'Unknown', limit: 100 },
        currentUsage: 0,
        remaining: 100
      };
    }
  }
  
  /**
   * Get detailed usage statistics for a user
   * @param {string} userId - User ID
   * @param {string} monthYear - Optional month (YYYY-MM), defaults to current
   * @returns {Promise<Object>} Usage statistics
   */
  async getUserStats(userId, monthYear = null) {
    try {
      const targetMonth = monthYear || new Date().toISOString().slice(0, 7);
      
      // Get aggregated stats
      const { data: monthlyStats, error: statsError } = await supabaseAdmin
        .from('job_search_monthly_usage')
        .select('*')
        .eq('user_id', userId)
        .eq('month_year', targetMonth)
        .single();
      
      if (statsError && statsError.code !== 'PGRST116') {
        throw new AppError('Failed to fetch usage statistics', 500);
      }
      
      // Get recent searches
      const { data: recentSearches, error: searchError } = await supabaseAdmin
        .from('job_search_usage')
        .select('query, jobs_viewed, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (searchError) {
        console.error('Error fetching recent searches:', searchError);
      }
      
      const plan = await this.getUserPlan(userId);
      
      return {
        month: targetMonth,
        plan: plan.name,
        limit: plan.limit === -1 ? 'Unlimited' : plan.limit,
        totalJobsViewed: monthlyStats?.total_jobs_viewed || 0,
        searchSessions: monthlyStats?.search_sessions || 0,
        totalRequests: monthlyStats?.total_requests || 0,
        lastSearchAt: monthlyStats?.last_search_at || null,
        recentSearches: recentSearches || [],
        remaining: plan.limit === -1 ? 'Unlimited' : 
                   Math.max(0, plan.limit - (monthlyStats?.total_jobs_viewed || 0))
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('getUserStats error:', error);
      throw new AppError('Failed to get user statistics', 500);
    }
  }
}

// Export singleton instance
module.exports = new UsageTrackingService();