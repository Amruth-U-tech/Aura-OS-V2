const { sendError } = require('../utils/apiResponse');
const ERROR_CODES = require('../constants/errorCodes');

// ======================================================
// CENTRALIZED ERROR HANDLER
// Catches all unhandled errors and ensures frontend gets 
// standardized JSON instead of raw HTML/stack traces
// ======================================================

const errorHandler = (err, req, res, next) => {
  // Log the error for internal debugging
  console.error('[Error]:', err.stack || err.message || err);

  // Phase 2.4.3: Map codeName to HTTP status if statusCode was not explicitly set
  // This ensures domain errors (authService, etc.) return correct HTTP codes
  const CODE_STATUS_MAP = {
    [ERROR_CODES.UNAUTHORIZED]: 401,
    [ERROR_CODES.RESOURCE_NOT_FOUND]: 404,
    [ERROR_CODES.BAD_REQUEST]: 400,
    [ERROR_CODES.VALIDATION_ERROR]: 400,
    [ERROR_CODES.DUPLICATE_ENTRY]: 409,
    [ERROR_CODES.RATE_LIMITED]: 429,
    [ERROR_CODES.TASK_NOT_FOUND]: 404,
    [ERROR_CODES.TASK_INVALID]: 400
  };

  let statusCode = err.statusCode
    || CODE_STATUS_MAP[err.codeName]
    || (res.statusCode === 200 ? 500 : res.statusCode);
  let message = err.message || 'Internal Server Error';
  let errorCode = err.codeName || ERROR_CODES.SERVER_ERROR;

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((val) => val.message).join(', ');
    errorCode = ERROR_CODES.VALIDATION_ERROR;
  }

  // Handle Mongoose Cast Error (Invalid ID)
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 400;
    message = 'Resource not found';
    errorCode = ERROR_CODES.RESOURCE_NOT_FOUND;
  }

  // Handle MongoDB duplicate key error
  if (err.code === 11000) {
    statusCode = 400;
    message = 'Duplicate field value entered';
    errorCode = ERROR_CODES.DUPLICATE_ENTRY;
  }

  sendError(res, message, statusCode, null, errorCode);
};

module.exports = errorHandler;
