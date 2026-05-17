const auraEvents = require('../eventBus');
const { EVENTS } = require('../eventConstants');
const socketEmitter = require('../../realtime/socketEmitter');
const PlayerProfile = require('../../models/PlayerProfile');
const Challenge = require('../../models/Challenge');

// ======================================================
// SOCKET LISTENER — Phase 3.1.6
// Bridges domain events → realtime socket broadcasts
// This is TRANSPORT ONLY — no business logic here
//
// Phase 3.1.6 ROOT CAUSE FIX:
//   All challenge events now use emitToParticipants() which
//   sends to each participant's player:AURA-PLR-XXX room.
//   This ensures receiver-side (player2) gets all updates
//   WITHOUT needing to join the challenge:AURA-CHL-XXX room.
//
//   Additionally: new participation events (INVITED, ACCEPTED,
//   DECLINED, LEFT) are fully registered and transported.
//
// Must NOT: mutate data, calculate XP, read complex state
// ======================================================

const register = () => {
  // ── Task Events → Player Socket ─────────────────────
  auraEvents.registerListener(EVENTS.TASK_COMPLETED, 'socket:task.completed', async (data) => {
    const auraId = await _resolveAuraPlayerId(data.userId);
    if (!auraId) return;
    socketEmitter.emitToPlayer(auraId, 'player.notification', {
      type: 'TASK_COMPLETED',
      title: data.title,
      priority: data.priority,
      timestamp: Date.now()
    });
  });

  auraEvents.registerListener(EVENTS.TASK_CREATED, 'socket:task.created', async (data) => {
    const auraId = await _resolveAuraPlayerId(data.userId);
    if (!auraId) return;
    socketEmitter.emitToPlayer(auraId, 'player.task.created', {
      type: 'TASK_CREATED',
      title: data.title,
      priority: data.priority,
      missionType: data.missionType,
      timestamp: Date.now()
    });
  });

  // ── Player Events ──────────────────────────────────
  auraEvents.registerListener(EVENTS.PLAYER_XP_UPDATED, 'socket:player.xp.updated', async (data) => {
    const auraId = await _resolveAuraPlayerId(data.userId);
    if (!auraId) return;
    socketEmitter.playerXpUpdated(auraId, {
      xp: data.xp,
      delta: data.delta,
      source: data.source,
      timestamp: Date.now()
    });
  });

  auraEvents.registerListener(EVENTS.PLAYER_LEVEL_UP, 'socket:player.level.up', async (data) => {
    const auraId = await _resolveAuraPlayerId(data.userId);
    if (!auraId) return;
    socketEmitter.playerLevelUp(auraId, {
      newLevel: data.newLevel,
      oldLevel: data.oldLevel,
      timestamp: Date.now()
    });
  });

  auraEvents.registerListener(EVENTS.PLAYER_TRUST_CHANGED, 'socket:player.trust.changed', async (data) => {
    const auraId = await _resolveAuraPlayerId(data.userId);
    if (!auraId) return;
    socketEmitter.playerTrustUpdated(auraId, {
      trustScore: data.trustScore,
      tier: data.tier,
      timestamp: Date.now()
    });
  });

  // ── Social Events ──────────────────────────────────
  auraEvents.registerListener(EVENTS.FRIEND_REQUEST_SENT, 'socket:friend.request.sent', async (data) => {
    const receiverAuraId = await _resolveAuraPlayerId(data.receiverId);
    if (!receiverAuraId) return;
    const senderProfile = await PlayerProfile.findOne({ userId: data.senderId })
      .select('displayName auraPlayerId')
      .lean();
    socketEmitter.playerFriendRequest(receiverAuraId, {
      type: 'INCOMING_REQUEST',
      requestId: data.requestId,
      senderId: data.senderId,
      senderName: senderProfile?.displayName || data.senderName || 'Player',
      senderAuraId: senderProfile?.auraPlayerId || null,
      message: data.message,
      timestamp: Date.now()
    });
  });

  auraEvents.registerListener(EVENTS.FRIEND_ACCEPTED, 'socket:friend.accepted', async (data) => {
    const senderAuraId = await _resolveAuraPlayerId(data.senderId);
    const receiverAuraId = await _resolveAuraPlayerId(data.receiverId);

    if (senderAuraId) {
      socketEmitter.playerNotification(senderAuraId, {
        type: 'FRIEND_ACCEPTED',
        friendId: data.receiverId,
        friendName: data.receiverName,
        timestamp: Date.now()
      });
    }
    if (receiverAuraId) {
      socketEmitter.playerNotification(receiverAuraId, {
        type: 'FRIEND_ACCEPTED',
        friendId: data.senderId,
        friendName: data.senderName,
        timestamp: Date.now()
      });
    }
  });

  // ── Challenge Events — Phase 3.1.6 DUAL EMIT ──────
  // All challenge events use emitToParticipants() which sends to
  // each participant's guaranteed player:AURA-PLR-XXX room.
  // Helper: _loadParticipantIds(challengeId) fetches live participant list.

  // CHALLENGE_CREATED: Phase 3.1.7 — only cross-tab sync for creator
  // Target is NOT notified at creation — they get notified via CHALLENGE_INVITED
  auraEvents.registerListener(EVENTS.CHALLENGE_CREATED, 'socket:challenge.created', async (data) => {
    if (data.creatorId) {
      const creatorAuraId = await _resolveAuraPlayerId(data.creatorId);
      if (creatorAuraId) {
        socketEmitter.emitToPlayer(creatorAuraId, 'challenge.updated', {
          type: 'CHALLENGE_CREATED',
          challengeId: data.challengeId,
          auraChallengeId: data.auraChallengeId,
          title: data.title,
          status: 'DRAFT',
          timestamp: Date.now()
        });
      }
    }
  });

  // Phase 3.1.7: CHALLENGE_INVITED — creator pressed "Send Invitation" (formerly Activate)
  // Sends realtime invite notification directly to target's player room
  auraEvents.registerListener(EVENTS.CHALLENGE_INVITED, 'socket:challenge.invited', async (data) => {
    // Notify the invitee
    if (data.targetUserId) {
      const targetAuraId = await _resolveAuraPlayerId(data.targetUserId);
      if (targetAuraId) {
        socketEmitter.emitToPlayer(targetAuraId, 'player.challenge.invite', {
          type: 'CHALLENGE_INVITE',
          challengeId: data.challengeId,
          auraChallengeId: data.auraChallengeId,
          title: data.title,
          creatorId: data.creatorId,
          creatorName: data.creatorName || null,
          timestamp: Date.now()
        });
      }
    }
  });

  // Phase 3.1.7: CHALLENGE_ACCEPTED — notify ALL participants (creator + accepter)
  // For 1v1: newStatus = ACTIVE, triggers challenge.activated on frontend
  auraEvents.registerListener(EVENTS.CHALLENGE_ACCEPTED, 'socket:challenge.accepted', async (data) => {
    const participantIds = await _loadParticipantIds(data.challengeId);
    await socketEmitter.emitToParticipants(participantIds, data.auraChallengeId, 'challenge.updated', {
      type: 'PARTICIPANT_ACCEPTED',
      challengeId: data.challengeId,
      auraChallengeId: data.auraChallengeId,
      userId: data.userId,
      playerName: data.playerName || null,
      newStatus: data.newStatus || null,  // ACTIVE for 1v1, READY for hub
      timestamp: Date.now()
    });
  });

  // Phase 3.1.7: CHALLENGE_DECLINED — notify ALL participants INCLUDING the decliner
  // The key fix: load participants INCLUDING DECLINED status so both sides get the event
  auraEvents.registerListener(EVENTS.CHALLENGE_DECLINED, 'socket:challenge.declined', async (data) => {
    // Load ALL participant IDs (including the decliner who just got DECLINED status)
    const participantIds = await _loadAllParticipantIds(data.challengeId);
    await socketEmitter.emitToParticipants(participantIds, data.auraChallengeId, 'challenge.declined', {
      type: 'CHALLENGE_DECLINED',
      challengeId: data.challengeId,
      auraChallengeId: data.auraChallengeId,
      userId: data.userId,
      playerName: data.playerName || null,
      isCancelled: data.isCancelled,
      timestamp: Date.now()
    });
  });

  // Phase 3.1.7: CHALLENGE_LEFT — notify all remaining participants
  auraEvents.registerListener(EVENTS.CHALLENGE_LEFT, 'socket:challenge.left', async (data) => {
    const participantIds = await _loadAllParticipantIds(data.challengeId);
    await socketEmitter.emitToParticipants(participantIds, data.auraChallengeId, 'challenge.updated', {
      type: 'PARTICIPANT_LEFT',
      challengeId: data.challengeId,
      auraChallengeId: data.auraChallengeId,
      userId: data.userId,
      playerName: data.playerName || null,
      isCancelled: data.isCancelled,
      timestamp: Date.now()
    });
  });

  // Phase 3.1.7: CHALLENGE_READY — quorum met, notify all accepted participants
  auraEvents.registerListener(EVENTS.CHALLENGE_READY, 'socket:challenge.ready', async (data) => {
    const participantIds = await _loadParticipantIds(data.challengeId);
    await socketEmitter.emitToParticipants(participantIds, data.auraChallengeId, 'challenge.updated', {
      type: 'CHALLENGE_READY',
      challengeId: data.challengeId,
      auraChallengeId: data.auraChallengeId,
      status: 'READY',
      timestamp: Date.now()
    });
  });

  // CHALLENGE_ACTIVATED — Phase 3.1.7.1: emit dedicated 'challenge.activated' event
  // Frontend now has a bridge for 'challenge.activated' — do NOT use challenge.updated
  // This ensures both players transition to ACTIVE state deterministically
  auraEvents.registerListener(EVENTS.CHALLENGE_ACTIVATED, 'socket:challenge.activated', async (data) => {
    const participantIds = await _loadParticipantIds(data.challengeId);
    await socketEmitter.emitToParticipants(participantIds, data.auraChallengeId, 'challenge.activated', {
      type: 'CHALLENGE_ACTIVATED',
      challengeId: data.challengeId,
      auraChallengeId: data.auraChallengeId,
      status: data.status || 'ACTIVE',
      activatedAt: data.activatedAt,
      timestamp: Date.now()
    });
  });

  // CHALLENGE_JOINED — Phase 3.1.6: emit to ALL participants
  auraEvents.registerListener(EVENTS.CHALLENGE_JOINED, 'socket:challenge.joined', async (data) => {
    const participantIds = await _loadParticipantIds(data.challengeId);
    await socketEmitter.emitToParticipants(participantIds, data.auraChallengeId, 'challenge.updated', {
      type: 'PARTICIPANT_JOINED',
      challengeId: data.challengeId,
      auraChallengeId: data.auraChallengeId,
      userId: data.userId,
      participantName: data.participantName,
      participantCount: data.participantCount,
      timestamp: Date.now()
    });
  });

  // CHALLENGE_SUBMITTED — Phase 3.1.6: emit to ALL participants
  auraEvents.registerListener(EVENTS.CHALLENGE_SUBMITTED, 'socket:challenge.submitted', async (data) => {
    const participantIds = await _loadParticipantIds(data.challengeId);
    await socketEmitter.emitToParticipants(participantIds, data.auraChallengeId, 'challenge.submission.created', {
      userId: data.userId,
      challengeId: data.challengeId,
      auraChallengeId: data.auraChallengeId,
      submitterName: data.submitterName,
      attemptNumber: data.attemptNumber,
      timestamp: Date.now()
    });
  });

  // CHALLENGE_VALIDATED — Phase 3.1.5/3.1.6: emit to ALL participants
  auraEvents.registerListener(EVENTS.CHALLENGE_VALIDATED, 'socket:challenge.validated', async (data) => {
    const participantIds = await _loadParticipantIds(data.challengeId);
    await socketEmitter.emitToParticipants(participantIds, data.auraChallengeId, 'challenge.updated', {
      type: 'SUBMISSION_VALIDATED',
      challengeId: data.challengeId,
      auraChallengeId: data.auraChallengeId,
      userId: data.userId,
      submissionId: data.submissionId,
      validationScore: data.validationScore,
      status: data.validationStatus,
      timestamp: Date.now()
    });
  });

  // CHALLENGE_RESOLVED — Phase 3.1.6: emit to ALL participants
  auraEvents.registerListener(EVENTS.CHALLENGE_RESOLVED, 'socket:challenge.resolved', async (data) => {
    const participantIds = await _loadParticipantIds(data.challengeId);
    await socketEmitter.emitToParticipants(participantIds, data.auraChallengeId, 'challenge.resolved', {
      challengeId: data.challengeId,
      auraChallengeId: data.auraChallengeId,
      winnerId: data.winnerId,
      winnerName: data.winnerName,
      title: data.title,
      timestamp: Date.now()
    });
    // Also notify winner personally
    if (data.winnerId) {
      const winnerAuraId = await _resolveAuraPlayerId(data.winnerId);
      if (winnerAuraId) {
        socketEmitter.playerNotification(winnerAuraId, {
          type: 'CHALLENGE_WON',
          title: data.title,
          timestamp: Date.now()
        });
      }
    }
  });

  // CHALLENGE_CANCELLED — Phase 3.1.7: emit to ALL participants (including DECLINED)
  // This is critical: the decliner must also receive this event to remove from their array
  auraEvents.registerListener(EVENTS.CHALLENGE_CANCELLED, 'socket:challenge.cancelled', async (data) => {
    const participantIds = await _loadAllParticipantIds(data.challengeId);
    await socketEmitter.emitToParticipants(participantIds, data.auraChallengeId, 'challenge.cancelled', {
      type: 'CHALLENGE_CANCELLED',
      challengeId: data.challengeId,
      auraChallengeId: data.auraChallengeId,
      status: 'CANCELLED',
      reason: data.reason || null,
      timestamp: Date.now()
    });
  });

  // CHALLENGE_EXPIRED — Phase 3.1.5/3.1.6: emit to ALL participants
  auraEvents.registerListener(EVENTS.CHALLENGE_EXPIRED, 'socket:challenge.expired', async (data) => {
    const participantIds = await _loadParticipantIds(data.challengeId);
    await socketEmitter.emitToParticipants(participantIds, data.auraChallengeId, 'challenge.updated', {
      type: 'CHALLENGE_EXPIRED',
      challengeId: data.challengeId,
      auraChallengeId: data.auraChallengeId,
      status: 'EXPIRED',
      timestamp: Date.now()
    });
  });

  // ── Hub Events → Hub Room ─────────────────────────
  auraEvents.registerListener(EVENTS.HUB_JOINED, 'socket:hub.joined', async (data) => {
    if (data.auraHubId) {
      socketEmitter.hubMemberJoined(data.auraHubId, {
        userId: data.userId,
        memberName: data.memberName,
        memberCount: data.memberCount,
        timestamp: Date.now()
      });
    }
  });

  auraEvents.registerListener(EVENTS.HUB_LEFT, 'socket:hub.left', async (data) => {
    if (data.auraHubId) {
      socketEmitter.hubMemberLeft(data.auraHubId, {
        userId: data.userId,
        memberName: data.memberName,
        memberCount: data.memberCount,
        timestamp: Date.now()
      });
    }
  });

  // ── Voucher Events ────────────────────────────────
  auraEvents.registerListener(EVENTS.VOUCHER_UNLOCKED, 'socket:voucher.unlocked', async (data) => {
    const auraId = await _resolveAuraPlayerId(data.userId);
    if (auraId) {
      socketEmitter.playerVoucherUnlocked(auraId, {
        voucherId: data.voucherId,
        voucherName: data.voucherName,
        timestamp: Date.now()
      });
    }
  });

  console.log('[EventBus] ✅ Socket listeners registered');
};

// ── Helper: load ACTIVE participant userIds ──────────
// Used for submission, validation, resolved events
const _loadParticipantIds = async (challengeId) => {
  if (!challengeId) return [];
  try {
    const challenge = await Challenge.findById(challengeId).select('participants').lean();
    if (!challenge?.participants) return [];
    return challenge.participants.map(p => p.userId?.toString()).filter(Boolean);
  } catch { return []; }
};

// ── Helper: load ALL participant userIds (including DECLINED/LEFT) ─
// Phase 3.1.7: Used for cancelled/declined events so decliner also gets notified
const _loadAllParticipantIds = async (challengeId) => {
  if (!challengeId) return [];
  try {
    const challenge = await Challenge.findById(challengeId).select('participants').lean();
    if (!challenge?.participants) return [];
    // Include ALL participant entries regardless of status
    return challenge.participants.map(p => p.userId?.toString()).filter(Boolean);
  } catch { return []; }
};

// ── Helper: resolve userId → auraPlayerId ────────────
const _auraIdCache = new Map();
const _CACHE_TTL_MS = 5 * 60 * 1000;

const _resolveAuraPlayerId = async (userId) => {
  if (!userId) return null;

  const cached = _auraIdCache.get(userId.toString());
  if (cached && (Date.now() - cached.ts) < _CACHE_TTL_MS) {
    return cached.auraPlayerId;
  }

  const profile = await PlayerProfile.findOne({ userId })
    .select('auraPlayerId')
    .lean();

  if (profile?.auraPlayerId) {
    _auraIdCache.set(userId.toString(), {
      auraPlayerId: profile.auraPlayerId,
      ts: Date.now()
    });
    return profile.auraPlayerId;
  }
  return null;
};

module.exports = { register };
