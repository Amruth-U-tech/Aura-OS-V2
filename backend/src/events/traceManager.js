// ======================================================
// TRACE MANAGER — Phase N2
// Distributed lifecycle flow tracing
//
// Owns: traceId generation and correlation
// A traceId follows an entire lifecycle flow:
//   request → domain event → socket emit → notification → frontend reducer
//
// Purpose:
//   - Debugging: find all events for a specific flow
//   - Metrics: measure lifecycle latency
//   - Replay: reconstruct event chains
//   - Observability: distributed system visibility
//
// Must NOT: contain business logic, block execution
// ======================================================

const crypto = require('crypto');

// ── Generate trace ID ────────────────────────────────
// Format: trc_{timestamp_hex}_{random_4bytes}
const generate = () => {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString('hex');
  return `trc_${ts}_${rand}`;
};

// ── Generate correlation ID ──────────────────────────
// Links related events (e.g., challenge.created → challenge.invited)
const correlate = (parentTraceId) => {
  const rand = crypto.randomBytes(3).toString('hex');
  return `${parentTraceId}:${rand}`;
};

// ── Validate trace ID format ─────────────────────────
const isValid = (traceId) => {
  if (!traceId || typeof traceId !== 'string') return false;
  return traceId.startsWith('trc_');
};

// ── Extract or generate ──────────────────────────────
// If a valid traceId exists in the data, preserve it.
// Otherwise generate a new one.
const extractOrGenerate = (data) => {
  if (data?.traceId && isValid(data.traceId)) return data.traceId;
  return generate();
};

module.exports = { generate, correlate, isValid, extractOrGenerate };
