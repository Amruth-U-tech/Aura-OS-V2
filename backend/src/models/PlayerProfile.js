const mongoose = require('mongoose');
const { generatePlayerId } = require('../services/identityGenerator');

// ======================================================
// PLAYER PROFILE — DOMAIN 2/13
// Owns: behavioral player identity, progression snapshot
// Stores ONLY current state — NOT historical progression
// Must NOT: contain auth credentials or challenge logic
// ======================================================

const playerProfileSchema = new mongoose.Schema(
  {
    // ── Permanent Public Identity ─────────────────────
    // GLOBAL multiplayer identity — frontend MUST use this, never Mongo _id
    auraPlayerId: {
      type: String,
      unique: true,
      required: true,
      index: true,
      default: generatePlayerId
    },

    // ── Player Reference (1:1 with User) ──────────────
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },

    // ── Display Identity ──────────────────────────────
    displayName: { type: String, trim: true, maxlength: 50 },
    avatar: { type: String, default: null }, // URL or provider reference
    bio: { type: String, trim: true, maxlength: 200, default: '' },

    // ── Skills & Certificates ────────────────────────
    // LinkedIn-style skill verification system
    skills: [{
      name: { type: String, required: true, trim: true, maxlength: 50 },
      category: { type: String, trim: true, maxlength: 30, default: 'General' },
      verified: { type: Boolean, default: false },
      endorsements: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        endorsedAt: { type: Date, default: Date.now }
      }],
      certificateUrl: { type: String, default: null },
      uploadedAt: { type: Date, default: Date.now }
    }],

    // ── Profile Visibility Settings ──────────────────
    // Phase 2.4.4: Extended with showStreak, showFriends for granular control
    profileVisibility: {
      showEmail: { type: Boolean, default: false },
      showStats: { type: Boolean, default: true },
      showSkills: { type: Boolean, default: true },
      showChallengeHistory: { type: Boolean, default: true },
      showHubs: { type: Boolean, default: true },
      showStreak: { type: Boolean, default: true },
      showFriends: { type: Boolean, default: true },
      isPublic: { type: Boolean, default: true }
    },

    // ── Sound & Notification Preferences ─────────────
    soundEnabled: { type: Boolean, default: true },
    notificationsEnabled: { type: Boolean, default: true },

    // ── Progression Snapshot ──────────────────────────
    // Current state ONLY — history lives in BehavioralEvent
    level: { type: Number, default: 1, min: 1 },
    xp: { type: Number, default: 0, min: 0 },
    totalXpEarned: { type: Number, default: 0, min: 0 },

    // ── Weekly Leaderboard XP ────────────────────────
    // Seasonal weekly tracking — resets every week
    weeklyXp: { type: Number, default: 0, min: 0 },
    weeklyXpResetAt: { type: Date, default: null },
    weeklyVoucherXp: { type: Number, default: 0, min: 0 },

    // ── Streak ────────────────────────────────────────
    currentStreak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    lastStreakDate: { type: Date, default: null },

    // ── Trust Snapshot ────────────────────────────────
    // Denormalized from TrustProfile for fast reads
    trustScore: { type: Number, default: 50, min: 0, max: 100 },

    // ── Social Counters ───────────────────────────────
    // Denormalized for fast profile card rendering
    friendCount: { type: Number, default: 0, min: 0 },
    hubCount: { type: Number, default: 0, min: 0 },
    challengeWins: { type: Number, default: 0, min: 0 },
    challengeLosses: { type: Number, default: 0, min: 0 },
    challengesParticipated: { type: Number, default: 0, min: 0 },

    // ── Achievement Highlights ───────────────────────
    achievements: [{
      title: { type: String, trim: true },
      description: { type: String, trim: true },
      icon: { type: String, default: '🏅' },
      earnedAt: { type: Date, default: Date.now }
    }],

    // ── Locale & Region ───────────────────────────────
    country: { type: String, trim: true, default: null },
    timezone: { type: String, trim: true, default: 'Asia/Kolkata' },
    region: { type: String, trim: true, default: null },
    locale: { type: String, trim: true, default: 'en' },

    // ── Extensible Metadata ───────────────────────────
    // Future-safe bucket for analytics, A/B flags, etc.
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true
  }
);

// ── Indexes ──────────────────────────────────────────
// Leaderboard queries: sort by XP, level, trustScore
playerProfileSchema.index({ level: -1, xp: -1 });
playerProfileSchema.index({ trustScore: -1 });
playerProfileSchema.index({ country: 1, level: -1 });
// Display name search
playerProfileSchema.index({ displayName: 'text' });

module.exports = mongoose.model('PlayerProfile', playerProfileSchema);
