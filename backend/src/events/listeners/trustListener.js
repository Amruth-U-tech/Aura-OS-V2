const auraEvents = require('../eventBus');
const { EVENTS } = require('../eventConstants');
const trustService = require('../../services/domains/trustDomainService');

// ======================================================
// TRUST LISTENER — Phase 3.1
// Reacts to domain events and updates trust scores
// Trust domain service is the ONLY authority for trust
//
// After trust update, emits PLAYER_TRUST_CHANGED
// so socket listener can broadcast to frontend
//
// Must NOT: contain XP logic, challenge resolution logic
// ======================================================

const register = () => {
  // ── Challenge Validated → Update Trust ─────────────
  auraEvents.registerListener(EVENTS.CHALLENGE_VALIDATED, 'trust:challenge.validated', async (data) => {
    if (!data.userId || data.validationScore === undefined) return;

    const source = data.isWinner ? 'CHALLENGE_WIN' : 'CHALLENGE_SUBMISSION';
    const profile = await trustService.recordValidation(data.userId, data.validationScore, source);

    auraEvents.emitEvent(EVENTS.PLAYER_TRUST_CHANGED, {
      userId: data.userId,
      trustScore: profile.trustScore,
      tier: profile.tier,
      source
    });
  });

  // ── Task Expired → Deadline Miss Penalty ──────────
  auraEvents.registerListener(EVENTS.TASK_EXPIRED, 'trust:task.expired', async (data) => {
    if (!data.userId) return;

    const profile = await trustService.recordDeadlineMiss(data.userId);

    auraEvents.emitEvent(EVENTS.PLAYER_TRUST_CHANGED, {
      userId: data.userId,
      trustScore: profile.trustScore,
      tier: profile.tier,
      source: 'DEADLINE_MISS'
    });
  });

  // ── Challenge Resolved → Update Winner Trust ──────
  auraEvents.registerListener(EVENTS.CHALLENGE_RESOLVED, 'trust:challenge.resolved', async (data) => {
    // Winner gets trust boost
    if (data.winnerId && data.winnerValidationScore !== undefined) {
      const profile = await trustService.recordValidation(
        data.winnerId, data.winnerValidationScore, 'CHALLENGE_WIN'
      );
      auraEvents.emitEvent(EVENTS.PLAYER_TRUST_CHANGED, {
        userId: data.winnerId,
        trustScore: profile.trustScore,
        tier: profile.tier,
        source: 'CHALLENGE_WIN'
      });
    }
  });

  console.log('[EventBus] ✅ Trust listeners registered');
};

module.exports = { register };
