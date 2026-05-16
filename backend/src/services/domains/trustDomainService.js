const TrustProfile = require('../../models/TrustProfile');

// ======================================================
// TRUST DOMAIN SERVICE — Phase 2.4.2
// Owns: TrustProfile CRUD, retrieval, sanitization
// Refinements: weighted average trust, trust acceleration,
//              trust delta on proof validation, tier recalc
// Must NOT: contain challenge logic or XP calculations
// ======================================================

// ── Trust Tier Thresholds ────────────────────────────
const TRUST_THRESHOLDS = {
  UNTRUSTED: [0, 29],
  NEUTRAL: [30, 49],
  TRUSTED: [50, 69],
  VERIFIED: [70, 89],
  EXCEPTIONAL: [90, 100]
};

// ── Calculate trust tier from score ──────────────────
const calculateTier = (score) => {
  if (score >= 90) return 'EXCEPTIONAL';
  if (score >= 70) return 'VERIFIED';
  if (score >= 50) return 'TRUSTED';
  if (score >= 30) return 'NEUTRAL';
  return 'UNTRUSTED';
};

// ── Get or Create Trust Profile ──────────────────────
const getOrCreate = async (userId) => {
  let profile = await TrustProfile.findOne({ userId });
  if (!profile) {
    profile = await TrustProfile.create({ userId });
  }
  return profile;
};

// ── Get Trust Snapshot ───────────────────────────────
const getTrustSnapshot = async (userId) => {
  const profile = await getOrCreate(userId);
  return sanitizeTrustProfile(profile);
};

// ── Update Trust Score (called by scoring engine) ────
const updateTrustScore = async (userId, scoreData) => {
  const allowedFields = [
    'trustScore', 'totalValidations', 'verifiedCount',
    'rejectedCount', 'exceptionalCount', 'deadlineMissCount',
    'challengeCompletionRate', 'streakConsistencyScore',
    'tier', 'flaggedForReview', 'lastScoreChangeAt', 'lastValidationAt'
  ];

  const sanitized = {};
  for (const key of allowedFields) {
    if (scoreData[key] !== undefined) sanitized[key] = scoreData[key];
  }

  return TrustProfile.findOneAndUpdate(
    { userId },
    { $set: sanitized },
    { new: true, runValidators: true, upsert: true }
  );
};

// ── Record a validation score ────────────────────────
// Phase 2.4.2: Calculates weighted average + trust acceleration
const recordValidation = async (userId, score, source) => {
  const profile = await getOrCreate(userId);

  // Keep rolling window (last 50 scores)
  profile.recentScores.push({ score, source, recordedAt: new Date() });
  if (profile.recentScores.length > 50) {
    profile.recentScores = profile.recentScores.slice(-50);
  }

  profile.totalValidations += 1;
  profile.lastValidationAt = new Date();

  if (score >= 70) profile.verifiedCount += 1;
  else profile.rejectedCount += 1;
  if (score >= 90) profile.exceptionalCount += 1;

  // ── Calculate weighted average trust score ─────────
  // Recent scores weight more heavily
  const scores = profile.recentScores;
  if (scores.length > 0) {
    let weightedSum = 0;
    let weightTotal = 0;
    for (let i = 0; i < scores.length; i++) {
      const weight = (i + 1); // More recent = higher weight
      weightedSum += scores[i].score * weight;
      weightTotal += weight;
    }
    const weightedAvg = weightedSum / weightTotal;

    // ── Trust Acceleration ───────────────────────────
    // Players with consistent high scores get bonus trust
    const recentHighCount = scores.slice(-10).filter(s => s.score >= 70).length;
    const accelerationBonus = recentHighCount >= 7 ? 3 : recentHighCount >= 5 ? 1.5 : 0;

    // Apply delta: blend existing score with new weighted average
    const blendFactor = 0.3; // 30% weight to new, 70% to existing
    let newTrustScore = (profile.trustScore * (1 - blendFactor)) +
                        (weightedAvg * blendFactor) +
                        accelerationBonus;

    // Clamp to 0-100
    newTrustScore = Math.min(100, Math.max(0, Math.round(newTrustScore * 10) / 10));

    profile.trustScore = newTrustScore;
    profile.lastScoreChangeAt = new Date();

    // Recalculate tier
    profile.tier = calculateTier(newTrustScore);
  }

  // ── Edge case: penalize rejected submissions ───────
  if (score < 30) {
    const penaltyDelta = -2;
    profile.trustScore = Math.max(0, profile.trustScore + penaltyDelta);
    profile.tier = calculateTier(profile.trustScore);
  }

  // ── Flag for review if trust drops critically ──────
  if (profile.trustScore < 20 && profile.totalValidations >= 5) {
    profile.flaggedForReview = true;
  }

  return profile.save();
};

// ── Calculate trust delta for proof submission ───────
// Returns the expected trust change without persisting
const calculateTrustDelta = (currentScore, validationScore) => {
  if (validationScore >= 90) return { delta: 3, label: 'Exceptional proof' };
  if (validationScore >= 70) return { delta: 1.5, label: 'Strong proof' };
  if (validationScore >= 50) return { delta: 0.5, label: 'Acceptable proof' };
  if (validationScore >= 30) return { delta: -0.5, label: 'Weak proof' };
  return { delta: -2, label: 'Invalid proof' };
};

// ── Record deadline miss ─────────────────────────────
const recordDeadlineMiss = async (userId) => {
  const profile = await getOrCreate(userId);
  profile.deadlineMissCount += 1;

  // Penalize trust for missed deadlines
  const penalty = Math.min(5, 1 + Math.floor(profile.deadlineMissCount / 3));
  profile.trustScore = Math.max(0, profile.trustScore - penalty);
  profile.tier = calculateTier(profile.trustScore);
  profile.lastScoreChangeAt = new Date();

  return profile.save();
};

// ── Update challenge completion rate ─────────────────
const updateCompletionRate = async (userId, completed, total) => {
  const profile = await getOrCreate(userId);
  profile.challengeCompletionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  return profile.save();
};

// ── Get flagged profiles (moderation) ────────────────
const getFlaggedProfiles = async (options = {}) => {
  const { page = 1, limit = 20 } = options;
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const skip = (Math.max(1, page) - 1) * safeLimit;

  const [profiles, total] = await Promise.all([
    TrustProfile.find({ flaggedForReview: true })
      .sort({ trustScore: 1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    TrustProfile.countDocuments({ flaggedForReview: true })
  ]);

  return {
    profiles: profiles.map(sanitizeTrustProfile),
    pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

// ── Response Sanitization ────────────────────────────
const sanitizeTrustProfile = (profile) => {
  if (!profile) return null;
  const obj = profile.toObject ? profile.toObject() : profile;
  return {
    userId: obj.userId?.toString(),
    trustScore: obj.trustScore,
    tier: obj.tier,
    totalValidations: obj.totalValidations,
    verifiedCount: obj.verifiedCount,
    rejectedCount: obj.rejectedCount,
    exceptionalCount: obj.exceptionalCount,
    challengeCompletionRate: obj.challengeCompletionRate,
    streakConsistencyScore: obj.streakConsistencyScore,
    lastScoreChangeAt: obj.lastScoreChangeAt,
    lastValidationAt: obj.lastValidationAt
  };
};

module.exports = {
  getOrCreate, getTrustSnapshot, updateTrustScore,
  recordValidation, calculateTrustDelta, recordDeadlineMiss,
  updateCompletionRate, getFlaggedProfiles, sanitizeTrustProfile,
  calculateTier, TRUST_THRESHOLDS
};
