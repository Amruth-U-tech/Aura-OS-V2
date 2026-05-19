const redisClient = require('./redisClient');

// ======================================================
// REDIS PRESENCE — Phase D3.2.1
// Distributed ephemeral presence state
//
// Owns: hub:{hubId}:presence hashes
// Each hash field = auraPlayerId, value = JSON presence blob
//
// Must NOT: be durable truth
// Must: expire stale presence, reconcile reconnects
// ======================================================

const PRESENCE_PREFIX = process.env.REDIS_PRESENCE_PREFIX || 'presence:';
const STALE_THRESHOLD_MS = 90_000; // 90s without heartbeat = stale

const _metrics = {
  updateCount: 0,
  removeCount: 0,
  ghostCleanups: 0,
  reconcileCount: 0,
  failures: 0,
};

function _presenceKey(hubId) {
  return `${PRESENCE_PREFIX}hub:${hubId}`;
}

// ── Set player presence in a hub ──────────────────────
async function setPresence(hubId, auraPlayerId, presenceData) {
  const redis = redisClient.getClient();
  if (redis.status !== 'ready') { _metrics.failures++; return false; }

  try {
    const blob = JSON.stringify({
      auraPlayerId,
      online: true,
      inVoice: presenceData.inVoice || false,
      speaking: presenceData.speaking || false,
      muted: presenceData.muted || false,
      displayName: presenceData.displayName || 'Player',
      lastHeartbeatAt: Date.now(),
      ...presenceData,
    });
    await redis.hset(_presenceKey(hubId), auraPlayerId.toString(), blob);
    _metrics.updateCount++;
    return true;
  } catch (err) {
    _metrics.failures++;
    console.error(`[RedisPresence] ❌ setPresence failed: ${err.message}`);
    return false;
  }
}

// ── Remove player from hub presence ───────────────────
async function removePresence(hubId, auraPlayerId) {
  const redis = redisClient.getClient();
  if (redis.status !== 'ready') { _metrics.failures++; return false; }

  try {
    await redis.hdel(_presenceKey(hubId), auraPlayerId.toString());
    _metrics.removeCount++;
    return true;
  } catch (err) {
    _metrics.failures++;
    console.error(`[RedisPresence] ❌ removePresence failed: ${err.message}`);
    return false;
  }
}

// ── Get all presence for a hub ────────────────────────
async function getHubPresence(hubId) {
  const redis = redisClient.getClient();
  if (redis.status !== 'ready') return [];

  try {
    const raw = await redis.hgetall(_presenceKey(hubId));
    if (!raw || Object.keys(raw).length === 0) return [];

    return Object.values(raw).map(blob => {
      try { return JSON.parse(blob); }
      catch { return null; }
    }).filter(Boolean);
  } catch (err) {
    _metrics.failures++;
    console.error(`[RedisPresence] ❌ getHubPresence failed: ${err.message}`);
    return [];
  }
}

// ── Heartbeat update ──────────────────────────────────
async function heartbeat(hubId, auraPlayerId) {
  const redis = redisClient.getClient();
  if (redis.status !== 'ready') return false;

  try {
    const raw = await redis.hget(_presenceKey(hubId), auraPlayerId.toString());
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    parsed.lastHeartbeatAt = Date.now();
    await redis.hset(_presenceKey(hubId), auraPlayerId.toString(), JSON.stringify(parsed));
    return true;
  } catch (err) {
    _metrics.failures++;
    return false;
  }
}

// ── Clean stale presence entries ──────────────────────
async function cleanStalePresence(hubId) {
  const redis = redisClient.getClient();
  if (redis.status !== 'ready') return [];

  const now = Date.now();
  const cleaned = [];

  try {
    const raw = await redis.hgetall(_presenceKey(hubId));
    if (!raw) return [];

    for (const [playerId, blob] of Object.entries(raw)) {
      try {
        const parsed = JSON.parse(blob);
        if (now - (parsed.lastHeartbeatAt || 0) > STALE_THRESHOLD_MS) {
          await redis.hdel(_presenceKey(hubId), playerId);
          cleaned.push(playerId);
          _metrics.ghostCleanups++;
          console.log(`[RedisPresence] 🧹 Ghost cleanup: ${playerId} from hub ${hubId}`);
        }
      } catch { /* malformed entry, remove it */ 
        await redis.hdel(_presenceKey(hubId), playerId);
        cleaned.push(playerId);
      }
    }
  } catch (err) {
    _metrics.failures++;
    console.error(`[RedisPresence] ❌ cleanStale failed: ${err.message}`);
  }

  return cleaned;
}

function getMetrics() { return { ..._metrics }; }

module.exports = {
  setPresence,
  removePresence,
  getHubPresence,
  heartbeat,
  cleanStalePresence,
  getMetrics,
  STALE_THRESHOLD_MS,
};
