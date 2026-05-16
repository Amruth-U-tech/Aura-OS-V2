const {
  VALIDATION_LIMITS: OB_LIMITS,
  PRIMARY_GOALS,
  ONBOARDING_STEPS
} = require('../constants/onboardingConstants');

// ======================================================
// ONBOARDING VALIDATOR
// Validates player profile data during onboarding flow
// Centralized so controllers stay clean
// ======================================================

// ── Validate player profile data ──────────────────────
const validatePlayerProfile = (data) => {
  const errors = [];
  const { playerName, age, height, weight, primaryGoal, dateOfBirth } = data;

  if (!playerName || playerName.trim().length < OB_LIMITS.MIN_NAME_LENGTH) {
    errors.push(`Player name must be at least ${OB_LIMITS.MIN_NAME_LENGTH} characters`);
  }
  if (playerName && playerName.trim().length > OB_LIMITS.MAX_NAME_LENGTH) {
    errors.push(`Player name cannot exceed ${OB_LIMITS.MAX_NAME_LENGTH} characters`);
  }
  if (age !== undefined) {
    if (age < OB_LIMITS.MIN_AGE || age > OB_LIMITS.MAX_AGE) {
      errors.push(`Age must be between ${OB_LIMITS.MIN_AGE} and ${OB_LIMITS.MAX_AGE}`);
    }
  }
  if (height !== undefined) {
    if (height < OB_LIMITS.MIN_HEIGHT_CM || height > OB_LIMITS.MAX_HEIGHT_CM) {
      errors.push(`Height must be between ${OB_LIMITS.MIN_HEIGHT_CM} and ${OB_LIMITS.MAX_HEIGHT_CM} cm`);
    }
  }
  if (weight !== undefined) {
    if (weight < OB_LIMITS.MIN_WEIGHT_KG || weight > OB_LIMITS.MAX_WEIGHT_KG) {
      errors.push(`Weight must be between ${OB_LIMITS.MIN_WEIGHT_KG} and ${OB_LIMITS.MAX_WEIGHT_KG} kg`);
    }
  }
  if (primaryGoal && !Object.values(PRIMARY_GOALS).includes(primaryGoal)) {
    errors.push(`Invalid primary goal. Must be one of: ${Object.values(PRIMARY_GOALS).join(', ')}`);
  }

  return errors;
};

// ── Validate discipline hour ──────────────────────────
const validateDisciplineHour = (hour) => {
  const errors = [];
  if (hour === undefined || hour === null) {
    errors.push('Discipline hour is required');
  } else if (hour < 0 || hour > 23 || !Number.isInteger(hour)) {
    errors.push('Discipline hour must be an integer between 0 and 23');
  }
  return errors;
};

module.exports = {
  validatePlayerProfile,
  validateDisciplineHour
};
