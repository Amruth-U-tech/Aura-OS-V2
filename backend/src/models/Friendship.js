const mongoose = require('mongoose');

// ======================================================
// FRIENDSHIP — DOMAIN 6/13
// Owns: active symmetric friendships (social graph edges)
// CRITICAL: userA < userB enforced to prevent directional dupes
// Must NOT: contain friend requests or moderation logic
// ======================================================

const friendshipSchema = new mongoose.Schema(
  {
    // ── Participants (sorted: userA._id < userB._id) ──
    // Sorting prevents duplicate friendships like (A,B) and (B,A)
    userA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    userB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // ── Lifecycle ────────────────────────────────────
    establishedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true, index: true },

    // ── Extensible Metadata ──────────────────────────
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true
  }
);

// ── Pre-save hook: enforce userA < userB ──────────────
// Guarantees symmetric uniqueness without duplicate entries
friendshipSchema.pre('validate', function () {
  if (this.userA && this.userB) {
    const a = this.userA.toString();
    const b = this.userB.toString();
    if (a === b) {
      throw new Error('Cannot create friendship with self');
    }
    if (a > b) {
      [this.userA, this.userB] = [this.userB, this.userA];
    }
  }
});

// ── Indexes ──────────────────────────────────────────
// Unique pair: prevents duplicate friendships
friendshipSchema.index({ userA: 1, userB: 1 }, { unique: true });
// Friend list query: find all friendships for a user
friendshipSchema.index({ userA: 1, isActive: 1 });
friendshipSchema.index({ userB: 1, isActive: 1 });

module.exports = mongoose.model('Friendship', friendshipSchema);
