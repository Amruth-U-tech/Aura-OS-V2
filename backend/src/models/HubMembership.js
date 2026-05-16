const mongoose = require('mongoose');
const { HUB_MEMBER_ROLE, HUB_MEMBER_STATUS } = require('../constants/domainConstants');

// ======================================================
// HUB MEMBERSHIP — DOMAIN 8/13
// Owns: player ↔ hub relationships (NOT embedded in Hub)
// Scales independently of hub document size
// Must NOT: contain hub metadata or challenge data
// ======================================================

const hubMembershipSchema = new mongoose.Schema(
  {
    // ── References ───────────────────────────────────
    hubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // ── Role & Status ────────────────────────────────
    role: {
      type: String,
      enum: Object.values(HUB_MEMBER_ROLE),
      default: HUB_MEMBER_ROLE.MEMBER
    },
    status: {
      type: String,
      enum: Object.values(HUB_MEMBER_STATUS),
      default: HUB_MEMBER_STATUS.ACTIVE,
      index: true
    },

    // ── Lifecycle Timestamps ─────────────────────────
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null },
    bannedAt: { type: Date, default: null },
    banReason: { type: String, trim: true, default: null },

    // ── Permissions (future-safe) ────────────────────
    permissions: {
      canCreateChallenges: { type: Boolean, default: true },
      canInviteMembers: { type: Boolean, default: false },
      canModerate: { type: Boolean, default: false }
    },

    // ── Extensible Metadata ──────────────────────────
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true
  }
);

// ── Indexes ──────────────────────────────────────────
// CRITICAL: one membership per user per hub
hubMembershipSchema.index({ hubId: 1, userId: 1 }, { unique: true });
// Hub member list queries
hubMembershipSchema.index({ hubId: 1, status: 1, role: 1 });
// User's hub list
hubMembershipSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('HubMembership', hubMembershipSchema);
