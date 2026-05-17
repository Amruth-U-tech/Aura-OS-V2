const authService = require('../services/authService');
const PlayerProfile = require('../models/PlayerProfile');

// ======================================================
// SOCKET AUTH MIDDLEWARE — Phase 3.0.1 (Hardened)
// Reuses EXISTING JWT infrastructure (authService.verifyToken)
// Validates the token during the Socket.IO handshake
// Attaches player identity to socket.data for downstream use
// FAIL-FAST: rejects if ANY identity field is missing
// Must NOT: create sessions, touch DB for auth, bypass JWT
// ======================================================

const socketAuthMiddleware = async (socket, next) => {
  const tag = '[Socket:Auth]';

  try {
    // ── Extract token from handshake ────────────────
    // Support both auth object and header-based token
    const token = socket.handshake.auth?.token
      || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token || typeof token !== 'string' || token.length < 10) {
      console.warn(`${tag} Connection rejected: no valid token provided`);
      return next(new Error('AUTHENTICATION_REQUIRED'));
    }

    // ── Verify JWT (reuses existing authService) ────
    let decoded;
    try {
      decoded = authService.verifyToken(token);
    } catch (err) {
      console.warn(`${tag} Connection rejected: ${err.message}`);
      return next(new Error('INVALID_TOKEN'));
    }

    // ── Validate decoded payload ────────────────────
    if (!decoded || !decoded.id || typeof decoded.id !== 'string') {
      console.warn(`${tag} Connection rejected: malformed token payload (missing id)`);
      return next(new Error('INVALID_TOKEN'));
    }

    // ── Resolve player identity (lightweight query) ──
    const profile = await PlayerProfile.findOne({ userId: decoded.id })
      .select('auraPlayerId displayName avatar')
      .lean();

    if (!profile) {
      console.warn(`${tag} Connection rejected: no profile for user ${decoded.id}`);
      return next(new Error('PROFILE_NOT_FOUND'));
    }

    // ── FAIL-FAST: Validate identity completeness ───
    // Phase 3.0.1: NEVER allow a socket without auraPlayerId
    if (!profile.auraPlayerId || typeof profile.auraPlayerId !== 'string' || !profile.auraPlayerId.startsWith('AURA-PLR-')) {
      console.error(`${tag} CRITICAL: Invalid auraPlayerId for user ${decoded.id}: ${profile.auraPlayerId}`);
      return next(new Error('IDENTITY_CORRUPT'));
    }

    // ── Attach COMPLETE identity to socket.data ─────
    // Every downstream handler can rely on these fields
    socket.data.userId = decoded.id;
    socket.data.auraPlayerId = profile.auraPlayerId;
    socket.data.displayName = profile.displayName || 'Player';
    socket.data.avatar = profile.avatar || null;

    next();
  } catch (err) {
    console.error(`${tag} Unexpected error:`, err.message);
    return next(new Error('AUTHENTICATION_FAILED'));
  }
};

module.exports = socketAuthMiddleware;
