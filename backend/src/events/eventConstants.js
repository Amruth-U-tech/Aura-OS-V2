// ======================================================
// DOMAIN EVENT CONSTANTS — Phase 3.1.6
// Deterministic, namespaced event identifiers
// Every domain event in the system is defined HERE
// Events represent COMPLETED TRUTHS — what already happened
// Phase 3.1.6: Added CHALLENGE_INVITED, CHALLENGE_ACCEPTED,
//              CHALLENGE_DECLINED, CHALLENGE_LEFT for participation lifecycle
// ======================================================

const EVENTS = {
  // ── Task/Mission Domain ─────────────────────────────
  TASK_CREATED:        'task.created',
  TASK_COMPLETED:      'task.completed',
  TASK_FAILED:         'task.failed',
  TASK_CANCELLED:      'task.cancelled',
  TASK_EXPIRED:        'task.expired',

  // ── Player Domain ──────────────────────────────────
  PLAYER_CREATED:      'player.created',
  PLAYER_XP_UPDATED:   'player.xp.updated',
  PLAYER_LEVEL_UP:     'player.levelup',
  PLAYER_TRUST_CHANGED:'player.trust.changed',
  PLAYER_PROFILE_UPDATED: 'player.profile.updated',
  PLAYER_STREAK_CHANGED: 'player.streak.changed',

  // ── Challenge Domain ───────────────────────────────
  CHALLENGE_CREATED:   'challenge.created',
  CHALLENGE_INVITED:   'challenge.invited',   // Phase 3.1.6: target receives invite
  CHALLENGE_ACCEPTED:  'challenge.accepted',  // Phase 3.1.6: target accepted invite
  CHALLENGE_DECLINED:  'challenge.declined',  // Phase 3.1.6: target declined invite
  CHALLENGE_LEFT:      'challenge.left',      // Phase 3.1.6: participant left voluntarily
  CHALLENGE_READY:     'challenge.ready',     // Phase 3.1.7: quorum met, challenge can start
  CHALLENGE_ACTIVATED: 'challenge.activated',
  CHALLENGE_JOINED:    'challenge.joined',
  CHALLENGE_SUBMITTED: 'challenge.submitted',
  CHALLENGE_VALIDATED: 'challenge.validated',
  CHALLENGE_RESOLVED:  'challenge.resolved',
  CHALLENGE_CANCELLED: 'challenge.cancelled',
  CHALLENGE_EXPIRED:   'challenge.expired',

  // ── Social Domain ─────────────────────────────────
  FRIEND_REQUEST_SENT: 'friend.request.sent',
  FRIEND_ACCEPTED:     'friend.accepted',
  FRIEND_DECLINED:     'friend.declined',
  FRIEND_REMOVED:      'friend.removed',

  // ── Hub Domain ────────────────────────────────────
  HUB_CREATED:         'hub.created',
  HUB_JOINED:          'hub.joined',
  HUB_LEFT:            'hub.left',
  HUB_CHALLENGE_CREATED: 'hub.challenge.created',

  // ── Reward Domain ─────────────────────────────────
  VOUCHER_UNLOCKED:    'voucher.unlocked',
  REWARD_GRANTED:      'reward.granted',

  // ── Notification Domain — Phase N1 ────────────────
  NOTIFICATION_CREATED:      'notification.created',
  NOTIFICATION_READ:         'notification.read',
  NOTIFICATION_ACKNOWLEDGED: 'notification.acknowledged',
};

module.exports = { EVENTS };
