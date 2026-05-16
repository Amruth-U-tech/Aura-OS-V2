// ======================================================
// TRUST PAYLOAD VALIDATOR
// Owns: validating trust event payloads before processing
// Defines the communication contract for trust updates
// Must NOT: contain trust score calculations
// ======================================================

/**
 * Trust event payload contract.
 * Every trust-affecting event must conform to this shape.
 * 
 * {
 *   userId:      String (required)
 *   source:      String (required) — TASK_COMPLETION | CHALLENGE_PROOF | DEADLINE_MISS
 *   validScore:  Number (0-100, required for proof-based events)
 *   metadata:    Object (optional) — additional context
 *   timestamp:   Date   (auto-filled if missing)
 * }
 */

const VALID_SOURCES = [
  'TASK_COMPLETION',
  'CHALLENGE_PROOF',
  'CHALLENGE_WIN',
  'CHALLENGE_LOSS',
  'DEADLINE_MISS',
  'STREAK_BONUS',
  'MANUAL_ADJUSTMENT'
];

/**
 * Validates a trust event payload.
 * @param {object} payload
 * @returns {{ valid: boolean, errors: string[], sanitized: object|null }}
 */
const validateTrustPayload = (payload) => {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Payload must be a non-null object'], sanitized: null };
  }

  // userId
  if (!payload.userId || typeof payload.userId !== 'string') {
    errors.push('userId is required and must be a string');
  }

  // source
  if (!payload.source || !VALID_SOURCES.includes(payload.source)) {
    errors.push(`source must be one of: ${VALID_SOURCES.join(', ')}`);
  }

  // validScore (required for proof-based sources)
  const proofSources = ['TASK_COMPLETION', 'CHALLENGE_PROOF'];
  if (proofSources.includes(payload.source)) {
    if (typeof payload.validScore !== 'number' || payload.validScore < 0 || payload.validScore > 100) {
      errors.push('validScore must be a number between 0 and 100 for proof-based events');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, sanitized: null };
  }

  // Sanitized output
  return {
    valid: true,
    errors: [],
    sanitized: {
      userId: payload.userId,
      source: payload.source,
      validScore: typeof payload.validScore === 'number' ? payload.validScore : null,
      metadata: payload.metadata || {},
      timestamp: payload.timestamp || new Date()
    }
  };
};

module.exports = { validateTrustPayload, VALID_SOURCES };
