const mongoose = require('mongoose');
const { DISCIPLINE_STATE } = require('../constants/disciplineConstants');

// ======================================================
// DISCIPLINE PROFILE MODEL
// Persists per-player daily discipline state and schedule
// Owns: discipline state transitions, reset tracking
// Must NOT: contain mission or progression logic
// ======================================================

const disciplineProfileSchema = new mongoose.Schema(
  {
    // ── Player Reference ──────────────────────────────
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // One discipline profile per player
      index: true
    },

    // ── State ──────────────────────────────────────────
    currentState: {
      type: String,
      enum: Object.values(DISCIPLINE_STATE),
      default: DISCIPLINE_STATE.WAITING
    },

    // ── Schedule ──────────────────────────────────────
    scheduledHour: {
      type: Number, // 0-23
      min: 0,
      max: 23,
      default: 6
    },
    scheduledDurationMinutes: {
      type: Number,
      min: 5,
      max: 480,
      default: 60
    },

    // ── Reset Tracking ────────────────────────────────
    lastResetDate: {
      type: Date,
      default: null
    },
    lastCompletedDate: {
      type: Date,
      default: null
    },

    // ── Manual Override ───────────────────────────────
    manuallyDisabledAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('DisciplineProfile', disciplineProfileSchema);
