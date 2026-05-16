// ======================================================
// TASK SERVICE
// Thin orchestration layer — routes calls to correct services
// Maintains backward compatibility for the controller layer
// ======================================================

const taskCreationService = require('./taskCreationService');
const missionLifecycleService = require('./missionLifecycleService');
const taskQueryService = require('./taskQueryService');

module.exports = {
  // Creation
  createMission: taskCreationService.createMission,

  // Queries
  getMissions: taskQueryService.getMissions,
  getMissionById: taskQueryService.getMissionById,

  // Lifecycle transitions
  completeMission: missionLifecycleService.completeMission,
  cancelMission: missionLifecycleService.cancelMission,
  failMission: missionLifecycleService.failMission
};
