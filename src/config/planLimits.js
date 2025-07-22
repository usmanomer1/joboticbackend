/**
 * Subscription plan limits and pricing configuration
 * @module config/planLimits
 */

const PLAN_LIMITS = {
  // Plus Plan - $10/month - Temporarily unlimited
  'price_1Rf2oQGkowQ7SwlfhDDuOpFk': -1,
  
  // Pro Plan - $25/month - Temporarily unlimited  
  'price_1Rf2nJGkowQ7Swlfwvc3CBO8': -1,
  
  // Max Plan - $50/month - Unlimited
  'price_1Rf2owGkowQ7SwlfEG4UKU8c': -1,
  
  // Free users - Temporarily unlimited
  'default': -1
};

const PLAN_NAMES = {
  'price_1Rf2oQGkowQ7SwlfhDDuOpFk': 'Plus',
  'price_1Rf2nJGkowQ7Swlfwvc3CBO8': 'Pro',
  'price_1Rf2owGkowQ7SwlfEG4UKU8c': 'Max',
  'default': 'Free'
};

const PLAN_PRICES = {
  'price_1Rf2oQGkowQ7SwlfhDDuOpFk': 10,
  'price_1Rf2nJGkowQ7Swlfwvc3CBO8': 25,
  'price_1Rf2owGkowQ7SwlfEG4UKU8c': 50,
  'default': 0
};

/**
 * Get plan limit by price ID
 * @param {string} priceId - Stripe price ID
 * @returns {number} Job limit (-1 for unlimited)
 */
function getPlanLimit(priceId) {
  return PLAN_LIMITS[priceId] || PLAN_LIMITS.default;
}

/**
 * Get plan name by price ID
 * @param {string} priceId - Stripe price ID
 * @returns {string} Plan name
 */
function getPlanName(priceId) {
  return PLAN_NAMES[priceId] || PLAN_NAMES.default;
}

/**
 * Get plan price by price ID
 * @param {string} priceId - Stripe price ID
 * @returns {number} Monthly price in USD
 */
function getPlanPrice(priceId) {
  return PLAN_PRICES[priceId] || PLAN_PRICES.default;
}

/**
 * Check if plan has unlimited jobs
 * @param {string} priceId - Stripe price ID
 * @returns {boolean} True if unlimited
 */
function isUnlimitedPlan(priceId) {
  return getPlanLimit(priceId) === -1;
}

module.exports = {
  PLAN_LIMITS,
  PLAN_NAMES,
  PLAN_PRICES,
  getPlanLimit,
  getPlanName,
  getPlanPrice,
  isUnlimitedPlan
};