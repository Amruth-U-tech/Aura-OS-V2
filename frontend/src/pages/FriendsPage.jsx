import React, { useState, useEffect, useCallback } from 'react';
import socialApi from '@services/socialApi';
import discoveryApi from '@services/discoveryApi';
import playerApi from '@services/playerApi';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@context/AuthContext';
import './FriendsPage.css';

// ======================================================
// FRIENDS PAGE — Phase 2.4.4
// Tabs: Friends | Requests | Sent | Discover
// Phase 2.4.4: Added "Sent" tab for outgoing request
// lifecycle, avatar rendering, and read-state consumption
// ======================================================

const FriendsPage = () => {
  const [tab, setTab] = useState('friends');
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]); // Phase 2.4.4
  const [discoveredPlayers, setDiscoveredPlayers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage] = useState(null);
  const [myId, setMyId] = useState('');
  const [myCopied, setMyCopied] = useState(false);
  const navigate = useNavigate();
  const { authReady } = useAuth();

  // Load own player ID
  useEffect(() => {
    if (!authReady) return;
    playerApi.getMe().then(data => {
      setMyId(data?.profile?.auraPlayerId || '');
    }).catch(() => {});
  }, [authReady]);

  const showMsg = (msg) => { setMessage(msg); setTimeout(() => setMessage(null), 3000); };

  const loadFriends = useCallback(async () => {
    setLoading(true);
    try {
      const data = await socialApi.getFriends();
      setFriends(data?.friends || []);
    } catch { }
    setLoading(false);
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await socialApi.getRequests();
      setRequests(data?.requests || []);
    } catch { }
    setLoading(false);
  }, []);

  // Phase 2.4.4: Load outgoing requests
  const loadSentRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await socialApi.getSentRequests();
      setSentRequests(data?.requests || []);
    } catch { }
    setLoading(false);
  }, []);

  const loadDiscovery = useCallback(async () => {
    setLoading(true);
    try {
      const data = await discoveryApi.getRandomPlayers(15);
      setDiscoveredPlayers(Array.isArray(data) ? data : []);
    } catch { setDiscoveredPlayers([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (tab === 'friends') loadFriends();
    if (tab === 'requests') loadRequests();
    if (tab === 'sent') loadSentRequests();
    if (tab === 'discover') loadDiscovery();
  }, [tab, authReady, loadFriends, loadRequests, loadSentRequests, loadDiscovery]);

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    setLoading(true);
    try {
      const data = await discoveryApi.searchPlayers(searchQuery);
      setDiscoveredPlayers(Array.isArray(data) ? data : []);
    } catch { setDiscoveredPlayers([]); }
    setLoading(false);
  };

  const handleSendRequest = async (target) => {
    setActionLoading(target);
    try {
      await socialApi.sendRequest(target);
      showMsg('Friend request sent!');
    } catch (err) {
      showMsg(err?.response?.data?.message || err?.message || 'Failed to send request');
    }
    setActionLoading(null);
  };

  const handleAccept = async (id) => {
    setActionLoading(id);
    try {
      await socialApi.acceptRequest(id);
      loadRequests();
      showMsg('Friend request accepted!');
    } catch { }
    setActionLoading(null);
  };

  const handleDecline = async (id) => {
    setActionLoading(id);
    try {
      await socialApi.declineRequest(id);
      loadRequests();
    } catch { }
    setActionLoading(null);
  };

  const handleRemove = async (userId) => {
    if (!confirm('Remove this friend?')) return;
    setActionLoading(userId);
    try {
      await socialApi.removeFriend(userId);
      loadFriends();
    } catch { }
    setActionLoading(null);
  };

  // Phase 2.4.4: Mark sent request as read (one-time consume)
  const handleMarkRead = async (id) => {
    setActionLoading(id);
    try {
      await socialApi.markRequestRead(id);
      setSentRequests(prev => prev.filter(r => r.id !== id));
      showMsg('Acknowledged!');
    } catch { }
    setActionLoading(null);
  };

  const handleCopyMyId = () => {
    navigator.clipboard.writeText(myId);
    setMyCopied(true);
    setTimeout(() => setMyCopied(false), 2000);
  };

  // Phase 2.4.4: Avatar renderer — shows actual image or fallback initial
  const renderAvatar = (player, clickable = true) => {
    const name = player?.displayName || 'Player';
    const onClick = clickable && player?.auraPlayerId
      ? () => navigate(`/player/${player.auraPlayerId}`)
      : undefined;
    return (
      <div className={`friend-avatar ${clickable ? 'friend-clickable' : ''}`}
        onClick={onClick}
        title={`View ${name}'s profile`}>
        {player?.avatar ? (
          <img src={player.avatar} alt={name} className="avatar-thumb" />
        ) : (
          name.charAt(0)
        )}
      </div>
    );
  };

  return (
    <div className="friends-page">
      <h1 className="page-title">👥 Social</h1>

      {/* ── Own Identity Display ──────────────────── */}
      {myId && (
        <div className="my-id-card">
          <span className="my-id-label">Your Player ID</span>
          <div className="my-id-row">
            <span className="my-id-value">{myId}</span>
            <button className="copy-btn" onClick={handleCopyMyId}>
              {myCopied ? '✅ Copied!' : '📋 Copy'}
            </button>
          </div>
          <span className="my-id-hint">Share this so friends can find you</span>
        </div>
      )}

      {message && <div className="friends-toast">{message}</div>}

      {/* ── Tabs ─────────────────────────────────── */}
      <div className="friends-tabs">
        <button className={`tab-btn ${tab === 'friends' ? 'active' : ''}`} onClick={() => setTab('friends')}>
          Friends {friends.length > 0 && <span className="badge-count">{friends.length}</span>}
        </button>
        <button className={`tab-btn ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>
          Requests {requests.length > 0 && <span className="badge">{requests.length}</span>}
        </button>
        {/* Phase 2.4.4: Outgoing requests tab */}
        <button className={`tab-btn ${tab === 'sent' ? 'active' : ''}`} onClick={() => setTab('sent')}>
          Sent {sentRequests.length > 0 && <span className="badge">{sentRequests.length}</span>}
        </button>
        <button className={`tab-btn ${tab === 'discover' ? 'active' : ''}`} onClick={() => setTab('discover')}>
          🔍 Discover
        </button>
      </div>

      {/* ── Friends List ─────────────────────────── */}
      {tab === 'friends' && (
        <div className="friends-list">
          {loading ? <p className="empty-text">Loading...</p> :
            friends.length === 0 ? <p className="empty-text">No friends yet. Discover players!</p> :
              friends.map((f, i) => (
                <div key={f.userId || i} className="friend-card">
                  {renderAvatar(f)}
                  <div className="friend-info friend-clickable"
                    onClick={() => f.auraPlayerId && navigate(`/player/${f.auraPlayerId}`)}>
                    <span className="friend-name">{f.displayName || 'Unknown'}</span>
                    <span className="friend-meta">
                      {f.auraPlayerId} • Lvl {f.level || 1} • {f.xp || 0} XP
                    </span>
                  </div>
                  <div className="friend-actions">
                    <button className="btn-challenge" onClick={() => navigate(`/challenges?friend=${f.auraPlayerId || f.userId}&name=${f.displayName}`)}>
                      ⚔️
                    </button>
                    <button className="btn-remove" onClick={() => handleRemove(f.userId)}
                      disabled={actionLoading === f.userId}>✕</button>
                  </div>
                </div>
              ))
          }
        </div>
      )}

      {/* ── Requests (Incoming) ────────────────────── */}
      {tab === 'requests' && (
        <div className="friends-list">
          {loading ? <p className="empty-text">Loading...</p> :
            requests.length === 0 ? <p className="empty-text">No pending requests</p> :
              requests.map((r) => (
                <div key={r.id} className="friend-card">
                  <div className="friend-avatar">📩</div>
                  <div className="friend-info">
                    <span className="friend-name">{r.senderName || 'Unknown'}</span>
                    <span className="friend-meta">
                      {r.senderAuraId || 'Player'} • Lvl {r.senderLevel || 1}
                    </span>
                    {r.message && <span className="friend-msg">{r.message}</span>}
                  </div>
                  <div className="request-actions">
                    <button className="btn-accept" onClick={() => handleAccept(r.id)}
                      disabled={actionLoading === r.id}>Accept</button>
                    <button className="btn-decline" onClick={() => handleDecline(r.id)}
                      disabled={actionLoading === r.id}>Decline</button>
                  </div>
                </div>
              ))
          }
        </div>
      )}

      {/* ── Phase 2.4.4: Sent Requests (Outgoing) ── */}
      {tab === 'sent' && (
        <div className="friends-list">
          {loading ? <p className="empty-text">Loading...</p> :
            sentRequests.length === 0 ? <p className="empty-text">No outgoing requests</p> :
              sentRequests.map((r) => (
                <div key={r.id} className={`friend-card sent-card ${r.status?.toLowerCase()}`}>
                  <div className="friend-avatar">
                    {r.receiverAvatar ? (
                      <img src={r.receiverAvatar} alt={r.receiverName} className="avatar-thumb" />
                    ) : '📤'}
                  </div>
                  <div className="friend-info">
                    <span className="friend-name">{r.receiverName || 'Unknown'}</span>
                    <span className="friend-meta">
                      {r.receiverAuraId || 'Player'} • Lvl {r.receiverLevel || 1}
                    </span>
                    <span className={`sent-status ${r.status?.toLowerCase()}`}>
                      {r.status === 'PENDING' && '⏳ Pending'}
                      {r.status === 'ACCEPTED' && '✅ Accepted!'}
                      {r.status === 'DECLINED' && '❌ Declined'}
                    </span>
                  </div>
                  {/* One-time read: dismiss accepted/declined cards */}
                  {r.status !== 'PENDING' && (
                    <button className="btn-dismiss" onClick={() => handleMarkRead(r.id)}
                      disabled={actionLoading === r.id}>
                      {actionLoading === r.id ? '...' : '✓ Got it'}
                    </button>
                  )}
                </div>
              ))
          }
        </div>
      )}

      {/* ── Discover ─────────────────────────────── */}
      {tab === 'discover' && (
        <div className="discover-section">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search by AURA-PLR-ID or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="search-input"
            />
            <button onClick={handleSearch} className="btn-search" disabled={loading}>
              {loading ? '...' : '🔍'}
            </button>
          </div>

          <div className="discover-header">
            <span className="discover-label">
              {searchQuery ? 'Search Results' : 'Discover Players'}
            </span>
            {!searchQuery && (
              <button className="btn-refresh" onClick={loadDiscovery}>🔄 Refresh</button>
            )}
          </div>

          <div className="friends-list">
            {loading ? <p className="empty-text">Loading...</p> :
              discoveredPlayers.length === 0 ? <p className="empty-text">No players found</p> :
                discoveredPlayers.map((p, i) => (
                  <div key={p.auraPlayerId || i} className="friend-card discover-card">
                    {renderAvatar(p)}
                    <div className="friend-info friend-clickable"
                      onClick={() => p.auraPlayerId && navigate(`/player/${p.auraPlayerId}`)}>
                      <span className="friend-name">{p.displayName || 'Player'}</span>
                      <span className="friend-meta">
                        {p.auraPlayerId} • Lvl {p.level || 1}
                        {p.challengeWins > 0 && ` • ${p.challengeWins} wins`}
                      </span>
                    </div>
                    <button className="btn-add"
                      onClick={() => handleSendRequest(p.auraPlayerId || p.userId)}
                      disabled={actionLoading === (p.auraPlayerId || p.userId)}>
                      {actionLoading === (p.auraPlayerId || p.userId) ? '...' : '+ Add'}
                    </button>
                  </div>
                ))
            }
          </div>
        </div>
      )}
    </div>
  );
};

export default FriendsPage;
