const auraEvents = require('../eventBus');
const { EVENTS } = require('../eventConstants');
const xpPipeline = require('../../services/orchestration/xpPipeline');

// ======================================================
// XP LISTENER — Phase 3.1
// Reacts to domain events and processes XP mutations
// XP pipeline is the ONLY authority for XP changes
// This listener is the ONLY consumer that triggers XP
//
// IMPORTANT: After XP award completes, this listener
// emits PLAYER_XP_UPDATED and optionally PLAYER_LEVEL_UP
// so downstream listeners (socket, history) can react
//
// Must NOT: contain challenge/task logic, emit non-XP events
// ======================================================

const register = () => {
  // ── Task Completed → Award Mission XP ──────────────
  auraEvents.registerListener(EVENTS.TASK_COMPLETED, 'xp:task.completed', async (data) => {
    if (!data.userId || !data.mission) return;

    const result = await xpPipeline.awardMissionXp(data.userId, data.mission);

    // Emit XP updated event for downstream consumers
    auraEvents.emitEvent(EVENTS.PLAYER_XP_UPDATED, {
      userId: data.userId,
      amount: result.amount,
      balanceAfter: result.balanceAfter,
      type: 'XP_EARNED_MISSION',
      level: result.level,
      source: 'task.completed'
    });

    if (result.leveledUp) {
      auraEvents.emitEvent(EVENTS.PLAYER_LEVEL_UP, {
        userId: data.userId,
        previousLevel: result.level - 1,
        newLevel: result.level,
        totalXpEarned: result.balanceAfter,
        source: 'task.completed'
      });
    }
  });

  // ── Task Failed → Penalize XP ─────────────────────
  auraEvents.registerListener(EVENTS.TASK_FAILED, 'xp:task.failed', async (data) => {
    if (!data.userId || !data.mission) return;

    const result = await xpPipeline.penalizeMissionFailure(data.userId, data.mission);

    auraEvents.emitEvent(EVENTS.PLAYER_XP_UPDATED, {
      userId: data.userId,
      amount: result.amount,
      balanceAfter: result.balanceAfter,
      type: 'XP_PENALTY_FAILURE',
      level: result.level,
      source: 'task.failed'
    });
  });

  // ── Task Expired → Penalize XP ─────────────────────
  auraEvents.registerListener(EVENTS.TASK_EXPIRED, 'xp:task.expired', async (data) => {
    if (!data.userId || !data.mission) return;

    const result = await xpPipeline.penalizeMissionExpiry(data.userId, data.mission);

    auraEvents.emitEvent(EVENTS.PLAYER_XP_UPDATED, {
      userId: data.userId,
      amount: result.amount,
      balanceAfter: result.balanceAfter,
      type: 'XP_PENALTY_FAILURE',
      level: result.level,
      source: 'task.expired'
    });
  });

  // ── Challenge Resolved → Award Winner / Penalize Losers ──
  auraEvents.registerListener(EVENTS.CHALLENGE_RESOLVED, 'xp:challenge.resolved', async (data) => {
    if (!data.challenge) return;

    // Award winner
    if (data.winnerId) {
      const winResult = await xpPipeline.awardChallengeWin(data.winnerId, data.challenge);
      auraEvents.emitEvent(EVENTS.PLAYER_XP_UPDATED, {
        userId: data.winnerId,
        amount: winResult.amount,
        balanceAfter: winResult.balanceAfter,
        type: 'XP_EARNED_CHALLENGE',
        level: winResult.level,
        source: 'challenge.resolved'
      });
      if (winResult.leveledUp) {
        auraEvents.emitEvent(EVENTS.PLAYER_LEVEL_UP, {
          userId: data.winnerId,
          previousLevel: winResult.level - 1,
          newLevel: winResult.level,
          totalXpEarned: winResult.balanceAfter,
          source: 'challenge.resolved'
        });
      }
    }

    // Penalize losers
    if (data.loserIds && Array.isArray(data.loserIds)) {
      for (const loserId of data.loserIds) {
        const loseResult = await xpPipeline.penalizeChallengeLoss(loserId, data.challenge);
        auraEvents.emitEvent(EVENTS.PLAYER_XP_UPDATED, {
          userId: loserId,
          amount: loseResult.amount,
          balanceAfter: loseResult.balanceAfter,
          type: 'XP_PENALTY_FAILURE',
          level: loseResult.level,
          source: 'challenge.resolved'
        });
      }
    }
  });

  console.log('[EventBus] ✅ XP listeners registered');
};

module.exports = { register };
