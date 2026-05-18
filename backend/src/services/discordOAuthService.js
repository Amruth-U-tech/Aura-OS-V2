const crypto = require('crypto');

// ======================================================
// DISCORD OAUTH SERVICE — Phase D1
// Handles ALL Discord OAuth2 communication
// Owns: OAuth URL generation, token exchange, profile fetch, token refresh
// Must NOT: contain Aura business logic, JWT issuance, or DB writes
//
// Security:
//   - Client secret NEVER exposed to frontend
//   - State tokens prevent CSRF/replay attacks
//   - Refresh tokens stored server-side only
// ======================================================

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_OAUTH_AUTHORIZE = 'https://discord.com/api/oauth2/authorize';
const DISCORD_OAUTH_TOKEN = 'https://discord.com/api/oauth2/token';

// Required scopes: minimal — only identity
const DEFAULT_SCOPES = ['identify'];

// In-memory state token cache (short-lived, 10min TTL)
// Production: use Redis or signed cookies
const _stateCache = new Map();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ── Generate OAuth State Token (CSRF protection) ─────
const generateStateToken = () => {
  const state = crypto.randomBytes(32).toString('hex');
  _stateCache.set(state, {
    createdAt: Date.now(),
    used: false
  });

  // Cleanup expired states periodically
  if (_stateCache.size > 100) {
    const now = Date.now();
    for (const [key, val] of _stateCache) {
      if (now - val.createdAt > STATE_TTL_MS) _stateCache.delete(key);
    }
  }

  return state;
};

// ── Validate State Token ─────────────────────────────
const validateStateToken = (state) => {
  if (!state) return false;
  const entry = _stateCache.get(state);
  if (!entry) return false;
  if (entry.used) return false; // Prevent replay
  if (Date.now() - entry.createdAt > STATE_TTL_MS) {
    _stateCache.delete(state);
    return false;
  }
  // Mark as used (one-time use)
  entry.used = true;
  // Clean up after use
  setTimeout(() => _stateCache.delete(state), 60000);
  return true;
};

// ── Build Discord OAuth Authorization URL ────────────
const getAuthorizationUrl = () => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error('[DiscordOAuth] Missing DISCORD_CLIENT_ID or DISCORD_REDIRECT_URI');
  }

  const state = generateStateToken();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DEFAULT_SCOPES.join(' '),
    state,
    prompt: 'consent'  // Always show consent screen for clear UX
  });

  return {
    url: `${DISCORD_OAUTH_AUTHORIZE}?${params.toString()}`,
    state
  };
};

// ── Exchange Authorization Code for Tokens ───────────
const exchangeCode = async (code) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('[DiscordOAuth] Missing OAuth credentials in environment');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  });

  const response = await fetch(DISCORD_OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[DiscordOAuth] Token exchange failed:', response.status, errorData);
    throw Object.assign(
      new Error(`Discord token exchange failed: ${errorData.error_description || response.statusText}`),
      { statusCode: 401, discordError: errorData }
    );
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,       // seconds until expiry
    tokenType: data.token_type,
    scope: data.scope
  };
};

// ── Refresh Access Token ─────────────────────────────
const refreshAccessToken = async (refreshToken) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const response = await fetch(DISCORD_OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[DiscordOAuth] Token refresh failed:', response.status, errorData);
    throw Object.assign(
      new Error(`Discord token refresh failed: ${errorData.error_description || response.statusText}`),
      { statusCode: 401, discordError: errorData }
    );
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope
  };
};

// ── Fetch Discord User Profile ───────────────────────
const fetchDiscordProfile = async (accessToken) => {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('[DiscordOAuth] Profile fetch failed:', response.status, errorData);
    throw Object.assign(
      new Error(`Failed to fetch Discord profile: ${response.statusText}`),
      { statusCode: 502, discordError: errorData }
    );
  }

  const profile = await response.json();

  return {
    discordUserId: profile.id,
    discordUsername: profile.username,
    discordDiscriminator: profile.discriminator || '0',
    discordAvatar: profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${profile.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256`
      : null,
    discordGlobalName: profile.global_name || null,
    discordEmail: profile.email || null  // Only if 'email' scope granted
  };
};

// ── Revoke Token ─────────────────────────────────────
const revokeToken = async (token) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token
    });

    await fetch(`${DISCORD_OAUTH_TOKEN}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
  } catch (err) {
    console.warn('[DiscordOAuth] Token revocation failed (non-fatal):', err.message);
  }
};

module.exports = {
  getAuthorizationUrl,
  validateStateToken,
  exchangeCode,
  refreshAccessToken,
  fetchDiscordProfile,
  revokeToken
};
