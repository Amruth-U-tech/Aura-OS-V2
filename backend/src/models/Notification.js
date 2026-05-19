const mongoose = require('mongoose');

// ======================================================
// NOTIFICATION MODEL — Phase N1
// Persistent distributed communication artifact
// Owns: durable notification storage with lifecycle states
//
// Architecture rules:
// 1. Notifications are PERSISTENT — they survive reconnects/restarts
// 2. Notifications carry CANONICAL identity (actorId, targetId, entityId)
// 3. Notifications have acknowledgement lifecycle (read → acknowledged)
// 4. Notifications support TTL auto-expiry via expiresAt
// 5. Notifications are the communication layer — NOT the domain layer
//
// Must NOT: replace domain state, contain business logic
// ======================================================

const NOTIFICATION_CATEGORIES = ['SOCIAL', 'CHALLENGE', 'HUB', 'SYSTEM', 'REWARD', 'TASK'];

const NOTIFICATION_TYPES = [
  // Social
  'FRIEND_REQUEST_SENT', 'FRIEND_REQUEST_ACCEPTED', 'FRIEND_REQUEST_DECLINED', 'FRIEND_REMOVED',
  // Challenge
  'CHALLENGE_CREATED', 'CHALLENGE_INVITED', 'CHALLENGE_ACCEPTED', 'CHALLENGE_DECLINED',
  'CHALLENGE_CANCELLED', 'CHALLENGE_SUBMITTED', 'CHALLENGE_VALIDATED', 'CHALLENGE_RESOLVED',
  // Hub (future-ready)
  'HUB_INVITE', 'HUB_JOINED', 'HUB_LEFT', 'HUB_KICKED',
  // System
  'SYSTEM_ALERT', 'SESSION_RECOVERED', 'RECONNECT_COMPLETED',
  // Reward
  'VOUCHER_UNLOCKED', 'REWARD_GRANTED',
  // Task
  'TASK_COMPLETED', 'TASK_FAILED', 'TASK_EXPIRED',
  // Level
  'LEVEL_UP'
];

const notificationSchema = new mongoose.Schema({
  // ── Type & Category ─────────────────────────────────
  type: {
    type: String,
    required: true,
    enum: NOTIFICATION_TYPES,
    index: true
  },
  category: {
    type: String,
    required: true,
    enum: NOTIFICATION_CATEGORIES,
    index: true
  },

  // ── Actor (who performed the action) ────────────────
  actorId: {
    type: String,
    default: null,
    index: true
  },
  actorName: {
    type: String,
    default: null
  },

  // ── Target (who receives this notification) ─────────
  targetId: {
    type: String,
    required: true,
    index: true
  },
  targetName: {
    type: String,
    default: null
  },

  // ── Entity reference (what this is about) ───────────
  entityType: {
    type: String,
    default: null  // 'challenge', 'friendRequest', 'hub', 'task', etc.
  },
  entityId: {
    type: String,
    default: null
  },

  // ── Content ─────────────────────────────────────────
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  message: {
    type: String,
    default: '',
    maxlength: 500
  },

  // ── Flexible payload (type-specific data) ───────────
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // ── Lifecycle states ────────────────────────────────
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  acknowledged: {
    type: Boolean,
    default: false,
    index: true
  },

  // ── Timestamps ──────────────────────────────────────
  issuedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  readAt: {
    type: Date,
    default: null
  },
  acknowledgedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: null  // null = never expires
  },

  // ── Distributed traceability ────────────────────────
  traceId: {
    type: String,
    default: null,
    index: true
  },
  version: {
    type: Number,
    default: 1
  },
  // Phase N2: Deterministic sequence for ordering and stale rejection
  sequence: {
    type: Number,
    default: null,
    index: true
  }
}, {
  timestamps: true  // adds createdAt, updatedAt
});

// ── Optimized Compound Indexes ────────────────────────
// Primary retrieval: "get my notifications, newest first"
notificationSchema.index({ targetId: 1, issuedAt: -1 });
// Unread filter: "get my unread notifications"
notificationSchema.index({ targetId: 1, read: 1, issuedAt: -1 });
// Unacknowledged filter
notificationSchema.index({ targetId: 1, acknowledged: 1, issuedAt: -1 });
// Entity lookup: "all notifications about this challenge/hub"
notificationSchema.index({ entityType: 1, entityId: 1, issuedAt: -1 });
// TTL auto-cleanup: expired notifications are removed automatically
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $ne: null } } });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_CATEGORIES = NOTIFICATION_CATEGORIES;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
