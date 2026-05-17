import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import playerApi from '@services/playerApi';
import { fetchOrchestrator } from '@utils/fetchOrchestrator';
import { useAuth } from '@context/AuthContext';
import './LeaderboardPage.css';

// ======================================================
// LEADERBOARD PAGE — Phase 3.1.3 (Orchestrated)
// Real leaderboard from /api/v1/player/leaderboard
//
// Phase 3.1.3:
//   - Fetches routed through fetchOrchestrator
//   - Filter-specific cache keys prevent stale data
//   - 10s cooldown (leaderboard is low-priority)
// ======================================================

const TIER_ICONS = {
  UNTRUSTED: '🔴', NEUTRAL: '🟡', TRUSTED: '🟢', VERIFIED: '💎', EXCEPTIONAL: '👑'
};

const LeaderboardPage = () => {
  const navigate = useNavigate();
  const { authReady } = useAuth();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('xp');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [weekly, setWeekly] = useState(false);
  const [isWeekly, setIsWeekly] = useState(false);

  const loadLeaderboard = useCallback(async () => {
    if (!authReady) return;
    setLoading(true);
    try {
      const data = await fetchOrchestrator.fetch(
        `leaderboard.${sortBy}.${weekly ? 'weekly' : 'all'}.p${page}`,
        () => playerApi.getLeaderboard({ page, limit: 20, sortBy, weekly }),
        { cooldownMs: 10000 }
      );
      if (data) {
        setPlayers(Array.isArray(data?.profiles) ? data.profiles : []);
        setTotalPages(data?.pagination?.totalPages || 1);
        setIsWeekly(data?.isWeekly || false);
      }
    } catch (err) {
      if (err?.type !== 'rate_limited') {
        console.warn('[Leaderboard] Failed to load:', err?.message);
      }
    }
    setLoading(false);
  }, [page, sortBy, weekly, authReady]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLeaderboard();
  }, [loadLeaderboard]);

  const getRankBadge = (idx) => {
    const rank = (page - 1) * 20 + idx + 1;
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  return (
    <div className="leaderboard-page">
      <h1 className="page-title">🏆 Leaderboard</h1>

      <div className="lb-controls">
        <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
          className="lb-select">
          <option value="xp">Sort by XP</option>
          <option value="level">Sort by Level</option>
          <option value="trustScore">Sort by Trust</option>
        </select>
        <button className={`lb-toggle ${weekly ? 'active' : ''}`}
          onClick={() => { setWeekly(!weekly); setPage(1); }}>
          {weekly ? '📅 Weekly' : '🏆 All-Time'}
        </button>
      </div>

      <div className="lb-list">
        {loading ? <p className="empty-text">Loading...</p> :
          (Array.isArray(players) ? players : []).length === 0 ? <p className="empty-text">No players yet</p> :
            (Array.isArray(players) ? players : []).map((p, idx) => (
              <div key={p.auraPlayerId || idx} className={`lb-row ${idx < 3 ? 'lb-top' : ''}`}>
                <span className="lb-rank">{getRankBadge(idx)}</span>
                <div className="lb-avatar lb-clickable"
                  onClick={() => p.auraPlayerId && navigate(`/player/${p.auraPlayerId}`)}
                  title={`View ${p.displayName || 'Player'}'s profile`}
                >{p.displayName?.charAt(0) || '?'}</div>
                <div className="lb-info lb-clickable"
                  onClick={() => p.auraPlayerId && navigate(`/player/${p.auraPlayerId}`)}>
                  <span className="lb-name">{p.displayName || 'Player'}</span>
                  <span className="lb-sub">Lvl {p.level || 1} • {TIER_ICONS[p.trustTier] || '🟡'}</span>
                </div>
                <div className="lb-stats">
                  <span className="lb-xp">{isWeekly ? (p.weeklyXp || 0) : (p.xp || 0)} XP</span>
                  {isWeekly && <span className="lb-weekly-tag">📅 weekly</span>}
                </div>
              </div>
            ))
        }
      </div>

      {totalPages > 1 && (
        <div className="lb-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="lb-page-btn">← Prev</button>
          <span className="lb-page-info">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="lb-page-btn">Next →</button>
        </div>
      )}
    </div>
  );
};

export default LeaderboardPage;
