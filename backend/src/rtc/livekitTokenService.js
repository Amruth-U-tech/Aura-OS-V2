const { AccessToken } = require('livekit-server-sdk');

// ======================================================
// LIVEKIT TOKEN SERVICE — Phase D3.2.4
// RTC token authority — mints short-lived room-scoped tokens
//
// Owns: LiveKit JWT generation
// Must NOT: own authorization (rtcAuthorization does that)
// Must NOT: touch media packets (LiveKit SFU does that)
//
// Identity discipline:
//   identity = auraPlayerId (ALWAYS)
//   NEVER discordUserId or socketId
// ======================================================

const LK_API_KEY = process.env.LK_API_KEY || process.env.LIVEKIT_API_KEY;
const LK_API_SECRET = process.env.LK_API_SECRET || process.env.LIVEKIT_API_SECRET;
const LK_SERVER_URL = process.env.LK_SERVER_URL || process.env.LIVEKIT_SERVER_URL;
const TOKEN_TTL = process.env.LIVEKIT_TOKEN_TTL || '1h';

const _metrics = {
  tokensIssued: 0,
  tokenFailures: 0,
  lastIssuedAt: null,
};

// ── Check if LiveKit is configured ────────────────────
function isConfigured() {
  return !!(LK_API_KEY && LK_API_SECRET && LK_SERVER_URL);
}

// ── Mint a room-scoped LiveKit token ──────────────────
async function mintToken(auraPlayerId, displayName, roomId, grants = {}) {
  if (!isConfigured()) {
    _metrics.tokenFailures++;
    console.warn('[LiveKitTokenService] ⚠️ LiveKit not configured — no LK_API_KEY/SECRET');
    return null;
  }

  try {
    const at = new AccessToken(LK_API_KEY, LK_API_SECRET, {
      // IDENTITY DISCIPLINE: auraPlayerId is the ONLY identity
      identity: auraPlayerId.toString(),
      name: displayName || 'Player',
      ttl: TOKEN_TTL,
    });

    at.addGrant({
      roomJoin: true,
      room: roomId,
      canPublish: grants.canPublishAudio !== false,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    _metrics.tokensIssued++;
    _metrics.lastIssuedAt = Date.now();

    console.log(`[LiveKitTokenService] 🎫 Token issued for ${auraPlayerId} → room ${roomId}`);
    return { token, serverUrl: LK_SERVER_URL };
  } catch (err) {
    _metrics.tokenFailures++;
    console.error(`[LiveKitTokenService] ❌ Token mint failed: ${err.message}`);
    return null;
  }
}

// ── Build room ID from hub ────────────────────────────
function buildRoomId(hubId) {
  return `hub:${hubId}:voice`;
}

function getMetrics() { return { ..._metrics, configured: isConfigured() }; }

module.exports = { mintToken, buildRoomId, isConfigured, getMetrics };
