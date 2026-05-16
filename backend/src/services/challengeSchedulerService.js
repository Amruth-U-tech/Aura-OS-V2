const challengeService = require('./domains/challengeDomainService');
const playerProfileService = require('./domains/playerProfileDomainService');
const trustService = require('./domains/trustDomainService');
const xpPipeline = require('./orchestration/xpPipeline');
const historyService = require('./historyService');
const { BEHAVIORAL_EVENT_TYPES } = require('../constants/historyConstants');
const Challenge = require('../models/Challenge');
const ChallengeSubmission = require('../models/ChallengeSubmission');

// ======================================================
// CHALLENGE SCHEDULER SERVICE — Phase 2.4.3
// Owns: Scheduled activation, expiration, AUTO-RESOLUTION
// Runs on interval — NOT triggered by API calls
// Phase 2.4.3: Added auto-resolve for expired challenges
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
      await autoResolveDeadlinedChallenges(); // Phase 2.4.3
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
    } catch (err) {
      console.error(`[ChallengeScheduler] Failed to expire ${challenge._id}:`, err.message);
    }
  }
};

// ── Phase 2.4.3: Auto-resolve challenges past deadline ──
// If a challenge has a passed deadline and has at least 1 validated
// submission but hasn't been manually resolved, auto-resolve it
const autoResolveDeadlinedChallenges = async () => {
  const now = new Date();

  // Find challenges where:
  // - Status is ACTIVE, SUBMISSION, WAITING_FOR_PARTICIPANTS, or LOCKED
  // - Deadline has passed
  // - At least 1 submission exists
  const candidates = await Challenge.find({
    status: { $in: ['ACTIVE', 'SUBMISSION', 'WAITING_FOR_PARTICIPANTS', 'LOCKED'] },
    endAt: { $lte: now }
  });

  if (candidates.length === 0) return;

  for (const challenge of candidates) {
    try {
      // Get submissions for this challenge
      const submissions = await ChallengeSubmission.find({
        challengeId: challenge._id,
        validationScore: { $ne: null }
      }).sort({ validationScore: -1 }).lean();

      if (submissions.length === 0) {
        // No submissions at all — just expire
        continue; // Already handled by processExpiredChallenges
      }

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

      if (bestSubmission && bestSubmission.validationScore >= 50) {
        winnerId = bestSubmission.userId.toString();
        await Challenge.findByIdAndUpdate(challenge._id, { winnerId });

        // Award winner
        await xpPipeline.awardChallengeWin(winnerId, c);
        await historyService.recordEvent(winnerId, BEHAVIORAL_EVENT_TYPES.CHALLENGE_WON, {
          challengeId: challenge._id.toString(), title: c.title, autoResolved: true
        });
        await trustService.recordValidation(winnerId, bestSubmission.validationScore, 'CHALLENGE_WIN');
        await playerProfileService.incrementCounter(winnerId, 'challengeWins', 1);

        // Penalize losers
        for (const p of c.participants) {
          if (p.userId.toString() !== winnerId) {
            await xpPipeline.penalizeChallengeLoss(p.userId, c);
            await playerProfileService.incrementCounter(p.userId, 'challengeLosses', 1);
            await historyService.recordEvent(p.userId, BEHAVIORAL_EVENT_TYPES.CHALLENGE_LOST, {
              challengeId: challenge._id.toString(), title: c.title, autoResolved: true
            });
          }
        }
      }

      await challengeService.transitionState(challenge._id, 'COMPLETED');
      console.log(`✅ [AutoResolve] ${challenge.auraChallengeId} — Winner: ${winnerId || 'none'}`);
    } catch (err) {
      console.error(`[AutoResolve] Failed ${challenge._id}:`, err.message);
    }
  }
};

// ── Weekly XP Reset (runs once per startup check) ────
const processWeeklyReset = async () => {
  try {
    // Check if it's Monday and reset hasn't happened today
    const now = new Date();
    if (now.getDay() === 1) { // Monday
      // Simple approach: check if any profile has weeklyXpResetAt as today
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
