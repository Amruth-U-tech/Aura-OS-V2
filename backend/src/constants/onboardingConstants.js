// ======================================================
// ONBOARDING CONSTANTS
// Centralizes valid choices for onboarding fields
// Prevents invalid profile states at the data layer
// ======================================================

const PRIMARY_GOALS = {
  FITNESS: 'FITNESS',
  PRODUCTIVITY: 'PRODUCTIVITY',
  DISCIPLINE: 'DISCIPLINE',
  LEARNING: 'LEARNING',
  WEIGHT_LOSS: 'WEIGHT_LOSS',
  MUSCLE_GAIN: 'MUSCLE_GAIN'
};

const ONBOARDING_STEPS = {
  INTRO: 'INTRO',
  PROFILE: 'PROFILE',
  DISCIPLINE_SETUP: 'DISCIPLINE_SETUP',
  COMPLETE: 'COMPLETE'
};

const VALIDATION_LIMITS = {
  MIN_NAME_LENGTH: 2,
  MAX_NAME_LENGTH: 50,
  MIN_AGE: 13,
  MAX_AGE: 120,
  MIN_HEIGHT_CM: 50,
  MAX_HEIGHT_CM: 300,
  MIN_WEIGHT_KG: 20,
  MAX_WEIGHT_KG: 500
};

module.exports = {
  PRIMARY_GOALS,
  ONBOARDING_STEPS,
  VALIDATION_LIMITS
};
