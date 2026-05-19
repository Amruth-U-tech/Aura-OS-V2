const mongoose = require('mongoose');

// ======================================================
// HUB VOICE STATE — Phase D3.1
// Owns: durable RTC presence snapshot for reconnect hydration
//
// This is NOT realtime transport or media state.
// LiveKit remains the media authority.
//
// This snapshot exists ONLY for:
//   - reconnect hydration (player refreshes mid-call)
//   - presence reconciliation (stale participant cleanup)
//   - voice UI recovery (restore who's-in-voice after reconnect)
//
// Updated by:
//   - LiveKit webhook events (participant_joined/left)
//   - Discord VOICE_STATE_UPDATE via bot (future)
//   - Stale participant cleanup scheduler (future)
//
// Must NOT: contain media streams, packet state, or codec info
// ======================================================

const hubVoiceStateSchema = new mongoose.Schema(
  {
    // ── Hub identity ──────────────────────────────────
    auraHubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      required: true,
      unique: true,
    },

    // ── LiveKit room reference ────────────────────────
    // Format: "hub:{auraHubId}:voice"
    livekitRoomId: { type: String, default: null },

    // ── Active participants snapshot ──────────────────
    // This is a DURABLE snapshot, not realtime.
    // Reconciled via LiveKit webhooks.
    activeParticipants: [{
      auraPlayerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PlayerProfile',
        required: true,
      },
      displayName: { type: String, default: 'Player' },

      // Voice state flags
      speaking:           { type: Boolean, default: false },
      muted:              { type: Boolean, default: false },
      deafened:            { type: Boolean, default: false },

      // Media state flags
      cameraEnabled:      { type: Boolean, default: false },
      screenShareEnabled: { type: Boolean, default: false },

      // Lifecycle
      joinedAt:        { type: Date, default: Date.now },
      lastHeartbeatAt: { type: Date, default: Date.now },
    }],

    // ── Session versioning ─────────────────────────────
    // Incremented on each reconciliation cycle
    rtcSessionVersion: { type: Number, default: 0 },
    participantCount:  { type: Number, default: 0 },

    // ── Discord fallback count ────────────────────────
    // Number of users in Discord voice (for non-LiveKit presence)
    discordVoiceCount: { type: Number, default: 0 },

    // ── Envelope compatibility ────────────────────────
    traceId:  { type: String, default: null },
    sequence: { type: Number, default: 0 },

    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────
// auraHubId is already unique above
hubVoiceStateSchema.index({ 'activeParticipants.auraPlayerId': 1 });
hubVoiceStateSchema.index({ livekitRoomId: 1 });

module.exports = mongoose.model('HubVoiceState', hubVoiceStateSchema);
