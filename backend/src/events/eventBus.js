const EventEmitter = require('events');

// ======================================================
// AURA EVENT BUS — Phase 3.1
// The centralized event-driven orchestration highway
// ALL domain events flow through this single bus
//
// Architecture rules:
// 1. Events represent COMPLETED TRUTHS (past tense)
// 2. Events are emitted ONLY after DB commit succeeds
// 3. Listeners are async, isolated, and cannot crash the bus
// 4. The bus is NOT the source of truth — the DB is
// 5. Events carry minimal payloads (IDs + essential data)
//
// Must NOT: replace the database, contain business logic,
//           emit events before DB commits, create circular loops
// ======================================================

class AuraEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Support many modular listeners

    // ── Event tracing ─────────────────────────────────
    this._traceEnabled = process.env.NODE_ENV !== 'production';
    this._listenerRegistry = new Map(); // eventName → [{ name, fn }]
    this._emitCount = 0;
    this._errorCount = 0;

    // ── Duplicate emission guard ──────────────────────
    // Tracks recent event fingerprints to prevent exact duplicates
    this._recentEmissions = new Map(); // fingerprint → timestamp
    this._DEDUP_WINDOW_MS = 2000; // 2-second dedup window
  }

  // ── Register a named listener with error isolation ───
  // Every listener gets a name for tracing
  registerListener(eventName, listenerName, handler) {
    if (typeof handler !== 'function') {
      console.error(`[EventBus] Invalid handler for ${eventName}:${listenerName}`);
      return;
    }

    // Wrap handler with error isolation + tracing
    const wrappedHandler = async (...args) => {
      const startTime = Date.now();
      try {
        if (this._traceEnabled) {
          console.log(`  [event] listener triggered: ${listenerName}`);
        }
        await handler(...args);
      } catch (err) {
        this._errorCount++;
        console.error(`[EventBus] ❌ Listener "${listenerName}" failed on "${eventName}":`, err.message);
        // NEVER re-throw — listener failures must not crash the bus
      } finally {
        if (this._traceEnabled) {
          const elapsed = Date.now() - startTime;
          if (elapsed > 500) {
            console.warn(`  [event] ⚠️ Slow listener "${listenerName}" on "${eventName}" (${elapsed}ms)`);
          }
        }
      }
    };

    // Track for debugging/listing
    if (!this._listenerRegistry.has(eventName)) {
      this._listenerRegistry.set(eventName, []);
    }
    this._listenerRegistry.get(eventName).push({ name: listenerName, fn: wrappedHandler });

    // Register on Node EventEmitter
    this.on(eventName, wrappedHandler);

    return this; // chainable
  }

  // ── Emit a domain event with tracing + dedup ─────────
  emitEvent(eventName, payload = {}) {
    // ── Dedup guard ──────────────────────────────────
    const fingerprint = `${eventName}:${JSON.stringify(payload)}`;
    const now = Date.now();
    const lastEmit = this._recentEmissions.get(fingerprint);
    if (lastEmit && (now - lastEmit) < this._DEDUP_WINDOW_MS) {
      if (this._traceEnabled) {
        console.warn(`[EventBus] ⚠️ Duplicate suppressed: ${eventName} (within ${this._DEDUP_WINDOW_MS}ms)`);
      }
      return;
    }
    this._recentEmissions.set(fingerprint, now);

    // ── Cleanup old fingerprints (every 100 emissions) ──
    this._emitCount++;
    if (this._emitCount % 100 === 0) {
      this._cleanupFingerprints();
    }

    // ── Trace ────────────────────────────────────────
    if (this._traceEnabled) {
      console.log(`[event] emitted: ${eventName}`);
    }

    // ── Emit to all registered listeners ─────────────
    this.emit(eventName, payload);
  }

  // ── Cleanup expired fingerprints ────────────────────
  _cleanupFingerprints() {
    const now = Date.now();
    for (const [fp, ts] of this._recentEmissions) {
      if (now - ts > this._DEDUP_WINDOW_MS * 5) {
        this._recentEmissions.delete(fp);
      }
    }
  }

  // ── Get registered listener names for an event ──────
  getListeners(eventName) {
    return (this._listenerRegistry.get(eventName) || []).map(l => l.name);
  }

  // ── Get all registered events ───────────────────────
  getRegisteredEvents() {
    const events = {};
    for (const [name, listeners] of this._listenerRegistry) {
      events[name] = listeners.map(l => l.name);
    }
    return events;
  }

  // ── Stats ───────────────────────────────────────────
  getStats() {
    return {
      registeredEvents: this._listenerRegistry.size,
      totalListeners: Array.from(this._listenerRegistry.values())
        .reduce((sum, arr) => sum + arr.length, 0),
      totalEmissions: this._emitCount,
      totalErrors: this._errorCount,
      dedupCacheSize: this._recentEmissions.size
    };
  }
}

// Singleton — one bus per process
const auraEvents = new AuraEventBus();

module.exports = auraEvents;
