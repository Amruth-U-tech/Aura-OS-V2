import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import socketClient from '@services/socketClient';
import { useAuth } from '@context/AuthContext';
import { eventBus } from '@systems/eventBus';
import { reconnectCoordinator } from '@systems/reconnectCoordinator';

// ======================================================
// SOCKET CONTEXT — Phase 3.1.3 (Reconnect Coordinator)
// Owns: socket connection lifecycle tied to auth state
//
// Phase 3.1.3:
//   - Reconnect recovery delegated to reconnectCoordinator
//   - Event buffering during hydration (prevents stale overwrites)
//   - Individual context socket:reconnected listeners REMOVED
//   - Reconnect cooldown prevents cascade bursts
//
// Exposes: connection status, room helpers, event listeners
// Must NOT: contain business logic or mutate app data
// ======================================================

const SocketContext = createContext({
  isConnected: false,
  joinHubRoom: () => {},
  joinChallengeRoom: () => {},
  leaveRoom: () => {},
  onSocketEvent: () => () => {},
  queryPresence: async () => ({}),
});

// Events that should be buffered during hydration
const BUFFERABLE_EVENTS = new Set([
  'player.xp.updated',
  'player.trust.updated',
  'player.level.up',
  'player.streak.updated',
  'player.notification',
  'player.friend.request',
  'player.challenge.invite',
  'player.task.created',
  'player.voucher.unlocked',
  'hub.activity.created',
  'hub.member.joined',
  'hub.member.left',
  'hub.challenge.created',
  'hub.announcement',
  'challenge.updated',
  'challenge.submission.created',
  'challenge.resolved',
  'challenge.validated',    // Phase 3.1.5
  'challenge.cancelled',    // Phase 3.1.5
  'challenge.declined',     // Phase 3.1.6
  'challenge.ready',        // Phase 3.1.7
  'challenge.activated',    // Phase 3.1.7.1: dedicated activation event
  'challenge.countdown',
  'notification.created',   // Phase N1: persistent notification
  'notification.read',       // Phase N1.1: cross-tab read sync
  'notification.read-all',   // Phase N1.1: cross-tab mark-all-read
  'notification.acknowledged', // Phase N1.1: cross-tab acknowledge sync
]);

export const SocketProvider = ({ children }) => {
  const { token, isAuthenticated, authReady } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const cleanupRef = useRef([]);
  const prevTokenRef = useRef(null);
  // Reconnect cooldown — prevent cascade bursts
  const reconnectCooldownRef = useRef(0);
  const RECONNECT_COOLDOWN_MS = 5000;

  // ── Connect/Disconnect based on auth state ────────
  useEffect(() => {
    if (!authReady) return;

    if (isAuthenticated && token) {
      // If token changed but still authenticated, update socket auth
      if (prevTokenRef.current && prevTokenRef.current !== token) {
        socketClient.updateToken(token);
      }
      prevTokenRef.current = token;

      // Connect socket with JWT
      socketClient.connect(token);

      // Bridge core connection events to local state
      const cleanup1 = socketClient.on('connect', () => {
        const wasConnected = isConnected;
        setIsConnected(true);

        // Phase 3.1.3: On reconnect, delegate to ReconnectCoordinator
        // instead of emitting socket:reconnected for individual contexts
        if (wasConnected === false && prevTokenRef.current) {
          const now = Date.now();
          if (now - reconnectCooldownRef.current > RECONNECT_COOLDOWN_MS) {
            reconnectCooldownRef.current = now;
            // Centralized reconnect — coordinator handles staged hydration
            reconnectCoordinator.handleReconnect();
          }
        }
      });
      const cleanup2 = socketClient.on('disconnect', () => setIsConnected(false));

      // Transport-level reconnect (server-confirmed)
      const cleanup3 = socketClient.on('transport:reconnected', (data) => {
        console.info(`[SocketContext] Transport reconnected: ${data?.restoredRooms || 0} rooms restored`);
        setIsConnected(true);
        const now = Date.now();
        if (now - reconnectCooldownRef.current > RECONNECT_COOLDOWN_MS) {
          reconnectCooldownRef.current = now;
          reconnectCoordinator.handleReconnect();
        }
      });

      // Bridge realtime events to the global eventBus
      // Phase 3.1.3: Events are buffered during hydration to prevent
      // stale overwrites. The buffer is flushed after hydration completes.
      const makeBridge = (eventName) => {
        return socketClient.on(eventName, (data) => {
          // If coordinator is hydrating and this is a bufferable event,
          // buffer it instead of emitting immediately
          if (BUFFERABLE_EVENTS.has(eventName) && reconnectCoordinator.isBuffering()) {
            reconnectCoordinator.bufferEvent(eventName, data);
            return;
          }
          eventBus.emit(eventName, data);
        });
      };

      const bridges = [
        makeBridge('player.xp.updated'),
        makeBridge('player.trust.updated'),
        makeBridge('player.level.up'),
        makeBridge('player.streak.updated'),
        makeBridge('player.notification'),
        makeBridge('player.friend.request'),
        makeBridge('player.challenge.invite'),
        makeBridge('player.task.created'),
        makeBridge('player.voucher.unlocked'),
        makeBridge('hub.activity.created'),
        makeBridge('hub.member.joined'),
        makeBridge('hub.member.left'),
        makeBridge('hub.challenge.created'),
        makeBridge('hub.announcement'),
        makeBridge('challenge.updated'),
        makeBridge('challenge.submission.created'),
        makeBridge('challenge.resolved'),
        makeBridge('challenge.validated'),    // Phase 3.1.5
        makeBridge('challenge.cancelled'),    // Phase 3.1.5
        makeBridge('challenge.declined'),     // Phase 3.1.6
        makeBridge('challenge.ready'),        // Phase 3.1.7
        makeBridge('challenge.activated'),    // Phase 3.1.7.1
        makeBridge('challenge.countdown'),
        makeBridge('notification.created'),   // Phase N1
        makeBridge('notification.read'),       // Phase N1.1
        makeBridge('notification.read-all'),   // Phase N1.1
        makeBridge('notification.acknowledged'), // Phase N1.1
      ];

      cleanupRef.current = [cleanup1, cleanup2, cleanup3, ...bridges];

      return () => {
        cleanupRef.current.forEach(fn => { if (typeof fn === 'function') fn(); });
        cleanupRef.current = [];
        socketClient.disconnect();
        setIsConnected(false);
      };
    } else {
      // Not authenticated — sync React state with external socket system
      socketClient.disconnect();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsConnected(false);
      prevTokenRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token, authReady]);

  // ── Exposed methods (stable refs) ─────────────────
  const joinHubRoom = useCallback((auraHubId) => {
    socketClient.joinHubRoom(auraHubId);
  }, []);

  const joinChallengeRoom = useCallback((auraChallengeId) => {
    socketClient.joinChallengeRoom(auraChallengeId);
  }, []);

  const leaveRoom = useCallback((room) => {
    socketClient.leaveRoom(room);
  }, []);

  const onSocketEvent = useCallback((eventName, callback) => {
    return socketClient.on(eventName, callback);
  }, []);

  const queryPresence = useCallback(async (userIds) => {
    return socketClient.queryPresence(userIds);
  }, []);

  return (
    <SocketContext.Provider value={{
      isConnected,
      joinHubRoom,
      joinChallengeRoom,
      leaveRoom,
      onSocketEvent,
      queryPresence,
    }}>
      {children}
    </SocketContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSocket = () => useContext(SocketContext);
