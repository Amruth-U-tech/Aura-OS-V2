const auraEvents = require('../eventBus');
const { EVENTS } = require('../eventConstants');
const historyService = require('../../services/historyService');
const { BEHAVIORAL_EVENT_TYPES } = require('../../constants/historyConstants');

// ======================================================
// HISTORY LISTENER — Phase 3.1
// Reacts to domain events and persists behavioral history
// History service is the ONLY authority for event persistence
//
// Must NOT: calculate XP, update trust, broadcast sockets
// ======================================================

const register = () => {
  // ── Challenge Events → History ────────────────────
  auraEvents.registerListener(EVENTS.CHALLENGE_CREATED, 'history:challenge.created', async (data) => {
    if (!data.creatorId) return;
    await historyService.recordEvent(data.creatorId, BEHAVIORAL_EVENT_TYPES.CHALLENGE_CREATED, {
      challengeId: data.challengeId,
      auraChallengeId: data.auraChallengeId,
      title: data.title,
      type: data.type
    });
  });

  auraEvents.registerListener(EVENTS.CHALLENGE_JOINED, 'history:challenge.joined', async (data) => {
    if (!data.userId) return;
    await historyService.recordEvent(data.userId, BEHAVIORAL_EVENT_TYPES.CHALLENGE_JOINED, {
      challengeId: data.challengeId,
      auraChallengeId: data.auraChallengeId,
      title: data.title
    });
  });

  auraEvents.registerListener(EVENTS.CHALLENGE_RESOLVED, 'history:challenge.resolved', async (data) => {
    // Winner history
    if (data.winnerId) {
      await historyService.recordEvent(data.winnerId, BEHAVIORAL_EVENT_TYPES.CHALLENGE_WON, {
        challengeId: data.challengeId,
        auraChallengeId: data.auraChallengeId,
        title: data.title,
        autoResolved: data.autoResolved || false
      });
    }
    // Loser history
    if (data.loserIds) {
      for (const loserId of data.loserIds) {
        await historyService.recordEvent(loserId, BEHAVIORAL_EVENT_TYPES.CHALLENGE_LOST, {
          challengeId: data.challengeId,
          auraChallengeId: data.auraChallengeId,
          title: data.title,
          autoResolved: data.autoResolved || false
        });
      }
    }
  });

  auraEvents.registerListener(EVENTS.CHALLENGE_SUBMITTED, 'history:challenge.submitted', async (data) => {
    if (!data.userId) return;
    await historyService.recordEvent(data.userId, BEHAVIORAL_EVENT_TYPES.CHALLENGE_SUBMITTED, {
      challengeId: data.challengeId,
      auraChallengeId: data.auraChallengeId,
      attemptNumber: data.attemptNumber
    });
  });

  // ── Social Events → History ───────────────────────
  auraEvents.registerListener(EVENTS.FRIEND_REQUEST_SENT, 'history:friend.request.sent', async (data) => {
    if (!data.senderId) return;
    await historyService.recordEvent(data.senderId, BEHAVIORAL_EVENT_TYPES.FRIEND_REQUEST_SENT, {
      receiverId: data.receiverId,
      receiverName: data.receiverName
    });
  });

  auraEvents.registerListener(EVENTS.FRIEND_ACCEPTED, 'history:friend.accepted', async (data) => {
    if (!data.receiverId) return;
    await historyService.recordEvent(data.receiverId, BEHAVIORAL_EVENT_TYPES.FRIEND_REQUEST_ACCEPTED, {
      senderId: data.senderId,
      senderName: data.senderName
    });
  });

  // ── Hub Events → History ──────────────────────────
  auraEvents.registerListener(EVENTS.HUB_CREATED, 'history:hub.created', async (data) => {
    if (!data.ownerId) return;
    await historyService.recordEvent(data.ownerId, BEHAVIORAL_EVENT_TYPES.HUB_CREATED, {
      hubId: data.hubId,
      auraHubId: data.auraHubId,
      name: data.name
    });
  });

  auraEvents.registerListener(EVENTS.HUB_JOINED, 'history:hub.joined', async (data) => {
    if (!data.userId) return;
    await historyService.recordEvent(data.userId, BEHAVIORAL_EVENT_TYPES.HUB_JOINED, {
      hubId: data.hubId,
      auraHubId: data.auraHubId,
      name: data.name
    });
  });

  auraEvents.registerListener(EVENTS.HUB_LEFT, 'history:hub.left', async (data) => {
    if (!data.userId) return;
    await historyService.recordEvent(data.userId, BEHAVIORAL_EVENT_TYPES.HUB_LEFT, {
      hubId: data.hubId,
      auraHubId: data.auraHubId
    });
  });

  // ── Player Events → History ───────────────────────
  auraEvents.registerListener(EVENTS.PLAYER_LEVEL_UP, 'history:player.levelup', async (data) => {
    if (!data.userId) return;
    await historyService.recordEvent(data.userId, BEHAVIORAL_EVENT_TYPES.LEVEL_UP, {
      previousLevel: data.previousLevel,
      newLevel: data.newLevel,
      totalXpEarned: data.totalXpEarned
    });
  });

  console.log('[EventBus] ✅ History listeners registered');
};

module.exports = { register };
