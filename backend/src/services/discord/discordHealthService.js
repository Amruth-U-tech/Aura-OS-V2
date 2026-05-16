// ======================================================
// DISCORD HEALTH SERVICE
// Owns: Discord API connectivity validation
// Exposes health data for integration routes
// Must NOT: contain hub logic or challenge logic
// ======================================================

const { validateDiscordEnv, DISCORD_CONFIG } = require('./discordConfig');

/**
 * Pings Discord API to verify connectivity and bot auth.
 * Calls GET /users/@me — lightweight self-check.
 * Dynamically checks env vars at call time (not cached).
 */
const checkDiscordHealth = async () => {
  // Dynamic check — don't rely on singleton cached state
  const envCheck = validateDiscordEnv();
  
  if (!envCheck.valid) {
    return {
      provider: 'discord',
      status: 'not_configured',
      message: `Missing: ${envCheck.missing.join(', ')}`,
      timestamp: new Date().toISOString()
    };
  }

  try {
    const token = process.env.DISCORD_MASTER_TOKEN;
    const url = `${DISCORD_CONFIG.API_BASE}/users/@me`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DISCORD_CONFIG.TIMEOUT_MS);
    
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      return {
        provider: 'discord',
        status: 'connected',
        botUser: data.username,
        botId: data.id,
        timestamp: new Date().toISOString()
      };
    }

    const errorBody = await response.json().catch(() => ({}));
    return {
      provider: 'discord',
      status: 'error',
      message: errorBody.message || `Discord API error: ${response.status}`,
      httpStatus: response.status,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      provider: 'discord',
      status: 'error',
      message: err.name === 'AbortError' ? 'Discord API timeout' : err.message,
      timestamp: new Date().toISOString()
    };
  }
};

module.exports = { checkDiscordHealth };
