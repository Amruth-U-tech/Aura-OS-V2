const mongoose = require('mongoose');
const { CHALLENGE_STATUS, CHALLENGE_TYPE } = require('../constants/domainConstants');
const { generateChallengeId } = require('../services/identityGenerator');

// ======================================================
// CHALLENGE — DOMAIN 10/13
// Owns: multiplayer challenge entities and lifecycle state
// Participants array is BOUNDED (max 10) — not a scaling concern
// Must NOT: contain submission data, scoring, or resolution logic
// ======================================================

const challengeSchema = new mongoose.Schema(
  {
    // ── Permanent Public Identity ─────────────────────
    auraChallengeId: {
      type: String,
      unique: true,
      required: true,
      index: true,
      default: generateChallengeId
    },

    // ── Challenge Identity ────────────────────────────
    title: {
      type: String,
      required: [true, 'Challenge title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [100, 'Title cannot exceed 100 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ''
    },

    // ── Challenge Type ───────────────────────────────
    type: {
      type: String,
      enum: Object.values(CHALLENGE_TYPE),
      required: true
    },

    // ── Ownership ────────────────────────────────────
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    // Friend 1v1: direct routing to specific friend
    targetFriendId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    // Optional: hub-scoped challenge
    hubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hub',
      default: null,
      index: true
    },

    // ── Lifecycle State ──────────────────────────────
    status: {
      type: String,
      enum: Object.values(CHALLENGE_STATUS),
      default: CHALLENGE_STATUS.DRAFT,
      index: true
    },

    // ── Participants ─────────────────────────────────
    // BOUNDED array (max 10) — safe from embedded document explosion
    participants: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      joinedAt: { type: Date, default: Date.now },
      status: {
        type: String,
        enum: ['JOINED', 'SUBMITTED', 'WINNER', 'LOSER', 'DISQUALIFIED', 'WITHDRAWN'],
        default: 'JOINED'
      }
    }],
    minParticipants: { type: Number, default: 2, min: 2 },
    maxParticipants: { type: Number, default: 2, min: 2, max: 10 },

    // ── Stakes ───────────────────────────────────────
    stakeXp: { type: Number, default: 0, min: 0 },
    stakeType: {
      type: String,
      enum: ['NONE', 'XP', 'TRUST_WEIGHTED'],
      default: 'NONE'
    },

    // ── Schedule ─────────────────────────────────────
    // startAt is OPTIONAL — if omitted, activates immediately
    // If provided, challenge enters SCHEDULED until currentTime >= startAt
    startAt: { type: Date, default: null },
    // endAt is MANDATORY — challenge MUST have deterministic ending point
    endAt: { type: Date, required: [true, 'Challenge must have an end time'] },
    submissionDeadline: { type: Date, default: null },

    // ── Lifecycle Timestamps ─────────────────────────
    scheduledAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
    lockedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },

    // ── Resolution ───────────────────────────────────
    // Stored AFTER resolution — no winner logic here
    winnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    // ── Extensible Metadata ──────────────────────────
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true
  }
);

// ── Indexes ──────────────────────────────────────────
// Creator's challenge list
challengeSchema.index({ creatorId: 1, status: 1, createdAt: -1 });
// Hub challenge feed
challengeSchema.index({ hubId: 1, status: 1, createdAt: -1 });
// Active challenges (scheduler retrieval)
challengeSchema.index({ status: 1, endAt: 1 });
// Participant lookup: find challenges a user is in
challengeSchema.index({ 'participants.userId': 1, status: 1 });

module.exports = mongoose.model('Challenge', challengeSchema);
