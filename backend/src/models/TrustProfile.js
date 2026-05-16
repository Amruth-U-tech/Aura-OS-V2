const mongoose = require('mongoose');

// ======================================================
// TRUST PROFILE — DOMAIN 12/13
// Owns: trust progression state and validation consistency
// Supports: future AI scoring, fraud detection, moderation
// Must NOT: contain trust calculation formulas (Phase 2.4)
// ======================================================

const trustProfileSchema = new mongoose.Schema(
  {
    // ── Player Reference (1:1 with User) ──────────────
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },

    // ── Trust Score ──────────────────────────────────
    // Rolling weighted average (0-100)
    // 50 = neutral start, 70+ = verified, 90+ = exceptional
    trustScore: { type: Number, default: 50, min: 0, max: 100 },

    // ── Validation Counters ──────────────────────────
    totalValidations: { type: Number, default: 0, min: 0 },
    verifiedCount: { type: Number, default: 0, min: 0 },
    rejectedCount: { type: Number, default: 0, min: 0 },
    exceptionalCount: { type: Number, default: 0, min: 0 },

    // ── Behavioral Reliability ───────────────────────
    deadlineMissCount: { type: Number, default: 0, min: 0 },
    challengeCompletionRate: { type: Number, default: 0, min: 0, max: 100 },
    streakConsistencyScore: { type: Number, default: 0, min: 0, max: 100 },

    // ── Trust Tier (derived from trustScore) ─────────
    // Threshold-based: UNTRUSTED(0-29) | NEUTRAL(30-49) |
    // TRUSTED(50-69) | VERIFIED(70-89) | EXCEPTIONAL(90-100)
    tier: {
      type: String,
      enum: ['UNTRUSTED', 'NEUTRAL', 'TRUSTED', 'VERIFIED', 'EXCEPTIONAL'],
      default: 'NEUTRAL'
    },

    // ── Moderation Flags ─────────────────────────────
    flaggedForReview: { type: Boolean, default: false },
    lastReviewAt: { type: Date, default: null },
    reviewNotes: { type: String, default: null, select: false },

    // ── History Window ───────────────────────────────
    // Last N validation scores (rolling window for weighted average)
    recentScores: [{
      score: { type: Number, min: 0, max: 100 },
      source: { type: String },
      recordedAt: { type: Date, default: Date.now }
    }],

    // ── Last Updated Snapshot ────────────────────────
    lastScoreChangeAt: { type: Date, default: null },
    lastValidationAt: { type: Date, default: null },

    // ── Extensible Metadata ──────────────────────────
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true
  }
);

// ── Indexes ──────────────────────────────────────────
// Leaderboard: trust tier ranking
trustProfileSchema.index({ trustScore: -1 });
trustProfileSchema.index({ tier: 1, trustScore: -1 });
// Moderation queries
trustProfileSchema.index({ flaggedForReview: 1 });

module.exports = mongoose.model('TrustProfile', trustProfileSchema);
