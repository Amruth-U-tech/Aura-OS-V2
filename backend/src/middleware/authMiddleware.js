const authService = require('../services/authService');
const { sendError } = require('../utils/apiResponse');
const ERROR_CODES = require('../constants/errorCodes');

// ======================================================
// AUTH MIDDLEWARE
// Protects routes by validating JWT tokens
// Attaches decoded user identity to req.user
// Must NOT: contain business logic
// ======================================================

const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'No token provided', 401, null, ERROR_CODES.UNAUTHORIZED);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = authService.verifyToken(token);
    req.user = { id: decoded.id };
    next();
  } catch (err) {
    return sendError(res, err.message, 401, null, ERROR_CODES.UNAUTHORIZED);
  }
};

module.exports = { protect };
