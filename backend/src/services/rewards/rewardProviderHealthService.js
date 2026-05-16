// ======================================================
// REWARD PROVIDER HEALTH SERVICE
// Owns: reward provider connectivity validation
// Must NOT: contain redemption logic
// ======================================================

const { validateRewardEnv } = require('./rewardProviderConfig');
const { fetchAmazonVouchers } = require('./amazonProviderAdapter');

/**
 * Checks reward provider health and connectivity.
 */
const checkRewardHealth = async () => {
  const envResult = validateRewardEnv();

  // Test mock/live data fetch
  const fetchResult = await fetchAmazonVouchers({ maxResults: 1 });

  return {
    provider: 'rewards',
    status: fetchResult.success ? 'ready' : 'error',
    mode: envResult.mode,
    amazonConfigured: envResult.valid,
    sampleFetch: fetchResult.success,
    timestamp: new Date().toISOString()
  };
};

module.exports = { checkRewardHealth };
