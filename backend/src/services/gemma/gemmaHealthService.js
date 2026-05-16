// ======================================================
// GEMMA HEALTH SERVICE
// Owns: Gemini AI API connectivity validation
// Exposes health data for integration routes
// Must NOT: contain scoring logic or challenge logic
// ======================================================

const { validateGemmaEnv, GEMMA_CONFIG } = require('./gemmaConfig');
const { parseGemmaResponse } = require('./gemmaResponseParser');

/**
 * Pings Gemini API with a minimal prompt to verify connectivity.
 * Dynamically checks env vars at call time (not cached).
 */
const checkGemmaHealth = async () => {
  // Dynamic check — don't rely on singleton cached state
  const envCheck = validateGemmaEnv();

  if (!envCheck.valid) {
    return {
      provider: 'gemini',
      status: 'not_configured',
      message: `Missing: ${envCheck.missing.join(', ')}`,
      timestamp: new Date().toISOString()
    };
  }

  try {
    const apiKey = process.env.GEMMA_API_KEY;
    const model = process.env.GEMMA_MODEL || 'gemini-2.0-flash';
    const baseUrl = process.env.GEMMA_API_URL || GEMMA_CONFIG.API_URL;
    const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMMA_CONFIG.TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Respond with exactly: HEALTH_OK' }] }]
      })
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      return {
        provider: 'gemini',
        status: 'error',
        message: errorBody.error?.message || `Gemini API error: ${response.status}`,
        httpStatus: response.status,
        timestamp: new Date().toISOString()
      };
    }

    const data = await response.json();
    const parsed = parseGemmaResponse({ success: true, data });

    if (parsed.success) {
      return {
        provider: 'gemini',
        status: 'connected',
        model,
        responsePreview: parsed.text.slice(0, 50),
        timestamp: new Date().toISOString()
      };
    }

    return {
      provider: 'gemini',
      status: 'error',
      message: parsed.error,
      code: parsed.code,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      provider: 'gemini',
      status: 'error',
      message: err.name === 'AbortError' ? 'Gemini API timeout' : err.message,
      timestamp: new Date().toISOString()
    };
  }
};

module.exports = { checkGemmaHealth };

