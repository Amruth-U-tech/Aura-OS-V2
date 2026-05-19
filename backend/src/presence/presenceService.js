const { redisPresence } = require('../realtime/redis');
const HubVoiceState = require('../models/HubVoiceState');

// ======================================================
// PRESENCE SERVICE — Phase D3.2.3
// Synchronized distributed liveness authority
//
// Owns: who is active where right now
// Tracks: online state, voice participation, speaking
//
// Redis = realtime ephemeral state
// HubVoiceState (Mongo) = reconnect hydration snapshot
//
// Must NOT: own media, own authorization, own durable truth
// ======================================================

const _metrics = {
  joins: 0,
  leaves: 0,
  heartbeats: 0,
  voiceJoins: 0,
  voiceLeaves: 0,
  reconciliations: 0,
  failures: 0,
};

// ── Player joins a hub ────────────────────────────────
async function playerJoinedHub(hubId, auraPlayerId, displayName) {
  try {
    await redisPresence.setPresence(hubId, auraPlayerId, {
      displayName,
      online: true,
      inVoice: false,
    });
    _metrics.joins++;
    return true;
  } catch (err) {
    _metrics.failures++;
    console.error(`[PresenceService] ❌ playerJoinedHub failed: ${err.message}`);
    return false;
  }
}

// ── Player left a hub ─────────────────────────────────
async function playerLeftHub(hubId, auraPlayerId) {
  try {
    await redisPresence.removePresence(hubId, auraPlayerId);
    _metrics.leaves++;
    return true;
  } catch (err) {
    _metrics.failures++;
    console.error(`[PresenceService] ❌ playerLeftHub failed: ${err.message}`);
    return false;
  }
}

// ── Player joined voice ───────────────────────────────
async function playerJoinedVoice(hubId, auraPlayerId, displayName) {
  try {
    await redisPresence.setPresence(hubId, auraPlayerId, {
      displayName,
      online: true,
      inVoice: true,
    });

    // Update durable snapshot for reconnect hydration
    await HubVoiceState.findOneAndUpdate(
      { auraHubId: hubId },
      {
        $push: {
          activeParticipants: {
            auraPlayerId,
            displayName,
            joinedAt: new Date(),
            lastHeartbeatAt: new Date(),
          }
        },
        $inc: { participantCount: 1, rtcSessionVersion: 1 },
        lastUpdatedAt: new Date(),
      },
      { upsert: true }
    );

    _metrics.voiceJoins++;
    return true;
  } catch (err) {
    _metrics.failures++;
    console.error(`[PresenceService] ❌ playerJoinedVoice failed: ${err.message}`);
    return false;
  }
}

// ── Player left voice ─────────────────────────────────
async function playerLeftVoice(hubId, auraPlayerId) {
  try {
    // Update Redis — still online, not in voice
    await redisPresence.setPresence(hubId, auraPlayerId, {
      inVoice: false,
      speaking: false,
    });

    // Update durable snapshot
    await HubVoiceState.findOneAndUpdate(
      { auraHubId: hubId },
      {
        $pull: { activeParticipants: { auraPlayerId } },
        $inc: { participantCount: -1, rtcSessionVersion: 1 },
        lastUpdatedAt: new Date(),
      }
    );

    _metrics.voiceLeaves++;
    return true;
  } catch (err) {
    _metrics.failures++;
    console.error(`[PresenceService] ❌ playerLeftVoice failed: ${err.message}`);
    return false;
  }
}

// ── Heartbeat from player ─────────────────────────────
async function heartbeat(hubId, auraPlayerId) {
  _metrics.heartbeats++;
  return redisPresence.heartbeat(hubId, auraPlayerId);
}

// ── Get hub presence snapshot ─────────────────────────
// Falls back to socket registry when Redis is unavailable
async function getHubPresence(hubId) {
  // Try Redis first
  const redisMembers = await redisPresence.getHubPresence(hubId);
  if (redisMembers && redisMembers.length > 0) return redisMembers;

  // Fallback: derive presence from socket registry (no Redis needed)
  try {
    const socketRegistry = require('../realtime/socketRegistry');
    const roomManager = require('../realtime/roomManager');
    
    // Resolve auraHubId for room name
    const Hub = require('../models/Hub');
    const mongoose = require('mongoose');
    let auraHubId = hubId;
    if (mongoose.Types.ObjectId.isValid(hubId)) {
      const hub = await Hub.findById(hubId).select('auraHubId').lean();
      if (hub?.auraHubId) auraHubId = hub.auraHubId;
    }
    
    const room = roomManager.buildHubRoom(auraHubId);
    const members = socketRegistry.getSocketsInRoom(room);
    return members || [];
  } catch {
    return [];
  }
}

// ── Reconcile: clean stale participants ────────────────
async function reconcile(hubId) {
  try {
    const cleaned = await redisPresence.cleanStalePresence(hubId);
    if (cleaned.length > 0) {
      // Remove from durable snapshot too
      await HubVoiceState.findOneAndUpdate(
        { auraHubId: hubId },
        {
          $pull: { activeParticipants: { auraPlayerId: { $in: cleaned } } },
          $inc: { rtcSessionVersion: 1 },
          lastUpdatedAt: new Date(),
        }
      );
      console.log(`[PresenceService] 🧹 Reconciled ${cleaned.length} stale entries from hub ${hubId}`);
    }
    _metrics.reconciliations++;
    return cleaned;
  } catch (err) {
    _metrics.failures++;
    console.error(`[PresenceService] ❌ reconcile failed: ${err.message}`);
    return [];
  }
}

// ── Get voice state from durable snapshot (for hydration) ──
async function getVoiceSnapshot(hubId) {
  try {
    return await HubVoiceState.findOne({ auraHubId: hubId }).lean();
  } catch { return null; }
}

function getMetrics() { return { ..._metrics }; }

module.exports = {
  playerJoinedHub,
  playerLeftHub,
  playerJoinedVoice,
  playerLeftVoice,
  heartbeat,
  getHubPresence,
  reconcile,
  getVoiceSnapshot,
  getMetrics,
};
