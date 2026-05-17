const mongoose = require('mongoose');
const { CHALLENGE_STATUS, CHALLENGE_TYPE, PARTICIPANT_STATUS } = require('../constants/domainConstants');
const { generateChallengeId } = require('../services/identityGenerator');

// ======================================================
// CHALLENGE — DOMAIN 10/13
// Phase 3.1.6: Full participation lifecycle
// Participant statuses: INVITED → ACCEPTED/DECLINED/LEFT/SUBMITTED/WINNER/LOSER
// Invitation timestamps: invitedAt, respondedAt, leftAt
// New challenge visibility: declined participants cannot see the challenge
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
    // Phase 3.1.6: Full participation lifecycle
    // INVITED   → player was sent invite, waiting for response
    // ACCEPTED  → player accepted the challenge invite
    // DECLINED  → player declined (challenge hidden for them)
    // JOINED    → player joined directly (hub open), creator always JOINED
    // SUBMITTED → player has submitted proof
    // LEFT      → player left voluntarily before resolution
    // WINNER/LOSER/DISQUALIFIED/WITHDRAWN → post-resolution
    participants: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      status: {
        type: String,
        enum: Object.values(PARTICIPANT_STATUS),
        default: PARTICIPANT_STATUS.JOINED
      },
      // Lifecycle timestamps for this participant
      invitedAt:   { type: Date, default: null },
      joinedAt:    { type: Date, default: Date.now },
      acceptedAt:  { type: Date, default: null },
      declinedAt:  { type: Date, default: null },
      leftAt:      { type: Date, default: null },
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
    startAt: { type: Date, default: null },
    endAt: { type: Date, required: [true, 'Challenge must have an end time'] },
    submissionDeadline: { type: Date, default: null },

    // ── Lifecycle Timestamps ─────────────────────────
    scheduledAt:  { type: Date, default: null },
    activatedAt:  { type: Date, default: null },
    lockedAt:     { type: Date, default: null },
    resolvedAt:   { type: Date, default: null },
    cancelledAt:  { type: Date, default: null },

    // ── Resolution ───────────────────────────────────
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
// Participant lookup: find challenges a user is in (including INVITED)
challengeSchema.index({ 'participants.userId': 1, status: 1 });
// Phase 3.1.6: Efficient retrieval of pending invites for a user
challengeSchema.index({ 'participants.userId': 1, 'participants.status': 1, createdAt: -1 });
// targetFriendId for invite lookup
challengeSchema.index({ targetFriendId: 1, status: 1 });

module.exports = mongoose.model('Challenge', challengeSchema);
