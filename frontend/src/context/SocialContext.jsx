import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import socialApi from '@services/socialApi';
import { eventBus } from '@systems/eventBus';
import { reconnectCoordinator } from '@systems/reconnectCoordinator';
import { eventDedup } from '@utils/eventDedup';
import { fetchOrchestrator } from '@utils/fetchOrchestrator';
import { normalizeFriendArray, normalizeRequestArray, safeAppend, safeRemove } from '@utils/stateNormalizers';
import { useAuth } from '@context/AuthContext';

// ======================================================
// SOCIAL CONTEXT — Phase 3.1.3
// OWNS: friends, incomingRequests, sentRequests
// Single authority — FriendsPage CONSUMES only, never fetches directly
// Phase 3.1.3: Reconnect hydration via ReconnectCoordinator (not independent)
// No FriendsPage local state shadows allowed
// ======================================================

const SocialContext = createContext();

const initialState = {
  friends: [],
  incomingRequests: [],
  sentRequests: [],
  loading: false,
  error: null,
};

const socialReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: true, error: null };

    case 'SET_FRIENDS':
      return { ...state, friends: normalizeFriendArray(action.payload), loading: false };

    case 'SET_INCOMING':
      return { ...state, incomingRequests: normalizeRequestArray(action.payload), loading: false };

    case 'SET_SENT':
      return { ...state, sentRequests: normalizeRequestArray(action.payload), loading: false };

    case 'ADD_INCOMING_REQUEST': {
      const exists = state.incomingRequests.some(r => r._id === action.payload._id);
      if (exists) return state;
      return { ...state, incomingRequests: [action.payload, ...state.incomingRequests] };
    }

    case 'ADD_FRIEND': {
      const friends = safeAppend(state.friends, action.payload, 'friendId');
      return { ...state, friends };
    }

    case 'REMOVE_FRIEND':
      return { ...state, friends: safeRemove(state.friends, action.payload, 'friendId') };

    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };

    default:
      return state;
  }
};

export const SocialProvider = ({ children }) => {
  const [state, dispatch] = useReducer(socialReducer, initialState);
  const { authReady, isAuthenticated } = useAuth();
  const mountedRef = useRef(true);
  const listenersRef = useRef([]);

  // ── Orchestrated fetches ───────────────────────────
  const fetchFriends = useCallback(async (opts = {}) => {
    try {
      const data = await fetchOrchestrator.fetch(
        'social.friends',
        () => socialApi.getFriends(),
        { cooldownMs: 5000, ...opts }
      );
      if (data && mountedRef.current) {
        dispatch({ type: 'SET_FRIENDS', payload: data?.friends || data });
      }
    } catch (err) {
      if (err?.type === 'rate_limited') return;
      if (mountedRef.current) dispatch({ type: 'SET_ERROR', payload: err?.message });
    }
  }, []);

  const fetchIncoming = useCallback(async (opts = {}) => {
    try {
      const data = await fetchOrchestrator.fetch(
        'social.incoming',
        () => socialApi.getRequests(),
        { cooldownMs: 5000, ...opts }
      );
      if (data && mountedRef.current) {
        dispatch({ type: 'SET_INCOMING', payload: data?.requests || data });
      }
    } catch (err) {
      if (err?.type === 'rate_limited') return;
    }
  }, []);

  const fetchSent = useCallback(async (opts = {}) => {
    try {
      const data = await fetchOrchestrator.fetch(
        'social.sent',
        () => socialApi.getSentRequests(),
        { cooldownMs: 5000, ...opts }
      );
      if (data && mountedRef.current) {
        dispatch({ type: 'SET_SENT', payload: data?.requests || data });
      }
    } catch (err) {
      if (err?.type === 'rate_limited') return;
    }
  }, []);

  // ── Soft hydration via hydration lock ─────────────
  const softHydrate = useCallback(async () => {
    await fetchOrchestrator.hydrate('social', async () => {
      await fetchFriends({ cooldownMs: 0 });
      await fetchIncoming({ cooldownMs: 0 });
      await fetchSent({ cooldownMs: 0 });
    }, { cooldownMs: 3000 });
  }, [fetchFriends, fetchIncoming, fetchSent]);

  // ── Initial load ───────────────────────────────
  // Phase 3.1.4: Skip if ReconnectCoordinator is handling hydration.
  // Also made sequential to prevent parallel request bursts.
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    if (reconnectCoordinator.isHydrating()) return; // Coordinator will handle this
    const loadSequential = async () => {
      await fetchFriends();
      await fetchIncoming();
      await fetchSent();
    };
    void loadSequential();
  }, [authReady, isAuthenticated, fetchFriends, fetchIncoming, fetchSent]);

  // ── Phase 3.1.3: Register with ReconnectCoordinator ──
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    reconnectCoordinator.registerHydrator('social', softHydrate);
    return () => reconnectCoordinator.unregisterHydrator('social');
  }, [authReady, isAuthenticated, softHydrate]);

  // ── Socket listeners ───────────────────────────────
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;

    const handlers = {
      'player.friend.request': (data) => {
        if (eventDedup.isDuplicate('player.friend.request', data)) return;
        if (data?.type === 'INCOMING_REQUEST') {
          // Phase 3.1.4: CRITICAL — only add to state if we have a REAL Mongo requestId.
          // Temp IDs (rt-*) are ARCHITECTURALLY ILLEGAL in canonical state.
          if (data.requestId && !String(data.requestId).startsWith('rt-')) {
            dispatch({
              type: 'ADD_INCOMING_REQUEST',
              payload: {
                _id: data.requestId,
                senderId: data.senderId,
                senderName: data.senderName || 'Player',
                senderAuraId: data.senderAuraId || null,
                message: data.message || '',
                status: 'PENDING',
                createdAt: new Date().toISOString(),
              }
            });
          } else {
            // No real ID available — fetch canonical truth from backend
            console.warn('[SocialContext] Friend request event missing requestId, fetching from DB');
            fetchIncoming({ force: true, cooldownMs: 0 });
          }
        }
      },
      'player.notification': (data) => {
        if (data?.type === 'FRIEND_ACCEPTED') {
          if (eventDedup.isDuplicate('friend.accepted', data)) return;
          dispatch({
            type: 'ADD_FRIEND',
            payload: {
              friendId: data.friendId,
              displayName: data.friendName || 'Player',
              auraPlayerId: data.friendAuraId || null,
              level: 1,
              trustTier: 'NEUTRAL',
              isOnline: false,
            }
          });
          // Refresh to get clean DB truth
          fetchFriends({ cooldownMs: 0, force: true });
          fetchSent({ cooldownMs: 0, force: true });
        }
      },
      // Phase 3.1.3: socket:reconnected REMOVED — handled by ReconnectCoordinator
    };

    const unsubs = Object.entries(handlers).map(([event, handler]) =>
      eventBus.on(event, handler)
    );
    listenersRef.current = unsubs;

    return () => {
      listenersRef.current.forEach(fn => typeof fn === 'function' && fn());
      listenersRef.current = [];
    };
  }, [authReady, isAuthenticated, fetchFriends, fetchIncoming, fetchSent]);

  // ── Cleanup ────────────────────────────────────────
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  return (
    <SocialContext.Provider value={{
      friends: state.friends,
      incomingRequests: state.incomingRequests,
      sentRequests: state.sentRequests,
      loading: state.loading,
      error: state.error,
      refreshFriends: () => fetchFriends({ force: true, cooldownMs: 0 }),
      refreshIncoming: () => fetchIncoming({ force: true, cooldownMs: 0 }),
      refreshSent: () => fetchSent({ force: true, cooldownMs: 0 }),
    }}>
      {children}
    </SocialContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSocial = () => useContext(SocialContext);
