const User = require('../models/User');
const ERROR_CODES = require('../constants/errorCodes');

// ======================================================
// PROFILE SERVICE
// Owns: player profile reads and updates post-onboarding
// Must NOT: manage authentication or onboarding lifecycle
// ======================================================

const getProfile = async (userId) => {
  const user = await User.findById(userId).select('-passwordHash');
  if (!user) {
    const err = new Error('Profile not found');
    err.codeName = ERROR_CODES.RESOURCE_NOT_FOUND;
    throw err;
  }
  return user;
};

const updateProfile = async (userId, updateData) => {
  // Whitelist updatable fields — prevent mass assignment
  const allowedFields = [
    'playerName', 'age', 'dateOfBirth',
    'height', 'weight', 'primaryGoal',
    'defaultDisciplineTime'
  ];

  const sanitized = Object.keys(updateData).reduce((acc, key) => {
    if (allowedFields.includes(key)) acc[key] = updateData[key];
    return acc;
  }, {});

  const user = await User.findByIdAndUpdate(userId, sanitized, {
    new: true,
    runValidators: true
  }).select('-passwordHash');

  if (!user) {
    const err = new Error('Profile not found');
    err.codeName = ERROR_CODES.RESOURCE_NOT_FOUND;
    throw err;
  }

  return user;
};

module.exports = {
  getProfile,
  updateProfile
};
