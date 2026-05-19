const mongoose = require('mongoose');

// ======================================================
// HUB ACCESS STATE — Phase D3.1
// Owns: distributed communication authorization truth
//
// AUTHORITY: HubProvisionerService + hub membership lifecycle
//
// This is the ONLY place discordUserId lives in Aura's DB.
// discordUserId is select:false — it is an external reference
// that must NEVER cross into frontend reducers.
//
// Identity discipline:
//   auraPlayerId — canonical Aura identity (master)
//   discordUserId — translated at bot boundary ONLY
//
// rtcPermissions controls LiveKit token grant scope.
// membershipState controls relay event authorization.
// ======================================================

const hubAccessStateSchema = new mongoose.Schema(
  {
    // ── Canonical identity pair ────────────────────────
    auraPlayerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlayerProfile',
      required: true,
    },
    auraHubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      required: true,
    },

    // ── External reference (bot boundary ONLY) ────────
    // select:false: never surfaces in API responses
    // Written only when user links Discord account
    discordUserId: {
      type: String,
      select: false,
      default: null,
    },

    // ── Communication access ───────────────────────────
    hasChannelAccess: { type: Boolean, default: true },
    permissionRoles:  [{ type: String }],

    // ── RTC permissions (LiveKit grant scope) ─────────
    // Backend checks these before minting a LiveKit token
    rtcPermissions: {
      canJoinVoice:    { type: Boolean, default: true },
      canPublishAudio: { type: Boolean, default: true },
      canPublishVideo: { type: Boolean, default: false }, // Video off by default
      canScreenShare:  { type: Boolean, default: false },
    },

    // ── Membership lifecycle ───────────────────────────
    membershipState: {
      type: String,
      enum: ['ACTIVE', 'REMOVED', 'BANNED', 'PENDING'],
      default: 'ACTIVE',
    },

    // ── Presence tracking ─────────────────────────────
    lastPresenceAt: { type: Date, default: null },
    lastSyncedAt:   { type: Date, default: null },

    // ── Envelope compatibility ─────────────────────────
    traceId:  { type: String, default: null },
    sequence: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────
// Compound unique: one access record per player per hub
hubAccessStateSchema.index({ auraPlayerId: 1, auraHubId: 1 }, { unique: true });
hubAccessStateSchema.index({ membershipState: 1 });
hubAccessStateSchema.index({ hasChannelAccess: 1 });
hubAccessStateSchema.index({ auraHubId: 1 });

module.exports = mongoose.model('HubAccessState', hubAccessStateSchema);
