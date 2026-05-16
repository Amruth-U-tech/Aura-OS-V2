const Task = require('../models/Task');
const { TASK_STATUS } = require('../constants/taskConstants');
const ERROR_CODES = require('../constants/errorCodes');

// ======================================================
// TASK QUERY SERVICE — Phase 2.4.3
// Owns: mission retrieval, filtering, sorting
// All queries are scoped to authenticated player ownership
// Phase 2.4.3: Dashboard visibility lifecycle — terminal
// tasks auto-hide after 48 hours for clean active workspace
// Must NOT: mutate mission state
// ======================================================

// ── Dashboard visibility window (hours) ──────────────
const DASHBOARD_VISIBILITY_HOURS = 48;

// ── Terminal statuses that auto-hide after visibility window ─
const TERMINAL_STATUSES = [
  TASK_STATUS.COMPLETED,
  TASK_STATUS.FAILED,
  TASK_STATUS.CANCELLED,
  TASK_STATUS.EXPIRED
];

// ── Mapping of terminal status → timestamp field ─────
const TERMINAL_TIMESTAMP_MAP = {
  [TASK_STATUS.COMPLETED]: 'completedAt',
  [TASK_STATUS.FAILED]: 'failedAt',
  [TASK_STATUS.CANCELLED]: 'cancelledAt',
  [TASK_STATUS.EXPIRED]: 'expiredAt'
};

// ── Get dashboard missions (active workspace view) ───
// Shows: all active/pending tasks + terminal tasks within 48h
// This is the PRIMARY query for the dashboard
const getMissions = async (userId, { status, priority, dashboard = true } = {}) => {
  const query = { userId };

  // Apply priority filter if provided
  if (priority) {
    query.priority = priority;
  }

  if (dashboard) {
    const cutoff = new Date(Date.now() - DASHBOARD_VISIBILITY_HOURS * 60 * 60 * 1000);

    if (status && Object.values(TASK_STATUS).includes(status)) {
      // User is filtering by a specific status
      query.status = status;

      // For terminal states, enforce the 48h visibility window
      if (TERMINAL_STATUSES.includes(status)) {
        const tsField = TERMINAL_TIMESTAMP_MAP[status];
        if (tsField) {
          query[tsField] = { $gte: cutoff };
        }
      }
    } else {
      // No status filter — show active workspace
      // Active tasks always visible + terminal within 48h window
      query.$or = [
        // Active/pending tasks — always visible on dashboard
        { status: { $nin: TERMINAL_STATUSES } },
        // Terminal tasks — only within visibility window
        { status: TASK_STATUS.COMPLETED, completedAt: { $gte: cutoff } },
        { status: TASK_STATUS.FAILED, failedAt: { $gte: cutoff } },
        { status: TASK_STATUS.CANCELLED, cancelledAt: { $gte: cutoff } },
        { status: TASK_STATUS.EXPIRED, expiredAt: { $gte: cutoff } }
      ];
    }
  } else {
    // Non-dashboard mode: return ALL tasks (for history/archive views)
    if (status && Object.values(TASK_STATUS).includes(status)) {
      query.status = status;
    }
  }

  return await Task.find(query).sort({ deadline: 1, createdAt: -1 });
};

// ── Get all missions (no visibility filter) ──────────
// Used for history, stats, and archive views
const getMissionsAll = async (userId, { status, priority } = {}) => {
  const query = { userId };

  if (status && Object.values(TASK_STATUS).includes(status)) {
    query.status = status;
  }
  if (priority) {
    query.priority = priority;
  }

  return await Task.find(query).sort({ deadline: 1, createdAt: -1 });
};

// ── Get a single mission by ID (ownership enforced) ───
const getMissionById = async (userId, missionId) => {
  const mission = await Task.findOne({ _id: missionId, userId });

  if (!mission) {
    const err = new Error('Mission not found or access denied');
    err.codeName = ERROR_CODES.RESOURCE_NOT_FOUND;
    err.statusCode = 404;
    throw err;
  }

  return mission;
};

module.exports = {
  getMissions,
  getMissionsAll,
  getMissionById
};
