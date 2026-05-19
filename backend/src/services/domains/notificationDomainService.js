const Notification = require('../../models/Notification');
const crypto = require('crypto');

// ======================================================
// NOTIFICATION DOMAIN SERVICE — Phase N1
// Owns: Notification CRUD, acknowledgement, querying, cleanup
// The SINGLE authority for notification persistence
//
// Responsibilities:
//   - Create notifications with canonical identity
//   - Retrieve notifications (paginated, filtered)
//   - Mark read / acknowledge
//   - Count unread
//   - Cleanup expired
//   - Idempotent operations (safe to repeat)
//
// Must NOT: emit socket events (that's the listener's job),
//           contain challenge/social business logic
// ======================================================

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

// ── Category mapping ─────────────────────────────────
const TYPE_CATEGORY_MAP = {
  FRIEND_REQUEST_SENT: 'SOCIAL',
  FRIEND_REQUEST_ACCEPTED: 'SOCIAL',
  FRIEND_REQUEST_DECLINED: 'SOCIAL',
  FRIEND_REMOVED: 'SOCIAL',
  CHALLENGE_CREATED: 'CHALLENGE',
  CHALLENGE_INVITED: 'CHALLENGE',
  CHALLENGE_ACCEPTED: 'CHALLENGE',
  CHALLENGE_DECLINED: 'CHALLENGE',
  CHALLENGE_CANCELLED: 'CHALLENGE',
  CHALLENGE_SUBMITTED: 'CHALLENGE',
  CHALLENGE_VALIDATED: 'CHALLENGE',
  CHALLENGE_RESOLVED: 'CHALLENGE',
  HUB_INVITE: 'HUB',
  HUB_JOINED: 'HUB',
  HUB_LEFT: 'HUB',
  HUB_KICKED: 'HUB',
  SYSTEM_ALERT: 'SYSTEM',
  SESSION_RECOVERED: 'SYSTEM',
  RECONNECT_COMPLETED: 'SYSTEM',
  VOUCHER_UNLOCKED: 'REWARD',
  REWARD_GRANTED: 'REWARD',
  TASK_COMPLETED: 'TASK',
  TASK_FAILED: 'TASK',
  TASK_EXPIRED: 'TASK',
  LEVEL_UP: 'REWARD'
};

// ── Generate trace ID ────────────────────────────────
const generateTraceId = () => `ntf-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

// ── Create Notification ──────────────────────────────
const createNotification = async (data) => {
  const {
    type, actorId, actorName, targetId, targetName,
    entityType, entityId, title, message, payload,
    expiresAt, traceId
  } = data;

  if (!type || !targetId || !title) {
    throw Object.assign(new Error('type, targetId, and title are required'), { statusCode: 400 });
  }

  const category = TYPE_CATEGORY_MAP[type] || 'SYSTEM';

  const notification = await Notification.create({
    type,
    category,
    actorId: actorId || null,
    actorName: actorName || null,
    targetId,
    targetName: targetName || null,
    entityType: entityType || null,
    entityId: entityId || null,
    title,
    message: message || '',
    payload: payload || {},
    read: false,
    acknowledged: false,
    issuedAt: new Date(),
    expiresAt: expiresAt || null,
    traceId: traceId || generateTraceId(),
    version: 1
  });

  return notification;
};

// ── Create notification for BOTH sides of an interaction ──
const createBilateral = async (baseData, actorTargetData) => {
  const { actorId, actorName, targetId, targetName, ...shared } = baseData;
  const notifications = [];

  // Notification for target (primary recipient)
  notifications.push(await createNotification({
    ...shared,
    actorId,
    actorName,
    targetId,
    targetName,
  }));

  // Notification for actor (confirmation)
  if (actorTargetData) {
    notifications.push(await createNotification({
      ...shared,
      ...actorTargetData,
      actorId: targetId,
      actorName: targetName,
      targetId: actorId,
      targetName: actorName,
    }));
  }

  return notifications;
};

// ── Get Notifications (paginated) ────────────────────
const getNotifications = async (targetId, options = {}) => {
  const {
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
    category = null,
    unreadOnly = false,
    unacknowledgedOnly = false
  } = options;

  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (Math.max(1, page) - 1) * safeLimit;

  const filter = { targetId };
  if (category) filter.category = category;
  if (unreadOnly) filter.read = false;
  if (unacknowledgedOnly) filter.acknowledged = false;

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ issuedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Notification.countDocuments(filter)
  ]);

  return {
    notifications: notifications.map(sanitizeNotification),
    pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

// ── Count Unread ─────────────────────────────────────
const getUnreadCount = async (targetId) => {
  return Notification.countDocuments({ targetId, read: false });
};

// ── Mark as Read ─────────────────────────────────────
const markRead = async (notificationId, targetId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, targetId },
    { $set: { read: true, readAt: new Date() } },
    { returnDocument: 'after' }
  );
  return notification ? sanitizeNotification(notification) : null;
};

// ── Mark All Read ────────────────────────────────────
const markAllRead = async (targetId) => {
  const result = await Notification.updateMany(
    { targetId, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
  return { modifiedCount: result.modifiedCount };
};

// ── Acknowledge ──────────────────────────────────────
const acknowledge = async (notificationId, targetId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, targetId },
    { $set: { acknowledged: true, acknowledgedAt: new Date(), read: true, readAt: new Date() } },
    { returnDocument: 'after' }
  );
  return notification ? sanitizeNotification(notification) : null;
};

// ── Delete ───────────────────────────────────────────
const deleteNotification = async (notificationId, targetId) => {
  const result = await Notification.deleteOne({ _id: notificationId, targetId });
  return result.deletedCount > 0;
};

// ── Sanitize for API response ────────────────────────
const sanitizeNotification = (n) => {
  if (!n) return null;
  const obj = n.toObject ? n.toObject() : n;
  return {
    _id: obj._id?.toString(),
    type: obj.type,
    category: obj.category,
    actorId: obj.actorId,
    actorName: obj.actorName,
    targetId: obj.targetId,
    targetName: obj.targetName,
    entityType: obj.entityType,
    entityId: obj.entityId,
    title: obj.title,
    message: obj.message,
    payload: obj.payload || {},
    read: obj.read,
    acknowledged: obj.acknowledged,
    issuedAt: obj.issuedAt,
    readAt: obj.readAt,
    acknowledgedAt: obj.acknowledgedAt,
    expiresAt: obj.expiresAt,
    traceId: obj.traceId,
    version: obj.version
  };
};

module.exports = {
  createNotification,
  createBilateral,
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  acknowledge,
  deleteNotification,
  sanitizeNotification,
  generateTraceId,
  TYPE_CATEGORY_MAP
};
