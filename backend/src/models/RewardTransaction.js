const mongoose = require('mongoose');
const { TRANSACTION_TYPE, TRANSACTION_STATUS } = require('../constants/domainConstants');

// ======================================================
// REWARD & XP TRANSACTION — DOMAIN 13/13
// Owns: XP transaction history, reward claims, voucher redemptions
// IMMUTABLE: append-only ledger — NO mutation after creation
// Future financial-grade infrastructure for audit trails
// Must NOT: contain progression math or balance calculations
// ======================================================

const rewardTransactionSchema = new mongoose.Schema(
  {
    // ── Player Reference ─────────────────────────────
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // ── Transaction Type ─────────────────────────────
    type: {
      type: String,
      enum: Object.values(TRANSACTION_TYPE),
      required: true,
      index: true
    },

    // ── Amount & Balance ─────────────────────────────
    // Positive = earned/gained, Negative = spent/deducted
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },

    // ── Source Reference ─────────────────────────────
    // Links to the entity that caused this transaction
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    referenceType: {
      type: String,
      enum: ['TASK', 'CHALLENGE', 'STREAK', 'REWARD', 'SYSTEM', 'MANUAL'],
      default: null
    },

    // ── Transaction Status ───────────────────────────
    status: {
      type: String,
      enum: Object.values(TRANSACTION_STATUS),
      default: TRANSACTION_STATUS.COMPLETED
    },

    // ── Reward-specific Fields ───────────────────────
    // Only populated for REWARD_* transaction types
    rewardDetails: {
      asin: { type: String, default: null },
      voucherTitle: { type: String, default: null },
      provider: { type: String, default: null },
      redeemedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null }
    },

    // ── Immutability Marker ──────────────────────────
    // Once set to true, this transaction MUST NOT be modified
    finalized: { type: Boolean, default: true },

    // ── Audit Trail ──────────────────────────────────
    description: { type: String, trim: true, maxlength: 200, default: '' },
    ipAddress: { type: String, default: null, select: false },

    // ── Extensible Metadata ──────────────────────────
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true
  }
);

// ── Indexes ──────────────────────────────────────────
// User transaction history (paginated, newest first)
rewardTransactionSchema.index({ userId: 1, createdAt: -1 });
// Transaction type filtering
rewardTransactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
// Reference lookup: find all transactions for a task/challenge
rewardTransactionSchema.index({ referenceId: 1, referenceType: 1 });
// Audit: status-based queries
rewardTransactionSchema.index({ status: 1, createdAt: -1 });
// Abuse detection: rapid transactions by user
rewardTransactionSchema.index({ userId: 1, type: 1, createdAt: 1 });

module.exports = mongoose.model('RewardTransaction', rewardTransactionSchema);
