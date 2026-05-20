const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { protect } = require('../middleware/authMiddleware');
const discordOAuth = require('../services/discordOAuthService');
const authService = require('../services/authService');
const DiscordIntegration = require('../models/DiscordIntegration');

// ======================================================
// DISCORD AUTH ROUTES — Phase D1.DEBUG
//
// CORRECTED Architecture (SPA-friendly):
//   GET  /auth/discord           → Returns Discord OAuth URL + state
//   POST /auth/discord/exchange  → Frontend sends {code, state}, backend exchanges for JWT
//   GET  /auth/discord/callback  → Fallback: server-redirect flow (if redirect_uri = backend)
//   GET  /auth/session           → Returns current session info (protected)
//   POST /auth/logout            → Server-side logout (protected)
//   GET  /auth/refresh-status    → Discord token health (protected)
//
// OAuth Flow (SPA):
//   1. Frontend: GET /auth/discord → receives OAuth URL + state
//   2. Frontend: stores state in sessionStorage
//   3. Frontend: redirects browser to Discord
//   4. Discord: user authorizes → redirect to DISCORD_REDIRECT_URI (frontend)
//   5. Frontend: DiscordCallbackPage receives ?code=X&state=Y
//   6. Frontend: POST /auth/discord/exchange {code, state}
//   7. Backend: validates state, exchanges code, creates/loads user, issues JWT
//   8. Backend: returns {token, user, isNewUser} to frontend
//   9. Frontend: AuthContext stores token → session active
//
// Security:
//   - State token prevents CSRF/replay attacks (validated server-side)
//   - Client secret never exposed to frontend
//   - Code exchange happens server-side only
//   - Discord tokens stored with select:false (never in API responses)
// ======================================================

// Primary frontend origin (first entry in comma-separated FRONTEND_URL)
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')[0].trim();

// ── GET /auth/discord ────────────────────────────────
// Returns the Discord OAuth authorization URL for frontend to redirect to
router.get('/discord', (req, res) => {
  try {
    const { url, state } = discordOAuth.getAuthorizationUrl();
    console.info('[OAuth] Discord authorization URL generated, state:', state.slice(0, 8) + '...');

    // Store state in httpOnly cookie as backup validation
    res.cookie('discord_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000,
      sameSite: 'lax'
    });

    sendSuccess(res, { url, state }, 'Discord authorization URL generated');
  } catch (err) {
    console.error('[OAuth] URL generation failed:', err.message);
    sendError(res, 'Failed to generate Discord login URL', 500);
  }
});

// ══════════════════════════════════════════════════════
// POST /auth/discord/exchange — PRIMARY SPA FLOW
// Frontend sends {code, state} after Discord redirect
// Backend validates, exchanges, and returns Aura JWT
// ══════════════════════════════════════════════════════
router.post('/discord/exchange', asyncHandler(async (req, res) => {
  const { code, state } = req.body;

  console.info('[OAuth] Exchange request received — code:', code ? 'present' : 'MISSING', 'state:', state ? state.slice(0, 8) + '...' : 'MISSING');

  // ── Validate inputs ────────────────────────────────
  if (!code) {
    console.warn('[OAuth] Exchange rejected: missing authorization code');
    return sendError(res, 'Missing authorization code', 400);
  }

  if (!state) {
    console.warn('[OAuth] Exchange rejected: missing state token');
    return sendError(res, 'Missing state token', 400);
  }

  // ── Validate CSRF state token ──────────────────────
  const cookieState = req.cookies?.discord_oauth_state;
  const validState =
    discordOAuth.validateStateToken(state) ||
    (cookieState && cookieState === state);

  if (!validState) {
    console.warn('[OAuth] Exchange rejected: invalid state token — possible CSRF/replay');
    return sendError(res, 'Invalid or expired state token — please try logging in again', 403);
  }

  // Clear state cookie after validation
  res.clearCookie('discord_oauth_state');
  console.info('[OAuth] State validated successfully');

  // ── Exchange code for Discord tokens ───────────────
  console.info('[OAuth] Exchanging authorization code with Discord...');
  let tokens;
  try {
    tokens = await discordOAuth.exchangeCode(code);
    console.info('[OAuth] Token exchange successful — expires in:', tokens.expiresIn, 'seconds');
  } catch (err) {
    console.error('[OAuth] Discord token exchange failed:', err.message);
    return sendError(res, `Discord authentication failed: ${err.message}`, 401);
  }

  // ── Fetch Discord profile ──────────────────────────
  console.info('[OAuth] Fetching Discord user profile...');
  let discordProfile;
  try {
    discordProfile = await discordOAuth.fetchDiscordProfile(tokens.accessToken);
    console.info('[OAuth] Profile fetched — Discord user:', discordProfile.discordUsername, '(' + discordProfile.discordUserId + ')');
  } catch (err) {
    console.error('[OAuth] Discord profile fetch failed:', err.message);
    return sendError(res, `Failed to fetch Discord profile: ${err.message}`, 502);
  }

  // ── Resolve Aura identity (create or load) ─────────
  console.info('[OAuth] Resolving Aura identity...');
  let result;
  try {
    result = await authService.loginOrCreateFromDiscord({
      discordProfile,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      scope: tokens.scope
    });
    console.info('[OAuth] Identity resolved —', result.isNewUser ? 'NEW user created' : 'EXISTING user loaded',
      '— auraUserId:', result.user.id, '— playerName:', result.user.playerName);
  } catch (err) {
    console.error('[OAuth] Identity resolution failed:', err.message);
    return sendError(res, `Account setup failed: ${err.message}`, 500);
  }

  // ── Return Aura JWT + user to frontend ─────────────
  console.info('[OAuth] ✅ Authentication complete — issuing Aura JWT');
  sendSuccess(res, {
    token: result.token,
    user: result.user,
    isNewUser: result.isNewUser
  }, result.isNewUser ? 'Welcome to Aura OS!' : 'Welcome back!');
}));

// ── GET /auth/discord/callback ───────────────────────
// FALLBACK: Server-redirect flow (if DISCORD_REDIRECT_URI points to backend)
// Also handles Discord error responses (user denied, etc.)
router.get('/discord/callback', asyncHandler(async (req, res) => {
  const { code, state, error } = req.query;

  // Discord may return an error (user denied, etc.)
  if (error) {
    console.warn('[OAuth] Discord denied by user:', error);
    return res.redirect(`${FRONTEND_URL}/auth/discord/callback?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/auth/discord/callback?error=missing_code`);
  }

  // Validate CSRF state token
  const cookieState = req.cookies?.discord_oauth_state;
  const validState = state && (
    discordOAuth.validateStateToken(state) ||
    (cookieState && cookieState === state)
  );

  if (!validState) {
    console.warn('[OAuth] Callback invalid state — possible CSRF');
    return res.redirect(`${FRONTEND_URL}/auth/discord/callback?error=invalid_state`);
  }

  res.clearCookie('discord_oauth_state');

  try {
    const tokens = await discordOAuth.exchangeCode(code);
    const discordProfile = await discordOAuth.fetchDiscordProfile(tokens.accessToken);
    const result = await authService.loginOrCreateFromDiscord({
      discordProfile,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      scope: tokens.scope
    });

    const userPayload = encodeURIComponent(JSON.stringify(result.user));
    return res.redirect(`${FRONTEND_URL}/auth/discord/callback?token=${result.token}&user=${userPayload}&isNew=${result.isNewUser}`);
  } catch (err) {
    console.error('[OAuth] Callback processing failed:', err.message);
    return res.redirect(`${FRONTEND_URL}/auth/discord/callback?error=${encodeURIComponent(err.message)}`);
  }
}));

// ── GET /auth/session ────────────────────────────────
router.get('/session', protect, asyncHandler(async (req, res) => {
  const sessionInfo = await authService.getSessionInfo(req.user.id);
  if (!sessionInfo) return sendError(res, 'Session not found', 404);
  sendSuccess(res, sessionInfo, 'Session restored');
}));

// ── POST /auth/logout ────────────────────────────────
router.post('/logout', protect, asyncHandler(async (req, res) => {
  try {
    const integration = await DiscordIntegration.findOne({ auraUserId: req.user.id })
      .select('+accessToken');
    if (integration?.accessToken) {
      await discordOAuth.revokeToken(integration.accessToken);
    }
  } catch (err) {
    console.warn('[OAuth] Token revocation on logout (non-fatal):', err.message);
  }
  sendSuccess(res, null, 'Logged out');
}));

// ── GET /auth/refresh-status ─────────────────────────
router.get('/refresh-status', protect, asyncHandler(async (req, res) => {
  const integration = await DiscordIntegration.findOne({ auraUserId: req.user.id });
  if (!integration) {
    return sendSuccess(res, { hasDiscord: false, status: null }, 'No Discord integration');
  }
  sendSuccess(res, {
    hasDiscord: true,
    status: integration.integrationStatus,
    expiresAt: integration.expiresAt,
    isExpired: integration.isTokenExpired(),
    isExpiringSoon: integration.isTokenExpiringSoon(),
    refreshFailureCount: integration.refreshFailureCount,
    lastRefreshError: integration.lastRefreshError,
    linkedAt: integration.linkedAt,
    lastLoginAt: integration.lastLoginAt
  }, 'Discord integration status');
}));

module.exports = router;
