const { MIN_DEADLINE_LEAD_TIME_MS } = require('../constants/missionRules');

// ======================================================
// TASK DEADLINE UTILS
// Pure functions for deadline calculations
// No side effects — safe to call anywhere
// ======================================================

// ── Check if a deadline is still in the future ────────
const isDeadlineValid = (deadline) => {
  return new Date(deadline).getTime() - Date.now() >= MIN_DEADLINE_LEAD_TIME_MS;
};

// ── Check if a deadline has passed ────────────────────
const isExpired = (deadline) => {
  return new Date(deadline).getTime() < Date.now();
};

// ── Get ms remaining until deadline ───────────────────
const msRemaining = (deadline) => {
  return new Date(deadline).getTime() - Date.now();
};

// ── Format deadline for display ───────────────────────
const formatDeadline = (deadline) => {
  return new Date(deadline).toISOString();
};

module.exports = {
  isDeadlineValid,
  isExpired,
  msRemaining,
  formatDeadline
};
