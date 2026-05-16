const BehavioralEvent = require('../models/BehavioralEvent');
const { BEHAVIORAL_EVENT_TYPES } = require('../constants/historyConstants');
const ERROR_CODES = require('../constants/errorCodes');

// ======================================================
// HISTORY SERVICE
// Owns: behavioral event persistence orchestration
// Every significant lifecycle event is recorded here
// Must NOT: render analytics or calculate progression
// ======================================================

// ── Record a new behavioral event ────────────────────
const recordEvent = async (userId, eventType, metadata = {}) => {
  // Guard: validate event type is a known constant
  if (!Object.values(BEHAVIORAL_EVENT_TYPES).includes(eventType)) {
    const err = new Error(`Unknown event type: ${eventType}`);
    err.codeName = ERROR_CODES.VALIDATION_ERROR;
    throw err;
  }

  const event = await BehavioralEvent.create({
    userId,
    eventType,
    metadata,
    occurredAt: new Date()
  });

  return event;
};

// ── Get player event timeline (paginated) ─────────────
const getPlayerHistory = async (userId, { page = 1, limit = 20 } = {}) => {
  const skip = (page - 1) * limit;

  const [events, total] = await Promise.all([
    BehavioralEvent.find({ userId })
      .sort({ occurredAt: -1 })
      .skip(skip)
      .limit(limit),
    BehavioralEvent.countDocuments({ userId })
  ]);

  return {
    events,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// ── Get events by type for a player ──────────────────
const getPlayerEventsByType = async (userId, eventType) => {
  return await BehavioralEvent.find({ userId, eventType }).sort({ occurredAt: -1 });
};

module.exports = {
  recordEvent,
  getPlayerHistory,
  getPlayerEventsByType
};
