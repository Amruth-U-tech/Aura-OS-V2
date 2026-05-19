const HubMembership = require('../models/HubMembership');
const Hub = require('../models/Hub');
const Challenge = require('../models/Challenge');
const socketRegistry = require('./socketRegistry');

// ======================================================
// ROOM MANAGER — Phase 3.0
// Owns: deterministic room topology and authorization
// Validates membership BEFORE allowing room joins
// Room Format:
//   player:AURA-PLR-XXXX    — private player channel
//   hub:AURA-HUB-XXXX       — shared hub channel
//   challenge:AURA-CHL-XXXX — competition channel
// Must NOT: broadcast events, own business logic
// ======================================================

const ROOM_PREFIX = {
  PLAYER: 'player:',
  HUB: 'hub:',
  CHALLENGE: 'challenge:'
};

// ── Build deterministic room names ────────────────────
const buildPlayerRoom = (auraPlayerId) => `${ROOM_PREFIX.PLAYER}${auraPlayerId}`;
const buildHubRoom = (auraHubId) => `${ROOM_PREFIX.HUB}${auraHubId}`;
const buildChallengeRoom = (auraChallengeId) => `${ROOM_PREFIX.CHALLENGE}${auraChallengeId}`;

// ── Auto-join player's own private room ───────────────
const joinPlayerRoom = (socket) => {
  const room = buildPlayerRoom(socket.data.auraPlayerId);
  socket.join(room);
  socketRegistry.joinRoom(socket.id, room);
  return room;
};

// ── Hub Room: validate membership before joining ──────
const joinHubRoom = async (socket, auraHubId) => {
  const tag = '[Room:Hub]';
  const userId = socket.data.userId;

  // Resolve hub by auraHubId
  const hub = await Hub.findOne({ auraHubId }).select('_id').lean();
  if (!hub) {
    console.warn(`${tag} Denied: hub ${auraHubId} not found`);
    return { success: false, error: 'HUB_NOT_FOUND' };
  }

  // Check active membership
  const membership = await HubMembership.findOne({
    hubId: hub._id,
    userId,
    status: 'ACTIVE'
  }).lean();

  if (!membership) {
    console.warn(`${tag} Denied: ${socket.data.auraPlayerId} not a member of ${auraHubId}`);
    return { success: false, error: 'NOT_A_MEMBER' };
  }

  const room = buildHubRoom(auraHubId);
  socket.join(room);
  socketRegistry.joinRoom(socket.id, room);
  console.info(`${tag} ${socket.data.auraPlayerId} connected to room ${room}`);
  return { success: true, room };
};

// ── Challenge Room: validate participation ────────────
const joinChallengeRoom = async (socket, auraChallengeId) => {
  const tag = '[Room:Challenge]';
  const userId = socket.data.userId;

  const challenge = await Challenge.findOne({ auraChallengeId })
    .select('participants status')
    .lean();

  if (!challenge) {
    console.warn(`${tag} Denied: challenge ${auraChallengeId} not found`);
    return { success: false, error: 'CHALLENGE_NOT_FOUND' };
  }

  // Only active/submission challenges allow room joins
  const allowedStatuses = ['ACTIVE', 'SUBMISSION', 'LOCKED'];
  if (!allowedStatuses.includes(challenge.status)) {
    console.warn(`${tag} Denied: challenge ${auraChallengeId} not in joinable status (${challenge.status})`);
    return { success: false, error: 'CHALLENGE_NOT_ACTIVE' };
  }

  const isParticipant = challenge.participants.some(
    p => p.userId.toString() === userId
  );

  if (!isParticipant) {
    console.warn(`${tag} Denied: ${socket.data.auraPlayerId} not in challenge ${auraChallengeId}`);
    return { success: false, error: 'NOT_A_PARTICIPANT' };
  }

  const room = buildChallengeRoom(auraChallengeId);
  socket.join(room);
  socketRegistry.joinRoom(socket.id, room);
  console.info(`${tag} ${socket.data.auraPlayerId} joined ${room}`);
  return { success: true, room };
};

// ── Leave a room safely ───────────────────────────────
const leaveRoom = (socket, room) => {
  socket.leave(room);
  socketRegistry.leaveRoom(socket.id, room);
};

module.exports = {
  ROOM_PREFIX,
  buildPlayerRoom,
  buildHubRoom,
  buildChallengeRoom,
  joinPlayerRoom,
  joinHubRoom,
  joinChallengeRoom,
  leaveRoom
};
