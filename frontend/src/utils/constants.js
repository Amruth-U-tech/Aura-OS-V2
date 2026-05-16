// ======================================================
// CONSTANTS
// Centralized configuration and fixed values
// ======================================================

export const APP_NAME = 'Aura OS V2';

export const ROUTES = {
  DASHBOARD: '/',
  FOCUS: '/focus',
  DISCIPLINE: '/discipline',
  PROFILE: '/profile',
  LOGIN: '/login',
  AUTH: '/auth',
  ONBOARDING: '/onboarding',
  // Phase 2.2
  CHALLENGES: '/challenges',
  HUBS: '/hubs',
  HUB_DETAIL: '/hubs/:id',
  REWARDS: '/rewards',
  LEADERBOARD: '/leaderboard',
  // Phase 2.4
  FRIENDS: '/friends',
  // Phase 2.4.2
  PLAYER_PROFILE: '/player/:auraPlayerId',
  VOUCHERS: '/vouchers'
};

export const API_ENDPOINTS = {
  HEALTH: '/health',
  TASKS: '/tasks',
  PROGRESSION: '/progression',
  // Phase 2.2
  INTEGRATIONS: '/integrations',
  INTEGRATIONS_HEALTH: '/integrations/health',
  DISCORD_HEALTH: '/integrations/discord/health',
  GEMMA_HEALTH: '/integrations/gemma/health',
  UPLOAD_HEALTH: '/integrations/uploads/health',
  TRUST_HEALTH: '/integrations/trust/health',
  REWARDS_HEALTH: '/integrations/rewards/health',
  REWARDS_VOUCHERS: '/integrations/rewards/vouchers',
  HUB_VALIDATE: '/integrations/hubs/validate',
  // Phase 2.4 — Domain APIs
  PLAYER_ME: '/player/me',
  PLAYER_LEADERBOARD: '/player/leaderboard',
  PLAYER_TRANSACTIONS: '/player/transactions',
  PLAYER_SUMMARY: '/player/summary',
  SOCIAL_FRIENDS: '/social/friends',
  SOCIAL_REQUESTS: '/social/friends/requests',
  HUBS_API: '/hubs',
  HUBS_MY: '/hubs/my',
  CHALLENGES_API: '/challenges',
  CHALLENGES_MY: '/challenges/my',
  // Phase 2.4.1 — Global Discovery APIs
  DISCOVER_PLAYERS: '/discover/players',
  DISCOVER_PLAYERS_SEARCH: '/discover/players/search',
  DISCOVER_HUBS: '/discover/hubs',
  DISCOVER_HUBS_SEARCH: '/discover/hubs/search',
  // Phase 2.4.2 — Profile & Skill APIs
  PLAYER_PROFILE_BY_ID: '/player/profile',
  PLAYER_SKILLS: '/player/skills',
  PLAYER_LEVEL_PROGRESS: '/player/level-progress',
  PLAYER_PROFILE_UPDATE: '/player/profile',
  // Phase 2.4.2 — Voucher APIs
  VOUCHERS_CURRENT: '/vouchers/current',
  VOUCHERS_HISTORY: '/vouchers/history',
  // Phase 2.4.2 — Hub Approval APIs
  HUB_PENDING: '/hubs'
};
