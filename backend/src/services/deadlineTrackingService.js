const { WARNING_THRESHOLDS_MS, NOTIFICATION_TYPES, URGENCY_LEVELS } = require('../constants/notificationConstants');

// ======================================================
// DEADLINE TRACKING SERVICE
// Owns: deadline proximity calculations
// Determines urgency level based on time remaining
// Must NOT: send notifications directly — delegates to scheduler
// ======================================================

// ── Calculate urgency level from deadline ─────────────
const getUrgencyLevel = (deadlineDate) => {
  const remaining = new Date(deadlineDate).getTime() - Date.now();

  if (remaining <= 0) return URGENCY_LEVELS.CRITICAL;
  if (remaining <= WARNING_THRESHOLDS_MS.ONE_HOUR) return URGENCY_LEVELS.HIGH;
  if (remaining <= WARNING_THRESHOLDS_MS.FOUR_HOURS) return URGENCY_LEVELS.MEDIUM;
  if (remaining <= WARNING_THRESHOLDS_MS.TWELVE_HOURS) return URGENCY_LEVELS.LOW;
  return null; // No notification needed yet
};

// ── Check if deadline warning should fire ────────────
const shouldNotify = (deadlineDate, lastNotifiedAt) => {
  const urgency = getUrgencyLevel(deadlineDate);
  if (!urgency) return false;

  // Prevent duplicate notifications for same urgency window
  if (lastNotifiedAt) {
    const lastUrgency = getUrgencyLevel(lastNotifiedAt);
    if (lastUrgency === urgency) return false;
  }

  return true;
};

module.exports = {
  getUrgencyLevel,
  shouldNotify
};
