const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const socialService = require('../services/domains/socialDomainService');
const historyService = require('../services/historyService');
const { BEHAVIORAL_EVENT_TYPES } = require('../constants/historyConstants');
const playerProfileService = require('../services/domains/playerProfileDomainService');
const PlayerProfile = require('../models/PlayerProfile');
const { detectType } = require('../services/identityGenerator');

// ======================================================
// SOCIAL ROUTES — Phase 2.4.1
// Owns: Friend requests, friendships
// Supports: auraPlayerId-based friend requests (GLOBAL)
// All routes protected by JWT
// ======================================================

// ── POST /api/v1/social/friends/request ──────────────
// Accepts either { receiverId } (Mongo ID) or { auraPlayerId } (public ID)
router.post('/friends/request', protect, asyncHandler(async (req, res) => {
  let { receiverId, auraPlayerId, message } = req.body;

  // Resolve auraPlayerId → Mongo userId if provided
  if (!receiverId && auraPlayerId) {
    if (!detectType(auraPlayerId)) return sendError(res, 'Invalid player ID format', 400);
    const profile = await PlayerProfile.findOne({ auraPlayerId });
    if (!profile) return sendError(res, 'Player not found', 404);
    receiverId = profile.userId;
  }
  if (!receiverId) return sendError(res, 'Receiver ID or Aura Player ID required', 400);

  const request = await socialService.sendFriendRequest(req.user.id, receiverId, message);

  await historyService.recordEvent(req.user.id, BEHAVIORAL_EVENT_TYPES.FRIEND_REQUEST_SENT, {
    receiverId: receiverId.toString(), message
  });

  sendSuccess(res, socialService.sanitizeRequest(request), 'Friend request sent', 201);
}));

// ── POST /api/v1/social/friends/accept/:id ───────────
router.post('/friends/accept/:id', protect, asyncHandler(async (req, res) => {
  const request = await socialService.acceptFriendRequest(req.params.id, req.user.id);

  // Increment friend count for both users (atomic)
  await playerProfileService.incrementCounter(request.senderId, 'friendCount', 1);
  await playerProfileService.incrementCounter(request.receiverId, 'friendCount', 1);

  await historyService.recordEvent(req.user.id, BEHAVIORAL_EVENT_TYPES.FRIEND_REQUEST_ACCEPTED, {
    senderId: request.senderId.toString()
  });

  sendSuccess(res, socialService.sanitizeRequest(request), 'Friend request accepted');
}));

// ── POST /api/v1/social/friends/decline/:id ──────────
router.post('/friends/decline/:id', protect, asyncHandler(async (req, res) => {
  const request = await socialService.declineFriendRequest(req.params.id, req.user.id);

  await historyService.recordEvent(req.user.id, BEHAVIORAL_EVENT_TYPES.FRIEND_REQUEST_DECLINED, {
    senderId: request.senderId.toString()
  });

  sendSuccess(res, socialService.sanitizeRequest(request), 'Friend request declined');
}));

// ── DELETE /api/v1/social/friends/:userId ─────────────
router.delete('/friends/:userId', protect, asyncHandler(async (req, res) => {
  await socialService.removeFriendship(req.user.id, req.params.userId);

  await playerProfileService.incrementCounter(req.user.id, 'friendCount', -1);
  await playerProfileService.incrementCounter(req.params.userId, 'friendCount', -1);

  await historyService.recordEvent(req.user.id, BEHAVIORAL_EVENT_TYPES.FRIENDSHIP_ENDED, {
    friendId: req.params.userId
  });

  sendSuccess(res, null, 'Friendship removed');
}));

// ── GET /api/v1/social/friends ───────────────────────
// Returns enriched friend profiles with auraPlayerIds
router.get('/friends', protect, asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await socialService.getFriendsList(req.user.id, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20
  });

  // Enrich with full profile data (including auraPlayerId)
  const profiles = await Promise.all(
    result.friendIds.map(async (fid) => {
      const p = await PlayerProfile.findOne({ userId: fid }).lean();
      return p ? playerProfileService.sanitizeProfile(p) : { userId: fid.toString() };
    })
  );

  sendSuccess(res, { friends: profiles, pagination: result.pagination });
}));

// ── GET /api/v1/social/friends/requests ──────────────
// Enriches requests with sender profile
router.get('/friends/requests', protect, asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await socialService.getPendingRequests(req.user.id, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20
  });

  // Enrich with sender profiles
  const enrichedRequests = await Promise.all(
    result.requests.map(async (r) => {
      const senderProfile = await PlayerProfile.findOne({ userId: r.senderId }).lean();
      return {
        ...r,
        senderName: senderProfile?.displayName || 'Unknown',
        senderAuraId: senderProfile?.auraPlayerId || null,
        senderLevel: senderProfile?.level || 1
      };
    })
  );

  sendSuccess(res, { requests: enrichedRequests, pagination: result.pagination });
}));

// ── Phase 2.4.4: GET /api/v1/social/friends/requests/sent ──
// Returns outgoing requests with receiver profiles + read state
router.get('/friends/requests/sent', protect, asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await socialService.getOutgoingRequests(req.user.id, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20
  });

  // Enrich with receiver profiles
  const enrichedRequests = await Promise.all(
    result.requests.map(async (r) => {
      const receiverProfile = await PlayerProfile.findOne({ userId: r.receiverId }).lean();
      return {
        ...r,
        receiverName: receiverProfile?.displayName || 'Unknown',
        receiverAuraId: receiverProfile?.auraPlayerId || null,
        receiverAvatar: receiverProfile?.avatar || null,
        receiverLevel: receiverProfile?.level || 1
      };
    })
  );

  sendSuccess(res, { requests: enrichedRequests, pagination: result.pagination });
}));

// ── Phase 2.4.4: POST /api/v1/social/friends/requests/:id/read ──
// One-time read acknowledgment for accepted requests
router.post('/friends/requests/:id/read', protect, asyncHandler(async (req, res) => {
  await socialService.markRequestRead(req.params.id, req.user.id);
  sendSuccess(res, null, 'Request marked as read');
}));

module.exports = router;
