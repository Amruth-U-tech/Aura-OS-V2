const asyncHandler = require('../utils/asyncHandler');
const taskService = require('../services/taskService');
const { sendSuccess } = require('../utils/apiResponse');

// ======================================================
// TASK CONTROLLER
// Owns: request/response flow ONLY
// Thin layer — all logic delegated to services
// Must NOT: contain business logic or lifecycle decisions
// ======================================================

// ── GET /api/v1/tasks ─────────────────────────────────
const getMissions = asyncHandler(async (req, res) => {
  const { status, priority } = req.query;
  const missions = await taskService.getMissions(req.user.id, { status, priority });
  sendSuccess(res, missions);
});

// ── GET /api/v1/tasks/:id ─────────────────────────────
const getMissionById = asyncHandler(async (req, res) => {
  const mission = await taskService.getMissionById(req.user.id, req.params.id);
  sendSuccess(res, mission);
});

// ── POST /api/v1/tasks ────────────────────────────────
const createMission = asyncHandler(async (req, res) => {
  const mission = await taskService.createMission(req.user.id, req.body);
  sendSuccess(res, mission, 'Mission created', 201);
});

// ── PATCH /api/v1/tasks/:id/complete ─────────────────
const completeMission = asyncHandler(async (req, res) => {
  const mission = await taskService.completeMission(req.user.id, req.params.id);
  sendSuccess(res, mission, 'Mission completed');
});

// ── PATCH /api/v1/tasks/:id/cancel ───────────────────
const cancelMission = asyncHandler(async (req, res) => {
  const mission = await taskService.cancelMission(req.user.id, req.params.id);
  sendSuccess(res, mission, 'Mission cancelled');
});

// ── PATCH /api/v1/tasks/:id/fail ─────────────────────
const failMission = asyncHandler(async (req, res) => {
  const mission = await taskService.failMission(req.user.id, req.params.id);
  sendSuccess(res, mission, 'Mission marked as failed');
});

module.exports = {
  getMissions,
  getMissionById,
  createMission,
  completeMission,
  cancelMission,
  failMission
};
