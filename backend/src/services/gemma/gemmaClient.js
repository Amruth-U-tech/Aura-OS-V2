// ======================================================
// GEMMA (GEMINI) CLIENT
// HTTP client wrapper for Gemini AI API communication
// Owns: requests, auth injection, retries, timeouts
// Must NOT: contain scoring logic, challenge logic, trust math
// ======================================================

const { GEMMA_CONFIG, validateGemmaEnv } = require('./gemmaConfig');
const { handleGemmaTimeout } = require('./gemmaTimeoutHandler');

class GemmaClient {
  constructor() {
    this._ready = false;
    this._init();
  }

  _init() {
    const { valid } = validateGemmaEnv();
    this._ready = valid;
  }

  get isReady() {
    return this._ready;
  }

  /**
   * Sends a request to the Gemini API.
   * @param {string} endpoint - API endpoint path (appended to base URL)
   * @param {object} body - Request body
   */
  async request(endpoint, body = {}) {
    if (!this._ready) {
      return {
        success: false,
        error: 'Gemini AI not configured',
        code: 'GEMMA_NOT_CONFIGURED'
      };
    }

    const url = `${GEMMA_CONFIG.API_URL}${endpoint}?key=${GEMMA_CONFIG.API_KEY}`;
    let lastError = null;

    for (let attempt = 1; attempt <= GEMMA_CONFIG.MAX_RETRIES; attempt++) {
      try {
        const result = await handleGemmaTimeout(
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          }),
          GEMMA_CONFIG.TIMEOUT_MS
        );

        if (!result.ok) {
          const errorBody = await result.json().catch(() => ({}));
          return {
            success: false,
            status: result.status,
            error: errorBody.error?.message || `Gemini API error: ${result.status}`,
            code: 'GEMMA_API_ERROR'
          };
        }

        const data = await result.json();
        return { success: true, data };

      } catch (err) {
        lastError = err;

        if (err.code === 'GEMMA_TIMEOUT') {
          return { success: false, error: err.message, code: 'GEMMA_TIMEOUT' };
        }

        if (attempt < GEMMA_CONFIG.MAX_RETRIES) {
          console.warn(`[GemmaClient] Request failed (attempt ${attempt}), retrying...`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Gemini API request failed after retries',
      code: 'GEMMA_REQUEST_FAILED'
    };
  }

  /**
   * Generate content using the configured model.
   * This is the main entry point for AI communication.
   * @param {string} prompt - Text prompt to send
   */
  async generateContent(prompt) {
    return this.request(`/models/${GEMMA_CONFIG.MODEL}:generateContent`, {
      contents: [{ parts: [{ text: prompt }] }]
    });
  }
}

// Singleton instance
const gemmaClient = new GemmaClient();
module.exports = gemmaClient;
