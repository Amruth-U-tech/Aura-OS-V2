// ======================================================
// EVENT METRICS — Phase N2
// Foundational observability for the event system
//
// Tracks: emissions, failures, replays, dedup, listener timing
// NEVER blocks execution, NEVER throws, NEVER mutates state
// Observational ONLY.
// ======================================================

const _counters = {
  emitted: 0,
  failed: 0,
  deduplicated: 0,
  replayed: 0,
  staleRejected: 0,
  envelopesCreated: 0,
  bufferPushes: 0,
};

const _listenerTimings = new Map(); // listenerName → { count, totalMs, maxMs }

// ── Increment a counter ──────────────────────────────
const increment = (counter) => {
  if (counter in _counters) _counters[counter]++;
};

// ── Record listener execution time ───────────────────
const recordListenerTiming = (listenerName, durationMs) => {
  if (!_listenerTimings.has(listenerName)) {
    _listenerTimings.set(listenerName, { count: 0, totalMs: 0, maxMs: 0 });
  }
  const t = _listenerTimings.get(listenerName);
  t.count++;
  t.totalMs += durationMs;
  if (durationMs > t.maxMs) t.maxMs = durationMs;
};

// ── Get all metrics ──────────────────────────────────
const getMetrics = () => ({
  counters: { ..._counters },
  listenerTimings: Object.fromEntries(
    Array.from(_listenerTimings.entries()).map(([name, t]) => [
      name,
      { count: t.count, avgMs: Math.round(t.totalMs / t.count), maxMs: t.maxMs }
    ])
  ),
  timestamp: new Date().toISOString()
});

// ── Reset (testing) ──────────────────────────────────
const reset = () => {
  Object.keys(_counters).forEach(k => { _counters[k] = 0; });
  _listenerTimings.clear();
};

module.exports = { increment, recordListenerTiming, getMetrics, reset };
