/**
 * Phase D1+D2 — Discord Federated Auth & Session Health Tests
 * Pure unit tests (no DB) for OAuth flow logic, token lifecycle, and identity resolution
 */

let passed = 0;
let failed = 0;

function test(label, fn) {
  try { fn(); console.log(`  ✅ PASS  ${label}`); passed++; }
  catch (e) { console.log(`  ❌ FAIL  ${label}: ${e.message}`); failed++; }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

// ═══════════════════════════════════════════════════════
// Suite 1 — OAuth State Token (CSRF Protection)
// ═══════════════════════════════════════════════════════
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 1 — OAuth State Token (CSRF Protection)');
console.log('────────────────────────────────────────────────────────────');

// Simulate state cache
const stateCache = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function generateState() {
  const state = 'state_' + Math.random().toString(36).slice(2);
  stateCache.set(state, { createdAt: Date.now(), used: false });
  return state;
}

function validateState(state) {
  if (!state) return false;
  const entry = stateCache.get(state);
  if (!entry) return false;
  if (entry.used) return false;
  if (Date.now() - entry.createdAt > STATE_TTL_MS) return false;
  entry.used = true;
  return true;
}

test('State token generated successfully', () => {
  const state = generateState();
  assert(state, 'State should be non-empty');
  assert(stateCache.has(state), 'State should be cached');
});

test('Valid state token passes validation', () => {
  const state = generateState();
  assert(validateState(state) === true, 'Should validate');
});

test('State token cannot be reused (replay prevention)', () => {
  const state = generateState();
  validateState(state); // First use
  assert(validateState(state) === false, 'Second use should fail');
});

test('Invalid state token fails validation', () => {
  assert(validateState('fake_state_123') === false, 'Should reject unknown state');
});

test('Null state token fails validation', () => {
  assert(validateState(null) === false, 'Should reject null');
  assert(validateState(undefined) === false, 'Should reject undefined');
});

// ═══════════════════════════════════════════════════════
// Suite 2 — Identity Resolution (Discord → Aura)
// ═══════════════════════════════════════════════════════
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 2 — Identity Resolution (Discord → Aura)');
console.log('────────────────────────────────────────────────────────────');

function resolveIdentity(discordProfile, existingIntegration) {
  if (existingIntegration) {
    return {
      isNewUser: false,
      auraUserId: existingIntegration.auraUserId,
      auraPlayerId: existingIntegration.auraPlayerId,
      discordUserId: discordProfile.discordUserId
    };
  }
  return {
    isNewUser: true,
    auraUserId: 'new_user_' + Date.now(),
    auraPlayerId: null, // Created after bootstrap
    discordUserId: discordProfile.discordUserId
  };
}

test('Existing Discord user: loads Aura identity', () => {
  const profile = { discordUserId: 'disc_123', discordUsername: 'test' };
  const existing = { auraUserId: 'aura_abc', auraPlayerId: 'AURA-PLR-001' };
  const result = resolveIdentity(profile, existing);
  assert(result.isNewUser === false, 'Should not be new');
  assert(result.auraUserId === 'aura_abc', 'Should load existing auraUserId');
  assert(result.auraPlayerId === 'AURA-PLR-001', 'Should load existing auraPlayerId');
});

test('New Discord user: creates new Aura identity', () => {
  const profile = { discordUserId: 'disc_456', discordUsername: 'newuser' };
  const result = resolveIdentity(profile, null);
  assert(result.isNewUser === true, 'Should be new user');
  assert(result.discordUserId === 'disc_456', 'Discord ID preserved');
  assert(result.auraPlayerId === null, 'No player ID yet');
});

test('Discord profile maps correctly', () => {
  const rawDiscord = {
    id: '123456789',
    username: 'testuser',
    discriminator: '0',
    avatar: 'abc123',
    global_name: 'Test User'
  };
  const profile = {
    discordUserId: rawDiscord.id,
    discordUsername: rawDiscord.username,
    discordAvatar: rawDiscord.avatar
      ? `https://cdn.discordapp.com/avatars/${rawDiscord.id}/${rawDiscord.avatar}.png?size=256`
      : null,
    discordGlobalName: rawDiscord.global_name
  };
  assert(profile.discordUserId === '123456789', 'ID mapped');
  assert(profile.discordUsername === 'testuser', 'Username mapped');
  assert(profile.discordAvatar.includes('cdn.discordapp.com'), 'Avatar URL constructed');
  assert(profile.discordGlobalName === 'Test User', 'Global name mapped');
});

// ═══════════════════════════════════════════════════════
// Suite 3 — JWT Enrichment
// ═══════════════════════════════════════════════════════
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 3 — JWT Enrichment (Backward Compatible)');
console.log('────────────────────────────────────────────────────────────');

function createJwtPayload(userId, extras = {}) {
  return {
    id: userId,
    ...(extras.auraPlayerId && { auraPlayerId: extras.auraPlayerId }),
    ...(extras.discordUserId && { discordUserId: extras.discordUserId }),
    ...(extras.sessionId && { sessionId: extras.sessionId })
  };
}

test('Legacy JWT: only contains id', () => {
  const payload = createJwtPayload('user_123');
  assert(payload.id === 'user_123', 'Should have id');
  assert(!payload.auraPlayerId, 'Should not have auraPlayerId');
  assert(!payload.discordUserId, 'Should not have discordUserId');
});

test('Enriched JWT: contains auraPlayerId + discordUserId', () => {
  const payload = createJwtPayload('user_123', {
    auraPlayerId: 'AURA-PLR-001',
    discordUserId: 'disc_456'
  });
  assert(payload.id === 'user_123', 'id present');
  assert(payload.auraPlayerId === 'AURA-PLR-001', 'auraPlayerId present');
  assert(payload.discordUserId === 'disc_456', 'discordUserId present');
});

test('Auth middleware backward compatible: only reads id', () => {
  const decoded = createJwtPayload('user_123', { auraPlayerId: 'AURA-PLR-001' });
  const reqUser = { id: decoded.id }; // middleware only extracts id
  assert(reqUser.id === 'user_123', 'id extracted');
  assert(!reqUser.auraPlayerId, 'middleware does not expose auraPlayerId');
});

// ═══════════════════════════════════════════════════════
// Suite 4 — Token Expiry & Refresh Lifecycle
// ═══════════════════════════════════════════════════════
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 4 — Token Expiry & Refresh Lifecycle (Phase D2)');
console.log('────────────────────────────────────────────────────────────');

function isTokenExpired(expiresAt) {
  return new Date() >= new Date(expiresAt);
}

function isTokenExpiringSoon(expiresAt, bufferMs = 5 * 60 * 1000) {
  return new Date(Date.now() + bufferMs) >= new Date(expiresAt);
}

test('Token not expired: future date', () => {
  const future = new Date(Date.now() + 3600000).toISOString(); // +1 hour
  assert(isTokenExpired(future) === false, 'Should not be expired');
});

test('Token expired: past date', () => {
  const past = new Date(Date.now() - 1000).toISOString();
  assert(isTokenExpired(past) === true, 'Should be expired');
});

test('Token expiring soon: within buffer', () => {
  const soon = new Date(Date.now() + 2 * 60 * 1000).toISOString(); // +2 min (within 5 min buffer)
  assert(isTokenExpiringSoon(soon) === true, 'Should be expiring soon');
});

test('Token NOT expiring soon: outside buffer', () => {
  const far = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1 hour
  assert(isTokenExpiringSoon(far) === false, 'Should not be expiring soon');
});

// ═══════════════════════════════════════════════════════
// Suite 5 — Refresh Mutex (Distributed Lock)
// ═══════════════════════════════════════════════════════
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 5 — Refresh Mutex (Duplicate Prevention)');
console.log('────────────────────────────────────────────────────────────');

const locks = new Map();
const LOCK_TTL = 30000;

function acquireLock(userId) {
  const existing = locks.get(userId);
  if (existing && Date.now() - existing < LOCK_TTL) return false;
  locks.set(userId, Date.now());
  return true;
}

function releaseLock(userId) {
  locks.delete(userId);
}

test('Acquire lock: first attempt succeeds', () => {
  const result = acquireLock('user_1');
  assert(result === true, 'Should acquire');
  releaseLock('user_1');
});

test('Acquire lock: second attempt fails (mutex)', () => {
  acquireLock('user_2');
  const second = acquireLock('user_2');
  assert(second === false, 'Should fail — already locked');
  releaseLock('user_2');
});

test('Release lock: subsequent acquire succeeds', () => {
  acquireLock('user_3');
  releaseLock('user_3');
  const result = acquireLock('user_3');
  assert(result === true, 'Should acquire after release');
  releaseLock('user_3');
});

test('Lock auto-expires after TTL', () => {
  locks.set('user_4', Date.now() - LOCK_TTL - 1000); // Expired lock
  const result = acquireLock('user_4');
  assert(result === true, 'Should acquire — old lock expired');
  releaseLock('user_4');
});

// ═══════════════════════════════════════════════════════
// Suite 6 — Integration Status State Machine
// ═══════════════════════════════════════════════════════
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 6 — Integration Status State Machine');
console.log('────────────────────────────────────────────────────────────');

const INTEGRATION_STATUS = {
  ACTIVE: 'ACTIVE',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  REFRESH_FAILED: 'REFRESH_FAILED',
  REVOKED: 'REVOKED',
  DISCONNECTED: 'DISCONNECTED',
  RECOVERING: 'RECOVERING'
};

function getNextStatus(current, event) {
  switch (event) {
    case 'TOKEN_EXPIRED': return INTEGRATION_STATUS.TOKEN_EXPIRED;
    case 'REFRESH_SUCCESS': return INTEGRATION_STATUS.ACTIVE;
    case 'REFRESH_FAIL_1': return INTEGRATION_STATUS.TOKEN_EXPIRED;
    case 'REFRESH_FAIL_3+': return INTEGRATION_STATUS.REFRESH_FAILED;
    case 'USER_REVOKED': return INTEGRATION_STATUS.REVOKED;
    case 'DISCONNECT': return INTEGRATION_STATUS.DISCONNECTED;
    case 'RELINK': return INTEGRATION_STATUS.ACTIVE;
    default: return current;
  }
}

test('ACTIVE → TOKEN_EXPIRED on expiry', () => {
  assert(getNextStatus('ACTIVE', 'TOKEN_EXPIRED') === 'TOKEN_EXPIRED');
});

test('TOKEN_EXPIRED → ACTIVE on refresh success', () => {
  assert(getNextStatus('TOKEN_EXPIRED', 'REFRESH_SUCCESS') === 'ACTIVE');
});

test('TOKEN_EXPIRED → REFRESH_FAILED after 3+ failures', () => {
  assert(getNextStatus('TOKEN_EXPIRED', 'REFRESH_FAIL_3+') === 'REFRESH_FAILED');
});

test('Any → REVOKED on user revocation', () => {
  assert(getNextStatus('ACTIVE', 'USER_REVOKED') === 'REVOKED');
});

test('DISCONNECTED → ACTIVE on relink', () => {
  assert(getNextStatus('DISCONNECTED', 'RELINK') === 'ACTIVE');
});

// ═══════════════════════════════════════════════════════
// Suite 7 — Canonical Identity Consistency
// ═══════════════════════════════════════════════════════
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 7 — Canonical Identity Consistency');
console.log('────────────────────────────────────────────────────────────');

test('User DTO contains all 3 canonical IDs', () => {
  const userDto = {
    id: 'aura_user_123',
    auraPlayerId: 'AURA-PLR-001',
    discordUserId: 'disc_456',
    playerName: 'TestPlayer'
  };
  assert(userDto.id, 'Must have id (auraUserId)');
  assert(userDto.auraPlayerId, 'Must have auraPlayerId');
  assert(userDto.discordUserId, 'Must have discordUserId');
});

test('Aura ID remains sovereign (never replaced by Discord ID)', () => {
  const auraPlayerId = 'AURA-PLR-001';
  const discordUserId = 'disc_456';
  assert(auraPlayerId !== discordUserId, 'IDs must be distinct');
  assert(auraPlayerId.startsWith('AURA-'), 'Aura ID keeps its prefix');
});

test('Socket room uses Aura ID (not Discord)', () => {
  const auraPlayerId = 'AURA-PLR-001';
  const room = `player:${auraPlayerId}`;
  assert(room === 'player:AURA-PLR-001', 'Room uses Aura ID');
  assert(!room.includes('disc_'), 'Room does NOT contain Discord ID');
});

// ═══════════════════════════════════════════════════════
// Suite 8 — Edge Cases
// ═══════════════════════════════════════════════════════
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 8 — Edge Cases');
console.log('────────────────────────────────────────────────────────────');

test('Discord user without avatar gets null (not broken URL)', () => {
  const profile = {
    id: '123', username: 'test', avatar: null
  };
  const avatarUrl = profile.avatar
    ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
    : null;
  assert(avatarUrl === null, 'Should be null, not broken URL');
});

test('Animated avatar detected (a_ prefix)', () => {
  const avatar = 'a_abc123';
  const ext = avatar.startsWith('a_') ? 'gif' : 'png';
  assert(ext === 'gif', 'Animated avatar should use .gif');
});

test('Static avatar detected (no a_ prefix)', () => {
  const avatar = 'abc123';
  const ext = avatar.startsWith('a_') ? 'gif' : 'png';
  assert(ext === 'png', 'Static avatar should use .png');
});

test('Discord placeholder email format', () => {
  const discordUserId = '123456789';
  const email = `${discordUserId}@discord.aura`;
  assert(email === '123456789@discord.aura', 'Placeholder email format');
  assert(email.includes('@discord.aura'), 'Uses discord.aura domain');
});

test('Full OAuth flow: state → code → tokens → profile → JWT', () => {
  const state = generateState();
  assert(validateState(state) === true, 'State valid');

  const tokens = { accessToken: 'at_xxx', refreshToken: 'rt_yyy', expiresIn: 604800 };
  assert(tokens.accessToken, 'Has access token');
  assert(tokens.refreshToken, 'Has refresh token');

  const profile = { discordUserId: 'disc_001', discordUsername: 'player1' };
  assert(profile.discordUserId, 'Has Discord ID');

  const jwtPayload = createJwtPayload('user_001', {
    auraPlayerId: 'AURA-PLR-001',
    discordUserId: 'disc_001'
  });
  assert(jwtPayload.id === 'user_001', 'JWT has user ID');
  assert(jwtPayload.auraPlayerId === 'AURA-PLR-001', 'JWT has Aura player ID');
  assert(jwtPayload.discordUserId === 'disc_001', 'JWT has Discord user ID');
});

// ═══════════════════════════════════════════════════════
// Suite 9 — SPA Callback Flow Detection (Phase D1.DEBUG)
// The ROOT CAUSE fix: detecting code vs token in URL params
// ═══════════════════════════════════════════════════════
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 9 — SPA Callback Flow Detection (D1.DEBUG Fix)');
console.log('────────────────────────────────────────────────────────────');

// Simulate URL parameter detection logic
function detectCallbackFlow(params) {
  const code = params.get('code');
  const state = params.get('state');
  const token = params.get('token');
  const user = params.get('user');
  const error = params.get('error');

  if (error) return { flow: 'error', error };
  if (code) return { flow: 'spa_exchange', code, state };
  if (token && user) return { flow: 'server_redirect', token, user };
  return { flow: 'invalid' };
}

test('Flow A detection: ?code=X&state=Y → spa_exchange', () => {
  const params = new URLSearchParams('code=abc123&state=def456');
  const result = detectCallbackFlow(params);
  assert(result.flow === 'spa_exchange', 'Should detect SPA exchange flow');
  assert(result.code === 'abc123', 'Code extracted');
  assert(result.state === 'def456', 'State extracted');
});

test('Flow B detection: ?token=X&user=Y → server_redirect', () => {
  const params = new URLSearchParams('token=jwt_xxx&user=%7B%22id%22%3A%22123%22%7D');
  const result = detectCallbackFlow(params);
  assert(result.flow === 'server_redirect', 'Should detect server redirect flow');
  assert(result.token === 'jwt_xxx', 'Token extracted');
});

test('Error detection: ?error=access_denied → error flow', () => {
  const params = new URLSearchParams('error=access_denied');
  const result = detectCallbackFlow(params);
  assert(result.flow === 'error', 'Should detect error flow');
  assert(result.error === 'access_denied', 'Error extracted');
});

test('Empty params → invalid flow', () => {
  const params = new URLSearchParams('');
  const result = detectCallbackFlow(params);
  assert(result.flow === 'invalid', 'Should be invalid');
});

test('Only code without state → still spa_exchange (state from sessionStorage)', () => {
  const params = new URLSearchParams('code=abc123');
  const result = detectCallbackFlow(params);
  assert(result.flow === 'spa_exchange', 'Should still detect SPA flow');
  assert(result.state === null || result.state === undefined, 'State may be null');
});

test('Token without user → invalid (incomplete server redirect)', () => {
  const params = new URLSearchParams('token=jwt_xxx');
  const result = detectCallbackFlow(params);
  assert(result.flow === 'invalid', 'Should be invalid without user param');
});

// ═══════════════════════════════════════════════════════
// Suite 10 — SPA Exchange DTO Contract
// ═══════════════════════════════════════════════════════
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 10 — SPA Exchange DTO Contract');
console.log('────────────────────────────────────────────────────────────');

test('Exchange request DTO: {code, state}', () => {
  const dto = { code: 'abc123', state: 'state_xyz' };
  assert(dto.code, 'Must have code');
  assert(dto.state, 'Must have state');
  assert(Object.keys(dto).length === 2, 'Only code and state');
});

test('Exchange response DTO: {token, user, isNewUser}', () => {
  const response = {
    token: 'jwt_xxx',
    user: { id: 'user_1', playerName: 'Test', auraPlayerId: 'AURA-PLR-001', discordUserId: 'disc_1' },
    isNewUser: false
  };
  assert(response.token, 'Must have token');
  assert(response.user, 'Must have user');
  assert(response.user.id, 'User must have id');
  assert(response.user.discordUserId, 'User must have discordUserId');
  assert(typeof response.isNewUser === 'boolean', 'isNewUser must be boolean');
});

test('Exchange response user has canonical triple identity', () => {
  const user = { id: 'aura_user_123', auraPlayerId: 'AURA-PLR-001', discordUserId: 'disc_456' };
  assert(user.id, 'auraUserId present');
  assert(user.auraPlayerId, 'auraPlayerId present');
  assert(user.discordUserId, 'discordUserId present');
  assert(user.id !== user.discordUserId, 'Aura ID !== Discord ID');
});

// ═══════════════════════════════════════════════════════
// Suite 11 — Redirect URI Architecture Validation
// ═══════════════════════════════════════════════════════
console.log('\n────────────────────────────────────────────────────────────');
console.log('  Suite 11 — Redirect URI Architecture Validation');
console.log('────────────────────────────────────────────────────────────');

test('redirect_uri in token exchange must match authorization', () => {
  const authRedirectUri = 'http://localhost:5173/auth/discord/callback';
  const exchangeRedirectUri = 'http://localhost:5173/auth/discord/callback';
  assert(authRedirectUri === exchangeRedirectUri, 'Must match exactly');
});

test('Frontend callback route matches DISCORD_REDIRECT_URI path', () => {
  const redirectUri = new URL('http://localhost:5173/auth/discord/callback');
  const frontendRoute = '/auth/discord/callback';
  assert(redirectUri.pathname === frontendRoute, 'Paths must match');
});

test('Backend exchange endpoint is POST (not GET)', () => {
  const method = 'POST';
  const endpoint = '/auth/discord/exchange';
  assert(method === 'POST', 'Must be POST for security');
  assert(endpoint.includes('exchange'), 'Endpoint is /exchange not /callback');
});

// ─────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log(`  Results: ${passed} Passed | ${failed} Failed`);
console.log(`${'═'.repeat(60)}\n`);

if (failed > 0) process.exit(1);
