import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import playerApi from '@services/playerApi';
import { useAuth } from '@context/AuthContext';
import './LeaderboardPage.css';

// ======================================================
// LEADERBOARD PAGE — Phase 2.4
// Real leaderboard from /api/v1/player/leaderboard
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

  useEffect(() => {
    if (!authReady) return; // Phase 2.4.3: Auth hydration guard
    const load = async () => {
      setLoading(true);
      try {
        const data = await playerApi.getLeaderboard({ page, limit: 20, sortBy, weekly });
        setPlayers(data?.profiles || []);
        setTotalPages(data?.pagination?.totalPages || 1);
        setIsWeekly(data?.isWeekly || false);
      } catch { }
      setLoading(false);
    };
    load();
  }, [page, sortBy, weekly, authReady]);

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
          players.length === 0 ? <p className="empty-text">No players yet</p> :
            players.map((p, idx) => (
              <div key={p.auraPlayerId || idx} className={`lb-row ${idx < 3 ? 'lb-top' : ''}`}>
                <span className="lb-rank">{getRankBadge(idx)}</span>
                {/* Phase 2.4.3: Click avatar/name to navigate to public profile */}
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
