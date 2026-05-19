// ======================================================
// PHASE D3.3 — COMMUNICATION RUNTIME BRUTE FORCE TEST
//
// Validates:
//   1. HubMessage schema compilation
//   2. MessageDomainService compilation
//   3. Message routes compilation
//   4. RTC routes compilation
//   5. Event constants completeness (D3.3)
//   6. Entity type inference (message.*, presence.*)
//   7. Identity discipline — no discordUserId in frontend
//   8. Ownership boundaries
//   9. Fault isolation
//  10. Existing system regression (D3.1 + D3.2)
//  11. Socket bridge completeness
//  12. Route registration integrity
//
// Run: node src/tests/d3CommTest.js
// ======================================================

// ── Load D3.3 modules ────────────────────────────────
const HubMessage = require('../models/HubMessage');
const messageDomainService = require('../services/domains/messageDomainService');

// ── Load D3.2 modules (regression) ───────────────────
const redisClient = require('../realtime/redis/redisClient');
const redisStreams = require('../realtime/redis/redisStreams');
const { presenceService } = require('../presence');
const { livekitTokenService, rtcAuthorization } = require('../rtc');

// ── Load D3.1 schemas (regression) ───────────────────
const HubDiscordMapping = require('../models/HubDiscordMapping');
const HubAccessState = require('../models/HubAccessState');
const HubVoiceState = require('../models/HubVoiceState');
const BotOrchestration = require('../models/BotOrchestration');

// ── Load event system ────────────────────────────────
const { EVENTS } = require('../events/eventConstants');
const { createEventEnvelope, isEnvelope, extractPayload } = require('../events/createEventEnvelope');

// ── Load routes (compilation check) ──────────────────
const messageRoutes = require('../routes/messageRoutes');
const rtcRoutes = require('../routes/rtcRoutes');

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

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
// TEST 1 — HubMessage Schema
// ======================================================
function testHubMessageSchema() {
  section('TEST 1 — HubMessage Schema');

  assert(typeof HubMessage === 'function', 'HubMessage compiles as model');
  assert(HubMessage.modelName === 'HubMessage', 'Model name correct');

  const schema = HubMessage.schema;
  const paths = schema.paths;

  assert(paths.hubId && paths.hubId.isRequired, 'hubId required');
  assert(paths.senderId && paths.senderId.isRequired, 'senderId required');
  assert(paths.senderName && paths.senderName.isRequired, 'senderName required');
  assert(paths.content && paths.content.isRequired, 'content required');
  assert(paths.sequence && paths.sequence.isRequired, 'sequence required');

  // Content type enum
  const ctEnum = paths.contentType.options.enum;
  assert(ctEnum.includes('text'), 'contentType includes text');
  assert(ctEnum.includes('system'), 'contentType includes system');

  // Source enum
  const srcEnum = paths.source.options.enum;
  assert(srcEnum.includes('aura'), 'source includes aura');
  assert(srcEnum.includes('discord'), 'source includes discord');

  // Defaults
  const doc = new HubMessage({
    hubId: new mongoose.Types.ObjectId(),
    senderId: new mongoose.Types.ObjectId(),
    senderName: 'Test',
    content: 'Hello',
    sequence: 1,
  });
  assert(doc.contentType === 'text', 'contentType defaults to text');
  assert(doc.source === 'aura', 'source defaults to aura');
  assert(doc.edited === false, 'edited defaults to false');
  assert(doc.deleted === false, 'deleted defaults to false');
  assert(doc.version === 1, 'version defaults to 1');

  // Indexes
  const indexes = schema.indexes();
  const hasHubSeqIndex = indexes.some(([f]) => f.hubId === 1 && f.sequence === 1);
  assert(hasHubSeqIndex, 'hubId+sequence index exists');
}

// ======================================================
// TEST 2 — MessageDomainService
// ======================================================
function testMessageDomainService() {
  section('TEST 2 — MessageDomainService');

  assert(typeof messageDomainService.sendMessage === 'function', 'sendMessage exists');
  assert(typeof messageDomainService.editMessage === 'function', 'editMessage exists');
  assert(typeof messageDomainService.deleteMessage === 'function', 'deleteMessage exists');
  assert(typeof messageDomainService.getHistory === 'function', 'getHistory exists');
  assert(typeof messageDomainService.replayAfterSequence === 'function', 'replayAfterSequence exists');
  assert(typeof messageDomainService.getMetrics === 'function', 'getMetrics exists');

  const metrics = messageDomainService.getMetrics();
  assert('sent' in metrics, 'Metrics has sent');
  assert('replayed' in metrics, 'Metrics has replayed');
  assert('rejected' in metrics, 'Metrics has rejected');
  assert('failures' in metrics, 'Metrics has failures');
}

// ======================================================
// TEST 3 — Routes Compilation
// ======================================================
function testRoutes() {
  section('TEST 3 — Routes Compilation');

  assert(typeof messageRoutes === 'function', 'messageRoutes compiles as Express router');
  assert(typeof rtcRoutes === 'function', 'rtcRoutes compiles as Express router');

  // Check route count
  const msgStack = messageRoutes.stack.filter(l => l.route);
  assert(msgStack.length >= 4, `messageRoutes has ${msgStack.length} routes (expected >= 4)`);

  const rtcStack = rtcRoutes.stack.filter(l => l.route);
  assert(rtcStack.length >= 2, `rtcRoutes has ${rtcStack.length} routes (expected >= 2)`);
}

// ======================================================
// TEST 4 — Event Constants (D3.3)
// ======================================================
function testEventConstants() {
  section('TEST 4 — Event Constants (D3.3)');

  assert(EVENTS.MESSAGE_CREATED === 'message.created', 'MESSAGE_CREATED registered');
  assert(EVENTS.MESSAGE_EDITED === 'message.edited', 'MESSAGE_EDITED registered');
  assert(EVENTS.MESSAGE_DELETED === 'message.deleted', 'MESSAGE_DELETED registered');
  assert(EVENTS.MESSAGE_REPLAYED === 'message.replayed', 'MESSAGE_REPLAYED registered');
  assert(EVENTS.MESSAGE_FAILED === 'message.failed', 'MESSAGE_FAILED registered');
  assert(EVENTS.PRESENCE_UPDATED === 'presence.updated', 'PRESENCE_UPDATED registered');
  assert(EVENTS.PRESENCE_RECONCILED === 'presence.reconciled', 'PRESENCE_RECONCILED registered');

  // Regression
  assert(EVENTS.TASK_CREATED === 'task.created', 'REGRESSION: TASK_CREATED');
  assert(EVENTS.HUB_CREATED === 'hub.created', 'REGRESSION: HUB_CREATED');
  assert(EVENTS.VOICE_PARTICIPANT_JOINED === 'voice.participant.joined', 'REGRESSION: VOICE_PARTICIPANT_JOINED');
}

// ======================================================
// TEST 5 — Entity Type Inference (D3.3)
// ======================================================
function testEntityInference() {
  section('TEST 5 — Entity Type Inference (D3.3)');

  const msgEnv = createEventEnvelope('message.created', { content: 'hello' });
  assert(msgEnv.entityType === 'message', 'message.* → entityType=message');

  const presEnv = createEventEnvelope('presence.updated', {});
  assert(presEnv.entityType === 'presence', 'presence.* → entityType=presence');

  // Regression
  const voiceEnv = createEventEnvelope('voice.participant.joined', {});
  assert(voiceEnv.entityType === 'voice', 'REGRESSION: voice.* → voice');

  const hubEnv = createEventEnvelope('hub.created', {});
  assert(hubEnv.entityType === 'hub', 'REGRESSION: hub.* → hub');
}

// ======================================================
// TEST 6 — Identity Discipline (Frontend Audit)
// ======================================================
function testFrontendIdentity() {
  section('TEST 6 — Identity Discipline (Frontend Audit)');

  // Check that no frontend context files reference discordUserId
  const contextDir = path.resolve(__dirname, '../../../frontend/src/context');
  const frontendFiles = fs.existsSync(contextDir)
    ? fs.readdirSync(contextDir).filter(f => f.endsWith('.jsx'))
    : [];

  if (frontendFiles.length === 0) {
    console.log('  ⚠️ Skipping frontend audit (no context files found)');
    return;
  }

  for (const file of frontendFiles) {
    const content = fs.readFileSync(path.join(contextDir, file), 'utf8');
    const hasDiscordId = content.includes('discordUserId');
    assert(!hasDiscordId, `${file} does NOT reference discordUserId`);
  }
}

// ======================================================
// TEST 7 — Ownership Boundaries
// ======================================================
function testOwnership() {
  section('TEST 7 — Ownership Boundaries');

  // MessageDomainService does not import socketClient/socketEmitter
  const msgSvcSrc = fs.readFileSync(
    path.resolve(__dirname, '../services/domains/messageDomainService.js'), 'utf8'
  );
  assert(!msgSvcSrc.includes('socketEmitter'), 'MessageService does not import socketEmitter');
  assert(!msgSvcSrc.includes('socketClient'), 'MessageService does not import socketClient');
  assert(msgSvcSrc.includes('eventBus'), 'MessageService uses EventBus (correct)');
  assert(msgSvcSrc.includes('redisStreams'), 'MessageService uses redisStreams (correct)');

  // RTC routes do not directly import Redis
  const rtcSrc = fs.readFileSync(
    path.resolve(__dirname, '../routes/rtcRoutes.js'), 'utf8'
  );
  assert(!rtcSrc.includes('ioredis'), 'RTC routes do not import ioredis directly');
  assert(!rtcSrc.includes('redisClient'), 'RTC routes do not import redisClient directly');
}

// ======================================================
// TEST 8 — Socket Bridge Completeness
// ======================================================
function testSocketBridges() {
  section('TEST 8 — Socket Bridge Completeness');

  const socketCtxPath = path.resolve(__dirname, '../../../frontend/src/context/SocketContext.jsx');
  if (!fs.existsSync(socketCtxPath)) {
    console.log('  ⚠️ Skipping socket bridge test (SocketContext not found)');
    return;
  }

  const socketCtx = fs.readFileSync(socketCtxPath, 'utf8');

  assert(socketCtx.includes("'message.created'"), 'Socket bridges message.created');
  assert(socketCtx.includes("'message.edited'"), 'Socket bridges message.edited');
  assert(socketCtx.includes("'message.deleted'"), 'Socket bridges message.deleted');
  assert(socketCtx.includes("'presence.updated'"), 'Socket bridges presence.updated');
  assert(socketCtx.includes("'voice.participant.joined'"), 'Socket bridges voice.participant.joined');
  assert(socketCtx.includes("'voice.participant.left'"), 'Socket bridges voice.participant.left');
}

// ======================================================
// TEST 9 — D3.2 Regression
// ======================================================
function testD32Regression() {
  section('TEST 9 — D3.2 Regression');

  assert(typeof redisClient.getClient === 'function', 'REGRESSION: redisClient.getClient');
  assert(typeof redisStreams.appendMessage === 'function', 'REGRESSION: redisStreams.appendMessage');
  assert(typeof presenceService.playerJoinedHub === 'function', 'REGRESSION: presenceService.playerJoinedHub');
  assert(typeof livekitTokenService.mintToken === 'function', 'REGRESSION: livekitTokenService.mintToken');
  assert(typeof rtcAuthorization.authorizeAndMint === 'function', 'REGRESSION: rtcAuthorization.authorizeAndMint');
}

// ======================================================
// TEST 10 — D3.1 Regression
// ======================================================
function testD31Regression() {
  section('TEST 10 — D3.1 Regression');

  assert(typeof HubDiscordMapping === 'function', 'REGRESSION: HubDiscordMapping compiles');
  assert(typeof HubAccessState === 'function', 'REGRESSION: HubAccessState compiles');
  assert(typeof HubVoiceState === 'function', 'REGRESSION: HubVoiceState compiles');
  assert(typeof BotOrchestration === 'function', 'REGRESSION: BotOrchestration compiles');

  // Security: select:false fields still protected
  assert(HubAccessState.schema.paths.discordUserId.options.select === false, 'REGRESSION: discordUserId select:false');
  assert(HubDiscordMapping.schema.paths.webhookUrl.options.select === false, 'REGRESSION: webhookUrl select:false');
}

// ======================================================
// TEST 11 — Server Route Registration
// ======================================================
function testServerRegistration() {
  section('TEST 11 — Server Route Registration');

  const serverSrc = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
  assert(serverSrc.includes('messageRoutes'), 'Server registers messageRoutes');
  assert(serverSrc.includes('rtcRoutes'), 'Server registers rtcRoutes');
  assert(serverSrc.includes("app.use('/api/v1/hubs', messageRoutes)"), 'messageRoutes mounted at /api/v1/hubs');
  assert(serverSrc.includes("app.use('/api/v1/hubs', rtcRoutes)"), 'rtcRoutes mounted at /api/v1/hubs');
}

// ======================================================
// TEST 12 — Fault Isolation (Redis-down)
// ======================================================
async function testFaultIsolation() {
  section('TEST 12 — Fault Isolation (Redis-down)');

  // Redis not connected — stream ops degrade
  try {
    const result = await redisStreams.appendMessage('test-hub', { content: 'test' });
    assert(result === null, 'appendMessage degrades to null when Redis not ready');
  } catch {
    assert(false, 'appendMessage threw instead of degrading');
  }

  try {
    const replay = await redisStreams.replayAfterSequence('test-hub', 0);
    assert(Array.isArray(replay) && replay.length === 0, 'replayAfterSequence degrades to empty');
  } catch {
    assert(false, 'replayAfterSequence threw instead of degrading');
  }
}

// ======================================================
// RUN ALL
// ======================================================
async function runAll() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   PHASE D3.3 — COMMUNICATION RUNTIME TEST       ║');
  console.log('╚══════════════════════════════════════════════════╝');

  testHubMessageSchema();
  testMessageDomainService();
  testRoutes();
  testEventConstants();
  testEntityInference();
  testFrontendIdentity();
  testOwnership();
  testSocketBridges();
  testD32Regression();
  testD31Regression();
  testServerRegistration();
  await testFaultIsolation();

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
