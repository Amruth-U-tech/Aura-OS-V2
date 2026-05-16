// ======================================================
// DISCORD WEBHOOK SERVICE
// Owns: webhook message formatting and delivery
// Prepares webhook communication contract
// Must NOT: contain hub lifecycle or challenge resolution
// ======================================================

const { DISCORD_CONFIG } = require('./discordConfig');

/**
 * Sends a test message to a Discord webhook URL.
 * Used to validate webhook connectivity before hub lifecycle uses it.
 * @param {string} webhookUrl - Full Discord webhook URL
 * @param {object} options - { content, embeds[] }
 */
const sendWebhookTest = async (webhookUrl) => {
  if (!webhookUrl || typeof webhookUrl !== 'string') {
    return {
      success: false,
      error: 'Invalid webhook URL',
      code: 'WEBHOOK_INVALID_URL'
    };
  }

  // Validate it's a Discord webhook URL
  if (!webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
    return {
      success: false,
      error: 'URL is not a valid Discord webhook',
      code: 'WEBHOOK_INVALID_URL'
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCORD_CONFIG.TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '⚔️ **Aura OS** — Webhook connectivity test successful.',
        username: 'Aura OS Bot'
      })
    });

    clearTimeout(timeout);

    if (response.status === 204 || response.ok) {
      return { success: true, status: response.status };
    }

    const errorBody = await response.json().catch(() => ({}));
    return {
      success: false,
      status: response.status,
      error: errorBody.message || 'Webhook delivery failed',
      code: 'WEBHOOK_SEND_FAILED'
    };
  } catch (err) {
    clearTimeout(timeout);

    if (err.name === 'AbortError') {
      return { success: false, error: 'Webhook request timed out', code: 'WEBHOOK_TIMEOUT' };
    }

    return { success: false, error: err.message, code: 'WEBHOOK_NETWORK_ERROR' };
  }
};

/**
 * Formats an embed payload for Discord (reusable builder).
 */
const buildEmbed = ({ title, description, color = 0x6366f1, fields = [], footer = null }) => ({
  title,
  description,
  color,
  fields,
  footer: footer ? { text: footer } : { text: 'Aura OS V2' },
  timestamp: new Date().toISOString()
});

module.exports = { sendWebhookTest, buildEmbed };
