const socketRegistry = require('./socketRegistry');
const PlayerProfile = require('../models/PlayerProfile');

// ======================================================
// SOCKET EVENT EMITTER — Phase 3.1.6
// The ONLY authorized way to broadcast realtime events
// Backend services call THIS to push authoritative state
//
// Phase 3.1.6 FIX — ROOT CAUSE ADDRESSED:
//   All challenge lifecycle events are now emitted to EACH
//   PARTICIPANT's player room directly, not just challenge room.
//   This ensures receiver-side (player2) gets updates instantly
//   WITHOUT needing to join the challenge:AURA-CHL-XXX room first.
//
// Strategy: DUAL EMIT
//   1. Emit to challenge:AURA-CHL-XXX room (for participants who joined)
//   2. Emit to each participant's player:AURA-PLR-XXX room (guaranteed delivery)
//
// Must NOT: mutate data, calculate logic, read from DB
// ======================================================

let _io = null;

// 5-minute AuraPlayerId cache to avoid repeated DB lookups
const _auraIdCache = new Map();
const _CACHE_TTL = 5 * 60 * 1000;

const _resolveAuraPlayerId = async (userId) => {
  if (!userId) return null;
  const key = userId.toString();
  const cached = _auraIdCache.get(key);
  if (cached && Date.now() - cached.ts < _CACHE_TTL) return cached.v;

  const profile = await PlayerProfile.findOne({ userId }).select('auraPlayerId').lean();
  if (profile?.auraPlayerId) {
    _auraIdCache.set(key, { v: profile.auraPlayerId, ts: Date.now() });
    return profile.auraPlayerId;
  }
  return null;
};

// ── Inject Socket.IO server instance at boot ──────────
const initialize = (io) => {
  _io = io;
};

// ── Guard: ensure initialization ──────────────────────
const getIO = () => {
  if (!_io) throw new Error('[SocketEmitter] Not initialized — call initialize(io) first');
  return _io;
};

// ──────────────────────────────────────────────────────
// PLAYER-SCOPED EVENTS
// Sent ONLY to the specific player's private room
// ──────────────────────────────────────────────────────

const emitToPlayer = (auraPlayerId, eventName, payload) => {
  const room = `player:${auraPlayerId}`;
  getIO().to(room).emit(eventName, payload);
};

const playerXpUpdated = (auraPlayerId, data) =>
  emitToPlayer(auraPlayerId, 'player.xp.updated', data);

const playerTrustUpdated = (auraPlayerId, data) =>
  emitToPlayer(auraPlayerId, 'player.trust.updated', data);

const playerLevelUp = (auraPlayerId, data) =>
  emitToPlayer(auraPlayerId, 'player.level.up', data);

const playerStreakUpdated = (auraPlayerId, data) =>
  emitToPlayer(auraPlayerId, 'player.streak.updated', data);

const playerNotification = (auraPlayerId, data) =>
  emitToPlayer(auraPlayerId, 'player.notification', data);

const playerFriendRequest = (auraPlayerId, data) =>
  emitToPlayer(auraPlayerId, 'player.friend.request', data);

const playerChallengeInvite = (auraPlayerId, data) =>
  emitToPlayer(auraPlayerId, 'player.challenge.invite', data);

const playerVoucherUnlocked = (auraPlayerId, data) =>
  emitToPlayer(auraPlayerId, 'player.voucher.unlocked', data);

// ──────────────────────────────────────────────────────
// HUB-SCOPED EVENTS
// ──────────────────────────────────────────────────────

const emitToHub = (auraHubId, eventName, payload) => {
  const room = `hub:${auraHubId}`;
  getIO().to(room).emit(eventName, payload);
};

const hubActivityCreated = (auraHubId, data) =>
  emitToHub(auraHubId, 'hub.activity.created', data);

const hubMemberJoined = (auraHubId, data) =>
  emitToHub(auraHubId, 'hub.member.joined', data);

const hubMemberLeft = (auraHubId, data) =>
  emitToHub(auraHubId, 'hub.member.left', data);

const hubChallengeCreated = (auraHubId, data) =>
  emitToHub(auraHubId, 'hub.challenge.created', data);

const hubAnnouncement = (auraHubId, data) =>
  emitToHub(auraHubId, 'hub.announcement', data);

// ──────────────────────────────────────────────────────
// CHALLENGE-SCOPED EVENTS — Phase 3.1.6 DUAL EMIT
//
// ROOT CAUSE FIX:
// Challenge events are emitted to EACH participant's player room.
// Players are guaranteed to be in their player:AURA-PLR-XXX room
// at all times (auto-joined on connect). They are NOT guaranteed
// to be in the challenge:AURA-CHL-XXX room (requires explicit join).
//
// SOLUTION: emitToParticipants(userIds, eventName, payload)
//   Resolves each userId → auraPlayerId → emits to player room.
//   Also emits to challenge room for any participants who joined it.
// ──────────────────────────────────────────────────────

const emitToChallenge = (auraChallengeId, eventName, payload) => {
  const room = `challenge:${auraChallengeId}`;
  getIO().to(room).emit(eventName, payload);
};

// Phase 3.1.6: Primary emit function for all challenge lifecycle events
// participantUserIds: array of userId strings (from challenge.participants)
const emitToParticipants = async (participantUserIds, auraChallengeId, eventName, payload) => {
  const io = getIO();
  const seen = new Set();

  // Also emit to challenge room (catches any participants who manually joined it)
  if (auraChallengeId) {
    io.to(`challenge:${auraChallengeId}`).emit(eventName, payload);
  }

  // Emit to each participant's guaranteed player room
  for (const userId of participantUserIds) {
    if (!userId || seen.has(userId.toString())) continue;
    seen.add(userId.toString());

    const auraId = await _resolveAuraPlayerId(userId);
    if (auraId) {
      io.to(`player:${auraId}`).emit(eventName, payload);
    }
  }
};

// Convenience: extract userIds from participants array
const emitChallengeEvent = async (challenge, eventName, payload) => {
  if (!challenge) return;
  const participantIds = (challenge.participants || [])
    .map(p => p.userId?.toString?.() || p.userId)
    .filter(Boolean);
  await emitToParticipants(participantIds, challenge.auraChallengeId, eventName, payload);
};

// Legacy convenience wrappers (still work — emit to challenge room)
const challengeUpdated = (auraChallengeId, data) =>
  emitToChallenge(auraChallengeId, 'challenge.updated', data);

const challengeSubmissionCreated = (auraChallengeId, data) =>
  emitToChallenge(auraChallengeId, 'challenge.submission.created', data);

const challengeResolved = (auraChallengeId, data) =>
  emitToChallenge(auraChallengeId, 'challenge.resolved', data);

const challengeCountdown = (auraChallengeId, data) =>
  emitToChallenge(auraChallengeId, 'challenge.countdown', data);

// ──────────────────────────────────────────────────────
// SYSTEM-WIDE UTILITY
// ──────────────────────────────────────────────────────

const emitToUser = (userId, eventName, payload) => {
  const socketIds = socketRegistry.getSocketsByUserId(userId);
  const io = getIO();
  for (const sid of socketIds) {
    io.to(sid).emit(eventName, payload);
  }
};

module.exports = {
  initialize,
  // Player events
  emitToPlayer,
  playerXpUpdated,
  playerTrustUpdated,
  playerLevelUp,
  playerStreakUpdated,
  playerNotification,
  playerFriendRequest,
  playerChallengeInvite,
  playerVoucherUnlocked,
  // Hub events
  emitToHub,
  hubActivityCreated,
  hubMemberJoined,
  hubMemberLeft,
  hubChallengeCreated,
  hubAnnouncement,
  // Challenge events
  emitToChallenge,
  emitToParticipants,    // Phase 3.1.6: PRIMARY - sends to all participant player rooms
  emitChallengeEvent,    // Phase 3.1.6: Convenience - extracts userIds from challenge object
  challengeUpdated,
  challengeSubmissionCreated,
  challengeResolved,
  challengeCountdown,
  // Utility
  emitToUser
};
