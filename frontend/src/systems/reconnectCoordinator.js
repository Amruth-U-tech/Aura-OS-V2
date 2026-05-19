// ======================================================
// RECONNECT COORDINATOR — Phase 3.1.4 (Hardened)
// Centralized reconnect hydration orchestrator
//
// OWNS: ALL reconnect recovery behavior + initial load gating
// Replaces: individual context socket:reconnected listeners
//
// Phase 3.1.4 upgrades:
//   - TRULY sequential hydration with 500ms+ gaps per domain
//   - Global isHydrating() flag gates context initial loads
//   - SocialContext sub-requests are serialized within the hydrator
//   - Increased stagger delays to prevent 429 storms
//   - Contexts MUST check isHydrating() before initial load
//   - Only ONE hydration cycle can run at a time (lock)
//   - 10s cooldown between full cycles
//
// Architecture:
//   On socket:reconnected →
//     1. Lock all domains (event buffer ON, isHydrating = true)
//     2. Phase 1: Player profile (AWAIT completion)
//     3. Phase 2: Tasks → wait → Social → wait → Challenges → wait → Hubs
//     4. Phase 3: Secondary (cooldown-managed, no action)
//     5. Unlock all domains (flush event buffer, isHydrating = false)
//
//   On context initial load →
//     If isHydrating() → SKIP (coordinator will handle)
//     If !isHydrating() → proceed normally
// ======================================================

import { eventBus } from '@systems/eventBus';

// ── State ────────────────────────────────────────────
let _isHydrating = false;
let _lastHydrationAt = 0;
const HYDRATION_COOLDOWN_MS = 10000; // Min 10s between full reconnect cycles
const PHASE_STAGGER_MS = 600;        // Delay between phases
const DOMAIN_STAGGER_MS = 500;       // Delay between domains within a phase
// CRITICAL: These delays prevent 429 storms. Do NOT reduce below 400ms.

// ── Event Buffer ─────────────────────────────────────
const _eventBuffer = [];
let _bufferingActive = false;
const MAX_BUFFER_SIZE = 50;

const startBuffering = () => {
  _bufferingActive = true;
  _eventBuffer.length = 0;
};

const stopBuffering = () => {
  _bufferingActive = false;
  const events = [..._eventBuffer];
  _eventBuffer.length = 0;
  for (const { event, data } of events) {
    eventBus.emit(event, data);
  }
};

const bufferEvent = (event, data) => {
  if (!_bufferingActive) return false;
  if (_eventBuffer.length >= MAX_BUFFER_SIZE) {
    _eventBuffer.shift();
  }
  _eventBuffer.push({ event, data, bufferedAt: Date.now() });
  return true;
};

// ── Hydration Registry ───────────────────────────────
const _hydrators = {
  // Phase 1 — Critical Core
  player: null,       // PlayerContext.fetchProfile

  // Phase 2 — Active Systems (STRICTLY SEQUENTIAL)
  // Phase N1.1: notifications added, domain hydrators now AUTHORITATIVE
  tasks: null,        // TaskContext (via useTasks)
  notifications: null,// NotificationContext.softHydrate — Phase N1.1
  social: null,       // SocialContext.softHydrate
  challenges: null,   // ChallengeContext.softHydrate
  hubs: null,         // HubContext.softHydrate
};

const registerHydrator = (domain, hydrationFn) => {
  _hydrators[domain] = hydrationFn;
};

const unregisterHydrator = (domain) => {
  _hydrators[domain] = null;
};

// ── Stagger helper ───────────────────────────────────
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Safe hydrator call ───────────────────────────────
// Wraps each hydrator in a try/catch + timeout to prevent cascade failures
const safeCall = async (domain) => {
  if (!_hydrators[domain]) return;
  try {
    // 15s timeout per domain — if it takes longer, something is broken
    const result = Promise.race([
      _hydrators[domain](),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
    ]);
    await result;
  } catch (err) {
    console.warn(`[ReconnectCoordinator] ${domain} hydration failed:`, err?.message);
  }
};

// ── Core Hydration Sequence ──────────────────────────
const executeHydration = async () => {
  const now = Date.now();

  // Lock: prevent concurrent hydrations
  if (_isHydrating) {
    console.info('[ReconnectCoordinator] Hydration already in progress, skipping');
    return;
  }

  // Cooldown: prevent rapid-fire hydrations
  if (now - _lastHydrationAt < HYDRATION_COOLDOWN_MS) {
    console.info('[ReconnectCoordinator] Within cooldown, skipping');
    return;
  }

  _isHydrating = true;
  _lastHydrationAt = now;
  startBuffering();

  console.info('[ReconnectCoordinator] ─── RECONNECT HYDRATION START ───');

  try {
    // ── PHASE 1: Player profile (must complete before anything else) ──
    console.info('[ReconnectCoordinator] Phase 1: Player profile');
    await safeCall('player');

    await delay(PHASE_STAGGER_MS);

    // ── PHASE 2: Active Systems — AUTHORITATIVE LIFECYCLE RECONCILIATION ──
    // Phase N1.1: Each domain hydrator now does force:true authoritative refresh.
    // This replaces stale lifecycle entities (cancelled challenges, removed friends).
    console.info('[ReconnectCoordinator] Phase 2: Authoritative domain reconciliation');

    console.info('[ReconnectCoordinator]   → tasks');
    await safeCall('tasks');
    await delay(DOMAIN_STAGGER_MS);

    console.info('[ReconnectCoordinator]   → notifications');
    await safeCall('notifications');
    await delay(DOMAIN_STAGGER_MS);

    console.info('[ReconnectCoordinator]   → social');
    await safeCall('social');
    await delay(DOMAIN_STAGGER_MS);

    console.info('[ReconnectCoordinator]   → challenges');
    await safeCall('challenges');
    await delay(DOMAIN_STAGGER_MS);

    console.info('[ReconnectCoordinator]   → hubs');
    await safeCall('hubs');

    await delay(PHASE_STAGGER_MS);

    // ── PHASE 3: Secondary Systems ────────────────
    console.info('[ReconnectCoordinator] Phase 3: Secondary systems (cooldown-managed)');

  } catch (err) {
    console.error('[ReconnectCoordinator] Hydration sequence error:', err?.message);
  } finally {
    _isHydrating = false;
    stopBuffering();
    console.info('[ReconnectCoordinator] ─── HYDRATION COMPLETE ───');
  }
};

// ── Public API ───────────────────────────────────────
export const reconnectCoordinator = {
  registerHydrator,
  unregisterHydrator,

  // Called by SocketContext on reconnect
  handleReconnect: executeHydration,

  // Event buffering for socket events during hydration
  bufferEvent,
  isBuffering: () => _bufferingActive,

  // CRITICAL: Contexts MUST check this before initial load.
  // If true → skip initial load (coordinator will handle it).
  isHydrating: () => _isHydrating,

  // Debug
  stats: () => ({
    isHydrating: _isHydrating,
    isBuffering: _bufferingActive,
    bufferedEvents: _eventBuffer.length,
    lastHydrationAt: _lastHydrationAt,
    cooldownRemainingMs: Math.max(0, HYDRATION_COOLDOWN_MS - (Date.now() - _lastHydrationAt)),
    registeredDomains: Object.entries(_hydrators)
      .filter(([, fn]) => fn !== null)
      .map(([k]) => k),
  }),

  // Reset (testing)
  reset: () => {
    _isHydrating = false;
    _lastHydrationAt = 0;
    _bufferingActive = false;
    _eventBuffer.length = 0;
    Object.keys(_hydrators).forEach(k => { _hydrators[k] = null; });
  },
};
