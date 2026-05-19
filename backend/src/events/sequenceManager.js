// ======================================================
// SEQUENCE MANAGER — Phase N2
// Monotonic event sequence generation
//
// Owns: deterministic ordering across the entire system
// Every event gets a unique, monotonically increasing sequence number
//
// Architecture:
//   - Process-safe incrementing (single-process for now)
//   - Abstracted for future Redis/distributed upgrade
//   - NEVER decreases, NEVER duplicates
//   - Used by: createEventEnvelope, replayBuffer, frontend reducers
//
// Must NOT: be used for timestamps, contain business logic
// ======================================================

let _sequence = 0;
let _epoch = Date.now(); // Process start epoch for sequence context

// ── Get next sequence number ─────────────────────────
const next = () => {
  _sequence++;
  return _sequence;
};

// ── Get current sequence without incrementing ────────
const current = () => _sequence;

// ── Get sequence with metadata ───────────────────────
const nextWithMeta = () => ({
  sequence: next(),
  issuedAt: new Date(),
  epoch: _epoch
});

// ── Reset (testing only) ─────────────────────────────
const reset = () => {
  _sequence = 0;
  _epoch = Date.now();
};

// ── Stats ────────────────────────────────────────────
const stats = () => ({
  currentSequence: _sequence,
  epoch: _epoch,
  uptimeMs: Date.now() - _epoch
});

module.exports = { next, current, nextWithMeta, reset, stats };
