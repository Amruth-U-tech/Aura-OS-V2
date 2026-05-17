import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import challengeApi from '@services/challengeApi';
import { eventBus } from '@systems/eventBus';
import { reconnectCoordinator } from '@systems/reconnectCoordinator';
import { eventDedup } from '@utils/eventDedup';
import { fetchOrchestrator } from '@utils/fetchOrchestrator';
import { normalizeChallengeArray, normalizeChallenge, safeUpdate } from '@utils/stateNormalizers';
import { useAuth } from '@context/AuthContext';

// ======================================================
// CHALLENGE CONTEXT — Phase 3.1.2
// OWNS: challenges array, selectedId
// Single authority — ChallengesPage CONSUMES only
// Orchestration: single-flight on /challenges
// CRITICAL: challenges MUST ALWAYS be a normalized array
// ======================================================

const ChallengeContext = createContext();

const initialState = {
  challenges: [],
  selectedId: null,
  loading: false,
  error: null,
};

const challengeReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: true, error: null };

    case 'SET_CHALLENGES':
      return {
        ...state,
        challenges: normalizeChallengeArray(action.payload),
        loading: false,
        error: null,
      };

    case 'ADD_CHALLENGE': {
      const normalized = normalizeChallenge(action.payload);
      if (!normalized?._id) return state;
      const exists = state.challenges.some(c => c._id === normalized._id);
      if (exists) return state;
      return { ...state, challenges: [normalized, ...state.challenges] };
    }

    case 'UPDATE_CHALLENGE': {
      const normalized = normalizeChallenge(action.payload);
      if (!normalized?._id) return state;
      return { ...state, challenges: safeUpdate(state.challenges, normalized, '_id') };
    }

    case 'SET_SELECTED':
      return { ...state, selectedId: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };

    default:
      return state;
  }
};

export const ChallengeProvider = ({ children }) => {
  const [state, dispatch] = useReducer(challengeReducer, initialState);
  const { authReady, isAuthenticated } = useAuth();
  const mountedRef = useRef(true);
  const listenersRef = useRef([]);

  // ── Orchestrated fetch ─────────────────────────────
  const fetchChallenges = useCallback(async (opts = {}) => {
    try {
      const data = await fetchOrchestrator.fetch(
        'challenges.mine',
        () => challengeApi.getMyChallenges(),
        { cooldownMs: 5000, ...opts }
      );
      if (data && mountedRef.current) {
        dispatch({ type: 'SET_CHALLENGES', payload: data?.challenges || data });
      }
    } catch (err) {
      if (err?.type === 'rate_limited') return;
      if (mountedRef.current) {
        dispatch({ type: 'SET_ERROR', payload: err?.message || 'Failed to load challenges' });
      }
    }
  }, []);

  const softHydrate = useCallback(async () => {
    await fetchOrchestrator.hydrate(
      'challenges',
      () => fetchChallenges({ cooldownMs: 0 }),
      { cooldownMs: 3000 }
    );
  }, [fetchChallenges]);

  // ── Initial load ───────────────────────────────
  // Phase 3.1.4: Skip if ReconnectCoordinator is handling hydration
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    if (reconnectCoordinator.isHydrating()) return; // Coordinator will handle this
    fetchChallenges();
  }, [authReady, isAuthenticated, fetchChallenges]);

  // ── Phase 3.1.3: Register with ReconnectCoordinator ──
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    reconnectCoordinator.registerHydrator('challenges', softHydrate);
    return () => reconnectCoordinator.unregisterHydrator('challenges');
  }, [authReady, isAuthenticated, softHydrate]);

  // ── Socket listeners ───────────────────────────────
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;

    const handlers = {
      'challenge.updated': (data) => {
        if (eventDedup.isDuplicate('challenge.updated', data)) return;
        if (data?._id || data?.challengeId) {
          dispatch({
            type: 'UPDATE_CHALLENGE',
            payload: { _id: data._id || data.challengeId, ...data }
          });
        }
      },
      'challenge.submission.created': (data) => {
        if (eventDedup.isDuplicate('challenge.submission.created', data)) return;
        // Refresh to get accurate submission state
        fetchChallenges({ cooldownMs: 0, force: true });
      },
      'challenge.resolved': (data) => {
        if (eventDedup.isDuplicate('challenge.resolved', data)) return;
        if (data?.challengeId || data?._id) {
          dispatch({
            type: 'UPDATE_CHALLENGE',
            payload: {
              _id: data._id || data.challengeId,
              status: 'COMPLETED',
              winnerId: data.winnerId,
            }
          });
        }
      },
      'player.challenge.invite': (data) => {
        if (eventDedup.isDuplicate('player.challenge.invite', data)) return;
        fetchChallenges({ cooldownMs: 0, force: true });
      },
      // Phase 3.1.5: Live validation result propagation
      'challenge.validated': (data) => {
        if (eventDedup.isDuplicate('challenge.validated', data)) return;
        // Refresh to get accurate submission + validation state
        fetchChallenges({ cooldownMs: 0, force: true });
      },
      // Phase 3.1.5: Live cancellation propagation
      'challenge.cancelled': (data) => {
        if (eventDedup.isDuplicate('challenge.cancelled', data)) return;
        if (data?.challengeId) {
          dispatch({
            type: 'UPDATE_CHALLENGE',
            payload: { _id: data.challengeId, status: 'CANCELLED' }
          });
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
  }, [authReady, isAuthenticated, fetchChallenges]);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const selectChallenge = useCallback((id) => dispatch({ type: 'SET_SELECTED', payload: id }), []);
  const selectedChallenge = state.challenges.find(c => c._id === state.selectedId) || null;

  return (
    <ChallengeContext.Provider value={{
      challenges: state.challenges,
      selectedChallenge,
      loading: state.loading,
      error: state.error,
      refreshChallenges: () => fetchChallenges({ force: true, cooldownMs: 0 }),
      selectChallenge,
    }}>
      {children}
    </ChallengeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useChallenges = () => useContext(ChallengeContext);
