const asyncHandler = require('../utils/asyncHandler');
const progressionService = require('../services/progressionService');
const { sendSuccess } = require('../utils/apiResponse');

// ======================================================
// PROGRESSION CONTROLLER
// Placeholder for Phase 2 progression engine integration
// ======================================================

const getProgression = asyncHandler(async (req, res) => {
  const progression = await progressionService.getProgression();
  sendSuccess(res, progression);
});

module.exports = {
  getProgression
};
