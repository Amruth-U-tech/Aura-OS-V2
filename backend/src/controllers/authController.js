const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const { sendSuccess } = require('../utils/apiResponse');

// ======================================================
// AUTH CONTROLLER
// Handles: register, login request/response flow
// Delegates: all business logic to authService
// Must NOT: contain credential logic or token generation
// ======================================================

const register = asyncHandler(async (req, res) => {
  const { email, password, playerName } = req.body;
  const result = await authService.register({ email, password, playerName });
  sendSuccess(res, result, 'Registration successful', 201);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await authService.login({ email, password });
  sendSuccess(res, result, 'Login successful');
});

module.exports = {
  register,
  login
};
