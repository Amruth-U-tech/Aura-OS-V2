const mongoose = require('mongoose');
const { TASK_STATUS, TASK_PRIORITY, VALIDATION_LIMITS } = require('../constants/taskConstants');

// ======================================================
// TASK MODEL (MISSION)
// Owns: mission persistence structure, enum enforcement
// lifecycle timestamps are immutable after resolution
// Must NOT: calculate XP, decay, or mutate lifecycle logic
// ======================================================

const taskSchema = new mongoose.Schema(
  {
    // ── Ownership ─────────────────────────────────────
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // ── Mission Identity ──────────────────────────────
    title: {
      type: String,
      required: [true, 'Mission title is required'],
      trim: true,
      minlength: [VALIDATION_LIMITS.MIN_TITLE_LENGTH, `Title must be at least ${VALIDATION_LIMITS.MIN_TITLE_LENGTH} characters`],
      maxlength: [VALIDATION_LIMITS.MAX_TITLE_LENGTH, `Title cannot exceed ${VALIDATION_LIMITS.MAX_TITLE_LENGTH} characters`]
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH, `Description cannot exceed ${VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH} characters`]
    },

    // ── Priority ──────────────────────────────────────
    priority: {
      type: String,
      enum: Object.values(TASK_PRIORITY),
      default: TASK_PRIORITY.NORMAL
    },

    // ── Lifecycle State ───────────────────────────────
    status: {
      type: String,
      enum: Object.values(TASK_STATUS),
      default: TASK_STATUS.PENDING
    },

    // ── Deadline ──────────────────────────────────────
    deadline: {
      type: Date,
      required: [true, 'Deadline is required']
    },

    // ── Challenge Reference (optional) ─────────────────
    // Links task to a challenge if it was generated from one
    challengeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Challenge',
      default: null
    },

    // ── Lifecycle Timestamps ──────────────────────────
    // Immutable after set — prevent retroactive mutations
    completedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    expiredAt: { type: Date, default: null },

    // ── Extensible Metadata ───────────────────────────
    // Future-safe: analytics, AI context, tags
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true
  }
);

// Compound index for efficient player mission queries + filtering
taskSchema.index({ userId: 1, status: 1 });
taskSchema.index({ userId: 1, deadline: 1 });

module.exports = mongoose.model('Task', taskSchema);
