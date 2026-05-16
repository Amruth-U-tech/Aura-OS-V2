#!/usr/bin/env node
// ======================================================
// PHASE 2.4.1 INTEGRATION TESTS
// Identity, Global Discovery, Social Routing, Challenge Routing
// Validates: permanent public identities, global DB queries,
//   friend 1v1 routing, hub challenge routing, security
// ======================================================

require('dotenv').config();
const mongoose = require('mongoose');

// Models
const User = require('../models/User');
const PlayerProfile = require('../models/PlayerProfile');
const Hub = require('../models/Hub');
const Challenge = require('../models/Challenge');
const Friendship = require('../models/Friendship');
const FriendRequest = require('../models/FriendRequest');
const HubMembership = require('../models/HubMembership');
const TrustProfile = require('../models/TrustProfile');

// Services
const identity = require('../services/identityGenerator');
const discovery = require('../services/domains/globalDiscoveryService');
const socialService = require('../services/domains/socialDomainService');
const hubService = require('../services/domains/hubDomainService');
const challengeService = require('../services/domains/challengeDomainService');
const playerProfileService = require('../services/domains/playerProfileDomainService');
const bootstrap = require('../services/orchestration/playerBootstrap');

let passed = 0, failed = 0;
const results = [];

function assert(condition, label) {
  if (condition) {
    passed++;
    results.push(`  ✅ ${label}`);
  } else {
    failed++;
    results.push(`  ❌ ${label}`);
  }
}

async function cleanup(userIds) {
  for (const uid of userIds) {
    await User.deleteMany({ _id: uid });
    await PlayerProfile.deleteMany({ userId: uid });
    await TrustProfile.deleteMany({ userId: uid });
    await Challenge.deleteMany({ creatorId: uid });
    await FriendRequest.deleteMany({ $or: [{ senderId: uid }, { receiverId: uid }] });
    await Friendship.deleteMany({ $or: [{ userA: uid }, { userB: uid }] });
    await HubMembership.deleteMany({ userId: uid });
  }
  await Hub.deleteMany({ name: /^TEST_241_/ });
}

async function runTests() {
  console.log('\n═════════════════════════════════════════════════════');
  console.log('  ⚔️ PHASE 2.4.1 INTEGRATION TESTS');
  console.log('  Identity • Discovery • Social Routing • Challenges');
  console.log('═════════════════════════════════════════════════════\n');

  await mongoose.connect(process.env.MONGO_URI);

  // ── Create test users ──────────────────────────────
  const userA = await User.create({
    email: `test241a_${Date.now()}@aura.test`,
    passwordHash: 'hashed', playerName: 'DiscoverTestA'
  });
  const userB = await User.create({
    email: `test241b_${Date.now()}@aura.test`,
    passwordHash: 'hashed', playerName: 'DiscoverTestB'
  });
  const userC = await User.create({
    email: `test241c_${Date.now()}@aura.test`,
    passwordHash: 'hashed', playerName: 'IsolatedPlayer'
  });

  try {
    // ── 1. IDENTITY GENERATOR ────────────────────────
    console.log('  📛 Identity Generator');
    const pid = identity.generatePlayerId();
    assert(pid.startsWith('AURA-PLR-'), 'Player ID has correct prefix');
    assert(pid.length === 17, 'Player ID is 17 chars');
    assert(identity.isValid(pid, 'PLAYER'), 'Player ID validates correctly');

    const hid = identity.generateHubId();
    assert(hid.startsWith('AURA-HUB-'), 'Hub ID has correct prefix');
    assert(identity.isValid(hid, 'HUB'), 'Hub ID validates correctly');

    const cid = identity.generateChallengeId();
    assert(cid.startsWith('AURA-CHL-'), 'Challenge ID has correct prefix');
    assert(identity.isValid(cid, 'CHALLENGE'), 'Challenge ID validates correctly');

    const fid = identity.generateFriendshipId();
    assert(fid.startsWith('AURA-FRD-'), 'Friendship ID has correct prefix');

    assert(identity.detectType(pid) === 'PLAYER', 'Type detection: PLAYER');
    assert(identity.detectType(hid) === 'HUB', 'Type detection: HUB');
    assert(identity.detectType('invalid') === null, 'Invalid ID returns null');

    // Uniqueness
    const ids = new Set(Array.from({ length: 100 }, () => identity.generatePlayerId()));
    assert(ids.size === 100, '100 generated IDs are unique');

    // ── 2. BOOTSTRAP & IDENTITY PERSISTENCE ──────────
    console.log('\n  🚀 Player Bootstrap & Identity');
    const resultA = await bootstrap.bootstrapNewPlayer(userA._id, { playerName: userA.playerName });
    const resultB = await bootstrap.bootstrapNewPlayer(userB._id, { playerName: userB.playerName });
    const resultC = await bootstrap.bootstrapNewPlayer(userC._id, { playerName: userC.playerName });

    assert(resultA.profile.auraPlayerId.startsWith('AURA-PLR-'), 'Bootstrap generates auraPlayerId');
    assert(resultB.profile.auraPlayerId.startsWith('AURA-PLR-'), 'Player B has auraPlayerId');
    assert(resultA.profile.auraPlayerId !== resultB.profile.auraPlayerId, 'Player IDs are unique');
    assert(resultA.trustProfile, 'Trust profile created');

    // Verify persisted
    const persisted = await PlayerProfile.findOne({ userId: userA._id });
    assert(persisted.auraPlayerId === resultA.profile.auraPlayerId, 'ID persisted to DB');

    // ── 3. SANITIZED RESPONSE ────────────────────────
    console.log('\n  🧹 Sanitization');
    const sanitized = playerProfileService.sanitizeProfile(persisted);
    assert(sanitized.auraPlayerId, 'Sanitized output has auraPlayerId');
    assert(sanitized.createdAt, 'Sanitized output has createdAt');
    assert(!sanitized._id, 'Sanitized output strips _id');
    assert(!sanitized.__v && sanitized.__v !== 0, 'Sanitized output strips __v');

    // ── 4. GLOBAL PLAYER DISCOVERY ───────────────────
    console.log('\n  🔍 Global Player Discovery');

    // Search by auraPlayerId
    const foundByAura = await discovery.searchPlayerByAuraId(resultA.profile.auraPlayerId);
    assert(foundByAura !== null, 'Search by AURA-PLR-ID finds player');
    assert(foundByAura.auraPlayerId === resultA.profile.auraPlayerId, 'Correct player returned');
    assert(foundByAura.displayName === userA.playerName || foundByAura.displayName === 'DiscoverTestA', 'Display name matches');

    // Invalid ID returns null
    const notFound = await discovery.searchPlayerByAuraId('AURA-PLR-00000000');
    assert(notFound === null, 'Invalid AURA-PLR-ID returns null');

    // Format validation
    const badFormat = await discovery.searchPlayerByAuraId('not-an-id');
    assert(badFormat === null, 'Bad format returns null');

    // Random discovery
    const randomPlayers = await discovery.discoverRandomPlayers(userA._id, 20);
    assert(Array.isArray(randomPlayers), 'Random players returns array');
    // Should exclude self
    const selfInResults = randomPlayers.find(p => p.userId === userA._id.toString());
    assert(!selfInResults, 'Self excluded from random discovery');

    // ── 5. HUB IDENTITY & DISCOVERY ──────────────────
    console.log('\n  🌐 Hub Identity & Discovery');
    const hub = await hubService.createHub(userA._id, {
      name: 'TEST_241_PublicHub', description: 'Test hub', visibility: 'PUBLIC', maxMembers: 50
    });
    assert(hub.auraHubId.startsWith('AURA-HUB-'), 'Hub has AURA-HUB-ID');
    assert(hub.inviteCode, 'Hub has invite code');

    // Search by hub auraId
    const foundHub = await discovery.searchHubByAuraId(hub.auraHubId);
    assert(foundHub !== null, 'Search by AURA-HUB-ID finds hub');
    assert(foundHub.auraHubId === hub.auraHubId, 'Correct hub returned');
    assert(foundHub.name === 'TEST_241_PublicHub', 'Hub name matches');
    assert(!foundHub._id, 'Hub sanitized: no _id');

    // Random hub discovery
    const randomHubs = await discovery.discoverRandomHubs(userB._id, 20);
    assert(Array.isArray(randomHubs), 'Random hubs returns array');

    // Private hub NOT discoverable
    const privateHub = await hubService.createHub(userA._id, {
      name: 'TEST_241_PrivateHub', visibility: 'PRIVATE'
    });
    const privateFound = await discovery.searchHubByAuraId(privateHub.auraHubId);
    // searchHubByAuraId only returns ACTIVE hubs, but visibility is not filtered there.
    // discoverRandomHubs should exclude PRIVATE.
    // Let's validate random excludes private
    const allDiscovered = await discovery.discoverRandomHubs(userB._id, 100);
    const privateInDiscovery = allDiscovered.find(h => h.auraHubId === privateHub.auraHubId);
    assert(!privateInDiscovery, 'Private hub excluded from random discovery');

    // ── 6. HUB JOIN FLOW ─────────────────────────────
    console.log('\n  🚪 Hub Join Flow');
    await hubService.joinHub(hub._id, userB._id);
    const isMember = await hubService.isMember(hub._id, userB._id);
    assert(isMember, 'User B joined public hub');

    const updatedHub = await Hub.findById(hub._id);
    assert(updatedHub.memberCount === 2, 'Member count incremented');

    // Duplicate join prevented
    let dupeJoinError = false;
    try { await hubService.joinHub(hub._id, userB._id); } catch { dupeJoinError = true; }
    assert(dupeJoinError, 'Duplicate join prevented');

    // ── 7. SOCIAL ROUTING ────────────────────────────
    console.log('\n  👥 Social Routing');
    const friendReq = await socialService.sendFriendRequest(userA._id, userB._id, 'Hey!');
    assert(friendReq, 'Friend request sent');

    // Self request prevented
    let selfReqError = false;
    try { await socialService.sendFriendRequest(userA._id, userA._id); } catch { selfReqError = true; }
    assert(selfReqError, 'Self friend request prevented');

    // Accept
    await socialService.acceptFriendRequest(friendReq._id, userB._id);
    const areFriends = await socialService.areFriends(userA._id, userB._id);
    assert(areFriends, 'Friendship established after accept');

    // Friends list
    const friendsList = await socialService.getFriendsList(userA._id);
    assert(friendsList.friendIds.length >= 1, 'Friends list has entries');

    // ── 8. FRIEND 1V1 CHALLENGE ROUTING ──────────────
    console.log('\n  ⚔️ Friend 1v1 Challenge Routing');
    const challenge1v1 = await challengeService.createChallenge(userA._id, {
      title: 'Test 1v1', type: 'FRIEND_1V1', targetFriendId: userB._id,
      stakeXp: 25, stakeType: 'XP'
    });
    assert(challenge1v1.auraChallengeId.startsWith('AURA-CHL-'), 'Challenge has AURA-CHL-ID');
    assert(challenge1v1.targetFriendId.toString() === userB._id.toString(), 'Target friend set');
    assert(challenge1v1.type === 'FRIEND_1V1', 'Type is FRIEND_1V1');

    const sanitizedC = challengeService.sanitizeChallenge(challenge1v1);
    assert(sanitizedC.routing === 'ONE_TO_ONE', 'Routing is ONE_TO_ONE');
    assert(sanitizedC.auraChallengeId, 'Sanitized has auraChallengeId');
    assert(sanitizedC.targetFriendId, 'Sanitized has targetFriendId');

    // Join target friend
    await challengeService.joinChallenge(challenge1v1._id, userB._id);
    const joinedChallenge = await Challenge.findById(challenge1v1._id);
    assert(joinedChallenge.participants.length === 2, 'Both participants joined');

    // ── 9. HUB CHALLENGE ROUTING ─────────────────────
    console.log('\n  🌐 Hub Challenge Routing');
    const hubChallenge = await challengeService.createChallenge(userA._id, {
      title: 'Test Hub Challenge', type: 'HUB_OPEN', hubId: hub._id,
      stakeXp: 50, stakeType: 'XP'
    });
    assert(hubChallenge.hubId.toString() === hub._id.toString(), 'Hub challenge linked to hub');
    assert(hubChallenge.type === 'HUB_OPEN', 'Type is HUB_OPEN');

    const sanitizedHC = challengeService.sanitizeChallenge(hubChallenge);
    assert(sanitizedHC.routing === 'ONE_TO_MANY', 'Hub routing is ONE_TO_MANY');

    // Hub member B can join
    await challengeService.joinChallenge(hubChallenge._id, userB._id);
    const joinedHubC = await Challenge.findById(hubChallenge._id);
    assert(joinedHubC.participants.length === 2, 'Hub member joined challenge');

    // ── 10. CROSS-USER SECURITY ──────────────────────
    console.log('\n  🔒 Security');
    // Non-friend cannot see friend's private data
    const playerCProfile = await PlayerProfile.findOne({ userId: userC._id });
    const sanitizedPC = playerProfileService.sanitizeProfile(playerCProfile);
    assert(!sanitizedPC.metadata, 'Private metadata not exposed');
    assert(!sanitizedPC.lastStreakDate, 'Private streak date not exposed');

    // C and A are NOT friends
    const cAndAFriends = await socialService.areFriends(userA._id, userC._id);
    assert(!cAndAFriends, 'Non-friends correctly identified');

    // Discovery excludes friends
    const discoveryForA = await discovery.discoverRandomPlayers(userA._id, 100);
    const friendBInDiscovery = discoveryForA.find(p => p.userId === userB._id.toString());
    assert(!friendBInDiscovery, 'Existing friends excluded from discovery');

    // ── 11. IDENTITY IMMUTABILITY ────────────────────
    console.log('\n  🔐 Identity Immutability');
    const originalId = persisted.auraPlayerId;
    const reloaded = await PlayerProfile.findOne({ userId: userA._id });
    assert(reloaded.auraPlayerId === originalId, 'Player ID unchanged after reload');

    const hubReloaded = await Hub.findById(hub._id);
    assert(hubReloaded.auraHubId === hub.auraHubId, 'Hub ID unchanged after reload');

    const chalReloaded = await Challenge.findById(challenge1v1._id);
    assert(chalReloaded.auraChallengeId === challenge1v1.auraChallengeId, 'Challenge ID unchanged');

    // ── 12. GLOBAL vs LOCAL QUERY INTEGRITY ──────────
    console.log('\n  📊 Global vs Local Query Integrity');
    // Global: leaderboard returns multiple users
    const lb = await playerProfileService.getLeaderboard({ limit: 50 });
    assert(lb.profiles.length >= 3, 'Leaderboard returns multiple profiles (GLOBAL)');
    assert(lb.profiles.every(p => p.userId), 'All leaderboard entries have userId');

    // Local: user challenges are ownership-bound
    const userAChallenges = await challengeService.getUserChallenges(userA._id);
    assert(userAChallenges.challenges.length >= 1, 'User A has challenges');
    const userCChallenges = await challengeService.getUserChallenges(userC._id);
    assert(userCChallenges.challenges.length === 0, 'User C has no challenges (LOCAL isolation)');

  } finally {
    // ── Cleanup ──────────────────────────────────────
    await cleanup([userA._id, userB._id, userC._id]);
    await mongoose.disconnect();
  }

  // ── Report ─────────────────────────────────────────
  console.log(results.join('\n'));
  console.log(`\n  Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  console.log(failed === 0
    ? '\n🏆 ALL TESTS PASSED'
    : '\n⚠️  SOME TESTS FAILED'
  );
  console.log('═════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
