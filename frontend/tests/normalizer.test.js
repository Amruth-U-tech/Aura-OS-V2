/**
 * Phase 3.1.2 — Orchestrator + Normalizer Test Suite
 *
 * Tests:
 *   1. stateNormalizers  — safeArray, normalizeChallenge, safeAppend, safeUpdate, safeRemove
 *   2. fetchOrchestrator — single-flight, cooldown, hydration lock, rate-limit backoff
 *
 * Run: node tests/normalizer.test.js
 * Requires: Node >= 18 (ESM + top-level await)
 *
 * Uses RELATIVE paths (no Vite aliases) so Node can resolve without bundling.
 */

// ── Relative imports (no @utils alias — Node doesn't know Vite aliases) ──────
import {
  safeArray,
  normalizeChallenge,
  safeAppend,
  safeUpdate,
  safeRemove,
} from '../src/utils/stateNormalizers.js';
import { fetchOrchestrator } from '../src/utils/fetchOrchestrator.js';

// ── Test helpers ──────────────────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;

function assertEqual(actual, expected, testName) {
  const aStr = JSON.stringify(actual);
  const eStr = JSON.stringify(expected);
  if (aStr === eStr) {
    console.log(`  ✅ PASS  ${testName}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL  ${testName}`);
    console.error(`     Expected: ${eStr}`);
    console.error(`     Actual:   ${aStr}`);
    failCount++;
  }
}

function assertTruthy(actual, testName) {
  if (actual) {
    console.log(`  ✅ PASS  ${testName}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL  ${testName} — got falsy: ${actual}`);
    failCount++;
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

// ══════════════════════════════════════════════════════════════
// SECTION 1 — stateNormalizers
// ══════════════════════════════════════════════════════════════
section('1. stateNormalizers — safeArray');

assertEqual(safeArray(null),      [],       'safeArray(null)      → []');
assertEqual(safeArray(undefined), [],       'safeArray(undefined) → []');
assertEqual(safeArray([1, 2]),    [1, 2],   'safeArray([1,2])     → [1,2]');
assertEqual(
  safeArray({ challenges: [1, 2] }), [1, 2],
  'safeArray({challenges:[1,2]}) → [1,2]'
);
assertEqual(
  safeArray({ error: 'not found' }), [],
  'safeArray({error})            → []'
);

section('1. stateNormalizers — normalizeChallenge');

assertEqual(normalizeChallenge(null), null, 'normalizeChallenge(null) → null');
assertEqual(
  normalizeChallenge({ id: '123' })._id, '123',
  'normalizeChallenge({id:"123"})._id → "123"'
);
// Phase 3.1.5: id MUST mirror _id
assertEqual(
  normalizeChallenge({ id: '123' }).id, '123',
  'normalizeChallenge({id:"123"}).id → "123" (mirror)'
);
// Phase 3.1.5: _id from _id field
assertEqual(
  normalizeChallenge({ _id: 'abc', id: 'def' })._id, 'abc',
  'normalizeChallenge({_id:"abc", id:"def"})._id → "abc" (_id wins)'
);
// Phase 3.1.5: submissions always array
assertEqual(
  Array.isArray(normalizeChallenge({ id: '1' }).submissions), true,
  'normalizeChallenge().submissions → always array'
);
// Phase 3.1.5: REST DTO shape (simulating sanitizeChallenge output)
const restDTO = normalizeChallenge({
  _id: '6a09a670ab2ca75de099d4ee',
  id: '6a09a670ab2ca75de099d4ee',
  auraChallengeId: 'AURA-CHL-001',
  title: 'Test',
  type: 'FRIEND_1V1',
  status: 'ACTIVE',
  participants: [{ userId: 'u1', status: 'JOINED' }],
  canResolve: true,
});
assertEqual(restDTO._id, '6a09a670ab2ca75de099d4ee', 'REST DTO → _id preserved');
assertEqual(restDTO.id, '6a09a670ab2ca75de099d4ee', 'REST DTO → id mirrors _id');
assertEqual(restDTO.auraChallengeId, 'AURA-CHL-001', 'REST DTO → auraChallengeId preserved');
assertEqual(restDTO.canResolve, true, 'REST DTO → canResolve preserved');

section('1. stateNormalizers — collection mutators');

const list = [{ _id: '1', val: 'a' }];
assertEqual(
  safeAppend(list, { _id: '2', val: 'b' }),
  [{ _id: '1', val: 'a' }, { _id: '2', val: 'b' }],
  'safeAppend(new item)        → appended'
);
assertEqual(
  safeAppend(list, { _id: '1', val: 'c' }),
  [{ _id: '1', val: 'a' }],
  'safeAppend(duplicate id)    → ignored'
);
assertEqual(
  safeUpdate(list, { _id: '1', val: 'upd' }),
  [{ _id: '1', val: 'upd' }],
  'safeUpdate(existing)        → updated'
);
assertEqual(
  safeRemove(list, '1'),
  [],
  'safeRemove(existing id)     → removed'
);

// ══════════════════════════════════════════════════════════════
// SECTION 2 — fetchOrchestrator
// ══════════════════════════════════════════════════════════════
section('2. fetchOrchestrator — single-flight dedup');

fetchOrchestrator.reset();
let callCount = 0;
const mockFetch = () => new Promise(resolve => {
  callCount++;
  setTimeout(() => resolve({ data: 'ok' }), 50);
});

// Both p1 and p2 started before either resolves → only 1 network call
const p1 = fetchOrchestrator.fetch('test.key', mockFetch, { cooldownMs: 0 });
const p2 = fetchOrchestrator.fetch('test.key', mockFetch, { cooldownMs: 0 });

await Promise.all([p1, p2]);
assertEqual(callCount, 1, 'Concurrent callers → only 1 actual HTTP call');

section('2. fetchOrchestrator — cooldown window');

fetchOrchestrator.reset();
callCount = 0;
await fetchOrchestrator.fetch('test.cooldown', mockFetch, { cooldownMs: 5000 });
const result2 = await fetchOrchestrator.fetch('test.cooldown', mockFetch, { cooldownMs: 5000 });
assertEqual(result2, null, 'Second call within cooldown → returns null');
assertEqual(callCount, 1,  'Second call within cooldown → no extra HTTP call');

section('2. fetchOrchestrator — hydration lock');

fetchOrchestrator.reset();
let hydrateCount = 0;
const slowHydrate = () => new Promise(resolve => {
  hydrateCount++;
  setTimeout(resolve, 100);
});

const h1 = fetchOrchestrator.hydrate('test.domain', slowHydrate, { cooldownMs: 0 });
const h2 = fetchOrchestrator.hydrate('test.domain', slowHydrate, { cooldownMs: 0 });
await Promise.all([h1, h2]);
assertEqual(hydrateCount, 1, 'Concurrent hydrations → only 1 executes (locked)');

section('2. fetchOrchestrator — rate-limit backoff');

fetchOrchestrator.reset();
const failWith429 = () => Promise.reject({ status: 429, message: 'Too Many Requests' });
try {
  await fetchOrchestrator.fetch('test.429', failWith429, { cooldownMs: 0 });
} catch { /* expected rejection */ }

const statsAfter = fetchOrchestrator.stats();
assertTruthy(
  statsAfter.rateLimitBackoffs['test.429']?.attempts === 1,
  'Rate-limited (429) → backoff entry recorded with attempts=1'
);
assertTruthy(
  statsAfter.rateLimitBackoffs['test.429']?.retryInMs > 0,
  'Rate-limited (429) → retryInMs > 0 (exponential backoff active)'
);

// ══════════════════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(60)}`);
console.log(`  Results: ${passCount} Passed | ${failCount} Failed`);
console.log('═'.repeat(60));

if (failCount > 0) {
  process.exit(1);
}
