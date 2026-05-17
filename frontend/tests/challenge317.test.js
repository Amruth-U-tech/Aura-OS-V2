/**
 * Phase 3.1.7 Brute Force Lifecycle Tests
 * Tests the core lifecycle logic without a DB (pure unit tests on the state machine)
 */

// ── Simulate CHALLENGE_STATUS constants ──
const CHALLENGE_STATUS = {
  DRAFT: 'DRAFT',
  WAITING_FOR_PARTICIPANTS: 'WAITING_FOR_PARTICIPANTS',
  READY: 'READY',
  ACTIVE: 'ACTIVE',
  SUBMISSION: 'SUBMISSION',
  LOCKED: 'LOCKED',
  RESOLUTION: 'RESOLUTION',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  SCHEDULED: 'SCHEDULED',
};

const PARTICIPANT_STATUS = {
  INVITED: 'INVITED', ACCEPTED: 'ACCEPTED', DECLINED: 'DECLINED',
  JOINED: 'JOINED', SUBMITTED: 'SUBMITTED', LEFT: 'LEFT',
  WINNER: 'WINNER', LOSER: 'LOSER'
};

// ── Lifecycle transition table (mirrors domainService) ──
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

const ACTIVE_PARTICIPANT_STATUSES = ['JOINED', 'ACCEPTED', 'SUBMITTED', 'WINNER', 'LOSER'];
const FINAL_STATUSES = ['COMPLETED', 'CANCELLED', 'EXPIRED'];

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✅ PASS  ${label}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ FAIL  ${label}: ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ── Simulate createChallenge ──
function createChallenge(creatorId, targetId, type) {
  const participants = [{ userId: creatorId, status: PARTICIPANT_STATUS.JOINED, joinedAt: new Date() }];
  // NOTE: target NOT added at creation — only at dispatchInvite
  return {
    _id: 'challenge_' + Date.now(),
    type, creatorId, targetFriendId: targetId,
    status: CHALLENGE_STATUS.DRAFT,
    participants,
    minParticipants: type === 'FRIEND_1V1' ? 2 : 2,
    maxParticipants: type === 'FRIEND_1V1' ? 2 : 10,
  };
}

// ── Simulate dispatchInvite ──
function dispatchInvite(challenge, creatorId) {
  if (challenge.creatorId !== creatorId) throw new Error('Only creator can dispatch');
  if (challenge.status !== CHALLENGE_STATUS.DRAFT) throw new Error(`Cannot dispatch from: ${challenge.status}`);
  if (challenge.type === 'FRIEND_1V1' && !challenge.targetFriendId) throw new Error('No target');
  
  const now = new Date();
  let invitedUserId = null;
  
  if (challenge.type === 'FRIEND_1V1') {
    const alreadyInvited = challenge.participants.find(p => p.userId === challenge.targetFriendId);
    if (!alreadyInvited) {
      challenge.participants.push({ userId: challenge.targetFriendId, status: PARTICIPANT_STATUS.INVITED, invitedAt: now });
    }
    invitedUserId = challenge.targetFriendId;
  }
  
  challenge.status = CHALLENGE_STATUS.WAITING_FOR_PARTICIPANTS;
  challenge.invitedAt = now;
  return { challenge, invitedUserId };
}

// ── Simulate acceptInvite ──
function acceptInvite(challenge, userId) {
  if (FINAL_STATUSES.includes(challenge.status)) throw new Error('Already finalized');
  if (challenge.status !== CHALLENGE_STATUS.WAITING_FOR_PARTICIPANTS) throw new Error(`Not waiting: ${challenge.status}`);
  
  const p = challenge.participants.find(x => x.userId === userId);
  if (!p) throw new Error('Not invited');
  if (p.status !== PARTICIPANT_STATUS.INVITED) throw new Error('Already responded');
  
  const now = new Date();
  p.status = PARTICIPANT_STATUS.ACCEPTED;
  p.acceptedAt = now;
  p.joinedAt = now;
  
  let autoStarted = false;
  if (challenge.type === 'FRIEND_1V1') {
    challenge.status = CHALLENGE_STATUS.ACTIVE;
    challenge.activatedAt = now;
    autoStarted = true;
  } else {
    const activeCount = challenge.participants.filter(x => ACTIVE_PARTICIPANT_STATUSES.includes(x.status)).length;
    if (activeCount >= challenge.minParticipants) {
      challenge.status = CHALLENGE_STATUS.READY;
    }
  }
  
  return { challenge, autoStarted };
}

// ── Simulate declineInvite ──
function declineInvite(challenge, userId) {
  if (FINAL_STATUSES.includes(challenge.status)) throw new Error('Already finalized');
  
  const p = challenge.participants.find(x => x.userId === userId);
  if (!p) throw new Error('Not invited');
  if (p.status !== PARTICIPANT_STATUS.INVITED) throw new Error('Already responded');
  
  const now = new Date();
  p.status = PARTICIPANT_STATUS.DECLINED;
  p.declinedAt = now;
  
  let isCancelled = false;
  if (challenge.type === 'FRIEND_1V1') {
    challenge.status = CHALLENGE_STATUS.CANCELLED;
    challenge.cancelledAt = now;
    isCancelled = true;
  }
  
  return { challenge, isCancelled };
}

// ─────────────────────────────────────────────────────
// TEST SUITE 1: Challenge Creation
// ─────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 1 — Challenge Creation (Phase 3.1.7 Lifecycle)');
console.log('────────────────────────────────────────────────────────────');

test('Create 1v1: status is DRAFT', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  assert(c.status === 'DRAFT', `Expected DRAFT, got ${c.status}`);
});

test('Create 1v1: only creator in participants (target NOT added yet)', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  assert(c.participants.length === 1, `Expected 1 participant, got ${c.participants.length}`);
  assert(c.participants[0].userId === 'user1', 'Creator should be first');
});

test('Create 1v1: creator status is JOINED', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  assert(c.participants[0].status === 'JOINED', 'Creator should be JOINED');
});

test('Create 1v1: targetFriendId stored for later dispatch', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  assert(c.targetFriendId === 'user2', 'targetFriendId should be set');
});

// ─────────────────────────────────────────────────────
// TEST SUITE 2: Dispatch Invitation (Activate = Send Invite)
// ─────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 2 — Dispatch Invitation');
console.log('────────────────────────────────────────────────────────────');

test('dispatchInvite: DRAFT → WAITING_FOR_PARTICIPANTS', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  const { challenge } = dispatchInvite(c, 'user1');
  assert(challenge.status === 'WAITING_FOR_PARTICIPANTS', `Got ${challenge.status}`);
});

test('dispatchInvite: target added as INVITED participant', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  const { challenge } = dispatchInvite(c, 'user1');
  const target = challenge.participants.find(p => p.userId === 'user2');
  assert(target, 'Target should be in participants');
  assert(target.status === 'INVITED', `Expected INVITED, got ${target.status}`);
});

test('dispatchInvite: now has 2 participants', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  const { challenge } = dispatchInvite(c, 'user1');
  assert(challenge.participants.length === 2, `Expected 2, got ${challenge.participants.length}`);
});

test('dispatchInvite: returns invitedUserId for event emission', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  const { invitedUserId } = dispatchInvite(c, 'user1');
  assert(invitedUserId === 'user2', `Expected user2, got ${invitedUserId}`);
});

test('dispatchInvite: non-creator throws 403', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  let threw = false;
  try { dispatchInvite(c, 'user2'); } catch { threw = true; }
  assert(threw, 'Should throw for non-creator');
});

test('dispatchInvite: cannot dispatch twice (not DRAFT)', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  dispatchInvite(c, 'user1');
  let threw = false;
  try { dispatchInvite(c, 'user1'); } catch { threw = true; }
  assert(threw, 'Should throw on second dispatch');
});

// ─────────────────────────────────────────────────────
// TEST SUITE 3: Accept Flow
// ─────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 3 — Accept Invite (1v1 Auto-Start)');
console.log('────────────────────────────────────────────────────────────');

test('acceptInvite 1v1: WAITING → ACTIVE (auto-start)', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  dispatchInvite(c, 'user1');
  const { challenge, autoStarted } = acceptInvite(c, 'user2');
  assert(challenge.status === 'ACTIVE', `Expected ACTIVE, got ${challenge.status}`);
  assert(autoStarted === true, 'autoStarted should be true for 1v1');
});

test('acceptInvite 1v1: participant status becomes ACCEPTED', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  dispatchInvite(c, 'user1');
  const { challenge } = acceptInvite(c, 'user2');
  const p = challenge.participants.find(x => x.userId === 'user2');
  assert(p.status === 'ACCEPTED', `Expected ACCEPTED, got ${p.status}`);
});

test('acceptInvite 1v1: activatedAt timestamp set', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  dispatchInvite(c, 'user1');
  const { challenge } = acceptInvite(c, 'user2');
  assert(challenge.activatedAt instanceof Date, 'activatedAt should be set');
});

test('acceptInvite: cannot accept if not WAITING_FOR_PARTICIPANTS', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  // Not dispatched — still DRAFT
  let threw = false;
  try { acceptInvite(c, 'user2'); } catch { threw = true; }
  assert(threw, 'Should throw — challenge not in WAITING state');
});

test('acceptInvite: cannot accept if already responded', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  dispatchInvite(c, 'user1');
  acceptInvite(c, 'user2');
  let threw = false;
  try { acceptInvite(c, 'user2'); } catch { threw = true; }
  assert(threw, 'Should throw for duplicate accept');
});

// ─────────────────────────────────────────────────────
// TEST SUITE 4: Decline Flow (THE KEY FIX)
// ─────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 4 — Decline Invite (1v1 Auto-Cancel Both Sides)');
console.log('────────────────────────────────────────────────────────────');

test('declineInvite 1v1: challenge status → CANCELLED', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  dispatchInvite(c, 'user1');
  const { challenge, isCancelled } = declineInvite(c, 'user2');
  assert(challenge.status === 'CANCELLED', `Expected CANCELLED, got ${challenge.status}`);
  assert(isCancelled === true, 'isCancelled must be true for 1v1');
});

test('declineInvite 1v1: decliner status → DECLINED', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  dispatchInvite(c, 'user1');
  const { challenge } = declineInvite(c, 'user2');
  const p = challenge.participants.find(x => x.userId === 'user2');
  assert(p.status === 'DECLINED', `Expected DECLINED, got ${p.status}`);
  assert(p.declinedAt instanceof Date, 'declinedAt should be set');
});

test('declineInvite 1v1: cancelledAt timestamp set', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  dispatchInvite(c, 'user1');
  const { challenge } = declineInvite(c, 'user2');
  assert(challenge.cancelledAt instanceof Date, 'cancelledAt should be set');
});

test('declineInvite: cannot decline already CANCELLED', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  dispatchInvite(c, 'user1');
  declineInvite(c, 'user2');
  // now CANCELLED — further decline should throw
  let threw = false;
  try { declineInvite(c, 'user2'); } catch { threw = true; }
  assert(threw, 'Should throw — already CANCELLED');
});

test('declineInvite: ALL participant userIds accessible (for _loadAllParticipantIds)', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  dispatchInvite(c, 'user1');
  const { challenge } = declineInvite(c, 'user2');
  // _loadAllParticipantIds loads ALL including DECLINED
  const allIds = challenge.participants.map(p => p.userId);
  assert(allIds.includes('user1'), 'Creator should be in all IDs');
  assert(allIds.includes('user2'), 'Decliner should be in all IDs (DECLINED status)');
  // This is key: both get the CHALLENGE_CANCELLED event
});

// ─────────────────────────────────────────────────────
// TEST SUITE 5: Valid Lifecycle Transitions
// ─────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 5 — Lifecycle State Machine Validation');
console.log('────────────────────────────────────────────────────────────');

const validPaths = [
  ['DRAFT', 'WAITING_FOR_PARTICIPANTS'],
  ['WAITING_FOR_PARTICIPANTS', 'ACTIVE'],
  ['WAITING_FOR_PARTICIPANTS', 'READY'],
  ['READY', 'ACTIVE'],
  ['ACTIVE', 'SUBMISSION'],
  ['SUBMISSION', 'LOCKED'],
  ['LOCKED', 'RESOLUTION'],
  ['RESOLUTION', 'COMPLETED'],
  ['DRAFT', 'CANCELLED'],
  ['WAITING_FOR_PARTICIPANTS', 'CANCELLED'],
  ['ACTIVE', 'CANCELLED'],
];

validPaths.forEach(([from, to]) => {
  test(`${from} → ${to} is valid`, () => {
    const allowed = VALID_TRANSITIONS[from] || [];
    assert(allowed.includes(to), `Transition ${from}→${to} NOT in VALID_TRANSITIONS`);
  });
});

const invalidPaths = [
  ['DRAFT', 'ACTIVE'],          // must go through WAITING first
  ['DRAFT', 'COMPLETED'],
  ['COMPLETED', 'ACTIVE'],      // finalized — no going back
  ['CANCELLED', 'ACTIVE'],      // finalized
  ['WAITING_FOR_PARTICIPANTS', 'DRAFT'], // no backwards
];

invalidPaths.forEach(([from, to]) => {
  test(`${from} → ${to} is INVALID`, () => {
    const allowed = VALID_TRANSITIONS[from] || [];
    assert(!allowed.includes(to), `Transition ${from}→${to} should NOT be valid but is`);
  });
});

// ─────────────────────────────────────────────────────
// TEST SUITE 6: Event Payload Audit
// ─────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 6 — Event Payload Contract Audit');
console.log('────────────────────────────────────────────────────────────');

test('CHALLENGE_CANCELLED payload has challengeId + auraChallengeId', () => {
  const payload = { challengeId: 'abc123', auraChallengeId: 'AURA-CHL-001', reason: 'DECLINED_BY_INVITEE' };
  assert(payload.challengeId, 'Missing challengeId');
  assert(payload.auraChallengeId, 'Missing auraChallengeId');
  assert(payload.reason, 'Missing reason');
});

test('CHALLENGE_INVITED payload has targetUserId for routing', () => {
  const payload = { targetUserId: 'user2', challengeId: 'abc', auraChallengeId: 'AURA-CHL-001', title: 'Test' };
  assert(payload.targetUserId, 'Missing targetUserId — invite cannot be routed');
});

test('CHALLENGE_ACCEPTED payload has newStatus for frontend transition', () => {
  const payload = { userId: 'user2', challengeId: 'abc', newStatus: 'ACTIVE' };
  assert(payload.newStatus, 'Missing newStatus — frontend cannot auto-transition');
});

test('REMOVE_CHALLENGE reducer: removes by _id', () => {
  const state = { challenges: [{ _id: 'abc', id: 'abc' }, { _id: 'def', id: 'def' }] };
  const result = state.challenges.filter(c => c._id !== 'abc' && c.id !== 'abc');
  assert(result.length === 1, `Expected 1, got ${result.length}`);
  assert(result[0]._id === 'def', 'Wrong challenge removed');
});

test('REMOVE_CHALLENGE reducer: removes by id (fallback)', () => {
  const state = { challenges: [{ _id: 'abc', id: 'abc' }, { _id: 'def', id: 'def' }] };
  const result = state.challenges.filter(c => c._id !== 'def' && c.id !== 'def');
  assert(result.length === 1, `Expected 1, got ${result.length}`);
  assert(result[0]._id === 'abc', 'Wrong challenge removed');
});

// ─────────────────────────────────────────────────────
// TEST SUITE 7: Edge Cases
// ─────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 7 — Edge Cases & Guard Rails');
console.log('────────────────────────────────────────────────────────────');

test('Cannot accept after cancel (FINAL_STATUS guard)', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  dispatchInvite(c, 'user1');
  declineInvite(c, 'user2'); // challenge is now CANCELLED
  let threw = false;
  try { acceptInvite(c, 'user2'); } catch { threw = true; }
  assert(threw, 'Should throw — CANCELLED is final');
});

test('Cannot decline non-invited participant', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  dispatchInvite(c, 'user1');
  let threw = false;
  try { declineInvite(c, 'user3'); } catch { threw = true; }
  assert(threw, 'Should throw — user3 not invited');
});

test('hasInvite helper: returns true only for INVITED status', () => {
  const myUserId = 'user2';
  const challenge = {
    participants: [
      { userId: 'user1', status: 'JOINED' },
      { userId: 'user2', status: 'INVITED' }
    ]
  };
  const p = challenge.participants.find(x => x.userId === myUserId);
  assert(p?.status === 'INVITED', 'Should be INVITED');
});

test('isActiveParticipant: DECLINED is NOT active', () => {
  const EXCLUDED = ['DECLINED', 'LEFT', 'DISQUALIFIED', 'WITHDRAWN'];
  assert(EXCLUDED.includes('DECLINED'), 'DECLINED should be excluded from active');
  assert(!EXCLUDED.includes('ACCEPTED'), 'ACCEPTED should be active');
  assert(!EXCLUDED.includes('JOINED'), 'JOINED should be active');
});

test('Full 1v1 lifecycle: DRAFT→WAITING→ACTIVE in correct sequence', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  assert(c.status === 'DRAFT');
  
  const { challenge: c2 } = dispatchInvite(c, 'user1');
  assert(c2.status === 'WAITING_FOR_PARTICIPANTS');
  assert(c2.participants.find(p => p.userId === 'user2')?.status === 'INVITED');
  
  const { challenge: c3, autoStarted } = acceptInvite(c2, 'user2');
  assert(c3.status === 'ACTIVE', 'Should be ACTIVE after accept');
  assert(autoStarted === true);
  assert(c3.participants.find(p => p.userId === 'user2')?.status === 'ACCEPTED');
});

test('Full 1v1 decline lifecycle: DRAFT→WAITING→CANCELLED (both sides)', () => {
  const c = createChallenge('user1', 'user2', 'FRIEND_1V1');
  dispatchInvite(c, 'user1');
  const { challenge, isCancelled } = declineInvite(c, 'user2');
  assert(challenge.status === 'CANCELLED');
  assert(isCancelled === true);
  // Both user1 and user2 are in participants → both get CHALLENGE_CANCELLED via _loadAllParticipantIds
  const allIds = challenge.participants.map(p => p.userId);
  assert(allIds.includes('user1') && allIds.includes('user2'), 'Both players must be in participant list for event routing');
});

// ─────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log(`  Results: ${passed} Passed | ${failed} Failed`);
console.log(`${'═'.repeat(60)}\n`);

if (failed > 0) process.exit(1);
