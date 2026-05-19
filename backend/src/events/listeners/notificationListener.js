const auraEvents = require('../eventBus');
const { EVENTS } = require('../eventConstants');
const notificationService = require('../../services/domains/notificationDomainService');
const socketEmitter = require('../../realtime/socketEmitter');
const PlayerProfile = require('../../models/PlayerProfile');

// ======================================================
// NOTIFICATION LISTENER — Phase N1
// Bridges domain events → persistent notifications → socket broadcast
//
// Architecture:
//   Domain Event → notificationService.create → socket broadcast
//
// This listener is registered AFTER socket listener in the event chain.
// It creates durable communication artifacts and broadcasts them.
//
// Ownership:
//   - Listens to domain events
//   - Creates persistent notifications (DB commit first)
//   - Broadcasts via socket for realtime delivery
//
// Must NOT: contain business logic, modify domain state
// ======================================================

// ── Resolve auraPlayerId from userId ─────────────────
const _auraIdCache = new Map();
const _CACHE_TTL = 5 * 60 * 1000;

const _resolveAuraPlayerId = async (userId) => {
  if (!userId) return null;
  const key = userId.toString();
  const cached = _auraIdCache.get(key);
  if (cached && Date.now() - cached.ts < _CACHE_TTL) return cached.id;

  const profile = await PlayerProfile.findOne({ userId }).select('auraPlayerId').lean();
  if (profile?.auraPlayerId) {
    _auraIdCache.set(key, { id: profile.auraPlayerId, ts: Date.now() });
    return profile.auraPlayerId;
  }
  return null;
};

// ── Resolve display name ─────────────────────────────
const _resolveDisplayName = async (userId) => {
  if (!userId) return 'System';
  const profile = await PlayerProfile.findOne({ userId }).select('displayName').lean();
  return profile?.displayName || 'Player';
};

// ── Broadcast notification to target's player room ───
// Phase N2: Includes envelope metadata for frontend sequence-aware reconciliation
const _broadcastNotification = async (notification, meta = {}) => {
  const auraId = await _resolveAuraPlayerId(notification.targetId);
  if (auraId) {
    socketEmitter.emitToPlayer(auraId, 'notification.created', {
      notification: notificationService.sanitizeNotification(notification),
      sequence: meta.sequence || null,
      traceId: meta.traceId || notification.traceId || null,
      timestamp: Date.now()
    });
  }
};

// ── Register all notification listeners ──────────────
const register = () => {

  // ── SOCIAL EVENTS ──────────────────────────────────

  auraEvents.registerListener(EVENTS.FRIEND_REQUEST_SENT, 'notification:friend.request.sent', async (data) => {
    const actorName = await _resolveDisplayName(data.senderId);
    const targetName = await _resolveDisplayName(data.receiverId);
    const traceId = notificationService.generateTraceId();

    // Notification for receiver: "X sent you a friend request"
    const notification = await notificationService.createNotification({
      type: 'FRIEND_REQUEST_SENT',
      actorId: data.senderId,
      actorName,
      targetId: data.receiverId,
      targetName,
      entityType: 'friendRequest',
      entityId: data.requestId,
      title: `${actorName} sent you a friend request`,
      message: data.message || '',
      payload: { requestId: data.requestId },
      traceId
    });
    await _broadcastNotification(notification, data._meta);
  });

  auraEvents.registerListener(EVENTS.FRIEND_ACCEPTED, 'notification:friend.accepted', async (data) => {
    const receiverName = await _resolveDisplayName(data.receiverId);
    const senderName = await _resolveDisplayName(data.senderId);
    const traceId = notificationService.generateTraceId();

    // Notify sender: "X accepted your friend request"
    const n1 = await notificationService.createNotification({
      type: 'FRIEND_REQUEST_ACCEPTED',
      actorId: data.receiverId,
      actorName: receiverName,
      targetId: data.senderId,
      targetName: senderName,
      entityType: 'friendRequest',
      entityId: data.requestId,
      title: `${receiverName} accepted your friend request`,
      payload: { requestId: data.requestId },
      traceId
    });
    await _broadcastNotification(n1, data._meta);

    // Notify receiver: "You are now friends with X"
    const n2 = await notificationService.createNotification({
      type: 'FRIEND_REQUEST_ACCEPTED',
      actorId: data.senderId,
      actorName: senderName,
      targetId: data.receiverId,
      targetName: receiverName,
      entityType: 'friendRequest',
      entityId: data.requestId,
      title: `You are now friends with ${senderName}`,
      payload: { requestId: data.requestId },
      traceId
    });
    await _broadcastNotification(n2, data._meta);
  });

  auraEvents.registerListener(EVENTS.FRIEND_DECLINED, 'notification:friend.declined', async (data) => {
    const receiverName = await _resolveDisplayName(data.receiverId);
    const senderName = await _resolveDisplayName(data.senderId);
    const traceId = notificationService.generateTraceId();

    // Notify sender: "X declined your friend request"
    const notification = await notificationService.createNotification({
      type: 'FRIEND_REQUEST_DECLINED',
      actorId: data.receiverId,
      actorName: receiverName,
      targetId: data.senderId,
      targetName: senderName,
      entityType: 'friendRequest',
      entityId: data.requestId,
      title: `${receiverName} declined your friend request`,
      payload: { requestId: data.requestId },
      traceId
    });
    await _broadcastNotification(notification, data._meta);
  });

  auraEvents.registerListener(EVENTS.FRIEND_REMOVED, 'notification:friend.removed', async (data) => {
    const actorName = await _resolveDisplayName(data.removerId || data.userIdA);
    const targetId = data.removedId || data.userIdB;
    const targetName = await _resolveDisplayName(targetId);
    const traceId = notificationService.generateTraceId();

    // Notify removed player
    const notification = await notificationService.createNotification({
      type: 'FRIEND_REMOVED',
      actorId: data.removerId || data.userIdA,
      actorName,
      targetId,
      targetName,
      entityType: 'friendship',
      title: `${actorName} removed you from friends`,
      payload: {},
      traceId
    });
    await _broadcastNotification(notification, data._meta);
  });

  // ── CHALLENGE EVENTS ───────────────────────────────

  auraEvents.registerListener(EVENTS.CHALLENGE_INVITED, 'notification:challenge.invited', async (data) => {
    const traceId = notificationService.generateTraceId();
    const notification = await notificationService.createNotification({
      type: 'CHALLENGE_INVITED',
      actorId: data.creatorId,
      actorName: data.creatorName || 'Player',
      targetId: data.targetUserId,
      entityType: 'challenge',
      entityId: data.challengeId,
      title: `${data.creatorName || 'Player'} challenged you: "${data.title}"`,
      payload: { auraChallengeId: data.auraChallengeId, title: data.title },
      traceId
    });
    await _broadcastNotification(notification, data._meta);
  });

  auraEvents.registerListener(EVENTS.CHALLENGE_ACCEPTED, 'notification:challenge.accepted', async (data) => {
    const traceId = notificationService.generateTraceId();
    // Notify all participants that someone accepted
    const notification = await notificationService.createNotification({
      type: 'CHALLENGE_ACCEPTED',
      actorId: data.userId,
      actorName: data.playerName || 'Player',
      targetId: data.userId, // Self-notification for persistence
      entityType: 'challenge',
      entityId: data.challengeId,
      title: `Challenge "${data.title}" accepted — ${data.newStatus === 'ACTIVE' ? 'game on!' : 'waiting for more players'}`,
      payload: { auraChallengeId: data.auraChallengeId, newStatus: data.newStatus },
      traceId
    });
    await _broadcastNotification(notification, data._meta);
  });

  auraEvents.registerListener(EVENTS.CHALLENGE_RESOLVED, 'notification:challenge.resolved', async (data) => {
    const traceId = notificationService.generateTraceId();
    const Challenge = require('../../models/Challenge');
    const challenge = await Challenge.findById(data.challengeId).lean();
    if (!challenge) return;

    // Notify each participant
    for (const p of (challenge.participants || [])) {
      const isWinner = data.winnerId && p.userId.toString() === data.winnerId;
      const playerName = await _resolveDisplayName(p.userId);
      const notification = await notificationService.createNotification({
        type: 'CHALLENGE_RESOLVED',
        actorId: data.winnerId || null,
        actorName: data.winnerName || null,
        targetId: p.userId.toString(),
        targetName: playerName,
        entityType: 'challenge',
        entityId: data.challengeId,
        title: isWinner
          ? `🏆 You won "${data.title}"!`
          : data.winnerId
            ? `${data.winnerName || 'Someone'} won "${data.title}"`
            : `Challenge "${data.title}" ended with no winner`,
        payload: {
          auraChallengeId: data.auraChallengeId,
          winnerId: data.winnerId,
          winnerName: data.winnerName,
          isWinner
        },
        traceId
      });
      await _broadcastNotification(notification, data._meta);
    }
  });

  auraEvents.registerListener(EVENTS.CHALLENGE_CANCELLED, 'notification:challenge.cancelled', async (data) => {
    const traceId = notificationService.generateTraceId();
    const Challenge = require('../../models/Challenge');
    const challenge = await Challenge.findById(data.challengeId).lean();
    if (!challenge) return;

    for (const p of (challenge.participants || [])) {
      const notification = await notificationService.createNotification({
        type: 'CHALLENGE_CANCELLED',
        actorId: data.declinedBy || data.creatorId || null,
        targetId: p.userId.toString(),
        entityType: 'challenge',
        entityId: data.challengeId,
        title: `Challenge "${challenge.title}" was cancelled`,
        message: data.reason || '',
        payload: { auraChallengeId: data.auraChallengeId, reason: data.reason },
        traceId
      });
      await _broadcastNotification(notification, data._meta);
    }
  });

  // ── XP / LEVEL EVENTS ─────────────────────────────

  auraEvents.registerListener(EVENTS.PLAYER_LEVEL_UP, 'notification:player.levelup', async (data) => {
    const traceId = notificationService.generateTraceId();
    const playerName = await _resolveDisplayName(data.userId);
    const notification = await notificationService.createNotification({
      type: 'LEVEL_UP',
      targetId: data.userId,
      targetName: playerName,
      entityType: 'player',
      entityId: data.userId,
      title: `🎉 Level Up! You reached Level ${data.newLevel}`,
      payload: { previousLevel: data.previousLevel, newLevel: data.newLevel },
      traceId,
      // Level up notifications expire after 30 days
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    await _broadcastNotification(notification, data._meta);
  });

  // ── TASK EVENTS ────────────────────────────────────

  auraEvents.registerListener(EVENTS.TASK_COMPLETED, 'notification:task.completed', async (data) => {
    const traceId = notificationService.generateTraceId();
    const notification = await notificationService.createNotification({
      type: 'TASK_COMPLETED',
      targetId: data.userId,
      entityType: 'task',
      entityId: data.taskId || data._id,
      title: `✅ Mission completed: "${data.mission?.title || data.title || 'Mission'}"`,
      payload: { missionType: data.mission?.missionType },
      traceId,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
    });
    await _broadcastNotification(notification, data._meta);
  });

  auraEvents.registerListener(EVENTS.TASK_FAILED, 'notification:task.failed', async (data) => {
    const traceId = notificationService.generateTraceId();
    const notification = await notificationService.createNotification({
      type: 'TASK_FAILED',
      targetId: data.userId,
      entityType: 'task',
      entityId: data.taskId || data._id,
      title: `❌ Mission failed: "${data.mission?.title || data.title || 'Mission'}"`,
      payload: {},
      traceId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });
    await _broadcastNotification(notification, data._meta);
  });

  // ── REWARD EVENTS ──────────────────────────────────

  auraEvents.registerListener(EVENTS.VOUCHER_UNLOCKED, 'notification:voucher.unlocked', async (data) => {
    const traceId = notificationService.generateTraceId();
    const notification = await notificationService.createNotification({
      type: 'VOUCHER_UNLOCKED',
      targetId: data.userId,
      entityType: 'voucher',
      entityId: data.voucherId,
      title: `🎫 New voucher unlocked: "${data.title || 'Voucher'}"`,
      payload: { voucherId: data.voucherId },
      traceId
    });
    await _broadcastNotification(notification, data._meta);
  });

  console.log('[EventBus] ✅ Notification listeners registered');
};

module.exports = { register };
