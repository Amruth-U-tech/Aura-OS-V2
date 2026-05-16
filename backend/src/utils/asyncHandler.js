// ======================================================
// ASYNC HANDLER
// Prevents unhandled promises in controllers
// Eliminates the need for try/catch blocks in every route
// ======================================================

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
