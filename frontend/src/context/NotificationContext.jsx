import { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import notificationApi from '@services/notificationApi';
import { useAuth } from '@context/AuthContext';
import { eventBus } from '@systems/eventBus';
import { reconnectCoordinator } from '@systems/reconnectCoordinator';
import { eventDedup } from '@utils/eventDedup';

// ======================================================
// NOTIFICATION CONTEXT — Phase N1
// Persistent distributed communication state
//
// Owns:
//   - Notification state (list, unread count)
//   - Realtime subscription (notification.created events)
//   - Read/acknowledge mutations
//   - Reconnect hydration
//   - Cross-tab synchronization
//
// Must NOT: contain domain logic, manage socket transport
// ======================================================

const NotificationContext = createContext({
  notifications: [],
  unreadCount: 0,
  loading: false,
  fetchNotifications: () => {},
  markRead: () => {},
  markAllRead: () => {},
  acknowledge: () => {},
});

// ── Reducer ──────────────────────────────────────────
// Phase N2: Sequence-aware — rejects stale events, tracks lastSequence
const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    case 'SET_NOTIFICATIONS': {
      const notifications = action.payload.notifications || [];
      // Phase N2: Track max sequence from hydration for stale rejection
      const maxSeq = notifications.reduce((max, n) =>
        (n.sequence && n.sequence > max) ? n.sequence : max, state.lastSequence);
      return {
        ...state,
        notifications,
        pagination: action.payload.pagination || null,
        lastSequence: maxSeq,
        loading: false
      };
    }

    case 'SET_UNREAD_COUNT':
      return { ...state, unreadCount: typeof action.payload === 'number' ? action.payload : 0 };

    case 'ADD_NOTIFICATION': {
      const n = action.payload;
      if (!n?._id) return state;
      // Prevent duplicate insertion
      const exists = state.notifications.some(x => x._id === n._id);
      if (exists) return state;
      // Phase N2: Reject stale events by sequence
      const incomingSeq = action.sequence || n.sequence || 0;
      if (incomingSeq > 0 && incomingSeq <= state.lastSequence) {
        console.info(`[NotificationContext] Stale event rejected (seq ${incomingSeq} <= ${state.lastSequence})`);
        return state;
      }
      return {
        ...state,
        notifications: [n, ...state.notifications],
        unreadCount: state.unreadCount + (n.read ? 0 : 1),
        lastSequence: incomingSeq > state.lastSequence ? incomingSeq : state.lastSequence
      };
    }

    case 'MARK_READ': {
      const id = action.payload;
      let delta = 0;
      const notifications = state.notifications.map(n => {
        if (n._id === id && !n.read) {
          delta = -1;
          return { ...n, read: true, readAt: new Date().toISOString() };
        }
        return n;
      });
      return {
        ...state,
        notifications,
        unreadCount: Math.max(0, state.unreadCount + delta)
      };
    }

    case 'MARK_ALL_READ': {
      const notifications = state.notifications.map(n =>
        n.read ? n : { ...n, read: true, readAt: new Date().toISOString() }
      );
      return { ...state, notifications, unreadCount: 0 };
    }

    case 'ACKNOWLEDGE': {
      const id = action.payload;
      let delta = 0;
      const notifications = state.notifications.map(n => {
        if (n._id === id) {
          if (!n.read) delta = -1;
          return { ...n, acknowledged: true, acknowledgedAt: new Date().toISOString(), read: true };
        }
        return n;
      });
      return {
        ...state,
        notifications,
        unreadCount: Math.max(0, state.unreadCount + delta)
      };
    }

    case 'REMOVE_NOTIFICATION': {
      const id = action.payload;
      const target = state.notifications.find(n => n._id === id);
      const delta = target && !target.read ? -1 : 0;
      return {
        ...state,
        notifications: state.notifications.filter(n => n._id !== id),
        unreadCount: Math.max(0, state.unreadCount + delta)
      };
    }

    default:
      return state;
  }
};

const initialState = {
  notifications: [],
  unreadCount: 0,
  loading: false,
  pagination: null,
  lastSequence: 0  // Phase N2: Deterministic ordering
};

// ── Provider ─────────────────────────────────────────
export const NotificationProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { isAuthenticated, authReady } = useAuth();
  const listenersRef = useRef([]);
  const lastFetchRef = useRef(0);
  const FETCH_COOLDOWN = 3000;

  // ── Fetch notifications from API ───────────────────
  const fetchNotifications = useCallback(async (opts = {}) => {
    const now = Date.now();
    if (!opts.force && now - lastFetchRef.current < FETCH_COOLDOWN) return;
    lastFetchRef.current = now;

    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const result = await notificationApi.getNotifications({
        page: opts.page || 1,
        limit: opts.limit || 30,
        category: opts.category || null
      });
      dispatch({ type: 'SET_NOTIFICATIONS', payload: result });
    } catch (err) {
      console.warn('[NotificationContext] Fetch failed:', err?.message);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // ── Fetch unread count ─────────────────────────────
  const fetchUnreadCount = useCallback(async () => {
    try {
      const result = await notificationApi.getUnreadCount();
      dispatch({ type: 'SET_UNREAD_COUNT', payload: result?.count || 0 });
    } catch {
      // Non-fatal
    }
  }, []);

  // ── Mark as read ───────────────────────────────────
  const markRead = useCallback(async (id) => {
    dispatch({ type: 'MARK_READ', payload: id });
    try {
      await notificationApi.markRead(id);
    } catch {
      // Optimistic update — if API fails, next fetch corrects
    }
  }, []);

  // ── Mark all read ──────────────────────────────────
  const markAllRead = useCallback(async () => {
    dispatch({ type: 'MARK_ALL_READ' });
    try {
      await notificationApi.markAllRead();
    } catch {
      // Optimistic — next fetch corrects
    }
  }, []);

  // ── Acknowledge ────────────────────────────────────
  const acknowledge = useCallback(async (id) => {
    dispatch({ type: 'ACKNOWLEDGE', payload: id });
    try {
      await notificationApi.acknowledge(id);
    } catch {
      // Optimistic — next fetch corrects
    }
  }, []);

  // ── Initial fetch on auth ──────────────────────────
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    fetchNotifications({ force: true });
    fetchUnreadCount();
  }, [authReady, isAuthenticated, fetchNotifications, fetchUnreadCount]);

  // ── Reconnect hydration ────────────────────────────
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    const softHydrate = async () => {
      await fetchNotifications({ force: true });
      await fetchUnreadCount();
    };
    reconnectCoordinator.registerHydrator('notifications', softHydrate);
    return () => reconnectCoordinator.unregisterHydrator('notifications');
  }, [authReady, isAuthenticated, fetchNotifications, fetchUnreadCount]);

  // ── Socket event listeners ─────────────────────────
  // Phase N1.1: Full cross-tab sync for notification lifecycle
  useEffect(() => {
    if (!authReady || !isAuthenticated) return;

    const handlers = {
      // New notification arrives
      'notification.created': (data) => {
        if (eventDedup.isDuplicate('notification.created', data)) return;
        const n = data?.notification;
        if (n?._id) {
          // Phase N2: Pass sequence from envelope for deterministic ordering
          dispatch({ type: 'ADD_NOTIFICATION', payload: n, sequence: data.sequence || n.sequence || 0 });
        }
      },

      // Phase N1.1: Cross-tab read sync
      'notification.read': (data) => {
        if (!data?.notificationId) return;
        if (eventDedup.isDuplicate('notification.read', data)) return;
        dispatch({ type: 'MARK_READ', payload: data.notificationId });
      },

      // Phase N1.1: Cross-tab mark-all-read sync
      'notification.read-all': (data) => {
        if (eventDedup.isDuplicate('notification.read-all', data)) return;
        dispatch({ type: 'MARK_ALL_READ' });
      },

      // Phase N1.1: Cross-tab acknowledge sync — CRITICAL for dismiss persistence
      'notification.acknowledged': (data) => {
        if (!data?.notificationId) return;
        if (eventDedup.isDuplicate('notification.acknowledged', data)) return;
        dispatch({ type: 'ACKNOWLEDGE', payload: data.notificationId });
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
  }, [authReady, isAuthenticated]);

  return (
    <NotificationContext.Provider value={{
      notifications: state.notifications,
      unreadCount: state.unreadCount,
      loading: state.loading,
      pagination: state.pagination,
      fetchNotifications,
      fetchUnreadCount,
      markRead,
      markAllRead,
      acknowledge,
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useNotifications = () => useContext(NotificationContext);
