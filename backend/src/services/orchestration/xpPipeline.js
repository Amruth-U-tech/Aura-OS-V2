const playerProfileService = require('../domains/playerProfileDomainService');
const trustService = require('../domains/trustDomainService');
const rewardService = require('../domains/rewardTransactionDomainService');
const historyService = require('../historyService');
const { BEHAVIORAL_EVENT_TYPES } = require('../../constants/historyConstants');

// ======================================================
// XP PIPELINE ORCHESTRATOR
// The CENTRAL authority for ALL XP mutations in Aura OS
// Every XP change MUST flow through here — no exceptions
// Creates: RewardTransaction + BehavioralEvent + Profile update
// Must NOT: contain challenge logic or trust scoring
// ======================================================

// ── XP Constants ─────────────────────────────────────
const XP_REWARDS = {
  MISSION_COMPLETED: { LOW: 10, NORMAL: 25, HIGH: 50, ELITE: 100 },
  CHALLENGE_WON: 75,
  CHALLENGE_PARTICIPATED: 15,
  STREAK_BONUS: 5,         // per consecutive day
  MISSION_FAILED_PENALTY: -10,
  MISSION_EXPIRED_PENALTY: -5,
  CHALLENGE_LOSS_PENALTY: -20
};

// ── Level thresholds ─────────────────────────────────
// Level N threshold = sum of (i * 100) for i from 1 to N
// Level 1: 0-99, Level 2: 100-299, Level 3: 300-599, etc.
const getLevelForXp = (totalXp) => {
  let level = 1;
  let threshold = 100;
  while (totalXp >= threshold) {
    level++;
    threshold += level * 100;
  }
  return level;
};

// ── XP required for current level ────────────────────
// Returns: { xpIntoLevel, xpForLevel, progressPercent }
const getLevelProgress = (totalXp) => {
  let level = 1;
  let cumulativeXp = 0;
  let nextThreshold = 100;

  while (totalXp >= cumulativeXp + nextThreshold) {
    cumulativeXp += nextThreshold;
    level++;
    nextThreshold = level * 100;
  }

  const xpIntoLevel = totalXp - cumulativeXp;
  const xpForLevel = nextThreshold;
  const progressPercent = Math.min(100, Math.round((xpIntoLevel / xpForLevel) * 100));

  return { level, xpIntoLevel, xpForLevel, progressPercent };
};

// ── Award XP (creates full audit trail) ──────────────
const awardXp = async (userId, amount, type, referenceId = null, referenceType = null, description = '') => {
  const profile = await playerProfileService.getOrCreate(userId);
  const balanceBefore = profile.xp;
  const balanceAfter = Math.max(0, balanceBefore + amount);

  // 1. Create immutable transaction
  await rewardService.recordTransaction(userId, {
    type,
    amount,
    balanceBefore,
    balanceAfter,
    referenceId,
    referenceType,
    description
  });

  // 2. Update profile XP snapshot
  const totalXpEarned = amount > 0
    ? profile.totalXpEarned + amount
    : profile.totalXpEarned;

  const newLevel = getLevelForXp(totalXpEarned);
  const leveledUp = newLevel > profile.level;

  await playerProfileService.updateProgression(userId, {
    xp: balanceAfter,
    totalXpEarned,
    level: newLevel
  });

  // 2.5 Also increment weekly XP (for seasonal leaderboard)
  if (amount > 0) {
    await playerProfileService.incrementCounter(userId, 'weeklyXp', amount);
    await playerProfileService.incrementCounter(userId, 'weeklyVoucherXp', amount);
  }

  // 3. Log behavioral event
  const eventType = amount >= 0
    ? BEHAVIORAL_EVENT_TYPES.XP_GAINED
    : BEHAVIORAL_EVENT_TYPES.XP_LOST;

  await historyService.recordEvent(userId, eventType, {
    amount,
    balanceBefore,
    balanceAfter,
    type,
    referenceId,
    description
  });

  // 4. Log level up if applicable
  if (leveledUp) {
    await historyService.recordEvent(userId, BEHAVIORAL_EVENT_TYPES.LEVEL_UP, {
      previousLevel: profile.level,
      newLevel,
      totalXpEarned
    });
  }

  return { balanceBefore, balanceAfter, amount, level: newLevel, leveledUp };
};

// ── Mission completion XP ────────────────────────────
const awardMissionXp = async (userId, mission) => {
  const priority = mission.priority || 'NORMAL';
  const amount = XP_REWARDS.MISSION_COMPLETED[priority] || 25;
  return awardXp(
    userId, amount, 'XP_EARNED_MISSION',
    mission._id, 'TASK',
    `Completed mission: ${mission.title}`
  );
};

// ── Mission failure penalty ──────────────────────────
const penalizeMissionFailure = async (userId, mission) => {
  return awardXp(
    userId, XP_REWARDS.MISSION_FAILED_PENALTY, 'XP_PENALTY_FAILURE',
    mission._id, 'TASK',
    `Mission failed: ${mission.title}`
  );
};

// ── Mission expiry penalty ───────────────────────────
const penalizeMissionExpiry = async (userId, mission) => {
  return awardXp(
    userId, XP_REWARDS.MISSION_EXPIRED_PENALTY, 'XP_PENALTY_FAILURE',
    mission._id, 'TASK',
    `Mission expired: ${mission.title}`
  );
};

// ── Challenge win XP ─────────────────────────────────
const awardChallengeWin = async (userId, challenge) => {
  const stakeBonus = challenge.stakeXp || 0;
  const amount = XP_REWARDS.CHALLENGE_WON + stakeBonus;
  return awardXp(
    userId, amount, 'XP_EARNED_CHALLENGE',
    challenge._id, 'CHALLENGE',
    `Won challenge: ${challenge.title}`
  );
};

// ── Challenge loss penalty ───────────────────────────
const penalizeChallengeLoss = async (userId, challenge) => {
  const stakeLoss = challenge.stakeXp ? -challenge.stakeXp : XP_REWARDS.CHALLENGE_LOSS_PENALTY;
  return awardXp(
    userId, stakeLoss, 'XP_PENALTY_FAILURE',
    challenge._id, 'CHALLENGE',
    `Lost challenge: ${challenge.title}`
  );
};

// ── Streak bonus ─────────────────────────────────────
const awardStreakBonus = async (userId, streakDays) => {
  const amount = XP_REWARDS.STREAK_BONUS * streakDays;
  return awardXp(userId, amount, 'XP_EARNED_STREAK', null, 'STREAK',
    `Streak bonus: ${streakDays} day streak`
  );
};

module.exports = {
  awardXp,
  awardMissionXp,
  penalizeMissionFailure,
  penalizeMissionExpiry,
  awardChallengeWin,
  penalizeChallengeLoss,
  awardStreakBonus,
  XP_REWARDS,
  getLevelForXp,
  getLevelProgress
};
