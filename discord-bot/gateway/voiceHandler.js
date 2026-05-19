const HubDiscordMapping = require('../../backend/src/models/HubDiscordMapping');

// ======================================================
// VOICE HANDLER — Phase D3.2.2
// Discord VOICE_STATE_UPDATE → Redis presence update
// ======================================================

async function handle(oldState, newState, redis) {
  // Determine if join, leave, or change
  const oldChannel = oldState.channelId;
  const newChannel = newState.channelId;
  const userId = newState.member?.user?.id;
  const displayName = newState.member?.displayName || newState.member?.user?.username || 'Unknown';

  if (!userId) return;

  // Voice channel change
  if (oldChannel !== newChannel) {
    // Left a voice channel
    if (oldChannel) {
      const mapping = await HubDiscordMapping.findOne({
        discordVoiceChannelId: oldChannel,
        syncStatus: 'ACTIVE',
      }).lean();

      if (mapping && redis?.status === 'ready') {
        await redis.publish('presence:events', JSON.stringify({
          type: 'VOICE_LEFT',
          hubId: mapping.auraHubId.toString(),
          discordUserId: userId,
          displayName,
          timestamp: Date.now(),
        }));
      }
    }

    // Joined a voice channel
    if (newChannel) {
      const mapping = await HubDiscordMapping.findOne({
        discordVoiceChannelId: newChannel,
        syncStatus: 'ACTIVE',
      }).lean();

      if (mapping && redis?.status === 'ready') {
        await redis.publish('presence:events', JSON.stringify({
          type: 'VOICE_JOINED',
          hubId: mapping.auraHubId.toString(),
          discordUserId: userId,
          displayName,
          muted: newState.mute || false,
          deafened: newState.deaf || false,
          timestamp: Date.now(),
        }));
      }
    }
  }

  // Mute/deafen state change (same channel)
  if (oldChannel && oldChannel === newChannel) {
    if (oldState.mute !== newState.mute || oldState.deaf !== newState.deaf) {
      const mapping = await HubDiscordMapping.findOne({
        discordVoiceChannelId: newChannel,
        syncStatus: 'ACTIVE',
      }).lean();

      if (mapping && redis?.status === 'ready') {
        await redis.publish('presence:events', JSON.stringify({
          type: 'VOICE_STATE_CHANGED',
          hubId: mapping.auraHubId.toString(),
          discordUserId: userId,
          muted: newState.mute || false,
          deafened: newState.deaf || false,
          timestamp: Date.now(),
        }));
      }
    }
  }
}

module.exports = { handle };
