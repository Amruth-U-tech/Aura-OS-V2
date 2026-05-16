const mongoose = require('mongoose');
const { HUB_EVENT_TYPE } = require('../constants/domainConstants');

// ======================================================
// HUB EVENT — DOMAIN 9/13
// Owns: important hub-level events (NOT Discord chat mirror)
// ONLY: challenge announcements, joins, kicks, system activity
// Must NOT: store full conversation history (infrastructure suicide)
// ======================================================

const hubEventSchema = new mongoose.Schema(
  {
    // ── References ───────────────────────────────────
    hubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      required: true,
      index: true
    },

    // ── Event Identity ───────────────────────────────
    eventType: {
      type: String,
      enum: Object.values(HUB_EVENT_TYPE),
      required: true,
      index: true
    },

    // ── Actor ────────────────────────────────────────
    // The user who triggered the event (null for system events)
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    // ── Target (optional) ────────────────────────────
    // The affected user (e.g. banned/kicked user)
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    // ── Event Payload ────────────────────────────────
    // Generic metadata bucket — different events store different shapes
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ── Temporal Context ─────────────────────────────
    occurredAt: { type: Date, default: Date.now, index: true }
  },
  {
    timestamps: true
  }
);

// ── Indexes ──────────────────────────────────────────
// Hub event timeline (paginated, newest first)
hubEventSchema.index({ hubId: 1, occurredAt: -1 });
// Event type filtering within a hub
hubEventSchema.index({ hubId: 1, eventType: 1, occurredAt: -1 });

module.exports = mongoose.model('HubEvent', hubEventSchema);
