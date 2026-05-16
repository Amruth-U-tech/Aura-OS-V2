// ======================================================
// NOTIFICATION SCHEDULER SERVICE
// Owns: behavioral urgency event scheduling
// Placeholder for Phase 2 — polling or WebSocket integration
// Must NOT: dispatch random setTimeout calls from components
// ======================================================

let isRunning = false;

// ── Start notification check loop ────────────────────
const startNotificationScheduler = () => {
  if (isRunning) {
    console.log('[NotificationScheduler] Already running — skipping');
    return;
  }

  isRunning = true;
  console.log('[NotificationScheduler] Initialized — deadline tracking active');

  // Phase 2 will attach: task deadline polling, discipline alerts, streak warnings
};

// ── Stop notification scheduler ───────────────────────
const stopNotificationScheduler = () => {
  isRunning = false;
  console.log('[NotificationScheduler] Stopped');
};

module.exports = {
  startNotificationScheduler,
  stopNotificationScheduler
};
