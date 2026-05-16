// ======================================================
// GLOBAL ERROR CODES
// Machine-readable identifiers for stable API contracts
// Prevents string-based magic errors
// ======================================================

const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TASK_INVALID: 'TASK_INVALID',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  NETWORK_FAILURE: 'NETWORK_FAILURE',
  BAD_REQUEST: 'BAD_REQUEST',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY'
};

module.exports = ERROR_CODES;
