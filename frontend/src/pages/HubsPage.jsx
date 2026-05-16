import React, { useState, useEffect, useCallback } from 'react';
import hubApi from '@services/hubApi';
import discoveryApi from '@services/discoveryApi';
import { useAuth } from '@context/AuthContext';
import './HubsPage.css';

// ======================================================
// HUBS PAGE — Phase 2.4.1
// Tabs: My Hubs | Discover | Create
// Features: random hub discovery, search by AURA-HUB-ID,
//           visibility badges, owner names, join flow
// ======================================================

const VISIBILITY_BADGES = {
  PUBLIC: { label: 'Public', color: '#10b981', icon: '🟢' },
  INVITE_ONLY: { label: 'Invite Only', color: '#f59e0b', icon: '🔒' },
  PRIVATE: { label: 'Private', color: '#ef4444', icon: '🔴' }
};

const HubsPage = () => {
  const [tab, setTab] = useState('list');
  const [hubs, setHubs] = useState([]);
  const [discoveredHubs, setDiscoveredHubs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { authReady } = useAuth();

  const [form, setForm] = useState({ name: '', description: '', visibility: 'PUBLIC', maxMembers: 50 });

  const showMsg = (msg) => { setMessage(msg); setTimeout(() => setMessage(null), 4000); };

  const loadHubs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await hubApi.getMyHubs();
      setHubs(data?.hubs || []);
    } catch { }
    setLoading(false);
  }, []);

  const loadDiscovery = useCallback(async () => {
    setLoading(true);
    try {
      const data = await discoveryApi.getRandomHubs(15);
      setDiscoveredHubs(Array.isArray(data) ? data : []);
    } catch { setDiscoveredHubs([]); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authReady) return; // Phase 2.4.3: Auth hydration guard
    if (tab === 'list') loadHubs();
    if (tab === 'discover') loadDiscovery();
  }, [tab, authReady, loadHubs, loadDiscovery]);

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    setLoading(true);
    try {
      const data = await discoveryApi.searchHubs(searchQuery);
      setDiscoveredHubs(Array.isArray(data) ? data : []);
    } catch { setDiscoveredHubs([]); }
    setLoading(false);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setActionLoading('create');
    try {
      await hubApi.createHub(form);
      showMsg('Hub created!');
      setForm({ name: '', description: '', visibility: 'PUBLIC', maxMembers: 50 });
      setTab('list');
      loadHubs();
    } catch (err) { showMsg(err?.response?.data?.message || 'Failed'); }
    setActionLoading(null);
  };

  const handleJoin = async (id) => {
    setActionLoading(id);
    try {
      await hubApi.joinHub(id);
      showMsg('Joined hub!');
      loadDiscovery();
      loadHubs();
    } catch (err) { showMsg(err?.response?.data?.message || 'Failed to join'); }
    setActionLoading(null);
  };

  const handleLeave = async (id) => {
    if (!confirm('Leave this hub?')) return;
    setActionLoading(id);
    try {
      await hubApi.leaveHub(id);
      showMsg('Left hub');
      loadHubs();
    } catch (err) { showMsg(err?.response?.data?.message || 'Failed'); }
    setActionLoading(null);
  };

  const renderVisibilityBadge = (v) => {
    const badge = VISIBILITY_BADGES[v] || VISIBILITY_BADGES.PUBLIC;
    return (
      <span className="visibility-badge" style={{ color: badge.color, borderColor: badge.color }}>
        {badge.icon} {badge.label}
      </span>
    );
  };

  return (
    <div className="hubs-page">
      <h1 className="page-title">🌐 Hubs</h1>
      {message && <div className="hub-toast">{message}</div>}

      <div className="hub-tabs">
        <button className={`tab-btn ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
          My Hubs {hubs.length > 0 && <span className="badge-count">{hubs.length}</span>}
        </button>
        <button className={`tab-btn ${tab === 'discover' ? 'active' : ''}`} onClick={() => setTab('discover')}>
          🔍 Discover
        </button>
        <button className={`tab-btn ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>
          + Create
        </button>
      </div>

      {/* ── My Hubs ──────────────────────────────── */}
      {tab === 'list' && (
        <div className="hub-list">
          {loading ? <p className="empty-text">Loading...</p> :
            hubs.length === 0 ? <p className="empty-text">No hubs yet. Discover or create one!</p> :
              hubs.map((h, i) => (
                <div key={h.id || i} className="hub-card">
                  <div className="hub-icon">🌐</div>
                  <div className="hub-info">
                    <span className="hub-name">{h.name}</span>
                    <span className="hub-meta">
                      {h.auraHubId} • {h.memberCount || 1}/{h.maxMembers} members
                      {/* Phase 2.4.4: Show owner name */}
                      {h.ownerDisplayName && ` • by ${h.ownerDisplayName}`}
                    </span>
                    {renderVisibilityBadge(h.visibility)}
                  </div>
                  <div className="hub-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn-leave" onClick={() => handleLeave(h.id)}
                      disabled={actionLoading === h.id}>Leave</button>
                  </div>
                </div>
              ))
          }
        </div>
      )}

      {/* ── Discover ─────────────────────────────── */}
      {tab === 'discover' && (
        <div className="discover-section">
          <div className="search-bar">
            <input type="text" placeholder="Search by AURA-HUB-ID or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="search-input" />
            <button onClick={handleSearch} className="btn-search" disabled={loading}>
              {loading ? '...' : '🔍'}
            </button>
          </div>

          <div className="discover-header">
            <span className="discover-label">
              {searchQuery ? 'Search Results' : 'Discover Hubs'}
            </span>
            {!searchQuery && (
              <button className="btn-refresh" onClick={loadDiscovery}>🔄 Refresh</button>
            )}
          </div>

          <div className="hub-list">
            {loading ? <p className="empty-text">Loading...</p> :
              discoveredHubs.length === 0 ? <p className="empty-text">No hubs found</p> :
                discoveredHubs.map((h, i) => (
                  <div key={h.auraHubId || i} className="hub-card discover-hub">
                    <div className="hub-icon">🌐</div>
                    <div className="hub-info">
                      <span className="hub-name">{h.name}</span>
                      <span className="hub-meta">
                        {h.auraHubId} • {h.memberCount}/{h.maxMembers} members • by {h.ownerDisplayName || h.ownerName}
                      </span>
                      {renderVisibilityBadge(h.visibility)}
                    </div>
                    <button className="btn-join" onClick={() => handleJoin(h.id)}
                      disabled={actionLoading === h.id}>
                      {actionLoading === h.id ? '...' : h.visibility === 'PUBLIC' ? 'Join' : 'Request'}
                    </button>
                  </div>
                ))
            }
          </div>
        </div>
      )}

      {/* ── Create ───────────────────────────────── */}
      {tab === 'create' && (
        <form className="create-form" onSubmit={handleCreate}>
          <input type="text" placeholder="Hub name" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="form-input" required />
          <textarea placeholder="Description (optional)" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="form-textarea" rows={3} />
          <div className="form-row">
            <select value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value })}
              className="form-select">
              <option value="PUBLIC">🟢 Public — anyone can join</option>
              <option value="INVITE_ONLY">🔒 Invite Only</option>
              <option value="PRIVATE">🔴 Private — hidden</option>
            </select>
            <input type="number" placeholder="Max members" value={form.maxMembers} min={2} max={500}
              onChange={(e) => setForm({ ...form, maxMembers: parseInt(e.target.value) || 50 })}
              className="form-input" style={{ width: '140px' }} />
          </div>
          <button type="submit" className="btn-create" disabled={actionLoading === 'create'}>
            {actionLoading === 'create' ? 'Creating...' : '🌐 Create Hub'}
          </button>
        </form>
      )}
    </div>
  );
};

export default HubsPage;
