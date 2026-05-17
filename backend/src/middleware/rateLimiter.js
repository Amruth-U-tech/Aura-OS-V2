const rateLimit = require('express-rate-limit');
const { sendError } = require('../utils/apiResponse');
const ERROR_CODES = require('../constants/errorCodes');

// ======================================================
// RATE LIMITER
// Prevents backend overload and DDOS attempts
// Standardizes 429 response structure for apiService
// ======================================================

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Phase 3.1.4: Increased from 100 — realtime app needs headroom for reconnect hydration + normal usage
  handler: (req, res, next, options) => {
    sendError(res, 'Too many requests, please try again later.', 429, null, ERROR_CODES.RATE_LIMITED);
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

module.exports = { apiLimiter };
