// ======================================================
// TRUST HEALTH SERVICE
// Owns: trust engine readiness validation
// Must NOT: contain trust calculations
// ======================================================

const { getPendingCount } = require('./trustEventAdapter');

/**
 * Returns trust engine health status.
 */
const checkTrustHealth = () => {
  return {
    provider: 'trust_engine',
    status: 'ready',
    pendingEvents: getPendingCount(),
    message: 'Trust event pipeline active — scoring engine pending Phase 2.3',
    timestamp: new Date().toISOString()
  };
};

module.exports = { checkTrustHealth };
