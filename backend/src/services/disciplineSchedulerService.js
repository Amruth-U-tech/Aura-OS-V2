const { runGlobalDailyReset } = require('./dailyResetService');
const { DISCIPLINE_RESET_HOUR } = require('../constants/disciplineConstants');

// ======================================================
// DISCIPLINE SCHEDULER SERVICE
// Owns: timing orchestration for the midnight reset
// Uses setInterval to check the clock — no external cron needed
// Prevents: duplicate scheduler initialization, missed resets
// Must NOT: contain state logic — delegates to dailyResetService
// ======================================================

let schedulerInterval = null;
let isInitialized = false;

// ── Calculate ms until next midnight ──────────────────
const msUntilMidnight = () => {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(DISCIPLINE_RESET_HOUR, 0, 0, 0);
  midnight.setDate(midnight.getDate() + 1);
  return midnight.getTime() - now.getTime();
};

// ── Start the scheduler ───────────────────────────────
const startScheduler = () => {
  // Guard: prevent duplicate scheduler initialization
  if (isInitialized) {
    console.log('[Scheduler] Discipline scheduler already running — skipping');
    return;
  }

  const scheduleNext = () => {
    const delay = msUntilMidnight();
    console.log(`[Scheduler] Next discipline reset scheduled in ${Math.round(delay / 60000)} minutes`);

    setTimeout(async () => {
      await runGlobalDailyReset();
      scheduleNext(); // Recursively schedule next reset
    }, delay);
  };

  scheduleNext();
  isInitialized = true;
  console.log('[Scheduler] Discipline scheduler initialized');
};

// ── Stop the scheduler (for testing/graceful shutdown) ─
const stopScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  isInitialized = false;
  console.log('[Scheduler] Discipline scheduler stopped');
};

module.exports = {
  startScheduler,
  stopScheduler
};
