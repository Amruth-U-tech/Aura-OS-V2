// ======================================================
// REPLAY BUFFER — Phase N2
// Temporary event replay window for reconnect recovery
//
// Stores last N envelopes in memory for:
//   - Reconnect replay (get events after sequence X)
//   - Debugging (inspect recent event history)
//   - Metrics (count replayed vs fresh events)
//
// This is FOUNDATION ONLY — not a full replay system.
// Future: Redis Streams or persistent replay log.
//
// Must NOT: be the source of truth, contain business logic
// ======================================================

const MAX_BUFFER_SIZE = 1000;
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes max retention

const _buffer = [];

// ── Push an envelope into the replay buffer ──────────
const push = (envelope) => {
  if (!envelope || typeof envelope.sequence !== 'number') return;

  _buffer.push({
    ...envelope,
    _bufferedAt: Date.now()
  });

  // Evict oldest if over capacity
  while (_buffer.length > MAX_BUFFER_SIZE) {
    _buffer.shift();
  }
};

// ── Get events after a specific sequence ─────────────
// Used during reconnect: "give me everything after seq 291"
const getAfterSequence = (afterSequence, options = {}) => {
  const { entityType = null, limit = 200 } = options;
  const now = Date.now();

  return _buffer
    .filter(e => {
      if (e.sequence <= afterSequence) return false;
      if (now - e._bufferedAt > MAX_AGE_MS) return false;
      if (entityType && e.entityType !== entityType) return false;
      if (!e.replayable) return false;
      return true;
    })
    .slice(0, limit);
};

// ── Get recent events (for debugging) ────────────────
const getRecent = (count = 20) => {
  return _buffer.slice(-count);
};

// ── Cleanup expired entries ──────────────────────────
const cleanup = () => {
  const now = Date.now();
  const before = _buffer.length;
  let i = 0;
  while (i < _buffer.length) {
    if (now - _buffer[i]._bufferedAt > MAX_AGE_MS) {
      _buffer.splice(i, 1);
    } else {
      i++;
    }
  }
  return { removed: before - _buffer.length, remaining: _buffer.length };
};

// ── Stats ────────────────────────────────────────────
const stats = () => ({
  size: _buffer.length,
  maxSize: MAX_BUFFER_SIZE,
  oldestSequence: _buffer.length > 0 ? _buffer[0].sequence : null,
  newestSequence: _buffer.length > 0 ? _buffer[_buffer.length - 1].sequence : null,
  maxAgeMs: MAX_AGE_MS
});

// ── Reset (testing) ──────────────────────────────────
const reset = () => { _buffer.length = 0; };

module.exports = { push, getAfterSequence, getRecent, cleanup, stats, reset };
