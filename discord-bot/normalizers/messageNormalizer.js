// ======================================================
// MESSAGE NORMALIZER — Phase D3.2.2
// Converts Discord message format → Aura canonical format
//
// This is the ONLY place Discord payload touches Aura format
// Must: strip Discord-specific structures, resolve mentions
// Must NOT: pass raw Discord objects downstream
// ======================================================

function normalizeMessage(discordMsg) {
  return {
    discordMessageId: discordMsg.id,
    content: _cleanContent(discordMsg.content || ''),
    authorDiscordId: discordMsg.author?.id || null,
    authorName: discordMsg.member?.displayName || discordMsg.author?.username || 'Unknown',
    authorAvatar: discordMsg.author?.displayAvatarURL?.() || null,
    attachments: (discordMsg.attachments || []).map(a => ({
      url: a.url,
      name: a.name,
      contentType: a.contentType,
      size: a.size,
    })),
    timestamp: discordMsg.createdTimestamp || Date.now(),
    source: 'discord',
  };
}

// ── Clean Discord-specific mention syntax ─────────────
function _cleanContent(content) {
  // Replace <@userId> with @username (simplified)
  return content
    .replace(/<@!?\d+>/g, '@user')
    .replace(/<#\d+>/g, '#channel')
    .replace(/<@&\d+>/g, '@role');
}

module.exports = { normalizeMessage };
