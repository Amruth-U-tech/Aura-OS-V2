// ======================================================
// TASK CONSTANTS
// Centralized source of truth for task lifecycles
// Prevents magic strings and duplicated logic across the system
// ======================================================

const TASK_PRIORITY = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  ELITE: 'ELITE'
};

const TASK_STATUS = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED'
};

const DEADLINE_TYPES = {
  HOURS: 'HOURS',
  DAYS: 'DAYS',
  WEEKS: 'WEEKS'
};

const VALIDATION_LIMITS = {
  MIN_TITLE_LENGTH: 3,
  MAX_TITLE_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500
};

// Placeholders for future behavioral & scaling phases
const FUTURE_STATES = {
  ARCHIVED: 'ARCHIVED',
  LOCKED: 'LOCKED',
  DECAYING: 'DECAYING',
  FOCUS_MODE: 'FOCUS_MODE'
};

module.exports = {
  TASK_PRIORITY,
  TASK_STATUS,
  DEADLINE_TYPES,
  VALIDATION_LIMITS,
  FUTURE_STATES
};
