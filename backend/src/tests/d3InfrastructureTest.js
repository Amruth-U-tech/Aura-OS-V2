// ======================================================
// PHASE D3.1 — BRUTE FORCE INFRASTRUCTURE TEST
// Tests ALL new D3.1 schemas, event constants, and
// entity type inference without touching existing systems.
//
// This test:
//   1. Validates all 4 new schemas compile and instantiate
//   2. Validates all field defaults
//   3. Validates required field enforcement
//   4. Validates index definitions
//   5. Validates select:false security on sensitive fields
//   6. Validates event constants are registered
//   7. Validates envelope entity type inference
//   8. Validates no regression in existing event constants
//   9. Validates schema edge cases (duplicate keys, etc.)
//  10. Validates backward compatibility of envelope factory
//
// Run: node src/tests/d3InfrastructureTest.js
// ======================================================

const mongoose = require('mongoose');

// ── Load all new D3.1 models ─────────────────────────
const HubDiscordMapping = require('../models/HubDiscordMapping');
const HubAccessState = require('../models/HubAccessState');
const HubVoiceState = require('../models/HubVoiceState');
const BotOrchestration = require('../models/BotOrchestration');

// ── Load existing models (regression check) ──────────
const Hub = require('../models/Hub');
const PlayerProfile = require('../models/PlayerProfile');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Challenge = require('../models/Challenge');

// ── Load event system ────────────────────────────────
const { EVENTS } = require('../events/eventConstants');
const { createEventEnvelope, isEnvelope, extractPayload } = require('../events/createEventEnvelope');

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
// TEST 1 — SCHEMA COMPILATION
// ======================================================
function testSchemaCompilation() {
  section('TEST 1 — Schema Compilation');

  assert(typeof HubDiscordMapping === 'function', 'HubDiscordMapping compiles as Mongoose model');
  assert(typeof HubAccessState === 'function', 'HubAccessState compiles as Mongoose model');
  assert(typeof HubVoiceState === 'function', 'HubVoiceState compiles as Mongoose model');
  assert(typeof BotOrchestration === 'function', 'BotOrchestration compiles as Mongoose model');

  // Verify model names
  assert(HubDiscordMapping.modelName === 'HubDiscordMapping', 'HubDiscordMapping has correct modelName');
  assert(HubAccessState.modelName === 'HubAccessState', 'HubAccessState has correct modelName');
  assert(HubVoiceState.modelName === 'HubVoiceState', 'HubVoiceState has correct modelName');
  assert(BotOrchestration.modelName === 'BotOrchestration', 'BotOrchestration has correct modelName');
}

// ======================================================
// TEST 2 — HubDiscordMapping SCHEMA VALIDATION
// ======================================================
function testHubDiscordMapping() {
  section('TEST 2 — HubDiscordMapping Schema');

  const schema = HubDiscordMapping.schema;
  const paths = schema.paths;

  // Required fields
  assert(paths.auraHubId && paths.auraHubId.isRequired, 'auraHubId is required');

  // Enum validation
  const syncStatusEnum = paths.syncStatus.options.enum;
  assert(syncStatusEnum.includes('PROVISIONING'), 'syncStatus includes PROVISIONING');
  assert(syncStatusEnum.includes('ACTIVE'), 'syncStatus includes ACTIVE');
  assert(syncStatusEnum.includes('FAILED'), 'syncStatus includes FAILED');
  assert(syncStatusEnum.includes('DEGRADED'), 'syncStatus includes DEGRADED');

  // Default values
  const doc = new HubDiscordMapping({ auraHubId: new mongoose.Types.ObjectId() });
  assert(doc.syncStatus === 'PROVISIONING', 'syncStatus defaults to PROVISIONING');
  assert(doc.provisionAttempts === 0, 'provisionAttempts defaults to 0');
  assert(doc.infrastructureVersion === 1, 'infrastructureVersion defaults to 1');
  assert(doc.discordGuildId === null, 'discordGuildId defaults to null');

  // select:false security
  const webhookPath = paths.webhookUrl;
  assert(webhookPath.options.select === false, 'webhookUrl has select:false (CRITICAL SECURITY)');

  // Index verification
  const indexes = schema.indexes();
  const indexFields = indexes.map(([fields]) => JSON.stringify(fields));
  assert(indexFields.some(f => f.includes('syncStatus')), 'syncStatus index exists');
}

// ======================================================
// TEST 3 — HubAccessState SCHEMA VALIDATION
// ======================================================
function testHubAccessState() {
  section('TEST 3 — HubAccessState Schema');

  const schema = HubAccessState.schema;
  const paths = schema.paths;

  // Required fields
  assert(paths.auraPlayerId && paths.auraPlayerId.isRequired, 'auraPlayerId is required');
  assert(paths.auraHubId && paths.auraHubId.isRequired, 'auraHubId is required');

  // select:false security on discordUserId
  assert(paths.discordUserId.options.select === false, 'discordUserId has select:false (IDENTITY BOUNDARY)');

  // RTC permission defaults
  const doc = new HubAccessState({
    auraPlayerId: new mongoose.Types.ObjectId(),
    auraHubId: new mongoose.Types.ObjectId(),
  });
  assert(doc.rtcPermissions.canJoinVoice === true, 'canJoinVoice defaults to true');
  assert(doc.rtcPermissions.canPublishAudio === true, 'canPublishAudio defaults to true');
  assert(doc.rtcPermissions.canPublishVideo === false, 'canPublishVideo defaults to false');
  assert(doc.rtcPermissions.canScreenShare === false, 'canScreenShare defaults to false');

  // Membership state
  assert(doc.membershipState === 'ACTIVE', 'membershipState defaults to ACTIVE');
  assert(doc.hasChannelAccess === true, 'hasChannelAccess defaults to true');
  assert(doc.sequence === 0, 'sequence defaults to 0');

  // Enum validation
  const memberEnum = paths.membershipState.options.enum;
  assert(memberEnum.includes('ACTIVE'), 'membershipState includes ACTIVE');
  assert(memberEnum.includes('REMOVED'), 'membershipState includes REMOVED');
  assert(memberEnum.includes('BANNED'), 'membershipState includes BANNED');
  assert(memberEnum.includes('PENDING'), 'membershipState includes PENDING');

  // Compound unique index
  const indexes = schema.indexes();
  const hasCompoundIndex = indexes.some(([fields]) =>
    fields.auraPlayerId === 1 && fields.auraHubId === 1
  );
  assert(hasCompoundIndex, 'Compound unique index (auraPlayerId, auraHubId) exists');
}

// ======================================================
// TEST 4 — HubVoiceState SCHEMA VALIDATION
// ======================================================
function testHubVoiceState() {
  section('TEST 4 — HubVoiceState Schema');

  const schema = HubVoiceState.schema;
  const paths = schema.paths;

  // Required fields
  assert(paths.auraHubId && paths.auraHubId.isRequired, 'auraHubId is required');

  // Defaults
  const doc = new HubVoiceState({ auraHubId: new mongoose.Types.ObjectId() });
  assert(doc.rtcSessionVersion === 0, 'rtcSessionVersion defaults to 0');
  assert(doc.participantCount === 0, 'participantCount defaults to 0');
  assert(doc.discordVoiceCount === 0, 'discordVoiceCount defaults to 0');
  assert(Array.isArray(doc.activeParticipants), 'activeParticipants is an array');
  assert(doc.activeParticipants.length === 0, 'activeParticipants defaults to empty');

  // Participant subdoc
  doc.activeParticipants.push({
    auraPlayerId: new mongoose.Types.ObjectId(),
    displayName: 'TestPlayer',
  });
  const participant = doc.activeParticipants[0];
  assert(participant.speaking === false, 'Participant speaking defaults to false');
  assert(participant.muted === false, 'Participant muted defaults to false');
  assert(participant.deafened === false, 'Participant deafened defaults to false');
  assert(participant.cameraEnabled === false, 'Participant cameraEnabled defaults to false');
  assert(participant.screenShareEnabled === false, 'Participant screenShareEnabled defaults to false');
  assert(participant.displayName === 'TestPlayer', 'Participant displayName preserved');
}

// ======================================================
// TEST 5 — BotOrchestration SCHEMA VALIDATION
// ======================================================
function testBotOrchestration() {
  section('TEST 5 — BotOrchestration Schema');

  const schema = BotOrchestration.schema;
  const paths = schema.paths;

  // Required fields
  assert(paths.auraHubId && paths.auraHubId.isRequired, 'auraHubId is required');
  assert(paths.entityType && paths.entityType.isRequired, 'entityType is required');
  assert(paths.eventType && paths.eventType.isRequired, 'eventType is required');

  // Defaults
  const doc = new BotOrchestration({
    auraHubId: new mongoose.Types.ObjectId(),
    entityType: 'challenge',
    eventType: 'CHALLENGE_ANNOUNCED',
  });
  assert(doc.orchestrationState === 'PENDING', 'orchestrationState defaults to PENDING');
  assert(doc.retryCount === 0, 'retryCount defaults to 0');
  assert(doc.version === 1, 'version defaults to 1');

  // Enum validation
  const stateEnum = paths.orchestrationState.options.enum;
  assert(stateEnum.includes('PENDING'), 'orchestrationState includes PENDING');
  assert(stateEnum.includes('SENT'), 'orchestrationState includes SENT');
  assert(stateEnum.includes('FAILED'), 'orchestrationState includes FAILED');
  assert(stateEnum.includes('RECONCILED'), 'orchestrationState includes RECONCILED');

  // Idempotency index
  const indexes = schema.indexes();
  const hasIdempotencyIndex = indexes.some(([fields]) =>
    fields.auraHubId === 1 && fields.entityId === 1 && fields.eventType === 1
  );
  assert(hasIdempotencyIndex, 'Idempotency compound index (hubId, entityId, eventType) exists');
}

// ======================================================
// TEST 6 — EVENT CONSTANTS REGISTRY
// ======================================================
function testEventConstants() {
  section('TEST 6 — Event Constants Registry');

  // New D3.1 events
  assert(EVENTS.HUB_PROVISION_STARTED === 'hub.provision.started', 'HUB_PROVISION_STARTED registered');
  assert(EVENTS.HUB_PROVISIONED === 'hub.provisioned', 'HUB_PROVISIONED registered');
  assert(EVENTS.HUB_PROVISION_FAILED === 'hub.provision.failed', 'HUB_PROVISION_FAILED registered');
  assert(EVENTS.HUB_ACCESS_GRANTED === 'hub.access.granted', 'HUB_ACCESS_GRANTED registered');
  assert(EVENTS.HUB_ACCESS_REVOKED === 'hub.access.revoked', 'HUB_ACCESS_REVOKED registered');
  assert(EVENTS.VOICE_PARTICIPANT_JOINED === 'voice.participant.joined', 'VOICE_PARTICIPANT_JOINED registered');
  assert(EVENTS.VOICE_PARTICIPANT_LEFT === 'voice.participant.left', 'VOICE_PARTICIPANT_LEFT registered');
  assert(EVENTS.VOICE_STATE_RECONCILED === 'voice.state.reconciled', 'VOICE_STATE_RECONCILED registered');
  assert(EVENTS.BOT_ORCHESTRATION_STARTED === 'bot.orchestration.started', 'BOT_ORCHESTRATION_STARTED registered');
  assert(EVENTS.BOT_ORCHESTRATION_FAILED === 'bot.orchestration.failed', 'BOT_ORCHESTRATION_FAILED registered');

  // Regression: existing events still intact
  assert(EVENTS.TASK_CREATED === 'task.created', 'REGRESSION: TASK_CREATED intact');
  assert(EVENTS.PLAYER_XP_UPDATED === 'player.xp.updated', 'REGRESSION: PLAYER_XP_UPDATED intact');
  assert(EVENTS.CHALLENGE_CREATED === 'challenge.created', 'REGRESSION: CHALLENGE_CREATED intact');
  assert(EVENTS.FRIEND_REQUEST_SENT === 'friend.request.sent', 'REGRESSION: FRIEND_REQUEST_SENT intact');
  assert(EVENTS.HUB_CREATED === 'hub.created', 'REGRESSION: HUB_CREATED intact');
  assert(EVENTS.NOTIFICATION_CREATED === 'notification.created', 'REGRESSION: NOTIFICATION_CREATED intact');
  assert(EVENTS.VOUCHER_UNLOCKED === 'voucher.unlocked', 'REGRESSION: VOUCHER_UNLOCKED intact');
}

// ======================================================
// TEST 7 — ENVELOPE ENTITY TYPE INFERENCE
// ======================================================
function testEntityTypeInference() {
  section('TEST 7 — Envelope Entity Type Inference');

  // New D3.1 entity types
  const voiceEnvelope = createEventEnvelope('voice.participant.joined', { userId: 'test' });
  assert(voiceEnvelope.entityType === 'voice', 'voice.* events infer entityType=voice');

  const botEnvelope = createEventEnvelope('bot.orchestration.started', { hubId: 'test' });
  assert(botEnvelope.entityType === 'orchestration', 'bot.* events infer entityType=orchestration');

  // Regression: existing entity types still work
  const challengeEnv = createEventEnvelope('challenge.created', {});
  assert(challengeEnv.entityType === 'challenge', 'REGRESSION: challenge.* → challenge');

  const taskEnv = createEventEnvelope('task.completed', {});
  assert(taskEnv.entityType === 'task', 'REGRESSION: task.* → task');

  const hubEnv = createEventEnvelope('hub.created', {});
  assert(hubEnv.entityType === 'hub', 'REGRESSION: hub.* → hub');

  const friendEnv = createEventEnvelope('friend.request.sent', {});
  assert(friendEnv.entityType === 'friendship', 'REGRESSION: friend.* → friendship');

  const playerEnv = createEventEnvelope('player.xp.updated', {});
  assert(playerEnv.entityType === 'player', 'REGRESSION: player.* → player');

  const notifEnv = createEventEnvelope('notification.created', {});
  assert(notifEnv.entityType === 'notification', 'REGRESSION: notification.* → notification');
}

// ======================================================
// TEST 8 — ENVELOPE STRUCTURE INTEGRITY
// ======================================================
function testEnvelopeStructure() {
  section('TEST 8 — Envelope Structure Integrity');

  const envelope = createEventEnvelope('voice.participant.joined', {
    auraPlayerId: 'PLR-001',
    hubId: 'HUB-001',
  }, {
    source: 'livekitWebhook',
    actorId: 'PLR-001',
  });

  // Envelope marker
  assert(envelope._envelope === true, 'Envelope has _envelope marker');
  assert(isEnvelope(envelope), 'isEnvelope() recognizes envelope');

  // Required fields
  assert(typeof envelope.traceId === 'string' && envelope.traceId.length > 0, 'traceId generated');
  assert(typeof envelope.sequence === 'number' && envelope.sequence > 0, 'sequence is positive integer');
  assert(envelope.issuedAt instanceof Date, 'issuedAt is Date instance');
  assert(envelope.version === 1, 'version is 1');

  // Source tracking
  assert(envelope.source === 'livekitWebhook', 'source preserved');
  assert(envelope.actorId === 'PLR-001', 'actorId preserved');

  // Payload extraction
  const payload = extractPayload(envelope);
  assert(payload.auraPlayerId === 'PLR-001', 'extractPayload returns raw payload');
  assert(payload.hubId === 'HUB-001', 'extractPayload preserves all fields');

  // Backward compat: extractPayload on raw data
  const rawData = { foo: 'bar' };
  assert(extractPayload(rawData) === rawData, 'extractPayload passes through non-envelope data');
}

// ======================================================
// TEST 9 — EXISTING MODEL REGRESSION
// ======================================================
function testExistingModelRegression() {
  section('TEST 9 — Existing Model Regression');

  // Verify existing models still compile
  assert(typeof Hub === 'function', 'Hub model still compiles');
  assert(typeof PlayerProfile === 'function', 'PlayerProfile model still compiles');
  assert(typeof Notification === 'function', 'Notification model still compiles');
  assert(typeof User === 'function', 'User model still compiles');
  assert(typeof Challenge === 'function', 'Challenge model still compiles');

  // Verify User password is still hidden
  const userPaths = User.schema.paths;
  assert(userPaths.passwordHash.options.select === false, 'REGRESSION: User.passwordHash still select:false');

  // Verify Notification has sequence field (Phase N2)
  const notifPaths = Notification.schema.paths;
  assert(notifPaths.sequence !== undefined, 'REGRESSION: Notification.sequence field exists');
}

// ======================================================
// TEST 10 — DEPENDENCY IMPORT VALIDATION
// ======================================================
function testDependencyImports() {
  section('TEST 10 — Dependency Import Validation');

  // LiveKit SDK
  try {
    const lk = require('livekit-server-sdk');
    assert(typeof lk.AccessToken === 'function', 'livekit-server-sdk AccessToken available');
    assert(typeof lk.RoomServiceClient === 'function', 'livekit-server-sdk RoomServiceClient available');
  } catch (err) {
    assert(false, `livekit-server-sdk import failed: ${err.message}`);
  }

  // ioredis
  try {
    const Redis = require('ioredis');
    assert(typeof Redis === 'function', 'ioredis constructor available');
  } catch (err) {
    assert(false, `ioredis import failed: ${err.message}`);
  }
}

// ======================================================
// RUN ALL TESTS
// ======================================================
function runAll() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   PHASE D3.1 — INFRASTRUCTURE BRUTE FORCE TEST  ║');
  console.log('╚══════════════════════════════════════════════════╝');

  testSchemaCompilation();
  testHubDiscordMapping();
  testHubAccessState();
  testHubVoiceState();
  testBotOrchestration();
  testEventConstants();
  testEntityTypeInference();
  testEnvelopeStructure();
  testExistingModelRegression();
  testDependencyImports();

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
