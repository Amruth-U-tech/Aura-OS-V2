const mongoose = require('mongoose');
const { BEHAVIORAL_EVENT_TYPES } = require('../constants/historyConstants');

// ======================================================
// BEHAVIORAL EVENT MODEL
// The behavioral memory engine for Aura OS
// Every significant lifecycle event is persisted here
// Generic and extensible — future analytics/AI will read this
// Must NOT: contain rendering or business logic
// ======================================================

const behavioralEventSchema = new mongoose.Schema(
  {
    // ── Player Reference ──────────────────────────────
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // ── Event Identity ────────────────────────────────
    eventType: {
      type: String,
      enum: Object.values(BEHAVIORAL_EVENT_TYPES),
      required: [true, 'Event type is required'],
      index: true
    },

    // ── Event Payload ─────────────────────────────────
    // Generic metadata bucket — different events store different shapes
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    // ── Temporal Context ──────────────────────────────
    occurredAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Compound index for efficient player timeline queries
behavioralEventSchema.index({ userId: 1, occurredAt: -1 });
behavioralEventSchema.index({ userId: 1, eventType: 1 });

module.exports = mongoose.model('BehavioralEvent', behavioralEventSchema);
