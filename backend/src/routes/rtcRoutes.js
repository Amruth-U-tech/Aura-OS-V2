const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { rtcAuthorization } = require('../rtc');
const { presenceService } = require('../presence');

// ======================================================
// RTC ROUTES — Phase D3.3.5
// Owns: LiveKit token issuance endpoint
// ======================================================

// ── POST /api/v1/hubs/:id/voice-token ────────────────
router.post('/:id/voice-token', protect, asyncHandler(async (req, res) => {
  const hubId = req.params.id;
  const userId = req.user.id;
  const auraPlayerId = req.player?.auraPlayerId || userId;
  const displayName = req.player?.playerName || req.user?.username || 'Player';

  const result = await rtcAuthorization.authorizeAndMint(
    userId, auraPlayerId, hubId, displayName
  );

  if (!result.authorized) {
    return sendError(res, result.reason, 403);
  }

  sendSuccess(res, {
    token: result.token,
    serverUrl: result.serverUrl,
  }, 'Voice token issued');
}));

// ── GET /api/v1/hubs/:id/presence ────────────────────
router.get('/:id/presence', protect, asyncHandler(async (req, res) => {
  const presence = await presenceService.getHubPresence(req.params.id);
  sendSuccess(res, { members: presence });
}));

// ── GET /api/v1/hubs/:id/voice-state ─────────────────
router.get('/:id/voice-state', protect, asyncHandler(async (req, res) => {
  const snapshot = await presenceService.getVoiceSnapshot(req.params.id);
  sendSuccess(res, snapshot || { activeParticipants: [], participantCount: 0 });
}));

module.exports = router;
