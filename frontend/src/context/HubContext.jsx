import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import hubApi from '@services/hubApi';
import { eventBus } from '@systems/eventBus';
import { reconnectCoordinator } from '@systems/reconnectCoordinator';
import { eventDedup } from '@utils/eventDedup';
import { fetchOrchestrator } from '@utils/fetchOrchestrator';
import { normalizeHubArray, normalizeHub, safeUpdate, safeAppend } from '@utils/stateNormalizers';
import { useAuth } from '@context/AuthContext';

// ======================================================
// HUB CONTEXT — Phase 3.1.2
// OWNS: joined hubs array
// Single authority — HubsPage CONSUMES only
// Orchestration: single-flight on /hubs
// ======================================================

const HubContext = createContext();

const initialState = {
  hubs: [],
  loading: false,
  error: null,
};

const hubReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: true, error: null };

    case 'SET_HUBS':
      return { ...state, hubs: normalizeHubArray(action.payload), loading: false, error: null };

    case 'ADD_HUB': {
      const normalized = normalizeHub(action.payload);
      if (!normalized?._id) return state;
      return { ...state, hubs: safeAppend(state.hubs, normalized, '_id') };
    }

    case 'UPDATE_HUB': {
      const normalized = normalizeHub(action.payload);
      if (!normalized?._id) return state;
      return { ...state, hubs: safeUpdate(state.hubs, normalized, '_id') };
    }

    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };

    default:
      return state;
  }
};

export const HubProvider = ({ children }) => {
  const [state, dispatch] = useReducer(hubReducer, initialState);
  const { authReady, isAuthenticated } = useAuth();
  const mountedRef = useRef(true);
  const listenersRef = useRef([]);

  // ── Orchestrated fetch ─────────────────────────────
  const fetchHubs = useCallback(async (opts = {}) => {
    try {
      const data = await fetchOrchestrator.fetch(
        'hubs.mine',
        () => hubApi.getMyHubs(),
        { cooldownMs: 5000, ...opts }
      );
      if (data && mountedRef.current) {
        dispatch({ type: 'SET_HUBS', payload: data?.hubs || data });
      }
    } catch (err) {
      if (err?.type === 'rate_limited') return;
      if (mountedRef.current) {
        dispatch({ type: 'SET_ERROR', payload: err?.message || 'Failed to load hubs' });
      }
    }
  }, []);

  const softHydrate = useCallback(async () => {
    await fetchOrchestrator.hydrate(
      'hubs',
      () => fetchHubs({ cooldownMs: 0 }),
      { cooldownMs: 3000 }
    );
  }, [fetchHubs]);

  // ── Initial load ───────────────────────────────────
  // Phase 3.1.4: Skip if ReconnectCoordinator is handling hydration
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    if (reconnectCoordinator.isHydrating()) return; // Coordinator will handle this
    fetchHubs();
  }, [authReady, isAuthenticated, fetchHubs]);

  // ── Phase 3.1.3: Register with ReconnectCoordinator ──
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    reconnectCoordinator.registerHydrator('hubs', softHydrate);
    return () => reconnectCoordinator.unregisterHydrator('hubs');
  }, [authReady, isAuthenticated, softHydrate]);

  // ── Socket listeners ───────────────────────────────
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;

    const handlers = {
      'hub.member.joined': (data) => {
        if (eventDedup.isDuplicate('hub.member.joined', data)) return;
        if (data?.auraHubId) {
          const hub = state.hubs.find(h => h.auraHubId === data.auraHubId);
          if (hub) {
            dispatch({
              type: 'UPDATE_HUB',
              payload: { ...hub, memberCount: data.memberCount || (hub.memberCount + 1) }
            });
          }
        }
      },
      'hub.member.left': (data) => {
        if (eventDedup.isDuplicate('hub.member.left', data)) return;
        if (data?.auraHubId) {
          const hub = state.hubs.find(h => h.auraHubId === data.auraHubId);
          if (hub) {
            dispatch({
              type: 'UPDATE_HUB',
              payload: { ...hub, memberCount: Math.max(0, hub.memberCount - 1) }
            });
          }
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
  }, [authReady, isAuthenticated, state.hubs]);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  return (
    <HubContext.Provider value={{
      hubs: state.hubs,
      loading: state.loading,
      error: state.error,
      refreshHubs: () => fetchHubs({ force: true, cooldownMs: 0 }),
    }}>
      {children}
    </HubContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useHubs = () => useContext(HubContext);
