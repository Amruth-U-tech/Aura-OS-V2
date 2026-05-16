// ======================================================
// API RESPONSE NORMALIZATION
// Handles backend response unwrapping safely
// Prevents frontend/backend response mismatch
// ======================================================

const sendSuccess = (res, data, message = 'Success', statusCode = 200, meta = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    meta,
    timestamp: new Date().toISOString()
  });
};

const sendError = (res, message, statusCode = 500, errors = null, errorCode = 'SERVER_ERROR') => {
  const response = {
    success: false,
    message,
    errorCode,
    meta: {},
    timestamp: new Date().toISOString()
  };
  
  if (errors) {
    response.errors = errors;
  }
  
  return res.status(statusCode).json(response);
};

module.exports = {
  sendSuccess,
  sendError
};
