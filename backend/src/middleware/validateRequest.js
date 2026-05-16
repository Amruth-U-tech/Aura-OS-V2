const { sendError } = require('../utils/apiResponse');
const ERROR_CODES = require('../constants/errorCodes');

// ======================================================
// REQUEST VALIDATION MIDDLEWARE
// Prevents malformed JSON and invalid bodies from reaching controllers
// ======================================================

const validateRequest = (schema) => (req, res, next) => {
  if (!schema) {
    return next();
  }
  
  const { error } = schema.validate(req.body);
  if (error) {
    const message = error.details.map(i => i.message).join(',');
    return sendError(res, message, 400, null, ERROR_CODES.VALIDATION_ERROR);
  }
  
  next();
};

module.exports = validateRequest;
