// ======================================================
// PHASE D3.3.A — LIFECYCLE RECONCILIATION TEST
//
// Validates the WIRING that was MISSING in D3.3:
//   1. socketListener has message.created → hub broadcast
//   2. socketListener has presence.updated → hub broadcast
//   3. socketListener has voice events → hub broadcast
//   4. socketServer emits presence.updated on room join
//   5. socketServer emits presence.updated on disconnect
//   6. socketRegistry.get() exists
//   7. _resolveHubAuraId helper exists in socketListener
//   8. Hub model imported in socketListener
//   9. EventBus wiring: all D3.3 events have socket transport
//  10. Frontend: MessageContext matches hubId correctly
//  11. Frontend: presence listener matches auraHubId
//  12. End-to-end lifecycle completeness
//
// Run: node src/tests/d3LifecycleTest.js
// ======================================================

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName) {
  if (condition) { passed++; console.log(`  ✅ ${testName}`); }
  else { failed++; failures.push(testName); console.log(`  ❌ ${testName}`); }
}

function section(name) {
  console.log(`\n────────────────────────────────────`);
  console.log(`  ${name}`);
  console.log(`────────────────────────────────────`);
}

// ── Read source files ────────────────────────────────
const socketListenerSrc = fs.readFileSync(
  path.resolve(__dirname, '../events/listeners/socketListener.js'), 'utf8'
);
const socketServerSrc = fs.readFileSync(
  path.resolve(__dirname, '../realtime/socketServer.js'), 'utf8'
);
const socketRegistrySrc = fs.readFileSync(
  path.resolve(__dirname, '../realtime/socketRegistry.js'), 'utf8'
);
const hubDetailSrc = fs.readFileSync(
  path.resolve(__dirname, '../../../frontend/src/pages/HubDetailPage.jsx'), 'utf8'
);
const messageCtxSrc = fs.readFileSync(
  path.resolve(__dirname, '../../../frontend/src/context/MessageContext.jsx'), 'utf8'
);
const socketCtxSrc = fs.readFileSync(
  path.resolve(__dirname, '../../../frontend/src/context/SocketContext.jsx'), 'utf8'
);

// ======================================================
// TEST 1 — Socket Listener Message Wiring
// ======================================================
function testMessageWiring() {
  section('TEST 1 — Socket Listener Message Wiring');

  assert(socketListenerSrc.includes('MESSAGE_CREATED'), 'socketListener registers MESSAGE_CREATED');
  assert(socketListenerSrc.includes('MESSAGE_EDITED'), 'socketListener registers MESSAGE_EDITED');
  assert(socketListenerSrc.includes('MESSAGE_DELETED'), 'socketListener registers MESSAGE_DELETED');
  assert(socketListenerSrc.includes("'socket:message.created'"), 'Listener name: socket:message.created');
  assert(socketListenerSrc.includes("emitToHub(hub, 'message.created'"), 'Emits message.created to hub room');
}

// ======================================================
// TEST 2 — Socket Listener Presence Wiring
// ======================================================
function testPresenceWiring() {
  section('TEST 2 — Socket Listener Presence Wiring');

  assert(socketListenerSrc.includes('PRESENCE_UPDATED'), 'socketListener registers PRESENCE_UPDATED');
  assert(socketListenerSrc.includes('PRESENCE_RECONCILED'), 'socketListener registers PRESENCE_RECONCILED');
  assert(socketListenerSrc.includes("'socket:presence.updated'"), 'Listener name: socket:presence.updated');
  assert(socketListenerSrc.includes("emitToHub(hub, 'presence.updated'"), 'Emits presence.updated to hub room');
}

// ======================================================
// TEST 3 — Socket Listener Voice Wiring
// ======================================================
function testVoiceWiring() {
  section('TEST 3 — Socket Listener Voice Wiring');

  assert(socketListenerSrc.includes('VOICE_PARTICIPANT_JOINED'), 'socketListener registers VOICE_PARTICIPANT_JOINED');
  assert(socketListenerSrc.includes('VOICE_PARTICIPANT_LEFT'), 'socketListener registers VOICE_PARTICIPANT_LEFT');
  assert(socketListenerSrc.includes("'socket:voice.participant.joined'"), 'Listener name for voice join');
  assert(socketListenerSrc.includes("'socket:voice.participant.left'"), 'Listener name for voice leave');
}

// ======================================================
// TEST 4 — Hub ID Resolution
// ======================================================
function testHubResolution() {
  section('TEST 4 — Hub ID Resolution');

  assert(socketListenerSrc.includes("require('../../models/Hub')"), 'socketListener imports Hub model');
  assert(socketListenerSrc.includes('_resolveHubAuraId'), 'socketListener has _resolveHubAuraId helper');
  assert(socketListenerSrc.includes('AURA-HUB-'), '_resolveHubAuraId checks AURA-HUB- prefix');
  assert(socketListenerSrc.includes('_hubAuraIdCache'), 'Hub resolution uses cache');
}

// ======================================================
// TEST 5 — Socket Server Presence Lifecycle
// ======================================================
function testServerPresenceLifecycle() {
  section('TEST 5 — Socket Server Presence Lifecycle');

  assert(socketServerSrc.includes("require('../events/eventBus')"), 'socketServer imports EventBus');
  assert(socketServerSrc.includes("require('../events/eventConstants')"), 'socketServer imports EVENTS');
  assert(socketServerSrc.includes('PRESENCE_UPDATED'), 'socketServer emits PRESENCE_UPDATED');

  // Room join → presence online
  assert(socketServerSrc.includes("online: true"), 'Room join emits online: true');

  // Disconnect → presence offline
  assert(socketServerSrc.includes("online: false"), 'Disconnect emits online: false');

  // Reads rooms before unregister
  assert(socketServerSrc.includes('socketRegistry.get(socket.id)'), 'Reads rooms before unregister on disconnect');
}

// ======================================================
// TEST 6 — Socket Registry get() Method
// ======================================================
function testRegistryGet() {
  section('TEST 6 — Socket Registry get() Method');

  const socketRegistry = require('../realtime/socketRegistry');
  assert(typeof socketRegistry.get === 'function', 'socketRegistry.get() exists');

  // Test it returns null for unknown socket
  assert(socketRegistry.get('nonexistent') === null, 'get() returns null for unknown socket');
}

// ======================================================
// TEST 7 — Frontend Presence Matching
// ======================================================
function testFrontendPresence() {
  section('TEST 7 — Frontend Presence Matching');

  assert(hubDetailSrc.includes('auraHubId'), 'HubDetailPage uses auraHubId');
  assert(hubDetailSrc.includes("payload?.auraHubId === hub.auraHubId"), 'Presence matches on auraHubId');
  assert(hubDetailSrc.includes('voice.participant.joined'), 'HubDetailPage listens for voice join');
  assert(hubDetailSrc.includes('voice.participant.left'), 'HubDetailPage listens for voice leave');
  assert(hubDetailSrc.includes('inVoice: true'), 'Voice join sets inVoice: true');
}

// ======================================================
// TEST 8 — Frontend Message Lifecycle
// ======================================================
function testFrontendMessages() {
  section('TEST 8 — Frontend Message Lifecycle');

  assert(messageCtxSrc.includes('ADD_OPTIMISTIC'), 'MessageContext has ADD_OPTIMISTIC action');
  assert(messageCtxSrc.includes('MARK_FAILED'), 'MessageContext has MARK_FAILED action');
  assert(messageCtxSrc.includes('REPLAY_MERGE'), 'MessageContext has REPLAY_MERGE action');
  assert(messageCtxSrc.includes('sendMessage'), 'MessageContext exposes sendMessage');
  assert(messageCtxSrc.includes('requestReplay'), 'MessageContext exposes requestReplay');
  assert(messageCtxSrc.includes("apiService.post(`/hubs/${hubId}/messages`"), 'sendMessage calls POST /messages');
  assert(messageCtxSrc.includes('tempId'), 'Optimistic uses tempId');
}

// ======================================================
// TEST 9 — Socket Bridge Completeness (D3.3.A)
// ======================================================
function testBridgeCompleteness() {
  section('TEST 9 — Socket Bridge Completeness (D3.3.A)');

  const requiredBridges = [
    'message.created', 'message.edited', 'message.deleted', 'message.replayed',
    'presence.updated', 'presence.reconciled',
    'voice.participant.joined', 'voice.participant.left',
  ];

  for (const event of requiredBridges) {
    assert(socketCtxSrc.includes(`'${event}'`), `SocketContext bridges '${event}'`);
  }
}

// ======================================================
// TEST 10 — End-to-End Lifecycle Audit
// ======================================================
function testEndToEndLifecycle() {
  section('TEST 10 — End-to-End Lifecycle Audit');

  // Message lifecycle: UI → POST → persist → eventBus → socketListener → socketEmitter → socket → SocketContext bridge → eventBus → MessageContext
  assert(messageCtxSrc.includes("apiService.post"), '1. UI sends POST /messages');
  const msgSvcSrc = fs.readFileSync(path.resolve(__dirname, '../services/domains/messageDomainService.js'), 'utf8');
  assert(msgSvcSrc.includes('HubMessage.create'), '2. Domain service persists HubMessage');
  assert(msgSvcSrc.includes("auraEvents.emitEvent('message.created'"), '3. Domain service emits message.created');
  assert(socketListenerSrc.includes("EVENTS.MESSAGE_CREATED"), '4. socketListener receives message.created');
  assert(socketListenerSrc.includes("emitToHub(hub, 'message.created'"), '5. socketListener → emitToHub');
  assert(socketCtxSrc.includes("makeBridge('message.created')"), '6. SocketContext bridges message.created');
  assert(messageCtxSrc.includes("eventBus.on('message.created'"), '7. MessageContext listens via eventBus');
  assert(messageCtxSrc.includes("dispatch({ type: 'ADD_MESSAGE'"), '8. Reducer dispatches ADD_MESSAGE');

  // Presence lifecycle
  assert(socketServerSrc.includes('EVENTS.PRESENCE_UPDATED'), 'P1. socketServer emits PRESENCE_UPDATED on room join');
  assert(socketListenerSrc.includes('EVENTS.PRESENCE_UPDATED'), 'P2. socketListener receives PRESENCE_UPDATED');
  assert(socketCtxSrc.includes("makeBridge('presence.updated')"), 'P3. SocketContext bridges presence.updated');
  assert(hubDetailSrc.includes("eventBus.on('presence.updated'"), 'P4. HubDetailPage listens for presence.updated');
}

// ======================================================
// RUN ALL
// ======================================================
function runAll() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   PHASE D3.3.A — LIFECYCLE RECONCILIATION TEST  ║');
  console.log('╚══════════════════════════════════════════════════╝');

  testMessageWiring();
  testPresenceWiring();
  testVoiceWiring();
  testHubResolution();
  testServerPresenceLifecycle();
  testRegistryGet();
  testFrontendPresence();
  testFrontendMessages();
  testBridgeCompleteness();
  testEndToEndLifecycle();

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
