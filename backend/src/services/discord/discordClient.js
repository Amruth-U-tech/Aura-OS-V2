// ======================================================
// DISCORD CLIENT
// REST client wrapper for Discord API communication
// Owns: HTTP requests, token injection, retries, timeouts
// Must NOT: contain hub logic, challenge logic, or persistence
// ======================================================

const { DISCORD_CONFIG, validateDiscordEnv } = require('./discordConfig');

class DiscordClient {
  constructor() {
    this._ready = false;
    this._init();
  }

  _init() {
    const { valid } = validateDiscordEnv();
    this._ready = valid;
  }

  /**
   * Whether the Discord integration is configured and available.
   */
  get isReady() {
    return this._ready;
  }

  /**
   * Safe fetch wrapper for Discord API.
   * Handles timeouts, retries, and token injection.
   */
  async request(endpoint, options = {}) {
    if (!this._ready) {
      return {
        success: false,
        error: 'Discord integration not configured',
        code: 'DISCORD_NOT_CONFIGURED'
      };
    }

    const url = `${DISCORD_CONFIG.API_BASE}${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DISCORD_CONFIG.TIMEOUT_MS);

    let lastError = null;

    for (let attempt = 1; attempt <= DISCORD_CONFIG.MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'Authorization': `Bot ${DISCORD_CONFIG.MASTER_TOKEN}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
          }
        });

        clearTimeout(timeout);

        // Handle rate limiting
        if (response.status === 429) {
          const rateLimitData = await response.json().catch(() => ({}));
          const retryAfter = rateLimitData.retry_after || 1;
          console.warn(`[DiscordClient] Rate limited. Retry after ${retryAfter}s (attempt ${attempt})`);
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          continue;
        }

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          return {
            success: false,
            status: response.status,
            error: errorBody.message || `Discord API error: ${response.status}`,
            code: 'DISCORD_API_ERROR'
          };
        }

        // 204 No Content responses
        if (response.status === 204) {
          return { success: true, data: null };
        }

        const data = await response.json();
        return { success: true, data };

      } catch (err) {
        clearTimeout(timeout);
        lastError = err;

        if (err.name === 'AbortError') {
          return {
            success: false,
            error: `Discord API timeout after ${DISCORD_CONFIG.TIMEOUT_MS}ms`,
            code: 'DISCORD_TIMEOUT'
          };
        }

        // Network errors — retry
        if (attempt < DISCORD_CONFIG.MAX_RETRIES) {
          console.warn(`[DiscordClient] Request failed (attempt ${attempt}), retrying...`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Discord API request failed after retries',
      code: 'DISCORD_REQUEST_FAILED'
    };
  }

  /**
   * GET request shorthand
   */
  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  /**
   * POST request shorthand
   */
  async post(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }
}

// Singleton instance
const discordClient = new DiscordClient();
module.exports = discordClient;
