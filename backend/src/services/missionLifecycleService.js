const Task = require('../models/Task');
const historyService = require('./historyService');
const xpPipeline = require('./orchestration/xpPipeline');
const { isTransitionAllowed, isTerminal } = require('../utils/taskStateUtils');
const { TASK_STATUS } = require('../constants/taskConstants');
const { BEHAVIORAL_EVENT_TYPES } = require('../constants/historyConstants');
const ERROR_CODES = require('../constants/errorCodes');

// ======================================================
// MISSION LIFECYCLE SERVICE
// THE most important file in Phase 2.
// Owns: ALL lifecycle transitions — completeMission, 
//       cancelMission, failMission, expireMission
// ONLY this file may mutate mission lifecycle truth.
// Must NOT: directly handle HTTP or render UI
// ======================================================

// ── Internal: resolve a mission to a terminal state ───
const _resolveToState = async (userId, missionId, toState, timestampField) => {
  // Fetch with ownership filter — prevents cross-user access
  const mission = await Task.findOne({ _id: missionId, userId });

  if (!mission) {
    const err = new Error('Mission not found or access denied');
    err.codeName = ERROR_CODES.RESOURCE_NOT_FOUND;
    err.statusCode = 404;
    throw err;
  }

  // Guard: reject transition from terminal state
  if (isTerminal(mission.status)) {
    const err = new Error(`Mission is already ${mission.status} and cannot be transitioned`);
    err.codeName = ERROR_CODES.BAD_REQUEST;
    err.statusCode = 400;
    throw err;
  }

  // Guard: validate transition is allowed by mission rules
  if (!isTransitionAllowed(mission.status, toState)) {
    const err = new Error(`Invalid transition: ${mission.status} → ${toState}`);
    err.codeName = ERROR_CODES.BAD_REQUEST;
    err.statusCode = 400;
    throw err;
  }

  // Apply transition
  mission.status = toState;
  mission[timestampField] = new Date();
  await mission.save();

  return mission;
};

// ── Complete a mission ────────────────────────────────
const completeMission = async (userId, missionId) => {
  const mission = await _resolveToState(userId, missionId, TASK_STATUS.COMPLETED, 'completedAt');

  await historyService.recordEvent(userId, BEHAVIORAL_EVENT_TYPES.MISSION_COMPLETED, {
    missionId: mission._id,
    title: mission.title,
    priority: mission.priority,
    completedAt: mission.completedAt
  });

  // Award XP through the pipeline (creates transaction + profile update)
  const xpResult = await xpPipeline.awardMissionXp(userId, mission);
  mission._xpResult = xpResult; // attach for controller response

  return mission;
};

// ── Cancel a mission ─────────────────────────────────
const cancelMission = async (userId, missionId) => {
  const mission = await _resolveToState(userId, missionId, TASK_STATUS.CANCELLED, 'cancelledAt');

  await historyService.recordEvent(userId, BEHAVIORAL_EVENT_TYPES.MISSION_CANCELLED, {
    missionId: mission._id,
    title: mission.title,
    cancelledAt: mission.cancelledAt
  });

  return mission;
};

// ── Fail a mission (player-triggered) ────────────────
const failMission = async (userId, missionId) => {
  const mission = await _resolveToState(userId, missionId, TASK_STATUS.FAILED, 'failedAt');

  await historyService.recordEvent(userId, BEHAVIORAL_EVENT_TYPES.MISSION_FAILED, {
    missionId: mission._id,
    title: mission.title,
    priority: mission.priority,
    failedAt: mission.failedAt
  });

  // Penalize XP through the pipeline
  await xpPipeline.penalizeMissionFailure(userId, mission);

  return mission;
};

// ── Expire a mission (system-triggered, no auth check) ─
// Called by taskFailureService — ownership already verified
const expireMission = async (missionId) => {
  const mission = await Task.findById(missionId);

  if (!mission || isTerminal(mission.status)) return null;

  if (!isTransitionAllowed(mission.status, TASK_STATUS.EXPIRED)) return null;

  mission.status = TASK_STATUS.EXPIRED;
  mission.expiredAt = new Date();
  await mission.save();

  await historyService.recordEvent(mission.userId, BEHAVIORAL_EVENT_TYPES.MISSION_EXPIRED, {
    missionId: mission._id,
    title: mission.title,
    deadline: mission.deadline,
    expiredAt: mission.expiredAt
  });

  // Penalize XP through the pipeline
  await xpPipeline.penalizeMissionExpiry(mission.userId, mission);

  return mission;
};

module.exports = {
  completeMission,
  cancelMission,
  failMission,
  expireMission
};
