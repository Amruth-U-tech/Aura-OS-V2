const HubMessage = require('../../models/HubMessage');
const HubMembership = require('../../models/HubMembership');
const HubAccessState = require('../../models/HubAccessState');
const { redisStreams } = require('../../realtime/redis');
const auraEvents = require('../../events/eventBus');
const { EVENTS } = require('../../events/eventConstants');
const sequenceManager = require('../../events/sequenceManager');

// ======================================================
// MESSAGE DOMAIN SERVICE — Phase D3.3.1
// Authoritative message lifecycle
//
// Owns: validate → persist → stream → emit
// Must NOT: bypass EventBus, trust transport, skip sequence
// ======================================================

const _metrics = {
  sent: 0,
  edited: 0,
  deleted: 0,
  replayed: 0,
  rejected: 0,
  failures: 0,
};

// ── Send a message ────────────────────────────────────
async function sendMessage(hubIdParam, senderId, senderName, content, opts = {}) {
  const Hub = require('../../models/Hub');
  const mongoose = require('mongoose');

  // Step 0: Resolve hub identity (supports both Mongo _id and auraHubId)
  let hubDoc;
  if (mongoose.Types.ObjectId.isValid(hubIdParam)) {
    hubDoc = await Hub.findById(hubIdParam).select('_id auraHubId').lean();
  }
  if (!hubDoc) {
    hubDoc = await Hub.findOne({ auraHubId: hubIdParam }).select('_id auraHubId').lean();
  }
  if (!hubDoc) {
    _metrics.rejected++;
    return { success: false, reason: 'HUB_NOT_FOUND' };
  }

  const hubId = hubDoc._id; // Canonical MongoDB ObjectId for all downstream queries

  // Step 1: Validate membership
  const membership = await HubMembership.findOne({
    hubId,
    userId: senderId,
    status: 'ACTIVE',
  }).lean();

  if (!membership) {
    _metrics.rejected++;
    return { success: false, reason: 'NOT_A_MEMBER' };
  }

  // Step 2: Check access state (if exists — optional for unprovisioned hubs)
  try {
    const accessState = await HubAccessState.findOne({
      auraHubId: hubId,       // Uses MongoDB ObjectId (hub._id)
      membershipState: 'ACTIVE',
    }).lean();

    if (accessState && !accessState.hasChannelAccess) {
      _metrics.rejected++;
      return { success: false, reason: 'CHANNEL_ACCESS_REVOKED' };
    }
  } catch {
    // HubAccessState may not exist for unprovisioned hubs — allow access
  }

  // Step 3: Assign sequence
  const seq = sequenceManager.next();
  const traceId = `msg-${hubId}-${seq}-${Date.now()}`;

  // Step 4: Persist to Mongo (durable truth)
  let message;
  try {
    message = await HubMessage.create({
      hubId,
      senderId,
      senderName,
      senderAvatar: opts.senderAvatar || null,
      content,
      contentType: opts.contentType || 'text',
      attachments: opts.attachments || [],
      source: opts.source || 'aura',
      discordMessageId: opts.discordMessageId || null,
      sequence: seq,
      traceId,
    });
  } catch (err) {
    _metrics.failures++;
    console.error(`[MessageService] ❌ Persist failed: ${err.message}`);
    return { success: false, reason: 'PERSIST_FAILED' };
  }

  // Step 5: Append to Redis stream (for replay coordination)
  await redisStreams.appendMessage(hubId.toString(), {
    authorId: senderId.toString(),
    authorName: senderName,
    content,
    tempId: opts.tempId || '',
    source: opts.source || 'aura',
    traceId,
    sequence: seq,
  });

  // Step 6: Emit via EventBus (EventBus creates the envelope automatically)
  auraEvents.emitEvent('message.created', {
    _id: message._id,
    hubId: hubId.toString(),
    senderId: senderId.toString(),
    senderName,
    senderAvatar: opts.senderAvatar || null,
    content,
    contentType: message.contentType,
    source: message.source,
    tempId: opts.tempId || null,
    sequence: seq,
    createdAt: message.createdAt,
  }, { source: 'messageDomainService', actorId: senderId.toString() });

  _metrics.sent++;
  return { success: true, message: _sanitize(message), tempId: opts.tempId };
}

// ── Edit a message ────────────────────────────────────
async function editMessage(messageId, senderId, newContent) {
  const message = await HubMessage.findById(messageId);
  if (!message) return { success: false, reason: 'NOT_FOUND' };
  if (message.senderId.toString() !== senderId.toString()) {
    return { success: false, reason: 'NOT_OWNER' };
  }
  if (message.deleted) return { success: false, reason: 'ALREADY_DELETED' };

  message.content = newContent;
  message.edited = true;
  message.editedAt = new Date();
  message.version++;
  await message.save();

  auraEvents.emitEvent('message.edited', {
    _id: message._id,
    hubId: message.hubId.toString(),
    content: newContent,
    edited: true,
    editedAt: message.editedAt,
    sequence: message.sequence,
  });

  _metrics.edited++;
  return { success: true, message: _sanitize(message) };
}

// ── Delete a message ──────────────────────────────────
async function deleteMessage(messageId, senderId) {
  const message = await HubMessage.findById(messageId);
  if (!message) return { success: false, reason: 'NOT_FOUND' };
  if (message.senderId.toString() !== senderId.toString()) {
    return { success: false, reason: 'NOT_OWNER' };
  }

  message.deleted = true;
  message.content = '[deleted]';
  message.version++;
  await message.save();

  auraEvents.emitEvent('message.deleted', {
    _id: message._id,
    hubId: message.hubId.toString(),
    deleted: true,
    sequence: message.sequence,
  });

  _metrics.deleted++;
  return { success: true };
}

// ── Get message history (paginated) ───────────────────
async function getHistory(hubIdParam, opts = {}) {
  const { limit = 50, before = null, after = null } = opts;
  const hubId = await _resolveHubId(hubIdParam);
  if (!hubId) return [];

  const query = { hubId, deleted: false };
  if (before) query.createdAt = { $lt: new Date(before) };
  if (after) query.createdAt = { $gt: new Date(after) };

  const messages = await HubMessage.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 100))
    .lean();

  return messages.map(_sanitize).reverse(); // chronological order
}

// ── Replay after sequence (for reconnect) ─────────────
async function replayAfterSequence(hubIdParam, afterSequence) {
  const hubId = await _resolveHubId(hubIdParam);
  if (!hubId) return [];

  // Try Redis first (fast, ephemeral)
  const redisReplay = await redisStreams.replayAfterSequence(hubId.toString(), afterSequence);
  if (redisReplay.length > 0) {
    _metrics.replayed++;
    return redisReplay;
  }

  // Fallback to Mongo (durable)
  const messages = await HubMessage.find({
    hubId,
    sequence: { $gt: afterSequence },
    deleted: false,
  })
    .sort({ sequence: 1 })
    .limit(100)
    .lean();

  _metrics.replayed++;
  return messages.map(_sanitize);
}

// ── Sanitize for API response ─────────────────────────
function _sanitize(msg) {
  if (!msg) return null;
  return {
    _id: msg._id,
    hubId: msg.hubId,
    senderId: msg.senderId,
    senderName: msg.senderName,
    senderAvatar: msg.senderAvatar,
    content: msg.content,
    contentType: msg.contentType,
    attachments: msg.attachments,
    source: msg.source,
    sequence: msg.sequence,
    traceId: msg.traceId,
    edited: msg.edited,
    deleted: msg.deleted,
    editedAt: msg.editedAt,
    createdAt: msg.createdAt,
  };
}

// ── Resolve hub identity (auraHubId or ObjectId → _id) ──
async function _resolveHubId(hubIdParam) {
  if (!hubIdParam) return null;
  const Hub = require('../../models/Hub');
  const mongoose = require('mongoose');
  
  if (mongoose.Types.ObjectId.isValid(hubIdParam)) {
    const h = await Hub.findById(hubIdParam).select('_id').lean();
    if (h) return h._id;
  }
  const h = await Hub.findOne({ auraHubId: hubIdParam }).select('_id').lean();
  return h?._id || null;
}

function getMetrics() { return { ..._metrics }; }

module.exports = {
  sendMessage,
  editMessage,
  deleteMessage,
  getHistory,
  replayAfterSequence,
  getMetrics,
};
