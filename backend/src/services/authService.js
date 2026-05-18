const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const DiscordIntegration = require('../models/DiscordIntegration');
const PlayerProfile = require('../models/PlayerProfile');
const ERROR_CODES = require('../constants/errorCodes');
const { AUTH_PROVIDER } = require('../constants/domainConstants');
const { bootstrapNewPlayer } = require('./orchestration/playerBootstrap');

// ======================================================
// AUTH SERVICE — Phase D1
// Owns: credential validation, token issuance, session truth
// Phase D1: Added Discord federated identity flow
//
// Trust Model:
//   generateToken() issues Aura JWT → authorizes gameplay session
//   loginOrCreateFromDiscord() bridges Discord identity → Aura identity
//   Discord tokens are NEVER included in Aura JWT
// ======================================================

const SALT_ROUNDS = 12;

// ── Token generation (enriched JWT) ──────────────────
// Phase D1: JWT now includes auraPlayerId + discordUserId for
// socket room auto-join and identity consistency across layers
const generateToken = (userId, extras = {}) => {
  const payload = {
    id: userId,
    ...(extras.auraPlayerId && { auraPlayerId: extras.auraPlayerId }),
    ...(extras.discordUserId && { discordUserId: extras.discordUserId }),
    ...(extras.sessionId && { sessionId: extras.sessionId })
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// ── Register (local auth — preserved for dev/testing) ─
const register = async ({ email, password, playerName }) => {
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

// ── Login (local auth — preserved for dev/testing) ────
const login = async ({ email, password }) => {
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

  // Resolve auraPlayerId for enriched JWT
  const profile = await PlayerProfile.findOne({ userId: user._id }).select('auraPlayerId').lean();

  const token = generateToken(user._id, {
    auraPlayerId: profile?.auraPlayerId || null
  });

  return {
    user: {
      id: user._id,
      email: user.email,
      playerName: user.playerName,
      auraPlayerId: profile?.auraPlayerId || null,
      onboardingCompleted: user.onboardingCompleted
    },
    token
  };
};

// ══════════════════════════════════════════════════════
// DISCORD FEDERATED AUTH — Phase D1
// ══════════════════════════════════════════════════════

// Resolves a Discord profile into an Aura session.
// If the Discord account is already linked → load existing user.
// If new → create User + PlayerProfile + TrustProfile + DiscordIntegration.
// Returns { user, token } — identical contract to login().
const loginOrCreateFromDiscord = async ({
  discordProfile,   // from discordOAuthService.fetchDiscordProfile()
  accessToken,
  refreshToken,
  expiresIn,
  scope
}) => {
  const { discordUserId, discordUsername, discordAvatar, discordGlobalName } = discordProfile;

  // ── 1. Check if Discord account is already linked ──
  let integration = await DiscordIntegration.findOne({ discordUserId }).select('+accessToken +refreshToken');

  if (integration) {
    // ── EXISTING USER: Update tokens + load identity ──
    integration.accessToken = accessToken;
    integration.refreshToken = refreshToken;
    integration.expiresAt = new Date(Date.now() + expiresIn * 1000);
    integration.discordUsername = discordUsername;
    integration.discordAvatar = discordAvatar;
    integration.discordGlobalName = discordGlobalName;
    integration.integrationStatus = 'ACTIVE';
    integration.refreshFailureCount = 0;
    integration.lastRefreshError = null;
    integration.lastLoginAt = new Date();
    integration.tokenScope = scope || 'identify';
    await integration.save();

    const user = await User.findById(integration.auraUserId);
    if (!user) {
      throw Object.assign(new Error('Linked Aura user not found — data inconsistency'), { statusCode: 500 });
    }

    // Update user session tracking
    user.lastLoginAt = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();

    const profile = await PlayerProfile.findOne({ userId: user._id }).select('auraPlayerId displayName avatar').lean();

    const token = generateToken(user._id, {
      auraPlayerId: profile?.auraPlayerId || integration.auraPlayerId || null,
      discordUserId
    });

    return {
      user: {
        id: user._id,
        email: user.email,
        playerName: user.playerName,
        auraPlayerId: profile?.auraPlayerId || null,
        discordUserId,
        discordUsername,
        discordAvatar,
        onboardingCompleted: user.onboardingCompleted
      },
      token,
      isNewUser: false
    };
  }

  // ── 2. NEW USER: Create full identity stack ─────────
  // Transaction-safe: if any step fails, cleanup previous steps
  const displayName = discordGlobalName || discordUsername;

  // Check if playerName is taken (use Discord username as base)
  let playerName = displayName;
  let nameTaken = await User.findOne({ normalizedPlayerName: playerName.toLowerCase().trim() });
  let suffix = 1;
  while (nameTaken && suffix < 100) {
    playerName = `${displayName}${suffix}`;
    nameTaken = await User.findOne({ normalizedPlayerName: playerName.toLowerCase().trim() });
    suffix++;
  }

  // Create User (no password — Discord auth)
  const user = await User.create({
    email: `${discordUserId}@discord.aura`,  // Placeholder — Discord users don't have email auth
    passwordHash: '$discord$no-password',     // Sentinel value — bcrypt will never match this
    playerName,
    authProvider: AUTH_PROVIDER.DISCORD,
    lastLoginAt: new Date(),
    loginCount: 1,
    oauthProviders: [{
      provider: AUTH_PROVIDER.DISCORD,
      providerId: discordUserId,
      linkedAt: new Date()
    }]
  });

  // Bootstrap player profile + trust profile
  let profile;
  try {
    const result = await bootstrapNewPlayer(user._id, {
      playerName,
      timezone: 'Asia/Kolkata'
    });
    profile = result.profile;
  } catch (err) {
    console.error('[DiscordAuth] Player bootstrap failed — rolling back user:', err.message);
    await User.findByIdAndDelete(user._id);
    throw Object.assign(new Error('Account creation failed — please try again'), { statusCode: 500 });
  }

  // Create DiscordIntegration
  try {
    integration = await DiscordIntegration.create({
      auraUserId: user._id,
      auraPlayerId: profile?.auraPlayerId || null,
      discordUserId,
      discordUsername,
      discordAvatar,
      discordGlobalName,
      accessToken,
      refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      tokenScope: scope || 'identify',
      integrationStatus: 'ACTIVE',
      linkedAt: new Date(),
      lastLoginAt: new Date()
    });
  } catch (err) {
    console.error('[DiscordAuth] Integration creation failed — rolling back:', err.message);
    await User.findByIdAndDelete(user._id);
    // PlayerProfile cleanup is handled by cascading logic
    throw Object.assign(new Error('Discord integration failed — please try again'), { statusCode: 500 });
  }

  const token = generateToken(user._id, {
    auraPlayerId: profile?.auraPlayerId || null,
    discordUserId
  });

  return {
    user: {
      id: user._id,
      email: user.email,
      playerName: user.playerName,
      auraPlayerId: profile?.auraPlayerId || null,
      discordUserId,
      discordUsername,
      discordAvatar,
      onboardingCompleted: false
    },
    token,
    isNewUser: true
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

// ── Get session info (for /auth/session endpoint) ────
const getSessionInfo = async (userId) => {
  const user = await User.findById(userId).lean();
  if (!user) return null;

  const profile = await PlayerProfile.findOne({ userId }).select('auraPlayerId displayName avatar level xp').lean();
  const integration = await DiscordIntegration.findOne({ auraUserId: userId }).lean();

  return {
    user: {
      id: user._id,
      email: user.email,
      playerName: user.playerName,
      auraPlayerId: profile?.auraPlayerId || null,
      discordUserId: integration?.discordUserId || null,
      discordUsername: integration?.discordUsername || null,
      discordAvatar: integration?.discordAvatar || null,
      onboardingCompleted: user.onboardingCompleted,
      authProvider: user.authProvider
    },
    profile: profile ? {
      displayName: profile.displayName,
      avatar: profile.avatar,
      level: profile.level,
      xp: profile.xp
    } : null,
    discord: integration ? {
      status: integration.integrationStatus,
      linkedAt: integration.linkedAt,
      lastLoginAt: integration.lastLoginAt
    } : null
  };
};

module.exports = {
  register,
  login,
  loginOrCreateFromDiscord,
  verifyToken,
  generateToken,
  getSessionInfo
};
