const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const hubService = require('../services/domains/hubDomainService');
const playerProfileService = require('../services/domains/playerProfileDomainService');
const historyService = require('../services/historyService');
const { BEHAVIORAL_EVENT_TYPES } = require('../constants/historyConstants');

// ======================================================
// HUB ROUTES — Phase 2.4
// Owns: Hub CRUD, membership, events
// All routes protected by JWT
// ======================================================

// ── POST /api/v1/hubs ────────────────────────────────
router.post('/', protect, asyncHandler(async (req, res) => {
  const { name, description, visibility, maxMembers } = req.body;
  if (!name) return sendError(res, 'Hub name required', 400);

  const hub = await hubService.createHub(req.user.id, { name, description, visibility, maxMembers });

  await playerProfileService.incrementCounter(req.user.id, 'hubCount', 1);
  await historyService.recordEvent(req.user.id, BEHAVIORAL_EVENT_TYPES.HUB_CREATED, {
    hubId: hub._id.toString(), auraHubId: hub.auraHubId, name: hub.name
  });

  sendSuccess(res, hubService.sanitizeHub(hub), 'Hub created', 201);
}));

// ── GET /api/v1/hubs/my ──────────────────────────────
router.get('/my', protect, asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await hubService.getUserHubs(req.user.id, {
    page: parseInt(page) || 1, limit: parseInt(limit) || 20
  });
  sendSuccess(res, result);
}));

// ── GET /api/v1/hubs/:id ─────────────────────────────
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const hub = await hubService.getHubById(req.params.id);
  if (!hub) return sendError(res, 'Hub not found', 404);
  sendSuccess(res, hubService.sanitizeHub(hub));
}));

// ── POST /api/v1/hubs/:id/join ───────────────────────
router.post('/:id/join', protect, asyncHandler(async (req, res) => {
  const result = await hubService.joinHub(req.params.id, req.user.id);

  // Only increment hubCount for instant joins (not pending)
  if (result.status === 'ACTIVE') {
    await playerProfileService.incrementCounter(req.user.id, 'hubCount', 1);
  }

  await historyService.recordEvent(req.user.id, BEHAVIORAL_EVENT_TYPES.HUB_JOINED, {
    hubId: req.params.id, status: result.status
  });

  sendSuccess(res, {
    status: result.status,
    message: result.message
  }, result.message);
}));

// ── POST /api/v1/hubs/:id/approve/:userId ────────────
// Owner approves a pending membership
router.post('/:id/approve/:userId', protect, asyncHandler(async (req, res) => {
  await hubService.approveMembership(req.params.id, req.params.userId, req.user.id);
  await playerProfileService.incrementCounter(req.params.userId, 'hubCount', 1);
  sendSuccess(res, null, 'Membership approved');
}));

// ── POST /api/v1/hubs/:id/reject/:userId ─────────────
// Owner rejects a pending membership
router.post('/:id/reject/:userId', protect, asyncHandler(async (req, res) => {
  await hubService.rejectMembership(req.params.id, req.params.userId, req.user.id);
  sendSuccess(res, null, 'Membership rejected');
}));

// ── GET /api/v1/hubs/:id/pending ─────────────────────
// Get pending membership requests (owner only)
router.get('/:id/pending', protect, asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await hubService.getPendingMemberships(req.params.id, {
    page: parseInt(page) || 1, limit: parseInt(limit) || 20
  });
  sendSuccess(res, result);
}));

// ── POST /api/v1/hubs/:id/leave ──────────────────────
router.post('/:id/leave', protect, asyncHandler(async (req, res) => {
  await hubService.leaveHub(req.params.id, req.user.id);
  await playerProfileService.incrementCounter(req.user.id, 'hubCount', -1);
  await historyService.recordEvent(req.user.id, BEHAVIORAL_EVENT_TYPES.HUB_LEFT, {
    hubId: req.params.id
  });
  sendSuccess(res, null, 'Left hub');
}));

// ── GET /api/v1/hubs/:id/members ─────────────────────
router.get('/:id/members', protect, asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await hubService.getHubMembers(req.params.id, {
    page: parseInt(page) || 1, limit: parseInt(limit) || 20
  });
  sendSuccess(res, result);
}));

// ── GET /api/v1/hubs/:id/events ──────────────────────
router.get('/:id/events', protect, asyncHandler(async (req, res) => {
  const { page, limit } = req.query;
  const result = await hubService.getHubEvents(req.params.id, {
    page: parseInt(page) || 1, limit: parseInt(limit) || 20
  });
  sendSuccess(res, result);
}));

// ── GET /api/v1/hubs/invite/:code ────────────────────
router.get('/invite/:code', protect, asyncHandler(async (req, res) => {
  const hub = await hubService.getHubByInviteCode(req.params.code);
  if (!hub) return sendError(res, 'Invalid or expired invite code', 404);
  sendSuccess(res, hubService.sanitizeHub(hub));
}));

module.exports = router;
