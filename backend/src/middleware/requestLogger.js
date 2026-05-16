const morgan = require('morgan');

// ======================================================
// REQUEST LOGGER
// Standardizes logging for all incoming requests
// Useful for Docker logs and backend tracing
// ======================================================

// Custom format to keep it clean and minimal
const requestLogger = morgan(':method :url :status :res[content-length] - :response-time ms');

module.exports = requestLogger;
