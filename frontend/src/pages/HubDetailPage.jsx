import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { MessageProvider, useMessages } from '@context/MessageContext';
import { useSocket } from '@context/SocketContext';
import { useAuth } from '@context/AuthContext';
import { eventBus } from '@systems/eventBus';
import apiService from '@services/apiService';
import './HubDetailPage.css';

// ======================================================
// HUB DETAIL PAGE — Phase D3.3.6
// Native realtime communication environment
//
// Layout: Header → Messages → Input → Sidebar (Presence+Voice)
//
// This page proves:
//   - Distributed lifecycle coordination works
//   - Replay recovery is coherent
//   - Reducers are deterministic
//   - Identity remains canonical
//   - Discord remains invisible
// ======================================================

const HubDetailPage = () => {
  const { id } = useParams();
  const [hub, setHub] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiService.get(`/hubs/${id}`)
      .then(res => {
        const hubData = res?.data || res;
        // sanitizeHub returns `id` not `_id` — normalize both
        if (hubData && !hubData._id && hubData.id) {
          hubData._id = hubData.id;
        }
        setHub(hubData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="page" id="hub-detail-page">
        <div className="hub-comm__loading"><div className="spinner" /></div>
      </div>
    );
  }

  if (!hub) {
    return (
      <div className="page" id="hub-detail-page">
        <div className="hub-comm__empty">
          <div className="hub-comm__empty-icon">🔍</div>
          <div className="hub-comm__empty-text">Hub not found</div>
        </div>
      </div>
    );
  }

  // Use hub._id (MongoDB ObjectId) for API calls, hub.auraHubId for socket rooms
  const hubMongoId = hub._id || hub.id;

  return (
    <div className="page" id="hub-detail-page">
      <MessageProvider hubId={hubMongoId}>
        <HubCommunicationLayout hub={hub} hubMongoId={hubMongoId} />
      </MessageProvider>
    </div>
  );
};

// ── Main Communication Layout ─────────────────────────
const HubCommunicationLayout = ({ hub, hubMongoId }) => {
  const { messages, loading, sendMessage, requestReplay } = useMessages();
  const { isConnected, joinHubRoom } = useSocket();
  const [presence, setPresence] = useState([]);
  const [voiceState, setVoiceState] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // ── Join hub room on mount ────────────────────────
  useEffect(() => {
    if (hub?.auraHubId && isConnected) {
      joinHubRoom(hub.auraHubId);
      // D3.3.A: Optimistic self-presence (instant UI feedback)
      setPresence(prev => {
        // Avoid duplicates
        if (prev.some(p => p.auraPlayerId === 'self')) return prev;
        return [...prev, { auraPlayerId: 'self', displayName: 'You', online: true }];
      });
    }
  }, [hub?.auraHubId, isConnected, joinHubRoom]);

  // ── Load presence ─────────────────────────────────
  useEffect(() => {
    if (!hubMongoId) return;
    apiService.get(`/hubs/${hubMongoId}/presence`)
      .then(res => setPresence(res?.data?.members || res?.members || []))
      .catch(() => {});

    apiService.get(`/hubs/${hubMongoId}/voice-state`)
      .then(res => setVoiceState(res?.data || res))
      .catch(() => {});
  }, [hubMongoId]);

  // ── Listen for presence updates ───────────────────
  useEffect(() => {
    if (!hub?.auraHubId) return;
    const unsubs = [
      eventBus.on('presence.updated', (data) => {
        const payload = data?.payload || data;
        // Match on auraHubId — this is what the socket emitter sends
        const matchesHub = payload?.auraHubId === hub.auraHubId ||
                          payload?.hubId === hub._id ||
                          payload?.hubId === hub.auraHubId;
        if (!matchesHub) return;
        setPresence(prev => {
          const filtered = prev.filter(p => p.auraPlayerId !== payload.auraPlayerId);
          if (payload.online) return [...filtered, payload];
          return filtered;
        });
      }),
      eventBus.on('voice.participant.joined', (data) => {
        const payload = data?.payload || data;
        setPresence(prev => prev.map(p =>
          p.auraPlayerId === payload.auraPlayerId ? { ...p, inVoice: true } : p
        ));
      }),
      eventBus.on('voice.participant.left', (data) => {
        const payload = data?.payload || data;
        setPresence(prev => prev.map(p =>
          p.auraPlayerId === payload.auraPlayerId ? { ...p, inVoice: false, speaking: false } : p
        ));
      }),
    ];
    return () => unsubs.forEach(fn => typeof fn === 'function' && fn());
  }, [hub?.auraHubId, hub?._id]);

  // ── Auto-scroll on new messages ───────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // ── Request replay on reconnect ───────────────────
  useEffect(() => {
    if (isConnected) requestReplay();
  }, [isConnected, requestReplay]);

  // ── Send message ──────────────────────────────────
  const handleSend = useCallback(() => {
    const val = inputValue.trim();
    if (!val) return;
    sendMessage(val);
    setInputValue('');
    inputRef.current?.focus();
  }, [inputValue, sendMessage]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="hub-comm" id="hub-communication">
      {/* ── Header ─────────────────────────────────── */}
      <div className="hub-comm__header">
        <h1><span>🏠</span> {hub.name}</h1>
        <div className="hub-comm__status">
          <span className={`dot ${isConnected ? 'dot--online' : 'dot--offline'}`} />
          {isConnected ? 'Connected' : 'Reconnecting...'}
          <span style={{ marginLeft: 8 }}>
            {presence.length} online
          </span>
        </div>
      </div>

      {/* ── Messages Panel ─────────────────────────── */}
      <div className="hub-comm__messages">
        <div className="hub-comm__messages-scroll" ref={scrollRef}>
          {loading ? (
            <div className="hub-comm__loading"><div className="spinner" /></div>
          ) : messages.length === 0 ? (
            <div className="hub-comm__empty">
              <div className="hub-comm__empty-icon">💬</div>
              <div className="hub-comm__empty-text">No messages yet. Start the conversation!</div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <MessageBubble key={msg._id || msg.tempId || i} msg={msg} />
            ))
          )}
        </div>
      </div>

      {/* ── Input ──────────────────────────────────── */}
      <div className="hub-comm__input">
        <div className="hub-comm__input-wrap">
          <input
            ref={inputRef}
            type="text"
            placeholder={`Message #${hub.name?.toLowerCase() || 'general'}...`}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={4000}
            id="hub-message-input"
          />
          <button
            className="hub-comm__send-btn"
            onClick={handleSend}
            disabled={!inputValue.trim()}
            id="hub-send-button"
          >
            Send
          </button>
        </div>
      </div>

      {/* ── Sidebar ────────────────────────────────── */}
      <div className="hub-comm__sidebar">
        {/* Voice Panel */}
        <VoicePanel hubId={hubMongoId} voiceState={voiceState} />

        {/* Online Members */}
        <h3>Online — {presence.length}</h3>
        <ul className="presence-list">
          {presence.map((p, i) => (
            <li key={p.auraPlayerId || i} className="presence-item">
              <span className="presence-item__dot" style={{ background: '#4ade80' }} />
              <span className="presence-item__name">{p.displayName || 'Player'}</span>
              {p.speaking && <span className="presence-item__speaking">🔊</span>}
              {p.inVoice && <span style={{ fontSize: '0.65rem', color: '#818cf8' }}>📞</span>}
            </li>
          ))}
          {presence.length === 0 && (
            <li className="presence-item">
              <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>No one online</span>
            </li>
          )}
        </ul>

        {/* Hub Info */}
        <h3>Hub Info</h3>
        <div style={{ padding: '6px 16px', fontSize: '0.78rem', color: '#9ca3af' }}>
          <div>Members: {hub.memberCount || 0}</div>
          <div>ID: {hub.auraHubId}</div>
        </div>
      </div>
    </div>
  );
};

// ── Message Bubble Component ──────────────────────────
const MessageBubble = ({ msg }) => {
  const classes = ['msg'];
  if (msg.pending) classes.push('msg--pending');
  if (msg.failed) classes.push('msg--failed');

  const initials = (msg.senderName || 'P').slice(0, 2).toUpperCase();
  const time = msg.createdAt || msg.issuedAt;
  const timeStr = time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className={classes.join(' ')} id={`msg-${msg._id || msg.tempId}`}>
      <div className="msg__avatar">{initials}</div>
      <div className="msg__body">
        <div className="msg__meta">
          <span className="msg__author">{msg.senderName || 'Player'}</span>
          <span className="msg__time">{timeStr}</span>
          {msg.pending && <span className="msg__badge msg__badge--sending">Sending</span>}
          {msg.failed && <span className="msg__badge msg__badge--failed">Failed</span>}
          {msg.edited && <span className="msg__badge msg__badge--edited">Edited</span>}
        </div>
        <div className="msg__content">{msg.content}</div>
      </div>
    </div>
  );
};

// ── Voice Panel Component ─────────────────────────────
const VoicePanel = ({ hubId, voiceState }) => {
  const [inVoice, setInVoice] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const participants = voiceState?.activeParticipants || [];

  const joinVoice = useCallback(async () => {
    if (!hubId) return;
    setVoiceLoading(true);
    try {
      const res = await apiService.post(`/hubs/${hubId}/voice-token`);
      if (res?.data?.token || res?.token) {
        setInVoice(true);
        console.log('[VoicePanel] 🎤 Voice token received — LiveKit ready');
        // LiveKit room connection would happen here with livekit-client
        // For now, presence tracking is the proof of lifecycle
      }
    } catch (err) {
      console.error('[VoicePanel] ❌ Voice join failed:', err.message);
    }
    setVoiceLoading(false);
  }, [hubId]);

  return (
    <div className="voice-panel">
      <div className="voice-panel__title">🎙 Voice Channel</div>
      {participants.length > 0 && (
        <ul className="presence-list" style={{ marginBottom: 6 }}>
          {participants.map((p, i) => (
            <li key={p.auraPlayerId || i} className="presence-item">
              <span className="presence-item__dot" style={{ background: p.speaking ? '#4ade80' : '#818cf8' }} />
              <span className="presence-item__name">{p.displayName || 'Player'}</span>
              {p.speaking && <span className="presence-item__speaking">Speaking</span>}
            </li>
          ))}
        </ul>
      )}
      {!inVoice ? (
        <button
          className="voice-panel__join"
          onClick={joinVoice}
          disabled={voiceLoading}
          id="voice-join-btn"
        >
          {voiceLoading ? 'Connecting...' : 'Join Voice'}
        </button>
      ) : (
        <button
          className="voice-panel__leave"
          onClick={() => setInVoice(false)}
          id="voice-leave-btn"
        >
          Leave Voice
        </button>
      )}
    </div>
  );
};

export default HubDetailPage;
