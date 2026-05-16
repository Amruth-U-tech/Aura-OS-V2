const { MEANINGLESS_TITLES, MIN_DEADLINE_LEAD_TIME_MS } = require('../constants/missionRules');
const { TASK_PRIORITY, TASK_STATUS, VALIDATION_LIMITS } = require('../constants/taskConstants');
const ERROR_CODES = require('../constants/errorCodes');

// ======================================================
// TASK VALIDATOR
// Owns: mission legitimacy validation
// Centralized — no duplicate logic in controllers or services
// Must NOT: mutate Mongo or manage state
// ======================================================

// ── Validate mission creation payload ─────────────────
const validateMissionCreate = (data) => {
  const errors = [];
  const { title, description, priority, deadline } = data;

  // ── Title ──────────────────────────────────────────
  if (!title || typeof title !== 'string') {
    errors.push('Title is required');
  } else {
    const normalized = title.trim().toLowerCase();
    if (normalized.length < VALIDATION_LIMITS.MIN_TITLE_LENGTH) {
      errors.push(`Title must be at least ${VALIDATION_LIMITS.MIN_TITLE_LENGTH} characters`);
    } else if (normalized.length > VALIDATION_LIMITS.MAX_TITLE_LENGTH) {
      errors.push(`Title cannot exceed ${VALIDATION_LIMITS.MAX_TITLE_LENGTH} characters`);
    } else if (MEANINGLESS_TITLES.includes(normalized)) {
      errors.push('Mission title is not meaningful enough');
    }
  }

  // ── Description ────────────────────────────────────
  if (description !== undefined && description !== null) {
    if (typeof description !== 'string') {
      errors.push('Description must be a string');
    } else if (description.length > VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH) {
      errors.push(`Description cannot exceed ${VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH} characters`);
    }
  }

  // ── Priority ───────────────────────────────────────
  if (priority && !Object.values(TASK_PRIORITY).includes(priority)) {
    errors.push(`Invalid priority. Must be one of: ${Object.values(TASK_PRIORITY).join(', ')}`);
  }

  // ── Deadline ───────────────────────────────────────
  if (!deadline) {
    errors.push('Deadline is required');
  } else {
    const deadlineMs = new Date(deadline).getTime();
    if (isNaN(deadlineMs)) {
      errors.push('Deadline must be a valid date');
    } else if (deadlineMs - Date.now() < MIN_DEADLINE_LEAD_TIME_MS) {
      errors.push('Deadline must be at least 5 minutes in the future');
    }
  }

  return errors;
};

// ── Validate lifecycle transition payload ─────────────
const validateMissionUpdate = (data) => {
  const errors = [];
  const { status } = data;

  if (!status) {
    errors.push('Status is required for mission update');
  } else if (!Object.values(TASK_STATUS).includes(status)) {
    errors.push(`Invalid status. Must be one of: ${Object.values(TASK_STATUS).join(', ')}`);
  }

  return errors;
};

module.exports = {
  validateMissionCreate,
  validateMissionUpdate
};
