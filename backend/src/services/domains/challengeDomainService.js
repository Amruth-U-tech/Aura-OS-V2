const Challenge = require('../../models/Challenge');
const ChallengeSubmission = require('../../models/ChallengeSubmission');
const { CHALLENGE_STATUS, CHALLENGE_TYPE, PARTICIPANT_STATUS } = require('../../constants/domainConstants');

// ======================================================
// CHALLENGE DOMAIN SERVICE — Phase 3.1.7
//
// CORRECTED LIFECYCLE:
//   1. createChallenge  → DRAFT (only creator, target NOT added yet)
//   2. dispatchInvite   → WAITING_FOR_PARTICIPANTS (target added as INVITED)
//   3. acceptInvite     → participant ACCEPTED
//                          1v1: WAITING→ACTIVE (both players confirmed)
//                          Hub: WAITING→READY (quorum check)
//   4. declineInvite    → participant DECLINED
//                          1v1: CANCELLED (both sides get CHALLENGE_CANCELLED)
//                          Hub: participant removed, challenge continues
//   5. leaveChallenge   → participant LEFT (1v1: CANCELLED)
//   6. startChallenge   → READY→ACTIVE (creator explicitly starts group)
//
// "Activate" button in UI = dispatchInvite (NOT start challenge)
// For 1v1: auto-start on accept (no separate start needed)
// For Hub: creator starts after quorum met (READY→ACTIVE)
// ======================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// Finalized statuses — no further mutations
const FINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'EXPIRED'];

// Active participant statuses (count towards quorum and can submit)
const ACTIVE_PARTICIPANT_STATUSES = [
  PARTICIPANT_STATUS.JOINED,
  PARTICIPANT_STATUS.ACCEPTED,
  PARTICIPANT_STATUS.SUBMITTED,
  PARTICIPANT_STATUS.WINNER,
  PARTICIPANT_STATUS.LOSER
];

// Valid lifecycle transitions
const VALID_TRANSITIONS = {
  DRAFT:                    ['WAITING_FOR_PARTICIPANTS', 'CANCELLED', 'SCHEDULED'],
  WAITING_FOR_PARTICIPANTS: ['READY', 'ACTIVE', 'CANCELLED', 'EXPIRED'],
  READY:                    ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  SCHEDULED:                ['WAITING_FOR_PARTICIPANTS', 'ACTIVE', 'CANCELLED', 'EXPIRED'],
  PENDING:                  ['WAITING_FOR_PARTICIPANTS', 'ACTIVE', 'CANCELLED', 'EXPIRED'],
  ACTIVE:                   ['SUBMISSION', 'LOCKED', 'CANCELLED', 'EXPIRED'],
  SUBMISSION:               ['LOCKED', 'CANCELLED'],
  LOCKED:                   ['RESOLUTION'],
  RESOLUTION:               ['COMPLETED'],
  COMPLETED:                [],
  CANCELLED:                [],
  EXPIRED:                  []
};

// ── Create Challenge ─────────────────────────────────
// Phase 3.1.7: Creator is JOINED; target NOT added yet (added on dispatchInvite)
const createChallenge = async (creatorId, data) => {
  if (!data.endAt) {
    throw Object.assign(new Error('Challenge must have an end time (endAt)'), { statusCode: 400 });
  }

  const isFriend1v1 = data.type === CHALLENGE_TYPE.FRIEND_1V1;
  const maxParticipants = isFriend1v1 ? 2 : (data.maxParticipants || 10);
  const minParticipants = isFriend1v1 ? 2 : (data.minParticipants || 2);

  // Only creator in participants at creation
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
    status: CHALLENGE_STATUS.DRAFT,
    participants: [{
      userId: creatorId,
      status: PARTICIPANT_STATUS.JOINED,
      joinedAt: new Date()
    }]
  });

  return challenge;
};

// ── Dispatch Invitation ──────────────────────────────
// Phase 3.1.7: THIS is what "Activate" button does.
// DRAFT → WAITING_FOR_PARTICIPANTS
// For 1v1: adds target as INVITED, sends realtime notification
// For Hub: transitions to WAITING (hub members can join)
// Returns { challenge, invitedUserId } for event emission
const dispatchInvite = async (challengeId, creatorId) => {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) throw Object.assign(new Error('Challenge not found'), { statusCode: 404 });
  if (challenge.creatorId.toString() !== creatorId.toString()) {
    throw Object.assign(new Error('Only the creator can dispatch the invitation'), { statusCode: 403 });
  }
  if (challenge.status !== CHALLENGE_STATUS.DRAFT) {
    throw Object.assign(new Error(`Cannot dispatch invitation from status: ${challenge.status}`), { statusCode: 400 });
  }

  const now = new Date();

  // For 1v1: add target friend as INVITED participant
  let invitedUserId = null;
  if (challenge.type === CHALLENGE_TYPE.FRIEND_1V1) {
    if (!challenge.targetFriendId) {
      throw Object.assign(new Error('1v1 challenge requires a target friend'), { statusCode: 400 });
    }
    // Prevent duplicate invite
    const alreadyInvited = challenge.participants.some(
      p => p.userId.toString() === challenge.targetFriendId.toString()
    );
    if (!alreadyInvited) {
      challenge.participants.push({
        userId: challenge.targetFriendId,
        status: PARTICIPANT_STATUS.INVITED,
        invitedAt: now,
        joinedAt: null
      });
    }
    invitedUserId = challenge.targetFriendId.toString();
  }

  challenge.status = CHALLENGE_STATUS.WAITING_FOR_PARTICIPANTS;
  challenge.invitedAt = now;
  await challenge.save();

  return { challenge, invitedUserId };
};

// ── Accept Challenge Invite ──────────────────────────
// Phase 3.1.7: INVITED → ACCEPTED
// 1v1: challenge auto-transitions WAITING_FOR_PARTICIPANTS → ACTIVE
// Hub: check quorum → if met, WAITING → READY
// Returns { challenge, autoStarted }
const acceptInvite = async (challengeId, userId) => {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) throw Object.assign(new Error('Challenge not found'), { statusCode: 404 });

  if (FINAL_STATUSES.includes(challenge.status)) {
    throw Object.assign(new Error('Challenge is no longer accepting responses'), { statusCode: 400 });
  }
  if (challenge.status !== CHALLENGE_STATUS.WAITING_FOR_PARTICIPANTS) {
    throw Object.assign(new Error('Challenge is not currently accepting invites'), { statusCode: 400 });
  }

  const participant = challenge.participants.find(
    p => p.userId.toString() === userId.toString()
  );
  if (!participant) {
    throw Object.assign(new Error('You were not invited to this challenge'), { statusCode: 403 });
  }
  if (participant.status !== PARTICIPANT_STATUS.INVITED) {
    throw Object.assign(new Error('You have already responded to this invite'), { statusCode: 409 });
  }

  const now = new Date();
  participant.status = PARTICIPANT_STATUS.ACCEPTED;
  participant.acceptedAt = now;
  participant.joinedAt = now;

  let autoStarted = false;

  // 1v1: both parties confirmed → auto-start
  if (challenge.type === CHALLENGE_TYPE.FRIEND_1V1) {
    challenge.status = CHALLENGE_STATUS.ACTIVE;
    challenge.activatedAt = now;
    autoStarted = true;
  } else {
    // Hub: count accepted+joined (active) participants
    const activeCount = challenge.participants.filter(
      p => ACTIVE_PARTICIPANT_STATUSES.includes(p.status)
    ).length;
    if (activeCount >= challenge.minParticipants) {
      challenge.status = CHALLENGE_STATUS.READY;
    }
  }

  await challenge.save();
  return { challenge, autoStarted };
};

// ── Decline Challenge Invite ─────────────────────────
// Phase 3.1.7: INVITED → DECLINED
// 1v1: challenge auto-CANCELLED (BOTH participants notified via event)
// Hub: participant removed from visible list, challenge continues
// Returns { challenge, isCancelled }
const declineInvite = async (challengeId, userId) => {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) throw Object.assign(new Error('Challenge not found'), { statusCode: 404 });

  if (FINAL_STATUSES.includes(challenge.status)) {
    throw Object.assign(new Error('Challenge is no longer accepting responses'), { statusCode: 400 });
  }

  const participant = challenge.participants.find(
    p => p.userId.toString() === userId.toString()
  );
  if (!participant) {
    throw Object.assign(new Error('You were not invited to this challenge'), { statusCode: 403 });
  }
  if (participant.status !== PARTICIPANT_STATUS.INVITED) {
    throw Object.assign(new Error('You have already responded to this invite'), { statusCode: 409 });
  }

  const now = new Date();
  participant.status = PARTICIPANT_STATUS.DECLINED;
  participant.declinedAt = now;

  let isCancelled = false;

  // 1v1: any decline immediately cancels
  if (challenge.type === CHALLENGE_TYPE.FRIEND_1V1) {
    challenge.status = CHALLENGE_STATUS.CANCELLED;
    challenge.cancelledAt = now;
    isCancelled = true;
  } else {
    // Hub: check if remaining invited/accepted still meet minimum
    const stillPossible = challenge.participants.filter(
      p => p.userId.toString() !== userId.toString() &&
           [PARTICIPANT_STATUS.INVITED, PARTICIPANT_STATUS.ACCEPTED, PARTICIPANT_STATUS.JOINED].includes(p.status)
    ).length;
    if (stillPossible < challenge.minParticipants) {
      challenge.status = CHALLENGE_STATUS.CANCELLED;
      challenge.cancelledAt = now;
      isCancelled = true;
    }
  }

  await challenge.save();
  return { challenge, isCancelled };
};

// ── Leave Challenge ──────────────────────────────────
// Participant voluntarily leaves after accepting
const leaveChallenge = async (challengeId, userId) => {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) throw Object.assign(new Error('Challenge not found'), { statusCode: 404 });

  if (FINAL_STATUSES.includes(challenge.status)) {
    throw Object.assign(new Error('Cannot leave a finalized challenge'), { statusCode: 400 });
  }
  if (challenge.creatorId.toString() === userId.toString()) {
    throw Object.assign(new Error('Challenge creator cannot leave — use cancel instead'), { statusCode: 400 });
  }

  const participant = challenge.participants.find(
    p => p.userId.toString() === userId.toString()
  );
  if (!participant) {
    throw Object.assign(new Error('You are not a participant in this challenge'), { statusCode: 403 });
  }
  if ([PARTICIPANT_STATUS.LEFT, PARTICIPANT_STATUS.DECLINED].includes(participant.status)) {
    throw Object.assign(new Error('You have already left or declined this challenge'), { statusCode: 409 });
  }

  const now = new Date();
  participant.status = PARTICIPANT_STATUS.LEFT;
  participant.leftAt = now;

  let isCancelled = false;
  if (challenge.type === CHALLENGE_TYPE.FRIEND_1V1) {
    challenge.status = CHALLENGE_STATUS.CANCELLED;
    challenge.cancelledAt = now;
    isCancelled = true;
  }

  await challenge.save();
  return { challenge, isCancelled };
};

// ── Start Challenge (READY → ACTIVE) ────────────────
// For Hub/group challenges: creator explicitly starts after quorum met
const startChallenge = async (challengeId, creatorId) => {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) throw Object.assign(new Error('Challenge not found'), { statusCode: 404 });
  if (challenge.creatorId.toString() !== creatorId.toString()) {
    throw Object.assign(new Error('Only the creator can start the challenge'), { statusCode: 403 });
  }
  if (challenge.status !== CHALLENGE_STATUS.READY) {
    throw Object.assign(new Error(`Cannot start challenge from status: ${challenge.status}`), { statusCode: 400 });
  }

  challenge.status = CHALLENGE_STATUS.ACTIVE;
  challenge.activatedAt = new Date();
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
  const timestampMap = {
    WAITING_FOR_PARTICIPANTS: 'invitedAt',
    READY: 'readyAt',
    ACTIVE: 'activatedAt',
    LOCKED: 'lockedAt',
    COMPLETED: 'resolvedAt',
    CANCELLED: 'cancelledAt'
  };
  if (timestampMap[newStatus]) challenge[timestampMap[newStatus]] = timestamp;

  return challenge.save();
};

// ── Join Challenge (Hub Open direct join) ────────────
const joinChallenge = async (challengeId, userId) => {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) throw Object.assign(new Error('Challenge not found'), { statusCode: 404 });

  if (!['DRAFT', 'WAITING_FOR_PARTICIPANTS', 'READY', 'ACTIVE'].includes(challenge.status)) {
    throw Object.assign(new Error('Challenge is not accepting participants'), { statusCode: 400 });
  }
  if (challenge.participants.filter(p => ACTIVE_PARTICIPANT_STATUSES.includes(p.status)).length >= challenge.maxParticipants) {
    throw Object.assign(new Error('Challenge is full'), { statusCode: 400 });
  }

  const existing = challenge.participants.find(p => p.userId.toString() === userId.toString());
  if (existing) {
    if (ACTIVE_PARTICIPANT_STATUSES.includes(existing.status)) {
      throw Object.assign(new Error('Already joined this challenge'), { statusCode: 409 });
    }
    throw Object.assign(new Error('You have previously declined or left this challenge'), { statusCode: 409 });
  }

  challenge.participants.push({ userId, status: PARTICIPANT_STATUS.JOINED, joinedAt: new Date() });
  return challenge.save();
};

// ── Submit Proof ─────────────────────────────────────
const createSubmission = async (challengeId, userId, data) => {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) throw Object.assign(new Error('Challenge not found'), { statusCode: 404 });

  if (challenge.status !== CHALLENGE_STATUS.ACTIVE) {
    throw Object.assign(new Error('Challenge must be ACTIVE to submit proof'), { statusCode: 400 });
  }

  const participant = challenge.participants.find(
    p => p.userId.toString() === userId.toString() && ACTIVE_PARTICIPANT_STATUSES.includes(p.status)
  );
  if (!participant) throw Object.assign(new Error('Not an active participant'), { statusCode: 403 });

  const attemptCount = await ChallengeSubmission.countDocuments({ challengeId, userId });
  return ChallengeSubmission.create({
    challengeId, userId,
    proofImageUrls: data.proofImageUrls || [],
    proofText: data.proofText || '',
    attemptNumber: attemptCount + 1
  });
};

// ── Validation helpers ───────────────────────────────
const allParticipantsValidated = async (challengeId) => {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) return false;
  const ids = challenge.participants
    .filter(p => ACTIVE_PARTICIPANT_STATUSES.includes(p.status))
    .map(p => p.userId.toString());

  for (const pid of ids) {
    const sub = await ChallengeSubmission.findOne({ challengeId, userId: pid, validationScore: { $ne: null } }).sort({ attemptNumber: -1 });
    if (!sub) return false;
  }
  return true;
};

const isDeadlinePassed = (challenge) => {
  if (!challenge.endAt) return false;
  return new Date() >= new Date(challenge.endAt);
};

const canResolve = async (challengeId) => {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge) return { canResolve: false, reason: 'Challenge not found' };
  if (FINAL_STATUSES.includes(challenge.status)) return { canResolve: false, reason: 'Already finalized' };

  const deadlinePassed = isDeadlinePassed(challenge);
  const allValidated = await allParticipantsValidated(challengeId);
  if (allValidated || deadlinePassed) return { canResolve: true, reason: null };

  const ids = challenge.participants.filter(p => ACTIVE_PARTICIPANT_STATUSES.includes(p.status)).map(p => p.userId.toString());
  let submittedCount = 0;
  for (const pid of ids) {
    const sub = await ChallengeSubmission.findOne({ challengeId, userId: pid, validationScore: { $ne: null } });
    if (sub) submittedCount++;
  }
  return {
    canResolve: false,
    reason: `Waiting for submissions (${submittedCount}/${ids.length}). Deadline: ${challenge.endAt ? new Date(challenge.endAt).toLocaleString() : 'none'}`,
    submittedCount, totalParticipants: ids.length
  };
};

// ── Queries ──────────────────────────────────────────
const getChallengeById = async (challengeId) => Challenge.findById(challengeId);

// Phase 3.1.7: Only shows challenges where user is participant AND not DECLINED
const getUserChallenges = async (userId, options = {}) => {
  const { page = 1, limit = DEFAULT_PAGE_SIZE, sortBy = 'createdAt' } = options;
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (Math.max(1, page) - 1) * safeLimit;

  const filter = {
    participants: {
      $elemMatch: {
        userId: userId,
        status: { $nin: [PARTICIPANT_STATUS.DECLINED, PARTICIPANT_STATUS.LEFT] }
      }
    }
  };

  const [challenges, total] = await Promise.all([
    Challenge.find(filter).sort({ [sortBy]: -1 }).skip(skip).limit(safeLimit).lean(),
    Challenge.countDocuments(filter)
  ]);

  return {
    challenges: challenges.map(sanitizeChallenge),
    pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

const getChallenges = async (filter = {}, options = {}) => {
  const { page = 1, limit = DEFAULT_PAGE_SIZE, sortBy = 'createdAt' } = options;
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (Math.max(1, page) - 1) * safeLimit;
  const [challenges, total] = await Promise.all([
    Challenge.find(filter).sort({ [sortBy]: -1 }).skip(skip).limit(safeLimit).lean(),
    Challenge.countDocuments(filter)
  ]);
  return { challenges: challenges.map(sanitizeChallenge), pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) } };
};

const getHubChallenges = async (hubId, options = {}) => getChallenges({ hubId }, options);

const getSubmissions = async (challengeId, options = {}) => {
  const { page = 1, limit = DEFAULT_PAGE_SIZE } = options;
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (Math.max(1, page) - 1) * safeLimit;
  const [submissions, total] = await Promise.all([
    ChallengeSubmission.find({ challengeId }).sort({ submittedAt: -1 }).skip(skip).limit(safeLimit).lean(),
    ChallengeSubmission.countDocuments({ challengeId })
  ]);
  return { submissions: submissions.map(sanitizeSubmission), pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) } };
};

const getScheduledChallenges = async () => {
  const now = new Date();
  return Challenge.find({ status: CHALLENGE_STATUS.SCHEDULED, startAt: { $lte: now } });
};

const getExpiredChallenges = async () => {
  const now = new Date();
  return Challenge.find({
    status: { $in: [CHALLENGE_STATUS.ACTIVE, CHALLENGE_STATUS.SUBMISSION, CHALLENGE_STATUS.WAITING_FOR_PARTICIPANTS, CHALLENGE_STATUS.READY] },
    endAt: { $lte: now }
  });
};

// ── Sanitization ─────────────────────────────────────
const sanitizeChallenge = (c) => {
  if (!c) return null;
  const obj = c.toObject ? c.toObject() : c;
  return {
    _id: obj._id?.toString(),
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
      joinedAt: p.joinedAt || null,
      invitedAt: p.invitedAt || null,
      acceptedAt: p.acceptedAt || null,
      declinedAt: p.declinedAt || null,
      leftAt: p.leftAt || null,
    })),
    stakeXp: obj.stakeXp,
    stakeType: obj.stakeType,
    startAt: obj.startAt,
    endAt: obj.endAt,
    submissionDeadline: obj.submissionDeadline,
    winnerId: obj.winnerId?.toString() || null,
    invitedAt: obj.invitedAt || null,
    activatedAt: obj.activatedAt || null,
    resolvedAt: obj.resolvedAt || null,
    cancelledAt: obj.cancelledAt || null,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
};

const sanitizeSubmission = (s) => {
  if (!s) return null;
  const obj = s.toObject ? s.toObject() : s;
  return {
    _id: obj._id?.toString(),
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
  createChallenge, dispatchInvite, acceptInvite, declineInvite,
  leaveChallenge, startChallenge, joinChallenge, transitionState,
  createSubmission, allParticipantsValidated, isDeadlinePassed, canResolve,
  getChallengeById, getChallenges, getUserChallenges, getHubChallenges,
  getSubmissions, getScheduledChallenges, getExpiredChallenges,
  sanitizeChallenge, sanitizeSubmission, VALID_TRANSITIONS,
  ACTIVE_PARTICIPANT_STATUSES, FINAL_STATUSES
};
