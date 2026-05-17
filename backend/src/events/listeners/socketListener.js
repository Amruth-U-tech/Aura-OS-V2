const auraEvents = require('../eventBus');
const { EVENTS } = require('../eventConstants');
const socketEmitter = require('../../realtime/socketEmitter');
const PlayerProfile = require('../../models/PlayerProfile');

// ======================================================
// SOCKET LISTENER — Phase 3.1
// Bridges domain events → realtime socket broadcasts
// This is TRANSPORT ONLY — no business logic here
// Reacts to domain events and pushes live updates to clients
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

  // Phase 3.1.4: Emit task.created to player for cross-tab sync
  auraEvents.registerListener(EVENTS.TASK_CREATED, 'socket:task.created', async (data) => {
    const auraId = await _resolveAuraPlayerId(data.userId);
    if (!auraId) return;
    socketEmitter.emitToPlayer(auraId, 'player.task.created', {
      taskId: data.taskId,
      title: data.title,
      priority: data.priority,
      status: data.status,
      deadline: data.deadline,
      timestamp: Date.now()
    });
  });

  auraEvents.registerListener(EVENTS.TASK_FAILED, 'socket:task.failed', async (data) => {
    const auraId = await _resolveAuraPlayerId(data.userId);
    if (!auraId) return;
    socketEmitter.emitToPlayer(auraId, 'player.notification', {
      type: 'TASK_FAILED',
      title: data.title,
      timestamp: Date.now()
    });
  });

  auraEvents.registerListener(EVENTS.TASK_EXPIRED, 'socket:task.expired', async (data) => {
    const auraId = await _resolveAuraPlayerId(data.userId);
    if (!auraId) return;
    socketEmitter.emitToPlayer(auraId, 'player.notification', {
      type: 'TASK_EXPIRED',
      title: data.title,
      timestamp: Date.now()
    });
  });

  // ── XP Events → Player Socket ──────────────────────
  auraEvents.registerListener(EVENTS.PLAYER_XP_UPDATED, 'socket:player.xp.updated', async (data) => {
    const auraId = await _resolveAuraPlayerId(data.userId);
    if (!auraId) return;
    socketEmitter.playerXpUpdated(auraId, {
      amount: data.amount,
      balanceAfter: data.balanceAfter,
      type: data.type,
      level: data.level,
      timestamp: Date.now()
    });
  });

  // ── Level Up → Player Socket ───────────────────────
  auraEvents.registerListener(EVENTS.PLAYER_LEVEL_UP, 'socket:player.levelup', async (data) => {
    const auraId = await _resolveAuraPlayerId(data.userId);
    if (!auraId) return;
    socketEmitter.playerLevelUp(auraId, {
      previousLevel: data.previousLevel,
      newLevel: data.newLevel,
      totalXpEarned: data.totalXpEarned,
      timestamp: Date.now()
    });
  });

  // ── Trust Events → Player Socket ───────────────────
  auraEvents.registerListener(EVENTS.PLAYER_TRUST_CHANGED, 'socket:player.trust.changed', async (data) => {
    const auraId = await _resolveAuraPlayerId(data.userId);
    if (!auraId) return;
    socketEmitter.playerTrustUpdated(auraId, {
      trustScore: data.trustScore,
      tier: data.tier,
      source: data.source,
      timestamp: Date.now()
    });
  });

  // ── Friend Events → Player Socket ─────────────────
  auraEvents.registerListener(EVENTS.FRIEND_REQUEST_SENT, 'socket:friend.request.sent', async (data) => {
    const receiverAuraId = await _resolveAuraPlayerId(data.receiverId);
    if (!receiverAuraId) return;
    // Phase 3.1.4: Resolve sender name from profile for rich notification
    const senderProfile = await PlayerProfile.findOne({ userId: data.senderId })
      .select('displayName auraPlayerId')
      .lean();
    socketEmitter.playerFriendRequest(receiverAuraId, {
      type: 'INCOMING_REQUEST',
      requestId: data.requestId,  // CRITICAL: real Mongo ObjectId — prevents rt-* corruption
      senderId: data.senderId,
      senderName: senderProfile?.displayName || data.senderName || 'Player',
      senderAuraId: senderProfile?.auraPlayerId || null,
      message: data.message,
      timestamp: Date.now()
    });
  });

  auraEvents.registerListener(EVENTS.FRIEND_ACCEPTED, 'socket:friend.accepted', async (data) => {
    // Notify both parties
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

  // ── Challenge Events → Challenge Room + Players ────

  // Phase 3.1.4: Notify participants when a challenge is created
  // Critical for cross-account sync — target player sees challenge immediately
  auraEvents.registerListener(EVENTS.CHALLENGE_CREATED, 'socket:challenge.created', async (data) => {
    // Notify creator (cross-tab sync)
    if (data.creatorId) {
      const creatorAuraId = await _resolveAuraPlayerId(data.creatorId);
      if (creatorAuraId) {
        socketEmitter.emitToPlayer(creatorAuraId, 'player.challenge.invite', {
          type: 'CHALLENGE_CREATED',
          challengeId: data.challengeId,
          auraChallengeId: data.auraChallengeId,
          title: data.title,
          routing: data.routing,
          timestamp: Date.now()
        });
      }
    }
    // In 1v1, also notify the target friend
    if (data.routing === 'ONE_TO_ONE' && data.targetFriendId) {
      const targetAuraId = await _resolveAuraPlayerId(data.targetFriendId);
      if (targetAuraId) {
        socketEmitter.emitToPlayer(targetAuraId, 'player.challenge.invite', {
          type: 'CHALLENGE_INVITE',
          challengeId: data.challengeId,
          auraChallengeId: data.auraChallengeId,
          title: data.title,
          creatorId: data.creatorId,
          timestamp: Date.now()
        });
      }
    }
  });

  auraEvents.registerListener(EVENTS.CHALLENGE_RESOLVED, 'socket:challenge.resolved', async (data) => {
    if (data.auraChallengeId) {
      socketEmitter.challengeResolved(data.auraChallengeId, {
        winnerId: data.winnerId,
        winnerName: data.winnerName,
        title: data.title,
        timestamp: Date.now()
      });
    }
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

  auraEvents.registerListener(EVENTS.CHALLENGE_SUBMITTED, 'socket:challenge.submitted', async (data) => {
    if (data.auraChallengeId) {
      socketEmitter.challengeSubmissionCreated(data.auraChallengeId, {
        userId: data.userId,
        submitterName: data.submitterName,
        attemptNumber: data.attemptNumber,
        timestamp: Date.now()
      });
    }
  });

  auraEvents.registerListener(EVENTS.CHALLENGE_JOINED, 'socket:challenge.joined', async (data) => {
    if (data.auraChallengeId) {
      socketEmitter.challengeUpdated(data.auraChallengeId, {
        type: 'PARTICIPANT_JOINED',
        userId: data.userId,
        participantName: data.participantName,
        participantCount: data.participantCount,
        timestamp: Date.now()
      });
    }
  });

  // Phase 3.1.5: CHALLENGE_ACTIVATED — notify all participants when challenge goes live
  auraEvents.registerListener(EVENTS.CHALLENGE_ACTIVATED, 'socket:challenge.activated', async (data) => {
    if (data.auraChallengeId) {
      socketEmitter.challengeUpdated(data.auraChallengeId, {
        type: 'CHALLENGE_ACTIVATED',
        challengeId: data.challengeId,
        status: data.status || 'ACTIVE',
        activatedAt: data.activatedAt,
        timestamp: Date.now()
      });
    }
  });

  // Phase 3.1.5: CHALLENGE_VALIDATED — notify when a submission is AI-validated
  auraEvents.registerListener(EVENTS.CHALLENGE_VALIDATED, 'socket:challenge.validated', async (data) => {
    if (data.auraChallengeId) {
      socketEmitter.challengeUpdated(data.auraChallengeId, {
        type: 'SUBMISSION_VALIDATED',
        userId: data.userId,
        submissionId: data.submissionId,
        validationScore: data.validationScore,
        status: data.validationStatus,
        timestamp: Date.now()
      });
    }
  });

  // Phase 3.1.5: CHALLENGE_CANCELLED — notify all participants
  auraEvents.registerListener(EVENTS.CHALLENGE_CANCELLED, 'socket:challenge.cancelled', async (data) => {
    if (data.auraChallengeId) {
      socketEmitter.challengeUpdated(data.auraChallengeId, {
        type: 'CHALLENGE_CANCELLED',
        challengeId: data.challengeId,
        status: 'CANCELLED',
        timestamp: Date.now()
      });
    }
  });

  // Phase 3.1.5: CHALLENGE_EXPIRED — notify all participants when deadline passes
  auraEvents.registerListener(EVENTS.CHALLENGE_EXPIRED, 'socket:challenge.expired', async (data) => {
    if (data.auraChallengeId) {
      socketEmitter.challengeUpdated(data.auraChallengeId, {
        type: 'CHALLENGE_EXPIRED',
        challengeId: data.challengeId,
        status: 'EXPIRED',
        timestamp: Date.now()
      });
    }
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
        timestamp: Date.now()
      });
    }
  });

  // ── Voucher Events → Player Socket ────────────────
  auraEvents.registerListener(EVENTS.VOUCHER_UNLOCKED, 'socket:voucher.unlocked', async (data) => {
    const auraId = await _resolveAuraPlayerId(data.userId);
    if (!auraId) return;
    socketEmitter.playerVoucherUnlocked(auraId, {
      voucherTitle: data.voucherTitle,
      tier: data.tier,
      timestamp: Date.now()
    });
  });

  console.log('[EventBus] ✅ Socket listeners registered');
};

// ── Helper: resolve userId → auraPlayerId ────────────
// Lightweight cached lookup for socket routing
const _auraIdCache = new Map();
const _CACHE_TTL_MS = 5 * 60 * 1000; // 5 min cache

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
