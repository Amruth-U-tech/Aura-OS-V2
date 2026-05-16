const mongoose = require('mongoose');
const { VOUCHER_STATUS } = require('../constants/domainConstants');

// ======================================================
// VOUCHER — DOMAIN 14
// Owns: weekly rotating voucher rewards
// Players unlock vouchers based on weekly XP thresholds
// Claimed vouchers persist — new pools replace weekly rotation
// Must NOT: contain XP calculation or progression logic
// ======================================================

const voucherSchema = new mongoose.Schema(
  {
    // ── Voucher Identity ──────────────────────────────
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300,
      default: ''
    },
    icon: { type: String, default: '🎫' },

    // ── Threshold ────────────────────────────────────
    // Weekly XP required to unlock this voucher
    xpThreshold: { type: Number, required: true, min: 0 },

    // ── Reward Details ───────────────────────────────
    rewardType: {
      type: String,
      enum: ['XP_BOOST', 'TRUST_BOOST', 'COSMETIC', 'BADGE', 'DISCOUNT'],
      default: 'XP_BOOST'
    },
    rewardValue: { type: Number, default: 0 },
    rewardMeta: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ── Weekly Pool Identity ─────────────────────────
    // All vouchers in the same pool share this identifier
    weekPoolId: {
      type: String,
      required: true,
      index: true
    },
    weekStartDate: { type: Date, required: true },
    weekEndDate: { type: Date, required: true },

    // ── Status ───────────────────────────────────────
    isActive: { type: Boolean, default: true },

    // ── Extensible Metadata ──────────────────────────
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true
  }
);

// ── Indexes ──────────────────────────────────────────
voucherSchema.index({ weekPoolId: 1, xpThreshold: 1 });
voucherSchema.index({ isActive: 1, weekStartDate: -1 });

const Voucher = mongoose.model('Voucher', voucherSchema);

// ======================================================
// PLAYER VOUCHER CLAIM — tracks which vouchers each player has claimed
// ======================================================

const playerVoucherSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    voucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Voucher',
      required: true
    },
    weekPoolId: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: Object.values(VOUCHER_STATUS),
      default: VOUCHER_STATUS.CLAIMED
    },
    claimedAt: { type: Date, default: Date.now },
    redeemedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null }
  },
  {
    timestamps: true
  }
);

// One claim per user per voucher
playerVoucherSchema.index({ userId: 1, voucherId: 1 }, { unique: true });
playerVoucherSchema.index({ userId: 1, weekPoolId: 1 });

const PlayerVoucher = mongoose.model('PlayerVoucher', playerVoucherSchema);

module.exports = Voucher;
module.exports.PlayerVoucher = PlayerVoucher;
