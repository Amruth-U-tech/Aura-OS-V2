const socketRegistry = require('./socketRegistry');

// ======================================================
// SOCKET EVENT EMITTER — Phase 3.0
// The ONLY authorized way to broadcast realtime events
// Backend services call THIS to push authoritative state
// Requires the Socket.IO server instance (injected at boot)
// Must NOT: mutate data, calculate logic, read from DB
// ======================================================

let _io = null;

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

// Convenience wrappers for common player events
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
// Sent to ALL connected members of a hub
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
// CHALLENGE-SCOPED EVENTS
// Sent ONLY to challenge participants
// ──────────────────────────────────────────────────────

const emitToChallenge = (auraChallengeId, eventName, payload) => {
  const room = `challenge:${auraChallengeId}`;
  getIO().to(room).emit(eventName, payload);
};

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

// Emit to a specific userId (resolves all their sockets)
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
  challengeUpdated,
  challengeSubmissionCreated,
  challengeResolved,
  challengeCountdown,
  // Utility
  emitToUser
};
