const mongoose = require('mongoose');
const { HUB_VISIBILITY, HUB_STATUS } = require('../constants/domainConstants');
const { generateHubId, generateInviteCode } = require('../services/identityGenerator');

// ======================================================
// HUB — DOMAIN 7/13
// Owns: Aura Hub identity, Discord mapping, hub metadata
// CRITICAL: Aura is ALWAYS source of truth.
//           Discord is ONLY transport infrastructure.
// Must NOT: embed member arrays or contain challenge logic
// ======================================================

const hubSchema = new mongoose.Schema(
  {
    // ── Hub Identity ─────────────────────────────────
    // Human-readable unique ID: AURA-HUB-XXXXXXXX
    auraHubId: {
      type: String,
      unique: true,
      required: true,
      default: generateHubId
    },
    name: {
      type: String,
      required: [true, 'Hub name is required'],
      trim: true,
      minlength: [3, 'Hub name must be at least 3 characters'],
      maxlength: [50, 'Hub name cannot exceed 50 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ''
    },

    // ── Ownership ────────────────────────────────────
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // ── Discord Mapping ──────────────────────────────
    // Optional — hub can exist without Discord
    discordGuildId: { type: String, default: null },
    discordWebhookUrl: { type: String, default: null, select: false },
    discordLinkedAt: { type: Date, default: null },

    // ── Invite System ────────────────────────────────
    inviteCode: {
      type: String,
      unique: true,
      default: generateInviteCode
    },

    // ── Configuration ────────────────────────────────
    visibility: {
      type: String,
      enum: Object.values(HUB_VISIBILITY),
      default: HUB_VISIBILITY.INVITE_ONLY
    },
    status: {
      type: String,
      enum: Object.values(HUB_STATUS),
      default: HUB_STATUS.ACTIVE,
      index: true
    },
    maxMembers: { type: Number, default: 50, min: 2, max: 500 },

    // ── Locale & Region ──────────────────────────────
    region: { type: String, trim: true, default: null },
    timezone: { type: String, trim: true, default: 'Asia/Kolkata' },

    // ── Denormalized Counter ─────────────────────────
    memberCount: { type: Number, default: 1, min: 0 },

    // ── Extensible Metadata ──────────────────────────
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true
  }
);

// ── Indexes ──────────────────────────────────────────
// Hub discovery: public hubs by region
hubSchema.index({ visibility: 1, status: 1, memberCount: -1 });
// Discord lookup: find hub by guild ID
hubSchema.index({ discordGuildId: 1 }, { sparse: true });
// Text search for hub names
hubSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Hub', hubSchema);
