const mongoose = require('mongoose');

// ======================================================
// HUB MESSAGE — Phase D3.3.1
// Durable authoritative message truth
//
// Owns: canonical message persistence
// Must NOT: be the replay transport (Redis Streams owns that)
//
// Identity discipline:
//   senderId = auraPlayerId (canonical)
//   discordMessageId = external reference (for relay dedup)
// ======================================================

const hubMessageSchema = new mongoose.Schema(
  {
    // ── Hub identity ──────────────────────────────────
    hubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      required: true,
    },

    // ── Sender identity (canonical) ───────────────────
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlayerProfile',
      required: true,
    },
    senderName: { type: String, required: true },
    senderAvatar: { type: String, default: null },

    // ── Content ───────────────────────────────────────
    content: { type: String, required: true, maxlength: 4000 },
    contentType: {
      type: String,
      enum: ['text', 'image', 'file', 'system'],
      default: 'text',
    },

    // ── Attachments ───────────────────────────────────
    attachments: [{
      url: { type: String },
      name: { type: String },
      contentType: { type: String },
      size: { type: Number },
    }],

    // ── Discord federation reference ──────────────────
    // For relay dedup — select:false to prevent API leakage
    discordMessageId: { type: String, default: null },

    // ── Source tracking ───────────────────────────────
    source: {
      type: String,
      enum: ['aura', 'discord', 'system'],
      default: 'aura',
    },

    // ── Envelope compatibility ────────────────────────
    sequence: { type: Number, required: true },
    traceId: { type: String, default: null },
    version: { type: Number, default: 1 },

    // ── Lifecycle ─────────────────────────────────────
    edited: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },

    // ── Metadata ──────────────────────────────────────
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────
hubMessageSchema.index({ hubId: 1, sequence: 1 });
hubMessageSchema.index({ hubId: 1, createdAt: -1 });
hubMessageSchema.index({ senderId: 1 });
hubMessageSchema.index({ discordMessageId: 1 }, { sparse: true });

module.exports = mongoose.model('HubMessage', hubMessageSchema);
