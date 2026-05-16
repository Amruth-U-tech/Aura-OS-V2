const { DISCIPLINE_STATE, VALIDATION_LIMITS } = require('../constants/disciplineConstants');

// ======================================================
// DISCIPLINE TIME UTILS
// Pure functions for discipline timing calculations
// No side effects — safe to call anywhere
// ======================================================

// ── Format hour as display string (e.g., 6 → "06:00 AM") ─
const formatDisciplineHour = (hour) => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

// ── Check if discipline window is currently active ───
const isDisciplineWindowNow = (scheduledHour, durationMinutes) => {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = scheduledHour * 60;
  const endMinutes = startMinutes + durationMinutes;
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
};

// ── Validate discipline hour is in acceptable range ──
const isValidDisciplineHour = (hour) => {
  return (
    Number.isInteger(hour) &&
    hour >= VALIDATION_LIMITS.MIN_DISCIPLINE_HOUR &&
    hour <= VALIDATION_LIMITS.MAX_DISCIPLINE_HOUR
  );
};

module.exports = {
  formatDisciplineHour,
  isDisciplineWindowNow,
  isValidDisciplineHour
};
