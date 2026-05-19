const redisClient = require('./redisClient');

// ======================================================
// REDIS STREAMS — Phase D3.2.1
// Ordered, replay-safe communication message backbone
//
// Owns: hub:{hubId}:messages streams
// Must NOT: be durable truth (Mongo owns that)
//
// Stream topology per hub:
//   hub:{hubId}:messages (XADD entries)
//     ├── Consumer Group: "socket-broadcaster" → Socket.io rooms
//     └── Consumer Group: "discord-relay"      → Discord webhooks
//
// Each entry preserves envelope metadata (traceId, sequence)
// MAXLEN ~1000 keeps streams bounded per hub
// ======================================================

const STREAM_PREFIX = process.env.REDIS_MESSAGE_STREAM_PREFIX || 'hub:';
const MAX_STREAM_LEN = 1000;
const CONSUMER_GROUP_SOCKET = 'socket-broadcaster';
const CONSUMER_GROUP_RELAY = 'discord-relay';

const _metrics = {
  appendCount: 0,
  appendFailures: 0,
  replayCount: 0,
  replayRejections: 0,
  duplicateAppendRejections: 0,
};

// ── Recent append dedup (prevents double-append on retry) ──
const _recentAppends = new Map();
const DEDUP_WINDOW_MS = 5000;

function _streamKey(hubId) {
  return `${STREAM_PREFIX}${hubId}:messages`;
}

// ── Initialize consumer groups for a hub ──────────────
async function initStream(hubId) {
  const redis = redisClient.getClient();
  const key = _streamKey(hubId);
  try {
    await redis.xgroup('CREATE', key, CONSUMER_GROUP_SOCKET, '$', 'MKSTREAM');
  } catch (err) {
    if (!err.message.includes('BUSYGROUP')) throw err; // already exists
  }
  try {
    await redis.xgroup('CREATE', key, CONSUMER_GROUP_RELAY, '$', 'MKSTREAM');
  } catch (err) {
    if (!err.message.includes('BUSYGROUP')) throw err;
  }
  console.log(`[RedisStreams] ✅ Stream initialized: ${key}`);
}

// ── Append message to hub stream ──────────────────────
async function appendMessage(hubId, message) {
  const redis = redisClient.getClient();
  if (redis.status !== 'ready') {
    _metrics.appendFailures++;
    console.warn(`[RedisStreams] ⚠️ Redis not ready, dropping message for hub ${hubId}`);
    return null;
  }

  // Dedup guard
  const fingerprint = `${hubId}:${message.tempId || message.content}:${message.authorId}`;
  const now = Date.now();
  if (_recentAppends.has(fingerprint) && (now - _recentAppends.get(fingerprint)) < DEDUP_WINDOW_MS) {
    _metrics.duplicateAppendRejections++;
    console.warn(`[RedisStreams] ⚠️ Duplicate append rejected: ${fingerprint}`);
    return null;
  }
  _recentAppends.set(fingerprint, now);

  // Cleanup old fingerprints periodically
  if (_recentAppends.size > 500) {
    for (const [k, ts] of _recentAppends) {
      if (now - ts > DEDUP_WINDOW_MS * 3) _recentAppends.delete(k);
    }
  }

  try {
    const streamId = await redis.xadd(
      _streamKey(hubId), 'MAXLEN', '~', String(MAX_STREAM_LEN), '*',
      'authorId', message.authorId || '',
      'authorName', message.authorName || '',
      'content', message.content || '',
      'tempId', message.tempId || '',
      'source', message.source || 'aura',
      'traceId', message.traceId || '',
      'sequence', String(message.sequence || 0),
      'ts', String(now)
    );
    _metrics.appendCount++;
    return streamId;
  } catch (err) {
    _metrics.appendFailures++;
    console.error(`[RedisStreams] ❌ Append failed for hub ${hubId}: ${err.message}`);
    return null;
  }
}

// ── Replay messages after a sequence (for reconnect) ──
async function replayAfterSequence(hubId, afterSequence = 0, limit = 50) {
  const redis = redisClient.getClient();
  if (redis.status !== 'ready') {
    _metrics.replayRejections++;
    return [];
  }

  try {
    // Read last N entries from the stream
    const entries = await redis.xrevrange(_streamKey(hubId), '+', '-', 'COUNT', limit);
    if (!entries || entries.length === 0) return [];

    const messages = entries
      .map(([id, fields]) => _parseStreamEntry(id, fields))
      .filter(m => m.sequence > afterSequence)
      .reverse(); // chronological order

    _metrics.replayCount++;
    return messages;
  } catch (err) {
    _metrics.replayRejections++;
    console.error(`[RedisStreams] ❌ Replay failed for hub ${hubId}: ${err.message}`);
    return [];
  }
}

// ── Read new entries from consumer group ──────────────
async function readNewEntries(hubId, groupName, consumerName, count = 10, blockMs = 2000) {
  const redis = redisClient.getClient();
  if (redis.status !== 'ready') return [];

  try {
    const results = await redis.xreadgroup(
      'GROUP', groupName, consumerName,
      'COUNT', count, 'BLOCK', blockMs,
      'STREAMS', _streamKey(hubId), '>'
    );
    if (!results) return [];

    const [, entries] = results[0];
    return entries.map(([id, fields]) => ({ id, ..._parseStreamEntry(id, fields) }));
  } catch (err) {
    if (!err.message.includes('NOGROUP')) {
      console.error(`[RedisStreams] ❌ Read failed: ${err.message}`);
    }
    return [];
  }
}

// ── Acknowledge processed entry ───────────────────────
async function ack(hubId, groupName, streamId) {
  const redis = redisClient.getClient();
  try {
    await redis.xack(_streamKey(hubId), groupName, streamId);
  } catch (err) {
    console.error(`[RedisStreams] ❌ ACK failed: ${err.message}`);
  }
}

// ── Parse stream entry fields into object ─────────────
function _parseStreamEntry(id, fields) {
  const obj = {};
  for (let i = 0; i < fields.length; i += 2) {
    obj[fields[i]] = fields[i + 1];
  }
  return {
    streamId: id,
    authorId: obj.authorId || null,
    authorName: obj.authorName || '',
    content: obj.content || '',
    tempId: obj.tempId || null,
    source: obj.source || 'unknown',
    traceId: obj.traceId || null,
    sequence: parseInt(obj.sequence, 10) || 0,
    ts: parseInt(obj.ts, 10) || 0,
  };
}

function getMetrics() { return { ..._metrics }; }

module.exports = {
  initStream,
  appendMessage,
  replayAfterSequence,
  readNewEntries,
  ack,
  getMetrics,
  CONSUMER_GROUP_SOCKET,
  CONSUMER_GROUP_RELAY,
};
