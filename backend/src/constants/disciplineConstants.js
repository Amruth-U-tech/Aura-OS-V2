// ======================================================
// DISCIPLINE CONSTANTS
// Owns all discipline lifecycle state identifiers
// Backend truth — never frontend-computed
// ======================================================

const DISCIPLINE_STATE = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  WAITING: 'WAITING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
};

const DISCIPLINE_RESET_HOUR = 0; // Midnight — backend-enforced

const VALIDATION_LIMITS = {
  MIN_DISCIPLINE_HOUR: 0,
  MAX_DISCIPLINE_HOUR: 23,
  MIN_DISCIPLINE_DURATION_MINUTES: 5,
  MAX_DISCIPLINE_DURATION_MINUTES: 480
};

module.exports = {
  DISCIPLINE_STATE,
  DISCIPLINE_RESET_HOUR,
  VALIDATION_LIMITS
};
