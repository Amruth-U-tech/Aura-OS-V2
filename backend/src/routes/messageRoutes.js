const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const messageDomainService = require('../services/domains/messageDomainService');

// ======================================================
// MESSAGE ROUTES — Phase D3.3.1
// Owns: HTTP message CRUD for hub chat
// Socket transport handles realtime delivery (not here)
// ======================================================

// ── POST /api/v1/hubs/:id/messages ───────────────────
// Send a message to a hub
router.post('/:id/messages', protect, asyncHandler(async (req, res) => {
  const { content, tempId, contentType } = req.body;
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return sendError(res, 'Message content required', 400);
  }
  if (content.length > 4000) {
    return sendError(res, 'Message too long (max 4000 chars)', 400);
  }

  const result = await messageDomainService.sendMessage(
    req.params.id,
    req.player?.auraPlayerId ? req.user.id : req.user.id,
    req.player?.playerName || req.user?.username || 'Player',
    content.trim(),
    {
      tempId,
      contentType,
      senderAvatar: req.player?.avatarUrl || null,
    }
  );

  if (!result.success) {
    return sendError(res, result.reason, result.reason === 'NOT_A_MEMBER' ? 403 : 500);
  }

  sendSuccess(res, {
    message: result.message,
    tempId: result.tempId,
  }, 'Message sent', 201);
}));

// ── GET /api/v1/hubs/:id/messages ────────────────────
// Get message history
router.get('/:id/messages', protect, asyncHandler(async (req, res) => {
  const { limit, before, after } = req.query;
  const messages = await messageDomainService.getHistory(req.params.id, {
    limit: parseInt(limit) || 50,
    before,
    after,
  });
  sendSuccess(res, { messages });
}));

// ── GET /api/v1/hubs/:id/messages/replay ─────────────
// Replay after sequence (for reconnect recovery)
router.get('/:id/messages/replay', protect, asyncHandler(async (req, res) => {
  const { afterSequence } = req.query;
  const messages = await messageDomainService.replayAfterSequence(
    req.params.id,
    parseInt(afterSequence) || 0
  );
  sendSuccess(res, { messages });
}));

// ── PUT /api/v1/hubs/:id/messages/:messageId ─────────
// Edit a message
router.put('/:id/messages/:messageId', protect, asyncHandler(async (req, res) => {
  const { content } = req.body;
  if (!content) return sendError(res, 'Content required', 400);

  const result = await messageDomainService.editMessage(
    req.params.messageId,
    req.user.id,
    content
  );

  if (!result.success) return sendError(res, result.reason, 403);
  sendSuccess(res, result.message);
}));

// ── DELETE /api/v1/hubs/:id/messages/:messageId ──────
// Delete a message
router.delete('/:id/messages/:messageId', protect, asyncHandler(async (req, res) => {
  const result = await messageDomainService.deleteMessage(
    req.params.messageId,
    req.user.id
  );

  if (!result.success) return sendError(res, result.reason, 403);
  sendSuccess(res, null, 'Message deleted');
}));

module.exports = router;
