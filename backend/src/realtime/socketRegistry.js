// ======================================================
// SOCKET REGISTRY — Phase 3.0
// The centralized runtime session authority
// Owns: active socket tracking, player→socket mapping,
//       room membership, reconnect restoration
// State: EPHEMERAL (in-memory only, never persisted to DB)
// Must NOT: write to MongoDB, own business logic
// ======================================================

class SocketRegistry {
  constructor() {
    // userId → Set<socketId> (supports multiple tabs)
    this._userSockets = new Map();
    // socketId → { userId, auraPlayerId, rooms: Set, connectedAt, lastHeartbeat }
    this._sockets = new Map();
    // userId → { rooms: Set } (for reconnect restoration)
    this._disconnectedSessions = new Map();
    // Rate tracking: socketId → { count, windowStart }
    this._rateLimits = new Map();
  }

  // ── Connection Registration ─────────────────────────
  register(socketId, userId, auraPlayerId) {
    // Track socket details
    this._sockets.set(socketId, {
      userId,
      auraPlayerId,
      rooms: new Set(),
      connectedAt: Date.now(),
      lastHeartbeat: Date.now()
    });

    // Map user → sockets (multi-tab support)
    if (!this._userSockets.has(userId)) {
      this._userSockets.set(userId, new Set());
    }
    this._userSockets.get(userId).add(socketId);

    // Clear any disconnected session (player reconnected)
    this._disconnectedSessions.delete(userId);
  }

  // ── Disconnection Cleanup ───────────────────────────
  unregister(socketId) {
    const entry = this._sockets.get(socketId);
    if (!entry) return null;

    const { userId, rooms } = entry;

    // Remove socket from user's socket set
    const userSet = this._userSockets.get(userId);
    if (userSet) {
      userSet.delete(socketId);
      // If user has NO remaining sockets, save session for reconnect
      if (userSet.size === 0) {
        this._userSockets.delete(userId);
        this._disconnectedSessions.set(userId, {
          rooms: new Set(rooms),
          disconnectedAt: Date.now()
        });
        // Auto-expire disconnected sessions after 5 minutes
        setTimeout(() => {
          this._disconnectedSessions.delete(userId);
        }, 5 * 60 * 1000);
      }
    }

    // Cleanup rate limit tracking
    this._rateLimits.delete(socketId);

    this._sockets.delete(socketId);
    return entry;
  }

  // ── Room Management ─────────────────────────────────
  joinRoom(socketId, room) {
    const entry = this._sockets.get(socketId);
    if (entry) entry.rooms.add(room);
  }

  leaveRoom(socketId, room) {
    const entry = this._sockets.get(socketId);
    if (entry) entry.rooms.delete(room);
  }

  // ── Reconnect Restoration ───────────────────────────
  // Returns previously joined rooms for a reconnecting user
  getDisconnectedSession(userId) {
    return this._disconnectedSessions.get(userId) || null;
  }

  // ── Heartbeat ───────────────────────────────────────
  updateHeartbeat(socketId) {
    const entry = this._sockets.get(socketId);
    if (entry) entry.lastHeartbeat = Date.now();
  }

  // ── Stale Detection ─────────────────────────────────
  // Returns socketIds that haven't sent a heartbeat within timeout
  getStaleSocketIds(timeoutMs = 60000) {
    const stale = [];
    const now = Date.now();
    for (const [socketId, entry] of this._sockets) {
      if (now - entry.lastHeartbeat > timeoutMs) {
        stale.push(socketId);
      }
    }
    return stale;
  }

  // ── Rate Limiting ───────────────────────────────────
  // Returns true if the socket has exceeded the rate limit
  checkRateLimit(socketId, maxPerWindow = 30, windowMs = 10000) {
    const now = Date.now();
    let rl = this._rateLimits.get(socketId);

    if (!rl || (now - rl.windowStart) > windowMs) {
      // New window
      rl = { count: 1, windowStart: now };
      this._rateLimits.set(socketId, rl);
      return false;
    }

    rl.count++;
    return rl.count > maxPerWindow;
  }

  // ── Queries ─────────────────────────────────────────
  getSocketsByUserId(userId) {
    return this._userSockets.get(userId) || new Set();
  }

  getSocketEntry(socketId) {
    return this._sockets.get(socketId) || null;
  }

  isUserOnline(userId) {
    const sockets = this._userSockets.get(userId);
    return sockets && sockets.size > 0;
  }

  getOnlineUserCount() {
    return this._userSockets.size;
  }

  getActiveSocketCount() {
    return this._sockets.size;
  }

  // ── Debug / Monitoring ──────────────────────────────
  getStats() {
    return {
      onlineUsers: this._userSockets.size,
      activeSockets: this._sockets.size,
      disconnectedSessions: this._disconnectedSessions.size
    };
  }
}

// Singleton — one registry per process
module.exports = new SocketRegistry();
