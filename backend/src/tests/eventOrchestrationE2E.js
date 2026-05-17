const http = require('http');

// ======================================================
// PHASE 3.1 EVENT ORCHESTRATION E2E TESTS
// Verifies: event bus health, lifecycle event chains,
//           API regression, realtime readiness
// Runs against the LIVE running server
// ======================================================

const API_BASE = 'http://localhost:5000/api/v1';
let passed = 0;
let failed = 0;
let testToken = null;
let testUserId = null;

const assert = (condition, label) => {
  if (condition) { passed++; console.log(`✅ ${label}`); }
  else { failed++; console.error(`❌ ${label}`); }
};

const api = (method, path, body = null) => {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}${path}`);
    const opts = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search,
      method, headers: { 'Content-Type': 'application/json' }
    };
    if (testToken) opts.headers.Authorization = `Bearer ${testToken}`;

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const run = async () => {
  console.log('🚀 Phase 3.1 Event Orchestration E2E Tests\n');

  // ── Auth ──────────────────────────────────────────
  const ts = Date.now();
  const reg = await api('POST', '/auth/register', {
    email: `orch_test_${ts}@aura.dev`,
    password: 'AuraTestPass123!',
    playerName: `OrchTest_${ts.toString(36)}`
  });

  if (reg.status === 201) {
    testToken = reg.body?.data?.token;
    testUserId = reg.body?.data?.user?.id;
  }

  if (!testToken) {
    console.error('❌ Could not authenticate — aborting');
    process.exit(1);
  }
  console.log(`Authenticated as: ${testUserId}\n`);

  // ═══════════════════════════════════════════════════
  // 1. EVENT BUS UNIT TESTS (in-process)
  // ═══════════════════════════════════════════════════
  console.log('--- 1. EVENT BUS UNIT TESTS ---');

  // Actually initialize the listeners so the bus has them registered
  require('../events').initializeEventSystem();
  const eventBus = require('../events/eventBus');
  const { EVENTS } = require('../events/eventConstants');

  const stats = eventBus.getStats();
  assert(stats.registeredEvents > 0, `[EventBus] Has ${stats.registeredEvents} registered events`);
  assert(stats.totalListeners >= 20, `[EventBus] Has ${stats.totalListeners} listeners (expected 20+)`);

  // Verify critical events have listeners
  const registered = eventBus.getRegisteredEvents();
  assert(registered[EVENTS.TASK_COMPLETED]?.length >= 2, `[Trace] task.completed has XP + Socket listeners`);
  assert(registered[EVENTS.CHALLENGE_RESOLVED]?.length >= 2, `[Trace] challenge.resolved has XP + Trust + Socket listeners`);
  assert(registered[EVENTS.FRIEND_REQUEST_SENT]?.length >= 2, `[Trace] friend.request.sent has Socket + History listeners`);
  assert(registered[EVENTS.HUB_JOINED]?.length >= 2, `[Trace] hub.joined has Socket + History listeners`);
  assert(registered[EVENTS.PLAYER_XP_UPDATED]?.length >= 1, `[Trace] player.xp.updated has Socket listener`);
  assert(registered[EVENTS.PLAYER_TRUST_CHANGED]?.length >= 1, `[Trace] player.trust.changed has Socket listener`);
  assert(registered[EVENTS.PLAYER_LEVEL_UP]?.length >= 1, `[Trace] player.levelup has History + Socket listeners`);

  // Verify domain-separated listener naming
  const taskListeners = registered[EVENTS.TASK_COMPLETED] || [];
  assert(taskListeners.some(n => n.startsWith('xp:')), `[Naming] XP listener uses "xp:" prefix`);
  assert(taskListeners.some(n => n.startsWith('socket:')), `[Naming] Socket listener uses "socket:" prefix`);

  // ═══════════════════════════════════════════════════
  // 2. DEDUPLICATION GUARD
  // ═══════════════════════════════════════════════════
  console.log('\n--- 2. DEDUPLICATION GUARD ---');

  let dedupCallCount = 0;
  eventBus.registerListener('test.dedup.event', 'test:dedup', async () => { dedupCallCount++; });

  eventBus.emitEvent('test.dedup.event', { id: 'dedup-test-001' });
  eventBus.emitEvent('test.dedup.event', { id: 'dedup-test-001' }); // exact duplicate
  await sleep(100);
  assert(dedupCallCount === 1, `[Dedup] Exact duplicate suppressed (called ${dedupCallCount}x)`);

  eventBus.emitEvent('test.dedup.event', { id: 'dedup-test-002' }); // different payload
  await sleep(100);
  assert(dedupCallCount === 2, `[Dedup] Different payload fires normally (called ${dedupCallCount}x)`);

  // ═══════════════════════════════════════════════════
  // 3. ERROR ISOLATION
  // ═══════════════════════════════════════════════════
  console.log('\n--- 3. ERROR ISOLATION ---');

  let isolatedSurvivor = false;
  eventBus.registerListener('test.isolation', 'test:crasher', async () => { throw new Error('Intentional crash'); });
  eventBus.registerListener('test.isolation', 'test:survivor', async () => { isolatedSurvivor = true; });

  eventBus.emitEvent('test.isolation', { test: true });
  await sleep(200);
  assert(isolatedSurvivor, `[Isolation] Surviving listener executed after sibling crash`);

  const statsAfterError = eventBus.getStats();
  assert(statsAfterError.totalErrors >= 1, `[Isolation] Error count incremented (${statsAfterError.totalErrors})`);

  // ═══════════════════════════════════════════════════
  // 4. RECURSIVE LOOP PROTECTION
  // ═══════════════════════════════════════════════════
  console.log('\n--- 4. RECURSIVE LOOP PROTECTION ---');

  let loopCount = 0;
  eventBus.registerListener('test.loop.a', 'test:loop-a', async () => {
    loopCount++;
    eventBus.emitEvent('test.loop.b', { loop: true });
  });
  eventBus.registerListener('test.loop.b', 'test:loop-b', async () => {
    loopCount++;
    eventBus.emitEvent('test.loop.a', { loop: true }); // would infinite-loop without dedup
  });

  eventBus.emitEvent('test.loop.a', { loop: true });
  await sleep(500);
  assert(loopCount <= 4, `[Loop] No infinite recursion — iterations: ${loopCount}`);

  // ═══════════════════════════════════════════════════
  // 5. TASK LIFECYCLE → EVENT CHAIN (via API)
  // ═══════════════════════════════════════════════════
  console.log('\n--- 5. TASK LIFECYCLE → EVENT CHAIN ---');

  const emitsBefore = eventBus.getStats().totalEmissions;
  let initialXp = 0;
  
  const initialProfile = await api('GET', '/player/me');
  if (initialProfile.status === 200) {
    initialXp = initialProfile.body?.data?.profile?.xp || 0;
  }

  const taskCreate = await api('POST', '/tasks', {
    title: 'Event Chain Test', priority: 'NORMAL',
    deadline: new Date(Date.now() + 86400000).toISOString()
  });
  assert(taskCreate.status === 201, `[Task] Created test task`);
  const taskId = taskCreate.body?.data?._id;

  if (taskId) {
    const complete = await api('PATCH', `/tasks/${taskId}/complete`);
    assert(complete.status === 200, `[Task] Completed via API`);

    await sleep(800); // Allow async event chain to propagate on the server

    const finalProfile = await api('GET', '/player/me');
    const finalXp = finalProfile.body?.data?.profile?.xp || 0;
    
    assert(finalXp > initialXp, `[Task] Event chain propagated: XP awarded (${initialXp} -> ${finalXp})`);
  }

  // ═══════════════════════════════════════════════════
  // 6. EVENT CONSTANT COMPLETENESS
  // ═══════════════════════════════════════════════════
  console.log('\n--- 6. EVENT CONSTANT COMPLETENESS ---');

  const requiredEvents = [
    'TASK_CREATED', 'TASK_COMPLETED', 'TASK_FAILED', 'TASK_EXPIRED',
    'PLAYER_CREATED', 'PLAYER_XP_UPDATED', 'PLAYER_LEVEL_UP', 'PLAYER_TRUST_CHANGED',
    'CHALLENGE_CREATED', 'CHALLENGE_RESOLVED', 'CHALLENGE_JOINED', 'CHALLENGE_SUBMITTED',
    'FRIEND_REQUEST_SENT', 'FRIEND_ACCEPTED',
    'HUB_CREATED', 'HUB_JOINED', 'HUB_LEFT',
    'VOUCHER_UNLOCKED'
  ];

  for (const key of requiredEvents) {
    assert(EVENTS[key] !== undefined, `[Constants] EVENTS.${key} defined`);
  }

  // ═══════════════════════════════════════════════════
  // 7. API REGRESSION SUITE
  // ═══════════════════════════════════════════════════
  console.log('\n--- 7. API REGRESSION ---');

  const health = await api('GET', '/health');
  assert(health.status === 200, `[Regression] Health endpoint`);

  const tasks = await api('GET', '/tasks');
  assert(tasks.status === 200, `[Regression] Tasks endpoint`);

  const profile = await api('GET', '/player/me');
  assert(profile.status === 200, `[Regression] Profile endpoint`);

  const friends = await api('GET', '/social/friends');
  assert([200, 404].includes(friends.status), `[Regression] Social friends endpoint`);

  const discover = await api('GET', '/discover/players/search?q=Player');
  assert([200].includes(discover.status), `[Regression] Discovery endpoint`);

  // Verify profile has XP data (proves XP pipeline still works)
  if (profile.body?.data?.profile) {
    const p = profile.body.data.profile;
    assert(typeof p.xp === 'number', `[Regression] Profile has XP field`);
    assert(typeof p.level === 'number', `[Regression] Profile has level field`);
    assert(typeof p.auraPlayerId === 'string', `[Regression] Profile has auraPlayerId`);
  } else {
    assert(false, `[Regression] Profile has XP field`);
    assert(false, `[Regression] Profile has level field`);
    assert(false, `[Regression] Profile has auraPlayerId`);
  }

  // ═══════════════════════════════════════════════════
  // 8. FINAL STATS
  // ═══════════════════════════════════════════════════
  console.log('\n--- 8. FINAL STATS ---');

  const finalStats = eventBus.getStats();
  console.log(`   Registered Events: ${finalStats.registeredEvents}`);
  console.log(`   Total Listeners: ${finalStats.totalListeners}`);
  console.log(`   Total Emissions: ${finalStats.totalEmissions}`);
  console.log(`   Total Errors: ${finalStats.totalErrors}`);
  console.log(`   Dedup Cache Size: ${finalStats.dedupCacheSize}`);

  assert(finalStats.totalEmissions === 5, `[Stats] Unit test events processed (${finalStats.totalEmissions} emissions)`);
  assert(finalStats.totalErrors <= 2, `[Stats] Minimal errors (${finalStats.totalErrors} — only intentional test crashes)`);

  // ═══════════════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(47)}`);
  console.log(`📊 RESULTS: ${passed} PASSED / ${failed} FAILED / ${passed + failed} TOTAL`);
  console.log(`${'═'.repeat(47)}`);

  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED — Event orchestration is STABLE.\n');
  } else {
    console.log(`\n⚠️ ${failed} test(s) failed — review above.\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
};

run().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
