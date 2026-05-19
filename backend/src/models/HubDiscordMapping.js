const mongoose = require('mongoose');

// ======================================================
// HUB DISCORD MAPPING — Phase D3.1
// Owns: Aura Hub ↔ Discord infrastructure topology
//
// AUTHORITY: HubProvisionerService ONLY
//
// This schema is INFRASTRUCTURE MAPPING ONLY.
// It is NOT: chat history, membership truth, RTC state.
//
// CRITICAL: webhookUrl is select:false — it is a live
// secret granting write access to the Discord channel.
// It must NEVER appear in any API response.
//
// syncStatus lifecycle:
//   PROVISIONING → ACTIVE  (happy path)
//   PROVISIONING → FAILED  (provisioning failure)
//   ACTIVE       → DEGRADED (partial Discord drift)
// ======================================================

const hubDiscordMappingSchema = new mongoose.Schema(
  {
    // ── Aura identity (primary authority) ────────────
    auraHubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      required: true,
      unique: true,
    },

    // ── Discord infrastructure references ─────────────
    // These are Discord snowflake IDs — strings, never ObjectIds
    discordGuildId:       { type: String, default: null },
    discordCategoryId:    { type: String, default: null },
    discordChannelId:     { type: String, default: null, unique: true, sparse: true },
    discordVoiceChannelId:{ type: String, default: null, unique: true, sparse: true },

    // SECURITY: webhookUrl is a live write credential.
    // select:false ensures it NEVER appears in API responses.
    webhookUrl: {
      type: String,
      select: false,
      default: null,
    },

    // ── Provisioning lifecycle ────────────────────────
    syncStatus: {
      type: String,
      enum: ['PROVISIONING', 'ACTIVE', 'FAILED', 'DEGRADED'],
      default: 'PROVISIONING',
    },

    // Track retry attempts to prevent infinite loops
    provisionAttempts: { type: Number, default: 0 },
    lastProvisionError: { type: String, default: null },

    // ── Envelope metadata (Phase N2 compatibility) ────
    // Stored for infrastructure audit trail consistency
    traceId:              { type: String, default: null },
    infrastructureVersion:{ type: Number, default: 1 },

    // ── Timestamps ────────────────────────────────────
    provisionedAt: { type: Date, default: null },
    lastSyncedAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────
// auraHubId is already unique above
hubDiscordMappingSchema.index({ syncStatus: 1 });
hubDiscordMappingSchema.index({ discordGuildId: 1 });

module.exports = mongoose.model('HubDiscordMapping', hubDiscordMappingSchema);
