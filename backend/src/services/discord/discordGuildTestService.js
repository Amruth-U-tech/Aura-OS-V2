// ======================================================
// DISCORD GUILD TEST SERVICE
// Owns: safe guild permission validation
// Tests bot permissions without persistent guild creation
// Must NOT: manage hub lifecycle or store data
// ======================================================

const discordClient = require('./discordClient');

/**
 * Lists guilds the bot is currently in.
 * Used to validate bot permissions and connectivity.
 */
const listBotGuilds = async () => {
  if (!discordClient.isReady) {
    return { success: false, error: 'Discord not configured', code: 'DISCORD_NOT_CONFIGURED' };
  }

  const result = await discordClient.get('/users/@me/guilds');

  if (result.success) {
    return {
      success: true,
      guilds: result.data.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner: g.owner,
        permissions: g.permissions
      }))
    };
  }

  return result;
};

/**
 * Validates bot has required permissions in a specific guild.
 * @param {string} guildId - Discord guild ID to check
 */
const validateGuildPermissions = async (guildId) => {
  if (!discordClient.isReady) {
    return { success: false, error: 'Discord not configured', code: 'DISCORD_NOT_CONFIGURED' };
  }

  if (!guildId) {
    return { success: false, error: 'Guild ID required', code: 'GUILD_ID_MISSING' };
  }

  const result = await discordClient.get(`/guilds/${guildId}`);

  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Guild not accessible',
      code: result.code || 'GUILD_NOT_ACCESSIBLE'
    };
  }

  return {
    success: true,
    guild: {
      id: result.data.id,
      name: result.data.name,
      memberCount: result.data.approximate_member_count || null
    }
  };
};

module.exports = { listBotGuilds, validateGuildPermissions };
