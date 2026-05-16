// ======================================================
// GEMMA (GEMINI) CONFIGURATION
// Environment validation for Gemini AI API
// Owns: config extraction + startup validation
// Must NOT: contain AI logic, scoring, or challenge logic
// ======================================================

const GEMMA_CONFIG = {
  API_URL: process.env.GEMMA_API_URL || 'https://generativelanguage.googleapis.com/v1beta',
  API_KEY: process.env.GEMMA_API_KEY,
  MODEL: process.env.GEMMA_MODEL || 'gemini-2.0-flash',
  TIMEOUT_MS: 30000,
  MAX_RETRIES: 2,
  MAX_RESPONSE_SIZE: 1024 * 1024 // 1MB response cap
};

/**
 * Validates all required Gemma/Gemini env vars are present.
 * Returns { valid, missing[] } — graceful degradation.
 */
const validateGemmaEnv = () => {
  const required = ['GEMMA_API_KEY'];

  const missing = required.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.warn('[GemmaConfig] ⚠️ Missing env vars:', missing.join(', '));
    console.warn('[GemmaConfig] AI validation will be unavailable until configured.');
    return { valid: false, missing };
  }

  console.log('[GemmaConfig] ✅ Gemini AI env vars present');
  return { valid: true, missing: [] };
};

module.exports = { GEMMA_CONFIG, validateGemmaEnv };
