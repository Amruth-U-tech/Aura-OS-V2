const DisciplineProfile = require('../models/DisciplineProfile');
const { DISCIPLINE_STATE, DISCIPLINE_RESET_HOUR } = require('../constants/disciplineConstants');

// ======================================================
// DAILY RESET SERVICE
// Owns: midnight discipline reset orchestration
// Prevents: duplicate resets, stale state persistence
// Must NOT: manage mission or notification systems
// ======================================================

// ── Check if a reset has already happened today ───────
const hasResetToday = (lastResetDate) => {
  if (!lastResetDate) return false;
  const now = new Date();
  const reset = new Date(lastResetDate);
  return (
    reset.getFullYear() === now.getFullYear() &&
    reset.getMonth() === now.getMonth() &&
    reset.getDate() === now.getDate()
  );
};

// ── Execute daily reset for a single player ───────────
const resetPlayerDiscipline = async (userId) => {
  const profile = await DisciplineProfile.findOne({ userId });
  if (!profile) return null;

  // Guard: prevent duplicate resets
  if (hasResetToday(profile.lastResetDate)) return profile;

  profile.currentState = DISCIPLINE_STATE.WAITING;
  profile.lastResetDate = new Date();
  profile.manuallyDisabledAt = null;
  await profile.save();

  return profile;
};

// ── Execute global midnight reset for all players ─────
// Called once at 00:00 by disciplineSchedulerService
const runGlobalDailyReset = async () => {
  console.log('[DailyReset] Running global midnight discipline reset...');
  const profiles = await DisciplineProfile.find({});

  const results = await Promise.allSettled(
    profiles.map(p => resetPlayerDiscipline(p.userId))
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  console.log(`[DailyReset] Reset complete — success: ${succeeded}, failed: ${failed}`);
  return { succeeded, failed };
};

module.exports = {
  resetPlayerDiscipline,
  runGlobalDailyReset
};
