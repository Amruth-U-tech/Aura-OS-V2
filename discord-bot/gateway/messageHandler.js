const HubDiscordMapping = require('../../backend/src/models/HubDiscordMapping');
const { normalizeMessage } = require('../normalizers/messageNormalizer');

// ======================================================
// MESSAGE HANDLER — Phase D3.2.2
// Inbound Discord → Aura relay via Redis Streams
//
// Flow: Discord messageCreate → normalize → Redis XADD
// Must: reject bot self-loops, preserve traceId
// ======================================================

async function handle(msg, redis) {
  // Reject bot messages to prevent relay loops
  if (msg.author.bot) return;

  // Find mapping for this channel
  const mapping = await HubDiscordMapping.findOne({
    discordChannelId: msg.channelId,
    syncStatus: 'ACTIVE',
  }).lean();

  if (!mapping) return; // Not a mapped Aura hub channel

  // Normalize Discord payload to Aura format
  const normalized = normalizeMessage(msg);

  // Append to Redis stream
  if (redis && redis.status === 'ready') {
    try {
      await redis.xadd(
        `hub:${mapping.auraHubId}:messages`, 'MAXLEN', '~', '1000', '*',
        'source', 'discord',
        'content', normalized.content,
        'authorId', normalized.authorDiscordId || '',
        'authorName', normalized.authorName,
        'discordMessageId', msg.id,
        'ts', String(Date.now())
      );
      console.log(`[Bot:Message] ✅ Relayed to hub ${mapping.auraHubId}`);
    } catch (err) {
      console.error(`[Bot:Message] ❌ Stream append failed: ${err.message}`);
    }
  }
}

module.exports = { handle };
