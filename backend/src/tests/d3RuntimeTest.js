// ======================================================
// PHASE D3.2 — COMPLETE RUNTIME BRUTE FORCE TEST
//
// Tests ALL D3.2 runtime layers without requiring
// live Redis/Discord/LiveKit connections.
//
// Validates:
//   1. Redis module compilation & exports
//   2. Presence service compilation & logic
//   3. RTC authorization compilation & logic
//   4. LiveKit token service compilation
//   5. Bot normalizer compilation & correctness
//   6. Identity discipline enforcement
//   7. Ownership boundary enforcement
//   8. Event constant completeness
//   9. Fault isolation guarantees
//  10. Existing system regression
//
// Run: node src/tests/d3RuntimeTest.js
// ======================================================

// ── Load all D3.2 modules ────────────────────────────
const redisClient = require('../realtime/redis/redisClient');
const redisStreams = require('../realtime/redis/redisStreams');
const redisPresence = require('../realtime/redis/redisPresence');
const redisPubSub = require('../realtime/redis/redisPubSub');
const redisHealth = require('../realtime/redis/redisHealth');
const redisIndex = require('../realtime/redis');

const presenceService = require('../presence/presenceService');
const presenceMetrics = require('../presence/presenceMetrics');
const presenceIndex = require('../presence');

const livekitTokenService = require('../rtc/livekitTokenService');
const rtcAuthorization = require('../rtc/rtcAuthorization');
const rtcMetrics = require('../rtc/rtcMetrics');
const rtcIndex = require('../rtc');

// ── Load existing modules (regression) ───────────────
const { EVENTS } = require('../events/eventConstants');
const { createEventEnvelope, isEnvelope, extractPayload } = require('../events/createEventEnvelope');
const auraEvents = require('../events/eventBus');

// ── Load D3.1 schemas ────────────────────────────────
const HubDiscordMapping = require('../models/HubDiscordMapping');
const HubAccessState = require('../models/HubAccessState');
const HubVoiceState = require('../models/HubVoiceState');
const BotOrchestration = require('../models/BotOrchestration');

// ── Test state ───────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    failures.push(testName);
    console.log(`  ❌ ${testName}`);
  }
}

function section(name) {
  console.log(`\n────────────────────────────────────`);
  console.log(`  ${name}`);
  console.log(`────────────────────────────────────`);
}

// ======================================================
// TEST 1 — REDIS MODULE COMPILATION
// ======================================================
function testRedisCompilation() {
  section('TEST 1 — Redis Module Compilation');

  // redisClient exports
  assert(typeof redisClient.getClient === 'function', 'redisClient.getClient is function');
  assert(typeof redisClient.getSubscriber === 'function', 'redisClient.getSubscriber is function');
  assert(typeof redisClient.connect === 'function', 'redisClient.connect is function');
  assert(typeof redisClient.disconnect === 'function', 'redisClient.disconnect is function');
  assert(typeof redisClient.isHealthy === 'function', 'redisClient.isHealthy is function');
  assert(typeof redisClient.getMetrics === 'function', 'redisClient.getMetrics is function');

  // redisStreams exports
  assert(typeof redisStreams.initStream === 'function', 'redisStreams.initStream is function');
  assert(typeof redisStreams.appendMessage === 'function', 'redisStreams.appendMessage is function');
  assert(typeof redisStreams.replayAfterSequence === 'function', 'redisStreams.replayAfterSequence is function');
  assert(typeof redisStreams.readNewEntries === 'function', 'redisStreams.readNewEntries is function');
  assert(typeof redisStreams.ack === 'function', 'redisStreams.ack is function');
  assert(redisStreams.CONSUMER_GROUP_SOCKET === 'socket-broadcaster', 'Socket consumer group name correct');
  assert(redisStreams.CONSUMER_GROUP_RELAY === 'discord-relay', 'Relay consumer group name correct');

  // redisPresence exports
  assert(typeof redisPresence.setPresence === 'function', 'redisPresence.setPresence is function');
  assert(typeof redisPresence.removePresence === 'function', 'redisPresence.removePresence is function');
  assert(typeof redisPresence.getHubPresence === 'function', 'redisPresence.getHubPresence is function');
  assert(typeof redisPresence.heartbeat === 'function', 'redisPresence.heartbeat is function');
  assert(typeof redisPresence.cleanStalePresence === 'function', 'redisPresence.cleanStalePresence is function');
  assert(redisPresence.STALE_THRESHOLD_MS === 90000, 'Stale threshold is 90s');

  // redisPubSub exports
  assert(typeof redisPubSub.publish === 'function', 'redisPubSub.publish is function');
  assert(typeof redisPubSub.subscribe === 'function', 'redisPubSub.subscribe is function');
  assert(redisPubSub.CHANNELS.BOT_COMMANDS === 'bot:commands', 'Bot commands channel correct');
  assert(redisPubSub.CHANNELS.PRESENCE_EVENTS === 'presence:events', 'Presence events channel correct');
  assert(redisPubSub.CHANNELS.RTC_EVENTS === 'rtc:events', 'RTC events channel correct');

  // redisHealth exports
  assert(typeof redisHealth.checkHealth === 'function', 'redisHealth.checkHealth is function');
  assert(typeof redisHealth.getFullMetrics === 'function', 'redisHealth.getFullMetrics is function');

  // Barrel export
  assert(redisIndex.redisClient === redisClient, 'Redis barrel exports redisClient');
  assert(redisIndex.redisStreams === redisStreams, 'Redis barrel exports redisStreams');
}

// ======================================================
// TEST 2 — PRESENCE SERVICE COMPILATION
// ======================================================
function testPresenceCompilation() {
  section('TEST 2 — Presence Service Compilation');

  assert(typeof presenceService.playerJoinedHub === 'function', 'playerJoinedHub is function');
  assert(typeof presenceService.playerLeftHub === 'function', 'playerLeftHub is function');
  assert(typeof presenceService.playerJoinedVoice === 'function', 'playerJoinedVoice is function');
  assert(typeof presenceService.playerLeftVoice === 'function', 'playerLeftVoice is function');
  assert(typeof presenceService.heartbeat === 'function', 'heartbeat is function');
  assert(typeof presenceService.getHubPresence === 'function', 'getHubPresence is function');
  assert(typeof presenceService.reconcile === 'function', 'reconcile is function');
  assert(typeof presenceService.getVoiceSnapshot === 'function', 'getVoiceSnapshot is function');
  assert(typeof presenceService.getMetrics === 'function', 'getMetrics is function');

  // Barrel
  assert(presenceIndex.presenceService === presenceService, 'Presence barrel exports presenceService');
}

// ======================================================
// TEST 3 — RTC / LIVEKIT COMPILATION
// ======================================================
function testRtcCompilation() {
  section('TEST 3 — RTC / LiveKit Compilation');

  assert(typeof livekitTokenService.mintToken === 'function', 'mintToken is function');
  assert(typeof livekitTokenService.buildRoomId === 'function', 'buildRoomId is function');
  assert(typeof livekitTokenService.isConfigured === 'function', 'isConfigured is function');
  assert(typeof livekitTokenService.getMetrics === 'function', 'getMetrics is function');

  assert(typeof rtcAuthorization.authorizeAndMint === 'function', 'authorizeAndMint is function');
  assert(typeof rtcAuthorization.getMetrics === 'function', 'rtcAuth.getMetrics is function');

  assert(typeof rtcMetrics.getMetrics === 'function', 'rtcMetrics.getMetrics is function');

  // Barrel
  assert(rtcIndex.livekitTokenService === livekitTokenService, 'RTC barrel exports livekitTokenService');
  assert(rtcIndex.rtcAuthorization === rtcAuthorization, 'RTC barrel exports rtcAuthorization');
}

// ======================================================
// TEST 4 — LIVEKIT ROOM ID FORMAT
// ======================================================
function testLiveKitRoomFormat() {
  section('TEST 4 — LiveKit Room ID Format');

  const roomId = livekitTokenService.buildRoomId('abc123');
  assert(roomId === 'hub:abc123:voice', 'Room ID format: hub:{id}:voice');

  const roomId2 = livekitTokenService.buildRoomId('AURA-HUB-001');
  assert(roomId2 === 'hub:AURA-HUB-001:voice', 'Room ID works with AURA IDs');
}

// ======================================================
// TEST 5 — LIVEKIT DEGRADED MODE (No config)
// ======================================================
function testLiveKitDegraded() {
  section('TEST 5 — LiveKit Degraded Mode');

  // Without LK_API_KEY configured, isConfigured should be false
  const configured = livekitTokenService.isConfigured();
  // Note: might be true if env has the keys
  assert(typeof configured === 'boolean', 'isConfigured returns boolean');

  // Metrics should start clean
  const metrics = livekitTokenService.getMetrics();
  assert(typeof metrics.tokensIssued === 'number', 'Metrics has tokensIssued');
  assert(typeof metrics.tokenFailures === 'number', 'Metrics has tokenFailures');
  assert('configured' in metrics, 'Metrics includes configured flag');
}

// ======================================================
// TEST 6 — BOT NORMALIZER
// ======================================================
function testBotNormalizer() {
  section('TEST 6 — Bot Normalizer');

  const path = require('path');
  const { normalizeMessage } = require(path.resolve(__dirname, '../../../discord-bot/normalizers/messageNormalizer'));

  // Mock Discord message
  const mockMsg = {
    id: '123456789',
    content: 'Hello <@12345> in <#67890>',
    author: { id: 'discord-user-1', username: 'TestUser' },
    member: { displayName: 'TestDisplay' },
    attachments: new Map([
      ['att1', { url: 'https://cdn.discord.com/att.png', name: 'att.png', contentType: 'image/png', size: 1024 }],
    ]),
    createdTimestamp: 1700000000000,
  };

  // Convert Map to array-like for normalizer
  mockMsg.attachments = Array.from(mockMsg.attachments.values());

  const normalized = normalizeMessage(mockMsg);

  assert(normalized.discordMessageId === '123456789', 'Normalizer preserves message ID');
  assert(normalized.authorDiscordId === 'discord-user-1', 'Normalizer extracts Discord author ID');
  assert(normalized.authorName === 'TestDisplay', 'Normalizer uses displayName');
  assert(normalized.source === 'discord', 'Normalizer sets source to discord');
  assert(!normalized.content.includes('<@12345>'), 'Normalizer strips mention syntax');
  assert(!normalized.content.includes('<#67890>'), 'Normalizer strips channel syntax');
  assert(normalized.content.includes('@user'), 'Normalizer replaces mentions with @user');
  assert(normalized.attachments.length === 1, 'Normalizer preserves attachments');
  assert(normalized.attachments[0].contentType === 'image/png', 'Attachment contentType preserved');
}

// ======================================================
// TEST 7 — IDENTITY DISCIPLINE
// ======================================================
function testIdentityDiscipline() {
  section('TEST 7 — Identity Discipline');

  // HubAccessState: discordUserId must be select:false
  const accessPaths = HubAccessState.schema.paths;
  assert(accessPaths.discordUserId.options.select === false, 'discordUserId is select:false in HubAccessState');

  // HubDiscordMapping: webhookUrl must be select:false
  const mappingPaths = HubDiscordMapping.schema.paths;
  assert(mappingPaths.webhookUrl.options.select === false, 'webhookUrl is select:false in HubDiscordMapping');

  // LiveKit room uses auraPlayerId format
  const roomId = livekitTokenService.buildRoomId('test');
  assert(!roomId.includes('discord'), 'Room ID contains no Discord references');
  assert(!roomId.includes('socket'), 'Room ID contains no socket references');

  // PubSub channels don't leak identity
  assert(!redisPubSub.CHANNELS.BOT_COMMANDS.includes('discord'), 'Bot channel name has no Discord leak');
}

// ======================================================
// TEST 8 — OWNERSHIP BOUNDARY
// ======================================================
function testOwnershipBoundary() {
  section('TEST 8 — Ownership Boundary');

  // Redis modules don't import Mongoose models directly
  // (they shouldn't be making DB writes)
  const redisClientSrc = require('fs').readFileSync(
    require('path').resolve(__dirname, '../realtime/redis/redisClient.js'), 'utf8'
  );
  assert(!redisClientSrc.includes('require(\'../models'), 'redisClient does not import models');
  assert(!redisClientSrc.includes('require("../models'), 'redisClient does not import models (double quotes)');

  const redisStreamsSrc = require('fs').readFileSync(
    require('path').resolve(__dirname, '../realtime/redis/redisStreams.js'), 'utf8'
  );
  assert(!redisStreamsSrc.includes('require(\'../models'), 'redisStreams does not import models');

  // Presence service uses Redis but also Mongo (for durable snapshot) — this is correct
  const presenceSrc = require('fs').readFileSync(
    require('path').resolve(__dirname, '../presence/presenceService.js'), 'utf8'
  );
  assert(presenceSrc.includes('HubVoiceState'), 'Presence service uses HubVoiceState (durable snapshot)');
  assert(presenceSrc.includes('redisPresence'), 'Presence service uses redisPresence (ephemeral)');
}

// ======================================================
// TEST 9 — FAULT ISOLATION
// ======================================================
async function testFaultIsolation() {
  section('TEST 9 — Fault Isolation');

  // Redis not connected → appendMessage should return null, not throw
  try {
    const result = await redisStreams.appendMessage('test-hub', { content: 'test' });
    assert(result === null, 'appendMessage returns null when Redis not ready (no crash)');
  } catch (err) {
    assert(false, `appendMessage threw instead of degrading: ${err.message}`);
  }

  // Redis not connected → presence should return false/empty
  try {
    const result = await redisPresence.setPresence('test', 'player1', {});
    assert(result === false, 'setPresence returns false when Redis not ready');
  } catch (err) {
    assert(false, `setPresence threw instead of degrading: ${err.message}`);
  }

  try {
    const members = await redisPresence.getHubPresence('test');
    assert(Array.isArray(members) && members.length === 0, 'getHubPresence returns empty array when Redis not ready');
  } catch (err) {
    assert(false, `getHubPresence threw instead of degrading: ${err.message}`);
  }

  // PubSub not connected → publish should return false
  try {
    const result = await redisPubSub.publish('test', { foo: 'bar' });
    assert(result === false, 'publish returns false when Redis not ready');
  } catch (err) {
    assert(false, `publish threw instead of degrading: ${err.message}`);
  }

  // Replay not connected → returns empty
  try {
    const replay = await redisStreams.replayAfterSequence('test', 0);
    assert(Array.isArray(replay) && replay.length === 0, 'replayAfterSequence returns empty when Redis not ready');
  } catch (err) {
    assert(false, `replayAfterSequence threw instead of degrading: ${err.message}`);
  }

  // Health check → returns false when not connected
  try {
    const healthy = await redisClient.isHealthy();
    assert(healthy === false, 'isHealthy returns false when not connected');
  } catch (err) {
    assert(false, `isHealthy threw instead of returning false: ${err.message}`);
  }
}

// ======================================================
// TEST 10 — METRICS STRUCTURE
// ======================================================
function testMetricsStructure() {
  section('TEST 10 — Metrics Structure');

  const clientMetrics = redisClient.getMetrics();
  assert('connectCount' in clientMetrics, 'Client metrics has connectCount');
  assert('reconnectCount' in clientMetrics, 'Client metrics has reconnectCount');
  assert('errorCount' in clientMetrics, 'Client metrics has errorCount');
  assert('mainStatus' in clientMetrics, 'Client metrics has mainStatus');

  const streamMetrics = redisStreams.getMetrics();
  assert('appendCount' in streamMetrics, 'Stream metrics has appendCount');
  assert('replayCount' in streamMetrics, 'Stream metrics has replayCount');
  assert('duplicateAppendRejections' in streamMetrics, 'Stream metrics has duplicateAppendRejections');

  const presMetrics = presenceService.getMetrics();
  assert('joins' in presMetrics, 'Presence metrics has joins');
  assert('voiceJoins' in presMetrics, 'Presence metrics has voiceJoins');
  assert('reconciliations' in presMetrics, 'Presence metrics has reconciliations');

  // ghostCleanups is tracked at the Redis layer, not the service layer
  const redisPresMetrics = redisPresence.getMetrics();
  assert('ghostCleanups' in redisPresMetrics, 'Redis presence metrics has ghostCleanups');

  const lkMetrics = livekitTokenService.getMetrics();
  assert('tokensIssued' in lkMetrics, 'LiveKit metrics has tokensIssued');
  assert('configured' in lkMetrics, 'LiveKit metrics has configured');

  const rtcAuthMetrics = rtcAuthorization.getMetrics();
  assert('authorized' in rtcAuthMetrics, 'RTCAuth metrics has authorized');
  assert('rejected' in rtcAuthMetrics, 'RTCAuth metrics has rejected');
  assert('permissionFailures' in rtcAuthMetrics, 'RTCAuth metrics has permissionFailures');
}

// ======================================================
// TEST 11 — EVENT CONSTANTS COMPLETENESS
// ======================================================
function testEventConstantsComplete() {
  section('TEST 11 — Event Constants Completeness');

  // All D3.1 + D3.2 events
  assert(EVENTS.HUB_PROVISION_STARTED === 'hub.provision.started', 'HUB_PROVISION_STARTED exists');
  assert(EVENTS.HUB_PROVISIONED === 'hub.provisioned', 'HUB_PROVISIONED exists');
  assert(EVENTS.HUB_PROVISION_FAILED === 'hub.provision.failed', 'HUB_PROVISION_FAILED exists');
  assert(EVENTS.HUB_ACCESS_GRANTED === 'hub.access.granted', 'HUB_ACCESS_GRANTED exists');
  assert(EVENTS.HUB_ACCESS_REVOKED === 'hub.access.revoked', 'HUB_ACCESS_REVOKED exists');
  assert(EVENTS.VOICE_PARTICIPANT_JOINED === 'voice.participant.joined', 'VOICE_PARTICIPANT_JOINED exists');
  assert(EVENTS.VOICE_PARTICIPANT_LEFT === 'voice.participant.left', 'VOICE_PARTICIPANT_LEFT exists');
  assert(EVENTS.VOICE_STATE_RECONCILED === 'voice.state.reconciled', 'VOICE_STATE_RECONCILED exists');
  assert(EVENTS.BOT_ORCHESTRATION_STARTED === 'bot.orchestration.started', 'BOT_ORCHESTRATION_STARTED exists');
  assert(EVENTS.BOT_ORCHESTRATION_FAILED === 'bot.orchestration.failed', 'BOT_ORCHESTRATION_FAILED exists');
}

// ======================================================
// TEST 12 — ENVELOPE ENTITY TYPES FOR D3.2
// ======================================================
function testD32EntityTypes() {
  section('TEST 12 — Envelope Entity Types (D3.2)');

  const voiceEnv = createEventEnvelope('voice.participant.joined', { auraPlayerId: 'P1' });
  assert(voiceEnv.entityType === 'voice', 'voice.* → entityType=voice');
  assert(isEnvelope(voiceEnv), 'Voice envelope is valid envelope');

  const botEnv = createEventEnvelope('bot.orchestration.started', { hubId: 'H1' });
  assert(botEnv.entityType === 'orchestration', 'bot.* → entityType=orchestration');

  const hubEnv = createEventEnvelope('hub.provisioned', { hubId: 'H1' });
  assert(hubEnv.entityType === 'hub', 'hub.provisioned → entityType=hub');

  const hubAccessEnv = createEventEnvelope('hub.access.granted', { playerId: 'P1' });
  assert(hubAccessEnv.entityType === 'hub', 'hub.access.* → entityType=hub');
}

// ======================================================
// TEST 13 — EXISTING SYSTEM REGRESSION
// ======================================================
function testRegression() {
  section('TEST 13 — Existing System Regression');

  // EventBus still works
  assert(typeof auraEvents.emitEvent === 'function', 'REGRESSION: EventBus.emitEvent exists');
  assert(typeof auraEvents.registerListener === 'function', 'REGRESSION: EventBus.registerListener exists');
  assert(typeof auraEvents.getStats === 'function', 'REGRESSION: EventBus.getStats exists');

  // Existing events
  assert(EVENTS.TASK_CREATED === 'task.created', 'REGRESSION: TASK_CREATED intact');
  assert(EVENTS.CHALLENGE_ACTIVATED === 'challenge.activated', 'REGRESSION: CHALLENGE_ACTIVATED intact');
  assert(EVENTS.FRIEND_ACCEPTED === 'friend.accepted', 'REGRESSION: FRIEND_ACCEPTED intact');
  assert(EVENTS.HUB_JOINED === 'hub.joined', 'REGRESSION: HUB_JOINED intact');
  assert(EVENTS.NOTIFICATION_CREATED === 'notification.created', 'REGRESSION: NOTIFICATION_CREATED intact');

  // Existing schemas still compile
  const mongoose = require('mongoose');
  assert(typeof HubDiscordMapping === 'function', 'REGRESSION: HubDiscordMapping compiles');
  assert(typeof HubAccessState === 'function', 'REGRESSION: HubAccessState compiles');
  assert(typeof HubVoiceState === 'function', 'REGRESSION: HubVoiceState compiles');
  assert(typeof BotOrchestration === 'function', 'REGRESSION: BotOrchestration compiles');
}

// ======================================================
// RUN ALL TESTS
// ======================================================
async function runAll() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   PHASE D3.2 — RUNTIME BRUTE FORCE TEST         ║');
  console.log('╚══════════════════════════════════════════════════╝');

  testRedisCompilation();
  testPresenceCompilation();
  testRtcCompilation();
  testLiveKitRoomFormat();
  testLiveKitDegraded();
  testBotNormalizer();
  testIdentityDiscipline();
  testOwnershipBoundary();
  await testFaultIsolation();
  testMetricsStructure();
  testEventConstantsComplete();
  testD32EntityTypes();
  testRegression();

  console.log('\n════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log(`\n  FAILURES:`);
    failures.forEach(f => console.log(`    ❌ ${f}`));
  }
  console.log('════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

runAll();
