// ======================================================
// FETCH ORCHESTRATOR — Phase 3.1.2
// Centralizes ALL async data fetching to prevent:
//   - Fetch storms (same endpoint hit N times simultaneously)
//   - Hydration races (stale response overwrites fresh state)
//   - Rate limit cascades (429 amplification)
//   - Reconnect bursts (simultaneous hydration floods)
//
// Architecture:
//   - Single-flight: same key → same pending Promise reused
//   - Cooldown windows: min time between repeated fetches
//   - Hydration locks: per-domain serialization
//   - Rate-limit backoff: exponential retry with jitter
//   - Cancellation: AbortController support
//
// Usage:
//   const data = await fetchOrchestrator.fetch('player.me', playerApi.getMe);
//   await fetchOrchestrator.hydrate('social', async () => { ... });
// ======================================================

const DEFAULT_COOLDOWN_MS = 3000;
const RATE_LIMIT_BACKOFF_BASE = 2000;
const MAX_BACKOFF_MS = 30000;

// Active in-flight promises (single-flight dedup)
const _inflight = new Map();   // key → Promise

// Last fetch timestamps (cooldown enforcement)
const _lastFetch = new Map();  // key → timestamp

// Hydration locks per domain (serialization)
const _hydrationLocks = new Map(); // domain → boolean

// Rate-limit backoff tracking
const _rateLimitBackoff = new Map(); // key → { attempts, nextAllowedAt }

// ── Single-Flight Fetch ──────────────────────────────
// If a fetch for 'key' is already in-flight, returns the
// same Promise instead of issuing a second network request.
// Cooldown: skips fetch if called within cooldownMs of last success.
//
// Phase 3.1.3: Adaptive backpressure —
//   When multiple 429s detected globally, all cooldowns escalate.
//   This prevents cascade patterns under stress.
let _globalPressure = 1.0;         // Cooldown multiplier (1.0 = normal)
let _recent429Count = 0;           // 429s in the last pressure window
let _pressureWindowStart = Date.now();
const PRESSURE_WINDOW_MS = 15000;  // 15s rolling window
const PRESSURE_ESCALATION = 2.0;   // 2x cooldowns under pressure
const PRESSURE_THRESHOLD = 2;      // 2+ 429s in window = escalate

const _updatePressure = (got429 = false) => {
  const now = Date.now();
  // Reset window if expired
  if (now - _pressureWindowStart > PRESSURE_WINDOW_MS) {
    _recent429Count = 0;
    _pressureWindowStart = now;
    _globalPressure = 1.0;
  }
  if (got429) {
    _recent429Count++;
    if (_recent429Count >= PRESSURE_THRESHOLD) {
      _globalPressure = PRESSURE_ESCALATION;
      console.warn(`[FetchOrchestrator] Backpressure ACTIVE (${_recent429Count} 429s). Cooldowns ×${_globalPressure}`);
    }
  }
};

const fetch = async (key, fetchFn, options = {}) => {
  const {
    cooldownMs = DEFAULT_COOLDOWN_MS,
    force = false,          // bypass cooldown
    signal = null,          // AbortController signal
  } = options;

  // 1. Rate-limit backoff check
  const backoff = _rateLimitBackoff.get(key);
  if (backoff && Date.now() < backoff.nextAllowedAt) {
    const waitRemaining = backoff.nextAllowedAt - Date.now();
    console.warn(`[FetchOrchestrator] ${key} rate-limited, retry in ${waitRemaining}ms`);
    throw { type: 'rate_limited', retryAfterMs: waitRemaining };
  }

  // 2. Cooldown check (skip if within cooldown window)
  // Phase 3.1.3: Apply backpressure multiplier to cooldown
  _updatePressure();
  const effectiveCooldown = cooldownMs * _globalPressure;
  if (!force) {
    const last = _lastFetch.get(key);
    if (last && (Date.now() - last) < effectiveCooldown) {
      // Return existing in-flight if present, else skip silently
      if (_inflight.has(key)) return _inflight.get(key);
      return null; // Within cooldown, no in-flight → skip
    }
  }

  // 3. Single-flight: reuse existing in-flight Promise
  if (_inflight.has(key)) {
    return _inflight.get(key);
  }

  // 4. Execute the fetch
  const promise = (async () => {
    try {
      const result = await fetchFn(signal);
      _lastFetch.set(key, Date.now());
      // Clear any existing backoff on success
      _rateLimitBackoff.delete(key);
      return result;
    } catch (err) {
      // Handle 429 rate limiting with exponential backoff
      if (err?.status === 429 || err?.type === 'rate_limited') {
        _updatePressure(true); // Phase 3.1.3: escalate global backpressure
        const existing = _rateLimitBackoff.get(key) || { attempts: 0 };
        const attempts = existing.attempts + 1;
        const backoffMs = Math.min(
          RATE_LIMIT_BACKOFF_BASE * Math.pow(2, attempts - 1) + Math.random() * 500,
          MAX_BACKOFF_MS
        );
        _rateLimitBackoff.set(key, {
          attempts,
          nextAllowedAt: Date.now() + backoffMs,
        });
        console.warn(`[FetchOrchestrator] ${key} rate-limited (attempt ${attempts}). Backoff: ${backoffMs}ms`);
      }
      throw err;
    } finally {
      _inflight.delete(key);
    }
  })();

  _inflight.set(key, promise);
  return promise;
};

// ── Hydration Lock ───────────────────────────────────
// Prevents concurrent hydrations for the same domain.
// If domain is already hydrating, the call is dropped (not queued).
// This prevents reconnect cascades flooding the same domain.
const hydrate = async (domain, hydrationFn, options = {}) => {
  const { cooldownMs = DEFAULT_COOLDOWN_MS, force = false } = options;

  // Lock check
  if (_hydrationLocks.get(domain)) {
    return null; // Already hydrating this domain
  }

  // Cooldown check for the domain itself
  const cooldownKey = `hydration:${domain}`;
  if (!force) {
    const last = _lastFetch.get(cooldownKey);
    if (last && (Date.now() - last) < cooldownMs) {
      return null;
    }
  }

  _hydrationLocks.set(domain, true);
  try {
    const result = await hydrationFn();
    _lastFetch.set(cooldownKey, Date.now());
    return result;
  } catch (err) {
    console.error(`[FetchOrchestrator] Hydration failed for domain: ${domain}`, err?.message);
    throw err;
  } finally {
    _hydrationLocks.set(domain, false);
  }
};

// ── Batch Reconnect Hydration ────────────────────────
// Called on socket:reconnected. Staggers domain hydrations
// to prevent simultaneous API bursts.
const batchHydrate = async (domainFns, staggerMs = 150) => {
  const results = [];
  for (const { domain, fn, options } of domainFns) {
    // Stagger each domain hydration to prevent simultaneous bursts
    if (results.length > 0) {
      await new Promise(r => setTimeout(r, staggerMs));
    }
    try {
      const result = await hydrate(domain, fn, { ...options, force: true });
      results.push({ domain, success: true, result });
    } catch (err) {
      results.push({ domain, success: false, error: err?.message });
    }
  }
  return results;
};

// ── Utilities ────────────────────────────────────────
const clearCooldown = (key) => _lastFetch.delete(key);
const clearBackoff = (key) => _rateLimitBackoff.delete(key);
const isInflight = (key) => _inflight.has(key);
const isHydrating = (domain) => !!_hydrationLocks.get(domain);

// ── Debug Stats ──────────────────────────────────────
const stats = () => ({
  inflight: [..._inflight.keys()],
  cooldowns: Object.fromEntries([..._lastFetch.entries()].map(([k, v]) => [k, Date.now() - v])),
  hydrationLocks: Object.fromEntries([..._hydrationLocks.entries()]),
  rateLimitBackoffs: Object.fromEntries([..._rateLimitBackoff.entries()].map(([k, v]) => [k, {
    attempts: v.attempts,
    retryInMs: Math.max(0, v.nextAllowedAt - Date.now())
  }])),
  // Phase 3.1.3: Adaptive backpressure state
  backpressure: {
    globalPressure: _globalPressure,
    recent429Count: _recent429Count,
    windowRemainingMs: Math.max(0, PRESSURE_WINDOW_MS - (Date.now() - _pressureWindowStart)),
  },
});

// Reset all (testing only)
const reset = () => {
  _inflight.clear();
  _lastFetch.clear();
  _hydrationLocks.clear();
  _rateLimitBackoff.clear();
  _globalPressure = 1.0;
  _recent429Count = 0;
  _pressureWindowStart = Date.now();
};

export const fetchOrchestrator = {
  fetch,
  hydrate,
  batchHydrate,
  clearCooldown,
  clearBackoff,
  isInflight,
  isHydrating,
  stats,
  reset,
};
