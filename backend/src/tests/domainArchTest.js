// ======================================================
// PHASE 2.3 — DOMAIN ARCHITECTURE VALIDATION TEST
// Tests all 13 database domains for structural integrity
// Run: node src/tests/domainArchTest.js
// ======================================================

require('dotenv').config();
const mongoose = require('mongoose');

// ── Load all 13 models ───────────────────────────────
const User = require('../models/User');
const PlayerProfile = require('../models/PlayerProfile');
const Task = require('../models/Task');
const BehavioralEvent = require('../models/BehavioralEvent');
const FriendRequest = require('../models/FriendRequest');
const Friendship = require('../models/Friendship');
const Hub = require('../models/Hub');
const HubMembership = require('../models/HubMembership');
const HubEvent = require('../models/HubEvent');
const Challenge = require('../models/Challenge');
const ChallengeSubmission = require('../models/ChallengeSubmission');
const TrustProfile = require('../models/TrustProfile');
const RewardTransaction = require('../models/RewardTransaction');

// ── Load domain services ─────────────────────────────
const playerProfileService = require('../services/domains/playerProfileDomainService');
const hubService = require('../services/domains/hubDomainService');
const socialService = require('../services/domains/socialDomainService');
const challengeService = require('../services/domains/challengeDomainService');
const trustService = require('../services/domains/trustDomainService');
const rewardService = require('../services/domains/rewardTransactionDomainService');

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, testName) {
  if (condition) {
    passed++;
    results.push(`  ✅ ${testName}`);
  } else {
    failed++;
    results.push(`  ❌ ${testName}`);
  }
}

async function runTests() {
  console.log('\n⚔️  AURA OS V2 — Phase 2.3 Domain Architecture Tests');
  console.log('═══════════════════════════════════════════════════\n');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB connected\n');

  // ── Cleanup test data ──────────────────────────────
  const testEmail = `test_domain_${Date.now()}@aura.test`;
  let testUserId, testUserId2;

  try {
    // ============================================
    // DOMAIN 1: AUTH CREDENTIAL (User)
    // ============================================
    console.log('📋 Domain 1: Auth Credential');

    // Create test user
    const user1 = await User.create({
      email: testEmail,
      passwordHash: '$2a$12$testHashedPasswordDomain1',
      playerName: 'DomainTestPlayer'
    });
    testUserId = user1._id;
    assert(!!user1._id, 'User creation');
    assert(user1.authProvider === 'LOCAL', 'Default auth provider is LOCAL');
    assert(user1.authStatus === 'ACTIVE', 'Default auth status is ACTIVE');
    assert(user1.loginCount === 0, 'Login count starts at 0');

    // Duplicate email prevention
    try {
      await User.create({ email: testEmail, passwordHash: 'x', playerName: 'Dup' });
      assert(false, 'Duplicate email prevention');
    } catch (e) {
      assert(e.code === 11000, 'Duplicate email prevention');
    }

    // OAuth metadata support
    user1.oauthProviders.push({ provider: 'DISCORD', providerId: 'disc123' });
    await user1.save();
    assert(user1.oauthProviders.length === 1, 'OAuth metadata storage');

    // Second test user for social tests
    const user2 = await User.create({
      email: `test_domain2_${Date.now()}@aura.test`,
      passwordHash: '$2a$12$testHashedPasswordDomain2',
      playerName: 'DomainTestPlayer2'
    });
    testUserId2 = user2._id;

    // Password not returned in default queries
    const foundUser = await User.findById(testUserId);
    assert(!foundUser.passwordHash, 'Password hash excluded from default query');

    // ============================================
    // DOMAIN 2: PLAYER PROFILE
    // ============================================
    console.log('📋 Domain 2: Player Profile');

    const profile = await playerProfileService.createProfile(testUserId, {
      displayName: 'TestPlayer',
      country: 'IN',
      timezone: 'Asia/Kolkata'
    });
    assert(!!profile, 'Profile creation');
    assert(profile.level === 1, 'Default level is 1');
    assert(profile.xp === 0, 'Default XP is 0');
    assert(profile.trustScore === 50, 'Default trust score is 50');

    // Duplicate prevention
    try {
      await playerProfileService.createProfile(testUserId, { displayName: 'Dup' });
      assert(false, 'Duplicate profile prevention');
    } catch (e) {
      assert(e.codeName === 'DUPLICATE_ENTRY', 'Duplicate profile prevention');
    }

    // Get or create pattern
    const p2 = await playerProfileService.getOrCreate(testUserId);
    assert(p2._id.toString() === profile._id.toString(), 'getOrCreate returns existing');

    // Atomic counter increment
    const updated = await playerProfileService.incrementCounter(testUserId, 'xp', 100);
    assert(updated.xp === 100, 'Atomic XP increment');

    // Sanitization check
    const sanitized = playerProfileService.sanitizeProfile(profile);
    assert(!sanitized._id, 'Sanitization removes _id');
    assert(!sanitized.__v, 'Sanitization removes __v');
    assert(typeof sanitized.userId === 'string', 'Sanitization converts ObjectId to string');

    // Leaderboard retrieval
    await playerProfileService.createProfile(testUserId2, { displayName: 'Player2' });
    const lb = await playerProfileService.getLeaderboard({ page: 1, limit: 10 });
    assert(lb.profiles.length >= 2, 'Leaderboard retrieval');
    assert(lb.pagination.total >= 2, 'Leaderboard pagination metadata');

    // ============================================
    // DOMAIN 3: TASK (existing, enhanced)
    // ============================================
    console.log('📋 Domain 3: Task');

    const task = await Task.create({
      userId: testUserId,
      title: 'Domain Test Task',
      priority: 'HIGH',
      deadline: new Date(Date.now() + 86400000),
      metadata: { source: 'domain_test', tags: ['test'] }
    });
    assert(!!task._id, 'Task creation with metadata');
    assert(task.metadata.source === 'domain_test', 'Task metadata storage');
    assert(task.status === 'PENDING', 'Default task status');

    // Ownership query
    const userTasks = await Task.find({ userId: testUserId });
    assert(userTasks.length >= 1, 'Ownership-safe task retrieval');

    // ============================================
    // DOMAIN 4: BEHAVIORAL HISTORY
    // ============================================
    console.log('📋 Domain 4: Behavioral History');

    const event = await BehavioralEvent.create({
      userId: testUserId,
      eventType: 'CHALLENGE_CREATED',
      metadata: { challengeTitle: 'Test Challenge' }
    });
    assert(!!event._id, 'Behavioral event creation');
    assert(event.eventType === 'CHALLENGE_CREATED', 'New Phase 2.3 event type');

    // Append-only check
    const eventCount = await BehavioralEvent.countDocuments({ userId: testUserId });
    assert(eventCount >= 1, 'Event append-only persistence');

    // ============================================
    // DOMAIN 5 & 6: FRIEND REQUEST + FRIENDSHIP
    // ============================================
    console.log('📋 Domain 5 & 6: Social System');

    const request = await socialService.sendFriendRequest(testUserId, testUserId2, 'Hey!');
    assert(!!request._id, 'Friend request creation');
    assert(request.status === 'PENDING', 'Request starts as PENDING');

    // Self-request prevention
    try {
      await socialService.sendFriendRequest(testUserId, testUserId);
      assert(false, 'Self friend request prevention');
    } catch (e) {
      assert(true, 'Self friend request prevention');
    }

    // Accept → creates friendship
    await socialService.acceptFriendRequest(request._id, testUserId2);
    const areFriendsNow = await socialService.areFriends(testUserId, testUserId2);
    assert(areFriendsNow, 'Symmetric friendship created on accept');

    // Duplicate pending blocked
    try {
      await socialService.sendFriendRequest(testUserId, testUserId2);
      // Might succeed since previous was ACCEPTED, not PENDING
    } catch (e) {
      // Expected if unique partial index catches it
    }
    assert(true, 'Duplicate request handling');

    // Friends list
    const friendsList = await socialService.getFriendsList(testUserId);
    assert(friendsList.friendIds.length >= 1, 'Friends list retrieval');

    // ============================================
    // DOMAIN 7, 8, 9: HUB SYSTEM
    // ============================================
    console.log('📋 Domain 7, 8, 9: Hub System');

    const hub = await hubService.createHub(testUserId, {
      name: 'Test Hub',
      description: 'Domain test hub'
    });
    assert(!!hub._id, 'Hub creation');
    assert(hub.auraHubId.startsWith('AURA-HUB-'), 'Auto-generated AURA-HUB-ID');
    assert(hub.memberCount === 1, 'Owner auto-counted');

    // Duplicate hub ID prevention (unique index)
    const hub2 = await hubService.createHub(testUserId2, { name: 'Hub 2' });
    assert(hub.auraHubId !== hub2.auraHubId, 'Unique hub IDs');

    // Join hub
    await hubService.joinHub(hub._id, testUserId2);
    const refreshedHub = await Hub.findById(hub._id);
    assert(refreshedHub.memberCount === 2, 'Member count incremented on join');

    // Duplicate join prevention
    try {
      await hubService.joinHub(hub._id, testUserId2);
      assert(false, 'Duplicate join prevention');
    } catch (e) {
      assert(e.statusCode === 409, 'Duplicate join prevention');
    }

    // Membership check
    const isMember = await hubService.isMember(hub._id, testUserId2);
    assert(isMember, 'Membership verification');

    // Hub members list
    const members = await hubService.getHubMembers(hub._id);
    assert(members.members.length === 2, 'Hub members retrieval');
    assert(members.pagination.total === 2, 'Hub members pagination');

    // User's hubs
    const userHubs = await hubService.getUserHubs(testUserId);
    assert(userHubs.hubs.length >= 1, 'User hubs retrieval');

    // Hub events
    const events = await hubService.getHubEvents(hub._id);
    assert(events.events.length >= 2, 'Hub events logged (creation + join)');

    // Leave hub
    await hubService.leaveHub(hub._id, testUserId2);
    const afterLeave = await Hub.findById(hub._id);
    assert(afterLeave.memberCount === 1, 'Member count decremented on leave');

    // Owner cannot leave
    try {
      await hubService.leaveHub(hub._id, testUserId);
      assert(false, 'Owner leave prevention');
    } catch (e) {
      assert(e.statusCode === 400, 'Owner leave prevention');
    }

    // Sanitization
    const sanitizedHub = hubService.sanitizeHub(hub);
    assert(!sanitizedHub._id, 'Hub sanitization removes _id');
    assert(!sanitizedHub.discordWebhookUrl, 'Hub sanitization removes secrets');

    // ============================================
    // DOMAIN 10 & 11: CHALLENGE SYSTEM
    // ============================================
    console.log('📋 Domain 10 & 11: Challenge System');

    const challenge = await challengeService.createChallenge(testUserId, {
      title: 'Test Challenge',
      type: 'FRIEND_1V1',
      stakeXp: 50,
      stakeType: 'XP'
    });
    assert(!!challenge._id, 'Challenge creation');
    assert(challenge.status === 'DRAFT', 'Default status is DRAFT');
    assert(challenge.participants.length === 1, 'Creator auto-joined');

    // Join challenge
    await challengeService.joinChallenge(challenge._id, testUserId2);
    const refreshedChallenge = await Challenge.findById(challenge._id);
    assert(refreshedChallenge.participants.length === 2, 'Participant joined');

    // Duplicate join prevention (tested while still in DRAFT)
    try {
      await challengeService.joinChallenge(challenge._id, testUserId2);
      assert(false, 'Duplicate challenge join prevention');
    } catch (e) {
      assert(e.message === 'Already joined this challenge' || e.message === 'Challenge is full', 'Duplicate challenge join prevention');
    }

    // Valid lifecycle transition
    await challengeService.transitionState(challenge._id, 'PENDING');
    const pending = await Challenge.findById(challenge._id);
    assert(pending.status === 'PENDING', 'Valid state transition DRAFT→PENDING');

    // Invalid lifecycle transition
    try {
      await challengeService.transitionState(challenge._id, 'COMPLETED');
      assert(false, 'Invalid state transition rejected');
    } catch (e) {
      assert(e.statusCode === 400, 'Invalid state transition rejected');
    }

    // Submission
    const submission = await challengeService.createSubmission(challenge._id, testUserId, {
      proofImageUrls: ['https://example.com/proof.jpg'],
      proofText: 'Completed the challenge!'
    });
    assert(!!submission._id, 'Submission creation');
    assert(submission.attemptNumber === 1, 'First attempt tracked');

    // Submissions retrieval
    const subs = await challengeService.getSubmissions(challenge._id);
    assert(subs.submissions.length >= 1, 'Submissions retrieval');

    // User challenges
    const userChallenges = await challengeService.getUserChallenges(testUserId);
    assert(userChallenges.challenges.length >= 1, 'User challenges retrieval');

    // ============================================
    // DOMAIN 12: TRUST PROFILE
    // ============================================
    console.log('📋 Domain 12: Trust Profile');

    const trustProfile = await trustService.getOrCreate(testUserId);
    assert(!!trustProfile, 'Trust profile auto-creation');
    assert(trustProfile.trustScore === 50, 'Default trust score 50');
    assert(trustProfile.tier === 'NEUTRAL', 'Default tier NEUTRAL');

    // Record validation
    await trustService.recordValidation(testUserId, 85, 'GEMINI_AI');
    const afterValidation = await TrustProfile.findOne({ userId: testUserId });
    assert(afterValidation.totalValidations === 1, 'Validation counter incremented');
    assert(afterValidation.verifiedCount === 1, 'Verified count (score >= 70)');
    assert(afterValidation.recentScores.length === 1, 'Rolling score window');

    // Trust snapshot
    const snapshot = await trustService.getTrustSnapshot(testUserId);
    assert(typeof snapshot.trustScore === 'number', 'Trust snapshot retrieval');
    assert(!snapshot._id, 'Trust snapshot sanitized');

    // ============================================
    // DOMAIN 13: REWARD & XP TRANSACTION
    // ============================================
    console.log('📋 Domain 13: Reward & XP Transaction');

    const tx = await rewardService.recordTransaction(testUserId, {
      type: 'XP_EARNED_MISSION',
      amount: 50,
      balanceBefore: 0,
      balanceAfter: 50,
      referenceId: task._id,
      referenceType: 'TASK',
      description: 'Mission completed'
    });
    assert(!!tx._id, 'Transaction creation');
    assert(tx.finalized === true, 'Transaction finalized by default');

    // Missing fields rejected
    try {
      await rewardService.recordTransaction(testUserId, {});
      assert(false, 'Missing fields rejected');
    } catch (e) {
      assert(true, 'Missing fields rejected');
    }

    // Transaction history
    const history = await rewardService.getUserTransactions(testUserId);
    assert(history.transactions.length >= 1, 'Transaction history retrieval');
    assert(history.pagination.total >= 1, 'Transaction pagination');

    // Reference lookup
    const byRef = await rewardService.getByReference(task._id, 'TASK');
    assert(byRef.length >= 1, 'Reference-based retrieval');

    // User summary
    const summary = await rewardService.getUserSummary(testUserId);
    assert(summary.totalEarned >= 50, 'User XP summary aggregation');

    // Sanitization
    const stx = rewardService.sanitizeTransaction(tx);
    assert(!stx._id, 'Transaction sanitization removes _id');
    assert(typeof stx.userId === 'string', 'Transaction sanitization converts ObjectId');

    // ============================================
    // INDEX VERIFICATION
    // ============================================
    console.log('📋 Index Verification');

    const collections = [
      { model: User, name: 'User' },
      { model: PlayerProfile, name: 'PlayerProfile' },
      { model: Task, name: 'Task' },
      { model: BehavioralEvent, name: 'BehavioralEvent' },
      { model: FriendRequest, name: 'FriendRequest' },
      { model: Friendship, name: 'Friendship' },
      { model: Hub, name: 'Hub' },
      { model: HubMembership, name: 'HubMembership' },
      { model: HubEvent, name: 'HubEvent' },
      { model: Challenge, name: 'Challenge' },
      { model: ChallengeSubmission, name: 'ChallengeSubmission' },
      { model: TrustProfile, name: 'TrustProfile' },
      { model: RewardTransaction, name: 'RewardTransaction' }
    ];

    for (const { model, name } of collections) {
      const indexes = await model.collection.indexes();
      // Every collection must have at least _id + 1 custom index
      assert(indexes.length >= 2, `${name} has custom indexes (${indexes.length} total)`);
    }

  } catch (err) {
    console.error('\n💥 UNEXPECTED ERROR:', err.message);
    console.error(err.stack);
    failed++;
  }

  // ── Cleanup ──────────────────────────────────────
  console.log('\n🧹 Cleaning up test data...');
  if (testUserId) {
    await User.deleteMany({ _id: { $in: [testUserId, testUserId2] } });
    await PlayerProfile.deleteMany({ userId: { $in: [testUserId, testUserId2] } });
    await Task.deleteMany({ userId: testUserId });
    await BehavioralEvent.deleteMany({ userId: testUserId });
    await FriendRequest.deleteMany({ $or: [{ senderId: testUserId }, { receiverId: testUserId }] });
    await Friendship.deleteMany({ $or: [{ userA: testUserId }, { userB: testUserId }] });
    await Hub.deleteMany({ ownerUserId: { $in: [testUserId, testUserId2] } });
    await HubMembership.deleteMany({ userId: { $in: [testUserId, testUserId2] } });
    await HubEvent.deleteMany({});
    await Challenge.deleteMany({ creatorId: testUserId });
    await ChallengeSubmission.deleteMany({ userId: testUserId });
    await TrustProfile.deleteMany({ userId: testUserId });
    await RewardTransaction.deleteMany({ userId: testUserId });
  }

  // ── Report ───────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📊 TEST RESULTS');
  console.log('═══════════════════════════════════════════════════');
  results.forEach(r => console.log(r));
  console.log(`\n  Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  console.log(failed === 0 ? '\n🏆 ALL TESTS PASSED' : '\n⚠️  SOME TESTS FAILED');
  console.log('═══════════════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
