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

// Phase 3.1.6
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

    // Phase 3.1.6/3.1.7: Remove challenge from array (declined / cancelled / left for 1v1)
    // Safe: filters by both _id and id (string) to handle any format
    case 'REMOVE_CHALLENGE': {
      const id = action.payload?.toString?.() || action.payload;
      if (!id) return state;
      return {
        ...state,
        challenges: state.challenges.filter(c =>
          (c._id?.toString?.() || c._id) !== id &&
          (c.id?.toString?.() || c.id) !== id
        )
      };
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
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    if (reconnectCoordinator.isHydrating()) return;
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
      // Phase 3.1.7: challenge.updated handles all structural updates
      'challenge.updated': (data) => {
        if (eventDedup.isDuplicate('challenge.updated', data)) return;
        const id = data?._id || data?.challengeId;
        if (!id) return;

        // Phase 3.1.7: PARTICIPANT_ACCEPTED for 1v1 carries newStatus=ACTIVE
        // Force refresh so both players see the ACTIVE state immediately
        if (data.type === 'PARTICIPANT_ACCEPTED' && data.newStatus === 'ACTIVE') {
          fetchChallenges({ cooldownMs: 0, force: true });
          return;
        }
        // WAITING_FOR_PARTICIPANTS: creator just dispatched invite — update status
        if (data.type === 'CHALLENGE_CREATED' || data.status) {
          dispatch({
            type: 'UPDATE_CHALLENGE',
            payload: { _id: id, ...(data.status && { status: data.status }) }
          });
        }
        // For validation and submission state, do full refresh
        if (data.type === 'SUBMISSION_VALIDATED' || data.type === 'PARTICIPANT_ACCEPTED') {
          fetchChallenges({ cooldownMs: 0, force: true });
        }
      },

      'challenge.submission.created': (data) => {
        if (eventDedup.isDuplicate('challenge.submission.created', data)) return;
        fetchChallenges({ cooldownMs: 0, force: true });
      },

      'challenge.resolved': (data) => {
        if (eventDedup.isDuplicate('challenge.resolved', data)) return;
        const id = data?._id || data?.challengeId;
        if (id) {
          dispatch({ type: 'UPDATE_CHALLENGE', payload: { _id: id, status: 'COMPLETED', winnerId: data.winnerId } });
        }
      },

      // Phase 3.1.7: challenge.declined — remove for both players if 1v1 cancelled
      'challenge.declined': (data) => {
        if (eventDedup.isDuplicate('challenge.declined', data)) return;
        if (data?.isCancelled && (data?.challengeId || data?._id)) {
          dispatch({ type: 'REMOVE_CHALLENGE', payload: data.challengeId || data._id });
        } else if (data?.challengeId) {
          fetchChallenges({ cooldownMs: 0, force: true });
        }
      },

      // Phase 3.1.7: challenge.cancelled — ALWAYS remove from array
      // This fires for BOTH players (including decliner via _loadAllParticipantIds)
      'challenge.cancelled': (data) => {
        if (eventDedup.isDuplicate('challenge.cancelled', data)) return;
        const id = data?.challengeId || data?._id;
        if (id) {
          dispatch({ type: 'REMOVE_CHALLENGE', payload: id });
        }
      },

      // Phase 3.1.7: challenge.ready — quorum met (hub challenges)
      'challenge.ready': (data) => {
        if (eventDedup.isDuplicate('challenge.ready', data)) return;
        const id = data?.challengeId || data?._id;
        if (id) {
          dispatch({ type: 'UPDATE_CHALLENGE', payload: { _id: id, status: 'READY' } });
        }
      },

      // Phase 3.1.7.1: challenge.activated — dedicated activation event
      // Fires for BOTH players when 1v1 starts (accept) or hub starts (READY→ACTIVE)
      // Forces full refresh to get canonical ACTIVE challenge state from backend
      'challenge.activated': (data) => {
        if (eventDedup.isDuplicate('challenge.activated', data)) return;
        const id = data?.challengeId || data?._id;
        if (id) {
          // Optimistic update first — instant status change
          dispatch({ type: 'UPDATE_CHALLENGE', payload: { _id: id, status: data.status || 'ACTIVE' } });
          // Then full refresh to get enriched data (submissions, participants, canResolve)
          fetchChallenges({ cooldownMs: 0, force: true });
        }
      },

      'challenge.validated': (data) => {

        if (eventDedup.isDuplicate('challenge.validated', data)) return;
        fetchChallenges({ cooldownMs: 0, force: true });
      },

      // Phase 3.1.6: New challenge invite arrived — refresh to add to array
      'player.challenge.invite': (data) => {
        if (eventDedup.isDuplicate('player.challenge.invite', data)) return;
        fetchChallenges({ cooldownMs: 0, force: true });
      },
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
  const removeChallenge = useCallback((id) => dispatch({ type: 'REMOVE_CHALLENGE', payload: id?.toString?.() || id }), []);
  const selectedChallenge = state.challenges.find(c => c._id === state.selectedId) || null;

  return (
    <ChallengeContext.Provider value={{
      challenges: state.challenges,
      selectedChallenge,
      loading: state.loading,
      error: state.error,
      refreshChallenges: () => fetchChallenges({ force: true, cooldownMs: 0 }),
      removeChallenge,   // Phase 3.1.7.1: optimistic removal for decline/leave/cancel
      selectChallenge,
    }}>
      {children}
    </ChallengeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useChallenges = () => useContext(ChallengeContext);
