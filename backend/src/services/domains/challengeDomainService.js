const Challenge = require('../../models/Challenge');
const ChallengeSubmission = require('../../models/ChallengeSubmission');
const { CHALLENGE_STATUS, CHALLENGE_TYPE } = require('../../constants/domainConstants');

// ======================================================
// CHALLENGE DOMAIN SERVICE — Phase 2.4.2
// Owns: Challenge + ChallengeSubmission CRUD & retrieval
// All storage/retrieval/validation/sanitization in ONE place
// Refinements: SCHEDULED state, mandatory endAt, auto maxParticipants
// Must NOT: contain winner logic, scoring, or AI validation
// ======================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// Valid lifecycle transitions — prevents invalid state changes
// Phase 2.4.2: Added SCHEDULED and WAITING_FOR_PARTICIPANTS
const VALID_TRANSITIONS = {
  DRAFT: ['PENDING', 'SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  PENDING: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  ACTIVE: ['SUBMISSION', 'WAITING_FOR_PARTICIPANTS', 'CANCELLED', 'EXPIRED'],
  SUBMISSION: ['LOCKED', 'WAITING_FOR_PARTICIPANTS', 'CANCELLED'],
  WAITING_FOR_PARTICIPANTS: ['SUBMISSION', 'LOCKED', 'CANCELLED', 'EXPIRED'],
  LOCKED: ['RESOLUTION'],
  RESOLUTION: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  EXPIRED: []
};

// ── Create Challenge ─────────────────────────────────
// Phase 2.4.2: endAt is mandatory, FRIEND_1V1 auto-sets maxParticipants=2
const createChallenge = async (creatorId, data) => {
  // Enforce mandatory endAt
  if (!data.endAt) {
    throw Object.assign(new Error('Challenge must have an end time (endAt)'), { statusCode: 400 });
  }

  // FRIEND_1V1: auto-set maxParticipants=2, hidden from frontend
  const isFriend1v1 = data.type === CHALLENGE_TYPE.FRIEND_1V1;
  const maxParticipants = isFriend1v1 ? 2 : (data.maxParticipants || 10);
  const minParticipants = isFriend1v1 ? 2 : (data.minParticipants || 2);

  // Determine initial status based on startAt
  let initialStatus = CHALLENGE_STATUS.DRAFT;

  const challenge = await Challenge.create({
    title: data.title,
    description: data.description || '',
    type: data.type,
    creatorId,
    hubId: data.hubId || null,
    targetFriendId: data.targetFriendId || null,
    stakeXp: data.stakeXp || 0,
    stakeType: data.stakeType || 'NONE',
    startAt: data.startAt || null,
    endAt: data.endAt,
    submissionDeadline: data.submissionDeadline || null,
    minParticipants,
    maxParticipants,
    status: initialStatus,
    participants: [{ userId: creatorId, status: 'JOINED' }]
  });

  return challenge;
};

// ── Activate Challenge (scheduler-driven) ────────────
// Phase 2.4.2: If startAt is provided → SCHEDULED, else immediate ACTIVE
const activateChallenge = async (challengeId) => {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) throw Object.assign(new Error('Challenge not found'), { statusCode: 404 });

  const now = new Date();

  // If startAt is in the future, schedule it
  if (challenge.startAt && new Date(challenge.startAt) > now) {
    if (challenge.status === CHALLENGE_STATUS.DRAFT) {
      challenge.status = CHALLENGE_STATUS.SCHEDULED;
      challenge.scheduledAt = now;
      return challenge.save();
    }
    return challenge;
  }

  // Immediate activation flow
  if (challenge.status === CHALLENGE_STATUS.DRAFT) {
    challenge.status = CHALLENGE_STATUS.PENDING;
  }
  if (challenge.status === CHALLENGE_STATUS.PENDING || challenge.status === CHALLENGE_STATUS.SCHEDULED) {
    challenge.status = CHALLENGE_STATUS.ACTIVE;
    challenge.activatedAt = now;
  }

  return challenge.save();
};

// ── Transition lifecycle state ───────────────────────
const transitionState = async (challengeId, newStatus, timestamp = new Date()) => {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) throw Object.assign(new Error('Challenge not found'), { statusCode: 404 });

  const allowed = VALID_TRANSITIONS[challenge.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw Object.assign(
      new Error(`Invalid transition: ${challenge.status} → ${newStatus}`),
      { statusCode: 400 }
    );
  }

  challenge.status = newStatus;

  // Set lifecycle timestamp
  const timestampMap = {
    SCHEDULED: 'scheduledAt',
    ACTIVE: 'activatedAt',
    LOCKED: 'lockedAt',
    COMPLETED: 'resolvedAt',
    CANCELLED: 'cancelledAt'
  };
  if (timestampMap[newStatus]) {
    challenge[timestampMap[newStatus]] = timestamp;
  }

  return challenge.save();
};

// ── Join Challenge ───────────────────────────────────
const joinChallenge = async (challengeId, userId) => {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) throw Object.assign(new Error('Challenge not found'), { statusCode: 404 });

  if (!['DRAFT', 'PENDING', 'ACTIVE'].includes(challenge.status)) {
    throw Object.assign(new Error('Challenge is not accepting participants'), { statusCode: 400 });
  }
  if (challenge.participants.length >= challenge.maxParticipants) {
    throw Object.assign(new Error('Challenge is full'), { statusCode: 400 });
  }

  const alreadyJoined = challenge.participants.some(
    p => p.userId.toString() === userId.toString()
  );
  if (alreadyJoined) {
    throw Object.assign(new Error('Already joined this challenge'), { statusCode: 409 });
  }

  challenge.participants.push({ userId, status: 'JOINED' });
  return challenge.save();
};

// ── Submit Proof ─────────────────────────────────────
const createSubmission = async (challengeId, userId, data) => {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) throw Object.assign(new Error('Challenge not found'), { statusCode: 404 });

  // Verify participant
  const participant = challenge.participants.find(
    p => p.userId.toString() === userId.toString()
  );
  if (!participant) throw Object.assign(new Error('Not a participant'), { statusCode: 403 });

  // Count existing attempts
  const attemptCount = await ChallengeSubmission.countDocuments({ challengeId, userId });

  return ChallengeSubmission.create({
    challengeId,
    userId,
    proofImageUrls: data.proofImageUrls || [],
    proofText: data.proofText || '',
    attemptNumber: attemptCount + 1
  });
};

// ── Check if all participants have validated submissions ──
const allParticipantsValidated = async (challengeId) => {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) return false;

  const participantIds = challenge.participants.map(p => p.userId.toString());

  for (const pid of participantIds) {
    const submission = await ChallengeSubmission.findOne({
      challengeId,
      userId: pid,
      validationScore: { $ne: null }
    }).sort({ attemptNumber: -1 });

    if (!submission) return false;
  }

  return true;
};

// ── Check if challenge deadline has passed ────────────
const isDeadlinePassed = (challenge) => {
  if (!challenge.endAt) return false;
  return new Date() >= new Date(challenge.endAt);
};

// ── Can resolve check ────────────────────────────────
// Phase 2.4.3: Resolve when ALL participants have validated submissions
// OR when the deadline has passed (even if not all submitted)
const canResolve = async (challengeId) => {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) return { canResolve: false, reason: 'Challenge not found' };

  if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(challenge.status)) {
    return { canResolve: false, reason: 'Challenge is already finalized' };
  }

  const deadlinePassed = isDeadlinePassed(challenge);
  const allValidated = await allParticipantsValidated(challengeId);

  // Allow resolve if all participants submitted (early resolution)
  if (allValidated) {
    return { canResolve: true, reason: null };
  }

  // Allow resolve if deadline passed (even if not all submitted)
  if (deadlinePassed) {
    return { canResolve: true, reason: null };
  }

  // Count how many have submitted
  const participantIds = challenge.participants.map(p => p.userId.toString());
  let submittedCount = 0;
  for (const pid of participantIds) {
    const sub = await ChallengeSubmission.findOne({ challengeId, userId: pid, validationScore: { $ne: null } });
    if (sub) submittedCount++;
  }

  return {
    canResolve: false,
    reason: `Waiting for submissions (${submittedCount}/${participantIds.length} submitted). Deadline: ${challenge.endAt ? new Date(challenge.endAt).toLocaleString() : 'none'}`,
    submittedCount,
    totalParticipants: participantIds.length
  };
};

// ── Get Challenge by ID ──────────────────────────────
const getChallengeById = async (challengeId) => {
  return Challenge.findById(challengeId);
};

// ── Get challenges (paginated) ───────────────────────
const getChallenges = async (filter = {}, options = {}) => {
  const { page = 1, limit = DEFAULT_PAGE_SIZE, sortBy = 'createdAt' } = options;
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (Math.max(1, page) - 1) * safeLimit;

  const [challenges, total] = await Promise.all([
    Challenge.find(filter).sort({ [sortBy]: -1 }).skip(skip).limit(safeLimit).lean(),
    Challenge.countDocuments(filter)
  ]);

  return {
    challenges: challenges.map(sanitizeChallenge),
    pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

// ── Get user's challenges ────────────────────────────
const getUserChallenges = async (userId, options = {}) => {
  return getChallenges({ 'participants.userId': userId }, options);
};

// ── Get hub challenges ───────────────────────────────
const getHubChallenges = async (hubId, options = {}) => {
  return getChallenges({ hubId }, options);
};

// ── Get submissions for challenge ────────────────────
const getSubmissions = async (challengeId, options = {}) => {
  const { page = 1, limit = DEFAULT_PAGE_SIZE } = options;
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (Math.max(1, page) - 1) * safeLimit;

  const [submissions, total] = await Promise.all([
    ChallengeSubmission.find({ challengeId })
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    ChallengeSubmission.countDocuments({ challengeId })
  ]);

  return {
    submissions: submissions.map(sanitizeSubmission),
    pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

// ── Get scheduled challenges that need activation ────
const getScheduledChallenges = async () => {
  const now = new Date();
  return Challenge.find({
    status: CHALLENGE_STATUS.SCHEDULED,
    startAt: { $lte: now }
  });
};

// ── Get expired challenges ───────────────────────────
const getExpiredChallenges = async () => {
  const now = new Date();
  return Challenge.find({
    status: { $in: [CHALLENGE_STATUS.ACTIVE, CHALLENGE_STATUS.SUBMISSION, CHALLENGE_STATUS.WAITING_FOR_PARTICIPANTS] },
    endAt: { $lte: now }
  });
};

// ── Response Sanitization ────────────────────────────
const sanitizeChallenge = (c) => {
  if (!c) return null;
  const obj = c.toObject ? c.toObject() : c;
  return {
    id: obj._id?.toString(),
    auraChallengeId: obj.auraChallengeId,
    title: obj.title,
    description: obj.description,
    type: obj.type,
    status: obj.status,
    creatorId: obj.creatorId?.toString(),
    targetFriendId: obj.targetFriendId?.toString() || null,
    hubId: obj.hubId?.toString() || null,
    routing: obj.type === 'FRIEND_1V1' ? 'ONE_TO_ONE' : 'ONE_TO_MANY',
    participants: (obj.participants || []).map(p => ({
      userId: p.userId?.toString(),
      status: p.status,
      joinedAt: p.joinedAt
    })),
    stakeXp: obj.stakeXp,
    stakeType: obj.stakeType,
    startAt: obj.startAt,
    endAt: obj.endAt,
    submissionDeadline: obj.submissionDeadline,
    winnerId: obj.winnerId?.toString() || null,
    activatedAt: obj.activatedAt,
    resolvedAt: obj.resolvedAt,
    createdAt: obj.createdAt
  };
};

const sanitizeSubmission = (s) => {
  if (!s) return null;
  const obj = s.toObject ? s.toObject() : s;
  return {
    id: obj._id?.toString(),
    challengeId: obj.challengeId?.toString(),
    userId: obj.userId?.toString(),
    proofImageUrls: obj.proofImageUrls,
    proofText: obj.proofText,
    status: obj.status,
    validationScore: obj.validationScore,
    validationProvider: obj.validationProvider,
    aiExplanation: obj.aiExplanation,
    attemptNumber: obj.attemptNumber,
    submittedAt: obj.submittedAt,
    validatedAt: obj.validatedAt
  };
};

module.exports = {
  createChallenge, activateChallenge, transitionState, joinChallenge,
  createSubmission, allParticipantsValidated, isDeadlinePassed, canResolve,
  getChallengeById, getChallenges, getUserChallenges, getHubChallenges,
  getSubmissions, getScheduledChallenges, getExpiredChallenges,
  sanitizeChallenge, sanitizeSubmission, VALID_TRANSITIONS
};
