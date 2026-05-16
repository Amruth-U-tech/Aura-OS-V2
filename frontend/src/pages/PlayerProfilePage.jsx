import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import playerApi from '@services/playerApi';
import { useAuth } from '@context/AuthContext';
import './ProfilePage.css';

// ======================================================
// PUBLIC PLAYER PROFILE PAGE — Phase 2.4.2
// Route: /player/:auraPlayerId
// Renders: public profile card with skills, stats, trust
// Owner sees: full profile with edit controls
// Others see: sanitized public profile
// ======================================================

const TRUST_TIERS = {
  UNTRUSTED: { color: '#ef4444', label: 'Untrusted', icon: '🔴' },
  NEUTRAL: { color: '#f59e0b', label: 'Neutral', icon: '🟡' },
  TRUSTED: { color: '#10b981', label: 'Trusted', icon: '🟢' },
  VERIFIED: { color: '#3b82f6', label: 'Verified', icon: '💎' },
  EXCEPTIONAL: { color: '#8b5cf6', label: 'Exceptional', icon: '👑' }
};

const PlayerProfilePage = () => {
  const { auraPlayerId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { authReady } = useAuth();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const profileData = await playerApi.getPublicProfile(auraPlayerId);
        setData(profileData);
      } catch (err) {
        setError(err?.message || 'Player not found');
      } finally {
        setLoading(false);
      }
    };
    if (auraPlayerId && authReady) load();
  }, [auraPlayerId, authReady]);

  if (loading) return <div className="profile-loading">Loading player profile...</div>;
  if (error) return <div className="profile-loading">❌ {error}</div>;
  if (!data) return <div className="profile-loading">Player not found</div>;

  const { profile, trust, isOwner, levelProgress } = data;
  const tier = TRUST_TIERS[trust?.tier] || TRUST_TIERS.NEUTRAL;

  // XP bar calculation using levelProgress from backend
  const xpProgress = levelProgress?.progressPercent || 0;
  const xpIntoLevel = levelProgress?.xpIntoLevel || 0;
  const xpForLevel = levelProgress?.xpForLevel || 100;

  return (
    <div className="profile-page">
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
          </div>
          {profile?.bio && <p className="profile-bio">{profile.bio}</p>}
          <span className="profile-joined">
            Joined {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}
          </span>
        </div>
      </div>

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
          <span className="xp-next">{xpIntoLevel} / {xpForLevel} XP to next level</span>
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
              <span className="stat-value">{trust?.exceptionalCount || 0}</span>
              <span className="stat-label">Exceptional</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Skills ─────────────────────────────────── */}
      {profile?.skills && profile.skills.length > 0 && (
        <div className="profile-section">
          <h2 className="section-title">Skills & Certificates</h2>
          <div className="skills-grid">
            {profile.skills.map((skill, i) => (
              <div key={i} className={`skill-card ${skill.verified ? 'verified' : ''}`}>
                <div className="skill-header">
                  <span className="skill-name">{skill.name}</span>
                  {skill.verified && <span className="verified-badge">✅ Verified</span>}
                </div>
                <span className="skill-category">{skill.category}</span>
                <div className="skill-meta">
                  <span className="endorsement-count">
                    👍 {skill.endorsementCount || 0} endorsements
                  </span>
                  {skill.hasCertificate && (
                    <a href={skill.certificateUrl} target="_blank" rel="noopener noreferrer"
                       className="cert-link">📜 Certificate</a>
                  )}
                </div>
                {/* Phase 2.4.4: Fixed endorsement — respects endorsedByCurrentUser */}
                {!isOwner && profile.userId && (
                  <button className={`btn-endorse ${skill.endorsedByCurrentUser ? 'endorsed' : ''}`}
                    disabled={skill.endorsedByCurrentUser}
                    onClick={async (e) => {
                      if (skill.endorsedByCurrentUser) return;
                      const btn = e.currentTarget;
                      btn.disabled = true;
                      btn.textContent = '⏳ Endorsing...';
                      try {
                        await playerApi.endorseSkill(profile.userId, i);
                        btn.textContent = '✅ Endorsed!';
                        btn.classList.add('endorsed');
                        // Update endorsement count + flag locally
                        setData(prev => {
                          if (!prev?.profile?.skills?.[i]) return prev;
                          const updatedSkills = [...prev.profile.skills];
                          updatedSkills[i] = {
                            ...updatedSkills[i],
                            endorsementCount: (updatedSkills[i].endorsementCount || 0) + 1,
                            endorsedByCurrentUser: true
                          };
                          return { ...prev, profile: { ...prev.profile, skills: updatedSkills } };
                        });
                      } catch (err) {
                        btn.textContent = '❌ ' + (err?.response?.data?.message || 'Failed');
                        setTimeout(() => { btn.textContent = '👍 Endorse'; btn.disabled = false; }, 2000);
                      }
                    }}>
                    {skill.endorsedByCurrentUser ? '✅ Endorsed' : '👍 Endorse'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Player Stats Grid ──────────────────────── */}
      <div className="profile-section">
        <h2 className="section-title">Stats</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-icon">🔥</span>
            <span className="stat-value">{profile?.streak || 0}</span>
            <span className="stat-label">Day Streak</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon">⚔️</span>
            <span className="stat-value">{profile?.challengeWins || 0}</span>
            <span className="stat-label">Wins</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon">👥</span>
            <span className="stat-value">{profile?.friendCount || 0}</span>
            <span className="stat-label">Friends</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon">🌐</span>
            <span className="stat-value">{profile?.hubCount || 0}</span>
            <span className="stat-label">Hubs</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon">🏆</span>
            <span className="stat-value">{profile?.challengesParticipated || 0}</span>
            <span className="stat-label">Challenges</span>
          </div>
          <div className="stat-card">
            <span className="stat-icon">💰</span>
            <span className="stat-value">{profile?.totalXpEarned || 0}</span>
            <span className="stat-label">Total XP</span>
          </div>
        </div>
      </div>

      {/* ── Achievements ───────────────────────────── */}
      {profile?.achievements && profile.achievements.length > 0 && (
        <div className="profile-section">
          <h2 className="section-title">Achievements</h2>
          <div className="achievements-grid">
            {profile.achievements.map((a, i) => (
              <div key={i} className="achievement-card">
                <span className="achievement-icon">{a.icon || '🏅'}</span>
                <span className="achievement-title">{a.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Navigate to own profile for editing ────── */}
      {isOwner && (
        <div className="profile-section">
          <button className="btn-edit-profile" onClick={() => navigate('/profile')}>
            ✏️ Edit Profile
          </button>
        </div>
      )}
    </div>
  );
};

export default PlayerProfilePage;
