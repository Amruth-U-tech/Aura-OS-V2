const mongoose = require('mongoose');
const {
  PRIMARY_GOALS,
  ONBOARDING_STEPS
} = require('../constants/onboardingConstants');
const { AUTH_PROVIDER, AUTH_STATUS } = require('../constants/domainConstants');

// ======================================================
// USER MODEL — AUTH CREDENTIAL DOMAIN (Domain 1/13)
// Owns: login credentials, auth ownership, session identity
// Phase 2.3: Enhanced with OAuth, multi-provider, session tracking
// Must NOT: contain gameplay, progression, or challenge logic
// SECURITY PRIORITY: EXTREMELY HIGH
// ======================================================

const userSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────
    playerName: {
      type: String,
      required: [true, 'Player name is required'],
      trim: true,
      minlength: [2, 'Player name must be at least 2 characters'],
      maxlength: [50, 'Player name cannot exceed 50 characters']
    },
    // Phase 2.4.4: Normalized lowercase for case-insensitive uniqueness
    normalizedPlayerName: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
    },
    passwordHash: {
      type: String,
      // Phase D1: Not required — Discord auth users have no password
      // Local auth enforces password at service level
      required: false,
      select: false // Never return password in queries
    },

    // ── Auth Provider ─────────────────────────────────
    // Supports future OAuth (Discord, Google)
    authProvider: {
      type: String,
      enum: Object.values(AUTH_PROVIDER),
      default: AUTH_PROVIDER.LOCAL
    },
    authStatus: {
      type: String,
      enum: Object.values(AUTH_STATUS),
      default: AUTH_STATUS.ACTIVE
    },

    // ── OAuth Metadata ────────────────────────────────
    // Stores provider-specific tokens/IDs without schema changes
    oauthProviders: [{
      provider: { type: String, enum: Object.values(AUTH_PROVIDER) },
      providerId: { type: String },
      accessToken: { type: String, select: false },
      refreshToken: { type: String, select: false },
      linkedAt: { type: Date, default: Date.now }
    }],

    // ── Session Tracking ──────────────────────────────
    lastLoginAt: { type: Date, default: null },
    loginCount: { type: Number, default: 0 },
    lastActiveAt: { type: Date, default: null },

    // ── Physical Profile ──────────────────────────────
    age: {
      type: Number,
      min: [13, 'Age must be at least 13'],
      max: [120, 'Age cannot exceed 120']
    },
    dateOfBirth: {
      type: Date
    },
    height: {
      type: Number, // cm
      min: [50, 'Height must be at least 50cm'],
      max: [300, 'Height cannot exceed 300cm']
    },
    weight: {
      type: Number, // kg
      min: [20, 'Weight must be at least 20kg'],
      max: [500, 'Weight cannot exceed 500kg']
    },

    // ── Behavioral Goals ──────────────────────────────
    primaryGoal: {
      type: String,
      enum: Object.values(PRIMARY_GOALS)
    },

    // ── Discipline ────────────────────────────────────
    defaultDisciplineTime: {
      type: Number, // Hour of day (0-23)
      min: 0,
      max: 23,
      default: 6
    },

    // ── Onboarding State ──────────────────────────────
    onboardingCompleted: {
      type: Boolean,
      default: false
    },
    onboardingStep: {
      type: String,
      enum: Object.values(ONBOARDING_STEPS),
      default: ONBOARDING_STEPS.INTRO
    }
  },
  {
    timestamps: true
  }
);

// ── Phase 2.4.4: Auto-populate normalizedPlayerName on save ────
// Mongoose 9.x: async middleware, no next() callback
userSchema.pre('save', function () {
  if (this.isModified('playerName') && this.playerName) {
    this.normalizedPlayerName = this.playerName.toLowerCase().trim();
  }
});

// ── Indexes ──────────────────────────────────────────
// Primary: email uniqueness (already handled by unique:true)
// Retrieval: auth status filtering, login tracking
userSchema.index({ authStatus: 1 });
userSchema.index({ lastLoginAt: -1 });
userSchema.index({ 'oauthProviders.provider': 1, 'oauthProviders.providerId': 1 });

module.exports = mongoose.model('User', userSchema);
