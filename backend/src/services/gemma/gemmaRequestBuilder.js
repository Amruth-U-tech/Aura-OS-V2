// ======================================================
// GEMMA REQUEST BUILDER
// Owns: request payload construction for Gemini API
// Prepares structured prompts for future validation use
// Must NOT: contain scoring logic or challenge context
// ======================================================

/**
 * Builds a text-only generation request payload.
 * @param {string} prompt - The user prompt
 * @param {object} options - { temperature, maxTokens }
 */
const buildTextRequest = (prompt, options = {}) => {
  const { temperature = 0.4, maxTokens = 1024 } = options;

  return {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      topP: 0.95,
      topK: 40
    }
  };
};

/**
 * Builds a multimodal request payload (text + image).
 * Used for future proof validation (screenshot/photo evaluation).
 * @param {string} prompt - The text prompt
 * @param {string} imageBase64 - Base64 encoded image data
 * @param {string} mimeType - Image MIME type (e.g. 'image/png')
 * @param {object} options - { temperature, maxTokens }
 */
const buildImageRequest = (prompt, imageBase64, mimeType = 'image/png', options = {}) => {
  const { temperature = 0.4, maxTokens = 1024 } = options;

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw new Error('Invalid image data: base64 string required');
  }

  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
    throw new Error(`Unsupported image MIME type: ${mimeType}`);
  }

  return {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: imageBase64
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      topP: 0.95,
      topK: 40
    }
  };
};

module.exports = { buildTextRequest, buildImageRequest };
