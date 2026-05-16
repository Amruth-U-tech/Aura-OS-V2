// ======================================================
// MISSION RULES
// Defines valid lifecycle transitions and behavioral rules
// Backend authority — these rules are ABSOLUTE
// ======================================================

// ── Valid Lifecycle Transitions ────────────────────────
// Maps: fromState → [allowedToStates]
const VALID_TRANSITIONS = {
  PENDING: ['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  COMPLETED: [], // Terminal — no further transitions
  FAILED: [],    // Terminal
  CANCELLED: [], // Terminal
  EXPIRED: []    // Terminal
};

// ── Meaningful Title Validation ────────────────────────
// Titles that are meaningless — rejected by validator
const MEANINGLESS_TITLES = [
  'hi', 'hello', 'hey', 'test', 'testing', 'lol', 'ok', 'okay',
  'aaaa', 'asdf', 'qwerty', 'abc', 'blah', 'stuff', 'thing',
  'task', 'todo', 'note', 'new task', 'untitled', '...'
];

// ── Minimum deadline lead time ─────────────────────────
// Missions must have at least 5 minutes of lead time
const MIN_DEADLINE_LEAD_TIME_MS = 5 * 60 * 1000;

module.exports = {
  VALID_TRANSITIONS,
  MEANINGLESS_TITLES,
  MIN_DEADLINE_LEAD_TIME_MS
};
