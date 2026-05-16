// ======================================================
// TRUST COMMUNICATION SERVICE
// Owns: trust engine communication boundaries
// Provides interface contracts for other services
// Must NOT: contain trust score math or persistence
// ======================================================

const { emitTrustEvent, getPendingCount } = require('./trustEventAdapter');

/**
 * High-level interface for other services to report trust-affecting events.
 * Wraps emitTrustEvent with convenience methods.
 */

const reportTaskCompletion = (userId, validScore, metadata = {}) => {
  return emitTrustEvent({
    userId,
    source: 'TASK_COMPLETION',
    validScore,
    metadata
  });
};

const reportChallengeProof = (userId, validScore, metadata = {}) => {
  return emitTrustEvent({
    userId,
    source: 'CHALLENGE_PROOF',
    validScore,
    metadata
  });
};

const reportDeadlineMiss = (userId, metadata = {}) => {
  return emitTrustEvent({
    userId,
    source: 'DEADLINE_MISS',
    validScore: 0,
    metadata
  });
};

const reportChallengeWin = (userId, metadata = {}) => {
  return emitTrustEvent({
    userId,
    source: 'CHALLENGE_WIN',
    metadata
  });
};

const reportChallengeLoss = (userId, metadata = {}) => {
  return emitTrustEvent({
    userId,
    source: 'CHALLENGE_LOSS',
    metadata
  });
};

module.exports = {
  reportTaskCompletion,
  reportChallengeProof,
  reportDeadlineMiss,
  reportChallengeWin,
  reportChallengeLoss,
  getPendingCount
};
