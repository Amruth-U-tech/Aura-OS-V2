const livekitTokenService = require('./livekitTokenService');
const rtcAuthorization = require('./rtcAuthorization');

// ======================================================
// RTC METRICS — Phase D3.2.4
// ======================================================

function getMetrics() {
  return {
    livekit: livekitTokenService.getMetrics(),
    authorization: rtcAuthorization.getMetrics(),
  };
}

module.exports = { getMetrics };
