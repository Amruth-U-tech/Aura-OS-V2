const challengeService = require('./domains/challengeDomainService');
const playerProfileService = require('./domains/playerProfileDomainService');
const Challenge = require('../models/Challenge');
const ChallengeSubmission = require('../models/ChallengeSubmission');
const auraEvents = require('../events/eventBus');
const { EVENTS } = require('../events/eventConstants');

// ======================================================
// CHALLENGE SCHEDULER SERVICE — Phase 3.1 (Event-Driven)
// Owns: Scheduled activation, expiration, AUTO-RESOLUTION
// Runs on interval — NOT triggered by API calls
//
// Phase 3.1: Emits domain events instead of directly calling
// XP/Trust/History services. Listeners handle reactions.
// ======================================================

const SCHEDULER_INTERVAL_MS = 60 * 1000; // Check every minute
let schedulerTimer = null;

const startChallengeScheduler = () => {
  if (schedulerTimer) return;

  console.log('📅 [ChallengeScheduler] Started (interval: 60s)');

  schedulerTimer = setInterval(async () => {
    try {
      await processScheduledChallenges();
      await processExpiredChallenges();
      await autoResolveDeadlinedChallenges();
    } catch (err) {
      console.error('[ChallengeScheduler] Error:', err.message);
    }
  }, SCHEDULER_INTERVAL_MS);
};

// ── Process SCHEDULED → ACTIVE transitions ───────────
const processScheduledChallenges = async () => {
  const scheduled = await challengeService.getScheduledChallenges();
  if (scheduled.length === 0) return;

  for (const challenge of scheduled) {
    try {
      await challengeService.activateChallenge(challenge._id);
      console.log(`📅 [ChallengeScheduler] Activated: ${challenge.auraChallengeId}`);

      auraEvents.emitEvent(EVENTS.CHALLENGE_ACTIVATED, {
        challengeId: challenge._id.toString(),
        auraChallengeId: challenge.auraChallengeId,
        title: challenge.title,
        creatorId: challenge.creatorId?.toString()
      });
    } catch (err) {
      console.error(`[ChallengeScheduler] Failed to activate ${challenge._id}:`, err.message);
    }
  }
};

// ── Process expired challenges → EXPIRED ─────────────
const processExpiredChallenges = async () => {
  const expired = await challengeService.getExpiredChallenges();
  if (expired.length === 0) return;

  for (const challenge of expired) {
    try {
      await challengeService.transitionState(challenge._id, 'EXPIRED');
      console.log(`⏰ [ChallengeScheduler] Expired: ${challenge.auraChallengeId}`);

      auraEvents.emitEvent(EVENTS.CHALLENGE_EXPIRED, {
        challengeId: challenge._id.toString(),
        auraChallengeId: challenge.auraChallengeId,
        title: challenge.title,
        participantIds: challenge.participants?.map(p => p.userId.toString()) || []
      });
    } catch (err) {
      console.error(`[ChallengeScheduler] Failed to expire ${challenge._id}:`, err.message);
    }
  }
};

// ── Auto-resolve challenges past deadline ────────────
const autoResolveDeadlinedChallenges = async () => {
  const now = new Date();

  const candidates = await Challenge.find({
    status: { $in: ['ACTIVE', 'SUBMISSION', 'WAITING_FOR_PARTICIPANTS', 'LOCKED'] },
    endAt: { $lte: now }
  });

  if (candidates.length === 0) return;

  for (const challenge of candidates) {
    try {
      const submissions = await ChallengeSubmission.find({
        challengeId: challenge._id,
        validationScore: { $ne: null }
      }).sort({ validationScore: -1 }).lean();

      if (submissions.length === 0) continue;

      console.log(`🤖 [AutoResolve] Resolving ${challenge.auraChallengeId} (${submissions.length} submissions)`);

      // Transition through states to COMPLETED
      let c = challenge;
      try {
        if (['ACTIVE'].includes(c.status)) c = await challengeService.transitionState(c._id, 'SUBMISSION');
        if (['SUBMISSION', 'WAITING_FOR_PARTICIPANTS'].includes(c.status)) c = await challengeService.transitionState(c._id, 'LOCKED');
        if (c.status === 'LOCKED') c = await challengeService.transitionState(c._id, 'RESOLUTION');
      } catch { c = await challengeService.getChallengeById(challenge._id); }

      // Find winner (highest validation score)
      const bestSubmission = submissions[0];
      let winnerId = null;
      const loserIds = [];

      if (bestSubmission && bestSubmission.validationScore >= 50) {
        winnerId = bestSubmission.userId.toString();
        await Challenge.findByIdAndUpdate(challenge._id, { winnerId });

        // Update profile counters (lightweight, stays here)
        await playerProfileService.incrementCounter(winnerId, 'challengeWins', 1);

        // Collect loser IDs
        for (const p of c.participants) {
          if (p.userId.toString() !== winnerId) {
            await playerProfileService.incrementCounter(p.userId, 'challengeLosses', 1);
            loserIds.push(p.userId.toString());
          }
        }
      }

      await challengeService.transitionState(challenge._id, 'COMPLETED');

      // Phase 3.1: Emit SINGLE domain event — ALL listeners react
      auraEvents.emitEvent(EVENTS.CHALLENGE_RESOLVED, {
        challengeId: challenge._id.toString(),
        auraChallengeId: challenge.auraChallengeId,
        title: c.title,
        winnerId,
        winnerName: winnerId ? await _getPlayerName(winnerId) : null,
        winnerValidationScore: bestSubmission?.validationScore,
        loserIds,
        challenge: c, // full object for XP pipeline
        autoResolved: true,
        participantCount: c.participants?.length || 0
      });

      console.log(`✅ [AutoResolve] ${challenge.auraChallengeId} — Winner: ${winnerId || 'none'}`);
    } catch (err) {
      console.error(`[AutoResolve] Failed ${challenge._id}:`, err.message);
    }
  }
};

// ── Weekly XP Reset ──────────────────────────────────
const processWeeklyReset = async () => {
  try {
    const now = new Date();
    if (now.getDay() === 1) {
      const PlayerProfile = require('../models/PlayerProfile');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const recentReset = await PlayerProfile.findOne({
        weeklyXpResetAt: { $gte: today }
      });

      if (!recentReset) {
        console.log('🔄 [WeeklyReset] Resetting weekly XP...');
        await playerProfileService.resetWeeklyXp();
        console.log('✅ [WeeklyReset] Weekly XP reset complete');
      }
    }
  } catch (err) {
    console.error('[WeeklyReset] Error:', err.message);
  }
};

// ── Helper: get player display name ──────────────────
const _getPlayerName = async (userId) => {
  try {
    const profile = await playerProfileService.getByUserId(userId);
    return profile?.displayName || 'Player';
  } catch { return 'Player'; }
};

const stopChallengeScheduler = () => {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log('📅 [ChallengeScheduler] Stopped');
  }
};

module.exports = {
  startChallengeScheduler,
  stopChallengeScheduler,
  processScheduledChallenges,
  processExpiredChallenges,
  processWeeklyReset
};
