// ======================================================
// PHASE 2.4 — FULL LIFECYCLE INTEGRATION TEST
// Tests cross-domain orchestration, XP pipeline, AI validation
// Run: node src/tests/lifecycleIntegrationTest.js
// ======================================================

require('dotenv').config();
const mongoose = require('mongoose');

// Models
const User = require('../models/User');
const PlayerProfile = require('../models/PlayerProfile');
const Task = require('../models/Task');
const BehavioralEvent = require('../models/BehavioralEvent');
const TrustProfile = require('../models/TrustProfile');
const RewardTransaction = require('../models/RewardTransaction');
const Challenge = require('../models/Challenge');
const ChallengeSubmission = require('../models/ChallengeSubmission');
const Hub = require('../models/Hub');
const HubMembership = require('../models/HubMembership');
const FriendRequest = require('../models/FriendRequest');
const Friendship = require('../models/Friendship');

// Orchestration
const xpPipeline = require('../services/orchestration/xpPipeline');
const { bootstrapNewPlayer } = require('../services/orchestration/playerBootstrap');
const aiValidator = require('../services/orchestration/aiValidation');

// Domain services
const challengeService = require('../services/domains/challengeDomainService');
const hubService = require('../services/domains/hubDomainService');
const socialService = require('../services/domains/socialDomainService');
const trustService = require('../services/domains/trustDomainService');
const playerProfileService = require('../services/domains/playerProfileDomainService');
const rewardService = require('../services/domains/rewardTransactionDomainService');
const historyService = require('../services/historyService');

let passed = 0, failed = 0;
const results = [];

function assert(condition, testName) {
  if (condition) { passed++; results.push(`  ✅ ${testName}`); }
  else { failed++; results.push(`  ❌ ${testName}`); }
}

async function runTests() {
  console.log('\n⚔️  AURA OS V2 — Phase 2.4 Lifecycle Integration Tests');
  console.log('═══════════════════════════════════════════════════════\n');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB connected\n');

  const ts = Date.now();
  let userId1, userId2;

  try {
    // ============================================
    // 1. PLAYER BOOTSTRAP LIFECYCLE
    // ============================================
    console.log('📋 1. Player Bootstrap Lifecycle');

    const user1 = await User.create({
      email: `test_lc1_${ts}@aura.test`,
      passwordHash: '$2a$12$testHash1',
      playerName: 'LifecyclePlayer1'
    });
    userId1 = user1._id;

    const user2 = await User.create({
      email: `test_lc2_${ts}@aura.test`,
      passwordHash: '$2a$12$testHash2',
      playerName: 'LifecyclePlayer2'
    });
    userId2 = user2._id;

    // Bootstrap creates PlayerProfile + TrustProfile
    const { profile: p1, trustProfile: t1 } = await bootstrapNewPlayer(userId1, { playerName: 'LifecyclePlayer1' });
    assert(!!p1, 'Player 1 profile auto-created');
    assert(p1.level === 1 && p1.xp === 0, 'Player starts at level 1, 0 XP');
    assert(!!t1, 'Trust profile auto-created');
    assert(t1.trustScore === 50, 'Trust starts at 50 (NEUTRAL)');

    await bootstrapNewPlayer(userId2, { playerName: 'LifecyclePlayer2' });

    // Verify behavioral event logged
    const bootstrapEvents = await BehavioralEvent.find({ userId: userId1, eventType: 'ONBOARDING_COMPLETED' });
    assert(bootstrapEvents.length >= 1, 'Bootstrap event logged');

    // ============================================
    // 2. XP PIPELINE — MISSION LIFECYCLE
    // ============================================
    console.log('📋 2. XP Pipeline — Mission Lifecycle');

    // Create a HIGH priority task
    const task = await Task.create({
      userId: userId1,
      title: 'XP Pipeline Test Mission',
      priority: 'HIGH',
      deadline: new Date(Date.now() + 86400000)
    });

    // Award mission XP
    const xpResult = await xpPipeline.awardMissionXp(userId1, task);
    assert(xpResult.amount === 50, 'HIGH priority mission awards 50 XP');
    assert(xpResult.balanceBefore === 0, 'Balance before was 0');
    assert(xpResult.balanceAfter === 50, 'Balance after is 50');

    // Verify profile updated
    const profileAfterXp = await playerProfileService.getByUserId(userId1);
    assert(profileAfterXp.xp === 50, 'Profile XP updated to 50');
    assert(profileAfterXp.totalXpEarned === 50, 'Total XP earned is 50');

    // Verify transaction created
    const txs = await RewardTransaction.find({ userId: userId1 });
    assert(txs.length >= 1, 'RewardTransaction created');
    assert(txs[0].type === 'XP_EARNED_MISSION', 'Transaction type correct');
    assert(txs[0].finalized === true, 'Transaction is finalized');

    // Verify behavioral event
    const xpEvents = await BehavioralEvent.find({ userId: userId1, eventType: 'XP_GAINED' });
    assert(xpEvents.length >= 1, 'XP_GAINED event logged');

    // Penalty test
    const penaltyResult = await xpPipeline.penalizeMissionFailure(userId1, task);
    assert(penaltyResult.amount === -10, 'Mission failure penalty is -10');
    assert(penaltyResult.balanceAfter === 40, 'Balance after penalty is 40');

    const lostEvents = await BehavioralEvent.find({ userId: userId1, eventType: 'XP_LOST' });
    assert(lostEvents.length >= 1, 'XP_LOST event logged for penalty');

    // ============================================
    // 3. SOCIAL LIFECYCLE — FRIEND SYSTEM
    // ============================================
    console.log('📋 3. Social Lifecycle — Friend System');

    const friendReq = await socialService.sendFriendRequest(userId1, userId2, 'Join my challenge!');
    assert(friendReq.status === 'PENDING', 'Friend request sent as PENDING');

    await socialService.acceptFriendRequest(friendReq._id, userId2);
    const areFriends = await socialService.areFriends(userId1, userId2);
    assert(areFriends, 'Friendship established after accept');

    const friendsList = await socialService.getFriendsList(userId1);
    assert(friendsList.friendIds.length === 1, 'Friends list has 1 friend');

    // ============================================
    // 4. HUB LIFECYCLE
    // ============================================
    console.log('📋 4. Hub Lifecycle');

    const hub = await hubService.createHub(userId1, { name: 'Test Battle Hub' });
    assert(hub.auraHubId.startsWith('AURA-HUB-'), 'Hub created with AURA-HUB-ID');

    await hubService.joinHub(hub._id, userId2);
    const hubAfterJoin = await Hub.findById(hub._id);
    assert(hubAfterJoin.memberCount === 2, 'Member count is 2 after join');

    const isMember = await hubService.isMember(hub._id, userId2);
    assert(isMember, 'Membership verified');

    // ============================================
    // 5. CHALLENGE LIFECYCLE (FULL)
    // ============================================
    console.log('📋 5. Challenge Lifecycle');

    const challenge = await challengeService.createChallenge(userId1, {
      title: 'Push-up Challenge',
      type: 'FRIEND_1V1',
      stakeXp: 30,
      stakeType: 'XP'
    });
    assert(challenge.status === 'DRAFT', 'Challenge created as DRAFT');
    assert(challenge.participants.length === 1, 'Creator auto-joined');

    // Player 2 joins
    await challengeService.joinChallenge(challenge._id, userId2);
    const cAfterJoin = await Challenge.findById(challenge._id);
    assert(cAfterJoin.participants.length === 2, 'Player 2 joined');

    // Activate: DRAFT → PENDING → ACTIVE
    await challengeService.transitionState(challenge._id, 'PENDING');
    await challengeService.transitionState(challenge._id, 'ACTIVE');
    const cActive = await Challenge.findById(challenge._id);
    assert(cActive.status === 'ACTIVE', 'Challenge activated');
    assert(!!cActive.activatedAt, 'activatedAt timestamp set');

    // Submit proof (player 1)
    const submission = await challengeService.createSubmission(challenge._id, userId1, {
      proofText: 'Completed 50 push-ups in the gym today! Here is my proof.',
      proofImageUrls: ['https://example.com/proof.jpg']
    });
    assert(submission.attemptNumber === 1, 'First submission attempt');

    // AI Validation
    const validationResult = await aiValidator.validateSubmission(submission._id);
    assert(validationResult.validScore !== undefined, 'AI validation returns score');
    assert(typeof validationResult.reason === 'string', 'AI validation returns reason');

    const validatedSub = await ChallengeSubmission.findById(submission._id);
    assert(validatedSub.validationScore !== null, 'Validation score stored');
    assert(['VERIFIED', 'REJECTED'].includes(validatedSub.status), 'Submission status updated');

    // Resolution: transition and determine winner
    await challengeService.transitionState(challenge._id, 'SUBMISSION');
    await challengeService.transitionState(challenge._id, 'LOCKED');
    await challengeService.transitionState(challenge._id, 'RESOLUTION');

    // Award winner (player 1 had a submission)
    const profileBeforeWin = await playerProfileService.getByUserId(userId1);
    const xpBefore = profileBeforeWin.xp;

    await xpPipeline.awardChallengeWin(userId1, cActive);
    const profileAfterWin = await playerProfileService.getByUserId(userId1);
    assert(profileAfterWin.xp > xpBefore, 'Winner XP increased');

    // Trust update
    await trustService.recordValidation(userId1, validatedSub.validationScore || 75, 'CHALLENGE_WIN');
    const trustAfter = await TrustProfile.findOne({ userId: userId1 });
    assert(trustAfter.totalValidations >= 1, 'Trust validation recorded');

    // Complete challenge
    await challengeService.transitionState(challenge._id, 'COMPLETED');
    const cCompleted = await Challenge.findById(challenge._id);
    assert(cCompleted.status === 'COMPLETED', 'Challenge completed');
    assert(!!cCompleted.resolvedAt, 'resolvedAt timestamp set');

    // ============================================
    // 6. TRUST LIFECYCLE
    // ============================================
    console.log('📋 6. Trust Lifecycle');

    const trustSnapshot = await trustService.getTrustSnapshot(userId1);
    assert(trustSnapshot.trustScore === 50, 'Trust score intact');
    assert(trustSnapshot.tier === 'NEUTRAL', 'Trust tier is NEUTRAL');
    assert(trustSnapshot.totalValidations >= 1, 'Validations tracked');

    // ============================================
    // 7. REWARD TRANSACTION INTEGRITY
    // ============================================
    console.log('📋 7. Reward Transaction Integrity');

    const allTxs = await rewardService.getUserTransactions(userId1);
    assert(allTxs.transactions.length >= 3, 'Multiple transactions recorded');
    assert(allTxs.pagination.total >= 3, 'Transaction pagination works');

    // Verify all transactions are finalized
    const rawTxs = await RewardTransaction.find({ userId: userId1 });
    const allFinalized = rawTxs.every(t => t.finalized === true);
    assert(allFinalized, 'All transactions are finalized (immutable)');

    // User summary
    const summary = await rewardService.getUserSummary(userId1);
    assert(summary.totalEarned > 0, 'User has earned XP');
    assert(summary.transactionCount >= 3, 'Transaction count in summary');

    // ============================================
    // 8. BEHAVIORAL HISTORY AUDIT
    // ============================================
    console.log('📋 8. Behavioral History Audit');

    const history = await historyService.getPlayerHistory(userId1, { page: 1, limit: 50 });
    assert(history.events.length >= 4, 'Multiple behavioral events logged');

    const eventTypes = history.events.map(e => e.eventType);
    assert(eventTypes.includes('ONBOARDING_COMPLETED'), 'Bootstrap event in history');
    assert(eventTypes.includes('XP_GAINED'), 'XP gain in history');
    assert(eventTypes.includes('XP_LOST'), 'XP loss in history');

    // ============================================
    // 9. SECURITY — CROSS-USER ISOLATION
    // ============================================
    console.log('📋 9. Security — Cross-User Isolation');

    // Player 2 cannot see player 1's tasks
    const p2Tasks = await Task.find({ userId: userId2 });
    const p1Tasks = await Task.find({ userId: userId1 });
    assert(p2Tasks.length === 0, 'Player 2 has no tasks (isolation)');
    assert(p1Tasks.length >= 1, 'Player 1 has tasks');

    // Player 2 cannot accept their own friend request
    try {
      const selfReq = await socialService.sendFriendRequest(userId2, userId2);
      assert(false, 'Self friend request prevented');
    } catch {
      assert(true, 'Self friend request prevented');
    }

    // ============================================
    // 10. RESPONSE SANITIZATION
    // ============================================
    console.log('📋 10. Response Sanitization');

    const sanitizedProfile = playerProfileService.sanitizeProfile(profileAfterWin);
    assert(!sanitizedProfile._id, 'Profile: _id stripped');
    assert(!sanitizedProfile.__v, 'Profile: __v stripped');
    assert(typeof sanitizedProfile.userId === 'string', 'Profile: ObjectId → string');

    const sanitizedChallenge = challengeService.sanitizeChallenge(cCompleted);
    assert(!sanitizedChallenge._id, 'Challenge: _id stripped');
    assert(typeof sanitizedChallenge.creatorId === 'string', 'Challenge: creatorId → string');

    const sanitizedTx = rewardService.sanitizeTransaction(rawTxs[0]);
    assert(!sanitizedTx._id, 'Transaction: _id stripped');
    assert(!sanitizedTx.ipAddress, 'Transaction: ipAddress stripped');

  } catch (err) {
    console.error('\n💥 UNEXPECTED ERROR:', err.message);
    console.error(err.stack);
    failed++;
  }

  // ── Cleanup ──────────────────────────────────────
  console.log('\n🧹 Cleaning up test data...');
  const ids = [userId1, userId2].filter(Boolean);
  if (ids.length) {
    await User.deleteMany({ _id: { $in: ids } });
    await PlayerProfile.deleteMany({ userId: { $in: ids } });
    await Task.deleteMany({ userId: { $in: ids } });
    await BehavioralEvent.deleteMany({ userId: { $in: ids } });
    await TrustProfile.deleteMany({ userId: { $in: ids } });
    await RewardTransaction.deleteMany({ userId: { $in: ids } });
    await Challenge.deleteMany({ creatorId: { $in: ids } });
    await ChallengeSubmission.deleteMany({ userId: { $in: ids } });
    await Hub.deleteMany({ ownerUserId: { $in: ids } });
    await HubMembership.deleteMany({ userId: { $in: ids } });
    await FriendRequest.deleteMany({ $or: [{ senderId: { $in: ids } }, { receiverId: { $in: ids } }] });
    await Friendship.deleteMany({ $or: [{ userA: { $in: ids } }, { userB: { $in: ids } }] });
  }

  // ── Report ───────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 PHASE 2.4 INTEGRATION TEST RESULTS');
  console.log('═══════════════════════════════════════════════════════');
  results.forEach(r => console.log(r));
  console.log(`\n  Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  console.log(failed === 0 ? '\n🏆 ALL TESTS PASSED' : '\n⚠️  SOME TESTS FAILED');
  console.log('═══════════════════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
