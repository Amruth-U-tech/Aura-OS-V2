const PlayerProfile = require('../../models/PlayerProfile');
const User = require('../../models/User');

// ======================================================
// PLAYER PROFILE DOMAIN SERVICE — Phase 2.4.2
// Owns: CRUD, retrieval, validation, sanitization
// Refinements: public/private profile visibility, skills,
//              endorsements, certificates, weekly XP
// Must NOT: contain auth logic, challenge logic, or scoring
// ======================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// ── Trust tier computation from score ────────────────
// Phase 2.4.3: Derives tier from trustScore so leaderboard
// and public profiles don't need to join TrustProfile
const computeTrustTier = (trustScore) => {
  if (trustScore == null) return 'NEUTRAL';
  if (trustScore >= 90) return 'EXCEPTIONAL';
  if (trustScore >= 70) return 'VERIFIED';
  if (trustScore >= 50) return 'TRUSTED';
  if (trustScore >= 30) return 'NEUTRAL';
  return 'UNTRUSTED';
};

// ── Create ───────────────────────────────────────────
const createProfile = async (userId, data = {}) => {
  const existing = await PlayerProfile.findOne({ userId });
  if (existing) {
    const err = new Error('Player profile already exists');
    err.statusCode = 409;
    err.codeName = 'DUPLICATE_ENTRY';
    throw err;
  }

  return PlayerProfile.create({
    userId,
    displayName: data.displayName || null,
    country: data.country || null,
    timezone: data.timezone || 'Asia/Kolkata',
    ...data
  });
};

// ── Retrieve by userId ───────────────────────────────
const getByUserId = async (userId) => {
  return PlayerProfile.findOne({ userId });
};

// ── Retrieve by auraPlayerId (PUBLIC PROFILE) ────────
const getByAuraPlayerId = async (auraPlayerId) => {
  return PlayerProfile.findOne({ auraPlayerId });
};

// ── Retrieve or create (upsert pattern) ──────────────
const getOrCreate = async (userId, defaults = {}) => {
  let profile = await PlayerProfile.findOne({ userId });
  if (!profile) {
    profile = await createProfile(userId, defaults);
  }
  return profile;
};

// ── Update profile fields ────────────────────────────
const updateProfile = async (userId, updateData) => {
  const allowedFields = [
    'displayName', 'avatar', 'bio', 'country',
    'timezone', 'region', 'locale',
    'soundEnabled', 'notificationsEnabled'
  ];

  const sanitized = {};
  for (const key of allowedFields) {
    if (updateData[key] !== undefined) sanitized[key] = updateData[key];
  }

  // Handle profile visibility settings
  if (updateData.profileVisibility) {
    const visMask = {};
    const visFields = ['showEmail', 'showStats', 'showSkills', 'showChallengeHistory', 'showHubs', 'showStreak', 'showFriends', 'isPublic'];
    for (const vf of visFields) {
      if (updateData.profileVisibility[vf] !== undefined) {
        visMask[`profileVisibility.${vf}`] = updateData.profileVisibility[vf];
      }
    }
    Object.assign(sanitized, visMask);
  }

  return PlayerProfile.findOneAndUpdate(
    { userId },
    { $set: sanitized },
    { returnDocument: 'after', runValidators: true }
  );
};

// ── Update progression snapshot ──────────────────────
// Called internally by progression engine — NOT by API
const updateProgression = async (userId, progressionData) => {
  const allowedFields = [
    'level', 'xp', 'totalXpEarned', 'currentStreak',
    'longestStreak', 'lastStreakDate', 'trustScore',
    'friendCount', 'hubCount', 'challengeWins', 'challengeLosses',
    'challengesParticipated', 'weeklyXp', 'weeklyXpResetAt', 'weeklyVoucherXp'
  ];

  const sanitized = {};
  for (const key of allowedFields) {
    if (progressionData[key] !== undefined) sanitized[key] = progressionData[key];
  }

  return PlayerProfile.findOneAndUpdate(
    { userId },
    { $set: sanitized },
    { returnDocument: 'after', runValidators: true }
  );
};

// ── Increment counters (atomic) ──────────────────────
const incrementCounter = async (userId, field, amount = 1) => {
  const allowedCounters = [
    'friendCount', 'hubCount', 'challengeWins', 'challengeLosses',
    'challengesParticipated', 'xp', 'totalXpEarned', 'currentStreak',
    'weeklyXp', 'weeklyVoucherXp'
  ];

  if (!allowedCounters.includes(field)) {
    throw new Error(`Cannot increment field: ${field}`);
  }

  return PlayerProfile.findOneAndUpdate(
    { userId },
    { $inc: { [field]: amount } },
    { returnDocument: 'after' }
  );
};

// ── Add Skill ────────────────────────────────────────
const addSkill = async (userId, skillData) => {
  const profile = await PlayerProfile.findOne({ userId });
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });

  // Max 20 skills
  if (profile.skills.length >= 20) {
    throw Object.assign(new Error('Maximum skills limit reached (20)'), { statusCode: 400 });
  }

  // Prevent duplicate skill names
  const duplicate = profile.skills.find(
    s => s.name.toLowerCase() === skillData.name.toLowerCase()
  );
  if (duplicate) {
    throw Object.assign(new Error('Skill already exists'), { statusCode: 409 });
  }

  profile.skills.push({
    name: skillData.name,
    category: skillData.category || 'General',
    verified: !!skillData.certificateUrl,
    certificateUrl: skillData.certificateUrl || null,
    endorsements: [],
    uploadedAt: new Date()
  });

  return profile.save();
};

// ── Remove Skill ─────────────────────────────────────
const removeSkill = async (userId, skillIndex) => {
  const profile = await PlayerProfile.findOne({ userId });
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });

  if (skillIndex < 0 || skillIndex >= profile.skills.length) {
    throw Object.assign(new Error('Invalid skill index'), { statusCode: 400 });
  }

  profile.skills.splice(skillIndex, 1);
  return profile.save();
};

// ── Endorse Skill ────────────────────────────────────
// Prevents: self-endorsement, duplicate endorsement
const endorseSkill = async (targetUserId, skillIndex, endorserUserId) => {
  // Prevent self-endorsement
  if (targetUserId.toString() === endorserUserId.toString()) {
    throw Object.assign(new Error('Cannot endorse your own skill'), { statusCode: 400 });
  }

  const profile = await PlayerProfile.findOne({ userId: targetUserId });
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });

  if (skillIndex < 0 || skillIndex >= profile.skills.length) {
    throw Object.assign(new Error('Invalid skill index'), { statusCode: 400 });
  }

  const skill = profile.skills[skillIndex];

  // Prevent duplicate endorsement
  const alreadyEndorsed = skill.endorsements.find(
    e => e.userId.toString() === endorserUserId.toString()
  );
  if (alreadyEndorsed) {
    throw Object.assign(new Error('Already endorsed this skill'), { statusCode: 409 });
  }

  skill.endorsements.push({ userId: endorserUserId, endorsedAt: new Date() });

  // Auto-verify after 3+ endorsements
  if (skill.endorsements.length >= 3 && !skill.verified) {
    skill.verified = true;
  }

  return profile.save();
};

// ── Upload Certificate for Skill ─────────────────────
const updateSkillCertificate = async (userId, skillIndex, certificateUrl) => {
  const profile = await PlayerProfile.findOne({ userId });
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });

  if (skillIndex < 0 || skillIndex >= profile.skills.length) {
    throw Object.assign(new Error('Invalid skill index'), { statusCode: 400 });
  }

  profile.skills[skillIndex].certificateUrl = certificateUrl;
  profile.skills[skillIndex].verified = true;
  return profile.save();
};

// ── Reset Weekly XP ──────────────────────────────────
const resetWeeklyXp = async () => {
  return PlayerProfile.updateMany(
    {},
    { $set: { weeklyXp: 0, weeklyVoucherXp: 0, weeklyXpResetAt: new Date() } }
  );
};

// ── Leaderboard retrieval (paginated) ────────────────
const getLeaderboard = async (options = {}) => {
  const {
    sortBy = 'xp',
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
    country = null,
    weekly = false
  } = options;

  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (Math.max(1, page) - 1) * safeLimit;

  // Weekly leaderboard uses weeklyXp, permanent uses xp
  const sortField = weekly ? 'weeklyXp' :
    (['xp', 'level', 'trustScore'].includes(sortBy) ? sortBy : 'xp');
  const filter = country ? { country } : {};

  const [profiles, total] = await Promise.all([
    PlayerProfile.find(filter)
      .sort({ [sortField]: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    PlayerProfile.countDocuments(filter)
  ]);

  return {
    profiles: profiles.map(p => sanitizePublicProfile(p)),
    pagination: {
      page: Math.max(1, page),
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit)
    },
    isWeekly: weekly
  };
};

// ── PUBLIC Profile Sanitization ──────────────────────
// Returns ONLY public-safe data (for other players viewing)
const sanitizePublicProfile = (profile) => {
  if (!profile) return null;
  const obj = profile.toObject ? profile.toObject() : profile;
  const vis = obj.profileVisibility || {};

  return {
    // Phase 2.4.3: userId needed for endorsement routing
    userId: obj.userId?.toString(),
    auraPlayerId: obj.auraPlayerId,
    displayName: obj.displayName,
    avatar: obj.avatar,
    bio: obj.bio,
    level: obj.level,
    xp: vis.showStats !== false ? obj.xp : undefined,
    totalXpEarned: vis.showStats !== false ? obj.totalXpEarned : undefined,
    weeklyXp: vis.showStats !== false ? obj.weeklyXp : undefined,
    streak: vis.showStreak !== false ? obj.currentStreak : undefined,
    currentStreak: vis.showStreak !== false ? obj.currentStreak : undefined,
    longestStreak: vis.showStreak !== false ? obj.longestStreak : undefined,
    trustScore: obj.trustScore,
    trustTier: obj.trustTier || computeTrustTier(obj.trustScore),
    friendCount: vis.showFriends !== false ? obj.friendCount : undefined,
    hubCount: vis.showHubs !== false ? obj.hubCount : undefined,
    challengeWins: vis.showChallengeHistory !== false ? obj.challengeWins : undefined,
    challengeLosses: vis.showChallengeHistory !== false ? obj.challengeLosses : undefined,
    challengesParticipated: vis.showChallengeHistory !== false ? obj.challengesParticipated : undefined,
    skills: vis.showSkills !== false ? (obj.skills || []).map(s => ({
      name: s.name,
      category: s.category,
      verified: s.verified,
      endorsementCount: (s.endorsements || []).length,
      hasCertificate: !!s.certificateUrl,
      certificateUrl: s.certificateUrl
    })) : [],
    achievements: (obj.achievements || []).map(a => ({
      title: a.title,
      icon: a.icon,
      earnedAt: a.earnedAt
    })),
    country: obj.country,
    timezone: obj.timezone,
    locale: obj.locale,
    createdAt: obj.createdAt
  };
};

// ── PRIVATE Profile Sanitization ─────────────────────
// Returns ALL profile data (only for the owner)
const sanitizePrivateProfile = (profile, user = null) => {
  if (!profile) return null;
  const obj = profile.toObject ? profile.toObject() : profile;

  return {
    id: obj._id?.toString() || obj.userId?.toString(),
    userId: obj.userId?.toString(),
    auraPlayerId: obj.auraPlayerId,
    displayName: obj.displayName,
    avatar: obj.avatar,
    bio: obj.bio,
    email: user?.email || null,
    level: obj.level,
    xp: obj.xp,
    totalXpEarned: obj.totalXpEarned,
    weeklyXp: obj.weeklyXp,
    weeklyVoucherXp: obj.weeklyVoucherXp,
    streak: obj.currentStreak,
    currentStreak: obj.currentStreak,
    longestStreak: obj.longestStreak,
    totalMissionsCompleted: obj.totalMissionsCompleted || 0,
    trustScore: obj.trustScore,
    trustTier: obj.trustTier || computeTrustTier(obj.trustScore),
    friendCount: obj.friendCount,
    hubCount: obj.hubCount,
    challengeWins: obj.challengeWins,
    challengeLosses: obj.challengeLosses,
    challengesParticipated: obj.challengesParticipated,
    skills: (obj.skills || []).map((s, i) => ({
      index: i,
      name: s.name,
      category: s.category,
      verified: s.verified,
      endorsementCount: (s.endorsements || []).length,
      endorsements: (s.endorsements || []).map(e => ({
        userId: e.userId?.toString(),
        endorsedAt: e.endorsedAt
      })),
      certificateUrl: s.certificateUrl,
      hasCertificate: !!s.certificateUrl,
      uploadedAt: s.uploadedAt
    })),
    achievements: obj.achievements || [],
    profileVisibility: obj.profileVisibility,
    soundEnabled: obj.soundEnabled,
    notificationsEnabled: obj.notificationsEnabled,
    country: obj.country,
    timezone: obj.timezone,
    region: obj.region,
    locale: obj.locale,
    createdAt: obj.createdAt
  };
};

// ── Legacy sanitizeProfile (backward compatible) ─────
const sanitizeProfile = (profile) => {
  return sanitizePublicProfile(profile);
};

module.exports = {
  createProfile,
  getByUserId,
  getByAuraPlayerId,
  getOrCreate,
  updateProfile,
  updateProgression,
  incrementCounter,
  addSkill,
  removeSkill,
  endorseSkill,
  updateSkillCertificate,
  resetWeeklyXp,
  getLeaderboard,
  sanitizePublicProfile,
  sanitizePrivateProfile,
  sanitizeProfile
};
