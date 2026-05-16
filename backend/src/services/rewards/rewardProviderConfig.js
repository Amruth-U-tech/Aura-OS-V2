// ======================================================
// REWARD PROVIDER CONFIGURATION
// Environment validation for reward provider APIs
// Owns: config extraction + startup validation
// Must NOT: contain reward logic or redemption
// ======================================================

const REWARD_CONFIG = {
  AMAZON_ACCESS_KEY: process.env.AMAZON_ACCESS_KEY,
  AMAZON_SECRET_KEY: process.env.AMAZON_SECRET_KEY,
  AMAZON_PARTNER_TAG: process.env.AMAZON_PARTNER_TAG,
  AMAZON_HOST: process.env.AMAZON_HOST || 'webservices.amazon.in',
  TIMEOUT_MS: 15000,
  MOCK_MODE: true // Always mock until Amazon Associate account is approved
};

/**
 * Validates reward provider env vars.
 * Returns { valid, missing[] } — graceful degradation.
 */
const validateRewardEnv = () => {
  const required = ['AMAZON_ACCESS_KEY', 'AMAZON_SECRET_KEY', 'AMAZON_PARTNER_TAG'];
  const missing = required.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.warn('[RewardConfig] ⚠️ Missing Amazon env vars:', missing.join(', '));
    console.warn('[RewardConfig] Reward provider running in MOCK mode.');
    return { valid: false, missing, mode: 'mock' };
  }

  console.log('[RewardConfig] ✅ Amazon PA-API env vars present');
  return { valid: true, missing: [], mode: 'live' };
};

module.exports = { REWARD_CONFIG, validateRewardEnv };
