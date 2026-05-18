// ======================================================
// DOMAIN CONSTANTS — Phase 3.1.7
// Challenge lifecycle corrected: Activate = Dispatch Invitation
// Added: CHALLENGE_STATUS.READY (quorum met, waiting to start)
// ======================================================

// ── 1. Auth Domain ────────────────────────────────────
const AUTH_PROVIDER = {
  LOCAL: 'LOCAL',
  DISCORD: 'DISCORD',
  GOOGLE: 'GOOGLE'
};

const AUTH_STATUS = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  BANNED: 'BANNED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION'
};

// ── 5. Friend Request Domain ──────────────────────────
const FRIEND_REQUEST_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED'
};

// ── 7. Hub Domain ─────────────────────────────────────
const HUB_VISIBILITY = {
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE',
  INVITE_ONLY: 'INVITE_ONLY'
};

const HUB_STATUS = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  SUSPENDED: 'SUSPENDED'
};

// ── 8. Hub Membership Domain ──────────────────────────
const HUB_MEMBER_ROLE = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MODERATOR: 'MODERATOR',
  MEMBER: 'MEMBER'
};

const HUB_MEMBER_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  BANNED: 'BANNED',
  LEFT: 'LEFT',
  KICKED: 'KICKED'
};

// ── 9. Hub Event Domain ───────────────────────────────
const HUB_EVENT_TYPE = {
  MEMBER_JOINED: 'MEMBER_JOINED',
  MEMBER_LEFT: 'MEMBER_LEFT',
  MEMBER_KICKED: 'MEMBER_KICKED',
  MEMBER_BANNED: 'MEMBER_BANNED',
  CHALLENGE_CREATED: 'CHALLENGE_CREATED',
  CHALLENGE_RESOLVED: 'CHALLENGE_RESOLVED',
  HUB_SETTINGS_UPDATED: 'HUB_SETTINGS_UPDATED',
  ANNOUNCEMENT: 'ANNOUNCEMENT'
};

// ── 10. Challenge Domain ──────────────────────────────
// Phase 3.1.7 Lifecycle:
//   DRAFT                → Challenge created, only visible to creator
//   WAITING_FOR_PARTICIPANTS → Invitation dispatched, target must accept
//   READY                → All required participants accepted, challenge can start
//   ACTIVE               → Challenge is live, participants submit proof
//   SUBMISSION           → All submitted, waiting for validation
//   LOCKED               → Submissions locked, in resolution
//   RESOLUTION           → Being resolved
//   COMPLETED            → Fully resolved with winner determined
//   CANCELLED            → Terminated (decline / creator cancel / too few accepted)
//   EXPIRED              → Deadline passed before activation or resolution
//   SCHEDULED            → Scheduled for future activation (startAt in future)
//   PENDING              → Legacy / transitional (kept for backward compat)
const CHALLENGE_STATUS = {
  DRAFT: 'DRAFT',
  WAITING_FOR_PARTICIPANTS: 'WAITING_FOR_PARTICIPANTS', // invitation dispatched
  READY: 'READY',                                      // Phase 3.1.7: quorum met
  SCHEDULED: 'SCHEDULED',
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  SUBMISSION: 'SUBMISSION',
  LOCKED: 'LOCKED',
  RESOLUTION: 'RESOLUTION',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED'
};

const CHALLENGE_TYPE = {
  FRIEND_1V1: 'FRIEND_1V1',
  HUB_OPEN: 'HUB_OPEN',
  HUB_TOURNAMENT: 'HUB_TOURNAMENT'
};

// ── Phase 3.1.6: Participant Status ──────────────────
// INVITED   → player was sent a challenge invite (has not responded)
// ACCEPTED  → player accepted and will participate
// DECLINED  → player declined (challenge disappears for them)
// JOINED    → creator or player who directly joined (HUB_OPEN)
// SUBMITTED → player has submitted proof
// LEFT      → player left after joining (can happen before ACTIVE)
// WINNER    → resolved as winner
// LOSER     → resolved as loser
// DISQUALIFIED → removed from challenge
const PARTICIPANT_STATUS = {
  INVITED: 'INVITED',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  JOINED: 'JOINED',
  SUBMITTED: 'SUBMITTED',
  LEFT: 'LEFT',
  WINNER: 'WINNER',
  LOSER: 'LOSER',
  DISQUALIFIED: 'DISQUALIFIED',
  WITHDRAWN: 'WITHDRAWN'
};

// ── 11. Challenge Submission Domain ───────────────────
const SUBMISSION_STATUS = {
  PENDING: 'PENDING',
  VALIDATING: 'VALIDATING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED'
};

const SUBMISSION_PROVIDER = {
  GEMINI_AI: 'GEMINI_AI',
  MANUAL: 'MANUAL',
  HEURISTIC_FALLBACK: 'HEURISTIC_FALLBACK' // Phase 2.4.3: Used when Gemini quota exceeded
};

// ── 13. Reward & XP Transaction Domain ────────────────
const TRANSACTION_TYPE = {
  // XP transactions
  XP_EARNED_MISSION: 'XP_EARNED_MISSION',
  XP_EARNED_CHALLENGE: 'XP_EARNED_CHALLENGE',
  XP_EARNED_STREAK: 'XP_EARNED_STREAK',
  XP_PENALTY_FAILURE: 'XP_PENALTY_FAILURE',
  XP_PENALTY_DECAY: 'XP_PENALTY_DECAY',
  XP_STAKE_DEDUCTED: 'XP_STAKE_DEDUCTED',
  XP_STAKE_RETURNED: 'XP_STAKE_RETURNED',
  XP_STAKE_WON: 'XP_STAKE_WON',
  // Reward transactions
  REWARD_CLAIMED: 'REWARD_CLAIMED',
  REWARD_REDEEMED: 'REWARD_REDEEMED',
  REWARD_EXPIRED: 'REWARD_EXPIRED',
  REWARD_REVOKED: 'REWARD_REVOKED',
  // Voucher transactions
  VOUCHER_CLAIMED: 'VOUCHER_CLAIMED',
  VOUCHER_EXPIRED: 'VOUCHER_EXPIRED'
};

// ── 14. Voucher Domain ────────────────────────────────
const VOUCHER_STATUS = {
  LOCKED: 'LOCKED',
  UNLOCKED: 'UNLOCKED',
  CLAIMED: 'CLAIMED',
  EXPIRED: 'EXPIRED'
};

const TRANSACTION_STATUS = {
  COMPLETED: 'COMPLETED',
  PENDING: 'PENDING',
  REVERSED: 'REVERSED',
  FAILED: 'FAILED'
};

// ── Phase D1: Discord Integration Domain ──────────────
const DISCORD_INTEGRATION_STATUS = {
  ACTIVE: 'ACTIVE',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  REFRESH_FAILED: 'REFRESH_FAILED',
  REVOKED: 'REVOKED',
  DISCONNECTED: 'DISCONNECTED',
  RECOVERING: 'RECOVERING'
};

module.exports = {
  AUTH_PROVIDER,
  AUTH_STATUS,
  FRIEND_REQUEST_STATUS,
  HUB_VISIBILITY,
  HUB_STATUS,
  HUB_MEMBER_ROLE,
  HUB_MEMBER_STATUS,
  HUB_EVENT_TYPE,
  CHALLENGE_STATUS,
  CHALLENGE_TYPE,
  PARTICIPANT_STATUS,
  SUBMISSION_STATUS,
  SUBMISSION_PROVIDER,
  TRANSACTION_TYPE,
  TRANSACTION_STATUS,
  VOUCHER_STATUS,
  DISCORD_INTEGRATION_STATUS
};
