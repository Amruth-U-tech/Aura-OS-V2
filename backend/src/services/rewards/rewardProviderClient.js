// ======================================================
// REWARD PROVIDER CLIENT
// Owns: provider request abstraction and auth handling
// Abstracts over Amazon (future: other reward providers)
// Must NOT: contain redemption logic or persistence
// ======================================================

const { fetchAmazonVouchers } = require('./amazonProviderAdapter');

/**
 * Fetches available rewards from all configured providers.
 * @param {object} options - { category, maxResults }
 */
const fetchRewards = async (options = {}) => {
  // Currently only Amazon provider
  const amazonResult = await fetchAmazonVouchers(options);

  return {
    success: true,
    providers: {
      amazon: amazonResult
    },
    timestamp: new Date().toISOString()
  };
};

module.exports = { fetchRewards };
