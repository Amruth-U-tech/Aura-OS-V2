const mongoose = require('mongoose');

// ======================================================
// BOT ORCHESTRATION — Phase D3.1
// Owns: Discord-side orchestration audit trail
//
// Prevents:
//   - duplicate relay (same challenge announced twice)
//   - replay duplication (reconnect re-sends bot command)
//   - stale orchestration (challenge resolved but bot didn't update)
//
// Every bot action that creates a Discord-side artifact
// (message, reaction, embed) is recorded here so:
//   1. We can track the discordMessageId for future edits
//   2. We can detect duplicate attempts via idempotency
//   3. We can audit what the bot has done for debugging
//
// Must NOT: contain Aura business logic or state truth
// ======================================================

const botOrchestrationSchema = new mongoose.Schema(
  {
    // ── Aura entity references ────────────────────────
    auraHubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      required: true,
    },
    entityType: {
      type: String,
      required: true,
      // Extensible: challenge, announcement, poll, etc.
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // ── Event type ─────────────────────────────────────
    eventType: {
      type: String,
      required: true,
      // Examples: CHALLENGE_ANNOUNCED, CHALLENGE_RESOLVED,
      //           HUB_WELCOME, MEMBER_JOINED_ANNOUNCED
    },

    // ── Discord artifact reference ────────────────────
    // The Discord message ID created by the bot action
    // Used for future edits (e.g., updating challenge embed)
    discordMessageId: { type: String, default: null },

    // ── Orchestration lifecycle ────────────────────────
    orchestrationState: {
      type: String,
      enum: ['PENDING', 'SENT', 'FAILED', 'RECONCILED'],
      default: 'PENDING',
    },

    retryCount:    { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },

    // ── Envelope compatibility ────────────────────────
    traceId:  { type: String, default: null },
    sequence: { type: Number, default: 0 },
    version:  { type: Number, default: 1 },

    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────
// Idempotency: one orchestration per entity per event type
botOrchestrationSchema.index({ auraHubId: 1, entityId: 1, eventType: 1 }, { unique: true });
botOrchestrationSchema.index({ orchestrationState: 1 });
botOrchestrationSchema.index({ auraHubId: 1 });

module.exports = mongoose.model('BotOrchestration', botOrchestrationSchema);
