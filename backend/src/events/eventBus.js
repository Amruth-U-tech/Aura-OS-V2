const EventEmitter = require('events');
const { createEventEnvelope, isEnvelope, extractPayload, SOURCE_TYPES } = require('./createEventEnvelope');
const replayBuffer = require('./replayBuffer');
const eventMetrics = require('../metrics/eventMetrics');

// ======================================================
// AURA EVENT BUS — Phase N2 (Envelope-Aware)
// The centralized event-driven orchestration highway
// ALL domain events flow through this single bus
//
// Phase N2 upgrades:
//   - Every emitted event is wrapped in a standardized envelope
//   - Listeners receive full envelopes with sequence, traceId, etc.
//   - Backward compatibility: listeners can access envelope.payload
//     for raw data, or destructure the full envelope
//   - All events pushed to replay buffer
//   - Metrics integration for observability
//   - Listener timing tracked per-handler
//
// Architecture rules:
// 1. Events represent COMPLETED TRUTHS (past tense)
// 2. Events are emitted ONLY after DB commit succeeds
// 3. Listeners are async, isolated, and cannot crash the bus
// 4. The bus is NOT the source of truth — the DB is
// 5. Events carry standardized envelopes with minimal payloads
//
// Must NOT: replace the database, contain business logic,
//           emit events before DB commits, create circular loops
// ======================================================

class AuraEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);

    // ── Event tracing ─────────────────────────────────
    this._traceEnabled = process.env.NODE_ENV !== 'production';
    this._listenerRegistry = new Map(); // eventName → [{ name, fn }]
    this._emitCount = 0;
    this._errorCount = 0;

    // ── Duplicate emission guard ──────────────────────
    this._recentEmissions = new Map(); // fingerprint → timestamp
    this._DEDUP_WINDOW_MS = 2000;
  }

  // ── Register a named listener with error isolation ───
  registerListener(eventName, listenerName, handler) {
    if (typeof handler !== 'function') {
      console.error(`[EventBus] Invalid handler for ${eventName}:${listenerName}`);
      return;
    }

    // Wrap handler with error isolation + tracing + metrics
    // Phase N2 BACKWARD COMPAT: Extract payload from envelope before
    // passing to listener. Listener receives raw payload data with
    // envelope metadata injected as _meta for optional access.
    const wrappedHandler = async (...args) => {
      const startTime = Date.now();
      try {
        if (this._traceEnabled) {
          console.log(`  [event] listener triggered: ${listenerName}`);
        }
        // Extract payload for backward compat — listeners see raw data
        const rawArg = args[0];
        let listenerArg = rawArg;
        if (rawArg && rawArg._envelope === true && rawArg.payload) {
          // Merge payload as top-level properties, inject _meta for optional access
          listenerArg = {
            ...rawArg.payload,
            _meta: {
              traceId: rawArg.traceId,
              sequence: rawArg.sequence,
              issuedAt: rawArg.issuedAt,
              version: rawArg.version,
              source: rawArg.source,
              entityType: rawArg.entityType,
              entityId: rawArg.entityId,
              actorId: rawArg.actorId,
            }
          };
        }
        await handler(listenerArg, ...args.slice(1));
      } catch (err) {
        this._errorCount++;
        eventMetrics.increment('failed');
        console.error(`[EventBus] ❌ Listener "${listenerName}" failed on "${eventName}":`, err.message);
        // NEVER re-throw — listener failures must not crash the bus
      } finally {
        const elapsed = Date.now() - startTime;
        // Phase N2: Record listener timing for observability
        eventMetrics.recordListenerTiming(listenerName, elapsed);
        if (this._traceEnabled && elapsed > 500) {
          console.warn(`  [event] ⚠️ Slow listener "${listenerName}" on "${eventName}" (${elapsed}ms)`);
        }
      }
    };

    if (!this._listenerRegistry.has(eventName)) {
      this._listenerRegistry.set(eventName, []);
    }
    this._listenerRegistry.get(eventName).push({ name: listenerName, fn: wrappedHandler });

    this.on(eventName, wrappedHandler);
    return this;
  }

  // ── Emit a domain event with envelope wrapping ────────
  // Phase N2: ALL emissions now wrapped in standardized envelopes
  // Backward compat: existing listeners receive envelope objects
  // where envelope.payload contains the original raw data
  emitEvent(eventName, payload = {}, envelopeOptions = {}) {
    // ── Dedup guard (uses payload fingerprint, not envelope) ──
    const fingerprint = `${eventName}:${JSON.stringify(payload)}`;
    const now = Date.now();
    const lastEmit = this._recentEmissions.get(fingerprint);
    if (lastEmit && (now - lastEmit) < this._DEDUP_WINDOW_MS) {
      if (this._traceEnabled) {
        console.warn(`[EventBus] ⚠️ Duplicate suppressed: ${eventName} (within ${this._DEDUP_WINDOW_MS}ms)`);
      }
      eventMetrics.increment('deduplicated');
      return null;
    }
    this._recentEmissions.set(fingerprint, now);

    // ── Cleanup old fingerprints (every 100 emissions) ──
    this._emitCount++;
    if (this._emitCount % 100 === 0) {
      this._cleanupFingerprints();
    }

    // ── Create envelope ──────────────────────────────
    const envelope = createEventEnvelope(eventName, payload, {
      source: envelopeOptions.source || 'eventBus',
      sourceType: envelopeOptions.sourceType || SOURCE_TYPES.SYSTEM,
      entityType: envelopeOptions.entityType || null,
      entityId: envelopeOptions.entityId || null,
      actorId: envelopeOptions.actorId || null,
      actorAuraId: envelopeOptions.actorAuraId || null,
      correlationId: envelopeOptions.correlationId || null,
      replayable: envelopeOptions.replayable !== false,
      persistent: envelopeOptions.persistent || false,
      traceId: envelopeOptions.traceId || null
    });

    eventMetrics.increment('emitted');
    eventMetrics.increment('envelopesCreated');

    // ── Push to replay buffer ────────────────────────
    replayBuffer.push(envelope);
    eventMetrics.increment('bufferPushes');

    // ── Trace ────────────────────────────────────────
    if (this._traceEnabled) {
      console.log(`[event] emitted: ${eventName} [seq:${envelope.sequence} trace:${envelope.traceId}]`);
    }

    // ── Emit envelope to all registered listeners ────
    // BACKWARD COMPAT: Listeners receive the full envelope.
    // They can access envelope.payload for raw data.
    // Legacy pattern: const data = envelope.payload || envelope;
    this.emit(eventName, envelope);

    return envelope;
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
