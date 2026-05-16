// ======================================================
// DISCORD CONFIGURATION
// Environment validation and fail-fast for Discord API
// Owns: config extraction + startup validation
// Must NOT: contain bot logic, hub logic, or API calls
// ======================================================

const DISCORD_CONFIG = {
  MASTER_TOKEN: process.env.DISCORD_MASTER_TOKEN,
  CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
  REDIRECT_URI: process.env.DISCORD_REDIRECT_URI,
  API_BASE: 'https://discord.com/api/v10',
  TIMEOUT_MS: 10000,
  MAX_RETRIES: 3
};

/**
 * Validates all required Discord env vars are present.
 * Returns { valid, missing[] } — does NOT crash the server.
 * Integration-layer env vars are optional at boot (graceful degradation).
 */
const validateDiscordEnv = () => {
  const required = [
    'DISCORD_MASTER_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_REDIRECT_URI'
  ];

  const missing = required.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.warn('[DiscordConfig] ⚠️ Missing env vars:', missing.join(', '));
    console.warn('[DiscordConfig] Discord integration will be unavailable until configured.');
    return { valid: false, missing };
  }

  console.log('[DiscordConfig] ✅ All Discord env vars present');
  return { valid: true, missing: [] };
};

module.exports = { DISCORD_CONFIG, validateDiscordEnv };
