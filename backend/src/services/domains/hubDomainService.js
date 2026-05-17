const Hub = require('../../models/Hub');
const HubMembership = require('../../models/HubMembership');
const HubEvent = require('../../models/HubEvent');
const { HUB_MEMBER_ROLE, HUB_MEMBER_STATUS, HUB_EVENT_TYPE } = require('../../constants/domainConstants');
const auraEvents = require('../../events/eventBus');
const { EVENTS } = require('../../events/eventConstants');

// ======================================================
// HUB DOMAIN SERVICE
// Owns: Hub + HubMembership + HubEvent CRUD & retrieval
// All storage/retrieval/validation/sanitization in ONE place
// Must NOT: contain challenge logic or Discord orchestration
// ======================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// ── Create Hub ───────────────────────────────────────
const createHub = async (ownerUserId, data) => {
  const hub = await Hub.create({
    name: data.name,
    description: data.description || '',
    ownerUserId,
    visibility: data.visibility || 'INVITE_ONLY',
    region: data.region || null,
    timezone: data.timezone || 'Asia/Kolkata',
    maxMembers: data.maxMembers || 50
  });

  // Auto-join owner as OWNER role
  await HubMembership.create({
    hubId: hub._id,
    userId: ownerUserId,
    role: HUB_MEMBER_ROLE.OWNER,
    status: HUB_MEMBER_STATUS.ACTIVE
  });

  // Log creation event
  await HubEvent.create({
    hubId: hub._id,
    eventType: HUB_EVENT_TYPE.MEMBER_JOINED,
    actorUserId: ownerUserId,
    payload: { role: HUB_MEMBER_ROLE.OWNER, action: 'HUB_CREATED' }
  });

  // Phase 3.1: Emit domain event
  auraEvents.emitEvent(EVENTS.HUB_CREATED, {
    hubId: hub._id.toString(),
    auraHubId: hub.auraHubId,
    name: hub.name,
    ownerId: ownerUserId.toString(),
    visibility: hub.visibility
  });

  return hub;
};

// ── Get Hub by ID (supports Mongo _id or auraHubId) ─
// Phase 2.4.4: Allows frontend to always use auraHubId
const getHubById = async (hubId) => {
  // Try Mongo ObjectId first, then auraHubId
  const mongoose = require('mongoose');
  if (mongoose.Types.ObjectId.isValid(hubId)) {
    const hub = await Hub.findById(hubId);
    if (hub) return hub;
  }
  return Hub.findOne({ auraHubId: hubId });
};

// ── Get Hub by Aura Hub ID ───────────────────────────
const getHubByAuraId = async (auraHubId) => {
  return Hub.findOne({ auraHubId });
};

// ── Get Hub by Invite Code ───────────────────────────
const getHubByInviteCode = async (inviteCode) => {
  return Hub.findOne({ inviteCode, status: 'ACTIVE' });
};

// ── Join Hub ─────────────────────────────────────────
// Phase 2.4.2: Respects hub visibility for join behavior
// PUBLIC = instant join, INVITE_ONLY = pending approval, PRIVATE = direct invite only
const joinHub = async (hubIdParam, userId) => {
  const hub = await getHubById(hubIdParam);
  if (!hub) throw Object.assign(new Error('Hub not found'), { statusCode: 404 });
  if (hub.status !== 'ACTIVE') throw Object.assign(new Error('Hub is not active'), { statusCode: 400 });
  if (hub.memberCount >= hub.maxMembers) throw Object.assign(new Error('Hub is full'), { statusCode: 400 });

  // Phase 2.4.4: Always use Mongo _id for membership/event queries
  const hubId = hub._id;

  // Check existing membership
  const existing = await HubMembership.findOne({ hubId, userId });
  if (existing && existing.status === HUB_MEMBER_STATUS.ACTIVE) {
    throw Object.assign(new Error('Already a member'), { statusCode: 409 });
  }
  if (existing && existing.status === HUB_MEMBER_STATUS.PENDING) {
    throw Object.assign(new Error('Join request already pending'), { statusCode: 409 });
  }
  if (existing && existing.status === HUB_MEMBER_STATUS.BANNED) {
    throw Object.assign(new Error('You are banned from this hub'), { statusCode: 403 });
  }
  if (existing && existing.status === HUB_MEMBER_STATUS.REJECTED) {
    // Allow re-request after rejection
    existing.status = HUB_MEMBER_STATUS.PENDING;
    existing.joinedAt = new Date();
    existing.leftAt = null;
    await existing.save();

    await HubEvent.create({
      hubId,
      eventType: HUB_EVENT_TYPE.MEMBER_JOINED,
      actorUserId: userId,
      payload: { action: 'RE_REQUESTED', visibility: hub.visibility }
    });

    return { membership: existing, status: 'PENDING', message: 'Join request resubmitted for approval' };
  }

  // Determine join behavior based on hub visibility
  if (hub.visibility === 'PRIVATE') {
    throw Object.assign(new Error('This hub is private — direct invite required'), { statusCode: 403 });
  }

  const isPending = hub.visibility === 'INVITE_ONLY';
  const memberStatus = isPending ? HUB_MEMBER_STATUS.PENDING : HUB_MEMBER_STATUS.ACTIVE;

  // Create or reactivate membership
  let membership;
  if (existing) {
    existing.status = memberStatus;
    existing.role = HUB_MEMBER_ROLE.MEMBER;
    existing.joinedAt = new Date();
    existing.leftAt = null;
    membership = await existing.save();
  } else {
    membership = await HubMembership.create({
      hubId, userId,
      role: HUB_MEMBER_ROLE.MEMBER,
      status: memberStatus
    });
  }

  // Only increment member count for instant joins (PUBLIC)
  if (!isPending) {
    await Hub.findByIdAndUpdate(hubId, { $inc: { memberCount: 1 } });
  }

  // Log event
  await HubEvent.create({
    hubId,
    eventType: HUB_EVENT_TYPE.MEMBER_JOINED,
    actorUserId: userId,
    payload: { action: isPending ? 'REQUESTED' : 'JOINED', visibility: hub.visibility }
  });

  // Phase 3.1: Emit domain event for active joins
  if (!isPending) {
    auraEvents.emitEvent(EVENTS.HUB_JOINED, {
      hubId: hubId.toString(),
      auraHubId: hub.auraHubId,
      name: hub.name,
      userId: userId.toString(),
      memberCount: (hub.memberCount || 0) + 1
    });
  }

  return {
    membership,
    status: isPending ? 'PENDING' : 'ACTIVE',
    message: isPending ? 'Join request submitted for owner approval' : 'Joined hub'
  };
};

// ── Approve Membership (owner only) ──────────────────
const approveMembership = async (hubId, targetUserId, ownerUserId) => {
  const hub = await Hub.findById(hubId);
  if (!hub) throw Object.assign(new Error('Hub not found'), { statusCode: 404 });
  if (hub.ownerUserId.toString() !== ownerUserId.toString()) {
    throw Object.assign(new Error('Only the hub owner can approve members'), { statusCode: 403 });
  }

  const membership = await HubMembership.findOne({ hubId, userId: targetUserId, status: HUB_MEMBER_STATUS.PENDING });
  if (!membership) {
    throw Object.assign(new Error('No pending membership found'), { statusCode: 404 });
  }

  membership.status = HUB_MEMBER_STATUS.ACTIVE;
  await membership.save();

  await Hub.findByIdAndUpdate(hubId, { $inc: { memberCount: 1 } });

  await HubEvent.create({
    hubId,
    eventType: HUB_EVENT_TYPE.MEMBER_JOINED,
    actorUserId: ownerUserId,
    payload: { action: 'APPROVED', targetUserId: targetUserId.toString() }
  });

  return membership;
};

// ── Reject Membership (owner only) ───────────────────
const rejectMembership = async (hubId, targetUserId, ownerUserId) => {
  const hub = await Hub.findById(hubId);
  if (!hub) throw Object.assign(new Error('Hub not found'), { statusCode: 404 });
  if (hub.ownerUserId.toString() !== ownerUserId.toString()) {
    throw Object.assign(new Error('Only the hub owner can reject members'), { statusCode: 403 });
  }

  const membership = await HubMembership.findOne({ hubId, userId: targetUserId, status: HUB_MEMBER_STATUS.PENDING });
  if (!membership) {
    throw Object.assign(new Error('No pending membership found'), { statusCode: 404 });
  }

  membership.status = HUB_MEMBER_STATUS.REJECTED;
  await membership.save();

  await HubEvent.create({
    hubId,
    eventType: HUB_EVENT_TYPE.MEMBER_LEFT,
    actorUserId: ownerUserId,
    payload: { action: 'REJECTED', targetUserId: targetUserId.toString() }
  });

  return membership;
};

// ── Get Pending Memberships (for owner approval UI) ──
const getPendingMemberships = async (hubId, options = {}) => {
  const { page = 1, limit = DEFAULT_PAGE_SIZE } = options;
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (Math.max(1, page) - 1) * safeLimit;

  const filter = { hubId, status: HUB_MEMBER_STATUS.PENDING };

  const [members, total] = await Promise.all([
    HubMembership.find(filter)
      .sort({ joinedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    HubMembership.countDocuments(filter)
  ]);

  return {
    members: members.map(sanitizeMembership),
    pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

// ── Leave Hub ────────────────────────────────────────
const leaveHub = async (hubId, userId) => {
  const membership = await HubMembership.findOne({ hubId, userId, status: HUB_MEMBER_STATUS.ACTIVE });
  if (!membership) throw Object.assign(new Error('Not a member'), { statusCode: 404 });
  if (membership.role === HUB_MEMBER_ROLE.OWNER) {
    throw Object.assign(new Error('Owner cannot leave — transfer ownership first'), { statusCode: 400 });
  }

  membership.status = HUB_MEMBER_STATUS.LEFT;
  membership.leftAt = new Date();
  await membership.save();

  await Hub.findByIdAndUpdate(hubId, { $inc: { memberCount: -1 } });

  await HubEvent.create({
    hubId,
    eventType: HUB_EVENT_TYPE.MEMBER_LEFT,
    actorUserId: userId
  });

  // Phase 3.1: Emit domain event
  const hub = await Hub.findById(hubId).select('auraHubId name').lean();
  auraEvents.emitEvent(EVENTS.HUB_LEFT, {
    hubId: hubId.toString(),
    auraHubId: hub?.auraHubId,
    name: hub?.name,
    userId: userId.toString()
  });

  return membership;
};

// ── Get Hub Members (paginated) ──────────────────────
const getHubMembers = async (hubId, options = {}) => {
  const { page = 1, limit = DEFAULT_PAGE_SIZE } = options;
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (Math.max(1, page) - 1) * safeLimit;

  const filter = { hubId, status: HUB_MEMBER_STATUS.ACTIVE };

  const [members, total] = await Promise.all([
    HubMembership.find(filter)
      .sort({ role: 1, joinedAt: 1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    HubMembership.countDocuments(filter)
  ]);

  return {
    members: members.map(sanitizeMembership),
    pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

// ── Get User's Hubs ──────────────────────────────────
const getUserHubs = async (userId, options = {}) => {
  const { page = 1, limit = DEFAULT_PAGE_SIZE } = options;
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (Math.max(1, page) - 1) * safeLimit;

  const memberships = await HubMembership.find({ userId, status: HUB_MEMBER_STATUS.ACTIVE })
    .sort({ joinedAt: -1 })
    .skip(skip)
    .limit(safeLimit)
    .lean();

  const hubIds = memberships.map(m => m.hubId);
  const hubs = await Hub.find({ _id: { $in: hubIds } }).lean();

  // Phase 2.4.4: Batch-load owner profiles for display names
  const PlayerProfile = require('../../models/PlayerProfile');
  const ownerIds = [...new Set(hubs.map(h => h.ownerUserId.toString()))];
  const ownerProfiles = await PlayerProfile.find({ userId: { $in: ownerIds } }).lean();
  const ownerMap = {};
  ownerProfiles.forEach(p => { ownerMap[p.userId.toString()] = p; });

  const total = await HubMembership.countDocuments({ userId, status: HUB_MEMBER_STATUS.ACTIVE });

  return {
    hubs: hubs.map(h => sanitizeHub(h, ownerMap[h.ownerUserId.toString()])),
    pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

// ── Get Hub Events (paginated) ───────────────────────
const getHubEvents = async (hubId, options = {}) => {
  const { page = 1, limit = DEFAULT_PAGE_SIZE } = options;
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (Math.max(1, page) - 1) * safeLimit;

  const [events, total] = await Promise.all([
    HubEvent.find({ hubId })
      .sort({ occurredAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    HubEvent.countDocuments({ hubId })
  ]);

  return {
    events,
    pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

// ── Validate Membership ──────────────────────────────
const isMember = async (hubId, userId) => {
  const m = await HubMembership.findOne({ hubId, userId, status: HUB_MEMBER_STATUS.ACTIVE });
  return !!m;
};

// ── Response Sanitization ────────────────────────────
// Phase 2.4.4: Enriched with owner identity (displayName + avatar)
const sanitizeHub = (hub, ownerProfile = null) => {
  if (!hub) return null;
  const obj = hub.toObject ? hub.toObject() : hub;
  return {
    id: obj._id?.toString(),
    auraHubId: obj.auraHubId,
    name: obj.name,
    description: obj.description,
    ownerUserId: obj.ownerUserId?.toString(),
    // Phase 2.4.4: Owner identity for rendering
    ownerDisplayName: ownerProfile?.displayName || obj.ownerDisplayName || null,
    ownerAvatar: ownerProfile?.avatar || obj.ownerAvatar || null,
    visibility: obj.visibility,
    status: obj.status,
    memberCount: obj.memberCount,
    maxMembers: obj.maxMembers,
    inviteCode: obj.inviteCode,
    region: obj.region,
    timezone: obj.timezone,
    discordLinked: !!obj.discordGuildId,
    createdAt: obj.createdAt
  };
};

const sanitizeMembership = (m) => {
  if (!m) return null;
  const obj = m.toObject ? m.toObject() : m;
  return {
    userId: obj.userId?.toString(),
    role: obj.role,
    status: obj.status,
    joinedAt: obj.joinedAt
  };
};

module.exports = {
  createHub, getHubById, getHubByAuraId, getHubByInviteCode,
  joinHub, leaveHub, approveMembership, rejectMembership,
  getPendingMemberships, getHubMembers, getUserHubs, getHubEvents,
  isMember, sanitizeHub, sanitizeMembership
};
