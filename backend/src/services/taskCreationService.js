const Task = require('../models/Task');
const historyService = require('./historyService');
const { validateMissionCreate } = require('../validators/taskValidator');
const { TASK_STATUS, TASK_PRIORITY } = require('../constants/taskConstants');
const { BEHAVIORAL_EVENT_TYPES } = require('../constants/historyConstants');
const auraEvents = require('../events/eventBus');
const { EVENTS } = require('../events/eventConstants');
const ERROR_CODES = require('../constants/errorCodes');

// ======================================================
// TASK CREATION SERVICE
// Owns: mission creation orchestration
// Coordinates: validation, persistence, history, notifications
// Must NOT: manage lifecycle transitions directly
// ======================================================

const createMission = async (userId, missionData) => {
  const { title, description, priority, deadline } = missionData;

  // ── Step 1: Validate payload ───────────────────────
  const errors = validateMissionCreate(missionData);
  if (errors.length > 0) {
    const err = new Error(errors.join('; '));
    err.codeName = ERROR_CODES.VALIDATION_ERROR;
    err.statusCode = 400;
    throw err;
  }

  // ── Step 2: Persist to MongoDB ─────────────────────
  const mission = await Task.create({
    userId,
    title: title.trim(),
    description: description ? description.trim() : '',
    priority: priority || TASK_PRIORITY.NORMAL,
    deadline: new Date(deadline),
    status: TASK_STATUS.PENDING
  });

  // ── Step 3: Record behavioral history ─────────────
  await historyService.recordEvent(userId, BEHAVIORAL_EVENT_TYPES.MISSION_CREATED, {
    missionId: mission._id,
    title: mission.title,
    priority: mission.priority,
    deadline: mission.deadline
  });

  // ── Step 4: Emit domain event (Phase 3.1.4) ────────
  // Enables cross-tab realtime sync for the same account
  auraEvents.emitEvent(EVENTS.TASK_CREATED, {
    userId: userId.toString(),
    taskId: mission._id.toString(),
    title: mission.title,
    priority: mission.priority,
    status: mission.status,
    deadline: mission.deadline
  });

  return mission;
};

module.exports = {
  createMission
};
