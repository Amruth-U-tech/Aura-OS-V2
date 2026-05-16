// ======================================================
// GEMMA TIMEOUT HANDLER
// Pure timeout utility for Gemini API requests
// Owns: promise race with timeout, abort signal
// Must NOT: contain business logic
// ======================================================

/**
 * Wraps a fetch promise with a timeout.
 * Returns the fetch response or throws a timeout error.
 * @param {Promise} fetchPromise - The fetch promise to race
 * @param {number} timeoutMs - Timeout in milliseconds
 */
const handleGemmaTimeout = (fetchPromise, timeoutMs) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`Gemini API request timed out after ${timeoutMs}ms`);
      error.code = 'GEMMA_TIMEOUT';
      reject(error);
    }, timeoutMs);

    fetchPromise
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

module.exports = { handleGemmaTimeout };
