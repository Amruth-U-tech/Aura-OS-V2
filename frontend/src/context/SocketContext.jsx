import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import socketClient from '@services/socketClient';
import { useAuth } from '@context/AuthContext';

// ======================================================
// SOCKET CONTEXT — Phase 3.0.1 (Hardened)
// Owns: socket connection lifecycle tied to auth state
// Auto-connects when authenticated, disconnects on logout
// Phase 3.0.1: reconnect event handling, token refresh sync,
//              deterministic cleanup, backend restart recovery
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

export const SocketProvider = ({ children }) => {
  const { token, isAuthenticated, authReady } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const cleanupRef = useRef([]);
  const prevTokenRef = useRef(null);

  // ── Connect/Disconnect based on auth state ────────
  useEffect(() => {
    if (!authReady) return;

    if (isAuthenticated && token) {
      // Phase 3.0.1: If token changed but still authenticated,
      // update the socket auth without full teardown
      if (prevTokenRef.current && prevTokenRef.current !== token) {
        socketClient.updateToken(token);
      }
      prevTokenRef.current = token;

      // Connect socket with JWT
      socketClient.connect(token);

      // Bridge core connection events to local state
      const cleanup1 = socketClient.on('connect', () => setIsConnected(true));
      const cleanup2 = socketClient.on('disconnect', () => setIsConnected(false));

      // Phase 3.0.1: Listen for server-side reconnect confirmation
      const cleanup3 = socketClient.on('transport:reconnected', (data) => {
        console.info(`[SocketContext] Transport reconnected: ${data.restoredRooms} rooms restored for ${data.auraPlayerId}`);
        setIsConnected(true);
      });

      // Bridge realtime events to the global eventBus
      // Components can subscribe via eventBus.on('player.xp.updated', cb)
      const bridges = [
        socketClient.bridgeToEventBus('player.xp.updated'),
        socketClient.bridgeToEventBus('player.trust.updated'),
        socketClient.bridgeToEventBus('player.level.up'),
        socketClient.bridgeToEventBus('player.streak.updated'),
        socketClient.bridgeToEventBus('player.notification'),
        socketClient.bridgeToEventBus('player.friend.request'),
        socketClient.bridgeToEventBus('player.challenge.invite'),
        socketClient.bridgeToEventBus('player.voucher.unlocked'),
        socketClient.bridgeToEventBus('hub.activity.created'),
        socketClient.bridgeToEventBus('hub.member.joined'),
        socketClient.bridgeToEventBus('hub.member.left'),
        socketClient.bridgeToEventBus('hub.challenge.created'),
        socketClient.bridgeToEventBus('hub.announcement'),
        socketClient.bridgeToEventBus('challenge.updated'),
        socketClient.bridgeToEventBus('challenge.submission.created'),
        socketClient.bridgeToEventBus('challenge.resolved'),
        socketClient.bridgeToEventBus('challenge.countdown'),
      ];

      cleanupRef.current = [cleanup1, cleanup2, cleanup3, ...bridges];

      return () => {
        cleanupRef.current.forEach(fn => { if (typeof fn === 'function') fn(); });
        cleanupRef.current = [];
        socketClient.disconnect();
        setIsConnected(false);
      };
    } else {
      // Not authenticated — ensure disconnected
      socketClient.disconnect();
      setIsConnected(false);
      prevTokenRef.current = null;
    }
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

export const useSocket = () => useContext(SocketContext);
