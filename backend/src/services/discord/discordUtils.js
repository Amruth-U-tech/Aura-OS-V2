// ======================================================
// DISCORD UTILITIES
// Pure helpers for Discord data formatting
// Must NOT: make API calls, contain state, or own logic
// ======================================================

/**
 * Generates OAuth2 authorization URL for user Discord linking.
 * @param {string} state - CSRF protection token
 */
const buildOAuth2Url = (state = '') => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = encodeURIComponent(process.env.DISCORD_REDIRECT_URI || '');

  return `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify+guilds&state=${state}`;
};

/**
 * Generates bot invite URL with required permissions.
 * Permissions: Send Messages, Embed Links, Read Messages
 */
const buildBotInviteUrl = () => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  // Permission integer: Send Messages (2048) + Embed Links (16384) + Read Message History (65536)
  const permissions = 2048 + 16384 + 65536;
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot&permissions=${permissions}`;
};

/**
 * Sanitizes Discord username for safe display.
 */
const sanitizeDiscordUsername = (username) => {
  if (!username || typeof username !== 'string') return 'Unknown';
  return username.replace(/[<>@#&!]/g, '').trim().slice(0, 32);
};

module.exports = { buildOAuth2Url, buildBotInviteUrl, sanitizeDiscordUsername };
