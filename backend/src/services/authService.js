const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ERROR_CODES = require('../constants/errorCodes');
const { bootstrapNewPlayer } = require('./orchestration/playerBootstrap');

// ======================================================
// AUTH SERVICE
// Owns: credential validation, token issuance, session truth
// Must NOT: contain profile or onboarding logic
// ======================================================

const SALT_ROUNDS = 12;

// ── Token generation ──────────────────────────────────
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// ── Register ──────────────────────────────────────────
const register = async ({ email, password, playerName }) => {
  // Guard: prevent duplicate registrations
  const existing = await User.findOne({ email });
  if (existing) {
    const err = new Error('An account with this email already exists');
    err.codeName = ERROR_CODES.DUPLICATE_ENTRY;
    throw err;
  }

  // Phase 2.4.4: Enforce unique playerName (case-insensitive)
  const nameTaken = await User.findOne({ normalizedPlayerName: playerName.toLowerCase().trim() });
  if (nameTaken) {
    const err = new Error('This player name is already taken');
    err.codeName = ERROR_CODES.DUPLICATE_ENTRY;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await User.create({
    email,
    passwordHash,
    playerName
  });

  const token = generateToken(user._id);

  // Bootstrap player domains (profile + trust)
  try {
    await bootstrapNewPlayer(user._id, { playerName });
  } catch (err) {
    console.warn('[PlayerBootstrap] Non-fatal:', err.message);
  }

  return { user: { id: user._id, email: user.email, playerName: user.playerName }, token };
};

// ── Login ──────────────────────────────────────────────
const login = async ({ email, password }) => {
  // Explicitly include passwordHash for comparison
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    const err = new Error('Invalid credentials');
    err.codeName = ERROR_CODES.UNAUTHORIZED;
    throw err;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    const err = new Error('Invalid credentials');
    err.codeName = ERROR_CODES.UNAUTHORIZED;
    throw err;
  }

  const token = generateToken(user._id);
  return {
    user: {
      id: user._id,
      email: user.email,
      playerName: user.playerName,
      onboardingCompleted: user.onboardingCompleted
    },
    token
  };
};

// ── Verify token ──────────────────────────────────────
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    const err = new Error('Invalid or expired token');
    err.codeName = ERROR_CODES.UNAUTHORIZED;
    throw err;
  }
};

module.exports = {
  register,
  login,
  verifyToken
};
