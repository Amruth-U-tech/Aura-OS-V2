const mongoose = require('mongoose');

// ======================================================
// DISCORD INTEGRATION MODEL — Phase D1
// Maps Discord identity ↔ Aura identity
// Owns: Discord OAuth tokens, refresh lifecycle, integration health
// Must NOT: contain gameplay logic, XP, or challenge data
//
// Trust Model:
//   Discord Token → proves "I own this Discord account"
//   Aura JWT      → authorizes "I can play this game session"
//   This model    → bridges the two identities
// ======================================================

const INTEGRATION_STATUS = {
  ACTIVE: 'ACTIVE',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  REFRESH_FAILED: 'REFRESH_FAILED',
  REVOKED: 'REVOKED',
  DISCONNECTED: 'DISCONNECTED',
  RECOVERING: 'RECOVERING'
};

const discordIntegrationSchema = new mongoose.Schema(
  {
    // ── Aura Identity (sovereign) ────────────────────
    auraUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    auraPlayerId: {
      type: String,  // AURA-PLR-XXXX
      index: true
    },

    // ── Discord Identity ─────────────────────────────
    discordUserId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    discordUsername: {
      type: String,
      required: true
    },
    discordDiscriminator: {
      type: String,
      default: '0'  // Discord removed discriminators for most users
    },
    discordAvatar: {
      type: String,
      default: null
    },
    discordGlobalName: {
      type: String,
      default: null
    },

    // ── OAuth Tokens (NEVER exposed to frontend) ─────
    accessToken: {
      type: String,
      required: true,
      select: false  // Never included in queries by default
    },
    refreshToken: {
      type: String,
      required: true,
      select: false
    },
    tokenScope: {
      type: String,
      default: 'identify'
    },

    // ── Token Lifecycle ──────────────────────────────
    expiresAt: {
      type: Date,
      required: true,
      index: true  // For proactive refresh queries
    },
    lastRefreshAt: {
      type: Date,
      default: null
    },
    refreshFailureCount: {
      type: Number,
      default: 0
    },
    lastRefreshError: {
      type: String,
      default: null
    },

    // ── Integration Health ───────────────────────────
    integrationStatus: {
      type: String,
      enum: Object.values(INTEGRATION_STATUS),
      default: INTEGRATION_STATUS.ACTIVE,
      index: true
    },

    // ── Timestamps ───────────────────────────────────
    linkedAt: {
      type: Date,
      default: Date.now
    },
    lastLoginAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// ── Compound Indexes ─────────────────────────────────
// Fast lookup: user → discord mapping
discordIntegrationSchema.index({ auraUserId: 1, discordUserId: 1 });
// Proactive refresh: find expiring tokens
discordIntegrationSchema.index({ integrationStatus: 1, expiresAt: 1 });
// Stale integration recovery
discordIntegrationSchema.index({ integrationStatus: 1, refreshFailureCount: 1 });

// ── Instance Methods ─────────────────────────────────
discordIntegrationSchema.methods.isTokenExpired = function() {
  return this.expiresAt && new Date() >= this.expiresAt;
};

discordIntegrationSchema.methods.isTokenExpiringSoon = function(bufferMs = 5 * 60 * 1000) {
  if (!this.expiresAt) return true;
  return new Date(Date.now() + bufferMs) >= this.expiresAt;
};

// ── Safe serialization (NEVER include tokens) ────────
discordIntegrationSchema.methods.toSafeObject = function() {
  return {
    auraUserId: this.auraUserId?.toString(),
    auraPlayerId: this.auraPlayerId,
    discordUserId: this.discordUserId,
    discordUsername: this.discordUsername,
    discordAvatar: this.discordAvatar,
    discordGlobalName: this.discordGlobalName,
    integrationStatus: this.integrationStatus,
    linkedAt: this.linkedAt,
    lastLoginAt: this.lastLoginAt,
    expiresAt: this.expiresAt,
    refreshFailureCount: this.refreshFailureCount
  };
};

module.exports = mongoose.model('DiscordIntegration', discordIntegrationSchema);
module.exports.INTEGRATION_STATUS = INTEGRATION_STATUS;
