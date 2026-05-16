const crypto = require('crypto');

// ======================================================
// IDENTITY GENERATOR — Phase 2.4.1
// THE SOLE AUTHORITY for public identity generation
// All public IDs MUST be generated through this file
// Mongo _id is INTERNAL persistence identity ONLY
// These are PERMANENT multiplayer identity layer
// Must NOT: be modified after creation
// ======================================================

const PREFIXES = {
  PLAYER: 'AURA-PLR',
  HUB: 'AURA-HUB',
  CHALLENGE: 'AURA-CHL',
  FRIENDSHIP: 'AURA-FRD'
};

// ── Generate a public identity ───────────────────────
// Format: PREFIX-XXXXXXXX (8 hex chars = 4 billion unique)
const generate = (type) => {
  const prefix = PREFIXES[type];
  if (!prefix) throw new Error(`Unknown identity type: ${type}`);
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${suffix}`;
};

// ── Type-specific generators ─────────────────────────
const generatePlayerId = () => generate('PLAYER');
const generateHubId = () => generate('HUB');
const generateChallengeId = () => generate('CHALLENGE');
const generateFriendshipId = () => generate('FRIENDSHIP');

// ── Generate invite code ─────────────────────────────
// URL-safe, 8 chars, base64url encoded
const generateInviteCode = () => crypto.randomBytes(6).toString('base64url');

// ── Validate format ──────────────────────────────────
const PATTERNS = {
  PLAYER: /^AURA-PLR-[0-9A-F]{8}$/,
  HUB: /^AURA-HUB-[0-9A-F]{8}$/,
  CHALLENGE: /^AURA-CHL-[0-9A-F]{8}$/,
  FRIENDSHIP: /^AURA-FRD-[0-9A-F]{8}$/
};

const isValid = (id, type) => {
  const pattern = PATTERNS[type];
  return pattern ? pattern.test(id) : false;
};

const detectType = (id) => {
  if (typeof id !== 'string') return null;
  for (const [type, pattern] of Object.entries(PATTERNS)) {
    if (pattern.test(id)) return type;
  }
  return null;
};

module.exports = {
  generate,
  generatePlayerId,
  generateHubId,
  generateChallengeId,
  generateFriendshipId,
  generateInviteCode,
  isValid,
  detectType,
  PREFIXES,
  PATTERNS
};
