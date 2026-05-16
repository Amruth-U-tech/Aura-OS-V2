// ======================================================
// NOTIFICATION CONSTANTS
// Owns notification trigger types and urgency tiers
// Backend scheduling truth — never setTimeout in components
// ======================================================

const NOTIFICATION_TYPES = {
  DEADLINE_WARNING: 'DEADLINE_WARNING',
  DISCIPLINE_ALERT: 'DISCIPLINE_ALERT',
  STREAK_AT_RISK: 'STREAK_AT_RISK',
  MISSION_COMPLETE: 'MISSION_COMPLETE',
  DAILY_RESET: 'DAILY_RESET',
  SYSTEM: 'SYSTEM'
};

const URGENCY_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

// Deadline warning thresholds in milliseconds
const WARNING_THRESHOLDS_MS = {
  ONE_HOUR: 60 * 60 * 1000,
  FOUR_HOURS: 4 * 60 * 60 * 1000,
  TWELVE_HOURS: 12 * 60 * 60 * 1000
};

module.exports = {
  NOTIFICATION_TYPES,
  URGENCY_LEVELS,
  WARNING_THRESHOLDS_MS
};
