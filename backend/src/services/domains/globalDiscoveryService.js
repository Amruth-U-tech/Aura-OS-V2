const PlayerProfile = require('../../models/PlayerProfile');
const Hub = require('../../models/Hub');
const Friendship = require('../../models/Friendship');
const { isValid } = require('../identityGenerator');
const playerProfileService = require('./playerProfileDomainService');
const hubService = require('./hubDomainService');

// ======================================================
// GLOBAL DISCOVERY SERVICE — Phase 2.4.1
// Owns: ALL global-scope queries across the database
// These are NOT ownership-bound — they search ENTIRE collections
//
// GLOBAL:  player search, hub discovery, leaderboards
// LOCAL:   personal tasks, submissions, history (NOT here)
//
// Must NOT: contain ownership-bound logic
// Must NOT: expose private progression internals
// ======================================================

const DEFAULT_DISCOVERY_LIMIT = 15;
const MAX_DISCOVERY_LIMIT = 20;

// ── Search Players by AURA-PLR-ID ────────────────────
// Queries ENTIRE PlayerProfile collection (GLOBAL)
const searchPlayerByAuraId = async (auraPlayerId) => {
  if (!isValid(auraPlayerId, 'PLAYER')) return null;
  const profile = await PlayerProfile.findOne({ auraPlayerId }).lean();
  if (!profile) return null;
  const sanitized = playerProfileService.sanitizeProfile(profile);
  delete sanitized.userId;
  return sanitized;
};

// ── Search Players by display name (GLOBAL) ──────────
const searchPlayersByName = async (query, excludeUserId = null, limit = DEFAULT_DISCOVERY_LIMIT) => {
  if (!query || query.length < 2) return [];

  const safeLimit = Math.min(limit, MAX_DISCOVERY_LIMIT);
  const filter = { $text: { $search: query } };
  if (excludeUserId) filter.userId = { $ne: excludeUserId };

  const profiles = await PlayerProfile.find(filter)
    .sort({ score: { $meta: 'textScore' } })
    .limit(safeLimit)
    .lean();

  return profiles.map(p => {
    const sanitized = playerProfileService.sanitizeProfile(p);
    delete sanitized.userId;
    return sanitized;
  });
};

// ── Random Discoverable Players (GLOBAL) ─────────────
// Returns random players from ENTIRE database, excluding:
//  - current player
//  - existing friends
// Like Clash of Clans / Discord discovery
const discoverRandomPlayers = async (userId, limit = DEFAULT_DISCOVERY_LIMIT) => {
  const safeLimit = Math.min(limit, MAX_DISCOVERY_LIMIT);

  // Get existing friend IDs to exclude
  const friendIds = await _getFriendIds(userId);
  const excludeIds = [userId, ...friendIds];

  const profiles = await PlayerProfile.aggregate([
    { $match: { userId: { $nin: excludeIds.map(id => require('mongoose').Types.ObjectId.createFromHexString(id.toString())) } } },
    { $sample: { size: safeLimit } }
  ]);

  // Use the standard sanitizer to ensure consistent payload structure
  // We remove userId explicitly here to prevent exposing internal Mongo IDs
  // as per Phase 3.0.1 hardening requirements.
  return profiles.map(p => {
    const sanitized = playerProfileService.sanitizeProfile(p);
    delete sanitized.userId;
    return sanitized;
  });
};

// ── Search Hubs by AURA-HUB-ID (GLOBAL) ─────────────
const searchHubByAuraId = async (auraHubId) => {
  if (!isValid(auraHubId, 'HUB')) return null;
  const hub = await Hub.findOne({ auraHubId, status: 'ACTIVE' }).lean();
  return hub ? hubService.sanitizeHub(hub) : null;
};

// ── Search Hubs by name (GLOBAL) ─────────────────────
const searchHubsByName = async (query, limit = DEFAULT_DISCOVERY_LIMIT) => {
  if (!query || query.length < 2) return [];

  const safeLimit = Math.min(limit, MAX_DISCOVERY_LIMIT);
  const hubs = await Hub.find({
    $text: { $search: query },
    status: 'ACTIVE',
    visibility: { $ne: 'PRIVATE' }
  })
    .sort({ score: { $meta: 'textScore' } })
    .limit(safeLimit)
    .lean();

  // Phase 2.4.4: Enrich with owner display names
  const ownerIds = [...new Set(hubs.map(h => h.ownerUserId?.toString()).filter(Boolean))];
  const ownerProfiles = await PlayerProfile.find({ userId: { $in: ownerIds } }).select('userId displayName').lean();
  const ownerMap = {};
  ownerProfiles.forEach(p => { ownerMap[p.userId.toString()] = p.displayName; });

  return hubs.map(h => ({
    ...hubService.sanitizeHub(h),
    ownerDisplayName: ownerMap[h.ownerUserId?.toString()] || 'Unknown'
  }));
};

// ── Random Discoverable Hubs (GLOBAL) ────────────────
// Returns random PUBLIC/INVITE_ONLY hubs from ENTIRE database
// Private hubs are NEVER discoverable
const discoverRandomHubs = async (userId, limit = DEFAULT_DISCOVERY_LIMIT) => {
  const safeLimit = Math.min(limit, MAX_DISCOVERY_LIMIT);

  // Get hubs user is already in
  const HubMembership = require('../../models/HubMembership');
  const existingMemberships = await HubMembership.find({
    userId,
    status: 'ACTIVE'
  }).select('hubId').lean();
  const memberHubIds = existingMemberships.map(m => m.hubId);

  const hubs = await Hub.aggregate([
    {
      $match: {
        status: 'ACTIVE',
        visibility: { $ne: 'PRIVATE' },
        _id: { $nin: memberHubIds }
      }
    },
    { $sample: { size: safeLimit } },
    {
      $project: {
        auraHubId: 1,
        name: 1,
        description: 1,
        visibility: 1,
        memberCount: 1,
        maxMembers: 1,
        ownerUserId: 1,
        createdAt: 1,
        _id: 1
      }
    }
  ]);

  // Enrich with owner display names
  const ownerIds = [...new Set(hubs.map(h => h.ownerUserId))];
  const ownerProfiles = await PlayerProfile.find(
    { userId: { $in: ownerIds } }
  ).select('userId displayName').lean();
  const ownerMap = {};
  ownerProfiles.forEach(p => { ownerMap[p.userId.toString()] = p.displayName; });

  return hubs.map(h => ({
    id: h._id?.toString(),
    auraHubId: h.auraHubId,
    name: h.name,
    description: h.description,
    visibility: h.visibility,
    memberCount: h.memberCount,
    maxMembers: h.maxMembers,
    ownerDisplayName: ownerMap[h.ownerUserId?.toString()] || 'Unknown',
    ownerName: ownerMap[h.ownerUserId?.toString()] || 'Unknown', // backward compat
    createdAt: h.createdAt
  }));
};

// ── Internal: get friend ObjectIds ───────────────────
const _getFriendIds = async (userId) => {
  const friendships = await Friendship.find({
    $or: [{ userA: userId }, { userB: userId }],
    isActive: true
  }).lean();

  return friendships.map(f =>
    f.userA.toString() === userId.toString() ? f.userB : f.userA
  );
};

module.exports = {
  searchPlayerByAuraId,
  searchPlayersByName,
  discoverRandomPlayers,
  searchHubByAuraId,
  searchHubsByName,
  discoverRandomHubs
};
