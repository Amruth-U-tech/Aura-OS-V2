const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const playerProfileService = require('../services/domains/playerProfileDomainService');
const trustService = require('../services/domains/trustDomainService');
const rewardService = require('../services/domains/rewardTransactionDomainService');
const { getLevelProgress } = require('../services/orchestration/xpPipeline');
const User = require('../models/User');

// ======================================================
// PLAYER ROUTES — Phase 2.4.2
// Owns: profile (public/private), skills, certificates,
//       leaderboard (permanent/weekly), endorsements
// ======================================================

// ── GET /api/v1/player/me ────────────────────────────
// Returns PRIVATE profile (full data, only for owner)
router.get('/me', protect, asyncHandler(async (req, res) => {
  const profile = await playerProfileService.getOrCreate(req.user.id);
  const trust = await trustService.getTrustSnapshot(req.user.id);
  const user = await User.findById(req.user.id).select('email playerName');
  const levelProgress = getLevelProgress(profile.totalXpEarned || 0);

  sendSuccess(res, {
    profile: playerProfileService.sanitizePrivateProfile(profile, user),
    trust,
    levelProgress
  });
}));

// ── GET /api/v1/player/profile/:auraPlayerId ─────────
// PUBLIC profile — visible to other players
router.get('/profile/:auraPlayerId', protect, asyncHandler(async (req, res) => {
  const profile = await playerProfileService.getByAuraPlayerId(req.params.auraPlayerId);
  if (!profile) return sendError(res, 'Player not found', 404);

  // Check if this is the owner viewing their own profile
  const isOwner = profile.userId.toString() === req.user.id;

  if (isOwner) {
    const user = await User.findById(req.user.id).select('email playerName');
    const trust = await trustService.getTrustSnapshot(req.user.id);
    const levelProgress = getLevelProgress(profile.totalXpEarned || 0);
    return sendSuccess(res, {
      profile: playerProfileService.sanitizePrivateProfile(profile, user),
      trust,
      levelProgress,
      isOwner: true
    });
  }

  // Public view — sanitized
  const trust = await trustService.getTrustSnapshot(profile.userId);
  const publicProfile = playerProfileService.sanitizePublicProfile(profile);

  // Phase 2.4.4: Enrich skills with endorsedByCurrentUser flag
  if (publicProfile.skills && publicProfile.skills.length > 0) {
    const rawSkills = profile.skills || [];
    publicProfile.skills = publicProfile.skills.map((s, i) => ({
      ...s,
      endorsedByCurrentUser: rawSkills[i]?.endorsements?.some(
        e => e.userId.toString() === req.user.id
      ) || false
    }));
  }

  sendSuccess(res, {
    profile: publicProfile,
    trust,
    isOwner: false
  });
}));

// ── PUT /api/v1/player/profile ───────────────────────
// Update own profile (avatar, bio, visibility, sound)
router.put('/profile', protect, asyncHandler(async (req, res) => {
  const { displayName, avatar, bio, country, timezone, region, locale,
          profileVisibility, soundEnabled, notificationsEnabled } = req.body;

  const updated = await playerProfileService.updateProfile(req.user.id, {
    displayName, avatar, bio, country, timezone, region, locale,
    profileVisibility, soundEnabled, notificationsEnabled
  });

  if (!updated) return sendError(res, 'Profile not found', 404);

  // Phase 2.4.3: Fetch user to inject email into private profile response
  const user = await User.findById(req.user.id).select('email playerName');
  sendSuccess(res, playerProfileService.sanitizePrivateProfile(updated, user), 'Profile updated');
}));

// ── POST /api/v1/player/skills ───────────────────────
// Add a skill to profile
router.post('/skills', protect, asyncHandler(async (req, res) => {
  const { name, category, certificateUrl } = req.body;
  if (!name || name.trim().length < 1) return sendError(res, 'Skill name required', 400);
  if (name.trim().length > 50) return sendError(res, 'Skill name too long', 400);

  const profile = await playerProfileService.addSkill(req.user.id, {
    name: name.trim(),
    category: category?.trim() || 'General',
    certificateUrl: certificateUrl || null
  });

  // Phase 2.4.3: Include user for email in private profile
  const user = await User.findById(req.user.id).select('email playerName');
  sendSuccess(res, playerProfileService.sanitizePrivateProfile(profile, user), 'Skill added', 201);
}));

// ── DELETE /api/v1/player/skills/:index ──────────────
// Remove a skill by index
router.delete('/skills/:index', protect, asyncHandler(async (req, res) => {
  const index = parseInt(req.params.index);
  if (isNaN(index) || index < 0) return sendError(res, 'Invalid skill index', 400);

  const profile = await playerProfileService.removeSkill(req.user.id, index);
  // Phase 2.4.3: Include user for email in private profile
  const user = await User.findById(req.user.id).select('email playerName');
  sendSuccess(res, playerProfileService.sanitizePrivateProfile(profile, user), 'Skill removed');
}));

// ── POST /api/v1/player/skills/:index/endorse ────────
// Endorse another player's skill
router.post('/skills/:index/endorse', protect, asyncHandler(async (req, res) => {
  const { targetUserId } = req.body;
  if (!targetUserId) return sendError(res, 'Target user ID required', 400);

  const index = parseInt(req.params.index);
  if (isNaN(index) || index < 0) return sendError(res, 'Invalid skill index', 400);

  const profile = await playerProfileService.endorseSkill(targetUserId, index, req.user.id);
  sendSuccess(res, playerProfileService.sanitizePublicProfile(profile), 'Skill endorsed');
}));

// ── PUT /api/v1/player/skills/:index/certificate ─────
// Upload certificate URL for a skill
router.put('/skills/:index/certificate', protect, asyncHandler(async (req, res) => {
  const { certificateUrl } = req.body;
  if (!certificateUrl) return sendError(res, 'Certificate URL required', 400);

  const index = parseInt(req.params.index);
  if (isNaN(index) || index < 0) return sendError(res, 'Invalid skill index', 400);

  // Basic URL validation
  try { new URL(certificateUrl); } catch { return sendError(res, 'Invalid URL', 400); }

  const profile = await playerProfileService.updateSkillCertificate(req.user.id, index, certificateUrl);
  // Phase 2.4.3: Include user for email in private profile
  const user = await User.findById(req.user.id).select('email playerName');
  sendSuccess(res, playerProfileService.sanitizePrivateProfile(profile, user), 'Certificate uploaded');
}));

// ── GET /api/v1/player/leaderboard ───────────────────
router.get('/leaderboard', protect, asyncHandler(async (req, res) => {
  const { page, limit, sortBy, country, weekly } = req.query;
  const result = await playerProfileService.getLeaderboard({
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    sortBy: sortBy || 'xp',
    country: country || null,
    weekly: weekly === 'true'
  });
  sendSuccess(res, result);
}));

// ── GET /api/v1/player/transactions ──────────────────
router.get('/transactions', protect, asyncHandler(async (req, res) => {
  const { page, limit, type } = req.query;
  const result = await rewardService.getUserTransactions(req.user.id, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    type: type || null
  });
  sendSuccess(res, result);
}));

// ── GET /api/v1/player/summary ───────────────────────
router.get('/summary', protect, asyncHandler(async (req, res) => {
  const summary = await rewardService.getUserSummary(req.user.id);
  sendSuccess(res, summary);
}));

// ── GET /api/v1/player/level-progress ────────────────
// Returns current level progress calculation
router.get('/level-progress', protect, asyncHandler(async (req, res) => {
  const profile = await playerProfileService.getOrCreate(req.user.id);
  const progress = getLevelProgress(profile.totalXpEarned || 0);
  sendSuccess(res, progress);
}));

// ── GET /api/v1/player/history/:type ────────────────
// Phase 2.4.5: Returns past 7 days of task or challenge history
// :type = 'tasks' or 'challenges'
// IMPORTANT: Must be BEFORE /:userId catch-all route
router.get('/history/:type', protect, asyncHandler(async (req, res) => {
  const { type } = req.params;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  if (type === 'tasks') {
    const Task = require('../models/Task');
    const tasks = await Task.find({
      userId: req.user.id,
      createdAt: { $gte: sevenDaysAgo }
    }).sort({ createdAt: -1 }).lean();

    const sanitized = tasks.map(t => ({
      id: t._id.toString(),
      title: t.title,
      description: t.description || '',
      priority: t.priority,
      status: t.status,
      deadline: t.deadline,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      failedAt: t.failedAt,
      cancelledAt: t.cancelledAt,
      expiredAt: t.expiredAt,
      xpEarned: t.metadata?.xpAwarded || 0
    }));

    return sendSuccess(res, { type: 'tasks', history: sanitized, count: sanitized.length });
  }

  if (type === 'challenges') {
    const Challenge = require('../models/Challenge');
    const PlayerProfile = require('../models/PlayerProfile');
    const challenges = await Challenge.find({
      'participants.userId': req.user.id,
      createdAt: { $gte: sevenDaysAgo }
    }).sort({ createdAt: -1 }).lean();

    // Batch-load winner + participant profiles
    const allUserIds = new Set();
    challenges.forEach(c => {
      c.participants.forEach(p => allUserIds.add(p.userId.toString()));
      if (c.winnerId) allUserIds.add(c.winnerId.toString());
    });
    const profiles = await PlayerProfile.find({ userId: { $in: [...allUserIds] } })
      .select('userId displayName avatar').lean();
    const profileMap = {};
    profiles.forEach(p => { profileMap[p.userId.toString()] = p; });

    const sanitized = challenges.map(c => {
      const myParticipant = c.participants.find(p => p.userId.toString() === req.user.id);
      const winnerProfile = c.winnerId ? profileMap[c.winnerId.toString()] : null;
      return {
        id: c._id.toString(),
        auraChallengeId: c.auraChallengeId,
        title: c.title,
        description: c.description || '',
        type: c.type,
        status: c.status,
        myStatus: myParticipant?.status || 'UNKNOWN',
        isWinner: c.winnerId?.toString() === req.user.id,
        winnerId: c.winnerId?.toString() || null,
        winnerName: winnerProfile?.displayName || null,
        participantCount: c.participants.length,
        participants: c.participants.map(p => ({
          displayName: profileMap[p.userId.toString()]?.displayName || 'Player',
          status: p.status
        })),
        stakeXp: c.stakeXp || 0,
        startAt: c.startAt,
        endAt: c.endAt,
        activatedAt: c.activatedAt,
        resolvedAt: c.resolvedAt,
        createdAt: c.createdAt
      };
    });

    return sendSuccess(res, { type: 'challenges', history: sanitized, count: sanitized.length });
  }

  return sendError(res, 'Invalid history type. Use "tasks" or "challenges"', 400);
}));

// ── GET /api/v1/player/:userId ───────────────────────
// Public profile view by userId (legacy, sanitized)
// MUST be LAST — catches any unmatched :param
router.get('/:userId', protect, asyncHandler(async (req, res) => {
  const profile = await playerProfileService.getByUserId(req.params.userId);
  if (!profile) return sendSuccess(res, null, 'Profile not found');
  sendSuccess(res, playerProfileService.sanitizePublicProfile(profile));
}));

module.exports = router;
