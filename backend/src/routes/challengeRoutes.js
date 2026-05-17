const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const challengeService = require('../services/domains/challengeDomainService');
const trustService = require('../services/domains/trustDomainService');
const socialService = require('../services/domains/socialDomainService');
const hubService = require('../services/domains/hubDomainService');
const xpPipeline = require('../services/orchestration/xpPipeline');
const historyService = require('../services/historyService');
const { BEHAVIORAL_EVENT_TYPES } = require('../constants/historyConstants');
const PlayerProfile = require('../models/PlayerProfile');
const Challenge = require('../models/Challenge');
const auraEvents = require('../events/eventBus');
const { EVENTS } = require('../events/eventConstants');

// ======================================================
// CHALLENGE ROUTES — Phase 3.1.7
//
// CORRECTED LIFECYCLE:
//   POST /           → create (DRAFT, only creator)
//   POST /:id/invite → dispatch invitation (DRAFT→WAITING_FOR_PARTICIPANTS)
//   POST /:id/accept → accept invite (→ACTIVE for 1v1, →READY for hub)
//   POST /:id/decline→ decline invite (→CANCELLED for 1v1)
//   POST /:id/start  → creator starts group challenge (READY→ACTIVE)
//   POST /:id/leave  → leave active challenge
//   POST /:id/join   → hub open direct join
//   POST /:id/submit → submit proof
//   POST /:id/resolve→ resolve and determine winner
//   POST /:id/cancel → creator cancels
//
// "Activate" in UI → calls POST /:id/invite (NOT start)
// ======================================================

// ── Resolve participant profiles helper ──────────────
const _enrichParticipants = async (participants) => {
  if (!participants?.length) return [];
  const userIds = [...new Set(participants.map(p => p.userId))];
  const profiles = await PlayerProfile.find({ userId: { $in: userIds } }).lean();
  const pmap = {};
  profiles.forEach(p => { pmap[p.userId.toString()] = p; });
  return participants.map(p => ({
    ...p,
    displayName: pmap[p.userId]?.displayName || 'Player',
    auraPlayerId: pmap[p.userId]?.auraPlayerId || null,
    avatar: pmap[p.userId]?.avatar || null,
  }));
};

// Guard: prevent /challenges/undefined/* mutations
const isValidObjectId = (id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

// ── POST /api/v1/challenges ──────────────────────────
// Creates challenge in DRAFT state — only visible to creator
router.post('/', protect, asyncHandler(async (req, res) => {
  const { title, description, type, hubId, targetFriendId, targetAuraPlayerId,
          stakeXp, stakeType, endAt, startAt, submissionDeadline, maxParticipants } = req.body;

  if (!title || !type) return sendError(res, 'Title and type required', 400);
  if (!endAt) return sendError(res, 'End time (endAt) is required', 400);
  if (startAt && endAt && new Date(startAt) >= new Date(endAt)) return sendError(res, 'Start time must be before end time', 400);
  if (new Date(endAt) <= new Date()) return sendError(res, 'End time must be in the future', 400);

  let resolvedTargetId = targetFriendId;
  const creatorProfile = await PlayerProfile.findOne({ userId: req.user.id }).select('displayName').lean();

  if (type === 'FRIEND_1V1') {
    if (!resolvedTargetId && targetAuraPlayerId) {
      const targetProfile = await PlayerProfile.findOne({ auraPlayerId: targetAuraPlayerId });
      if (!targetProfile) return sendError(res, 'Target player not found', 404);
      resolvedTargetId = targetProfile.userId;
    }
    if (!resolvedTargetId) return sendError(res, 'Friend 1v1 requires a target friend', 400);
    if (resolvedTargetId.toString() === req.user.id) return sendError(res, 'Cannot challenge yourself', 400);
    const friends = await socialService.areFriends(req.user.id, resolvedTargetId);
    if (!friends) return sendError(res, 'You can only challenge friends in 1v1', 403);
  }

  if (['HUB_OPEN', 'HUB_TOURNAMENT'].includes(type)) {
    if (!hubId) return sendError(res, 'Hub challenges require a hub ID', 400);
    const member = await hubService.isMember(hubId, req.user.id);
    if (!member) return sendError(res, 'You must be a hub member to create hub challenges', 403);
  }

  const challenge = await challengeService.createChallenge(req.user.id, {
    title, description, type, hubId, targetFriendId: resolvedTargetId,
    stakeXp, stakeType, endAt, startAt, submissionDeadline,
    maxParticipants: type === 'FRIEND_1V1' ? 2 : (maxParticipants || 10)
  });

  await historyService.recordEvent(req.user.id, BEHAVIORAL_EVENT_TYPES.CHALLENGE_CREATED, {
    challengeId: challenge._id.toString(), title, type
  });

  // Notify creator (cross-tab sync only — target NOT notified at creation)
  auraEvents.emitEvent(EVENTS.CHALLENGE_CREATED, {
    creatorId: req.user.id,
    challengeId: challenge._id.toString(),
    auraChallengeId: challenge.auraChallengeId,
    title, type,
    creatorName: creatorProfile?.displayName || 'Player',
    routing: type === 'FRIEND_1V1' ? 'ONE_TO_ONE' : 'ONE_TO_MANY'
  });

  sendSuccess(res, challengeService.sanitizeChallenge(challenge), 'Challenge created', 201);
}));

// ── POST /api/v1/challenges/:id/invite ───────────────
// Phase 3.1.7: THIS is "Activate" in the UI — dispatches invitation
// DRAFT → WAITING_FOR_PARTICIPANTS
// For 1v1: adds target as INVITED, sends realtime notification to target
// For Hub: transition to WAITING (members can join)
router.post('/:id/invite', protect, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return sendError(res, 'Invalid challenge ID', 400);

  const { challenge, invitedUserId } = await challengeService.dispatchInvite(req.params.id, req.user.id);
  const creatorProfile = await PlayerProfile.findOne({ userId: req.user.id }).select('displayName').lean();

  await historyService.recordEvent(req.user.id, BEHAVIORAL_EVENT_TYPES.CHALLENGE_INVITED, {
    challengeId: req.params.id,
    targetUserId: invitedUserId || null
  });

  // Emit CHALLENGE_INVITED → socketListener sends to target's player room
  auraEvents.emitEvent(EVENTS.CHALLENGE_INVITED, {
    challengeId: req.params.id,
    auraChallengeId: challenge.auraChallengeId,
    targetUserId: invitedUserId,
    creatorId: req.user.id,
    creatorName: creatorProfile?.displayName || 'Player',
    title: challenge.title
  });

  // Also update creator (cross-tab: status changed to WAITING_FOR_PARTICIPANTS)
  auraEvents.emitEvent(EVENTS.CHALLENGE_ACTIVATED, {
    challengeId: req.params.id,
    auraChallengeId: challenge.auraChallengeId,
    status: challenge.status,
    activatedAt: challenge.invitedAt
  });

  sendSuccess(res, challengeService.sanitizeChallenge(challenge), 'Invitation dispatched');
}));

// ── POST /api/v1/challenges/:id/accept ───────────────
// Phase 3.1.7: Target accepts invite
// 1v1: auto-transitions WAITING→ACTIVE (challenge starts)
// Hub: WAITING→READY when quorum met
router.post('/:id/accept', protect, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return sendError(res, 'Invalid challenge ID', 400);

  const { challenge, autoStarted } = await challengeService.acceptInvite(req.params.id, req.user.id);
  const profile = await PlayerProfile.findOne({ userId: req.user.id }).select('displayName').lean();

  await historyService.recordEvent(req.user.id, BEHAVIORAL_EVENT_TYPES.CHALLENGE_ACCEPTED, {
    challengeId: req.params.id, autoStarted
  });

  // Emit ACCEPTED — socketListener broadcasts to ALL participants
  auraEvents.emitEvent(EVENTS.CHALLENGE_ACCEPTED, {
    userId: req.user.id,
    challengeId: req.params.id,
    auraChallengeId: challenge.auraChallengeId,
    playerName: profile?.displayName || 'Player',
    title: challenge.title,
    newStatus: challenge.status  // ACTIVE for 1v1, READY for hub
  });

  // If auto-started (1v1), also emit ACTIVATED so both sides transition
  if (autoStarted) {
    auraEvents.emitEvent(EVENTS.CHALLENGE_ACTIVATED, {
      challengeId: req.params.id,
      auraChallengeId: challenge.auraChallengeId,
      status: 'ACTIVE',
      activatedAt: challenge.activatedAt
    });
  }

  sendSuccess(res, challengeService.sanitizeChallenge(challenge),
    autoStarted ? 'Challenge accepted — challenge is now ACTIVE!' : 'Challenge accepted');
}));

// ── POST /api/v1/challenges/:id/decline ──────────────
// Phase 3.1.7: Target declines invite
// 1v1: challenge CANCELLED — BOTH players notified via dual-emit
router.post('/:id/decline', protect, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return sendError(res, 'Invalid challenge ID', 400);

  const { challenge, isCancelled } = await challengeService.declineInvite(req.params.id, req.user.id);
  const profile = await PlayerProfile.findOne({ userId: req.user.id }).select('displayName').lean();

  await historyService.recordEvent(req.user.id, BEHAVIORAL_EVENT_TYPES.CHALLENGE_DECLINED, {
    challengeId: req.params.id, isCancelled
  });

  // Emit DECLINED — socketListener broadcasts to ALL participants (creator gets notified)
  auraEvents.emitEvent(EVENTS.CHALLENGE_DECLINED, {
    userId: req.user.id,
    challengeId: req.params.id,
    auraChallengeId: challenge.auraChallengeId,
    playerName: profile?.displayName || 'Player',
    isCancelled
  });

  // Phase 3.1.7 FIX: Always emit CHALLENGE_CANCELLED when 1v1 declined
  // This ensures BOTH the decliner and the creator remove the challenge from their arrays
  if (isCancelled) {
    auraEvents.emitEvent(EVENTS.CHALLENGE_CANCELLED, {
      challengeId: req.params.id,
      auraChallengeId: challenge.auraChallengeId,
      reason: 'DECLINED_BY_INVITEE',
      declinedBy: req.user.id
    });
  }

  sendSuccess(res, challengeService.sanitizeChallenge(challenge),
    isCancelled ? 'Challenge declined — challenge has been cancelled for all participants' : 'Challenge declined');
}));

// ── POST /api/v1/challenges/:id/leave ─────────────────
router.post('/:id/leave', protect, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return sendError(res, 'Invalid challenge ID', 400);

  const { challenge, isCancelled } = await challengeService.leaveChallenge(req.params.id, req.user.id);
  const profile = await PlayerProfile.findOne({ userId: req.user.id }).select('displayName').lean();

  await historyService.recordEvent(req.user.id, BEHAVIORAL_EVENT_TYPES.CHALLENGE_LEFT, {
    challengeId: req.params.id, isCancelled
  });

  auraEvents.emitEvent(EVENTS.CHALLENGE_LEFT, {
    userId: req.user.id,
    challengeId: req.params.id,
    auraChallengeId: challenge.auraChallengeId,
    playerName: profile?.displayName || 'Player',
    isCancelled
  });

  if (isCancelled) {
    auraEvents.emitEvent(EVENTS.CHALLENGE_CANCELLED, {
      challengeId: req.params.id,
      auraChallengeId: challenge.auraChallengeId,
      reason: 'PARTICIPANT_LEFT'
    });
  }

  sendSuccess(res, challengeService.sanitizeChallenge(challenge),
    isCancelled ? 'Left challenge — challenge cancelled' : 'Left challenge');
}));

// ── POST /api/v1/challenges/:id/start ────────────────
// Phase 3.1.7: For Hub/group challenges — creator starts after quorum (READY→ACTIVE)
router.post('/:id/start', protect, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return sendError(res, 'Invalid challenge ID', 400);

  const challenge = await challengeService.startChallenge(req.params.id, req.user.id);

  auraEvents.emitEvent(EVENTS.CHALLENGE_ACTIVATED, {
    challengeId: req.params.id,
    auraChallengeId: challenge.auraChallengeId,
    status: 'ACTIVE',
    activatedAt: challenge.activatedAt
  });

  sendSuccess(res, challengeService.sanitizeChallenge(challenge), 'Challenge started');
}));

// ── POST /api/v1/challenges/:id/join ─────────────────
// Hub Open direct join
router.post('/:id/join', protect, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return sendError(res, 'Invalid challenge ID', 400);
  const challenge = await challengeService.joinChallenge(req.params.id, req.user.id);

  auraEvents.emitEvent(EVENTS.CHALLENGE_JOINED, {
    userId: req.user.id,
    challengeId: req.params.id,
    auraChallengeId: challenge.auraChallengeId,
    title: challenge.title,
    participantCount: challenge.participants?.length || 0
  });

  sendSuccess(res, challengeService.sanitizeChallenge(challenge), 'Joined challenge');
}));

// ── POST /api/v1/challenges/:id/submit ───────────────
router.post('/:id/submit', protect, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return sendError(res, 'Invalid challenge ID', 400);
  const { proofImageUrls, proofText } = req.body;
  const submission = await challengeService.createSubmission(req.params.id, req.user.id, { proofImageUrls, proofText });
  const submitterProfile = await PlayerProfile.findOne({ userId: req.user.id }).select('displayName').lean();

  auraEvents.emitEvent(EVENTS.CHALLENGE_SUBMITTED, {
    userId: req.user.id,
    challengeId: req.params.id,
    submissionId: submission._id.toString(),
    attemptNumber: submission.attemptNumber,
    submitterName: submitterProfile?.displayName || 'Player'
  });

  try {
    const aiValidator = require('../services/orchestration/aiValidation');
    const validationResult = await aiValidator.validateSubmission(submission._id);

    const allValidated = await challengeService.allParticipantsValidated(req.params.id);
    if (allValidated) {
      const c = await challengeService.getChallengeById(req.params.id);
      if (c?.status === 'ACTIVE') {
        try { await challengeService.transitionState(req.params.id, 'SUBMISSION'); } catch { /* non-fatal */ }
      }
    }

    sendSuccess(res, {
      submission: challengeService.sanitizeSubmission(submission),
      validation: validationResult
    }, 'Proof submitted and validated');
  } catch {
    sendSuccess(res, {
      submission: challengeService.sanitizeSubmission(submission),
      validation: null
    }, 'Proof submitted (validation pending)');
  }
}));

// ── GET /api/v1/challenges/:id/can-resolve ───────────
router.get('/:id/can-resolve', protect, asyncHandler(async (req, res) => {
  const result = await challengeService.canResolve(req.params.id);
  sendSuccess(res, result);
}));

// ── POST /api/v1/challenges/:id/resolve ──────────────
router.post('/:id/resolve', protect, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return sendError(res, 'Invalid challenge ID', 400);
  const challenge = await challengeService.getChallengeById(req.params.id);
  if (!challenge) return sendError(res, 'Challenge not found', 404);

  const isParticipant = challenge.participants.some(
    p => p.userId.toString() === req.user.id &&
    challengeService.ACTIVE_PARTICIPANT_STATUSES.includes(p.status)
  );
  if (!isParticipant) return sendError(res, 'Only active participants can resolve', 403);

  const resolveCheck = await challengeService.canResolve(req.params.id);
  if (!resolveCheck.canResolve) return sendError(res, resolveCheck.reason, 400);

  let c = challenge;
  try {
    if (c.status === 'ACTIVE') c = await challengeService.transitionState(req.params.id, 'SUBMISSION');
    if (['SUBMISSION', 'WAITING_FOR_PARTICIPANTS', 'READY'].includes(c.status)) c = await challengeService.transitionState(req.params.id, 'LOCKED');
    if (c.status === 'LOCKED') c = await challengeService.transitionState(req.params.id, 'RESOLUTION');
  } catch { c = await challengeService.getChallengeById(req.params.id); }

  const { submissions } = await challengeService.getSubmissions(req.params.id);
  const validSubmissions = submissions.filter(s => s.validationScore !== null).sort((a, b) => b.validationScore - a.validationScore);
  const bestSubmission = validSubmissions[0];
  let winnerId = null;

  const activeParticipants = c.participants.filter(p => challengeService.ACTIVE_PARTICIPANT_STATUSES.includes(p.status));

  if (bestSubmission && bestSubmission.validationScore >= 50) {
    winnerId = bestSubmission.userId;
    await Challenge.findByIdAndUpdate(req.params.id, { winnerId });
    await xpPipeline.awardChallengeWin(winnerId, c);
    await historyService.recordEvent(winnerId, BEHAVIORAL_EVENT_TYPES.CHALLENGE_WON, { challengeId: req.params.id, title: c.title });
    await trustService.recordValidation(winnerId, bestSubmission.validationScore, 'CHALLENGE_WIN');
    const playerProfileService = require('../services/domains/playerProfileDomainService');
    await playerProfileService.incrementCounter(winnerId, 'challengeWins', 1);
    for (const p of activeParticipants) {
      if (p.userId.toString() !== winnerId) {
        await xpPipeline.penalizeChallengeLoss(p.userId, c);
        await playerProfileService.incrementCounter(p.userId, 'challengeLosses', 1);
        await historyService.recordEvent(p.userId, BEHAVIORAL_EVENT_TYPES.CHALLENGE_LOST, { challengeId: req.params.id, title: c.title });
      }
    }
  } else {
    const playerProfileService = require('../services/domains/playerProfileDomainService');
    for (const p of activeParticipants) {
      await xpPipeline.penalizeChallengeLoss(p.userId, c);
      await playerProfileService.incrementCounter(p.userId, 'challengeLosses', 1);
      await historyService.recordEvent(p.userId, BEHAVIORAL_EVENT_TYPES.CHALLENGE_LOST, { challengeId: req.params.id, title: c.title, reason: 'no_valid_submissions' });
    }
  }

  await challengeService.transitionState(req.params.id, 'COMPLETED');

  const enrichedRanking = await Promise.all(validSubmissions.map(async (s) => {
    const p = await PlayerProfile.findOne({ userId: s.userId }).lean();
    return { userId: s.userId, displayName: p?.displayName || 'Player', avatar: p?.avatar || null, score: s.validationScore, isWinner: s.userId === winnerId };
  }));

  let winnerName = null;
  if (winnerId) {
    const wp = await PlayerProfile.findOne({ userId: winnerId }).lean();
    winnerName = wp?.displayName || 'Player';
  }

  auraEvents.emitEvent(EVENTS.CHALLENGE_RESOLVED, {
    challengeId: req.params.id,
    auraChallengeId: c.auraChallengeId,
    winnerId, winnerName, title: c.title
  });

  sendSuccess(res, { challengeId: req.params.id, winnerId, winnerName, resolved: true, ranking: enrichedRanking }, 'Challenge resolved');
}));

// ── GET /api/v1/challenges/my ────────────────────────
router.get('/my', protect, asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await challengeService.getUserChallenges(req.user.id, {
    page: parseInt(page) || 1, limit: parseInt(limit) || 20
  });

  const enriched = await Promise.all(result.challenges.map(async (c) => {
    const resolveCheck = await challengeService.canResolve(c._id);
    const { submissions } = await challengeService.getSubmissions(c._id, { limit: 50 });

    const userIds = [...new Set(submissions.map(s => s.userId))];
    const profiles = await PlayerProfile.find({ userId: { $in: userIds } }).lean();
    const profileMap = {};
    profiles.forEach(p => { profileMap[p.userId.toString()] = p; });

    let winnerName = null;
    if (c.winnerId) {
      const wp = profileMap[c.winnerId] || await PlayerProfile.findOne({ userId: c.winnerId }).lean();
      winnerName = wp?.displayName || 'Player';
    }

    const enrichedParticipants = await _enrichParticipants(c.participants);

    return {
      ...c,
      winnerName,
      canResolve: resolveCheck.canResolve,
      resolveBlockReason: resolveCheck.reason,
      submittedCount: resolveCheck.submittedCount,
      totalParticipants: resolveCheck.totalParticipants,
      participants: enrichedParticipants,
      submissions: submissions.map(s => ({
        userId: s.userId,
        displayName: profileMap[s.userId]?.displayName || 'Player',
        avatar: profileMap[s.userId]?.avatar || null,
        validationScore: s.validationScore,
        status: s.status,
        proofText: s.proofText?.slice(0, 100),
        proofImageUrls: s.proofImageUrls,
        validatedAt: s.validatedAt,
        aiExplanation: s.aiExplanation
      }))
    };
  }));

  sendSuccess(res, { ...result, challenges: enriched });
}));

// ── GET /api/v1/challenges/:id ───────────────────────
router.get('/:id', protect, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return sendError(res, 'Invalid challenge ID', 400);
  const challenge = await challengeService.getChallengeById(req.params.id);
  if (!challenge) return sendError(res, 'Challenge not found', 404);
  const resolveCheck = await challengeService.canResolve(req.params.id);
  sendSuccess(res, { ...challengeService.sanitizeChallenge(challenge), canResolve: resolveCheck.canResolve, resolveBlockReason: resolveCheck.reason });
}));

// ── GET /api/v1/challenges/:id/submissions ───────────
router.get('/:id/submissions', protect, asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await challengeService.getSubmissions(req.params.id, { page: parseInt(page) || 1, limit: parseInt(limit) || 20 });
  sendSuccess(res, result);
}));

// ── POST /api/v1/challenges/:id/cancel ───────────────
router.post('/:id/cancel', protect, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) return sendError(res, 'Invalid challenge ID', 400);
  const challenge = await challengeService.getChallengeById(req.params.id);
  if (!challenge) return sendError(res, 'Challenge not found', 404);
  if (challenge.creatorId.toString() !== req.user.id) return sendError(res, 'Only the creator can cancel', 403);

  const c = await challengeService.transitionState(req.params.id, 'CANCELLED');
  await historyService.recordEvent(req.user.id, BEHAVIORAL_EVENT_TYPES.CHALLENGE_CANCELLED, { challengeId: req.params.id });

  auraEvents.emitEvent(EVENTS.CHALLENGE_CANCELLED, {
    challengeId: req.params.id,
    auraChallengeId: challenge.auraChallengeId,
    creatorId: req.user.id,
    title: challenge.title,
    reason: 'CREATOR_CANCELLED'
  });

  sendSuccess(res, challengeService.sanitizeChallenge(c), 'Challenge cancelled');
}));

module.exports = router;
