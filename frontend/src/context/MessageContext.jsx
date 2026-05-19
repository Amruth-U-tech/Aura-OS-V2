import { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { eventBus } from '@systems/eventBus';
import hubApi from '@services/hubApi';
import apiService from '@services/apiService';

// ======================================================
// MESSAGE CONTEXT — Phase D3.3.2
// Deterministic message reconciliation + optimistic UI
//
// Owns: message state projection for the active hub
// Must NOT: become durable truth (backend owns that)
//
// Sequence discipline:
//   - Reject stale sequence (seq <= lastKnownSequence)
//   - Replace optimistic temp IDs with server IDs
//   - Dedup by _id or tempId
//   - Preserve chronological order
// ======================================================

const MessageContext = createContext();

const initialState = {
  messages: [],
  loading: false,
  error: null,
  lastSequence: 0,
  hubId: null,
};

function messageReducer(state, action) {
  switch (action.type) {
    case 'SET_HUB':
      return { ...initialState, hubId: action.payload };

    case 'SET_LOADING':
      return { ...state, loading: true };

    case 'SET_MESSAGES': {
      const msgs = action.payload || [];
      const maxSeq = msgs.reduce((max, m) => Math.max(max, m.sequence || 0), state.lastSequence);
      return { ...state, messages: _dedup(msgs), loading: false, lastSequence: maxSeq };
    }

    case 'ADD_MESSAGE': {
      const msg = action.payload;
      if (!msg) return state;

      // Reject stale sequence
      if (msg.sequence && msg.sequence <= state.lastSequence && !msg.optimistic) {
        // Check if it's a temp→server replacement
        if (msg.tempId) {
          const existingIdx = state.messages.findIndex(m => m.tempId === msg.tempId);
          if (existingIdx >= 0) {
            // Replace optimistic with server-confirmed
            const updated = [...state.messages];
            updated[existingIdx] = { ...msg, pending: false, optimistic: false };
            return { ...state, messages: updated, lastSequence: Math.max(state.lastSequence, msg.sequence) };
          }
        }
        console.log(`[MessageReducer] ⚠️ Stale sequence rejected: ${msg.sequence} <= ${state.lastSequence}`);
        return state;
      }

      // Dedup by _id
      if (msg._id && state.messages.some(m => m._id === msg._id)) return state;

      // Replace optimistic message if tempId matches
      if (msg.tempId) {
        const existingIdx = state.messages.findIndex(m => m.tempId === msg.tempId);
        if (existingIdx >= 0) {
          const updated = [...state.messages];
          updated[existingIdx] = { ...msg, pending: false, optimistic: false };
          return { ...state, messages: updated, lastSequence: Math.max(state.lastSequence, msg.sequence || 0) };
        }
      }

      return {
        ...state,
        messages: [...state.messages, msg],
        lastSequence: Math.max(state.lastSequence, msg.sequence || 0),
      };
    }

    case 'ADD_OPTIMISTIC': {
      const msg = action.payload;
      // Dedup by tempId
      if (state.messages.some(m => m.tempId === msg.tempId)) return state;
      return { ...state, messages: [...state.messages, { ...msg, pending: true, optimistic: true }] };
    }

    case 'MARK_FAILED': {
      const tempId = action.payload;
      return {
        ...state,
        messages: state.messages.map(m =>
          m.tempId === tempId ? { ...m, pending: false, failed: true } : m
        ),
      };
    }

    case 'EDIT_MESSAGE': {
      const { _id, content, editedAt } = action.payload;
      return {
        ...state,
        messages: state.messages.map(m =>
          m._id === _id ? { ...m, content, edited: true, editedAt } : m
        ),
      };
    }

    case 'DELETE_MESSAGE': {
      const { _id } = action.payload;
      return {
        ...state,
        messages: state.messages.filter(m => m._id !== _id),
      };
    }

    case 'REPLAY_MERGE': {
      const replayMsgs = action.payload || [];
      if (replayMsgs.length === 0) return state;

      const existingIds = new Set(state.messages.map(m => m._id).filter(Boolean));
      const newMsgs = replayMsgs.filter(m => m._id && !existingIds.has(m._id));
      const allMsgs = [...state.messages, ...newMsgs].sort((a, b) =>
        (a.sequence || 0) - (b.sequence || 0)
      );
      const maxSeq = allMsgs.reduce((max, m) => Math.max(max, m.sequence || 0), state.lastSequence);

      return { ...state, messages: _dedup(allMsgs), lastSequence: maxSeq };
    }

    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };

    default:
      return state;
  }
}

function _dedup(msgs) {
  const seen = new Set();
  return msgs.filter(m => {
    const key = m._id || m.tempId;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const MessageProvider = ({ children, hubId }) => {
  const [state, dispatch] = useReducer(messageReducer, { ...initialState, hubId });
  const mountedRef = useRef(true);

  // ── Set active hub ──────────────────────────────────
  useEffect(() => {
    if (hubId) dispatch({ type: 'SET_HUB', payload: hubId });
  }, [hubId]);

  // ── Load initial history ────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!hubId) return;
    dispatch({ type: 'SET_LOADING' });
    try {
      const res = await apiService.get(`/hubs/${hubId}/messages`);
      const msgs = res?.messages || res?.data?.messages || [];
      if (mountedRef.current) {
        dispatch({ type: 'SET_MESSAGES', payload: msgs });
      }
    } catch (err) {
      if (mountedRef.current) {
        dispatch({ type: 'SET_ERROR', payload: err.message });
      }
    }
  }, [hubId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Send message (optimistic) ───────────────────────
  const sendMessage = useCallback(async (content) => {
    if (!hubId || !content?.trim()) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Optimistic insert
    dispatch({
      type: 'ADD_OPTIMISTIC',
      payload: {
        tempId,
        hubId,
        content: content.trim(),
        senderId: 'self',
        senderName: 'You',
        issuedAt: new Date().toISOString(),
      },
    });

    try {
      const res = await apiService.post(`/hubs/${hubId}/messages`, { content: content.trim(), tempId });
      // Server confirmation will arrive via socket event and replace optimistic
    } catch (err) {
      dispatch({ type: 'MARK_FAILED', payload: tempId });
    }
  }, [hubId]);

  // ── Listen for socket events ────────────────────────
  useEffect(() => {
    if (!hubId) return;

    const unsubs = [
      eventBus.on('message.created', (data) => {
        const payload = data?.payload || data;
        if (payload?.hubId?.toString() !== hubId?.toString()) return;
        dispatch({ type: 'ADD_MESSAGE', payload });
      }),
      eventBus.on('message.edited', (data) => {
        const payload = data?.payload || data;
        if (payload?.hubId?.toString() !== hubId?.toString()) return;
        dispatch({ type: 'EDIT_MESSAGE', payload });
      }),
      eventBus.on('message.deleted', (data) => {
        const payload = data?.payload || data;
        if (payload?.hubId?.toString() !== hubId?.toString()) return;
        dispatch({ type: 'DELETE_MESSAGE', payload });
      }),
      eventBus.on('message.replayed', (data) => {
        const payload = data?.payload || data;
        if (payload?.hubId?.toString() !== hubId?.toString()) return;
        dispatch({ type: 'REPLAY_MERGE', payload: payload?.messages || [] });
      }),
    ];

    return () => unsubs.forEach(fn => typeof fn === 'function' && fn());
  }, [hubId]);

  // ── Replay after reconnect ──────────────────────────
  const requestReplay = useCallback(async () => {
    if (!hubId) return;
    try {
      const res = await apiService.get(`/hubs/${hubId}/messages/replay?afterSequence=${state.lastSequence}`);
      const msgs = res?.messages || res?.data?.messages || [];
      if (msgs.length > 0) dispatch({ type: 'REPLAY_MERGE', payload: msgs });
    } catch (err) {
      console.error('[MessageContext] ❌ Replay failed:', err.message);
    }
  }, [hubId, state.lastSequence]);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  return (
    <MessageContext.Provider value={{
      messages: state.messages,
      loading: state.loading,
      error: state.error,
      lastSequence: state.lastSequence,
      sendMessage,
      requestReplay,
      loadHistory,
    }}>
      {children}
    </MessageContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useMessages = () => useContext(MessageContext);
