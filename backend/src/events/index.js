const auraEvents = require('./eventBus');

// ── Modular Listeners ────────────────────────────────
const socketListener = require('./listeners/socketListener');
const xpListener = require('./listeners/xpListener');
const trustListener = require('./listeners/trustListener');
const historyListener = require('./listeners/historyListener');

// ======================================================
// EVENT SYSTEM BOOTSTRAP — Phase 3.1
// Registers ALL event listeners at server boot
// Called ONCE from server.js after DB connection
//
// Listener registration order matters:
// 1. XP listener (awards/penalizes XP, emits XP events)
// 2. Trust listener (updates trust, emits trust events)
// 3. History listener (persists behavioral records)
// 4. Socket listener (broadcasts to frontend)
//
// Socket goes LAST because it may depend on
// XP/Trust events emitted by earlier listeners
// ======================================================

const initializeEventSystem = () => {
  console.log('[EventBus] Initializing event orchestration system...');

  // Register in dependency order
  xpListener.register();
  trustListener.register();
  historyListener.register();
  socketListener.register();

  const stats = auraEvents.getStats();
  console.log(`[EventBus] ✅ Event system ready (${stats.registeredEvents} events, ${stats.totalListeners} listeners)`);

  return auraEvents;
};

module.exports = { initializeEventSystem, auraEvents };
