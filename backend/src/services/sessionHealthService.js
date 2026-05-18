const DiscordIntegration = require('../models/DiscordIntegration');
const { INTEGRATION_STATUS } = require('../models/DiscordIntegration');
const discordOAuth = require('./discordOAuthService');
const auraEvents = require('../events/eventBus');

// ======================================================
// SESSION HEALTH SERVICE — Phase D2
// Proactive Discord token lifecycle management
// Owns: token expiry tracking, refresh orchestration, health monitoring
//
// IMPORTANT: This service runs PROACTIVELY (scheduled)
//   NOT reactively (on failure)
//
// Architecture:
//   - Checks for expiring tokens every 5 minutes
//   - Refreshes before expiry (5-minute buffer)
//   - Tracks failures with exponential backoff
//   - Emits observable events for all state changes
//   - Distributed refresh mutex prevents duplicate refreshes
// ======================================================

// Refresh mutex: prevents duplicate refreshes for the same user
const _refreshLocks = new Map();
const LOCK_TTL_MS = 30000; // 30 seconds

const _acquireLock = (userId) => {
  const key = userId.toString();
  const existing = _refreshLocks.get(key);
  if (existing && Date.now() - existing < LOCK_TTL_MS) return false;
  _refreshLocks.set(key, Date.now());
  return true;
};

const _releaseLock = (userId) => {
  _refreshLocks.delete(userId.toString());
};

// ── Refresh a single integration's tokens ────────────
const refreshIntegration = async (integration) => {
  const userId = integration.auraUserId?.toString();

  // Acquire lock
  if (!_acquireLock(userId)) {
    console.info(`[SessionHealth] Refresh already in progress for user ${userId}`);
    return false;
  }

  try {
    // Load tokens (they're select:false by default)
    const fullIntegration = await DiscordIntegration.findById(integration._id)
      .select('+accessToken +refreshToken');

    if (!fullIntegration?.refreshToken) {
      console.warn(`[SessionHealth] No refresh token for user ${userId}`);
      _releaseLock(userId);
      return false;
    }

    // Emit: refresh starting
    auraEvents.emitEvent('DISCORD_REFRESH_STARTED', {
      userId,
      discordUserId: integration.discordUserId
    });

    // Exchange refresh token for new access token
    const newTokens = await discordOAuth.refreshAccessToken(fullIntegration.refreshToken);

    // Update integration with new tokens
    fullIntegration.accessToken = newTokens.accessToken;
    fullIntegration.refreshToken = newTokens.refreshToken;
    fullIntegration.expiresAt = new Date(Date.now() + newTokens.expiresIn * 1000);
    fullIntegration.lastRefreshAt = new Date();
    fullIntegration.integrationStatus = INTEGRATION_STATUS.ACTIVE;
    fullIntegration.refreshFailureCount = 0;
    fullIntegration.lastRefreshError = null;
    await fullIntegration.save();

    // Emit: refresh completed
    auraEvents.emitEvent('DISCORD_REFRESH_COMPLETED', {
      userId,
      discordUserId: integration.discordUserId,
      newExpiresAt: fullIntegration.expiresAt
    });

    console.info(`[SessionHealth] Token refreshed for user ${userId}, expires at ${fullIntegration.expiresAt.toISOString()}`);
    _releaseLock(userId);
    return true;

  } catch (err) {
    console.error(`[SessionHealth] Refresh failed for user ${userId}:`, err.message);

    // Update failure tracking
    try {
      const failedIntegration = await DiscordIntegration.findById(integration._id);
      if (failedIntegration) {
        failedIntegration.refreshFailureCount = (failedIntegration.refreshFailureCount || 0) + 1;
        failedIntegration.lastRefreshError = err.message;

        // After 3 failures, mark as REFRESH_FAILED
        if (failedIntegration.refreshFailureCount >= 3) {
          failedIntegration.integrationStatus = INTEGRATION_STATUS.REFRESH_FAILED;
        } else {
          failedIntegration.integrationStatus = INTEGRATION_STATUS.TOKEN_EXPIRED;
        }
        await failedIntegration.save();
      }
    } catch (updateErr) {
      console.error('[SessionHealth] Failed to update failure tracking:', updateErr.message);
    }

    // Emit: refresh failed
    auraEvents.emitEvent('DISCORD_REFRESH_FAILED', {
      userId,
      discordUserId: integration.discordUserId,
      error: err.message
    });

    _releaseLock(userId);
    return false;
  }
};

// ── Proactive Token Refresh Sweep ────────────────────
// Finds all integrations whose tokens expire within the buffer window
// and refreshes them BEFORE they expire.
const runProactiveRefresh = async (bufferMs = 5 * 60 * 1000) => {
  try {
    const expiringIntegrations = await DiscordIntegration.find({
      integrationStatus: { $in: [INTEGRATION_STATUS.ACTIVE, INTEGRATION_STATUS.TOKEN_EXPIRED] },
      expiresAt: { $lte: new Date(Date.now() + bufferMs) },
      refreshFailureCount: { $lt: 5 }  // Stop trying after 5 consecutive failures
    }).limit(50);  // Process in batches

    if (expiringIntegrations.length === 0) return;

    console.info(`[SessionHealth] Proactive refresh: ${expiringIntegrations.length} tokens expiring soon`);

    // Stagger refreshes to avoid Discord API rate limits
    for (let i = 0; i < expiringIntegrations.length; i++) {
      await refreshIntegration(expiringIntegrations[i]);
      // Wait 500ms between refreshes
      if (i < expiringIntegrations.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  } catch (err) {
    console.error('[SessionHealth] Proactive refresh sweep failed:', err.message);
  }
};

// ── Get Health Status for a User ─────────────────────
const getHealthStatus = async (userId) => {
  const integration = await DiscordIntegration.findOne({ auraUserId: userId });
  if (!integration) return { hasDiscord: false };

  return {
    hasDiscord: true,
    status: integration.integrationStatus,
    isExpired: integration.isTokenExpired(),
    isExpiringSoon: integration.isTokenExpiringSoon(),
    expiresAt: integration.expiresAt,
    refreshFailureCount: integration.refreshFailureCount,
    lastRefreshAt: integration.lastRefreshAt,
    lastRefreshError: integration.lastRefreshError
  };
};

// ── Start Scheduled Health Monitor ───────────────────
let _intervalId = null;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

const startHealthMonitor = () => {
  if (_intervalId) return; // Already running

  console.info('[SessionHealth] Starting proactive token health monitor (every 5min)');
  _intervalId = setInterval(runProactiveRefresh, REFRESH_INTERVAL_MS);

  // Run initial sweep after 30 seconds (let server boot first)
  setTimeout(runProactiveRefresh, 30000);
};

const stopHealthMonitor = () => {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
    console.info('[SessionHealth] Token health monitor stopped');
  }
};

module.exports = {
  refreshIntegration,
  runProactiveRefresh,
  getHealthStatus,
  startHealthMonitor,
  stopHealthMonitor
};
