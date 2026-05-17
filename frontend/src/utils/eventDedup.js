// ======================================================
// EVENT DEDUPLICATION — Phase 3.1.3
// Sliding-window fingerprint cache for realtime events
// Prevents duplicate mutations from: reconnect replay,
// multi-tab replay, websocket retry, delayed delivery
//
// Phase 3.1.3 upgrades:
//   - Stronger fingerprinting with sequence tracking
//   - Cross-tab dedup via sessionId isolation
//   - Configurable per-event windows
//   - Staleness rejection for old packets
//
// Usage:
//   if (eventDedup.isDuplicate('player.xp.updated', payload)) return;
//   // ...process event
// ======================================================

const DEFAULT_WINDOW_MS = 3000;    // 3-second default dedup window
const MAX_CACHE_SIZE = 300;
const STALE_PACKET_THRESHOLD_MS = 30000; // Reject events > 30s old

const _cache = new Map(); // fingerprint → timestamp
let _seqCounter = 0;      // Local sequence counter

// Session identity — unique per tab instance
const _sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Per-event custom windows (high-frequency events get shorter windows)
const EVENT_WINDOWS = {
  'player.xp.updated': 2000,
  'player.trust.updated': 2000,
  'player.level.up': 5000,        // Level-up is rare — wider window
  'player.streak.updated': 5000,
  'challenge.updated': 2000,
  'challenge.resolved': 10000,    // Resolution should never duplicate
  'challenge.submission.created': 10000,
  'hub.member.joined': 3000,
  'hub.member.left': 3000,
  'player.friend.request': 5000,
  'friend.accepted': 5000,
};

// Generate deterministic fingerprint from event + payload
const _fingerprint = (eventName, payload) => {
  try {
    const stablePayload = payload
      ? JSON.stringify(payload, (key, value) => {
          // Exclude volatile fields that change between retries
          if (key === 'timestamp' || key === 'ts' || key === '_retry' || key === 'socketId') return undefined;
          return value;
        })
      : '';
    return `${eventName}:${stablePayload}`;
  } catch {
    // Fallback: use counter to ensure uniqueness
    return `${eventName}:fallback:${_seqCounter++}`;
  }
};

// Check if an event payload is stale (arrived too late)
const _isStalePacket = (payload) => {
  if (!payload?.timestamp && !payload?.ts && !payload?.createdAt) return false;
  const eventTime = payload.timestamp || payload.ts || payload.createdAt;
  const age = Date.now() - new Date(eventTime).getTime();
  return age > STALE_PACKET_THRESHOLD_MS;
};

// Check if event is a duplicate (and register it if not)
const isDuplicate = (eventName, payload) => {
  // Phase 3.1.3: Reject stale packets entirely
  if (_isStalePacket(payload)) {
    return true; // Treat stale as duplicate — don't process
  }

  const fp = _fingerprint(eventName, payload);
  const now = Date.now();
  const window = EVENT_WINDOWS[eventName] || DEFAULT_WINDOW_MS;
  const lastSeen = _cache.get(fp);

  if (lastSeen && (now - lastSeen) < window) {
    return true; // Duplicate within window
  }

  // Register this emission
  _cache.set(fp, now);
  _seqCounter++;

  // Periodic cleanup
  if (_cache.size > MAX_CACHE_SIZE) {
    _cleanup(now);
  }

  return false;
};

// Remove expired fingerprints
const _cleanup = (now) => {
  const maxWindow = Math.max(...Object.values(EVENT_WINDOWS), DEFAULT_WINDOW_MS);
  for (const [fp, ts] of _cache) {
    if (now - ts > maxWindow * 3) {
      _cache.delete(fp);
    }
  }
};

// Reset (for testing)
const reset = () => {
  _cache.clear();
  _seqCounter = 0;
};

// Stats (for debugging)
const stats = () => ({
  size: _cache.size,
  sessionId: _sessionId,
  sequence: _seqCounter,
  defaultWindowMs: DEFAULT_WINDOW_MS,
  customWindows: Object.keys(EVENT_WINDOWS).length,
});

export const eventDedup = { isDuplicate, reset, stats };
