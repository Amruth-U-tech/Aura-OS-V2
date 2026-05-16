const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const voucherService = require('../services/domains/voucherDomainService');

// ======================================================
// VOUCHER ROUTES — Phase 2.4.2
// Owns: Weekly voucher pool display, claim, history
// ======================================================

// ── GET /api/v1/vouchers/current ─────────────────────
// Get current week's voucher pool with unlock status
router.get('/current', protect, asyncHandler(async (req, res) => {
  // Ensure current week's pool exists
  await voucherService.generateWeeklyPool();

  const result = await voucherService.getCurrentVouchers(req.user.id);
  sendSuccess(res, result);
}));

// ── POST /api/v1/vouchers/:id/claim ──────────────────
// Claim an unlocked voucher
router.post('/:id/claim', protect, asyncHandler(async (req, res) => {
  const result = await voucherService.claimVoucher(req.user.id, req.params.id);
  sendSuccess(res, result, 'Voucher claimed!', 201);
}));

// ── GET /api/v1/vouchers/history ─────────────────────
// Get all claimed vouchers
router.get('/history', protect, asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await voucherService.getClaimedVouchers(req.user.id, {
    page: parseInt(page) || 1, limit: parseInt(limit) || 20
  });
  sendSuccess(res, result);
}));

module.exports = router;
