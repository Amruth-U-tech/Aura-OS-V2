import { useState } from 'react';
import challengeApi from '@services/challengeApi';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@context/AuthContext';
import { useChallenges } from '@context/ChallengeContext';
import ImageUploadZone from '@components/upload/ImageUploadZone';
import { getMyParticipant, hasInvite } from '@utils/stateNormalizers';
import './ChallengesPage.css';

// Phase 3.1.5: Canonical identity guard — prevents /challenges/undefined/* mutations
const isValidObjectId = (id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

// ======================================================
// CHALLENGES PAGE — Phase 2.4.1
// Tabs: My Challenges | Create
// Distinguishes: Friend 1v1 (ONE-TO-ONE) vs Hub (ONE-TO-MANY)
// Supports: friend challenge routing from Friends page
// ======================================================

const STATUS_COLORS = {
  DRAFT: '#94a3b8',
  WAITING_FOR_PARTICIPANTS: '#f59e0b',  // amber — waiting for response
  READY: '#06b6d4',                     // cyan — quorum met, ready to start
  SCHEDULED: '#6366f1', PENDING: '#f59e0b', ACTIVE: '#10b981',
  SUBMISSION: '#3b82f6', LOCKED: '#8b5cf6',
  RESOLUTION: '#6366f1', COMPLETED: '#22c55e', CANCELLED: '#ef4444', EXPIRED: '#64748b'
};

const STATUS_LABELS = {
  DRAFT: 'Draft',
  WAITING_FOR_PARTICIPANTS: '⏳ Waiting',
  READY: '✅ Ready',
  ACTIVE: '🔥 Active',
  SUBMISSION: '📥 Submitted',
  LOCKED: '🔒 Locked',
  COMPLETED: '🏆 Completed',
  CANCELLED: '❌ Cancelled',
  EXPIRED: '⏰ Expired',
  SCHEDULED: '📅 Scheduled',
};

const ROUTING_LABELS = {
  ONE_TO_ONE: { label: '👤 Direct', color: '#f59e0b' },
  ONE_TO_MANY: { label: '👥 Hub', color: '#10b981' }
};

// Computed once at module load — stable across all renders
// The 1-hour minimum deadline ensures valid creation form state
const MIN_CHALLENGE_END_AT = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);

const ChallengesPage = () => {
  const [searchParams] = useSearchParams();
  const friendId = searchParams.get('friend');
  const friendName = searchParams.get('name');

  const [tab, setTab] = useState(friendId ? 'create' : 'list');
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage] = useState(null);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [proofText, setProofText] = useState('');
  const [proofImageUrls, setProofImageUrls] = useState([]); // Phase 2.4.3: proof images
  const [validationResult, setValidationResult] = useState(null); // Phase 2.4.3: AI result
  // Auth state consumed by ChallengeContext — no direct usage needed here
  useAuth();

  // Phase 3.1.1: Consume from ChallengeContext (guaranteed array)
  const { challenges, loading, refreshChallenges, removeChallenge } = useChallenges();
  const { user } = useAuth();
  const myUserId = user?.id || user?._id || null;

  const [form, setForm] = useState({
    title: friendName ? `Challenge for ${friendName}` : '',
    description: '',
    type: friendId ? 'FRIEND_1V1' : 'FRIEND_1V1',
    targetFriendId: friendId || '',
    stakeXp: 25,
    stakeType: 'XP',
    endAt: '', // Phase 2.4.2: mandatory deadline
  });

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
      refreshChallenges();
    } catch (err) { showMsg(err?.response?.data?.message || 'Failed to create'); }
    setActionLoading(null);
  };

  // Phase 3.1.7: "Activate" = dispatch invitation (DRAFT → WAITING_FOR_PARTICIPANTS)
  const handleDispatchInvite = async (id) => {
    if (!isValidObjectId(id)) { showMsg('Cannot send invitation: invalid challenge ID'); return; }
    setActionLoading(id);
    try {
      await challengeApi.dispatchInvite(id);
      showMsg('📨 Invitation sent! Waiting for opponent to accept.');
      refreshChallenges();
    } catch (err) { showMsg(err?.response?.data?.message || 'Failed to send invitation'); }
    setActionLoading(null);
  };

  // Phase 3.1.7: Start hub challenge (READY → ACTIVE)
  const handleStart = async (id) => {
    if (!isValidObjectId(id)) { showMsg('Cannot start: invalid challenge ID'); return; }
    setActionLoading(id);
    try {
      await challengeApi.startChallenge(id);
      showMsg('✅ Challenge started!');
      refreshChallenges();
    } catch (err) { showMsg(err?.response?.data?.message || 'Failed'); }
    setActionLoading(null);
  };

  const handleSubmitProof = async (id) => {
    // Phase 3.1.5: CRITICAL guard — prevents /challenges/undefined/submit
    if (!isValidObjectId(id)) {
      console.error('[ChallengeSubmit] Missing canonical challenge identity:', id);
      showMsg('Cannot submit: invalid challenge ID. Try refreshing.');
      refreshChallenges();
      return;
    }
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
      refreshChallenges();
    } catch (err) { showMsg(err?.response?.data?.message || err?.message || 'Failed'); }
    setActionLoading(null);
  };

  const handleResolve = async (id) => {
    if (!isValidObjectId(id)) { showMsg('Cannot resolve: invalid challenge ID'); return; }
    setActionLoading(id);
    try {
      const result = await challengeApi.resolveChallenge(id);
      showMsg(result?.winnerId ? `Winner determined! XP distributed.` : 'Challenge resolved — no winner.');
      refreshChallenges();
    } catch (err) { showMsg(err?.response?.data?.message || 'Failed'); }
    setActionLoading(null);
  };

  const handleCancel = async (id) => {
    if (!isValidObjectId(id)) { showMsg('Cannot cancel: invalid challenge ID'); return; }
    if (!confirm('Cancel this challenge?')) return;
    setActionLoading(id);
    try {
      await challengeApi.cancelChallenge(id);
      // Optimistic removal — socket will remove from all other participants
      removeChallenge(id);
      showMsg('Challenge cancelled.');
    } catch (err) { showMsg(err?.response?.data?.message || 'Failed'); }
    setActionLoading(null);
  };

  // ── Phase 3.1.7.1: Participation Handlers ─────────
  // IMPORTANT: For 1v1 decline/leave/cancel, use optimistic removal (removeChallenge)
  // instead of refreshChallenges(). This prevents the refetch-race where a GET /my
  // returns the stale challenge before socket events clean up both sides.
  const handleAccept = async (id) => {
    if (!isValidObjectId(id)) { showMsg('Cannot accept: invalid challenge ID'); return; }
    setActionLoading(`accept-${id}`);
    try {
      await challengeApi.acceptInvite(id);
      showMsg('✅ Challenge accepted! Starting now...');
      // Delay refresh slightly — let socket challenge.updated(PARTICIPANT_ACCEPTED, newStatus=ACTIVE)
      // arrive first. Socket handler does force refresh anyway.
      setTimeout(() => refreshChallenges(), 800);
    } catch (err) { showMsg(err?.response?.data?.message || 'Failed to accept'); }
    setActionLoading(null);
  };

  const handleDecline = async (id) => {
    if (!isValidObjectId(id)) { showMsg('Cannot decline: invalid challenge ID'); return; }
    if (!confirm('Decline this challenge? For 1v1 challenges, this will cancel the challenge for both players.')) return;
    setActionLoading(`decline-${id}`);
    try {
      await challengeApi.declineInvite(id);
      // Phase 3.1.7.1: Optimistic removal — remove immediately from decliner's view.
      // DO NOT call refreshChallenges() — that would race against socket events.
      // The socket challenge.cancelled event will also remove it from creator's view.
      removeChallenge(id);
      showMsg('Challenge declined.');
    } catch (err) { showMsg(err?.response?.data?.message || 'Failed to decline'); }
    setActionLoading(null);
  };

  const handleLeave = async (id) => {
    if (!isValidObjectId(id)) { showMsg('Cannot leave: invalid challenge ID'); return; }
    if (!confirm('Leave this challenge?')) return;
    setActionLoading(`leave-${id}`);
    try {
      await challengeApi.leaveChallenge(id);
      // Optimistic removal for leaver. Socket handles other participants.
      removeChallenge(id);
      showMsg('Left the challenge.');
    } catch (err) { showMsg(err?.response?.data?.message || 'Failed to leave'); }
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
            (Array.isArray(challenges) ? challenges : []).length === 0 ? <p className="empty-text">No challenges yet. Create one!</p> :
              (Array.isArray(challenges) ? challenges : []).map((c) => (
                <div key={c._id} className="challenge-card">
                  <div className="challenge-header">
                    <span className="challenge-title">{c.title}</span>
                    <div className="challenge-badges">
                      <span className="routing-badge"
                        style={{ color: ROUTING_LABELS[c.routing]?.color }}>
                        {ROUTING_LABELS[c.routing]?.label || c.type}
                      </span>
                      <span className="challenge-status" style={{ color: STATUS_COLORS[c.status] }}>
                        {STATUS_LABELS[c.status] || c.status}
                      </span>
                    </div>
                  </div>
                  {c.auraChallengeId && (
                    <span className="challenge-id">{c.auraChallengeId}</span>
                  )}
                  <div className="challenge-meta">
                    <span>⚔️ {c.type}</span>
                    <span>💰 {c.stakeXp} XP</span>
                    <span>👥 {(Array.isArray(c.participants) ? c.participants : []).length} players</span>
                    {c.endAt && (
                      <span className="deadline-indicator">
                        ⏰ {new Date(c.endAt) > new Date() ? 
                          `Ends ${new Date(c.endAt).toLocaleDateString()}` : 
                          '⚠️ Deadline passed'}
                      </span>
                    )}
                  </div>

                  {/* Phase 2.4.3: Inline submissions — scores visible on the card */}
                  {Array.isArray(c.submissions) && c.submissions.length > 0 && (
                    <div className="submissions-inline">
                      <h4 className="submissions-title">📊 Submissions ({c.submissions.length})</h4>
                      <div className="submissions-list">
                        {[...(Array.isArray(c.submissions) ? c.submissions : [])]
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
                    {/* Phase 3.1.7: INVITED — show Accept/Decline */}
                    {hasInvite(c, myUserId) ? (
                      <div className="invite-actions">
                        <div className="invite-banner">
                          📨 <strong>{c.title}</strong> — You’ve been challenged!
                        </div>
                        <button className="btn-accept-invite" id={`accept-invite-${c._id}`}
                          onClick={() => handleAccept(c._id)}
                          disabled={actionLoading === `accept-${c._id}`}>
                          {actionLoading === `accept-${c._id}` ? '⏳ Accepting...' : '✅ Accept Challenge'}
                        </button>
                        <button className="btn-decline-invite" id={`decline-invite-${c._id}`}
                          onClick={() => handleDecline(c._id)}
                          disabled={actionLoading === `decline-${c._id}`}>
                          {actionLoading === `decline-${c._id}` ? '⏳...' : '❌ Decline'}
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Phase 3.1.7: DRAFT — creator sends invitation (1v1) or dispatches hub challenge */}
                        {c.status === 'DRAFT' && c.creatorId === myUserId && (
                          <button className="btn-activate" id={`dispatch-${c._id}`}
                            onClick={() => handleDispatchInvite(c._id)}
                            disabled={actionLoading === c._id}>
                            {actionLoading === c._id ? '⏳ Sending...' : c.type === 'FRIEND_1V1' ? '📨 Send Challenge' : '📨 Open to Hub'}
                          </button>
                        )}
                        {/* WAITING_FOR_PARTICIPANTS — creator sees pending status */}
                        {c.status === 'WAITING_FOR_PARTICIPANTS' && c.creatorId === myUserId && (
                          <span className="resolve-blocked" title="Waiting for opponent to respond">
                            ⏳ Waiting for opponent response...
                          </span>
                        )}
                        {/* READY — creator can start hub challenge */}
                        {c.status === 'READY' && c.creatorId === myUserId && c.type !== 'FRIEND_1V1' && (
                          <button className="btn-activate" id={`start-${c._id}`}
                            onClick={() => handleStart(c._id)}
                            disabled={actionLoading === c._id}>
                            {actionLoading === c._id ? '⏳ Starting...' : '▶️ Start Challenge'}
                          </button>
                        )}
                        {/* ACTIVE: Submit Proof */}
                        {c.status === 'ACTIVE' && getMyParticipant(c, myUserId)?.status !== 'INVITED' && (
                          <button className="btn-submit" id={`submit-${c._id}`}
                            onClick={() => setSelectedChallenge(c._id)}>
                            Submit Proof
                          </button>
                        )}
                        {/* Resolve */}
                        {!['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(c.status) && c.canResolve && (
                          <button className="btn-resolve" id={`resolve-${c._id}`}
                            onClick={() => handleResolve(c._id)} disabled={actionLoading === c._id}>
                            {actionLoading === c._id ? '⚙️ Resolving...' : '🏆 Resolve & Determine Winner'}
                          </button>
                        )}
                        {!['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(c.status) && !c.canResolve && c.resolveBlockReason && (
                          <span className="resolve-blocked" title={c.resolveBlockReason}>⏳ {c.resolveBlockReason}</span>
                        )}
                        {/* Leave — non-creator active participants */}
                        {!['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(c.status)
                          && c.creatorId !== myUserId
                          && ['JOINED', 'ACCEPTED'].includes(getMyParticipant(c, myUserId)?.status) && (
                          <button className="btn-leave-challenge" id={`leave-${c._id}`}
                            onClick={() => handleLeave(c._id)}
                            disabled={actionLoading === `leave-${c._id}`}>
                            {actionLoading === `leave-${c._id}` ? '⏳...' : '🚪 Leave'}
                          </button>
                        )}
                        {/* Cancel — creator only */}
                        {!['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(c.status) && c.creatorId === myUserId && (
                          <button className="btn-cancel-challenge" id={`cancel-${c._id}`}
                            onClick={() => handleCancel(c._id)} disabled={actionLoading === c._id}>Cancel</button>
                        )}
                      </>
                    )}
                  </div>

                  {selectedChallenge === c._id && (
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

                      <button className="btn-submit-proof" onClick={() => handleSubmitProof(c._id)}
                        disabled={actionLoading === c._id || (!proofText.trim() && proofImageUrls.length === 0)}>
                        {actionLoading === c._id ? '🤖 Validating...' : '🤖 Submit & Validate'}
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
                min={MIN_CHALLENGE_END_AT} />
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
