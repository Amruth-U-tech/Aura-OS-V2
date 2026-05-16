import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import playerApi from '@services/playerApi';
import socialApi from '@services/socialApi';
import hubApi from '@services/hubApi';
import { useAuth } from '@context/AuthContext';
import ImageUploadZone from '@components/upload/ImageUploadZone';
import './ProfilePage.css';

// ======================================================
// PROFILE PAGE — Phase 2.4.5
// Owner's private profile view with editing capabilities
// Phase 2.4.5: Clickable stat cards (friends list, hubs
//   list), and 7-day History section (tasks + challenges)
// ======================================================

const TRUST_TIERS = {
  UNTRUSTED: { color: '#ef4444', label: 'Untrusted', icon: '🔴' },
  NEUTRAL: { color: '#f59e0b', label: 'Neutral', icon: '🟡' },
  TRUSTED: { color: '#10b981', label: 'Trusted', icon: '🟢' },
  VERIFIED: { color: '#3b82f6', label: 'Verified', icon: '💎' },
  EXCEPTIONAL: { color: '#8b5cf6', label: 'Exceptional', icon: '👑' }
};

const PRIORITY_COLORS = {
  HIGH: '#ef4444', NORMAL: '#f59e0b', LOW: '#10b981', CRITICAL: '#dc2626'
};

const STATUS_ICONS = {
  COMPLETED: '✅', FAILED: '❌', PENDING: '⏳', EXPIRED: '⏰',
  CANCELLED: '🚫', IN_PROGRESS: '🔄', ACTIVE: '🟢', DRAFT: '📝',
  SUBMISSION: '📤', RESOLVED: '🏁', SCHEDULED: '📅'
};

const ProfilePage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [skillForm, setSkillForm] = useState({ name: '', category: 'General', certificateUrl: '' });
  const [message, setMessage] = useState(null);
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const { authReady } = useAuth();
  const navigate = useNavigate();

  // Phase 2.4.5: Drill-down popups
  const [drillDown, setDrillDown] = useState(null); // 'friends' | 'hubs' | null
  const [drillDownData, setDrillDownData] = useState([]);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  // Phase 2.4.5: History
  const [historyTab, setHistoryTab] = useState(null); // 'tasks' | 'challenges' | null
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const showMsg = (msg) => { setMessage(msg); setTimeout(() => setMessage(null), 4000); };

  const loadProfile = useCallback(async () => {
    try {
      const result = await playerApi.getMe();
      setData(result);
      setEditForm({
        displayName: result?.profile?.displayName || '',
        bio: result?.profile?.bio || '',
        avatar: result?.profile?.avatar || '',
        profileVisibility: result?.profile?.profileVisibility || {}
      });
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    loadProfile();
  }, [loadProfile, authReady]);

  const handleSaveProfile = async () => {
    setActionLoading(true);
    try {
      await playerApi.updateProfile(editForm);
      showMsg('✅ Profile updated!');
      setEditing(false);
      loadProfile();
    } catch (err) { showMsg(err?.message || 'Update failed'); }
    setActionLoading(false);
  };

  const handleAddSkill = async (e) => {
    e.preventDefault();
    if (!skillForm.name.trim()) return;
    setActionLoading(true);
    try {
      await playerApi.addSkill(skillForm);
      showMsg('✅ Skill added!');
      setSkillForm({ name: '', category: 'General', certificateUrl: '' });
      setShowSkillForm(false);
      loadProfile();
    } catch (err) { showMsg(err?.message || 'Failed to add skill'); }
    setActionLoading(false);
  };

  const handleRemoveSkill = async (index) => {
    if (!confirm('Remove this skill?')) return;
    try {
      await playerApi.removeSkill(index);
      showMsg('Skill removed');
      loadProfile();
    } catch (err) { showMsg(err?.message || 'Failed'); }
  };

  // Phase 2.4.5: Drill-down loader
  const handleStatClick = async (type) => {
    if (drillDown === type) { setDrillDown(null); return; }
    setDrillDown(type);
    setDrillDownLoading(true);
    setDrillDownData([]);
    try {
      if (type === 'friends') {
        const res = await socialApi.getFriends();
        setDrillDownData(res?.friends || []);
      } else if (type === 'hubs') {
        const res = await hubApi.getMyHubs();
        setDrillDownData(res?.hubs || []);
      }
    } catch { setDrillDownData([]); }
    setDrillDownLoading(false);
  };

  // Phase 2.4.5: History loader
  const handleHistoryTab = async (type) => {
    if (historyTab === type) { setHistoryTab(null); return; }
    setHistoryTab(type);
    setHistoryLoading(true);
    setHistoryData([]);
    try {
      const res = await playerApi.getHistory(type);
      setHistoryData(res?.history || []);
    } catch { setHistoryData([]); }
    setHistoryLoading(false);
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  if (loading) return <div className="profile-loading">Loading profile...</div>;
  if (!data) return <div className="profile-loading">Profile not found</div>;

  const { profile, trust, levelProgress } = data;
  const tier = TRUST_TIERS[trust?.tier] || TRUST_TIERS.NEUTRAL;

  const xpProgress = levelProgress?.progressPercent || 0;
  const xpIntoLevel = levelProgress?.xpIntoLevel || 0;
  const xpForLevel = levelProgress?.xpForLevel || 100;

  return (
    <div className="profile-page">
      {message && <div className="profile-toast">{message}</div>}

      {/* ── Hero Card ──────────────────────────────── */}
      <div className="profile-hero">
        <div className="profile-avatar">
          {profile?.avatar ? (
            <img src={profile.avatar} alt="avatar" className="avatar-img" />
          ) : (
            <span className="avatar-letter">{profile?.displayName?.charAt(0) || 'A'}</span>
          )}
          <span className="trust-badge" style={{ background: tier.color }}>
            {tier.icon}
          </span>
        </div>
        <div className="profile-identity">
          <h1 className="profile-name">{profile?.displayName || 'Player'}</h1>
          <div className="profile-id-row">
            <span className="profile-id">{profile?.auraPlayerId || 'AURA-PLR-...'}</span>
            <button className="btn-copy" onClick={() => {
              navigator.clipboard.writeText(profile?.auraPlayerId || '');
              showMsg('Copied to clipboard!');
            }}>📋</button>
          </div>
          {profile?.bio && <p className="profile-bio">{profile.bio}</p>}
          {profile?.email && <span className="profile-email">📧 {profile.email}</span>}
        </div>
        <button className="btn-edit" onClick={() => setEditing(!editing)}>
          {editing ? 'Cancel' : '✏️ Edit'}
        </button>
      </div>

      {/* ── Edit Form (collapsible) ────────────────── */}
      {editing && (
        <div className="edit-section">
          <input type="text" value={editForm.displayName}
            onChange={e => setEditForm({ ...editForm, displayName: e.target.value })}
            placeholder="Display Name" className="form-input" maxLength={30} />
          <textarea value={editForm.bio}
            onChange={e => setEditForm({ ...editForm, bio: e.target.value })}
            placeholder="Bio (max 200 chars)" className="form-textarea" rows={2} maxLength={200} />
          {/* Phase 2.4.3: Avatar upload via ImageUploadZone */}
          <div className="avatar-upload-section">
            <label className="form-label">Avatar</label>
            <ImageUploadZone
              purpose="avatar"
              label="📷 Upload Avatar"
              compact
              currentImage={editForm.avatar || null}
              onUploadComplete={(url) => setEditForm({ ...editForm, avatar: url })}
            />
            <input type="text" value={editForm.avatar}
              onChange={e => setEditForm({ ...editForm, avatar: e.target.value })}
              placeholder="Or paste Avatar URL" className="form-input" style={{ marginTop: '0.5rem' }} />
          </div>

          <div className="visibility-toggles">
            <h3 className="section-subtitle">Profile Visibility</h3>
            {['showStats', 'showSkills', 'showChallengeHistory', 'showHubs', 'showStreak', 'showFriends'].map(key => (
              <label key={key} className="toggle-label">
                <input type="checkbox"
                  checked={editForm.profileVisibility?.[key] !== false}
                  onChange={e => setEditForm({
                    ...editForm,
                    profileVisibility: {
                      ...editForm.profileVisibility,
                      [key]: e.target.checked
                    }
                  })} />
                <span>{key.replace('show', '').replace(/([A-Z])/g, ' $1').trim()}</span>
              </label>
            ))}
          </div>

          <button className="btn-save" onClick={handleSaveProfile} disabled={actionLoading}>
            {actionLoading ? 'Saving...' : '💾 Save Changes'}
          </button>
        </div>
      )}

      {/* ── XP & Level ─────────────────────────────── */}
      <div className="profile-section">
        <div className="xp-card">
          <div className="xp-header">
            <span className="xp-level">Level {profile?.level || 1}</span>
            <span className="xp-amount">{profile?.totalXpEarned || 0} Total XP</span>
          </div>
          <div className="xp-bar-bg">
            <div className="xp-bar-fill" style={{ width: `${xpProgress}%` }} />
          </div>
          <div className="xp-footer">
            <span className="xp-next">{xpIntoLevel} / {xpForLevel} XP</span>
            {profile?.weeklyXp > 0 && (
              <span className="xp-weekly">📊 {profile.weeklyXp} weekly XP</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Trust Score ────────────────────────────── */}
      <div className="profile-section">
        <h2 className="section-title">Trust Score</h2>
        <div className="trust-card" style={{ borderColor: tier.color }}>
          <div className="trust-score-display">
            <span className="trust-score">{trust?.trustScore ?? 50}</span>
            <span className="trust-max">/100</span>
          </div>
          <div className="trust-tier" style={{ color: tier.color }}>
            {tier.icon} {tier.label}
          </div>
          <div className="trust-stats">
            <div className="trust-stat">
              <span className="stat-value">{trust?.totalValidations || 0}</span>
              <span className="stat-label">Validations</span>
            </div>
            <div className="trust-stat">
              <span className="stat-value">{trust?.verifiedCount || 0}</span>
              <span className="stat-label">Verified</span>
            </div>
            <div className="trust-stat">
              <span className="stat-value">{(trust?.challengeCompletionRate || 0)}%</span>
              <span className="stat-label">Completion Rate</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Skills Management ──────────────────────── */}
      <div className="profile-section">
        <div className="section-header">
          <h2 className="section-title">Skills & Certificates</h2>
          <button className="btn-add-skill" onClick={() => setShowSkillForm(!showSkillForm)}>
            {showSkillForm ? '✕ Cancel' : '+ Add Skill'}
          </button>
        </div>

        {showSkillForm && (
          <form className="skill-form" onSubmit={handleAddSkill}>
            <input type="text" value={skillForm.name}
              onChange={e => setSkillForm({ ...skillForm, name: e.target.value })}
              placeholder="Skill name (e.g. React, Python)" className="form-input" required maxLength={50} />
            <div className="skill-form-row">
              <select value={skillForm.category}
                onChange={e => setSkillForm({ ...skillForm, category: e.target.value })}
                className="form-select">
                <option value="General">General</option>
                <option value="Frontend">Frontend</option>
                <option value="Backend">Backend</option>
                <option value="Design">Design</option>
                <option value="DevOps">DevOps</option>
                <option value="Data Science">Data Science</option>
                <option value="Mobile">Mobile</option>
                <option value="Other">Other</option>
              </select>
              <input type="url" value={skillForm.certificateUrl}
                onChange={e => setSkillForm({ ...skillForm, certificateUrl: e.target.value })}
                placeholder="Certificate URL (optional)" className="form-input" />
            </div>
            <button type="submit" className="btn-save" disabled={actionLoading}>
              {actionLoading ? '...' : '✅ Add Skill'}
            </button>
          </form>
        )}

        <div className="skills-grid">
          {(profile?.skills || []).length === 0 ? (
            <p className="empty-text">No skills added yet. Click + Add Skill to get started!</p>
          ) : (
            profile.skills.map((skill, i) => (
              <div key={i} className={`skill-card ${skill.verified ? 'verified' : ''}`}>
                <div className="skill-header">
                  <span className="skill-name">{skill.name}</span>
                  {skill.verified && <span className="verified-badge">✅</span>}
                </div>
                <span className="skill-category">{skill.category}</span>
                <div className="skill-meta">
                  <span className="endorsement-count">👍 {skill.endorsementCount || 0}</span>
                  {skill.hasCertificate && <span className="cert-indicator">📜</span>}
                </div>
                <button className="btn-remove-skill" onClick={() => handleRemoveSkill(skill.index ?? i)}>
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Stats Grid (Clickable) ────────────────── */}
      <div className="profile-section">
        <h2 className="section-title">Stats</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-icon">🔥</span>
            <span className="stat-value">{profile?.currentStreak || 0}</span>
            <span className="stat-label">Day Streak</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon">⚔️</span>
            <span className="stat-value">{profile?.challengeWins || 0}W/{profile?.challengeLosses || 0}L</span>
            <span className="stat-label">Challenges</span>
          </div>
          {/* Phase 2.4.5: Clickable — opens friends list */}
          <div className={`stat-card stat-clickable ${drillDown === 'friends' ? 'stat-active' : ''}`}
            onClick={() => handleStatClick('friends')}>
            <span className="stat-icon">👥</span>
            <span className="stat-value">{profile?.friendCount || 0}</span>
            <span className="stat-label">Friends ▾</span>
          </div>
          {/* Phase 2.4.5: Clickable — opens hubs list */}
          <div className={`stat-card stat-clickable ${drillDown === 'hubs' ? 'stat-active' : ''}`}
            onClick={() => handleStatClick('hubs')}>
            <span className="stat-icon">🌐</span>
            <span className="stat-value">{profile?.hubCount || 0}</span>
            <span className="stat-label">Hubs ▾</span>
          </div>
        </div>

        {/* ── Phase 2.4.5: Drill-Down Panel ────────── */}
        {drillDown && (
          <div className="drilldown-panel">
            <div className="drilldown-header">
              <h3>{drillDown === 'friends' ? '👥 Your Friends' : '🌐 Your Hubs'}</h3>
              <button className="btn-close" onClick={() => setDrillDown(null)}>✕</button>
            </div>
            {drillDownLoading ? (
              <p className="empty-text">Loading...</p>
            ) : drillDownData.length === 0 ? (
              <p className="empty-text">
                {drillDown === 'friends' 
                  ? "You haven't added any friends yet. Head to Social > Discover to find players!"
                  : "You haven't joined any hubs yet. Explore hubs to find your community!"}
              </p>
            ) : (
              <div className="drilldown-list">
                {drillDown === 'friends' && drillDownData.map((f, i) => (
                  <div key={f.userId || i} className="drilldown-item drilldown-clickable"
                    onClick={() => f.auraPlayerId && navigate(`/player/${f.auraPlayerId}`)}>
                    <div className="drilldown-avatar">
                      {f.avatar ? <img src={f.avatar} alt={f.displayName} className="avatar-thumb-sm" /> : (f.displayName?.charAt(0) || '?')}
                    </div>
                    <div className="drilldown-info">
                      <span className="drilldown-name">{f.displayName || 'Unknown'}</span>
                      <span className="drilldown-meta">Lvl {f.level || 1} • {f.xp || 0} XP</span>
                    </div>
                  </div>
                ))}
                {drillDown === 'hubs' && drillDownData.map((h, i) => (
                  <div key={h.id || i} className="drilldown-item drilldown-clickable"
                    onClick={() => navigate('/hubs')}>
                    <div className="drilldown-avatar">🌐</div>
                    <div className="drilldown-info">
                      <span className="drilldown-name">{h.name}</span>
                      <span className="drilldown-meta">
                        {h.memberCount || 1}/{h.maxMembers} members
                        {h.ownerDisplayName && ` • by ${h.ownerDisplayName}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Phase 2.4.5: History Section ──────────── */}
      <div className="profile-section">
        <h2 className="section-title">📜 History (Past 7 Days)</h2>
        <div className="history-tabs">
          <button className={`history-tab ${historyTab === 'tasks' ? 'active' : ''}`}
            onClick={() => handleHistoryTab('tasks')}>
            📋 Task History
          </button>
          <button className={`history-tab ${historyTab === 'challenges' ? 'active' : ''}`}
            onClick={() => handleHistoryTab('challenges')}>
            ⚔️ Challenge History
          </button>
        </div>

        {historyTab && (
          <div className="history-panel">
            {historyLoading ? (
              <p className="empty-text">Loading history...</p>
            ) : historyData.length === 0 ? (
              <p className="empty-text">
                No {historyTab} in the past 7 days.
              </p>
            ) : (
              <div className="history-list">
                {historyTab === 'tasks' && historyData.map((t) => (
                  <div key={t.id} className={`history-card task-card-${t.status?.toLowerCase()}`}>
                    <div className="history-card-header">
                      <span className="history-status">
                        {STATUS_ICONS[t.status] || '❓'} {t.status}
                      </span>
                      <span className="history-priority"
                        style={{ color: PRIORITY_COLORS[t.priority] || '#f59e0b' }}>
                        {t.priority}
                      </span>
                    </div>
                    <h4 className="history-title">{t.title}</h4>
                    {t.description && <p className="history-desc">{t.description}</p>}
                    <div className="history-meta">
                      <span>📅 Created: {formatDate(t.createdAt)}</span>
                      <span>⏰ Deadline: {formatDate(t.deadline)}</span>
                      {t.completedAt && <span>✅ Completed: {formatDate(t.completedAt)}</span>}
                      {t.failedAt && <span>❌ Failed: {formatDate(t.failedAt)}</span>}
                      {t.expiredAt && <span>⏰ Expired: {formatDate(t.expiredAt)}</span>}
                      {t.xpEarned > 0 && <span className="history-xp">+{t.xpEarned} XP</span>}
                    </div>
                  </div>
                ))}

                {historyTab === 'challenges' && historyData.map((c) => (
                  <div key={c.id} className={`history-card chal-card-${c.status?.toLowerCase()} ${c.isWinner ? 'chal-winner' : ''}`}>
                    <div className="history-card-header">
                      <span className="history-status">
                        {STATUS_ICONS[c.status] || '❓'} {c.status}
                      </span>
                      <span className="history-type">{c.type}</span>
                    </div>
                    <h4 className="history-title">{c.title}</h4>
                    {c.description && <p className="history-desc">{c.description}</p>}
                    <div className="history-meta">
                      <span>📅 Created: {formatDate(c.createdAt)}</span>
                      {c.activatedAt && <span>🟢 Activated: {formatDate(c.activatedAt)}</span>}
                      <span>⏰ Ends: {formatDate(c.endAt)}</span>
                      {c.resolvedAt && <span>🏁 Resolved: {formatDate(c.resolvedAt)}</span>}
                      <span>👥 {c.participantCount} participant(s)</span>
                      <span>My Role: {c.myStatus}</span>
                      {c.stakeXp > 0 && <span>💎 Stake: {c.stakeXp} XP</span>}
                    </div>
                    {c.isWinner && <div className="history-winner-badge">🏆 You Won!</div>}
                    {c.winnerName && !c.isWinner && (
                      <div className="history-winner-info">🏆 Winner: {c.winnerName}</div>
                    )}
                    {c.participants?.length > 0 && (
                      <div className="history-participants">
                        {c.participants.map((p, i) => (
                          <span key={i} className={`history-participant ${p.status?.toLowerCase()}`}>
                            {p.displayName} ({p.status})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
