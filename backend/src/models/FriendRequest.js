const mongoose = require('mongoose');
const { FRIEND_REQUEST_STATUS } = require('../constants/domainConstants');

// ======================================================
// FRIEND REQUEST — DOMAIN 5/13
// Owns: outgoing/pending friend requests
// Must NOT: contain friendship state or social graph
// Anti-spam: unique compound index prevents duplicate requests
// ======================================================

const friendRequestSchema = new mongoose.Schema(
  {
    // ── Participants ──────────────────────────────────
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // ── Lifecycle State ──────────────────────────────
    status: {
      type: String,
      enum: Object.values(FRIEND_REQUEST_STATUS),
      default: FRIEND_REQUEST_STATUS.PENDING,
      index: true
    },

    // ── Optional Message ─────────────────────────────
    message: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ''
    },

    // ── Lifecycle Timestamps ─────────────────────────
    respondedAt: { type: Date, default: null },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    },

    // ── Extensible Metadata ──────────────────────────
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true
  }
);

// ── Indexes ──────────────────────────────────────────
// Anti-spam: only ONE pending request per sender→receiver pair
friendRequestSchema.index(
  { senderId: 1, receiverId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } }
);
// Receiver inbox queries
friendRequestSchema.index({ receiverId: 1, status: 1, createdAt: -1 });
// Expiration cleanup
friendRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('FriendRequest', friendRequestSchema);
