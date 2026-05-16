const DisciplineProfile = require('../models/DisciplineProfile');
const { DISCIPLINE_STATE } = require('../constants/disciplineConstants');
const ERROR_CODES = require('../constants/errorCodes');

// ======================================================
// DISCIPLINE LIFECYCLE SERVICE
// Owns: discipline state transitions
// Backend is the sole authority on discipline truth
// Must NOT: render frontend or manage missions
// ======================================================

// ── Get current discipline state ──────────────────────
const getDisciplineState = async (userId) => {
  const profile = await DisciplineProfile.findOne({ userId });
  if (!profile) {
    const err = new Error('Discipline profile not found');
    err.codeName = ERROR_CODES.RESOURCE_NOT_FOUND;
    throw err;
  }
  return profile;
};

// ── Toggle discipline on/off (player-initiated) ───────
const setDisciplineEnabled = async (userId, enabled) => {
  const state = enabled ? DISCIPLINE_STATE.ACTIVE : DISCIPLINE_STATE.DISABLED;
  const update = { currentState: state };
  if (!enabled) update.manuallyDisabledAt = new Date();

  const profile = await DisciplineProfile.findOneAndUpdate(
    { userId },
    update,
    { new: true }
  );

  if (!profile) {
    const err = new Error('Discipline profile not found');
    err.codeName = ERROR_CODES.RESOURCE_NOT_FOUND;
    throw err;
  }

  return profile;
};

// ── Mark discipline session as completed ──────────────
const completeDisciplineSession = async (userId) => {
  const profile = await DisciplineProfile.findOneAndUpdate(
    { userId },
    {
      currentState: DISCIPLINE_STATE.COMPLETED,
      lastCompletedDate: new Date()
    },
    { new: true }
  );

  if (!profile) {
    const err = new Error('Discipline profile not found');
    err.codeName = ERROR_CODES.RESOURCE_NOT_FOUND;
    throw err;
  }

  return profile;
};

module.exports = {
  getDisciplineState,
  setDisciplineEnabled,
  completeDisciplineSession
};
