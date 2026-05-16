import React, { useState, useEffect, useCallback } from 'react';
import challengeApi from '@services/challengeApi';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@context/AuthContext';
import ImageUploadZone from '@components/upload/ImageUploadZone';
import './ChallengesPage.css';

// ======================================================
// CHALLENGES PAGE — Phase 2.4.1
// Tabs: My Challenges | Create
// Distinguishes: Friend 1v1 (ONE-TO-ONE) vs Hub (ONE-TO-MANY)
// Supports: friend challenge routing from Friends page
// ======================================================

const STATUS_COLORS = {
  DRAFT: '#94a3b8', SCHEDULED: '#6366f1', PENDING: '#f59e0b', ACTIVE: '#10b981',
  SUBMISSION: '#3b82f6', WAITING_FOR_PARTICIPANTS: '#f97316', LOCKED: '#8b5cf6',
  RESOLUTION: '#6366f1', COMPLETED: '#22c55e', CANCELLED: '#ef4444', EXPIRED: '#64748b'
};

const ROUTING_LABELS = {
  ONE_TO_ONE: { label: '👤 Direct', color: '#f59e0b' },
  ONE_TO_MANY: { label: '👥 Hub', color: '#10b981' }
};

const ChallengesPage = () => {
  const [searchParams] = useSearchParams();
  const friendId = searchParams.get('friend');
  const friendName = searchParams.get('name');

  const [tab, setTab] = useState(friendId ? 'create' : 'list');
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage] = useState(null);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [proofText, setProofText] = useState('');
  const [proofImageUrls, setProofImageUrls] = useState([]); // Phase 2.4.3: proof images
  const [validationResult, setValidationResult] = useState(null); // Phase 2.4.3: AI result
  const { authReady } = useAuth();

  const [form, setForm] = useState({
    title: friendName ? `Challenge for ${friendName}` : '',
    description: '',
    type: friendId ? 'FRIEND_1V1' : 'FRIEND_1V1',
    targetFriendId: friendId || '',
    stakeXp: 25,
    stakeType: 'XP',
    endAt: '', // Phase 2.4.2: mandatory deadline
  });

  const loadChallenges = useCallback(async () => {
    setLoading(true);
    try {
      const data = await challengeApi.getMyChallenges();
      setChallenges(data?.challenges || []);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authReady) return; // Phase 2.4.3: Auth hydration guard
    loadChallenges();
  }, [loadChallenges, authReady]);

  const showMsg = (msg) => { setMessage(msg); setTimeout(() => setMessage(null), 4000); };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setActionLoading('create');
    try {
      await challengeApi.createChallenge(form);
      showMsg('Challenge created!');
      setForm({ title: '', description: '', type: 'FRIEND_1V1', targetFriendId: '', stakeXp: 25, stakeType: 'XP', endAt: '' });
      setTab('list');
      loadChallenges();
    } catch (err) { showMsg(err?.response?.data?.message || 'Failed to create'); }
    setActionLoading(null);
  };

  const handleActivate = async (id) => {
    setActionLoading(id);
    try {
      await challengeApi.activateChallenge(id);
      showMsg('Challenge activated!');
      loadChallenges();
    } catch (err) { showMsg(err?.response?.data?.message || 'Failed'); }
    setActionLoading(null);
  };

  const handleSubmitProof = async (id) => {
    if (!proofText.trim() && proofImageUrls.length === 0) return;
    setActionLoading(id);
    setValidationResult(null);
    try {
      const result = await challengeApi.submitProof(id, {
        proofText,
        proofImageUrls // Phase 2.4.3: include uploaded image URLs
      });
      const validation = result?.validation;
      // Phase 2.4.3: Show AI validation feedback
      if (validation) {
        setValidationResult(validation);
        const score = validation.validScore;
        showMsg(score >= 50
          ? `✅ Proof verified! Score: ${score}/100`
          : `❌ Proof rejected. Score: ${score}/100`);
      } else {
        showMsg('Proof submitted!');
      }
      setProofText('');
      setProofImageUrls([]);
      loadChallenges();
    } catch (err) { showMsg(err?.response?.data?.message || err?.message || 'Failed'); }
    setActionLoading(null);
  };

  const handleResolve = async (id) => {
    setActionLoading(id);
    try {
      const result = await challengeApi.resolveChallenge(id);
      showMsg(result?.winnerId ? `Winner determined! XP distributed.` : 'Challenge resolved — no winner.');
      loadChallenges();
    } catch (err) { showMsg(err?.response?.data?.message || 'Failed'); }
    setActionLoading(null);
  };

  const handleCancel = async (id) => {
    if (!confirm('Cancel this challenge?')) return;
    setActionLoading(id);
    try {
      await challengeApi.cancelChallenge(id);
      showMsg('Challenge cancelled');
      loadChallenges();
    } catch (err) { showMsg(err?.response?.data?.message || 'Failed'); }
    setActionLoading(null);
  };

  return (
    <div className="challenges-page">
      <h1 className="page-title">⚔️ Challenges</h1>
      {message && <div className="challenge-toast">{message}</div>}

      <div className="challenge-tabs">
        <button className={`tab-btn ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
          My Challenges
        </button>
        <button className={`tab-btn ${tab === 'create' ? 'active' : ''}`} onClick={() => setTab('create')}>
          + Create
        </button>
      </div>

      {/* ── Challenge List ──────────────────────── */}
      {tab === 'list' && (
        <div className="challenge-list">
          {loading ? <p className="empty-text">Loading...</p> :
            challenges.length === 0 ? <p className="empty-text">No challenges yet. Create one!</p> :
              challenges.map((c) => (
                <div key={c.id} className="challenge-card">
                  <div className="challenge-header">
                    <span className="challenge-title">{c.title}</span>
                    <div className="challenge-badges">
                      <span className="routing-badge"
                        style={{ color: ROUTING_LABELS[c.routing]?.color }}>
                        {ROUTING_LABELS[c.routing]?.label || c.type}
                      </span>
                      <span className="challenge-status" style={{ color: STATUS_COLORS[c.status] }}>
                        {c.status}
                      </span>
                    </div>
                  </div>
                  {c.auraChallengeId && (
                    <span className="challenge-id">{c.auraChallengeId}</span>
                  )}
                  <div className="challenge-meta">
                    <span>⚔️ {c.type}</span>
                    <span>💰 {c.stakeXp} XP</span>
                    <span>👥 {c.participants?.length || 0} players</span>
                    {c.endAt && (
                      <span className="deadline-indicator">
                        ⏰ {new Date(c.endAt) > new Date() ? 
                          `Ends ${new Date(c.endAt).toLocaleDateString()}` : 
                          '⚠️ Deadline passed'}
                      </span>
                    )}
                  </div>

                  {/* Phase 2.4.3: Inline submissions — scores visible on the card */}
                  {c.submissions && c.submissions.length > 0 && (
                    <div className="submissions-inline">
                      <h4 className="submissions-title">📊 Submissions ({c.submissions.length})</h4>
                      <div className="submissions-list">
                        {c.submissions
                          .sort((a, b) => (b.validationScore || 0) - (a.validationScore || 0))
                          .map((s, idx) => (
                            <div key={s.userId + idx} className={`submission-row ${idx === 0 && c.submissions.length > 1 ? 'leading' : ''}`}>
                              <span className="submission-rank">#{idx + 1}</span>
                              {/* Phase 2.4.4: Show displayName instead of raw ID */}
                              <span className="submission-user">{s.displayName || s.userId.slice(-6)}</span>
                              <span className={`submission-score ${(s.validationScore || 0) >= 50 ? 'score-pass' : 'score-fail'}`}>
                                {s.validationScore ?? '—'}/100
                              </span>
                              <span className={`submission-status-badge ${s.status?.toLowerCase()}`}>
                                {s.status === 'VERIFIED' ? '✅' : s.status === 'REJECTED' ? '❌' : '⏳'}
                              </span>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}

                  <div className="challenge-actions">
                    {['DRAFT', 'PENDING'].includes(c.status) && (
                      <button className="btn-activate" onClick={() => handleActivate(c.id)}
                        disabled={actionLoading === c.id}>Activate</button>
                    )}
                    {c.status === 'ACTIVE' && (
                      <button className="btn-submit" onClick={() => setSelectedChallenge(c.id)}>
                        Submit Proof
                      </button>
                    )}
                    {/* Phase 2.4.3: Resolve button — visible when canResolve is true */}
                    {!['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(c.status) && c.canResolve && (
                      <button className="btn-resolve" onClick={() => handleResolve(c.id)}
                        disabled={actionLoading === c.id}>
                        {actionLoading === c.id ? '⚙️ Resolving...' : '🏆 Resolve & Determine Winner'}
                      </button>
                    )}
                    {!['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(c.status) && !c.canResolve && c.resolveBlockReason && (
                      <span className="resolve-blocked" title={c.resolveBlockReason}>⏳ {c.resolveBlockReason}</span>
                    )}
                    {!['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(c.status) && (
                      <button className="btn-cancel-challenge" onClick={() => handleCancel(c.id)}
                        disabled={actionLoading === c.id}>Cancel</button>
                    )}
                  </div>

                  {selectedChallenge === c.id && (
                    <div className="proof-form">
                      <textarea placeholder="Describe what you did..."
                        value={proofText} onChange={(e) => setProofText(e.target.value)}
                        className="proof-input" rows={3} />

                      {/* Phase 2.4.3: Image upload for proof */}
                      <ImageUploadZone
                        purpose="proof"
                        label="📷 Upload Proof Image"
                        onUploadComplete={(url) => setProofImageUrls(prev => [...prev, url])}
                      />
                      {proofImageUrls.length > 0 && (
                        <div className="proof-images-preview">
                          {proofImageUrls.map((url, i) => (
                            <div key={i} className="proof-thumb">
                              <img src={url} alt={`Proof ${i + 1}`} />
                              <button className="proof-thumb-remove"
                                onClick={() => setProofImageUrls(prev => prev.filter((_, j) => j !== i))}
                              >✕</button>
                            </div>
                          ))}
                        </div>
                      )}

                      <button className="btn-submit-proof" onClick={() => handleSubmitProof(c.id)}
                        disabled={actionLoading === c.id || (!proofText.trim() && proofImageUrls.length === 0)}>
                        {actionLoading === c.id ? '🤖 Validating...' : '🤖 Submit & Validate'}
                      </button>

                      {/* Phase 2.4.3: AI validation result display */}
                      {validationResult && (
                        <div className={`validation-result ${validationResult.validScore >= 50 ? 'verified' : 'rejected'}`}>
                          <div className="validation-header">
                            <span className="validation-status">
                              {validationResult.validScore >= 50 ? '✅ Verified' : '❌ Rejected'}
                            </span>
                            <span className="validation-score">{validationResult.validScore}/100</span>
                          </div>
                          {validationResult.reason && (
                            <p className="validation-reason">{validationResult.reason}</p>
                          )}
                          {validationResult.provider === 'HEURISTIC_FALLBACK' && (
                            <p className="validation-fallback-note">⚠️ Gemini AI quota exceeded — scored by heuristic rules</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {c.winnerId && (
                    <div className="winner-banner">🏆 Winner: {c.winnerName || c.winnerId}</div>
                  )}
                  {c.status === 'COMPLETED' && !c.winnerId && (
                    <div className="winner-banner" style={{ background: 'rgba(148,163,184,0.1)', color: '#94a3b8' }}>
                      No winner — all submissions below threshold
                    </div>
                  )}
                </div>
              ))
          }
        </div>
      )}

      {/* ── Create Challenge ──────────────────────── */}
      {tab === 'create' && (
        <form className="create-form" onSubmit={handleCreate}>
          {friendName && (
            <div className="friend-target-banner">
              ⚔️ Challenging: <strong>{friendName}</strong>
            </div>
          )}
          <input type="text" placeholder="Challenge title" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="form-input" required />
          <textarea placeholder="Description (optional)" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="form-textarea" rows={3} />
          <div className="form-row">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="form-select">
              <option value="FRIEND_1V1">👤 Friend 1v1 (Direct)</option>
              <option value="HUB_OPEN">👥 Hub Open (Community)</option>
              <option value="HUB_TOURNAMENT">🏆 Hub Tournament</option>
            </select>
            <input type="number" placeholder="XP Stake" value={form.stakeXp} min={0} max={500}
              onChange={(e) => setForm({ ...form, stakeXp: parseInt(e.target.value) || 0 })}
              className="form-input" style={{ width: '120px' }} />
          </div>

          {form.type === 'FRIEND_1V1' && !friendId && (
            <input type="text" placeholder="Friend's AURA-PLR-ID or user ID"
              value={form.targetFriendId}
              onChange={(e) => setForm({ ...form, targetFriendId: e.target.value })}
              className="form-input" />
          )}

          {/* Phase 2.4.2: Mandatory deadline */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">⏰ Deadline (required)</label>
              <input type="datetime-local" value={form.endAt}
                onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                className="form-input" required
                min={new Date(Date.now() + 60*60*1000).toISOString().slice(0, 16)} />
            </div>
          </div>

          <div className="routing-info">
            {form.type === 'FRIEND_1V1' ? (
              <span className="routing-hint">👤 ONE-TO-ONE: Challenge is sent directly to your friend. Max participants is auto-set to 2.</span>
            ) : (
              <span className="routing-hint">👥 ONE-TO-MANY: All hub members can join this challenge</span>
            )}
          </div>

          <button type="submit" className="btn-create" disabled={actionLoading === 'create'}>
            {actionLoading === 'create' ? 'Creating...' : '⚔️ Create Challenge'}
          </button>
        </form>
      )}
    </div>
  );
};

export default ChallengesPage;
