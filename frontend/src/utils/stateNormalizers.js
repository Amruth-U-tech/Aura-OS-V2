// ======================================================
// STATE NORMALIZERS — Phase 3.1.1
// Deterministic normalization for ALL context state
// EVERY payload entering context MUST pass through these
//
// Rules:
// 1. Arrays MUST always be arrays — never null/undefined/object
// 2. Objects MUST always have required shape fields
// 3. Nulls/malformed entries are stripped silently
// 4. Safe defaults are returned for empty/missing data
// ======================================================

// ── Array Guard ──────────────────────────────────────
// Guarantees the output is ALWAYS an array
export const safeArray = (input) => {
  if (Array.isArray(input)) return input;
  if (input === null || input === undefined) return [];
  // Handle wrapped responses: { challenges: [...] }, { friends: [...] }, etc.
  if (typeof input === 'object') {
    const keys = Object.keys(input);
    for (const key of keys) {
      if (Array.isArray(input[key])) return input[key];
    }
    return [];
  }
  return [];
};

// ── Challenge Normalization ──────────────────────────
// Phase 3.1.6: Full participant lifecycle shape
export const normalizeParticipant = (p) => {
  if (!p || typeof p !== 'object') return null;
  return {
    userId: p.userId || null,
    status: p.status || 'JOINED',
    displayName: p.displayName || null,
    auraPlayerId: p.auraPlayerId || null,
    avatar: p.avatar || null,
    joinedAt: p.joinedAt || null,
    invitedAt: p.invitedAt || null,
    acceptedAt: p.acceptedAt || null,
    declinedAt: p.declinedAt || null,
    leftAt: p.leftAt || null,
  };
};

export const normalizeChallenge = (c) => {
  if (!c || typeof c !== 'object') return null;
  const _id = c._id || c.id || null;
  return {
    _id,
    id: _id,                                              // Phase 3.1.5: mirror for backward compat
    auraChallengeId: c.auraChallengeId || null,
    title: c.title || 'Untitled Challenge',
    description: c.description || '',
    type: c.type || 'FRIEND_1V1',
    status: c.status || 'DRAFT',
    creatorId: c.creatorId || null,
    targetFriendId: c.targetFriendId || null,
    hubId: c.hubId || null,
    winnerId: c.winnerId || null,
    winnerName: c.winnerName || null,
    // Phase 3.1.6: Normalize all participant lifecycle fields
    participants: safeArray(c.participants).map(normalizeParticipant).filter(Boolean),
    submissions: safeArray(c.submissions),
    stakeXp: typeof c.stakeXp === 'number' ? c.stakeXp : 0,
    stakeType: c.stakeType || 'XP',
    startAt: c.startAt || null,
    endAt: c.endAt || null,
    submissionDeadline: c.submissionDeadline || null,
    activatedAt: c.activatedAt || null,
    resolvedAt: c.resolvedAt || null,
    createdAt: c.createdAt || null,
    updatedAt: c.updatedAt || null,
    routing: c.routing || null,
    canResolve: !!c.canResolve,
    resolveBlockReason: c.resolveBlockReason || null,
    submittedCount: c.submittedCount ?? null,
    totalParticipants: c.totalParticipants ?? null,
  };
};

export const normalizeChallengeArray = (payload) => {
  const arr = safeArray(payload);
  return arr.map(normalizeChallenge).filter(Boolean);
};

// Phase 3.1.6: Participation state helpers (pure functions — no side effects)
// Used in ChallengesPage to derive UI state from canonical data

/** Get current user's participant entry from a challenge */
export const getMyParticipant = (challenge, myUserId) => {
  if (!challenge?.participants || !myUserId) return null;
  return challenge.participants.find(p => p.userId === myUserId) || null;
};

/** Check if user is an active (non-declined, non-left) participant */
export const isActiveParticipant = (challenge, myUserId) => {
  const p = getMyParticipant(challenge, myUserId);
  if (!p) return false;
  return !['DECLINED', 'LEFT', 'DISQUALIFIED', 'WITHDRAWN'].includes(p.status);
};

/** Check if user has a pending invite to this challenge */
export const hasInvite = (challenge, myUserId) => {
  const p = getMyParticipant(challenge, myUserId);
  return p?.status === 'INVITED';
};

/** Get count of active (accepted/joined) participants */
export const getActiveParticipantCount = (challenge) => {
  if (!challenge?.participants) return 0;
  return challenge.participants.filter(
    p => ['JOINED', 'ACCEPTED', 'SUBMITTED', 'WINNER', 'LOSER'].includes(p.status)
  ).length;
};



// ── Friend Normalization ─────────────────────────────
export const normalizeFriend = (f) => {
  if (!f || typeof f !== 'object') return null;
  return {
    friendId: f.friendId || f._id || f.userId || null,
    auraPlayerId: f.auraPlayerId || null,
    displayName: f.displayName || f.playerName || 'Player',
    avatarUrl: f.avatarUrl || null,
    level: typeof f.level === 'number' ? f.level : 1,
    trustTier: f.trustTier || 'NEUTRAL',
    isOnline: !!f.isOnline,
  };
};

export const normalizeFriendArray = (payload) => {
  const arr = safeArray(payload);
  return arr.map(normalizeFriend).filter(Boolean);
};

// ── Friend Request Normalization ─────────────────────
export const normalizeRequest = (r) => {
  if (!r || typeof r !== 'object') return null;
  return {
    _id: r._id || r.id || null,
    senderId: r.senderId || null,
    receiverId: r.receiverId || null,
    senderName: r.senderName || r.displayName || 'Player',
    receiverName: r.receiverName || 'Player',
    message: r.message || '',
    status: r.status || 'PENDING',
    createdAt: r.createdAt || null,
  };
};

export const normalizeRequestArray = (payload) => {
  const arr = safeArray(payload);
  return arr.map(normalizeRequest).filter(Boolean);
};

// ── Hub Normalization ────────────────────────────────
export const normalizeHub = (h) => {
  if (!h || typeof h !== 'object') return null;
  return {
    _id: h._id || h.id || null,
    auraHubId: h.auraHubId || null,
    name: h.name || 'Unnamed Hub',
    description: h.description || '',
    visibility: h.visibility || 'PUBLIC',
    memberCount: typeof h.memberCount === 'number' ? h.memberCount : 0,
    maxMembers: typeof h.maxMembers === 'number' ? h.maxMembers : 50,
    ownerUserId: h.ownerUserId || null,
    ownerName: h.ownerName || null,
    status: h.status || 'ACTIVE',
  };
};

export const normalizeHubArray = (payload) => {
  const arr = safeArray(payload);
  return arr.map(normalizeHub).filter(Boolean);
};

// ── Profile Normalization ────────────────────────────
export const normalizeProfile = (p) => {
  if (!p || typeof p !== 'object') return null;
  return {
    _id: p._id || p.id || null,
    auraPlayerId: p.auraPlayerId || null,
    userId: p.userId || null,
    displayName: p.displayName || p.playerName || 'Player',
    bio: p.bio || '',
    avatarUrl: p.avatarUrl || null,
    xp: typeof p.xp === 'number' ? p.xp : 0,
    level: typeof p.level === 'number' ? p.level : 1,
    weeklyXp: typeof p.weeklyXp === 'number' ? p.weeklyXp : 0,
    trustScore: typeof p.trustScore === 'number' ? p.trustScore : 50,
    trustTier: p.trustTier || 'NEUTRAL',
    streak: typeof p.streak === 'number' ? p.streak : 0,
    skills: safeArray(p.skills),
    friendCount: typeof p.friendCount === 'number' ? p.friendCount : 0,
    hubCount: typeof p.hubCount === 'number' ? p.hubCount : 0,
    challengeWins: typeof p.challengeWins === 'number' ? p.challengeWins : 0,
    challengeLosses: typeof p.challengeLosses === 'number' ? p.challengeLosses : 0,
  };
};

// ── Leaderboard Player Normalization ─────────────────
export const normalizeLeaderboardPlayer = (p) => {
  if (!p || typeof p !== 'object') return null;
  return {
    auraPlayerId: p.auraPlayerId || null,
    displayName: p.displayName || 'Player',
    xp: typeof p.xp === 'number' ? p.xp : 0,
    weeklyXp: typeof p.weeklyXp === 'number' ? p.weeklyXp : 0,
    level: typeof p.level === 'number' ? p.level : 1,
    trustTier: p.trustTier || 'NEUTRAL',
    avatarUrl: p.avatarUrl || null,
  };
};

export const normalizeLeaderboardArray = (payload) => {
  const arr = safeArray(payload);
  return arr.map(normalizeLeaderboardPlayer).filter(Boolean);
};

// ── Safe Collection Mutations ────────────────────────
// Immutable, deduplicated, order-preserving operations

// Append item if not already present (by idField)
export const safeAppend = (arr, item, idField = '_id') => {
  const safe = safeArray(arr);
  if (!item || !item[idField]) return safe;
  const exists = safe.some(x => x[idField] === item[idField]);
  if (exists) return safe;
  return [...safe, item];
};

// Update an item in-place by idField, merging fields
export const safeUpdate = (arr, update, idField = '_id') => {
  const safe = safeArray(arr);
  if (!update || !update[idField]) return safe;
  let found = false;
  const result = safe.map(x => {
    if (x[idField] === update[idField]) {
      found = true;
      return { ...x, ...update };
    }
    return x;
  });
  return found ? result : safe;
};

// Remove an item by idField
export const safeRemove = (arr, id, idField = '_id') => {
  const safe = safeArray(arr);
  if (!id) return safe;
  return safe.filter(x => x[idField] !== id);
};
