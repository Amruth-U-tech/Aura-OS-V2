const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const notificationService = require('../services/domains/notificationDomainService');

// ======================================================
// NOTIFICATION ROUTES — Phase N1
// Protected REST API for notification management
// All endpoints require JWT authentication (protect middleware)
//
// GET    /                    → paginated list
// GET    /unread-count        → unread counter
// PATCH  /:id/read            → mark single as read
// POST   /read-all            → mark all as read
// PATCH  /:id/acknowledge     → acknowledge (dismiss)
// DELETE /:id                 → delete notification
//
// Must NOT: create notifications (that's the listener's job)
// ======================================================

// ── GET /api/v1/notifications ────────────────────────
// Query params: page, limit, category, unreadOnly, unacknowledgedOnly
router.get('/', protect, asyncHandler(async (req, res) => {
  const { page, limit, category, unreadOnly, unacknowledgedOnly } = req.query;

  const result = await notificationService.getNotifications(req.user.id, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 30,
    category: category || null,
    unreadOnly: unreadOnly === 'true',
    unacknowledgedOnly: unacknowledgedOnly === 'true'
  });

  sendSuccess(res, result);
}));

// ── GET /api/v1/notifications/unread-count ───────────
router.get('/unread-count', protect, asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user.id);
  sendSuccess(res, { count });
}));

// ── PATCH /api/v1/notifications/:id/read ─────────────
router.patch('/:id/read', protect, asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.params.id, req.user.id);
  if (!notification) return sendError(res, 'Notification not found', 404);

  // Phase N1.1: Broadcast for cross-tab sync
  const socketEmitter = require('../realtime/socketEmitter');
  const PlayerProfile = require('../models/PlayerProfile');
  const profile = await PlayerProfile.findOne({ userId: req.user.id }).select('auraPlayerId').lean();
  if (profile?.auraPlayerId) {
    socketEmitter.emitToPlayer(profile.auraPlayerId, 'notification.read', {
      notificationId: req.params.id,
      timestamp: Date.now()
    });
  }

  sendSuccess(res, notification, 'Marked as read');
}));

// ── POST /api/v1/notifications/read-all ──────────────
router.post('/read-all', protect, asyncHandler(async (req, res) => {
  const result = await notificationService.markAllRead(req.user.id);

  // Phase N1.1: Broadcast for cross-tab sync
  const socketEmitter = require('../realtime/socketEmitter');
  const PlayerProfile = require('../models/PlayerProfile');
  const profile = await PlayerProfile.findOne({ userId: req.user.id }).select('auraPlayerId').lean();
  if (profile?.auraPlayerId) {
    socketEmitter.emitToPlayer(profile.auraPlayerId, 'notification.read-all', {
      timestamp: Date.now()
    });
  }

  sendSuccess(res, result, `${result.modifiedCount} notifications marked as read`);
}));

// ── PATCH /api/v1/notifications/:id/acknowledge ──────
router.patch('/:id/acknowledge', protect, asyncHandler(async (req, res) => {
  const notification = await notificationService.acknowledge(req.params.id, req.user.id);
  if (!notification) return sendError(res, 'Notification not found', 404);

  // Phase N1.1: Broadcast for cross-tab sync
  const socketEmitter = require('../realtime/socketEmitter');
  const PlayerProfile = require('../models/PlayerProfile');
  const profile = await PlayerProfile.findOne({ userId: req.user.id }).select('auraPlayerId').lean();
  if (profile?.auraPlayerId) {
    socketEmitter.emitToPlayer(profile.auraPlayerId, 'notification.acknowledged', {
      notificationId: req.params.id,
      timestamp: Date.now()
    });
  }

  sendSuccess(res, notification, 'Acknowledged');
}));

// ── DELETE /api/v1/notifications/:id ─────────────────
router.delete('/:id', protect, asyncHandler(async (req, res) => {
  const deleted = await notificationService.deleteNotification(req.params.id, req.user.id);
  if (!deleted) return sendError(res, 'Notification not found', 404);
  sendSuccess(res, { deleted: true }, 'Notification deleted');
}));

module.exports = router;
