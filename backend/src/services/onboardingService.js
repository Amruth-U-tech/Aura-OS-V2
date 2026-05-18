const User = require('../models/User');
const DisciplineProfile = require('../models/DisciplineProfile');
const { ONBOARDING_STEPS, PRIMARY_GOALS } = require('../constants/onboardingConstants');
const { DISCIPLINE_STATE } = require('../constants/disciplineConstants');
const ERROR_CODES = require('../constants/errorCodes');

// ======================================================
// ONBOARDING SERVICE
// Owns: onboarding orchestration, first-time profile init
// Prevents: duplicate onboarding, partial onboarding states
// Must NOT: manage frontend state or auth logic
// ======================================================

// ── Step 1: Initialize a fresh onboarding session ─────
const initializeOnboarding = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.codeName = ERROR_CODES.RESOURCE_NOT_FOUND;
    throw err;
  }

  // Guard: prevent re-onboarding a completed player
  if (user.onboardingCompleted) {
    const err = new Error('Onboarding already completed');
    err.codeName = ERROR_CODES.BAD_REQUEST;
    throw err;
  }

  user.onboardingStep = ONBOARDING_STEPS.INTRO;
  await user.save();
  return user;
};

// ── Step 2: Save player profile from onboarding form ──
const savePlayerProfile = async (userId, profileData) => {
  const {
    playerName, age, dateOfBirth,
    height, weight, primaryGoal
  } = profileData;

  const user = await User.findByIdAndUpdate(
    userId,
    {
      playerName, age, dateOfBirth,
      height, weight, primaryGoal,
      onboardingStep: ONBOARDING_STEPS.DISCIPLINE_SETUP
    },
    { returnDocument: 'after', runValidators: true }
  );

  if (!user) {
    const err = new Error('User not found');
    err.codeName = ERROR_CODES.RESOURCE_NOT_FOUND;
    throw err;
  }

  return user;
};

// ── Step 3: Save discipline time preference ───────────
const saveDisciplinePreference = async (userId, disciplineHour) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { defaultDisciplineTime: disciplineHour },
    { returnDocument: 'after', runValidators: true }
  );

  if (!user) {
    const err = new Error('User not found');
    err.codeName = ERROR_CODES.RESOURCE_NOT_FOUND;
    throw err;
  }

  // Initialize discipline profile with their chosen time
  await DisciplineProfile.findOneAndUpdate(
    { userId },
    {
      userId,
      scheduledHour: disciplineHour,
      currentState: DISCIPLINE_STATE.WAITING
    },
    { upsert: true, returnDocument: 'after' }
  );

  return user;
};

// ── Step 4: Complete onboarding ───────────────────────
const completeOnboarding = async (userId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    {
      onboardingCompleted: true,
      onboardingStep: ONBOARDING_STEPS.COMPLETE
    },
    { returnDocument: 'after' }
  );

  if (!user) {
    const err = new Error('User not found');
    err.codeName = ERROR_CODES.RESOURCE_NOT_FOUND;
    throw err;
  }

  return user;
};

module.exports = {
  initializeOnboarding,
  savePlayerProfile,
  saveDisciplinePreference,
  completeOnboarding
};
