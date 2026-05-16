const asyncHandler = require('../utils/asyncHandler');
const profileService = require('../services/profileService');
const { sendSuccess } = require('../utils/apiResponse');

// ======================================================
// PROFILE CONTROLLER
// Handles: profile read/update request/response flow
// Delegates: all logic to profileService
// Must NOT: contain data transformation logic
// ======================================================

const getProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.getProfile(req.user.id);
  sendSuccess(res, profile);
});

const updateProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.updateProfile(req.user.id, req.body);
  sendSuccess(res, profile, 'Profile updated successfully');
});

module.exports = {
  getProfile,
  updateProfile
};
