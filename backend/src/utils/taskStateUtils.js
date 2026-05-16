const { VALID_TRANSITIONS } = require('../constants/missionRules');
const { TASK_STATUS } = require('../constants/taskConstants');

// ======================================================
// TASK STATE UTILS
// Pure functions for lifecycle state evaluation
// No Mongo access — safe to use anywhere
// ======================================================

// ── Check if a transition is valid ────────────────────
const isTransitionAllowed = (fromState, toState) => {
  const allowed = VALID_TRANSITIONS[fromState] || [];
  return allowed.includes(toState);
};

// ── Check if a mission is terminal (no further changes) ─
const isTerminal = (status) => {
  return VALID_TRANSITIONS[status]?.length === 0;
};

// ── Check if a mission is still actionable ────────────
const isPending = (status) => {
  return status === TASK_STATUS.PENDING;
};

module.exports = {
  isTransitionAllowed,
  isTerminal,
  isPending
};
