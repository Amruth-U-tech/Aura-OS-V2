const { Server } = require('socket.io');
const socketAuthMiddleware = require('./socketAuthMiddleware');
const socketRegistry = require('./socketRegistry');
const roomManager = require('./roomManager');
const socketEmitter = require('./socketEmitter');

// ======================================================
// SOCKET SERVER — Phase 3.0.1 (Hardened)
// The centralized Socket.IO server orchestrator
// Owns: connection lifecycle, event routing, heartbeat,
//       reconnect restoration, stale cleanup
// Phase 3.0.1: identity fail-fast, reconnect hardening,
//              duplicate prevention, graceful error handling
// Must NOT: contain business logic, mutate DB, calculate XP
// ======================================================

// Phase 3.1.6 FIX: Relaxed timing to survive browser tab throttling.
// Chrome throttles background tab timers to 1/min. Previous 30s/60s caused false ping timeouts.
const HEARTBEAT_INTERVAL_MS = 45000;    // Socket.IO native ping every 45s
const HEARTBEAT_TIMEOUT_MS = 120000;    // Stale after 120s silence (survives background throttle)
const STALE_SWEEP_INTERVAL_MS = 90000;  // Sweep for stale sockets every 90s

let _heartbeatSweeper = null;

// ── Initialize Socket.IO on the HTTP server ───────────
const initializeSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingInterval: HEARTBEAT_INTERVAL_MS,
    pingTimeout: HEARTBEAT_TIMEOUT_MS,
    // Limit payload size to prevent abuse
    maxHttpBufferSize: 1e5, // 100KB
    // Connection state recovery (Socket.IO v4.6+)
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 min recovery window
      skipMiddlewares: false // ALWAYS re-validate auth on reconnect
    }
  });

  // ── Register Auth Middleware ───────────────────────
  io.use(socketAuthMiddleware);

  // ── Inject IO instance into emitter ───────────────
  socketEmitter.initialize(io);

  // ── Connection Handler ────────────────────────────
  io.on('connection', (socket) => {
    const { userId, auraPlayerId, displayName } = socket.data;

    // ── IDENTITY FAIL-FAST (Phase 3.0.1) ────────────
    // If auth middleware somehow passed without complete identity,
    // forcefully disconnect. This is a defense-in-depth guard.
    if (!userId || !auraPlayerId || !auraPlayerId.startsWith('AURA-PLR-')) {
      console.error(`[Socket] IDENTITY GUARD: Rejecting socket with incomplete identity (userId=${userId}, auraPlayerId=${auraPlayerId})`);
      socket.emit('error', { code: 'IDENTITY_INVALID', message: 'Socket identity incomplete' });
      socket.disconnect(true);
      return;
    }

    const tag = `[Socket] ${auraPlayerId}`;

    // Register in the socket registry
    socketRegistry.register(socket.id, userId, auraPlayerId);

    // Auto-join player's private room
    const playerRoom = roomManager.joinPlayerRoom(socket);
    console.info(`${tag} Connected (socket: ${socket.id}, room: ${playerRoom})`);

    // ── Reconnect: Restore previous rooms ───────────
    const prevSession = socketRegistry.getDisconnectedSession(userId);
    if (prevSession) {
      let restored = 0;
      for (const room of prevSession.rooms) {
        // Player room is already joined above, skip it
        if (room.startsWith(roomManager.ROOM_PREFIX.PLAYER)) continue;
        socket.join(room);
        socketRegistry.joinRoom(socket.id, room);
        restored++;
      }
      if (restored > 0) {
        console.info(`${tag} Reconnected — restored ${restored} room(s)`);
      }
      // Emit reconnect event so frontend knows rooms were restored
      socket.emit('transport:reconnected', {
        restoredRooms: restored,
        auraPlayerId,
        displayName
      });
    }

    // ── Heartbeat (client → server) ─────────────────
    socket.on('heartbeat', (_, ack) => {
      socketRegistry.updateHeartbeat(socket.id);
      if (typeof ack === 'function') ack({ ok: true });
    });

    // ── Room Join Requests ──────────────────────────
    socket.on('room:join:hub', async (data, ack) => {
      try {
        if (socketRegistry.checkRateLimit(socket.id)) {
          if (typeof ack === 'function') ack({ error: 'RATE_LIMITED' });
          return;
        }
        const { auraHubId } = data || {};
        if (!auraHubId || typeof auraHubId !== 'string' || !auraHubId.startsWith('AURA-HUB-')) {
          if (typeof ack === 'function') ack({ error: 'INVALID_HUB_ID' });
          return;
        }
        const result = await roomManager.joinHubRoom(socket, auraHubId);
        if (typeof ack === 'function') ack(result);
      } catch (err) {
        console.error(`${tag} Error joining hub room:`, err.message);
        if (typeof ack === 'function') ack({ error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('room:join:challenge', async (data, ack) => {
      try {
        if (socketRegistry.checkRateLimit(socket.id)) {
          if (typeof ack === 'function') ack({ error: 'RATE_LIMITED' });
          return;
        }
        const { auraChallengeId } = data || {};
        if (!auraChallengeId || typeof auraChallengeId !== 'string' || !auraChallengeId.startsWith('AURA-CHL-')) {
          if (typeof ack === 'function') ack({ error: 'INVALID_CHALLENGE_ID' });
          return;
        }
        const result = await roomManager.joinChallengeRoom(socket, auraChallengeId);
        if (typeof ack === 'function') ack(result);
      } catch (err) {
        console.error(`${tag} Error joining challenge room:`, err.message);
        if (typeof ack === 'function') ack({ error: 'INTERNAL_ERROR' });
      }
    });

    // ── Room Leave Requests ─────────────────────────
    socket.on('room:leave', (data) => {
      const { room } = data || {};
      if (!room || typeof room !== 'string') return;
      // Never allow leaving own player room
      if (room === playerRoom) return;
      roomManager.leaveRoom(socket, room);
      console.info(`${tag} Left room: ${room}`);
    });

    // ── Presence Query ──────────────────────────────
    socket.on('presence:query', (data, ack) => {
      try {
        if (socketRegistry.checkRateLimit(socket.id)) {
          if (typeof ack === 'function') ack({ error: 'RATE_LIMITED' });
          return;
        }
        const { userIds } = data || {};
        if (!Array.isArray(userIds)) {
          if (typeof ack === 'function') ack({ error: 'INVALID_PAYLOAD' });
          return;
        }
        // Cap at 50, filter non-strings
        const capped = userIds.filter(id => typeof id === 'string').slice(0, 50);
        const online = {};
        capped.forEach(uid => { online[uid] = socketRegistry.isUserOnline(uid); });
        if (typeof ack === 'function') ack({ online });
      } catch (err) {
        console.error(`${tag} Presence query error:`, err.message);
        if (typeof ack === 'function') ack({ online: {} });
      }
    });

    // ── Registry Stats (admin/debug only) ───────────
    socket.on('system:stats', (_, ack) => {
      if (typeof ack === 'function') ack(socketRegistry.getStats());
    });

    // ── Disconnect Handler ──────────────────────────
    socket.on('disconnect', (reason) => {
      const entry = socketRegistry.unregister(socket.id);
      const remaining = socketRegistry.getSocketsByUserId(userId).size;
      console.info(`${tag} Disconnected (reason: ${reason}, remaining tabs: ${remaining})`);
    });

    // ── Catch-all: block unknown events ─────────────
    socket.onAny((eventName) => {
      const known = [
        'heartbeat', 'room:join:hub', 'room:join:challenge',
        'room:leave', 'presence:query', 'system:stats'
      ];
      if (!known.includes(eventName)) {
        console.warn(`${tag} Unknown event blocked: ${eventName}`);
      }
    });
  });

  // ── Stale Socket Sweeper ──────────────────────────
  _heartbeatSweeper = setInterval(() => {
    const stale = socketRegistry.getStaleSocketIds(HEARTBEAT_TIMEOUT_MS);
    if (stale.length > 0) {
      console.warn(`[Socket:Sweeper] Cleaning ${stale.length} stale socket(s)`);
      stale.forEach(sid => {
        const s = io.sockets.sockets.get(sid);
        if (s) s.disconnect(true);
      });
    }
  }, STALE_SWEEP_INTERVAL_MS);

  console.info(`[Socket] ✅ Realtime transport initialized (heartbeat: ${HEARTBEAT_INTERVAL_MS}ms, sweep: ${STALE_SWEEP_INTERVAL_MS}ms)`);

  return io;
};

// ── Graceful Shutdown ─────────────────────────────────
const shutdownSocketServer = () => {
  if (_heartbeatSweeper) {
    clearInterval(_heartbeatSweeper);
    _heartbeatSweeper = null;
  }
  console.info('[Socket] Transport layer shut down');
};

module.exports = {
  initializeSocketServer,
  shutdownSocketServer
};
