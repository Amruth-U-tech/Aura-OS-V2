// ======================================================
// GEMMA RESPONSE PARSER
// Owns: normalizing Gemini API responses into safe format
// Handles malformed, empty, and oversized responses
// Must NOT: contain scoring formulas or business logic
// ======================================================

/**
 * Parses a raw Gemini API response into a normalized structure.
 * @param {object} rawResponse - The raw { success, data } from gemmaClient
 * @returns {{ success, text, finishReason, error }}
 */
const parseGemmaResponse = (rawResponse) => {
  if (!rawResponse) {
    return { success: false, text: null, error: 'Null response received', code: 'GEMMA_NULL_RESPONSE' };
  }

  if (!rawResponse.success) {
    return {
      success: false,
      text: null,
      error: rawResponse.error || 'Gemini request failed',
      code: rawResponse.code || 'GEMMA_RESPONSE_ERROR'
    };
  }

  const data = rawResponse.data;

  if (!data) {
    return { success: false, text: null, error: 'Empty response body', code: 'GEMMA_EMPTY_RESPONSE' };
  }

  // Extract candidates
  const candidates = data.candidates;
  if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
    return {
      success: false,
      text: null,
      error: 'No candidates in response',
      code: 'GEMMA_NO_CANDIDATES'
    };
  }

  const firstCandidate = candidates[0];
  const finishReason = firstCandidate.finishReason || 'UNKNOWN';

  // Extract text from parts
  const parts = firstCandidate.content?.parts;
  if (!parts || !Array.isArray(parts) || parts.length === 0) {
    return {
      success: false,
      text: null,
      finishReason,
      error: 'No content parts in candidate',
      code: 'GEMMA_NO_PARTS'
    };
  }

  const text = parts
    .filter(p => p.text)
    .map(p => p.text)
    .join('\n');

  if (!text || text.trim().length === 0) {
    return {
      success: false,
      text: null,
      finishReason,
      error: 'Empty text content in response',
      code: 'GEMMA_EMPTY_TEXT'
    };
  }

  return {
    success: true,
    text: text.trim(),
    finishReason
  };
};

/**
 * Attempts to parse a JSON block from Gemini text response.
 * Many validation responses will be structured JSON within markdown code blocks.
 * @param {string} text - Raw text from Gemini response
 * @returns {object|null}
 */
const extractJsonFromResponse = (text) => {
  if (!text) return null;

  // Try direct JSON parse first
  try {
    return JSON.parse(text);
  } catch {
    // Not raw JSON — try extracting from code blocks
  }

  // Try extracting from ```json ... ``` blocks
  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    try {
      return JSON.parse(jsonBlockMatch[1].trim());
    } catch {
      // Malformed JSON in code block
    }
  }

  return null;
};

module.exports = { parseGemmaResponse, extractJsonFromResponse };
