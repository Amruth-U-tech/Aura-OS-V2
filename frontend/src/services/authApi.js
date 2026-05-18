import apiService from '@services/apiService';

// ======================================================
// AUTH API — Phase D1.DEBUG
// Owns all auth-related backend communication
// Phase D1.DEBUG: SPA-friendly Discord OAuth exchange
// No component may call auth endpoints directly
// ======================================================

const authApi = {
  // ── Legacy local auth (preserved for dev/testing) ────
  register: (data) => apiService.post('/auth/register', data),
  login: (data) => apiService.post('/auth/login', data),

  // ── Phase D1: Discord federated auth ─────────────────
  // Get Discord OAuth authorization URL from backend
  getDiscordLoginUrl: () => apiService.get('/auth/discord'),

  // Phase D1.DEBUG: Exchange authorization code for Aura JWT
  // Frontend sends {code, state} → backend validates, exchanges, returns {token, user}
  exchangeDiscordCode: (code, state) =>
    apiService.post('/auth/discord/exchange', { code, state }),

  // Get current session info (validates JWT + loads enriched data)
  getSession: () => apiService.get('/auth/session'),

  // Server-side logout (revokes Discord token if linked)
  logout: () => apiService.post('/auth/logout'),

  // Discord integration health check
  getRefreshStatus: () => apiService.get('/auth/refresh-status'),
};

export default authApi;
