import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import playerApi from '@services/playerApi';
import { eventBus } from '@systems/eventBus';
import { reconnectCoordinator } from '@systems/reconnectCoordinator';
import { eventDedup } from '@utils/eventDedup';
import { fetchOrchestrator } from '@utils/fetchOrchestrator';
import { normalizeProfile } from '@utils/stateNormalizers';
import { useAuth } from '@context/AuthContext';

// ======================================================
// PLAYER CONTEXT — Phase 3.1.3
// OWNS: xp, level, trust, profile snapshot, streak
// Single authoritative source — NO page may independently fetch /player/me
// Phase 3.1.3: Reconnect hydration delegated to ReconnectCoordinator
//   - No more independent socket:reconnected listener
//   - Registers fetchProfile as hydrator for 'player' domain
// ======================================================

const PlayerContext = createContext();

const initialState = {
  profile: null,
  loading: false,
  error: null,
  lastFetchedAt: null,
};

const playerReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: true, error: null };

    case 'SET_PROFILE': {
      const normalized = normalizeProfile(action.payload);
      // Freshness check: never overwrite a more recent fetch with a stale one
      if (state.lastFetchedAt && action.fetchedAt && action.fetchedAt < state.lastFetchedAt) {
        return state;
      }
      return {
        ...state,
        profile: normalized,
        loading: false,
        error: null,
        lastFetchedAt: action.fetchedAt || Date.now(),
      };
    }

    case 'UPDATE_XP': {
      if (!state.profile) return state;
      const { amount, balanceAfter, level } = action.payload;
      return {
        ...state,
        profile: {
          ...state.profile,
          xp: typeof balanceAfter === 'number' ? balanceAfter : state.profile.xp + (amount || 0),
          level: typeof level === 'number' ? level : state.profile.level,
        }
      };
    }

    case 'UPDATE_TRUST': {
      if (!state.profile) return state;
      const { trustScore, tier } = action.payload;
      return {
        ...state,
        profile: {
          ...state.profile,
          trustScore: typeof trustScore === 'number' ? trustScore : state.profile.trustScore,
          trustTier: tier || state.profile.trustTier,
        }
      };
    }

    case 'UPDATE_LEVEL': {
      if (!state.profile) return state;
      return {
        ...state,
        profile: {
          ...state.profile,
          level: action.payload.newLevel || state.profile.level,
        }
      };
    }

    case 'UPDATE_STREAK': {
      if (!state.profile) return state;
      return {
        ...state,
        profile: {
          ...state.profile,
          streak: typeof action.payload.streak === 'number'
            ? action.payload.streak
            : state.profile.streak,
        }
      };
    }

    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };

    default:
      return state;
  }
};

export const PlayerProvider = ({ children }) => {
  const [state, dispatch] = useReducer(playerReducer, initialState);
  const { authReady, isAuthenticated } = useAuth();
  const mountedRef = useRef(true);
  const listenersRef = useRef([]);

  // ── Orchestrated profile fetch ─────────────────────
  // Uses fetchOrchestrator to guarantee single-flight behaviour.
  // Multiple callers → only ONE real HTTP request.
  const fetchProfile = useCallback(async (options = {}) => {
    try {
      const fetchedAt = Date.now();
      const data = await fetchOrchestrator.fetch(
        'player.me',
        () => playerApi.getMe(),
        { cooldownMs: 5000, ...options }
      );
      if (data && mountedRef.current) {
        dispatch({ type: 'SET_PROFILE', payload: data?.profile || data, fetchedAt });
      }
    } catch (err) {
      if (err?.type === 'rate_limited') return; // silently skip
      if (mountedRef.current) {
        dispatch({ type: 'SET_ERROR', payload: err?.message || 'Failed to load profile' });
      }
    }
  }, []);

  // ── Initial load ───────────────────────────────
  // Phase 3.1.4: Skip if ReconnectCoordinator is handling hydration
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    if (reconnectCoordinator.isHydrating()) return; // Coordinator will handle this
    fetchProfile();
  }, [authReady, isAuthenticated, fetchProfile]);

  // ── Phase 3.1.3: Register with ReconnectCoordinator ──
  // Replaces individual socket:reconnected listener.
  // Coordinator calls this function during staged hydration Phase 1.
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    reconnectCoordinator.registerHydrator('player', () => fetchProfile({ cooldownMs: 0, force: true }));
    return () => reconnectCoordinator.unregisterHydrator('player');
  }, [authReady, isAuthenticated, fetchProfile]);

  // ── Socket event listeners (NO reconnect handler) ───
  // Phase 3.1.3: socket:reconnected is handled by ReconnectCoordinator
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;

    const handlers = {
      'player.xp.updated': (data) => {
        if (eventDedup.isDuplicate('player.xp.updated', data)) return;
        dispatch({ type: 'UPDATE_XP', payload: data });
      },
      'player.trust.updated': (data) => {
        if (eventDedup.isDuplicate('player.trust.updated', data)) return;
        dispatch({ type: 'UPDATE_TRUST', payload: data });
      },
      'player.level.up': (data) => {
        if (eventDedup.isDuplicate('player.level.up', data)) return;
        dispatch({ type: 'UPDATE_LEVEL', payload: data });
      },
      'player.streak.updated': (data) => {
        if (eventDedup.isDuplicate('player.streak.updated', data)) return;
        dispatch({ type: 'UPDATE_STREAK', payload: data });
      },
    };

    // Register all listeners, collect unsub functions
    const unsubs = Object.entries(handlers).map(([event, handler]) =>
      eventBus.on(event, handler)
    );
    listenersRef.current = unsubs;

    return () => {
      listenersRef.current.forEach(fn => typeof fn === 'function' && fn());
      listenersRef.current = [];
    };
  }, [authReady, isAuthenticated]);

  // ── Cleanup on unmount ─────────────────────────────
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const refreshProfile = useCallback(() => fetchProfile({ force: true, cooldownMs: 0 }), [fetchProfile]);

  return (
    <PlayerContext.Provider value={{
      profile: state.profile,
      loading: state.loading,
      error: state.error,
      refreshProfile,
    }}>
      {children}
    </PlayerContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const usePlayer = () => useContext(PlayerContext);
