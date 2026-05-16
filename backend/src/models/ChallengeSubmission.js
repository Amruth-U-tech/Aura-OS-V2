const mongoose = require('mongoose');
const { SUBMISSION_STATUS, SUBMISSION_PROVIDER } = require('../constants/domainConstants');

// ======================================================
// CHALLENGE SUBMISSION — DOMAIN 11/13
// Owns: proof uploads and AI validation responses
// ISOLATED from Challenge entity — prevents document bloat
// Must NOT: contain scoring formulas or winner determination
// ======================================================

const challengeSubmissionSchema = new mongoose.Schema(
  {
    // ── References ───────────────────────────────────
    challengeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Challenge',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // ── Proof Data ───────────────────────────────────
    proofImageUrls: [{
      type: String,
      trim: true
    }],
    proofText: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    },

    // ── Lifecycle State ──────────────────────────────
    status: {
      type: String,
      enum: Object.values(SUBMISSION_STATUS),
      default: SUBMISSION_STATUS.PENDING,
      index: true
    },

    // ── AI Validation Response ───────────────────────
    // Stored verbatim from the AI provider
    validationScore: { type: Number, default: null, min: 0, max: 100 },
    validationProvider: {
      type: String,
      enum: Object.values(SUBMISSION_PROVIDER),
      default: null
    },
    aiExplanation: { type: String, default: null, maxlength: 2000 },
    aiRawResponse: { type: mongoose.Schema.Types.Mixed, default: null, select: false },

    // ── Retry Tracking ───────────────────────────────
    attemptNumber: { type: Number, default: 1, min: 1 },
    maxAttempts: { type: Number, default: 3 },
    lastAttemptAt: { type: Date, default: null },

    // ── Lifecycle Timestamps ─────────────────────────
    submittedAt: { type: Date, default: Date.now },
    validatedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },

    // ── Extensible Metadata ──────────────────────────
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true
  }
);

// ── Indexes ──────────────────────────────────────────
// One submission per user per challenge (latest attempt)
challengeSubmissionSchema.index({ challengeId: 1, userId: 1, attemptNumber: -1 });
// Challenge submissions list
challengeSubmissionSchema.index({ challengeId: 1, status: 1 });
// User's submission history
challengeSubmissionSchema.index({ userId: 1, submittedAt: -1 });

module.exports = mongoose.model('ChallengeSubmission', challengeSubmissionSchema);
