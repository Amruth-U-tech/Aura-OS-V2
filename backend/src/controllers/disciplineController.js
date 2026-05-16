const asyncHandler = require('../utils/asyncHandler');
const disciplineLifecycleService = require('../services/disciplineLifecycleService');
const { sendSuccess } = require('../utils/apiResponse');

// ======================================================
// DISCIPLINE CONTROLLER
// Handles: discipline state request/response flow
// Delegates: all state logic to disciplineLifecycleService
// Must NOT: contain reset or scheduling logic
// ======================================================

const getDisciplineState = asyncHandler(async (req, res) => {
  const state = await disciplineLifecycleService.getDisciplineState(req.user.id);
  sendSuccess(res, state);
});

const toggleDiscipline = asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  const state = await disciplineLifecycleService.setDisciplineEnabled(req.user.id, enabled);
  sendSuccess(res, state, `Discipline ${enabled ? 'enabled' : 'disabled'}`);
});

const completeDiscipline = asyncHandler(async (req, res) => {
  const state = await disciplineLifecycleService.completeDisciplineSession(req.user.id);
  sendSuccess(res, state, 'Discipline session completed');
});

module.exports = {
  getDisciplineState,
  toggleDiscipline,
  completeDiscipline
};
