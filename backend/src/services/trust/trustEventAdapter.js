// ======================================================
// TRUST EVENT ADAPTER
// Owns: internal event interface for trust score updates
// Bridges task/challenge engines → trust engine
// Must NOT: contain trust calculations or database writes
// ======================================================

const { validateTrustPayload } = require('./trustPayloadValidator');

// Internal event queue (in-memory for now, replaceable with EventBus)
const _pendingEvents = [];

/**
 * Emits a trust event from any system (task engine, challenge engine).
 * Validates payload before queuing.
 * @param {object} payload - Trust event payload
 * @returns {{ queued: boolean, error?: string }}
 */
const emitTrustEvent = (payload) => {
  const result = validateTrustPayload(payload);

  if (!result.valid) {
    console.warn('[TrustEventAdapter] Invalid trust event rejected:', result.errors);
    return { queued: false, errors: result.errors };
  }

  _pendingEvents.push(result.sanitized);
  console.log(`[TrustEventAdapter] Trust event queued: ${result.sanitized.source} for user ${result.sanitized.userId}`);
  return { queued: true };
};

/**
 * Drains the pending event queue.
 * Will be consumed by the trust scoring engine in Phase 2.3.
 * @returns {Array} Array of sanitized trust event payloads
 */
const drainPendingEvents = () => {
  const events = [..._pendingEvents];
  _pendingEvents.length = 0;
  return events;
};

/**
 * Returns the current queue length (for health checks).
 */
const getPendingCount = () => _pendingEvents.length;

module.exports = { emitTrustEvent, drainPendingEvents, getPendingCount };
