const Task = require('../models/Task');
const { expireMission } = require('./missionLifecycleService');
const { isExpired } = require('../utils/taskDeadlineUtils');
const { TASK_STATUS } = require('../constants/taskConstants');

// ======================================================
// TASK FAILURE SERVICE
// Owns: deadline expiration detection and auto-failure
// Safely handles backend restart, stale deadlines,
// and duplicate expiration prevention
// Must NOT: manage active player-triggered transitions
// ======================================================

// ── Find and expire all overdue PENDING missions ──────
const runExpirationCheck = async () => {
  const now = new Date();
  console.log('[FailureService] Running expiration check...');

  // Query: only PENDING missions with a past deadline
  const overdueMissions = await Task.find({
    status: TASK_STATUS.PENDING,
    deadline: { $lt: now }
  }).select('_id userId title deadline');

  if (overdueMissions.length === 0) {
    console.log('[FailureService] No overdue missions found');
    return { expired: 0 };
  }

  const results = await Promise.allSettled(
    overdueMissions.map(m => expireMission(m._id))
  );

  const expired = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
  const failed = results.filter(r => r.status === 'rejected').length;

  console.log(`[FailureService] Expiration complete — expired: ${expired}, errors: ${failed}`);
  return { expired, errors: failed };
};

// ── Schedule periodic expiration checks ───────────────
// Runs every 5 minutes to catch missed deadlines safely
let expirationInterval = null;

const startExpirationScheduler = () => {
  if (expirationInterval) {
    console.log('[FailureService] Expiration scheduler already running');
    return;
  }

  // Run once immediately on boot (catches missed deadlines after restart)
  runExpirationCheck();

  // Then check every 5 minutes
  expirationInterval = setInterval(runExpirationCheck, 5 * 60 * 1000);
  console.log('[FailureService] Expiration scheduler started (5-minute interval)');
};

const stopExpirationScheduler = () => {
  if (expirationInterval) {
    clearInterval(expirationInterval);
    expirationInterval = null;
    console.log('[FailureService] Expiration scheduler stopped');
  }
};

module.exports = {
  runExpirationCheck,
  startExpirationScheduler,
  stopExpirationScheduler
};
