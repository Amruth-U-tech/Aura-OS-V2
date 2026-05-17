import { io } from 'socket.io-client';
import { eventBus } from '@systems/eventBus';

// ======================================================
// SOCKET CLIENT — Phase 3.0.1 (Hardened)
// The centralized frontend realtime transport client
// Owns: connection lifecycle, reconnect, room management,
//       listener registration, cleanup, heartbeat
// Phase 3.0.1: reconnect hardening, token refresh on reconnect,
//              listener dedup safety, backend restart recovery
// Must NOT: contain business logic, directly mutate React state
// Events are forwarded via the existing eventBus system
// ======================================================

// ── Configuration ─────────────────────────────────────
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
  || import.meta.env.VITE_API_URL?.replace('/api', '')
  || 'http://localhost:5000';

const HEARTBEAT_INTERVAL_MS = 25000; // Client sends heartbeat every 25s
const MAX_RECONNECT_ATTEMPTS = 15;

// ── State ─────────────────────────────────────────────
let _socket = null;
let _heartbeatTimer = null;
let _subscribedRooms = new Set();
let _currentToken = null; // Track token for reconnect auth refresh

// ── Prevent duplicate listeners ───────────────────────
// Map<eventName, Map<callbackId, callback>>
const _registeredListeners = new Map();
let _listenerIdCounter = 0;

// ── Initialize Connection ─────────────────────────────
const connect = (token) => {
  if (!token || typeof token !== 'string' || token.length < 10) {
    console.warn('[Socket] Cannot connect: invalid token');
    return null;
  }

  // If already connected with the SAME token, skip
  if (_socket?.connected && _currentToken === token) {
    return _socket;
  }

  // If token changed (re-login), tear down old connection fully
  if (_socket && _currentToken !== token) {
    _fullCleanup();
  }

  _currentToken = token;

  // Disconnect previous instance if exists (stale socket)
  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }

  _socket = io(SOCKET_URL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    transports: ['websocket', 'polling'],
    // Force new connection on every connect call to avoid stale state
    forceNew: false
  });

  // ── Connection Events ─────────────────────────────
  _socket.on('connect', () => {
    console.info(`[Socket] ✅ Connected (id: ${_socket.id})`);
    eventBus.emit('socket:connected', { id: _socket.id });
    _startHeartbeat();

    // Re-subscribe to rooms after reconnect
    if (_subscribedRooms.size > 0) {
      console.info(`[Socket] Restoring ${_subscribedRooms.size} room subscription(s)`);
      for (const room of _subscribedRooms) {
        _rejoinRoom(room);
      }
    }
  });

  _socket.on('disconnect', (reason) => {
    console.warn(`[Socket] ⚠️ Disconnected: ${reason}`);
    eventBus.emit('socket:disconnected', { reason });
    _stopHeartbeat();
  });

  _socket.on('connect_error', (err) => {
    console.error(`[Socket] ❌ Connection error: ${err.message}`);
    eventBus.emit('socket:error', { message: err.message });

    // If auth fails, stop reconnecting and force re-login
    const authErrors = ['AUTHENTICATION_REQUIRED', 'INVALID_TOKEN', 'AUTHENTICATION_FAILED', 'IDENTITY_CORRUPT', 'PROFILE_NOT_FOUND'];
    if (authErrors.includes(err.message)) {
      console.error('[Socket] Auth failure — stopping reconnection');
      _socket.disconnect();
      eventBus.emit('auth:unauthorized', { message: 'Socket authentication failed' });
    }
  });

  // ── Transport reconnect event from server ─────────
  // Phase 3.0.1: Server emits this after restoring rooms
  _socket.on('transport:reconnected', (data) => {
    console.info(`[Socket] Transport reconnected — ${data.restoredRooms} room(s) restored`);
    eventBus.emit('socket:reconnected', data);
  });

  return _socket;
};

// ── Update token for reconnect ────────────────────────
// Phase 3.0.1: Called when auth refreshes token without full re-login
const updateToken = (newToken) => {
  if (!newToken || typeof newToken !== 'string') return;
  _currentToken = newToken;
  if (_socket) {
    _socket.auth = { token: newToken };
  }
};

// ── Disconnect ────────────────────────────────────────
const disconnect = () => {
  _fullCleanup();
  console.info('[Socket] Disconnected and cleaned up');
};

// ── Full Cleanup (internal) ───────────────────────────
const _fullCleanup = () => {
  _stopHeartbeat();
  _subscribedRooms.clear();
  _registeredListeners.clear();
  _listenerIdCounter = 0;
  _currentToken = null;

  if (_socket) {
    _socket.removeAllListeners();
    _socket.disconnect();
    _socket = null;
  }
};

// ── Heartbeat ─────────────────────────────────────────
const _startHeartbeat = () => {
  _stopHeartbeat();
  _heartbeatTimer = setInterval(() => {
    if (_socket?.connected) {
      _socket.emit('heartbeat', {}, (ack) => {
        if (!ack?.ok) console.warn('[Socket] Heartbeat not acknowledged');
      });
    }
  }, HEARTBEAT_INTERVAL_MS);
};

const _stopHeartbeat = () => {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
};

// ── Room Management ───────────────────────────────────
const _rejoinRoom = (room) => {
  if (!_socket?.connected) return;

  if (room.startsWith('hub:')) {
    const auraHubId = room.replace('hub:', '');
    _socket.emit('room:join:hub', { auraHubId }, (ack) => {
      if (ack?.error) {
        console.warn(`[Socket] Room rejoin failed: ${room} — ${ack.error}`);
        // Remove stale room subscription
        _subscribedRooms.delete(room);
      } else {
        console.info(`[Socket] Rejoined room: ${room}`);
      }
    });
  } else if (room.startsWith('challenge:')) {
    const auraChallengeId = room.replace('challenge:', '');
    _socket.emit('room:join:challenge', { auraChallengeId }, (ack) => {
      if (ack?.error) {
        console.warn(`[Socket] Room rejoin failed: ${room} — ${ack.error}`);
        _subscribedRooms.delete(room);
      } else {
        console.info(`[Socket] Rejoined room: ${room}`);
      }
    });
  }
};

const joinHubRoom = (auraHubId) => {
  if (!_socket?.connected) {
    console.warn('[Socket] Not connected — cannot join hub room');
    return;
  }
  if (!auraHubId || !auraHubId.startsWith('AURA-HUB-')) {
    console.warn('[Socket] Invalid hub ID');
    return;
  }
  const room = `hub:${auraHubId}`;
  if (_subscribedRooms.has(room)) return; // Already subscribed
  _socket.emit('room:join:hub', { auraHubId }, (ack) => {
    if (ack?.success) {
      _subscribedRooms.add(room);
      console.info(`[Socket] Joined hub room: ${room}`);
    } else {
      console.warn(`[Socket] Hub join denied: ${ack?.error}`);
    }
  });
};

const joinChallengeRoom = (auraChallengeId) => {
  if (!_socket?.connected) {
    console.warn('[Socket] Not connected — cannot join challenge room');
    return;
  }
  if (!auraChallengeId || !auraChallengeId.startsWith('AURA-CHL-')) {
    console.warn('[Socket] Invalid challenge ID');
    return;
  }
  const room = `challenge:${auraChallengeId}`;
  if (_subscribedRooms.has(room)) return; // Already subscribed
  _socket.emit('room:join:challenge', { auraChallengeId }, (ack) => {
    if (ack?.success) {
      _subscribedRooms.add(room);
      console.info(`[Socket] Joined challenge room: ${room}`);
    } else {
      console.warn(`[Socket] Challenge join denied: ${ack?.error}`);
    }
  });
};

const leaveRoom = (room) => {
  if (!_socket?.connected) return;
  if (!room || typeof room !== 'string') return;
  _socket.emit('room:leave', { room });
  _subscribedRooms.delete(room);
  console.info(`[Socket] Left room: ${room}`);
};

// ── Safe Event Listener Registration ──────────────────
// Phase 3.0.1: Uses unique numeric IDs instead of callback stringification
// Prevents duplicate listeners — the #1 cause of socket chaos
const on = (eventName, callback) => {
  if (!_socket) {
    console.warn(`[Socket] Cannot register listener — not initialized (event: ${eventName})`);
    return () => {};
  }

  const listenerId = ++_listenerIdCounter;

  // Track listener for cleanup
  if (!_registeredListeners.has(eventName)) {
    _registeredListeners.set(eventName, new Map());
  }
  _registeredListeners.get(eventName).set(listenerId, callback);

  _socket.on(eventName, callback);

  // Return cleanup function for React useEffect
  return () => {
    const listeners = _registeredListeners.get(eventName);
    if (listeners) {
      listeners.delete(listenerId);
      if (listeners.size === 0) _registeredListeners.delete(eventName);
    }
    if (_socket) _socket.off(eventName, callback);
  };
};

// ── Bridge: Forward socket events to eventBus ─────────
// This is the recommended way for React components to consume events
const bridgeToEventBus = (socketEvent, busEvent) => {
  return on(socketEvent, (data) => {
    eventBus.emit(busEvent || socketEvent, data);
  });
};

// ── Presence Query ────────────────────────────────────
const queryPresence = (userIds) => {
  return new Promise((resolve) => {
    if (!_socket?.connected || !Array.isArray(userIds)) {
      resolve({});
      return;
    }
    // Timeout protection to prevent hanging
    const timer = setTimeout(() => resolve({}), 3000);
    _socket.emit('presence:query', { userIds }, (ack) => {
      clearTimeout(timer);
      resolve(ack?.online || {});
    });
  });
};

// ── Status Queries ────────────────────────────────────
const isConnected = () => !!_socket?.connected;
const getSocketId = () => _socket?.id || null;

const getStats = () => {
  return new Promise((resolve) => {
    if (!_socket?.connected) {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => resolve(null), 3000);
    _socket.emit('system:stats', {}, (ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
};

// ── Export ─────────────────────────────────────────────
const socketClient = {
  connect,
  disconnect,
  updateToken,
  joinHubRoom,
  joinChallengeRoom,
  leaveRoom,
  on,
  bridgeToEventBus,
  queryPresence,
  isConnected,
  getSocketId,
  getStats
};

export default socketClient;
