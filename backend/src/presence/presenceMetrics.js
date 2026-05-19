// ======================================================
// PRESENCE METRICS — Phase D3.2.3
// Observability for the presence runtime
// ======================================================

const presenceService = require('./presenceService');

function getMetrics() {
  return {
    presence: presenceService.getMetrics(),
  };
}

module.exports = { getMetrics };
