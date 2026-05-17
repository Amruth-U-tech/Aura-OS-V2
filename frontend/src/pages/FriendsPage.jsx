import { useState, useEffect, useCallback } from 'react';
import socialApi from '@services/socialApi';
import discoveryApi from '@services/discoveryApi';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@context/AuthContext';
import { useSocial } from '@context/SocialContext';
import { usePlayer } from '@context/PlayerContext';
import './FriendsPage.css';

// ======================================================
// FRIENDS PAGE — Phase 3.1.2 (Hardened)
// Tabs: Friends | Requests | Sent | Discover
//
// Ownership:
//   - SocialContext OWNS: friends, incomingRequests, sentRequests
//   - PlayerContext OWNS: player profile (auraPlayerId)
//   - This page CONSUMES only — never fetches domain data directly
//
// Phase 3.1.2 fixes:
//   - r._id used everywhere (normalizer guarantee)
//   - playerApi.getMe() removed — uses PlayerContext
//   - Duplicate request guard on handleSendRequest
//   - All catch blocks log warnings
// ======================================================

const FriendsPage = () => {
  const [tab, setTab] = useState('friends');
  const [discoveredPlayers, setDiscoveredPlayers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage] = useState(null);
  const [myCopied, setMyCopied] = useState(false);
  const navigate = useNavigate();
  const { authReady } = useAuth();

  // Phase 3.1.2: Consume from contexts — never fetch directly
  const { friends, incomingRequests: requests, sentRequests, refreshFriends, refreshIncoming, refreshSent } = useSocial();
  const { profile } = usePlayer();

  // Phase 3.1.2: Player ID from context (not from direct API call)
  const myId = profile?.auraPlayerId || '';

  const showMsg = (msg) => { setMessage(msg); setTimeout(() => setMessage(null), 3000); };

  const loadDiscovery = useCallback(async () => {
    setLoading(true);
    try {
      const data = await discoveryApi.getRandomPlayers(15);
      setDiscoveredPlayers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('[Social] Discovery failed:', err?.message);
      setDiscoveredPlayers([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === 'discover') void loadDiscovery();
  }, [tab, authReady, loadDiscovery]);

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    setLoading(true);
    try {
      const data = await discoveryApi.searchPlayers(searchQuery);
      setDiscoveredPlayers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('[Social] Search failed:', err?.message);
      setDiscoveredPlayers([]);
    }
    setLoading(false);
  };

  // Phase 3.1.2: Guard against duplicate sends + 409 handling
  const handleSendRequest = async (target) => {
    if (!target) {
      showMsg('Cannot send request: invalid target');
      return;
    }
    if (actionLoading) return; // Prevent double-click
    setActionLoading(target);
    try {
      await socialApi.sendRequest(target);
      showMsg('Friend request sent!');
      refreshSent(); // Refresh outgoing list
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status === 409) {
        showMsg('Friend request already sent to this player.');
      } else {
        showMsg(err?.response?.data?.message || err?.message || 'Failed to send request');
      }
    }
    setActionLoading(null);
  };

  // Phase 3.1.4: CRITICAL — validate ObjectId format before accept
  // Temp IDs (rt-*) must NEVER reach the backend
  const isValidObjectId = (id) => /^[a-f\d]{24}$/i.test(id);

  const handleAccept = async (requestId) => {
    if (!requestId) {
      console.warn('[Social] Accept failed: missing request ID');
      showMsg('Cannot accept: missing request ID');
      return;
    }
    if (!isValidObjectId(requestId)) {
      console.warn('[Social] Accept blocked: invalid ID format:', requestId);
      showMsg('Cannot accept: syncing with server...');
      // Refresh to get real IDs from backend
      refreshIncoming();
      return;
    }
    setActionLoading(requestId);
    try {
      await socialApi.acceptRequest(requestId);
      refreshIncoming();
      refreshFriends();
      showMsg('Friend request accepted!');
    } catch (err) {
      const status = err?.status || err?.response?.status;
      if (status === 409) {
        showMsg('Already friends!');
        refreshIncoming();
        refreshFriends();
      } else if (status === 404) {
        showMsg('Request no longer exists');
        refreshIncoming();
      } else {
        console.warn('[Social] Accept failed:', err?.message);
        showMsg(err?.response?.data?.message || err?.message || 'Failed to accept request');
      }
    }
    setActionLoading(null);
  };

  const handleDecline = async (requestId) => {
    if (!requestId) return;
    if (!isValidObjectId(requestId)) {
      console.warn('[Social] Decline blocked: invalid ID format:', requestId);
      refreshIncoming();
      return;
    }
    setActionLoading(requestId);
    try {
      await socialApi.declineRequest(requestId);
      refreshIncoming();
    } catch (err) {
      console.warn('[Social] Decline failed:', err?.message);
      refreshIncoming(); // Refresh to remove stale request from UI
    }
    setActionLoading(null);
  };

  const handleRemove = async (userId) => {
    if (!userId) return;
    if (!confirm('Remove this friend?')) return;
    setActionLoading(userId);
    try {
      await socialApi.removeFriend(userId);
      refreshFriends();
      refreshSent(); // Phase 3.1.4: old requests cleaned up on backend
      showMsg('Friend removed');
    } catch (err) {
      console.warn('[Social] Remove failed:', err?.message);
      showMsg(err?.response?.data?.message || err?.message || 'Failed to remove friend');
    }
    setActionLoading(null);
  };

  // Phase 2.4.4: Mark sent request as read
  const handleMarkRead = async (requestId) => {
    if (!requestId) return;
    setActionLoading(requestId);
    try {
      await socialApi.markRequestRead(requestId);
      refreshSent();
      showMsg('Acknowledged!');
    } catch (err) {
      console.warn('[Social] MarkRead failed:', err?.message);
    }
    setActionLoading(null);
  };

  const handleCopyMyId = () => {
    navigator.clipboard.writeText(myId);
    setMyCopied(true);
    setTimeout(() => setMyCopied(false), 2000);
  };

  // Phase 2.4.4: Avatar renderer
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
          Friends {(Array.isArray(friends) ? friends : []).length > 0 && <span className="badge-count">{friends.length}</span>}
        </button>
        <button className={`tab-btn ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>
          Requests {(Array.isArray(requests) ? requests : []).length > 0 && <span className="badge">{requests.length}</span>}
        </button>
        <button className={`tab-btn ${tab === 'sent' ? 'active' : ''}`} onClick={() => setTab('sent')}>
          Sent {(Array.isArray(sentRequests) ? sentRequests : []).length > 0 && <span className="badge">{sentRequests.length}</span>}
        </button>
        <button className={`tab-btn ${tab === 'discover' ? 'active' : ''}`} onClick={() => setTab('discover')}>
          🔍 Discover
        </button>
      </div>

      {/* ── Friends List ─────────────────────────── */}
      {tab === 'friends' && (
        <div className="friends-list">
          {loading ? <p className="empty-text">Loading...</p> :
            (Array.isArray(friends) ? friends : []).length === 0 ? <p className="empty-text">No friends yet. Discover players!</p> :
              (Array.isArray(friends) ? friends : []).map((f, i) => (
                <div key={f.friendId || f._id || i} className="friend-card">
                  {renderAvatar(f)}
                  <div className="friend-info friend-clickable"
                    onClick={() => f.auraPlayerId && navigate(`/player/${f.auraPlayerId}`)}>
                    <span className="friend-name">{f.displayName || 'Unknown'}</span>
                    <span className="friend-meta">
                      {f.auraPlayerId} • Lvl {f.level || 1} • {f.xp || 0} XP
                    </span>
                  </div>
                  <div className="friend-actions">
                    <button className="btn-challenge" onClick={() => navigate(`/challenges?friend=${f.auraPlayerId || f.friendId}&name=${f.displayName}`)}>
                      ⚔️
                    </button>
                    <button className="btn-remove" onClick={() => handleRemove(f.friendId)}
                      disabled={actionLoading === f.friendId}>✕</button>
                  </div>
                </div>
              ))
          }
        </div>
      )}

      {/* ── Requests (Incoming) ────────────────────── */}
      {/* CRITICAL: use r._id for all API calls — normalizer guarantees _id exists */}
      {tab === 'requests' && (
        <div className="friends-list">
          {loading ? <p className="empty-text">Loading...</p> :
            (Array.isArray(requests) ? requests : []).length === 0 ? <p className="empty-text">No pending requests</p> :
              (Array.isArray(requests) ? requests : []).map((r) => (
                <div key={r._id} className="friend-card">
                  <div className="friend-avatar">📩</div>
                  <div className="friend-info">
                    <span className="friend-name">{r.senderName || 'Unknown'}</span>
                    <span className="friend-meta">
                      {r.senderAuraId || 'Player'} • Lvl {r.senderLevel || 1}
                    </span>
                    {r.message && <span className="friend-msg">{r.message}</span>}
                  </div>
                  <div className="request-actions">
                    <button className="btn-accept" onClick={() => handleAccept(r._id)}
                      disabled={actionLoading === r._id}>Accept</button>
                    <button className="btn-decline" onClick={() => handleDecline(r._id)}
                      disabled={actionLoading === r._id}>Decline</button>
                  </div>
                </div>
              ))
          }
        </div>
      )}

      {/* ── Sent Requests (Outgoing) ─────────────── */}
      {tab === 'sent' && (
        <div className="friends-list">
          {loading ? <p className="empty-text">Loading...</p> :
            (Array.isArray(sentRequests) ? sentRequests : []).length === 0 ? <p className="empty-text">No outgoing requests</p> :
              (Array.isArray(sentRequests) ? sentRequests : []).map((r) => (
                <div key={r._id} className={`friend-card sent-card ${r.status?.toLowerCase()}`}>
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
                  {/* Dismiss non-pending cards */}
                  {r.status !== 'PENDING' && (
                    <button className="btn-dismiss" onClick={() => handleMarkRead(r._id)}
                      disabled={actionLoading === r._id}>
                      {actionLoading === r._id ? '...' : '✓ Got it'}
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
              (Array.isArray(discoveredPlayers) ? discoveredPlayers : []).length === 0 ? <p className="empty-text">No players found</p> :
                (Array.isArray(discoveredPlayers) ? discoveredPlayers : []).map((p, i) => (
                  <div key={p.auraPlayerId || p._id || i} className="friend-card discover-card">
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
