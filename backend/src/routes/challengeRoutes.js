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
const auraEvents = require('../events/eventBus');
const { EVENTS } = require('../events/eventConstants');

// ======================================================
// CHALLENGE ROUTES — Phase 2.4.2
// Refinements: mandatory endAt, FRIEND_1V1 auto maxParticipants,
//              scheduler-driven activation, resolve only after
//              all submissions validated + deadline passed
// ======================================================

// ── POST /api/v1/challenges ──────────────────────────
router.post('/', protect, asyncHandler(async (req, res) => {
  const { title, description, type, hubId, targetFriendId, targetAuraPlayerId,
          stakeXp, stakeType, endAt, startAt, submissionDeadline, maxParticipants } = req.body;
  if (!title || !type) return sendError(res, 'Title and type required', 400);

  // ── Mandatory endAt validation ─────────────────────
  if (!endAt) return sendError(res, 'End time (endAt) is required — challenges must have a deadline', 400);

  if (startAt && endAt && new Date(startAt) >= new Date(endAt)) {
    return sendError(res, 'Start time must be before end time', 400);
  }
  if (new Date(endAt) <= new Date()) {
    return sendError(res, 'End time must be in the future', 400);
  }

  // ── Route-specific validation ──────────────────────
  let resolvedTargetId = targetFriendId;

  if (type === 'FRIEND_1V1') {
    // Resolve by auraPlayerId if provided
    if (!resolvedTargetId && targetAuraPlayerId) {
      const targetProfile = await PlayerProfile.findOne({ auraPlayerId: targetAuraPlayerId });
      if (!targetProfile) return sendError(res, 'Target player not found', 404);
      resolvedTargetId = targetProfile.userId;
    }
    if (!resolvedTargetId) return sendError(res, 'Friend 1v1 requires a target friend', 400);
    if (resolvedTargetId.toString() === req.user.id) {
      return sendError(res, 'Cannot challenge yourself', 400);
    }
    // Verify friendship
    const friends = await socialService.areFriends(req.user.id, resolvedTargetId);
    if (!friends) return sendError(res, 'You can only challenge friends in 1v1', 403);
  }

  if (['HUB_OPEN', 'HUB_TOURNAMENT'].includes(type)) {
    if (!hubId) return sendError(res, 'Hub challenges require a hub ID', 400);
    const member = await hubService.isMember(hubId, req.user.id);
    if (!member) return sendError(res, 'You must be a hub member to create hub challenges', 403);
  }

  // FRIEND_1V1: maxParticipants is auto-set to 2 in the service
  const challenge = await challengeService.createChallenge(req.user.id, {
    title, description, type, hubId, targetFriendId: resolvedTargetId,
    stakeXp, stakeType, endAt, startAt, submissionDeadline,
    maxParticipants: type === 'FRIEND_1V1' ? 2 : (maxParticipants || 10)
  });

  // Auto-join target friend in 1v1
  if (type === 'FRIEND_1V1' && resolvedTargetId) {
    try {
      await challengeService.joinChallenge(challenge._id, resolvedTargetId);
    } catch { /* already joined or other non-fatal */ }
  }

  // Phase 3.1: Emit domain event (history listener will persist)
  auraEvents.emitEvent(EVENTS.CHALLENGE_CREATED, {
    creatorId: req.user.id,
    challengeId: challenge._id.toString(),
    auraChallengeId: challenge.auraChallengeId,
    targetFriendId: resolvedTargetId || null,  // Phase 3.1.4: for 1v1 notification
    title, type,
    routing: type === 'FRIEND_1V1' ? 'ONE_TO_ONE' : 'ONE_TO_MANY'
  });

  sendSuccess(res, challengeService.sanitizeChallenge(challenge), 'Challenge created', 201);
}));

// ── POST /api/v1/challenges/:id/join ─────────────────
router.post('/:id/join', protect, asyncHandler(async (req, res) => {
  const challenge = await challengeService.joinChallenge(req.params.id, req.user.id);

  // Phase 3.1: Emit domain event
  auraEvents.emitEvent(EVENTS.CHALLENGE_JOINED, {
    userId: req.user.id,
    challengeId: req.params.id,
    auraChallengeId: challenge.auraChallengeId,
    title: challenge.title,
    participantCount: challenge.participants?.length || 0
  });

  sendSuccess(res, challengeService.sanitizeChallenge(challenge), 'Joined challenge');
}));

// ── POST /api/v1/challenges/:id/activate ─────────────
// Phase 2.4.2: Uses scheduler-driven activation
router.post('/:id/activate', protect, asyncHandler(async (req, res) => {
  const challenge = await challengeService.getChallengeById(req.params.id);
  if (!challenge) return sendError(res, 'Challenge not found', 404);
  if (challenge.creatorId.toString() !== req.user.id) {
    return sendError(res, 'Only the creator can activate', 403);
  }

  const activated = await challengeService.activateChallenge(req.params.id);

  sendSuccess(res, challengeService.sanitizeChallenge(activated),
    activated.status === 'SCHEDULED' ? 'Challenge scheduled for future activation' : 'Challenge activated'
  );
}));

// ── POST /api/v1/challenges/:id/submit ───────────────
router.post('/:id/submit', protect, asyncHandler(async (req, res) => {
  const { proofImageUrls, proofText } = req.body;

  const submission = await challengeService.createSubmission(req.params.id, req.user.id, {
    proofImageUrls, proofText
  });

  // Phase 3.1: Emit domain event (history listener will persist)
  auraEvents.emitEvent(EVENTS.CHALLENGE_SUBMITTED, {
    userId: req.user.id,
    challengeId: req.params.id,
    submissionId: submission._id.toString(),
    attemptNumber: submission.attemptNumber
  });

  // Trigger AI validation IMMEDIATELY
  try {
    const aiValidator = require('../services/orchestration/aiValidation');
    const validationResult = await aiValidator.validateSubmission(submission._id);

    // After validation, check if all participants have submitted
    // If so, transition challenge to WAITING_FOR_PARTICIPANTS or LOCKED
    const allValidated = await challengeService.allParticipantsValidated(req.params.id);
    if (allValidated) {
      const challenge = await challengeService.getChallengeById(req.params.id);
      if (challenge.status === 'ACTIVE') {
        try {
          await challengeService.transitionState(req.params.id, 'SUBMISSION');
        } catch { /* non-fatal */ }
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
// Check if challenge can be resolved
router.get('/:id/can-resolve', protect, asyncHandler(async (req, res) => {
  const result = await challengeService.canResolve(req.params.id);
  sendSuccess(res, result);
}));

// ── POST /api/v1/challenges/:id/resolve ──────────────
// Phase 2.4.2: Resolve ONLY when ALL participants have validated
// submissions AND challenge deadline has passed
router.post('/:id/resolve', protect, asyncHandler(async (req, res) => {
  const challenge = await challengeService.getChallengeById(req.params.id);
  if (!challenge) return sendError(res, 'Challenge not found', 404);

  // Phase 2.4.3: Any participant can resolve (not just creator)
  const isParticipant = challenge.participants.some(
    p => p.userId.toString() === req.user.id
  );
  if (!isParticipant) {
    return sendError(res, 'Only participants can resolve', 403);
  }

  // ── Phase 2.4.2: Validate resolution conditions ────
  const resolveCheck = await challengeService.canResolve(req.params.id);
  if (!resolveCheck.canResolve) {
    return sendError(res, resolveCheck.reason, 400);
  }

  // Transition to RESOLUTION
  let c = challenge;
  try {
    if (c.status === 'ACTIVE') c = await challengeService.transitionState(req.params.id, 'SUBMISSION');
    if (c.status === 'SUBMISSION') c = await challengeService.transitionState(req.params.id, 'LOCKED');
    if (c.status === 'WAITING_FOR_PARTICIPANTS') c = await challengeService.transitionState(req.params.id, 'LOCKED');
    if (c.status === 'LOCKED') c = await challengeService.transitionState(req.params.id, 'RESOLUTION');
  } catch (err) {
    // If already past some states, continue
    c = await challengeService.getChallengeById(req.params.id);
  }

  // Get all submissions and find highest score
  const { submissions } = await challengeService.getSubmissions(req.params.id);
  const validSubmissions = submissions
    .filter(s => s.validationScore !== null)
    .sort((a, b) => b.validationScore - a.validationScore);

  const bestSubmission = validSubmissions[0];
  let winnerId = null;

  if (bestSubmission && bestSubmission.validationScore >= 50) {
    winnerId = bestSubmission.userId;
    // Set winner on challenge
    const Challenge = require('../models/Challenge');
    await Challenge.findByIdAndUpdate(req.params.id, { winnerId });

    // Award winner XP
    await xpPipeline.awardChallengeWin(winnerId, c);
    await historyService.recordEvent(winnerId, BEHAVIORAL_EVENT_TYPES.CHALLENGE_WON, {
      challengeId: req.params.id, title: c.title
    });

    // Update trust for winner
    await trustService.recordValidation(winnerId, bestSubmission.validationScore, 'CHALLENGE_WIN');

    // Update winner stats
    const playerProfileService = require('../services/domains/playerProfileDomainService');
    await playerProfileService.incrementCounter(winnerId, 'challengeWins', 1);

    // Penalize losers
    for (const p of c.participants) {
      if (p.userId.toString() !== winnerId) {
        await xpPipeline.penalizeChallengeLoss(p.userId, c);
        await playerProfileService.incrementCounter(p.userId, 'challengeLosses', 1);
        await historyService.recordEvent(p.userId, BEHAVIORAL_EVENT_TYPES.CHALLENGE_LOST, {
          challengeId: req.params.id, title: c.title
        });
      }
    }
  } else {
    // No valid submissions — penalize all
    const playerProfileService = require('../services/domains/playerProfileDomainService');
    for (const p of c.participants) {
      await xpPipeline.penalizeChallengeLoss(p.userId, c);
      await playerProfileService.incrementCounter(p.userId, 'challengeLosses', 1);
      await historyService.recordEvent(p.userId, BEHAVIORAL_EVENT_TYPES.CHALLENGE_LOST, {
        challengeId: req.params.id, title: c.title, reason: 'no_valid_submissions'
      });
    }
  }

  await challengeService.transitionState(req.params.id, 'COMPLETED');

  // Phase 2.4.4: Enrich ranking with player display names
  const enrichedRanking = await Promise.all(
    validSubmissions.map(async (s) => {
      const p = await PlayerProfile.findOne({ userId: s.userId }).lean();
      return {
        userId: s.userId,
        displayName: p?.displayName || 'Player',
        avatar: p?.avatar || null,
        score: s.validationScore,
        isWinner: s.userId === winnerId
      };
    })
  );

  // Resolve winner name
  let winnerName = null;
  if (winnerId) {
    const wp = await PlayerProfile.findOne({ userId: winnerId }).lean();
    winnerName = wp?.displayName || 'Player';
  }

  sendSuccess(res, {
    challengeId: req.params.id,
    winnerId,
    winnerName,
    resolved: true,
    ranking: enrichedRanking
  }, 'Challenge resolved');
}));

// ── GET /api/v1/challenges/my ────────────────────────
// Phase 2.4.3: Enriched with submissions + resolve status
// Phase 2.4.4: Submissions include displayName + avatar, winner resolved
router.get('/my', protect, asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await challengeService.getUserChallenges(req.user.id, {
    page: parseInt(page) || 1, limit: parseInt(limit) || 20
  });

  // Enrich each challenge with submissions and resolve status
  const enriched = await Promise.all(result.challenges.map(async (c) => {
    const resolveCheck = await challengeService.canResolve(c.id);
    const { submissions } = await challengeService.getSubmissions(c.id, { limit: 50 });

    // Phase 2.4.4: Batch-load profiles for all submitters
    const userIds = [...new Set(submissions.map(s => s.userId))];
    const profiles = await PlayerProfile.find({ userId: { $in: userIds } }).lean();
    const profileMap = {};
    profiles.forEach(p => { profileMap[p.userId.toString()] = p; });

    // Resolve winner name
    let winnerName = null;
    if (c.winnerId) {
      const wp = profileMap[c.winnerId] || await PlayerProfile.findOne({ userId: c.winnerId }).lean();
      winnerName = wp?.displayName || 'Player';
    }

    return {
      ...c,
      winnerName,
      canResolve: resolveCheck.canResolve,
      resolveBlockReason: resolveCheck.reason,
      submittedCount: resolveCheck.submittedCount,
      totalParticipants: resolveCheck.totalParticipants,
      submissions: submissions.map(s => {
        const p = profileMap[s.userId] || {};
        return {
          userId: s.userId,
          displayName: p.displayName || 'Player',
          avatar: p.avatar || null,
          validationScore: s.validationScore,
          status: s.status,
          proofText: s.proofText?.slice(0, 100),
          proofImageUrls: s.proofImageUrls,
          validatedAt: s.validatedAt,
          aiExplanation: s.aiExplanation
        };
      })
    };
  }));

  sendSuccess(res, { ...result, challenges: enriched });
}));

// ── GET /api/v1/challenges/:id ───────────────────────
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const challenge = await challengeService.getChallengeById(req.params.id);
  if (!challenge) return sendError(res, 'Challenge not found', 404);

  // Include can-resolve status
  const resolveCheck = await challengeService.canResolve(req.params.id);

  sendSuccess(res, {
    ...challengeService.sanitizeChallenge(challenge),
    canResolve: resolveCheck.canResolve,
    resolveBlockReason: resolveCheck.reason
  });
}));

// ── GET /api/v1/challenges/:id/submissions ───────────
router.get('/:id/submissions', protect, asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await challengeService.getSubmissions(req.params.id, {
    page: parseInt(page) || 1, limit: parseInt(limit) || 20
  });
  sendSuccess(res, result);
}));

// ── POST /api/v1/challenges/:id/cancel ───────────────
router.post('/:id/cancel', protect, asyncHandler(async (req, res) => {
  const challenge = await challengeService.getChallengeById(req.params.id);
  if (!challenge) return sendError(res, 'Challenge not found', 404);
  if (challenge.creatorId.toString() !== req.user.id) {
    return sendError(res, 'Only the creator can cancel', 403);
  }

  const c = await challengeService.transitionState(req.params.id, 'CANCELLED');
  await historyService.recordEvent(req.user.id, BEHAVIORAL_EVENT_TYPES.CHALLENGE_CANCELLED, {
    challengeId: req.params.id
  });

  // Phase 3.1.5: Emit domain event for socket transport
  auraEvents.emitEvent(EVENTS.CHALLENGE_CANCELLED, {
    challengeId: req.params.id,
    auraChallengeId: challenge.auraChallengeId,
    creatorId: req.user.id,
    title: challenge.title
  });

  sendSuccess(res, challengeService.sanitizeChallenge(c), 'Challenge cancelled');
}));

module.exports = router;
