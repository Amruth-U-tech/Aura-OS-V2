const FriendRequest = require('../../models/FriendRequest');
const Friendship = require('../../models/Friendship');
const { FRIEND_REQUEST_STATUS } = require('../../constants/domainConstants');
const auraEvents = require('../../events/eventBus');
const { EVENTS } = require('../../events/eventConstants');

// ======================================================
// SOCIAL DOMAIN SERVICE
// Owns: FriendRequest + Friendship CRUD & retrieval
// All storage/retrieval/validation/sanitization in ONE place
// Must NOT: contain hub or challenge logic
// ======================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// ── Send Friend Request ──────────────────────────────
const sendFriendRequest = async (senderId, receiverId, message = '') => {
  if (senderId.toString() === receiverId.toString()) {
    throw Object.assign(new Error('Cannot send friend request to yourself'), { statusCode: 400 });
  }

  // Check if already friends
  const existing = await areFriends(senderId, receiverId);
  if (existing) throw Object.assign(new Error('Already friends'), { statusCode: 409 });

  // Create request (duplicate pending is blocked by unique partial index)
  try {
    const request = await FriendRequest.create({ senderId, receiverId, message });

    // Phase 3.1: Emit domain event after DB commit
    auraEvents.emitEvent(EVENTS.FRIEND_REQUEST_SENT, {
      senderId: senderId.toString(),
      receiverId: receiverId.toString(),
      requestId: request._id.toString(),
      message
    });

    return request;
  } catch (err) {
    if (err.code === 11000) {
      throw Object.assign(new Error('Friend request already pending'), { statusCode: 409 });
    }
    throw err;
  }
};

// ── Accept Friend Request ────────────────────────────
const acceptFriendRequest = async (requestId, receiverId) => {
  const request = await FriendRequest.findById(requestId);
  if (!request) throw Object.assign(new Error('Request not found'), { statusCode: 404 });
  if (request.receiverId.toString() !== receiverId.toString()) {
    throw Object.assign(new Error('Not authorized'), { statusCode: 403 });
  }
  if (request.status !== FRIEND_REQUEST_STATUS.PENDING) {
    throw Object.assign(new Error(`Request already ${request.status.toLowerCase()}`), { statusCode: 400 });
  }

  request.status = FRIEND_REQUEST_STATUS.ACCEPTED;
  request.respondedAt = new Date();
  await request.save();

  // Phase 3.1.4: Create or reactivate friendship (handles E11000 gracefully)
  // Sort to match the stored order (userA < userB)
  const a = request.senderId.toString() < request.receiverId.toString() ? request.senderId : request.receiverId;
  const b = request.senderId.toString() < request.receiverId.toString() ? request.receiverId : request.senderId;

  try {
    // Try to reactivate an existing inactive friendship first
    const existing = await Friendship.findOneAndUpdate(
      { userA: a, userB: b },
      { $set: { isActive: true, establishedAt: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );
    if (!existing) {
      await Friendship.create({ userA: a, userB: b });
    }
  } catch (err) {
    if (err.code === 11000) {
      // Already friends — not an error, just ensure active
      await Friendship.findOneAndUpdate(
        { userA: a, userB: b },
        { $set: { isActive: true } }
      );
    } else {
      throw err;
    }
  }

  // Phase 3.1: Emit domain event
  auraEvents.emitEvent(EVENTS.FRIEND_ACCEPTED, {
    senderId: request.senderId.toString(),
    receiverId: request.receiverId.toString(),
    requestId: request._id.toString()
  });

  return request;
};

// ── Decline Friend Request ───────────────────────────
const declineFriendRequest = async (requestId, receiverId) => {
  const request = await FriendRequest.findById(requestId);
  if (!request) throw Object.assign(new Error('Request not found'), { statusCode: 404 });
  if (request.receiverId.toString() !== receiverId.toString()) {
    throw Object.assign(new Error('Not authorized'), { statusCode: 403 });
  }
  if (request.status !== FRIEND_REQUEST_STATUS.PENDING) {
    throw Object.assign(new Error(`Request already ${request.status.toLowerCase()}`), { statusCode: 400 });
  }

  request.status = FRIEND_REQUEST_STATUS.DECLINED;
  request.respondedAt = new Date();
  await request.save();

  // Phase 3.1: Emit domain event
  auraEvents.emitEvent(EVENTS.FRIEND_DECLINED, {
    senderId: request.senderId.toString(),
    receiverId: request.receiverId.toString(),
    requestId: request._id.toString()
  });

  return request;
};

// ── Remove Friendship ────────────────────────────────
const removeFriendship = async (userIdA, userIdB) => {
  // Sort to match the stored order
  const a = userIdA.toString() < userIdB.toString() ? userIdA : userIdB;
  const b = userIdA.toString() < userIdB.toString() ? userIdB : userIdA;

  const result = await Friendship.findOneAndUpdate(
    { userA: a, userB: b, isActive: true },
    { $set: { isActive: false } },
    { returnDocument: 'after' }
  );

  if (!result) throw Object.assign(new Error('Friendship not found'), { statusCode: 404 });

  // Phase 3.1.4: Clean up old ACCEPTED friend requests between these users
  // so they can send NEW friend requests to each other again.
  // The unique partial index only blocks PENDING duplicates, but stale
  // ACCEPTED records can confuse the UI and prevent clean re-requests.
  await FriendRequest.deleteMany({
    $or: [
      { senderId: userIdA, receiverId: userIdB },
      { senderId: userIdB, receiverId: userIdA }
    ],
    status: { $in: [FRIEND_REQUEST_STATUS.ACCEPTED, FRIEND_REQUEST_STATUS.DECLINED] }
  });

  return result;
};

// ── Check Friendship ─────────────────────────────────
const areFriends = async (userIdA, userIdB) => {
  const a = userIdA.toString() < userIdB.toString() ? userIdA : userIdB;
  const b = userIdA.toString() < userIdB.toString() ? userIdB : userIdA;
  const f = await Friendship.findOne({ userA: a, userB: b, isActive: true });
  return !!f;
};

// ── Get Pending Requests (inbox) ─────────────────────
const getPendingRequests = async (userId, options = {}) => {
  const { page = 1, limit = DEFAULT_PAGE_SIZE } = options;
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (Math.max(1, page) - 1) * safeLimit;

  const filter = { receiverId: userId, status: FRIEND_REQUEST_STATUS.PENDING };
  const [requests, total] = await Promise.all([
    FriendRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
    FriendRequest.countDocuments(filter)
  ]);

  return {
    requests: requests.map(sanitizeRequest),
    pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

// ── Get Friends List ─────────────────────────────────
const getFriendsList = async (userId, options = {}) => {
  const { page = 1, limit = DEFAULT_PAGE_SIZE } = options;
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (Math.max(1, page) - 1) * safeLimit;

  const filter = {
    $or: [{ userA: userId }, { userB: userId }],
    isActive: true
  };

  const [friendships, total] = await Promise.all([
    Friendship.find(filter).sort({ establishedAt: -1 }).skip(skip).limit(safeLimit).lean(),
    Friendship.countDocuments(filter)
  ]);

  // Extract friend IDs (the other person)
  const friendIds = friendships.map(f => {
    return f.userA.toString() === userId.toString() ? f.userB : f.userA;
  });

  return {
    friendIds,
    pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

// ── Get Outgoing Requests (sent by user) ─────────────
// Phase 2.4.4: Returns pending + recently accepted/declined for sender visibility
const getOutgoingRequests = async (userId, options = {}) => {
  const { page = 1, limit = DEFAULT_PAGE_SIZE } = options;
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (Math.max(1, page) - 1) * safeLimit;

  // Show: pending, or accepted/declined in last 7 days that haven't been read
  const filter = {
    senderId: userId,
    $or: [
      { status: FRIEND_REQUEST_STATUS.PENDING },
      {
        status: { $in: [FRIEND_REQUEST_STATUS.ACCEPTED, FRIEND_REQUEST_STATUS.DECLINED] },
        'metadata.senderRead': { $ne: true }
      }
    ]
  };

  const [requests, total] = await Promise.all([
    FriendRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
    FriendRequest.countDocuments(filter)
  ]);

  return {
    requests: requests.map(sanitizeRequest),
    pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

// ── Mark Request as Read (one-time consume) ──────────
// Phase 2.4.4: After sender acknowledges accepted/declined, hide the card
const markRequestRead = async (requestId, senderId) => {
  const request = await FriendRequest.findById(requestId);
  if (!request) throw Object.assign(new Error('Request not found'), { statusCode: 404 });
  if (request.senderId.toString() !== senderId.toString()) {
    throw Object.assign(new Error('Not authorized'), { statusCode: 403 });
  }

  request.metadata = { ...request.metadata, senderRead: true };
  return request.save();
};

// ── Response Sanitization ────────────────────────────
const sanitizeRequest = (req) => {
  if (!req) return null;
  const obj = req.toObject ? req.toObject() : req;
  return {
    _id: obj._id?.toString(),       // Phase 3.1.4: canonical Mongo ObjectId
    id: obj._id?.toString(),         // Backward compatibility
    senderId: obj.senderId?.toString(),
    receiverId: obj.receiverId?.toString(),
    status: obj.status,
    message: obj.message,
    senderRead: obj.metadata?.senderRead || false, // Phase 2.4.4
    createdAt: obj.createdAt,
    respondedAt: obj.respondedAt
  };
};

module.exports = {
  sendFriendRequest, acceptFriendRequest, declineFriendRequest,
  removeFriendship, areFriends, getPendingRequests, getFriendsList,
  getOutgoingRequests, markRequestRead, // Phase 2.4.4
  sanitizeRequest
};
