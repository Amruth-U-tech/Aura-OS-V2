// ======================================================
// EVENT ENVELOPE FACTORY — Phase N2
// THE ONLY WAY to create standardized event envelopes
//
// Every event in the system MUST flow through this factory.
// Raw payload emits are now wrapped automatically.
//
// Envelope fields:
//   traceId       — lifecycle tracing
//   version       — event schema version
//   sequence      — deterministic ordering
//   issuedAt      — server timestamp
//   source        — service/function origin
//   sourceType    — api/socket/system/scheduler
//   entityType    — challenge/task/friend/etc
//   entityId      — canonical entity identity
//   actorId       — user initiating action
//   actorAuraId   — canonical player identity (if available)
//   correlationId — related event grouping
//   replayable    — replay eligibility
//   persistent    — notification/history persistence
//   payload       — actual event data
//
// Must NOT: contain business logic, modify payload data
// ======================================================

const sequenceManager = require('./sequenceManager');
const traceManager = require('./traceManager');

const EVENT_VERSION = 1;

// ── Source type constants ────────────────────────────
const SOURCE_TYPES = {
  API: 'api',
  SOCKET: 'socket',
  SYSTEM: 'system',
  SCHEDULER: 'scheduler',
  LISTENER: 'listener'
};

// ── Create standardized event envelope ───────────────
const createEventEnvelope = (eventName, payload = {}, options = {}) => {
  const {
    source = 'unknown',
    sourceType = SOURCE_TYPES.SYSTEM,
    entityType = null,
    entityId = null,
    actorId = null,
    actorAuraId = null,
    correlationId = null,
    replayable = true,
    persistent = false,
    traceId = null
  } = options;

  const seqMeta = sequenceManager.nextWithMeta();

  return {
    // ── Envelope metadata ─────────────────────────────
    _envelope: true,  // Marker for envelope detection
    eventName,
    traceId: traceId || traceManager.extractOrGenerate(payload),
    version: EVENT_VERSION,
    sequence: seqMeta.sequence,
    issuedAt: seqMeta.issuedAt,

    // ── Source identification ─────────────────────────
    source,
    sourceType,

    // ── Entity identification ────────────────────────
    entityType: entityType || _inferEntityType(eventName),
    entityId: entityId || payload.challengeId || payload.taskId || payload._id || null,

    // ── Actor identification ─────────────────────────
    actorId: actorId || payload.userId || payload.senderId || payload.creatorId || null,
    actorAuraId: actorAuraId || null,

    // ── Correlation ──────────────────────────────────
    correlationId: correlationId || null,

    // ── Lifecycle flags ──────────────────────────────
    replayable,
    persistent,

    // ── Original event data ──────────────────────────
    payload
  };
};

// ── Infer entity type from event name ────────────────
const _inferEntityType = (eventName) => {
  if (!eventName) return null;
  if (eventName.startsWith('challenge.') || eventName.startsWith('challenge:')) return 'challenge';
  if (eventName.startsWith('task.')) return 'task';
  if (eventName.startsWith('friend.')) return 'friendship';
  if (eventName.startsWith('player.')) return 'player';
  if (eventName.startsWith('hub.')) return 'hub';
  if (eventName.startsWith('voucher.') || eventName.startsWith('reward.')) return 'reward';
  if (eventName.startsWith('notification.')) return 'notification';
  if (eventName.startsWith('voice.')) return 'voice';       // Phase D3.1
  if (eventName.startsWith('bot.')) return 'orchestration';  // Phase D3.1
  if (eventName.startsWith('message.')) return 'message';    // Phase D3.3
  if (eventName.startsWith('presence.')) return 'presence';  // Phase D3.3
  return null;
};

// ── Check if a value is an envelope ──────────────────
const isEnvelope = (data) => {
  return data && data._envelope === true && typeof data.sequence === 'number';
};

// ── Extract payload from envelope (backward compat) ──
const extractPayload = (data) => {
  if (isEnvelope(data)) return data.payload;
  return data; // Already raw payload
};

module.exports = {
  createEventEnvelope,
  isEnvelope,
  extractPayload,
  SOURCE_TYPES,
  EVENT_VERSION
};
