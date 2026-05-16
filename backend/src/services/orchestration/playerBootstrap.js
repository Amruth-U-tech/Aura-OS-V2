const playerProfileService = require('../domains/playerProfileDomainService');
const trustService = require('../domains/trustDomainService');
const historyService = require('../historyService');
const { BEHAVIORAL_EVENT_TYPES } = require('../../constants/historyConstants');

// ======================================================
// PLAYER BOOTSTRAP ORCHESTRATOR
// Triggered on registration: creates PlayerProfile + TrustProfile
// Ensures a new player is fully initialized before first login
// Must NOT: contain auth logic or credential handling
// ======================================================

const bootstrapNewPlayer = async (userId, userData = {}) => {
  // 1. Create PlayerProfile with defaults
  const profile = await playerProfileService.createProfile(userId, {
    displayName: userData.playerName || null,
    country: userData.country || null,
    timezone: userData.timezone || 'Asia/Kolkata'
  });

  // 2. Create TrustProfile with neutral score
  const trustProfile = await trustService.getOrCreate(userId);

  // 3. Log onboarding event
  await historyService.recordEvent(userId, BEHAVIORAL_EVENT_TYPES.ONBOARDING_COMPLETED, {
    displayName: profile.displayName,
    initialLevel: profile.level,
    initialXp: profile.xp,
    initialTrustScore: trustProfile.trustScore
  });

  return { profile, trustProfile };
};

module.exports = { bootstrapNewPlayer };
