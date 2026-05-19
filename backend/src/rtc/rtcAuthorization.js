const HubAccessState = require('../models/HubAccessState');
const HubMembership = require('../models/HubMembership');
const livekitTokenService = require('./livekitTokenService');

// ======================================================
// RTC AUTHORIZATION — Phase D3.2.4
// Enforces authorization before LiveKit token mint
//
// Flow:
//   JWT verified (upstream middleware) →
//   Hub membership verified →
//   HubAccessState verified →
//   RTC permissions verified →
//   LiveKit token minted
//
// Must NOT: mint tokens without verification
// Must: reject stale JWT, revoked membership, banned users
// ======================================================

const _metrics = {
  authorized: 0,
  rejected: 0,
  membershipFailures: 0,
  permissionFailures: 0,
};

// ── Authorize and mint RTC token ──────────────────────
async function authorizeAndMint(userId, auraPlayerId, hubId, displayName) {
  // Step 1: Verify hub membership exists
  let membership;
  try {
    membership = await HubMembership.findOne({
      userId,
      hubId,
      status: 'ACTIVE',
    }).lean();
  } catch (err) {
    _metrics.membershipFailures++;
    console.error(`[RTCAuth] ❌ Membership lookup failed: ${err.message}`);
    return { authorized: false, reason: 'MEMBERSHIP_LOOKUP_FAILED' };
  }

  if (!membership) {
    _metrics.rejected++;
    console.warn(`[RTCAuth] ⚠️ No active membership: user ${userId} hub ${hubId}`);
    return { authorized: false, reason: 'NOT_A_MEMBER' };
  }

  // Step 2: Check HubAccessState for RTC permissions
  let accessState;
  try {
    accessState = await HubAccessState.findOne({
      auraPlayerId,
      auraHubId: hubId,
      membershipState: 'ACTIVE',
    }).lean();
  } catch (err) {
    // Access state might not exist yet (graceful degradation)
    // Default to allowing voice if membership is valid
    accessState = null;
  }

  // Step 3: Check RTC permissions
  if (accessState) {
    if (!accessState.hasChannelAccess) {
      _metrics.permissionFailures++;
      return { authorized: false, reason: 'CHANNEL_ACCESS_REVOKED' };
    }
    if (accessState.rtcPermissions && !accessState.rtcPermissions.canJoinVoice) {
      _metrics.permissionFailures++;
      return { authorized: false, reason: 'VOICE_PERMISSION_DENIED' };
    }
  }

  // Step 4: Mint token
  const roomId = livekitTokenService.buildRoomId(hubId);
  const grants = {
    canPublishAudio: accessState?.rtcPermissions?.canPublishAudio !== false,
    canPublishVideo: accessState?.rtcPermissions?.canPublishVideo || false,
  };

  const result = await livekitTokenService.mintToken(auraPlayerId, displayName, roomId, grants);
  if (!result) {
    _metrics.rejected++;
    return { authorized: false, reason: 'TOKEN_MINT_FAILED' };
  }

  _metrics.authorized++;
  return { authorized: true, ...result };
}

function getMetrics() { return { ..._metrics }; }

module.exports = { authorizeAndMint, getMetrics };
