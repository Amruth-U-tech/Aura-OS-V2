const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const discovery = require('../services/domains/globalDiscoveryService');
const { detectType } = require('../services/identityGenerator');

// ======================================================
// DISCOVERY ROUTES — Phase 2.4.1
// GLOBAL scope: queries entire database
// Separated from ownership-bound (local) routes
// All routes protected by JWT (visibility, not ownership)
// ======================================================

// ── GET /api/v1/discover/players ─────────────────────
// Random discoverable players (excludes self + friends)
router.get('/players', protect, asyncHandler(async (req, res) => {
  const { limit } = req.query;
  const players = await discovery.discoverRandomPlayers(
    req.user.id,
    parseInt(limit) || 15
  );
  sendSuccess(res, players);
}));

// ── GET /api/v1/discover/players/search?q=... ────────
// Search by AURA-PLR-ID or display name (GLOBAL)
router.get('/players/search', protect, asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return sendError(res, 'Search query too short (min 2 chars)', 400);

  // Detect if query is an Aura ID
  const idType = detectType(q);
  if (idType === 'PLAYER') {
    const player = await discovery.searchPlayerByAuraId(q);
    return sendSuccess(res, player ? [player] : []);
  }

  // Otherwise search by display name
  const players = await discovery.searchPlayersByName(q, req.user.id);
  sendSuccess(res, players);
}));

// ── GET /api/v1/discover/hubs ────────────────────────
// Random discoverable hubs (excludes joined + private)
router.get('/hubs', protect, asyncHandler(async (req, res) => {
  const { limit } = req.query;
  const hubs = await discovery.discoverRandomHubs(
    req.user.id,
    parseInt(limit) || 15
  );
  sendSuccess(res, hubs);
}));

// ── GET /api/v1/discover/hubs/search?q=... ───────────
// Search by AURA-HUB-ID or hub name (GLOBAL)
router.get('/hubs/search', protect, asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return sendError(res, 'Search query too short (min 2 chars)', 400);

  const idType = detectType(q);
  if (idType === 'HUB') {
    const hub = await discovery.searchHubByAuraId(q);
    return sendSuccess(res, hub ? [hub] : []);
  }

  const hubs = await discovery.searchHubsByName(q);
  sendSuccess(res, hubs);
}));

module.exports = router;
